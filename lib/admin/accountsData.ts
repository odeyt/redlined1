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
import type { ReconciliationReason } from '@/lib/admin/terminology';
import { summarizeCommercial, type CommercialShop, type CommercialSummary } from '@/lib/admin/commercialSummary';
import { computeActivation, type ActivationSummary } from '@/lib/admin/activationData';
import { accountFingerprint } from '@/lib/admin/fingerprint';

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
  'cancel_scheduled',
  'past_due',
  'cancelled_access_retained',
  'expired',
  'paid_unverified',
  'billing_mismatch',
] as const;
export type AccountStatusFilter = typeof ACCOUNT_STATUS_FILTERS[number];

/**
 * Directory scope. Exactly the three groups the Owner Overview counts:
 *   active   = non-archived, non-internal shops   (Overview "Active external shops")
 *   archived = archived, non-internal shops       (Overview "Archived external shops")
 *   internal = shops in INTERNAL_SHOP_IDS, archived or not (Overview "Internal shops")
 * so a figure on the Overview and the directory it links to always agree. Archived
 * shops stay in the directory (under "all" and "archived"); nothing is deleted.
 */
export const ACCOUNT_ARCHIVE_FILTERS = ['all', 'active', 'archived', 'internal'] as const;
export type AccountArchiveFilter = typeof ACCOUNT_ARCHIVE_FILTERS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountListItem {
  /** shops.id — the one canonical identifier for this row. */
  id: string;
  shopName: string;
  shopArchived: boolean;
  createdAt: string; // shops.created_at — when this shop/tenant was provisioned
  /** The shop_users role='owner' member. Null fields mean no owner-role member could be resolved — see ownerResolved. */
  primaryContactEmail: string | null;
  primaryContactRole: string | null;
  /** False when no shop_users role='owner' row exists and a fallback (a linked profile, chosen by id order) was used instead, or no profile at all was found. */
  ownerResolved: boolean;
  memberCount: number;
  plan: string | null;
  planDisplayName: string | null;
  status: AccountStatus;
  /** Stored plan says 'trial' but the end date has passed: Free today, shown as "Trial expired". Read-only history. */
  trialExpired: boolean;
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
  archived?: string;
  sortKey?: string;
  sortDir?: string;
}

/**
 * The only profiles columns this module may select. Production `profiles` has
 * no `name`, `status` or `created_at` (docs/m0-architecture-audit.md §4, live
 * schema): selecting any unknown column makes PostgREST reject the whole query,
 * which once silently turned every account into "free" with no contact.
 */
export const PROFILE_COLUMNS = 'id, email, role, shop_id, plan, billing_status, trial_ends_at';

interface ProfileRow {
  id: string;
  email: string | null;
  role: string | null;
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
  metadata: Record<string, unknown> | null;
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

export function sanitizeArchiveFilter(archived: unknown): AccountArchiveFilter {
  return ACCOUNT_ARCHIVE_FILTERS.includes(archived as AccountArchiveFilter) ? (archived as AccountArchiveFilter) : 'all';
}

export function planDisplayName(planKey: string | null): string | null {
  if (!planKey) return null;
  const known = (PLANS as Record<string, { name: string } | undefined>)[planKey];
  return known?.name ?? planKey;
}

function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, c => `\\${c}`);
}

/**
 * Thrown when a query this module's status/contact data depends on fails.
 * A failed read must surface as an error, never as empty data: an empty
 * profiles result is indistinguishable from "this shop is on the free plan".
 */
export class AdminDataError extends Error {
  constructor(what: string, cause?: { message?: string; code?: string } | null) {
    super(`admin data query failed: ${what}${cause?.code ? ` (${cause.code})` : ''}${cause?.message ? ` - ${cause.message}` : ''}`);
    this.name = 'AdminDataError';
  }
}

function mustRows<T>(res: { data: T[] | null; error: { message?: string; code?: string } | null }, what: string): T[] {
  if (res.error) throw new AdminDataError(what, res.error);
  return res.data ?? [];
}

// ─── Core scan (shared by listAccounts and getOwnerOverview) ─────────────────

/** What the resolver may know about a billing row. The provider id itself never leaves this function. */
function toSnapshot(sub: SubscriptionRow) {
  return {
    status: sub.status,
    billingProvider: sub.billing_provider,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    hasProviderReference: !!sub.provider_subscription_id,
  };
}

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
 * shops whose name matches and shops whose linked profile's email matches,
 * each sub-query itself bounded by MAX_SCAN_ROWS.
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
    db.from('profiles').select('shop_id').ilike('email', pattern).limit(MAX_SCAN_ROWS),
  ]);

  const shopNameRows = mustRows(byShopName, 'shops search');
  const profileMatchRows = mustRows(byProfileMatch, 'profiles search');

  const truncated =
    shopNameRows.length >= MAX_SCAN_ROWS ||
    profileMatchRows.length >= MAX_SCAN_ROWS;

  const ids = new Set<string>();
  for (const row of shopNameRows) ids.add(row.id);
  for (const row of profileMatchRows) if (row.shop_id) ids.add(row.shop_id);

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

  const shopRows = mustRows(await shopQuery, 'shops scan');

  const truncated = searchTruncated || (candidateIds === null && shopRows.length >= MAX_SCAN_ROWS);
  const shopIds = shopRows.map(s => s.id);

  if (shopIds.length === 0) return { shops: [], truncated };

  const [memberResult, subResult] = await Promise.all([
    db.from('shop_users').select('shop_id, user_id, role').in('shop_id', shopIds),
    db
      .from('shop_subscriptions')
      .select('shop_id, status, plan_key, billing_provider, provider_customer_id, provider_subscription_id, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, past_due_at, metadata, created_at')
      .in('shop_id', shopIds),
  ]);
  const memberRows = mustRows(memberResult, 'shop_users scan');
  const subRows = mustRows(subResult, 'shop_subscriptions scan');

  const members = memberRows as MembershipRow[];
  const memberCountByShop = new Map<string, number>();
  for (const m of members) memberCountByShop.set(m.shop_id, (memberCountByShop.get(m.shop_id) ?? 0) + 1);

  // Prefer the shop_users role='owner' member as the primary contact.
  const ownerUserIdByShop = new Map<string, string>();
  for (const m of members) {
    if (m.role === 'owner' && !ownerUserIdByShop.has(m.shop_id)) ownerUserIdByShop.set(m.shop_id, m.user_id);
  }

  const ownerUserIds = [...new Set(ownerUserIdByShop.values())];
  const ownerProfileRows = ownerUserIds.length
    ? mustRows(await db.from('profiles').select(PROFILE_COLUMNS).in('id', ownerUserIds), 'owner profiles lookup')
    : [];
  const profileById = new Map((ownerProfileRows as ProfileRow[]).map(p => [p.id, p]));

  // Shops with no shop_users role='owner' row: fall back to a profile whose
  // profiles.shop_id points at this shop (best effort — a legacy single-shop
  // pointer, not a membership grant; profiles has no created_at, so ties are
  // broken by id, not "earliest"). Flagged via ownerResolved:false rather
  // than presented as equivalent to a real owner-role membership.
  const shopsNeedingFallback = shopIds.filter(id => !ownerUserIdByShop.has(id));
  const fallbackProfileByShop = new Map<string, ProfileRow>();
  if (shopsNeedingFallback.length) {
    const fallbackRows = mustRows(
      await db
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('shop_id', shopsNeedingFallback)
        .order('id', { ascending: true }),
      'fallback profiles lookup',
    );
    for (const row of fallbackRows as ProfileRow[]) {
      if (row.shop_id && !fallbackProfileByShop.has(row.shop_id)) fallbackProfileByShop.set(row.shop_id, row);
    }
  }

  const subsByShop = new Map<string, SubscriptionRow>();
  for (const row of [...(subRows as SubscriptionRow[])].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
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
      subscription: subscription ? toSnapshot(subscription) : null,
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
    primaryContactEmail: row.primaryProfile?.email ?? null,
    primaryContactRole: row.primaryProfile?.role ?? null,
    ownerResolved: row.ownerResolved,
    memberCount: row.memberCount,
    plan: row.primaryProfile?.plan ?? null,
    planDisplayName: planDisplayName(row.primaryProfile?.plan ?? null),
    status: row.classification.status,
    trialExpired: row.classification.trialExpired,
    trialEndsAt: row.primaryProfile?.trial_ends_at ?? null,
    trialDaysLeft: row.classification.trialDaysLeft,
    billingMismatch: row.classification.billingMismatch,
    policyNote: row.classification.policyNote,
    lastSignInAt,
  };
}

// ─── Public API: account list ─────────────────────────────────────────────────

function matchesArchiveFilter(a: { isInternal: boolean; shop: { archived_at: string | null } }, filter: AccountArchiveFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'internal': return a.isInternal;
    case 'active': return !a.isInternal && !a.shop.archived_at;
    case 'archived': return !a.isInternal && !!a.shop.archived_at;
  }
}

export async function listAccounts(params: AccountListParams): Promise<AccountListResult> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = sanitizeSearch(params.search);
  const status = sanitizeStatusFilter(params.status);
  const archived = sanitizeArchiveFilter(params.archived);
  const sortKey = sanitizeSortKey(params.sortKey);
  const sortDir = sanitizeSortDir(params.sortDir);

  const { shops, truncated } = await scanClassifiedShops(search);
  const filtered = shops
    .filter(a => matchesStatusFilter(a, status))
    .filter(a => matchesArchiveFilter(a, archived));

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

/**
 * One count per AccountStatus except 'internal'. Internal shops are counted
 * separately (OwnerOverview.internalShops) and never appear here, so a set of
 * these counts is a partition of the shops it was built from.
 */
export interface OverviewStatusCounts {
  free: number;
  /** "Trial access": profile entitlement (profiles.plan + a future trial_ends_at). */
  trialing: number;
  activePaid: number;
  cancelScheduled: number;
  pastDue: number;
  cancelledAccessRetained: number;
  expired: number;
  /** Paid access the billing record does not confirm (no record, or an unrecognised status). */
  paidUnverified: number;
  /** Billing records that contradict each other. Fails closed: never counted as revenue. */
  billingMismatch: number;
}

const STATUS_COUNT_KEY: Record<Exclude<AccountStatus, 'internal'>, keyof OverviewStatusCounts> = {
  free: 'free',
  trialing: 'trialing',
  active_paid: 'activePaid',
  cancel_scheduled: 'cancelScheduled',
  past_due: 'pastDue',
  cancelled_access_retained: 'cancelledAccessRetained',
  expired: 'expired',
  paid_unverified: 'paidUnverified',
  billing_mismatch: 'billingMismatch',
};

function tallyStatuses(shops: ClassifiedShop[]): OverviewStatusCounts {
  const counts: OverviewStatusCounts = {
    free: 0, trialing: 0, activePaid: 0, cancelScheduled: 0, pastDue: 0,
    cancelledAccessRetained: 0, expired: 0, paidUnverified: 0, billingMismatch: 0,
  };
  for (const s of shops) {
    const status = s.classification.status;
    if (status === 'internal') continue; // never counted as an external status
    counts[STATUS_COUNT_KEY[status]]++;
  }
  return counts;
}

/**
 * The commercial figures shared by the Owner Overview and Billing Health.
 * Both call this on the same classified shops, so they cannot disagree.
 */
export interface CommercialOverview extends CommercialSummary {
  /**
   * Subscription rows whose shop_id matches no shop (a billing record with no
   * account). null when it cannot be determined safely (scan or table too large).
   */
  orphanSubscriptions: number | null;
  /** billing_events rows with no shop_id at all. null when too many rows to count safely. */
  unattributedBillingEvents: number | null;
  truncated: boolean;
}

function toCommercialShop(s: ClassifiedShop): CommercialShop {
  const meta = s.subscription?.metadata as Record<string, unknown> | null | undefined;
  // Absent stays null (assumed monthly, reported). A value that is present but not text is
  // as unrecognisable as an unknown word, so it must not fall back to "monthly".
  const rawInterval = meta?.billing_interval;
  const interval = rawInterval === undefined || rawInterval === null ? null : typeof rawInterval === 'string' ? rawInterval : '[not text]';
  return {
    shopId: s.shop.id,
    archived: !!s.shop.archived_at,
    result: s.classification,
    planKey: s.subscription?.plan_key ?? null,
    billingInterval: interval,
    subscriptionStatus: s.subscription?.status ?? null,
  };
}

async function countOrphanBillingRecords(
  db: ReturnType<typeof getAdminDb>,
  knownShopIds: Set<string>,
  scanTruncated: boolean,
): Promise<{ orphanSubscriptions: number | null; unattributedBillingEvents: number | null }> {
  const [subsRes, eventsRes] = await Promise.all([
    db.from('shop_subscriptions').select('shop_id').limit(MAX_SCAN_ROWS + 1),
    db.from('billing_events').select('shop_id').limit(MAX_SCAN_ROWS + 1),
  ]);
  const subs = mustRows(subsRes, 'orphan subscription scan');
  const events = mustRows(eventsRes, 'unattributed billing event scan');
  return {
    // Without the full shop list an "orphan" cannot be told from a shop outside the scan.
    orphanSubscriptions: scanTruncated || subs.length > MAX_SCAN_ROWS
      ? null
      : subs.filter(r => !knownShopIds.has(r.shop_id)).length,
    unattributedBillingEvents: events.length > MAX_SCAN_ROWS ? null : events.filter(r => !r.shop_id).length,
  };
}

async function buildCommercialOverview(db: ReturnType<typeof getAdminDb>, scan: ScanResult): Promise<CommercialOverview> {
  const summary = summarizeCommercial(scan.shops.map(toCommercialShop));
  const orphans = await countOrphanBillingRecords(db, new Set(scan.shops.map(s => s.shop.id)), scan.truncated);
  // A billing record with no account is a contradiction: fail closed.
  const reconciliation = (orphans.orphanSubscriptions ?? 0) > 0 ? 'mismatch' : summary.reconciliation;
  return { ...summary, reconciliation, ...orphans, truncated: scan.truncated };
}

/** Used by Billing Health so its subscription and revenue figures come from the same resolver as the Overview. */
export async function getCommercialOverview(): Promise<CommercialOverview> {
  const scan = await scanClassifiedShops('');
  return buildCommercialOverview(getAdminDb(), scan);
}

export interface OwnerOverview {
  /** Every shop scanned: active external + archived external + internal. */
  totalShops: number;
  /** Non-archived shops that are not internal. The headline customer/signup count. */
  activeExternalShops: number;
  /** Archived shops that are not internal. Shown separately; never included in the active figures. */
  archivedExternalShops: number;
  /** Shops in INTERNAL_SHOP_IDS (explicit marker only), archived or not. */
  internalShops: number;
  /** Partition of activeExternalShops by primary status. */
  active: OverviewStatusCounts;
  /** Partition of archivedExternalShops by primary status. */
  archived: OverviewStatusCounts;
  // Signup and trial-timing figures cover ACTIVE external shops only.
  signupsToday: number;
  signupsLast7Days: number;
  signupsLast30Days: number;
  /** Subsets of active.trialing — not additional statuses. */
  trialEndingIn3Days: number;
  trialEndingIn7Days: number;
  /** Shops flagged for billing review (records contradict, or paid access is unverified). */
  billingReviewActive: number;
  billingReviewArchived: number;
  /** Shared with Billing Health: reconciliation indicator, subscription counts and verified revenue. */
  commercial: CommercialOverview;
  /** Activation among active external shops (definition: lib/admin/activationRules.ts). Never throws; check `available`. */
  activation: ActivationSummary;
  /**
   * profiles with no shop_users membership at all. Deliberately NOT based on the
   * legacy profiles.shop_id pointer: a profile with a null shop_id but a real
   * membership is linked. null when there are too many rows to scan safely.
   */
  profilesWithoutMembership: number | null;
  truncated: boolean;
  maxScanRows: number;
  /** Most recent ACTIVE external shops. */
  recentSignups: AccountListItem[];
}

async function countProfilesWithoutMembership(db: ReturnType<typeof getAdminDb>): Promise<number | null> {
  const [profilesRes, membersRes] = await Promise.all([
    db.from('profiles').select('id').limit(MAX_SCAN_ROWS + 1),
    db.from('shop_users').select('user_id').limit(MAX_SCAN_ROWS + 1),
  ]);
  const profiles = mustRows(profilesRes, 'profiles membership scan');
  const members = mustRows(membersRes, 'shop_users membership scan');
  // Over the cap the set difference would be wrong, not just partial: say so instead.
  if (profiles.length > MAX_SCAN_ROWS || members.length > MAX_SCAN_ROWS) return null;
  const linked = new Set(members.map(m => m.user_id));
  return profiles.filter(p => !linked.has(p.id)).length;
}

export async function getOwnerOverview(): Promise<OwnerOverview> {
  const db = getAdminDb();
  const scan = await scanClassifiedShops('');
  const { shops, truncated } = scan;
  const internal = shops.filter(a => a.isInternal);
  const external = shops.filter(a => !a.isInternal);
  const activeExternal = external.filter(a => !a.shop.archived_at);
  const archivedExternal = external.filter(a => !!a.shop.archived_at);

  const now = Date.now();
  const dayMs = 86400000;
  const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0); // the label says 00:00 UTC, whatever the host's timezone

  const signupsToday = activeExternal.filter(a => new Date(a.shop.created_at).getTime() >= startOfToday.getTime()).length;
  const signupsLast7Days = activeExternal.filter(a => now - new Date(a.shop.created_at).getTime() <= 7 * dayMs).length;
  const signupsLast30Days = activeExternal.filter(a => now - new Date(a.shop.created_at).getTime() <= 30 * dayMs).length;

  let trialEndingIn3Days = 0;
  let trialEndingIn7Days = 0;
  for (const a of activeExternal) {
    if (a.classification.status === 'trialing' && a.classification.trialDaysLeft !== null) {
      if (a.classification.trialDaysLeft <= 3) trialEndingIn3Days++;
      if (a.classification.trialDaysLeft <= 7) trialEndingIn7Days++;
    }
  }

  const recentSignups: AccountListItem[] = [...activeExternal]
    .sort((a, b) => b.shop.created_at.localeCompare(a.shop.created_at))
    .slice(0, 10)
    .map(row => toListItem(row, undefined));

  return {
    totalShops: shops.length,
    activeExternalShops: activeExternal.length,
    archivedExternalShops: archivedExternal.length,
    internalShops: internal.length,
    active: tallyStatuses(activeExternal),
    archived: tallyStatuses(archivedExternal),
    signupsToday,
    signupsLast7Days,
    signupsLast30Days,
    trialEndingIn3Days,
    trialEndingIn7Days,
    billingReviewActive: activeExternal.filter(a => a.classification.billingMismatch).length,
    billingReviewArchived: archivedExternal.filter(a => a.classification.billingMismatch).length,
    commercial: await buildCommercialOverview(db, scan),
    activation: (await computeActivation(db, activeExternal.map(a => ({
      shopId: a.shop.id,
      ownerUserId: a.primaryProfile?.id ?? null,
      entitlement: a.classification.planState,
      paidVerified: a.classification.revenueVerified,
      createdAt: a.shop.created_at,
    })))).summary,
    profilesWithoutMembership: await countProfilesWithoutMembership(db),
    truncated,
    maxScanRows: MAX_SCAN_ROWS,
    recentSignups,
  };
}

// ─── Public API: billing reconciliation (read-only) ───────────────────────────

const RECONCILIATION_DEFAULT_PAGE_SIZE = 25;
const RECONCILIATION_MAX_PAGE_SIZE = 50;

/**
 * Only what an owner needs to reconcile one account, with the account id
 * reduced to a masked reference. No emails, provider identifiers, payloads or
 * error text — `hasSubscriptionReference` is a boolean, not an identifier.
 */
export interface ReconciliationItem {
  /** One-way HMAC reference (see lib/admin/fingerprint.ts). Stable per account, not an id prefix, and cannot be matched to an id from another response. */
  accountRef: string;
  shopName: string;
  archived: boolean;
  /** The entitlement the product actually grants (lib/planGate getPlanStatus). */
  entitlement: 'free' | 'trial' | 'pro';
  profilePlan: string | null;
  profileBillingStatus: string | null;
  subscriptionStatus: string | null;
  subscriptionPlanKey: string | null;
  hasSubscriptionReference: boolean;
  billingEventCount: number;
  reasons: ReconciliationReason[];
}

export interface ReconciliationResult {
  items: ReconciliationItem[];
  total: number;
  page: number;
  pageSize: number;
  /** True if a bounded scan hit its cap — total may be understated. */
  truncated: boolean;
  maxScanRows: number;
}

export async function getBillingReconciliation(params: { page?: number | string; pageSize?: number | string }): Promise<ReconciliationResult> {
  const page = clampPage(params.page);
  const pageSize = Math.min(clampPageSize(params.pageSize ?? RECONCILIATION_DEFAULT_PAGE_SIZE), RECONCILIATION_MAX_PAGE_SIZE);

  const db = getAdminDb();
  const { shops, truncated: scanTruncated } = await scanClassifiedShops('');

  // shop_id only — never the payload or error columns.
  const eventRows = mustRows(
    await db.from('billing_events').select('shop_id').not('shop_id', 'is', null).limit(MAX_SCAN_ROWS),
    'billing events scan',
  );
  const eventsTruncated = eventRows.length >= MAX_SCAN_ROWS;
  const eventCountByShop = new Map<string, number>();
  for (const e of eventRows) eventCountByShop.set(e.shop_id, (eventCountByShop.get(e.shop_id) ?? 0) + 1);

  const flagged: Array<{ row: ClassifiedShop; reasons: ReconciliationReason[]; events: number }> = [];
  for (const row of shops) {
    if (row.isInternal) continue; // internal shops are outside billing framing
    const c = row.classification;
    const events = eventCountByShop.get(row.shop.id) ?? 0;
    const reasons: ReconciliationReason[] = [];
    if (c.planState === 'pro' && !row.subscription) reasons.push('paid_no_billing_record');
    if (c.mismatchKind === 'free_plan_active_subscription') reasons.push('active_subscription_free_entitlement');
    if (events > 0 && !row.subscription) reasons.push('billing_events_without_subscription');
    if (c.mismatchKind && c.mismatchKind !== 'free_plan_active_subscription') reasons.push('billing_status_conflict');
    if (c.unverifiedReason === 'unrecognised_subscription_status') reasons.push('unrecognised_subscription_status');
    if (reasons.length > 0) flagged.push({ row, reasons, events });
  }

  // Active shops first, then archived; newest first within each, id as a stable tiebreak.
  flagged.sort((a, b) => {
    const archivedDiff = Number(!!a.row.shop.archived_at) - Number(!!b.row.shop.archived_at);
    if (archivedDiff !== 0) return archivedDiff;
    return b.row.shop.created_at.localeCompare(a.row.shop.created_at) || a.row.shop.id.localeCompare(b.row.shop.id);
  });

  const start = (page - 1) * pageSize;
  const items: ReconciliationItem[] = flagged.slice(start, start + pageSize).map(({ row, reasons, events }) => ({
    accountRef: accountFingerprint(row.shop.id),
    shopName: row.shop.name ?? '(unnamed shop)',
    archived: !!row.shop.archived_at,
    entitlement: row.classification.planState,
    profilePlan: row.primaryProfile?.plan ?? null,
    profileBillingStatus: row.primaryProfile?.billing_status ?? null,
    subscriptionStatus: row.subscription?.status ?? null,
    subscriptionPlanKey: row.subscription?.plan_key ?? null,
    hasSubscriptionReference: !!row.subscription?.provider_subscription_id,
    billingEventCount: events,
    reasons,
  }));

  return { items, total: flagged.length, page, pageSize, truncated: scanTruncated || eventsTruncated, maxScanRows: MAX_SCAN_ROWS };
}

// ─── Public API: account detail ───────────────────────────────────────────────

export interface ShopMember {
  profileId: string;
  email: string | null;
  role: string;
  isPrimaryContact: boolean;
}

export interface OtherShopMembership {
  shopId: string;
  shopName: string | null;
  role: string;
}

/**
 * Deliberately no provider identifiers and no provider error text: a full
 * subscription/customer id, a "masked" one that keeps its tail, or an error
 * string quoted from a webhook could each be used to identify or reach the
 * provider record. Linkage is reported as booleans only.
 */
export interface BillingEventSummary {
  id: string;
  eventType: string;
  processed: boolean;
  processedAt: string | null;
  /** True when the webhook handler recorded an error for this event. The error text is not returned. */
  failed: boolean;
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
    email: string | null;
    role: string | null;
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
    /** Stored plan says 'trial' but the end date has passed: Free today. Nothing is written. */
    trialExpired: boolean;
  };
  status: AccountStatusResult;
  subscription: {
    status: string;
    planKey: string;
    billingProvider: string | null;
    hasCustomerReference: boolean;
    hasSubscriptionReference: boolean;
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

  if (shopErr) throw new AdminDataError('shop lookup', shopErr);
  if (!shop) return null;

  const warnings: string[] = [];
  const isInternal = internal.has(shop.id);

  const [membershipResult, mirrorResult] = await Promise.all([
    db.from('shop_users').select('shop_id, user_id, role').eq('shop_id', shop.id),
    db.from('shop_mirrors').select('mirror_shop_id').eq('shop_id', shop.id),
  ]);

  const memberships = mustRows(membershipResult, 'shop_users lookup') as MembershipRow[];
  const mirroredShopIds = ((mirrorResult.data ?? []) as { mirror_shop_id: string }[]).map(r => r.mirror_shop_id);
  if (mirrorResult.error) warnings.push('Mirrored-shop links could not be loaded.');

  const memberUserIds = [...new Set(memberships.map(m => m.user_id))];
  const memberProfileRows = memberUserIds.length
    ? mustRows(await db.from('profiles').select(PROFILE_COLUMNS).in('id', memberUserIds), 'member profiles lookup')
    : [];
  const profileById = new Map((memberProfileRows as ProfileRow[]).map(p => [p.id, p]));

  const ownerMembership = memberships.find(m => m.role === 'owner');
  let ownerResolved = !!ownerMembership;
  let primaryProfile: ProfileRow | null = ownerMembership ? profileById.get(ownerMembership.user_id) ?? null : null;

  if (!primaryProfile) {
    // No owner-role membership (or the owner's profile row is missing) —
    // fall back to a profile whose profiles.shop_id points here (first by id;
    // profiles has no creation date, so this is deterministic, not chronological).
    ownerResolved = false;
    const fallbackRows = mustRows(
      await db
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('shop_id', shop.id)
        .order('id', { ascending: true })
        .limit(1),
      'fallback profile lookup',
    ) as ProfileRow[];
    primaryProfile = fallbackRows[0] ?? null;
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
    const subs = mustRows(
      await db
        .from('shop_subscriptions')
        .select('shop_id, status, plan_key, billing_provider, provider_customer_id, provider_subscription_id, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, past_due_at, metadata, created_at')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(1),
      'shop_subscriptions lookup',
    ) as SubscriptionRow[];
    subscription = subs[0] ?? null;
  }

  let billingEvents: BillingEventSummary[] = [];
  {
    const { data: events, error: eventsErr } = await db
      .from('billing_events')
      .select('id, event_type, processed, processed_at, error, created_at')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(25);
    if (eventsErr) warnings.push('Billing event history is unavailable.');
    billingEvents = (events ?? []).map(e => ({
      id: e.id, eventType: e.event_type, processed: e.processed,
      // The stored error text never leaves the server — only whether one exists.
      processedAt: e.processed_at, failed: !!e.error, createdAt: e.created_at,
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
    subscription: subscription ? toSnapshot(subscription) : null,
  });
  if (classification.billingMismatch && classification.mismatchReason) {
    warnings.push(classification.mismatchReason);
  }

  return {
    shop: { id: shop.id, name: shop.name, createdAt: shop.created_at, archivedAt: shop.archived_at },
    primaryContact: primaryProfile ? {
      profileId: primaryProfile.id,
      email: primaryProfile.email,
      role: primaryProfile.role,
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
      trialExpired: classification.trialExpired,
    },
    status: classification,
    subscription: subscription ? {
      status: subscription.status,
      planKey: subscription.plan_key,
      billingProvider: subscription.billing_provider,
      hasCustomerReference: !!subscription.provider_customer_id,
      hasSubscriptionReference: !!subscription.provider_subscription_id,
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
