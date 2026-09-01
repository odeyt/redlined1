/**
 * Per-line procurement: what has been ordered, and what has been paid for.
 *
 * ## The question this answers
 *
 * Reported from the floor: a quotation holds eight parts, a deposit has been
 * put down on some of them, and a few are already on order. Nothing on the
 * screen said which. The quotation carried ONE deposit figure for the whole
 * sheet and one status for the whole sheet, so "which ones did we pay for"
 * could only be answered from memory.
 *
 * ## Where this lives
 *
 * Both fields ride inside the existing `line_items` JSONB, exactly as `unit`
 * does: the whole item object is written and read back verbatim, so a row
 * saved before this existed simply has no `orderState` and reads as the
 * default. No migration, and nothing to backfill.
 *
 * ## Deposits are per currency, never one number
 *
 * A line carries its own currency — this app quotes a THB line and a USD line
 * on the same sheet deliberately. A deposit belongs to its line, so totalling
 * deposits means totalling them PER CURRENCY. Adding 3,500 THB to 100 USD
 * because both are numbers is how a balance becomes fiction, and
 * `calcTotalByCurrency` already refuses to do it for line costs. This follows
 * that precedent rather than inventing a second, looser rule beside it.
 */

export type ProcurementState = 'not_ordered' | 'ordered' | 'received';

/**
 * The states, in the order work actually moves through them.
 *
 * Colour AND label together. A colour-only status is invisible to a
 * colour-blind technician and to a screen reader, and this is a sheet someone
 * scans in a hurry to decide what still needs buying.
 */
export const PROCUREMENT_STATES: ReadonlyArray<{
  value: ProcurementState;
  label: string;
  /** Text colour. */
  fg: string;
  /** Chip fill. */
  bg: string;
  border: string;
}> = [
  { value: 'not_ordered', label: 'Not ordered', fg: 'var(--muted)', bg: 'transparent', border: 'var(--line)' },
  { value: 'ordered', label: 'Ordered', fg: '#b45309', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.55)' },
  { value: 'received', label: 'Received', fg: '#15803d', bg: 'rgba(34,197,94,0.16)', border: 'rgba(34,197,94,0.55)' },
];

const VALID = new Set<string>(PROCUREMENT_STATES.map(s => s.value));

/** Just the fields this module reads. */
export interface ProcurableLine {
  currency?: string | null;
  deposit?: number | null;
  orderState?: string | null;
  orderedAt?: string | null;
  receivedAt?: string | null;
}

/**
 * The state of one line, defaulting for rows written before this existed.
 *
 * Anything unrecognised reads as `not_ordered` rather than throwing or being
 * displayed raw: a quotation must still open if a value was hand-edited or
 * arrives from an older client.
 */
export function lineState(item: ProcurableLine | null | undefined): ProcurementState {
  const raw = item?.orderState;
  return raw && VALID.has(raw) ? raw as ProcurementState : 'not_ordered';
}

export function stateStyle(state: ProcurementState) {
  return PROCUREMENT_STATES.find(s => s.value === state) ?? PROCUREMENT_STATES[0];
}

/**
 * The deposit recorded against one line, in that LINE's currency.
 *
 * Negative and non-finite values are floored to 0. A negative deposit would
 * increase the balance due, which is not a refund — it is a typo that quietly
 * overcharges a customer.
 */
export function lineDeposit(item: ProcurableLine | null | undefined): number {
  const n = Number(item?.deposit ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Every deposit on the sheet, totalled per currency.
 *
 * `fallbackCurrency` is used for a line that carries none, matching how line
 * costs are totalled. Currencies with a zero total are omitted, so the caller
 * can treat an empty object as "nothing paid".
 */
export function depositByCurrency(
  items: readonly ProcurableLine[] | null | undefined,
  fallbackCurrency: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items ?? []) {
    const amount = lineDeposit(item);
    if (!amount) continue;
    const cur = (item.currency || fallbackCurrency || '').trim() || fallbackCurrency;
    out[cur] = (out[cur] ?? 0) + amount;
  }
  return out;
}

/** How many lines sit in each state. Drives the summary line under the table. */
export function procurementCounts(items: readonly ProcurableLine[] | null | undefined) {
  const counts = { not_ordered: 0, ordered: 0, received: 0 };
  for (const item of items ?? []) counts[lineState(item)] += 1;
  return counts;
}

/**
 * The fields to write when a line moves to a new state.
 *
 * Returns a patch rather than mutating, so a caller can spread it over the
 * line it already holds.
 *
 * ## Stamps on the TRANSITION, never on every save
 *
 * Re-selecting the state a line is already in leaves its dates alone. The
 * vehicles completion trigger learned this the hard way and its migration says
 * so: re-stamping on an unrelated edit moves a finished job into the month
 * somebody happened to correct a typo.
 *
 * ## Moving backwards clears the date
 *
 * A line dragged back to Not ordered loses both dates, and one dropped from
 * Received to Ordered loses its arrival date. Keeping them would leave the row
 * asserting it arrived on a date when, by its own status, it has not arrived.
 * Same rule the vehicles trigger applies when a car is reopened.
 *
 * ## An unknown ordered date is left unknown
 *
 * Going straight from Not ordered to Received — a part collected over the
 * counter — leaves `orderedAt` null rather than inventing one. Null reads as
 * "we do not know", and today's date would read as fact.
 */
export function applyProcurementState(
  item: ProcurableLine | null | undefined,
  next: ProcurementState,
  nowIso: string,
): { orderState: ProcurementState; orderedAt: string | null; receivedAt: string | null } {
  const current = lineState(item);
  const orderedAt = item?.orderedAt ?? null;
  const receivedAt = item?.receivedAt ?? null;

  if (current === next) return { orderState: next, orderedAt, receivedAt };

  if (next === 'not_ordered') return { orderState: next, orderedAt: null, receivedAt: null };

  if (next === 'ordered') {
    // Keep an existing ordered date: coming back from Received does not mean
    // it was ordered again.
    return { orderState: next, orderedAt: orderedAt ?? nowIso, receivedAt: null };
  }

  return { orderState: next, orderedAt, receivedAt: receivedAt ?? nowIso };
}

/**
 * Whole days a line has been on order without arriving, or null.
 *
 * Null unless the line is actually waiting — a received line is not waiting,
 * and one with no ordered date cannot be measured. That is the number behind
 * "ordered on the 12th, still not here".
 */
export function daysAwaiting(
  item: ProcurableLine | null | undefined,
  nowIso: string,
): number | null {
  if (lineState(item) !== 'ordered') return null;
  const from = item?.orderedAt;
  if (!from) return null;
  const started = new Date(from).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(started) || Number.isNaN(now)) return null;
  // Negative would mean a date in the future; report 0 rather than a negative
  // wait, which reads as nonsense on screen.
  return Math.max(0, Math.floor((now - started) / 86_400_000));
}

/** The longest any line has been waiting, or null when nothing is on order. */
export function longestWait(
  items: readonly ProcurableLine[] | null | undefined,
  nowIso: string,
): number | null {
  let worst: number | null = null;
  for (const item of items ?? []) {
    const d = daysAwaiting(item, nowIso);
    if (d !== null && (worst === null || d > worst)) worst = d;
  }
  return worst;
}

/**
 * Whether anything on this sheet has procurement recorded at all.
 *
 * Used to keep the summary line off a quotation nobody has started buying
 * for — an all-zero row of counts is noise on a fresh quote.
 */
export function hasProcurement(
  items: readonly ProcurableLine[] | null | undefined,
  fallbackCurrency: string,
): boolean {
  const counts = procurementCounts(items);
  if (counts.ordered > 0 || counts.received > 0) return true;
  return Object.keys(depositByCurrency(items, fallbackCurrency)).length > 0;
}
