/**
 * Safety gates for the production marketing capture.
 *
 * The capture records a walkthrough against PRODUCTION, inside one dedicated
 * demo tenant. These gates decide whether it may start, and whether it left
 * production as expected when it finished.
 *
 * ## Pure on purpose
 *
 * Collecting the facts means querying production; judging them does not. Keeping
 * the judgement here — with no I/O — lets every gate be unit-tested, including
 * the proof that each one fails when its condition is broken. The collector in
 * tests/marketing-capture/gate-facts.ts only reads.
 *
 * ## Fail closed
 *
 * Every fact is typed so that "could not determine" is representable (`null`),
 * and every gate treats null as a failure. A query that errors, a column that
 * does not exist yet, an environment variable nobody set: all of these stop the
 * run rather than letting it proceed on an assumption.
 */

/** The only origin the capture may run against. Compared exactly. */
export const APPROVED_BASE_URL = 'https://www.redlined1.com';

/** Fictional identities. Records are found by these, and only within the demo shop. */
export const DEMO = {
  shopName: 'Redlined1 Demo Workshop',
  ownerEmail: 'thammo01+redlineddemo@gmail.com',
  customer: 'Jordan Blake',
  vehicleLabel: '2021 BMW 330i',
  plate: 'DEMO-330',
  technician: 'Alex Morgan',
  roNumber: 'RO-DEMO-330',
  /**
   * Pre-assigned so QA sign-off does NOT draft a new invoice. Invoice numbers
   * come from one sequence shared by every shop (invoice_number_seq); letting
   * the demo take one would leave a gap in a real shop's invoice series.
   */
  invoiceNumber: 'INV-DEMO-330',
} as const;

/**
 * Controls the capture must never press, matched by exact accessible name.
 *
 *   Close / Close Job  closeJob(): drafts an invoice from the shared sequence and
 *                      queues a Sapelee `repair.completed` event
 *   Void               destroys the repair order's meaning
 *   Send Back          reverses QA sign-off
 *   Delete / Archive   removes demo records the next run depends on
 */
export const FORBIDDEN_CONTROL_NAMES: readonly string[] = [
  'Close', 'Close Job', 'Void', 'Send Back', 'Delete', 'Archive',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A record found by a demo identifier, anywhere in production. */
export interface OwnedRecord {
  shopId: string;
  phone?: string | null;
  email?: string | null;
  userId?: string | null;
}

export interface GateFacts {
  env: {
    captureEnabled: string | undefined;
    demoShopId: string | undefined;
    baseUrl: string | undefined;
  };
  /** null when the shop could not be read. */
  shop: { id: string; name: string; isSynthetic: boolean } | null;
  /** The user inside the saved session, decoded from its token. null if unreadable. */
  sessionUserId: string | null;
  /** Every membership of that user, across all shops. null if unreadable. */
  sessionMemberships: { shopId: string; role: string }[] | null;
  /** Every member of the demo shop. null if unreadable. */
  shopMembers: { userId: string; role: string }[] | null;
  /** Push subscriptions belonging to any demo-shop member OR tagged with the shop. */
  pushSubscriptions: number | null;
  /** True only when every alert the shop could raise is muted for every role. */
  alertsAllOff: boolean | null;
  /** shop_mirrors rows referencing the demo shop in either column. */
  mirrorRows: number | null;
  customersNamed: OwnedRecord[] | null;
  vehiclesWithPlate: OwnedRecord[] | null;
  techniciansNamed: OwnedRecord[] | null;
  /** The demo job card, read within the demo shop. */
  jobCard: { status: string; technicians: string[] } | null;
  /** The demo repair order, read within the demo shop. */
  repairOrder: { roNumber: string; invoiceNumber: string | null; status: string } | null;
  /** Sapelee outbox rows for the demo shop. The walkthrough must never add any. */
  sapeleeOutboxRows: number | null;
}

export interface GateResult {
  ok: boolean;
  failures: string[];
}

const blank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === '';

/** Every demo identifier must exist exactly once, only in the demo shop, with no contact details. */
function soleOwnership(
  label: string,
  rows: OwnedRecord[] | null,
  shopId: string,
  failures: string[],
  { contactFields = true, noLogin = false } = {},
) {
  if (rows === null) { failures.push(`${label}: could not be read`); return; }
  if (rows.length !== 1) { failures.push(`${label}: expected exactly 1 in production, found ${rows.length}`); return; }
  const [r] = rows;
  if (r.shopId !== shopId) failures.push(`${label}: belongs to a shop other than the demo shop`);
  if (contactFields && (!blank(r.phone) || !blank(r.email))) failures.push(`${label}: has a phone or email`);
  if (noLogin && !blank(r.userId)) failures.push(`${label}: is linked to a login`);
}

/** Gates that must hold BEFORE the capture opens a page. */
export function evaluateStartGates(f: GateFacts): GateResult {
  const failures: string[] = [];

  if (f.env.captureEnabled !== 'true') failures.push('ALLOW_PRODUCTION_MARKETING_CAPTURE is not exactly "true"');
  if (f.env.baseUrl !== APPROVED_BASE_URL) failures.push(`base URL is not exactly ${APPROVED_BASE_URL}`);

  const shopId = f.env.demoShopId ?? '';
  if (!UUID.test(shopId)) {
    failures.push('MARKETING_DEMO_SHOP_ID is missing or not a UUID');
    // Nothing below can be judged without the shop, and a partial list would read as nearly-safe.
    return { ok: false, failures };
  }

  if (f.shop === null) failures.push('demo shop could not be read');
  else {
    if (f.shop.id !== shopId) failures.push('shop read back does not match MARKETING_DEMO_SHOP_ID');
    if (f.shop.isSynthetic !== true) failures.push('shop is not marked is_synthetic');
    if (f.shop.name !== DEMO.shopName) failures.push(`shop name is not "${DEMO.shopName}"`);
  }

  if (f.sessionUserId === null) failures.push('saved session user could not be determined');
  if (f.sessionMemberships === null) failures.push('session memberships could not be read');
  else if (
    f.sessionMemberships.length !== 1 ||
    f.sessionMemberships[0].shopId !== shopId ||
    f.sessionMemberships[0].role !== 'owner'
  ) failures.push('session user must be owner of the demo shop and of no other shop');

  if (f.shopMembers === null) failures.push('demo shop members could not be read');
  else if (f.shopMembers.length !== 1 || f.shopMembers[0].userId !== f.sessionUserId) {
    // Push subscriptions belong to USERS. A second member's phone would receive demo alerts.
    failures.push('demo shop must have exactly one member: the session user');
  }

  if (f.pushSubscriptions !== 0) failures.push(`push subscriptions must be 0 (found ${f.pushSubscriptions ?? 'unreadable'})`);
  if (f.alertsAllOff !== true) failures.push('not every alert is muted for the demo shop');
  if (f.mirrorRows !== 0) failures.push(`shop_mirrors must not reference the demo shop (found ${f.mirrorRows ?? 'unreadable'})`);

  soleOwnership(`customer "${DEMO.customer}"`, f.customersNamed, shopId, failures);
  soleOwnership(`vehicle "${DEMO.plate}"`, f.vehiclesWithPlate, shopId, failures, { contactFields: false });
  soleOwnership(`technician "${DEMO.technician}"`, f.techniciansNamed, shopId, failures, { noLogin: true });

  // A known starting state, so every take records the same walkthrough. A second
  // take would otherwise begin from wherever the first one ended.
  if (f.jobCard === null) failures.push('demo job card not found in the demo shop');
  else {
    if (f.jobCard.status !== 'Booked') failures.push(`job card must start "Booked" (is "${f.jobCard.status}")`);
    if (f.jobCard.technicians.length !== 0) failures.push('job card must start with no technician assigned');
  }

  if (f.repairOrder === null) failures.push(`repair order ${DEMO.roNumber} not found in the demo shop`);
  else {
    if (f.repairOrder.invoiceNumber !== DEMO.invoiceNumber) {
      failures.push(`repair order must already carry ${DEMO.invoiceNumber}, or QA sign-off would take a number from the shared invoice sequence`);
    }
    if (f.repairOrder.status !== 'Open') failures.push(`repair order must start "Open" (is "${f.repairOrder.status}")`);
  }

  if (f.sapeleeOutboxRows !== 0) failures.push(`Sapelee outbox must hold 0 rows for the demo shop (found ${f.sapeleeOutboxRows ?? 'unreadable'})`);

  return { ok: failures.length === 0, failures };
}

/**
 * Gates that must still hold AFTER the walkthrough.
 *
 * The run changes statuses and assigns a technician, so this does not demand an
 * identical snapshot. It demands that nothing crossed the tenant boundary and
 * nothing left the platform.
 */
export function evaluateFinishGates(before: GateFacts, after: GateFacts): GateResult {
  const failures: string[] = [];
  const shopId = before.env.demoShopId ?? '';

  if (after.sapeleeOutboxRows !== 0) failures.push(`the run queued Sapelee events (found ${after.sapeleeOutboxRows ?? 'unreadable'})`);
  if (after.pushSubscriptions !== 0) failures.push('a push subscription appeared during the run');
  if (after.shopMembers === null || after.shopMembers.length !== 1) failures.push('demo shop membership changed during the run');

  // Still exactly one of each, still only here: the run created nothing.
  for (const [label, b, a] of [
    ['customer', before.customersNamed, after.customersNamed],
    ['vehicle', before.vehiclesWithPlate, after.vehiclesWithPlate],
    ['technician', before.techniciansNamed, after.techniciansNamed],
  ] as const) {
    if (a === null || b === null) { failures.push(`${label}: could not be re-read`); continue; }
    if (a.length !== b.length) failures.push(`${label}: count changed from ${b.length} to ${a.length}`);
    if (a.some(r => r.shopId !== shopId)) failures.push(`${label}: a matching record exists outside the demo shop`);
  }

  if (after.repairOrder?.invoiceNumber !== DEMO.invoiceNumber) {
    failures.push('repair order invoice number changed; a shared-sequence invoice may have been drafted');
  }

  return { ok: failures.length === 0, failures };
}

/** The shape of `shops.select('id, name, is_synthetic').eq('id', …).maybeSingle()`. */
export interface ShopReadBack {
  error: unknown;
  data: { id?: unknown; name?: unknown; is_synthetic?: unknown } | null;
}

/**
 * Judges the seed's read-back of the demo shop before any demo record is written
 * into it. Returns the reason to refuse, or null when the shop is the synthetic
 * demo shop.
 *
 * Only a boolean `true` passes. false, null, a missing column, a string "true" or
 * an unreadable row all refuse: a shop that cannot be PROVEN synthetic is treated
 * as a real one. Messages name the condition, never row contents beyond the flag.
 */
export function syntheticShopReadBackFailure(readBack: ShopReadBack, expectedShopId: string): string | null {
  if (!UUID.test(expectedShopId)) return 'demo shop id is not a UUID';
  if (readBack.error) return 'demo shop could not be read back';
  if (readBack.data === null || readBack.data === undefined) return 'demo shop was not found on read-back';
  const row = readBack.data;
  if (row.id !== expectedShopId) return 'read-back returned a different shop';
  if (!('is_synthetic' in row) || row.is_synthetic === undefined) return 'is_synthetic is missing from the read-back';
  if (row.is_synthetic === null) return 'is_synthetic is null';
  if (row.is_synthetic !== true) return `is_synthetic is ${typeof row.is_synthetic === 'boolean' ? 'false' : 'not a boolean'}`;
  if (row.name !== DEMO.shopName) return `demo shop is not named "${DEMO.shopName}"`;
  return null;
}

/** Whether an accessible name belongs to a control the capture must never press. */
export function isForbiddenControl(name: string): boolean {
  const n = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().toLowerCase();
  return FORBIDDEN_CONTROL_NAMES.some(f => n === f.toLowerCase());
}
