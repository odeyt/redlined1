/**
 * lib/admin/accountsData.ts
 * SERVER ONLY. Read-only data access for the owner-admin account directory
 * and owner overview. Never import this from a 'use client' component — the
 * `server-only` import below makes that a build error, not a runtime leak.
 *
 * The directory is SHOP-driven, not profile-driven. A signup, in the sense
 * the owner cares about ("who signed up", "what plan are they on"), is a
 * shop/tenant — not an individual login. profiles.plan/trial_ends_at/
 * billing_status are stored per-profile (a schema quirk this module does
 * not change), so each shop's "primary contact" is resolved as its
 * shop_users role='owner' member, and that profile's plan/trial/billing
 * fields are what the shop's row displays. A shop with three staff members
 * is one row here, not three — counting every profile as a "signup" would
 * have overstated signups by roughly the average headcount per shop.
 *
 * Canonical identifier for an account row: shops.id. Every downstream join
 * (subscriptions, billing_events, support_tickets, usage) is keyed off this
 * same shop_id, read server-side from the resolved shop row — never from
 * client-supplied input — so a query can not be pointed at another tenant's
 * data by manipulating a parameter.
 *
 * Data model, verified against live code (see admin portal Phase A/B report):
 *  - profiles: one row per auth user. Carries `plan` and `trial_ends_at`,
 *    which is what lib/planGate.ts reads to decide product access — the
 *    canonical live entitlement state. `billing_status` is a secondary copy
 *    kept in sync by the Creem webhook; nothing enforces on it today.
 *  - shops: id, name, slug, created_at, organization_id, archived_at. No
 *    country/timezone/currency columns exist despite being accepted as
 *    provisioning input — they are silently dropped (see
 *    commercial/onboarding/ShopProvisioningService.ts).
 *  - shop_users: shop_id/user_id/role membership rows. role='owner' marks
 *    the shop's primary contact; a shop can have several members, and a
 *    person can be the primary contact of more than one shop.
 *  - shop_subscriptions: Creem-synced billing record, keyed by shop_id.
 *    Enrichment only — see lib/admin/accountStatus.ts for why this is never
 *    treated as the entitlement source of truth.
 *  - billing_events: raw webhook log. Payloads are never surfaced here.
 */
import 'server-only';
import { getAdminDb } from '@/lib/supabaseServer';
import { getInternalShopIds } from '@/lib/adminAuth';
import { PLANS } from '@/config/plans';
import { getMonthlyUsage } from '@/commercial/usage/usageService';
import {
  deriveAccountStatus,
  type AccountStatus,
  type AccountStatusResult,
} from '@/lib/admin/accountStatus';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * No DB column captures the derived AccountStatus (it is computed from two
 * tables), so filtering by status cannot be pushed down to a single SQL
 * predicate without a view or RPC this task is not allowed to create. This
 * caps how many of the most-recently-created shops are scanned, classified
 * and then filtered/paginated in memory on the SERVER (never sent to the
 * client unfiltered). Comfortably above D1's current shop count; if the
 * platform grows past this, replace the scan with a Postgres view exposing
 * the derived status so it can be filtered in SQL.
 *
 * EXACT LIMIT, surfaced to the owner rather than hidden: when a scan hits
 * this cap, `truncated: true` is returned, and the UI states plainly that
 * only the MAX_SCAN_ROWS most-recently-created shops (matching the search,
 * if one was given) were considered — older shops matching a filter may be
 * missing from the result, not just from the displayed page.
 */
const MAX_SCAN_ROWS = 2000;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;

export { MAX_SCAN_ROWS };

export const ACCOUNT_SORT_KEYS = ['created_at', 'name', 'email', 'trial_ends_at'] as const;
export type AccountSortKey = typeof ACCOUNT_SORT_KEYS[number];

export const ACCOUNT_STATUS_FILTERS = [
  'all',
  'free',
  'trialing',
  'trial_ending_soon',
  'active_paid',
  'past_due',
  'cancelled_access_retained',
  'paid_billing_unverified',
  'billing_mismatch',
] as const;
export type AccountStatusFilter = typeof ACCOUNT_STATUS_FILTERS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountListItem {
  /** shops.id — the one canonical identifier for this row. */
  id: string;
  shopName: string;
  shopArchived: boolean;
  createdAt: string; // shops.created_at — when this shop/tenant was provisioned
  /** The shop_users role='owner' member. Null fields mean no owner-role member could be resolved — see ownerResolved. */
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactRole: string | null;
  /** False when no shop_users role='owner' row exists and a fallback (earliest-linked profile) was used instead, or no profile at all was found. */
  ownerResolved: boolean;
  memberCount: number;
  plan: string | null;
  planDisplayName: string | null;
  status: AccountStatus;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  billingMismatch: boolean;
  policyNote: string | null;
  lastSignInAt: string | null | undefined; // undefined = not fetched, null = never signed in
}

export interface AccountListResult {
  items: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** True if the underlying scan hit MAX_SCAN_ROWS — total/items may not reflect every matching shop. */
  truncated: boolean;
  maxScanRows: number;
}

export interface AccountListParams {
  // Accepts raw query-string values too (every field is sanitized/clamped
  // before use — see the sanitize*/clamp* helpers below).
  page?: number | string;
  pageSize?: number | string;
  search?: string;
  status?: string;
  sortKey?: string;
  sortDir?: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  created_at: string;
  shop_id: string | null;
  plan: string | null;
  billing_status: string | null;
  trial_ends_at: string | null;
}

interface ShopRow {
  id: string;
  name: string | null;
  created_at: string;
  archived_at: string | null;
}

interface MembershipRow {
  shop_id: string;
  user_id: string;
  role: string;
}

interface SubscriptionRow {
  shop_id: string;
  status: string;
  plan_key: string;
  billing_provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  cancelled_at: string | null;
  past_due_at: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Exported for direct unit testing of input bounds/allowlists, without
// needing to mock the Supabase client end to end.
export function clampPage(page: unknown): number {
  const n = typeof page === 'number' ? page : parseInt(String(page ?? '1'), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function clampPageSize(pageSize: unknown): number {
  const n = typeof pageSize === 'number' ? pageSize : parseInt(String(pageSize ?? DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

export function sanitizeSearch(search: unknown): string {
  if (typeof search !== 'string') return '';
  return search.trim().slice(0, MAX_SEARCH_LENGTH);
}

export function sanitizeSortKey(sortKey: unknown): AccountSortKey {
  return ACCOUNT_SORT_KEYS.includes(sortKey as AccountSortKey) ? (sortKey as AccountSortKey) : 'created_at';
}

export function sanitizeSortDir(sortDir: unknown): 'asc' | 'desc' {
  return sortDir === 'asc' ? 'asc' : 'desc';
}

export function sanitizeStatusFilter(status: unknown): AccountStatusFilter {
  return ACCOUNT_STATUS_FILTERS.includes(status as AccountStatusFilter) ? (status as AccountStatusFilter) : 'all';
}

export function planDisplayName(planKey: string | null): string | null {
  if (!planKey) return null;
  const known = (PLANS as Record<string, { name: string } | undefined>)[planKey];
  return known?.name ?? planKey;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, c => `\\${c}`);
}

// ─── Core scan (shared by listAccounts and getOwnerOverview) ─────────────────

interface ClassifiedShop {
  shop: ShopRow;
  primaryProfile: ProfileRow | null;
  ownerResolved: boolean;
  memberCount: number;
  subscription: SubscriptionRow | null;
  isInternal: boolean;
  classification: AccountStatusResult;
}

interface ScanResult {
  shops: ClassifiedShop[];
  truncated: boolean;
}

/**
 * Resolves candidate shop ids for a scan: either the MAX_SCAN_ROWS most
 * recently created shops, or — when a search term is given — the union of
 * shops whose name matches and shops whose owner-role member's name/email
 * matches, each sub-query itself bounded by MAX_SCAN_ROWS.
 */
async function resolveCandidateShopIds(
  db: ReturnType<typeof getAdminDb>,
  search: string,
): Promise<{ ids: string[] | null; truncated: boolean }> {
  if (!search) {
    // null ids = "no filter, just take the most recent MAX_SCAN_ROWS shops" (checked by the caller).
    return { ids: null, truncated: false };
  }

  const pattern = `%${escapeIlike(search)}%`;

  const [byShopName, byProfileMatch] = await Promise.all([
    db.from('shops').select('id').ilike('name', pattern).limit(MAX_SCAN_ROWS),
    db.from('profiles').select('shop_id').or(`name.ilike.${pattern},email.ilike.${pattern}`).limit(MAX_SCAN_ROWS),
  ]);

  const truncated =
    (byShopName.data?.length ?? 0) >= MAX_SCAN_ROWS ||
    (byProfileMatch.data?.length ?? 0) >= MAX_SCAN_ROWS;

  const ids = new Set<string>();
  for (const row of byShopName.data ?? []) ids.add(row.id);
  for (const row of byProfileMatch.data ?? []) if (row.shop_id) ids.add(row.shop_id);

  return { ids: [...ids].slice(0, MAX_SCAN_ROWS), truncated };
}

async function scanClassifiedShops(search: string): Promise<ScanResult> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  const { ids: candidateIds, truncated: searchTruncated } = await resolveCandidateShopIds(db, search);

  let shopQuery = db
    .from('shops')
    .select('id, name, created_at, archived_at')
    .order('created_at', { ascending: false })
    .limit(MAX_SCAN_ROWS);

  if (candidateIds !== null) {
    if (candidateIds.length === 0) return { shops: [], truncated: searchTruncated };
    shopQuery = shopQuery.in('id', candidateIds);
  }

  const { data: shopRows, error: shopErr } = await shopQuery;
  if (shopErr || !shopRows) return { shops: [], truncated: false };

  const truncated = searchTruncated || (candidateIds === null && shopRows.length >= MAX_SCAN_ROWS);
  const shopIds = shopRows.map(s => s.id);

  if (shopIds.length === 0) return { shops: [], truncated };

  const [{ data: memberRows }, { data: subRows }] = await Promise.all([
    db.from('shop_users').select('shop_id, user_id, role').in('shop_id', shopIds),
    db
      .from('shop_subscriptions')
      .select('shop_id, status, plan_key, billing_provider, provider_customer_id, provider_subscription_id, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, past_due_at, created_at')
      .in('shop_id', shopIds),
  ]);

  const members = (memberRows ?? []) as MembershipRow[];
  const memberCountByShop = new Map<string, number>();
  for (const m of members) memberCountByShop.set(m.shop_id, (memberCountByShop.get(m.shop_id) ?? 0) + 1);

  // Prefer the shop_users role='owner' member as the primary contact.
  const ownerUserIdByShop = new Map<string, string>();
  for (const m of members) {
    if (m.role === 'owner' && !ownerUserIdByShop.has(m.shop_id)) ownerUserIdByShop.set(m.shop_id, m.user_id);
  }

  const ownerUserIds = [...new Set(ownerUserIdByShop.values())];
  const { data: ownerProfileRows } = ownerUserIds.length
    ? await db.from('profiles').select('id, name, email, role, status, created_at, shop_id, plan, billing_status, trial_ends_at').in('id', ownerUserIds)
    : { data: [] as ProfileRow[] };
  const profileById = new Map((ownerProfileRows ?? []).map(p => [p.id, p as ProfileRow]));

  // Shops with no shop_users role='owner' row: fall back to the earliest
  // profile whose profiles.shop_id points at this shop (best effort — a
  // legacy single-shop pointer, not a membership grant). Flagged via
  // ownerResolved:false rather than presented as equivalent to a real
  // owner-role membership.
  const shopsNeedingFallback = shopIds.filter(id => !ownerUserIdByShop.has(id));
  const fallbackProfileByShop = new Map<string, ProfileRow>();
  if (shopsNeedingFallback.length) {
    const { data: fallbackRows } = await db
      .from('profiles')
      .select('id, name, email, role, status, created_at, shop_id, plan, billing_status, trial_ends_at')
      .in('shop_id', shopsNeedingFallback)
      .order('created_at', { ascending: true });
    for (const row of (fallbackRows ?? []) as ProfileRow[]) {
      if (row.shop_id && !fallbackProfileByShop.has(row.shop_id)) fallbackProfileByShop.set(row.shop_id, row);
    }
  }

  const subsByShop = new Map<string, SubscriptionRow>();
  for (const row of [...((subRows ?? []) as SubscriptionRow[])].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!subsByShop.has(row.shop_id)) subsByShop.set(row.shop_id, row);
  }

  const shops: ClassifiedShop[] = shopRows.map((shop) => {
    const ownerUserId = ownerUserIdByShop.get(shop.id);
    const ownerResolved = !!ownerUserId;
    const primaryProfile = (ownerUserId ? profileById.get(ownerUserId) : undefined)
      ?? fallbackProfileByShop.get(shop.id)
      ?? null;

    const isInternal = internal.has(shop.id);
    const subscription = subsByShop.get(shop.id) ?? null;

    const classification = deriveAccountStatus({
      plan: primaryProfile?.plan ?? null,
      trialEndsAt: primaryProfile?.trial_ends_at ?? null,
      billingStatus: primaryProfile?.billing_status ?? null,
      isInternal,
      subscription: subscription
        ? { status: subscription.status, billingProvider: subscription.billing_provider }
        : null,
    });

    return {
      shop: shop as ShopRow,
      primaryProfile,
      ownerResolved,
      memberCount: memberCountByShop.get(shop.id) ?? 0,
      subscription,
      isInternal,
      classification,
    };
  });

  return { shops, truncated };
}

function matchesStatusFilter(row: ClassifiedShop, filter: AccountStatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'billing_mismatch') return row.classification.billingMismatch;
  if (filter === 'trial_ending_soon') {
    return row.classification.status === 'trialing'
      && row.classification.trialDaysLeft !== null
      && row.classification.trialDaysLeft <= 7;
  }
  return row.classification.status === filter;
}

function toListItem(row: ClassifiedShop, lastSignInAt: string | null | undefined): AccountListItem {
  return {
    id: row.shop.id,
    shopName: row.shop.name ?? '(unnamed shop)',
    shopArchived: !!row.shop.archived_at,
    createdAt: row.shop.created_at,
    primaryContactName: row.primaryProfile?.name ?? null,
    primaryContactEmail: row.primaryProfile?.email ?? null,
    primaryContactRole: row.primaryProfile?.role ?? null,
    ownerResolved: row.ownerResolved,
    memberCount: row.memberCount,
    plan: row.primaryProfile?.plan ?? null,
    planDisplayName: planDisplayName(row.primaryProfile?.plan ?? null),
    status: row.classification.status,
    trialEndsAt: row.primaryProfile?.trial_ends_at ?? null,
    trialDaysLeft: row.classification.trialDaysLeft,
    billingMismatch: row.classification.billingMismatch,
    policyNote: row.classification.policyNote,
    lastSignInAt,
  };
}

// ─── Public API: account list ─────────────────────────────────────────────────

export async function listAccounts(params: AccountListParams): Promise<AccountListResult> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = sanitizeSearch(params.search);
  const status = sanitizeStatusFilter(params.status);
  const sortKey = sanitizeSortKey(params.sortKey);
  const sortDir = sanitizeSortDir(params.sortDir);

  const { shops, truncated } = await scanClassifiedShops(search);
  const filtered = shops.filter(a => matchesStatusFilter(a, status));

  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'created_at') cmp = a.shop.created_at.localeCompare(b.shop.created_at);
    else if (sortKey === 'name') cmp = (a.shop.name ?? '').localeCompare(b.shop.name ?? '');
    else if (sortKey === 'email') cmp = (a.primaryProfile?.email ?? '').localeCompare(b.primaryProfile?.email ?? '');
    else if (sortKey === 'trial_ends_at') cmp = (a.primaryProfile?.trial_ends_at ?? '').localeCompare(b.primaryProfile?.trial_ends_at ?? '');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageSlice = filtered.slice(start, start + pageSize);

  // Last-sign-in is only fetched for the primary contact of the rows
  // actually being rendered — bounded by pageSize, never by the full scan,
  // and never a whole-project scan of every auth user.
  const db = getAdminDb();
  const lastSignIns = await Promise.allSettled(
    pageSlice.map(row => row.primaryProfile ? db.auth.admin.getUserById(row.primaryProfile.id) : Promise.resolve(null))
  );

  const items: AccountListItem[] = pageSlice.map((row, i) => {
    const result = lastSignIns[i];
    const lastSignInAt = !row.primaryProfile
      ? null
      : result.status === 'fulfilled' && result.value
        ? result.value.data?.user?.last_sign_in_at ?? null
        : undefined;
    return toListItem(row, lastSignInAt);
  });

  return { items, total, page, pageSize, truncated, maxScanRows: MAX_SCAN_ROWS };
}

// ─── Public API: owner overview ───────────────────────────────────────────────

export interface OwnerOverview {
  totalSignups: number;
  signupsToday: number;
  signupsLast7Days: number;
  signupsLast30Days: number;
  free: number;
  trialing: number;
  trialEndingIn3Days: number;
  trialEndingIn7Days: number;
  activePaid: number;
  pastDue: number;
  cancelledAccessRetained: number;
  paidBillingUnverified: number;
  billingMismatches: number;
  internal: number;
  /** profiles with no shop_id — not counted as shop signups above; a separate, real gap. */
  unlinkedProfiles: number;
  truncated: boolean;
  maxScanRows: number;
  recentSignups: AccountListItem[];
}

export async function getOwnerOverview(): Promise<OwnerOverview> {
  const db = getAdminDb();
  const { shops, truncated } = await scanClassifiedShops('');
  const external = shops.filter(a => !a.isInternal);

  const now = Date.now();
  const dayMs = 86400000;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

  const signupsToday = external.filter(a => new Date(a.shop.created_at).getTime() >= startOfToday.getTime()).length;
  const signupsLast7Days = external.filter(a => now - new Date(a.shop.created_at).getTime() <= 7 * dayMs).length;
  const signupsLast30Days = external.filter(a => now - new Date(a.shop.created_at).getTime() <= 30 * dayMs).length;

  const counts: Record<AccountStatus, number> = {
    free: 0, trialing: 0, active_paid: 0, past_due: 0,
    cancelled_access_retained: 0, paid_billing_unverified: 0, internal: 0,
  };
  let trialEndingIn3Days = 0;
  let trialEndingIn7Days = 0;
  let billingMismatches = 0;

  for (const a of shops) {
    counts[a.classification.status]++;
    if (a.classification.billingMismatch) billingMismatches++;
    if (a.classification.status === 'trialing' && a.classification.trialDaysLeft !== null) {
      if (a.classification.trialDaysLeft <= 3) trialEndingIn3Days++;
      if (a.classification.trialDaysLeft <= 7) trialEndingIn7Days++;
    }
  }

  const recentShops = [...external]
    .sort((a, b) => b.shop.created_at.localeCompare(a.shop.created_at))
    .slice(0, 10);
  const recentSignups: AccountListItem[] = recentShops.map(row => toListItem(row, undefined));

  const { count: unlinkedProfiles } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .is('shop_id', null);

  return {
    totalSignups: external.length,
    signupsToday,
    signupsLast7Days,
    signupsLast30Days,
    free: counts.free,
    trialing: counts.trialing,
    trialEndingIn3Days,
    trialEndingIn7Days,
    activePaid: counts.active_paid,
    pastDue: counts.past_due,
    cancelledAccessRetained: counts.cancelled_access_retained,
    paidBillingUnverified: counts.paid_billing_unverified,
    billingMismatches,
    internal: counts.internal,
    unlinkedProfiles: unlinkedProfiles ?? 0,
    truncated,
    maxScanRows: MAX_SCAN_ROWS,
    recentSignups,
  };
}

// ─── Public API: account detail ───────────────────────────────────────────────

export interface ShopMember {
  profileId: string;
  name: string | null;
  email: string | null;
  role: string;
  isPrimaryContact: boolean;
}

export interface OtherShopMembership {
  shopId: string;
  shopName: string | null;
  role: string;
}

export interface MaskedProviderRef {
  raw: string;
  masked: string;
}

function maskRef(value: string | null): MaskedProviderRef | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return { raw: value, masked: `${'•'.repeat(Math.max(0, value.length - 4))}${tail}` };
}

export interface BillingEventSummary {
  id: string;
  eventType: string;
  processed: boolean;
  processedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface SupportTicketSummary {
  id: string;
  kind: string;
  subject: string | null;
  status: string;
  severity: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDetail {
  shop: { id: string; name: string | null; createdAt: string; archivedAt: string | null };
  primaryContact: {
    profileId: string;
    name: string;
    email: string | null;
    role: string | null;
    status: string | null;
    createdAt: string;
    billingStatus: string | null;
    lastSignInAt: string | null;
  } | null;
  ownerResolved: boolean;
  members: ShopMember[];
  primaryContactOtherShops: OtherShopMembership[];
  mirroredShopIds: string[];
  plan: {
    key: string | null;
    displayName: string | null;
    trialEndsAt: string | null;
  };
  status: AccountStatusResult;
  subscription: {
    status: string;
    planKey: string;
    billingProvider: string | null;
    providerCustomerId: MaskedProviderRef | null;
    providerSubscriptionId: MaskedProviderRef | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cancelledAt: string | null;
    pastDueAt: string | null;
  } | null;
  billingEvents: BillingEventSummary[];
  usage: Record<string, number> | null;
  supportTickets: SupportTicketSummary[];
  dataQualityWarnings: string[];
}

export async function getAccountDetail(shopId: string): Promise<AccountDetail | null> {
  const db = getAdminDb();
  const internal = getInternalShopIds();

  const { data: shop, error: shopErr } = await db
    .from('shops')
    .select('id, name, created_at, archived_at')
    .eq('id', shopId)
    .maybeSingle();

  if (shopErr || !shop) return null;

  const warnings: string[] = [];
  const isInternal = internal.has(shop.id);

  const [membershipResult, mirrorResult] = await Promise.all([
    db.from('shop_users').select('shop_id, user_id, role').eq('shop_id', shop.id),
    db.from('shop_mirrors').select('mirror_shop_id').eq('shop_id', shop.id),
  ]);

  const memberships = (membershipResult.data ?? []) as MembershipRow[];
  const mirroredShopIds = ((mirrorResult.data ?? []) as { mirror_shop_id: string }[]).map(r => r.mirror_shop_id);

  const memberUserIds = [...new Set(memberships.map(m => m.user_id))];
  const { data: memberProfileRows } = memberUserIds.length
    ? await db.from('profiles').select('id, name, email, role, status, created_at, shop_id, plan, billing_status, trial_ends_at').in('id', memberUserIds)
    : { data: [] as ProfileRow[] };
  const profileById = new Map((memberProfileRows ?? []).map(p => [p.id, p as ProfileRow]));

  const ownerMembership = memberships.find(m => m.role === 'owner');
  let ownerResolved = !!ownerMembership;
  let primaryProfile: ProfileRow | null = ownerMembership ? profileById.get(ownerMembership.user_id) ?? null : null;

  if (!primaryProfile) {
    // No owner-role membership (or the owner's profile row is missing) —
    // fall back to the earliest profile whose profiles.shop_id points here.
    ownerResolved = false;
    const { data: fallbackRows } = await db
      .from('profiles')
      .select('id, name, email, role, status, created_at, shop_id, plan, billing_status, trial_ends_at')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: true })
      .limit(1);
    primaryProfile = (fallbackRows && fallbackRows[0]) ?? null;
    warnings.push(
      ownerMembership
        ? 'The shop_users role=owner member has no matching profiles row.'
        : 'No shop_users role=owner membership exists for this shop.'
    );
  }

  const members: ShopMember[] = memberships.map(m => {
    const p = profileById.get(m.user_id);
    return {
      profileId: m.user_id,
      name: p?.name ?? null,
      email: p?.email ?? null,
      role: m.role,
      isPrimaryContact: primaryProfile?.id === m.user_id,
    };
  });

  let primaryContactOtherShops: OtherShopMembership[] = [];
  let lastSignInAt: string | null = null;
  if (primaryProfile) {
    const [{ data: otherMemberships }, userResult] = await Promise.all([
      db.from('shop_users').select('shop_id, role').eq('user_id', primaryProfile.id).neq('shop_id', shop.id),
      db.auth.admin.getUserById(primaryProfile.id),
    ]);
    lastSignInAt = userResult.data?.user?.last_sign_in_at ?? null;

    if (otherMemberships && otherMemberships.length) {
      const otherIds = [...new Set(otherMemberships.map(m => m.shop_id))];
      const { data: otherShops } = await db.from('shops').select('id, name').in('id', otherIds);
      const nameById = new Map((otherShops ?? []).map(s => [s.id, s.name]));
      primaryContactOtherShops = otherMemberships.map(m => ({
        shopId: m.shop_id,
        shopName: nameById.get(m.shop_id) ?? null,
        role: m.role,
      }));
    }
  }

  let subscription: SubscriptionRow | null = null;
  {
    const { data: subs } = await db
      .from('shop_subscriptions')
      .select('shop_id, status, plan_key, billing_provider, provider_customer_id, provider_subscription_id, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, past_due_at, created_at')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(1);
    subscription = (subs && subs[0]) ?? null;
  }

  let billingEvents: BillingEventSummary[] = [];
  {
    const { data: events } = await db
      .from('billing_events')
      .select('id, event_type, processed, processed_at, error, created_at')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(25);
    billingEvents = (events ?? []).map(e => ({
      id: e.id, eventType: e.event_type, processed: e.processed,
      processedAt: e.processed_at, error: e.error, createdAt: e.created_at,
    }));
  }

  let usage: Record<string, number> | null = null;
  try {
    const monthly = await getMonthlyUsage(shop.id);
    usage = monthly.usage;
  } catch {
    warnings.push('Usage data could not be loaded.');
  }

  let supportTickets: SupportTicketSummary[] = [];
  try {
    const { data: tickets, error } = await db
      .from('support_tickets')
      .select('id, kind, subject, status, severity, created_at, updated_at')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    supportTickets = (tickets ?? []).map(t => ({
      id: t.id, kind: t.kind, subject: t.subject, status: t.status,
      severity: t.severity, createdAt: t.created_at, updatedAt: t.updated_at,
    }));
  } catch {
    warnings.push('Support ticket history is unavailable.');
  }

  const classification = deriveAccountStatus({
    plan: primaryProfile?.plan ?? null,
    trialEndsAt: primaryProfile?.trial_ends_at ?? null,
    billingStatus: primaryProfile?.billing_status ?? null,
    isInternal,
    subscription: subscription
      ? { status: subscription.status, billingProvider: subscription.billing_provider }
      : null,
  });
  if (classification.billingMismatch && classification.mismatchReason) {
    warnings.push(classification.mismatchReason);
  }

  return {
    shop: { id: shop.id, name: shop.name, createdAt: shop.created_at, archivedAt: shop.archived_at },
    primaryContact: primaryProfile ? {
      profileId: primaryProfile.id,
      name: primaryProfile.name ?? '(no name)',
      email: primaryProfile.email,
      role: primaryProfile.role,
      status: primaryProfile.status,
      createdAt: primaryProfile.created_at,
      billingStatus: primaryProfile.billing_status,
      lastSignInAt,
    } : null,
    ownerResolved,
    members,
    primaryContactOtherShops,
    mirroredShopIds,
    plan: {
      key: primaryProfile?.plan ?? null,
      displayName: planDisplayName(primaryProfile?.plan ?? null),
      trialEndsAt: primaryProfile?.trial_ends_at ?? null,
    },
    status: classification,
    subscription: subscription ? {
      status: subscription.status,
      planKey: subscription.plan_key,
      billingProvider: subscription.billing_provider,
      providerCustomerId: maskRef(subscription.provider_customer_id),
      providerSubscriptionId: maskRef(subscription.provider_subscription_id),
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      cancelledAt: subscription.cancelled_at,
      pastDueAt: subscription.past_due_at,
    } : null,
    billingEvents,
    usage,
    supportTickets,
    dataQualityWarnings: warnings,
  };
}
