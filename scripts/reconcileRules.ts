/**
 * The rule registry: one entry per emitter, shared by the reconciler and the
 * scheduled health check.
 *
 * It lives in its own module because two copies would drift, and a reconciler
 * deriving a different idempotency key from the detector is the one failure
 * that produces duplicate events.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export interface Candidate {
  key: string;
  aggregateType: string;
  aggregateId: string;
  shopId: string | null;
  /** Set instead of shopId for organization-scoped tables. */
  organizationId?: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface Rule {
  eventType: string;
  table: string;
  select: string;
  /**
   * Which tenant column the authoritative row carries.
   *
   * payroll_runs and leave_requests are organization-scoped: they have no
   * shop_id at all. The live emitter still writes one, taken from whichever
   * shop the user happened to be in — a fact the business row does not record.
   * So for an organization holding more than one shop, the shop cannot be
   * recovered and the event is reported AMBIGUOUS rather than guessed. D1
   * Imports has two locations, which is exactly that case.
   */
  scope?: 'shop' | 'organization';
  /** The state that means this event SHOULD exist. Not "every row". */
  eligible: (row: Record<string, unknown>) => boolean;
  toCandidate: (row: Record<string, unknown>) => Candidate;
}

const s = (v: unknown) => (v == null ? '' : String(v));

/**
 * One rule per emitter, mirroring exactly what it fires on and the key it uses.
 * If an emitter changes, this changes with it — the drift test in
 * lib/domain/__tests__/eventsEmitted.test.ts keeps the list of types honest.
 */
export const RULES: Rule[] = [
  {
    eventType: 'invoice.issued',
    table: 'invoices',
    select: 'number, shop_id, customer_id, repair_order_id, status, currency, created_at',
    // The emitter fires on create, so existence IS the eligible state.
    eligible: () => true,
    toCandidate: r => ({
      key: 'invoice.issued:' + s(r.number),
      aggregateType: 'invoice',
      aggregateId: s(r.number),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        invoiceNumber: s(r.number), customerId: s(r.customer_id),
        repairOrderId: (r.repair_order_id as string) ?? null,
        status: s(r.status), currency: s(r.currency),
      },
    }),
  },
  {
    eventType: 'payment.recorded',
    table: 'payments',
    select: 'id, shop_id, invoice_number, amount, currency, method, entry_type, created_at',
    eligible: r => r.entry_type === 'payment',
    toCandidate: r => ({
      key: 'payment.recorded:' + s(r.id),
      aggregateType: 'payment',
      aggregateId: s(r.id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        invoiceNumber: s(r.invoice_number), amount: Number(r.amount ?? 0),
        currency: s(r.currency), method: s(r.method),
      },
    }),
  },
  {
    eventType: 'payment.reversed',
    table: 'payments',
    select: 'id, shop_id, invoice_number, amount, currency, method, entry_type, reverses_payment_id, reason, created_at',
    eligible: r => r.entry_type === 'reversal' && Boolean(r.reverses_payment_id),
    toCandidate: r => ({
      // Keyed on the ORIGINAL payment, matching the emitter.
      key: 'payment.reversed:' + s(r.reverses_payment_id),
      aggregateType: 'payment',
      aggregateId: s(r.reverses_payment_id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        reversalId: s(r.id), invoiceNumber: s(r.invoice_number),
        amount: Number(r.amount ?? 0), currency: s(r.currency),
        method: s(r.method), reason: s(r.reason),
      },
    }),
  },
  {
    eventType: 'expense.approved',
    table: 'expenses',
    select: 'id, shop_id, status, amount, currency, created_at',
    eligible: r => r.status === 'Approved',
    toCandidate: r => ({
      key: 'expense.approved:' + s(r.id),
      aggregateType: 'expense',
      aggregateId: s(r.id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: { amount: Number(r.amount ?? 0), currency: s(r.currency) },
    }),
  },
  {
    eventType: 'leave.approved',
    table: 'leave_requests',
    scope: 'organization',
    select: 'id, organization_id, employee_id, status, start_date, end_date, created_at',
    eligible: r => r.status === 'Approved',
    toCandidate: r => ({
      key: 'leave.approved:' + s(r.id),
      aggregateType: 'leave_request',
      aggregateId: s(r.id),
      shopId: null,
      organizationId: (r.organization_id as string) ?? null,
      createdAt: s(r.created_at),
      payload: {
        employeeId: s(r.employee_id),
        startDate: s(r.start_date), endDate: s(r.end_date),
      },
    }),
  },
  {
    eventType: 'cash_day.closed',
    table: 'cash_days',
    select: 'id, shop_id, status, closed_at, created_at',
    eligible: r => Boolean(r.closed_at),
    toCandidate: r => ({
      key: 'cash_day.closed:' + s(r.id),
      aggregateType: 'cash_day',
      aggregateId: s(r.id),
      shopId: (r.shop_id as string) ?? null,
      createdAt: s(r.closed_at || r.created_at),
      payload: { status: s(r.status) },
    }),
  },
  {
    eventType: 'payroll.finalised',
    table: 'payroll_runs',
    scope: 'organization',
    select: 'id, organization_id, status, finalised_at, created_at',
    eligible: r => Boolean(r.finalised_at),
    toCandidate: r => ({
      key: 'payroll.finalised:' + s(r.id),
      aggregateType: 'payroll_run',
      aggregateId: s(r.id),
      shopId: null,
      organizationId: (r.organization_id as string) ?? null,
      createdAt: s(r.finalised_at || r.created_at),
      payload: { status: s(r.status) },
    }),
  },
];

export interface Counts {
  eligible: number;
  present: number;
  missing: number;
  /**
   * Missing AND created after the emitter existed.
   *
   * This is the number worth alerting on. A business row older than its
   * emitter is history from before the feature shipped, not a failure — count
   * those and the alert is red forever, which makes it furniture.
   */
  missingPostEmitter: number;
  unroutable: number;
  ambiguous: number;
  error?: string;
}

interface ShopRow { id: string; name?: string; organization_id: string | null }

/**
 * Read-only classification of one rule's candidates. Emits nothing.
 *
 * Shared with the reconciler so the detector and the repairer agree on what
 * counts as missing — a detector using a different predicate would either
 * alert on things the repairer skips, or stay silent on things it would emit.
 */
export async function classify(
  db: AnyDb,
  rule: Rule,
  shops: ShopRow[],
  seen: Set<string>,
  emitterSince: string | undefined,
): Promise<Counts> {
  const counts: Counts = { eligible: 0, present: 0, missing: 0, missingPostEmitter: 0, unroutable: 0, ambiguous: 0 };

  const { data: rows, error } = await db.from(rule.table).select(rule.select);
  if (error) { counts.error = error.message.slice(0, 80); return counts; }

  const shopById = new Map(shops.map(s => [s.id, s]));

  for (const row of rows ?? []) {
    const r = row as unknown as Record<string, unknown>;
    if (!rule.eligible(r)) continue;
    counts.eligible++;

    const c = rule.toCandidate(r);
    if (seen.has(c.key)) { counts.present++; continue; }

    let shop = c.shopId ? shopById.get(c.shopId) : undefined;
    if (!shop && rule.scope === 'organization') {
      if (!c.organizationId) { counts.unroutable++; continue; }
      const matches = shops.filter(s => s.organization_id === c.organizationId);
      if (matches.length !== 1) { counts.ambiguous++; continue; }
      shop = matches[0];
    }
    if (!shop || !shop.organization_id) { counts.unroutable++; continue; }

    counts.missing++;
    if (emitterSince && c.createdAt && c.createdAt >= emitterSince) counts.missingPostEmitter++;
  }

  return counts;
}
