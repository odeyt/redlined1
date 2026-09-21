/**
 * lib/admin/activationData.ts
 * SERVER ONLY. Read-only activation figures for the owner portal, derived from
 * records that already exist (see lib/admin/activationRules.ts for the
 * definition and for what is deliberately not tracked). Aggregates only: no shop
 * names, contacts or record contents leave this module.
 *
 * Resilience: activation is auxiliary. An unreadable table makes that milestone
 * "unknown" (never "no"), and any unexpected failure returns an "unavailable"
 * summary instead of throwing — it must never take the Owner Overview down.
 */
import 'server-only';
import type { getAdminDb } from '@/lib/supabaseServer';
import {
  NEW_SHOP_WINDOW_DAYS, activationStage, approachingFreeLimit, isActivatedShop,
  returnedAfterFirstSession, type ActivationStage, type ShopMilestones,
} from '@/lib/admin/activationRules';

type Db = ReturnType<typeof getAdminDb>;

/** Rows read per table. Above this the answer for a shop with no rows is "unknown", not "none". */
const ROW_CAP = 5000;
/** The smallest row cap a hosted PostgREST is known to apply silently (Supabase default max-rows). */
const SERVER_PAGE_LIMIT = 1000;
/** Shops examined. Above this only the first MAX_SHOPS are, and the summary says so. */
const MAX_SHOPS = 500;
const ID_CHUNK = 100;

export interface ActivationInput {
  shopId: string;
  ownerUserId: string | null;
  entitlement: 'free' | 'trial' | 'pro';
  /** Verified paid subscription (canonical resolver: revenueVerified). */
  paidVerified: boolean;
  createdAt: string;
}

export interface ShopActivation {
  stage: ActivationStage;
  /** true / false / null (unknown) against the documented definition. */
  activated: boolean | null;
  approachingFreeLimit: boolean;
  returned: boolean | null;
}

export interface ActivationSummary {
  /** False when activation could not be computed at all. All figures are then zero and must not be shown as real. */
  available: boolean;
  reason: string | null;
  /** Non-internal, non-archived shops examined. */
  genuineShops: number;
  activatedShops: number;
  /** Shops known NOT to meet the definition. */
  signedUpNotActivated: number;
  /** Shops whose activation could not be decided from readable data. */
  activationUnknown: number;
  /** activated / (activated + not activated), percent to one decimal; null when nothing is decidable. */
  activationRatePercent: number | null;
  stages: Record<ActivationStage, number>;
  /** Signed up only, created within NEW_SHOP_WINDOW_DAYS. */
  newShopsNeedingOnboarding: number;
  /** onboarding_started + operational_data. */
  partialOnboarding: number;
  approachingFreeLimit: number;
  returnedAfterFirstSession: number;
  returnedKnown: number;
  paidShops: number;
  /** Verified paid / genuine shops, percent to one decimal. */
  paidConversionPercent: number | null;
  activatedNotPaid: number;
  /** Tables that could not be read (their milestones are unknown). */
  unavailableSources: string[];
  truncated: boolean;
  /** Milestones no existing record can answer. Listed so the gap is visible, not hidden. */
  notDerivable: string[];
}

export const NOT_DERIVABLE_MILESTONES = [
  'first customer communication',
  'upgrade page viewed',
  'checkout started',
];

export function emptyActivationSummary(reason: string | null): ActivationSummary {
  return {
    available: false, reason, genuineShops: 0, activatedShops: 0, signedUpNotActivated: 0, activationUnknown: 0,
    activationRatePercent: null,
    stages: { signed_up_only: 0, onboarding_started: 0, operational_data: 0, activated: 0, paid: 0, unknown: 0 },
    newShopsNeedingOnboarding: 0, partialOnboarding: 0, approachingFreeLimit: 0,
    returnedAfterFirstSession: 0, returnedKnown: 0, paidShops: 0, paidConversionPercent: null, activatedNotPaid: 0,
    unavailableSources: [], truncated: false, notDerivable: NOT_DERIVABLE_MILESTONES,
  };
}

interface Read {
  /** Rows per shop; null when the table could not be read. */
  rowsByShop: Map<string, Array<Record<string, unknown>>> | null;
  /** False when the row cap was hit: a shop with no rows is then "unknown", not "none". */
  complete: boolean;
}

async function readTable(db: Db, table: string, columns: string, ids: string[]): Promise<Read> {
  const rowsByShop = new Map<string, Array<Record<string, unknown>>>();
  let complete = true;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await db.from(table).select(columns).in('shop_id', ids.slice(i, i + ID_CHUNK)).limit(ROW_CAP + 1);
    if (error) return { rowsByShop: null, complete: false };
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    // A page this full may have been cut short: PostgREST applies its own max-rows
    // (1000 by default on Supabase) regardless of the limit requested here, and the
    // cut is silent. Treat it as incomplete so a shop with no rows in it reads as
    // "unknown", never "none".
    if (rows.length > ROW_CAP || rows.length >= SERVER_PAGE_LIMIT) complete = false;
    for (const row of rows.slice(0, ROW_CAP)) {
      const id = row.shop_id as string;
      const list = rowsByShop.get(id) ?? [];
      list.push(row);
      rowsByShop.set(id, list);
    }
  }
  return { rowsByShop, complete };
}

function exists(read: Read, shopId: string): boolean | null {
  if (!read.rowsByShop) return null;
  if ((read.rowsByShop.get(shopId)?.length ?? 0) > 0) return true;
  return read.complete ? false : null;
}

const orOf = (a: boolean | null, b: boolean | null): boolean | null => (a === true || b === true ? true : a === null || b === null ? null : false);

/**
 * shop_settings.company_name has a column DEFAULT of the product name 'Redline'
 * (see supabase/migrations/2026-09-02_m_activation1_shop_settings_lifecycle.sql), so a
 * legacy row can hold it without the shop ever choosing a name. Blank and that default
 * both mean "no business name yet".
 */
export function isChosenBusinessName(raw: unknown): boolean {
  const name = String(raw ?? '').trim();
  return name.length > 0 && name.toLowerCase() !== 'redline';
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export async function computeActivation(
  db: Db, allInputs: ReadonlyArray<ActivationInput>, now: number = Date.now(),
): Promise<{ summary: ActivationSummary; byShop: Record<string, ShopActivation> }> {
  try {
    const truncated = allInputs.length > MAX_SHOPS;
    const inputs = allInputs.slice(0, MAX_SHOPS);
    if (inputs.length === 0) {
      return { summary: { ...emptyActivationSummary(null), available: true }, byShop: {} };
    }
    const ids = inputs.map(i => i.shopId);

    const [customers, vehicles, jobs, repairOrders, estimates, invoices, technicians, settings] = await Promise.all([
      readTable(db, 'customers', 'shop_id', ids),
      readTable(db, 'vehicles', 'shop_id', ids),
      readTable(db, 'job_cards', 'shop_id, check_in_date', ids),
      readTable(db, 'repair_orders', 'shop_id', ids),
      readTable(db, 'estimates', 'shop_id', ids),
      readTable(db, 'invoices', 'shop_id', ids),
      readTable(db, 'technicians', 'shop_id', ids),
      readTable(db, 'shop_settings', 'shop_id, company_name', ids),
    ]);

    const tables: Array<[string, Read]> = [
      ['customers', customers], ['vehicles', vehicles], ['job_cards', jobs], ['repair_orders', repairOrders],
      ['estimates', estimates], ['invoices', invoices], ['technicians', technicians], ['shop_settings', settings],
    ];
    const unavailableSources = tables.filter(([, r]) => r.rowsByShop === null).map(([name]) => name);

    // Owner sign-in history, for "returned after the first session". Bounded to the shops examined.
    const authResults = await Promise.allSettled(
      inputs.map(i => (i.ownerUserId ? db.auth.admin.getUserById(i.ownerUserId) : Promise.resolve(null))),
    );

    const monthStart = new Date(now); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const byShop: Record<string, ShopActivation> = {};
    const stages: Record<ActivationStage, number> = { signed_up_only: 0, onboarding_started: 0, operational_data: 0, activated: 0, paid: 0, unknown: 0 };
    let activated = 0, notActivated = 0, unknown = 0, newNeeding = 0, partial = 0, approaching = 0;
    let returned = 0, returnedKnown = 0, paid = 0, activatedNotPaid = 0;

    inputs.forEach((input, idx) => {
      const settingsRow = settings.rowsByShop?.get(input.shopId)?.[0];
      const onboardingStarted: boolean | null = settings.rowsByShop
        ? (settingsRow ? isChosenBusinessName(settingsRow.company_name) : (settings.complete ? false : null))
        : null;

      const m: ShopMilestones = {
        onboardingStarted,
        hasCustomer: exists(customers, input.shopId),
        hasVehicle: exists(vehicles, input.shopId),
        hasJobOrRepairOrder: orOf(exists(jobs, input.shopId), exists(repairOrders, input.shopId)),
        hasEstimate: exists(estimates, input.shopId),
        hasInvoice: exists(invoices, input.shopId),
        hasTechnician: exists(technicians, input.shopId),
      };

      const isActivated = isActivatedShop(m);
      const stage = activationStage(m, input.paidVerified);

      let nearLimit = false;
      // Counts are only trustworthy from a complete read; otherwise say nothing rather than under-count.
      if (input.entitlement === 'free' && customers.complete && vehicles.complete && jobs.complete
        && customers.rowsByShop && vehicles.rowsByShop && jobs.rowsByShop) {
        const jobsThisMonth = (jobs.rowsByShop.get(input.shopId) ?? []).filter(r => {
          const t = new Date(String(r.check_in_date)).getTime();
          return Number.isFinite(t) && t >= monthStart.getTime();
        }).length;
        nearLimit = approachingFreeLimit({
          customers: customers.rowsByShop.get(input.shopId)?.length ?? 0,
          vehicles: vehicles.rowsByShop.get(input.shopId)?.length ?? 0,
          jobsThisMonth,
        });
      }

      const settled = authResults[idx];
      let ret: boolean | null = null;
      if (settled.status === 'fulfilled' && settled.value && !settled.value.error && settled.value.data?.user) {
        const u = settled.value.data.user as { created_at?: string; last_sign_in_at?: string | null };
        ret = returnedAfterFirstSession(u.created_at, u.last_sign_in_at);
      }

      byShop[input.shopId] = { stage, activated: isActivated, approachingFreeLimit: nearLimit, returned: ret };
      stages[stage]++;
      if (isActivated === true) activated++; else if (isActivated === false) notActivated++; else unknown++;
      if (input.paidVerified) paid++;
      if (isActivated === true && !input.paidVerified) activatedNotPaid++;
      if (stage === 'onboarding_started' || stage === 'operational_data') partial++;
      if (stage === 'signed_up_only' && now - new Date(input.createdAt).getTime() <= NEW_SHOP_WINDOW_DAYS * 86400000) newNeeding++;
      if (nearLimit) approaching++;
      if (ret !== null) { returnedKnown++; if (ret) returned++; }
    });

    return {
      summary: {
        available: true, reason: null, genuineShops: inputs.length, activatedShops: activated,
        signedUpNotActivated: notActivated, activationUnknown: unknown,
        activationRatePercent: pct(activated, activated + notActivated),
        stages, newShopsNeedingOnboarding: newNeeding, partialOnboarding: partial, approachingFreeLimit: approaching,
        returnedAfterFirstSession: returned, returnedKnown, paidShops: paid,
        paidConversionPercent: pct(paid, inputs.length), activatedNotPaid,
        unavailableSources, truncated, notDerivable: NOT_DERIVABLE_MILESTONES,
      },
      byShop,
    };
  } catch {
    return { summary: emptyActivationSummary('Activation figures could not be computed.'), byShop: {} };
  }
}
