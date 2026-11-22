/**
 * Redline AI — deterministic answer builders (pure, no I/O).
 *
 * These functions turn already-fetched shop facts into plain-English answers.
 * They are the source of truth for every number Redline AI states: the
 * optional LLM pass (lib/redline-ai/llm.ts) may only rephrase this text, and
 * when it is unavailable the text built here is the answer.
 *
 * Rules carried over from the spec (§4):
 *  - cite the record behind every claim (document number, date, amount);
 *  - never invent a figure — a missing total is stated as missing;
 *  - never sum across currencies.
 */
import type { Receivable } from '@/lib/domain/receivables';
import type {
  CustomerOwes,
  EstimateFact,
  JobFact,
  OwedInvoiceFact,
  VehicleHistory,
} from './types';

/** An estimate waiting on the customer for this many days counts as stale.
 *  Matches MetricsBuilder's staleThresholdDays. */
export const STALE_ESTIMATE_DAYS = 3;

/** Statuses (lower-cased) that mean "sent to the customer, no decision yet".
 *  The codebase stores both capitalised ('Sent') and lower-case ('sent')
 *  eras, so every comparison goes through normalizeStatus. */
const AWAITING_REPLY_STATUSES = new Set([
  'sent',
  'pending',
  'pending customer',
  'viewed',
  'quoted',
]);

/** Job-card statuses (lower-cased) that mean the job is finished. Mirrors
 *  MetricsBuilder's CLOSED_JOB_STATUSES plus the lower-case 'complete' the
 *  vehicle intelligence engine queries. */
const CLOSED_JOB_STATUSES = new Set(['closed', 'completed', 'complete', 'invoiced', 'done']);

export function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toLowerCase();
}

export function isAwaitingReply(status: string | null | undefined): boolean {
  return AWAITING_REPLY_STATUSES.has(normalizeStatus(status));
}

export function isOpenJob(status: string | null | undefined): boolean {
  return !CLOSED_JOB_STATUSES.has(normalizeStatus(status));
}

/** Whole days from an ISO date/datetime to `today` ('YYYY-MM-DD'). */
export function ageInDays(from: string | null | undefined, today: string): number {
  if (!from) return 0;
  const a = new Date(String(from).slice(0, 10) + 'T00:00:00Z').getTime();
  const b = new Date(today + 'T00:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function formatMoney(amount: number, currency: string): string {
  const cur = currency || 'USD';
  const num = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cur} ${num}`;
}

/** '2026-11-22T…' / '2026-11-22' → '2026-11-22'. */
export function dateOnly(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 10) : '';
}

// ── Who owes us money ────────────────────────────────────────────────────────

export function toOwedInvoiceFact(r: Receivable): OwedInvoiceFact {
  return {
    invoiceNumber: r.invoiceNumber,
    customerName: r.customerName || 'Unknown customer',
    vehicleLabel: r.vehicle || '',
    currency: r.currency,
    total: r.total,
    paid: r.paid,
    balance: r.balance,
    dueDate: r.dueDate || '',
    daysOverdue: r.daysOverdue,
    status: r.status,
  };
}

/**
 * Group outstanding balances by customer, oldest debt first.
 * Input is receivablesFrom() output (drafts and settled invoices already
 * excluded there); only positive balances are owed.
 */
export function groupOwes(receivables: readonly Receivable[]): CustomerOwes[] {
  const facts = receivables.filter(r => r.balance > 0).map(toOwedInvoiceFact);
  const byCustomer = new Map<string, OwedInvoiceFact[]>();
  for (const f of facts) {
    const list = byCustomer.get(f.customerName) ?? [];
    list.push(f);
    byCustomer.set(f.customerName, list);
  }
  const groups: CustomerOwes[] = [...byCustomer.entries()].map(([customerName, invoices]) => {
    const totalsByCurrency: Record<string, number> = {};
    for (const inv of invoices) {
      totalsByCurrency[inv.currency] = (totalsByCurrency[inv.currency] ?? 0) + inv.balance;
    }
    for (const k of Object.keys(totalsByCurrency)) {
      totalsByCurrency[k] = Math.round((totalsByCurrency[k] + Number.EPSILON) * 100) / 100;
    }
    const sorted = invoices.slice().sort((a, b) =>
      b.daysOverdue - a.daysOverdue || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    return {
      customerName,
      invoices: sorted,
      totalsByCurrency,
      oldestDueDate: sorted.map(i => i.dueDate).filter(Boolean).sort()[0] ?? '',
      maxDaysOverdue: Math.max(0, ...sorted.map(i => i.daysOverdue)),
    };
  });
  // Oldest debt first; ties broken by the largest single-currency total.
  return groups.sort((a, b) =>
    b.maxDaysOverdue - a.maxDaysOverdue ||
    Math.max(0, ...Object.values(b.totalsByCurrency)) - Math.max(0, ...Object.values(a.totalsByCurrency)));
}

export function buildWhoOwesAnswer(groups: readonly CustomerOwes[]): string {
  const all = groups.flatMap(g => g.invoices);
  if (all.length === 0) return 'Nobody owes you money right now — every issued invoice is settled.';
  const overdue = all.filter(i => i.daysOverdue > 0);
  const lines: string[] = [
    `${all.length} unpaid invoice${all.length === 1 ? '' : 's'} across ${groups.length} customer${groups.length === 1 ? '' : 's'}${overdue.length ? `, ${overdue.length} overdue` : ''}:`,
  ];
  for (const g of groups) {
    const totals = Object.entries(g.totalsByCurrency)
      .map(([c, amt]) => formatMoney(amt, c)).join(' + ');
    lines.push(`\n${g.customerName} — owes ${totals}:`);
    for (const inv of g.invoices) {
      const due = inv.dueDate
        ? inv.daysOverdue > 0
          ? `due ${inv.dueDate}, ${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} overdue`
          : `due ${inv.dueDate}`
        : 'no due date set';
      lines.push(`  • Invoice ${inv.invoiceNumber} — balance ${formatMoney(inv.balance, inv.currency)} of ${formatMoney(inv.total, inv.currency)}${inv.vehicleLabel ? ` (${inv.vehicleLabel})` : ''}, ${due}.`);
    }
  }
  return lines.join('\n');
}

// ── Stale estimates ──────────────────────────────────────────────────────────

export function buildStaleEstimatesAnswer(estimates: readonly EstimateFact[]): string {
  const awaiting = estimates.filter(e => e.awaitingReply);
  if (awaiting.length === 0) return 'No estimates are waiting on a customer reply right now.';
  const staleCount = awaiting.filter(e => e.stale).length;
  const lines: string[] = [
    `${awaiting.length} estimate${awaiting.length === 1 ? '' : 's'} sent with no reply${staleCount ? ` (${staleCount} stale — ${STALE_ESTIMATE_DAYS}+ days)` : ''}, oldest first:`,
  ];
  for (const e of awaiting) {
    const total = e.total != null ? formatMoney(e.total, e.currency) : 'total not recorded';
    lines.push(`  • Estimate ${e.number} — ${total} for ${e.customerName || 'unknown customer'}${e.vehicleLabel ? ` (${e.vehicleLabel})` : ''}, sent ${dateOnly(e.sentAt ?? e.createdAt)}, ${e.ageDays} day${e.ageDays === 1 ? '' : 's'} ago${e.stale ? ' — stale' : ''}.`);
  }
  lines.push('\nUse "Draft a follow-up" on any of these and I will write the message — nothing is sent until you send it yourself.');
  return lines.join('\n');
}

// ── Morning brief ────────────────────────────────────────────────────────────

export interface MorningBriefFacts {
  openJobs: JobFact[];
  awaitingEstimates: EstimateFact[];
  owedGroups: CustomerOwes[];
}

/**
 * The "start with these 3" list, in priority order:
 *  1. the most overdue invoice (money already earned, longest waiting),
 *  2. the highest-value stale estimate (biggest decision sitting idle),
 *  3. the longest-open job (work stuck in the shop).
 * Only items that exist are listed; each line cites its record.
 */
export function pickStartWith(facts: MorningBriefFacts): string[] {
  const picks: string[] = [];
  const overdue = facts.owedGroups
    .flatMap(g => g.invoices)
    .filter(i => i.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance)[0];
  if (overdue) {
    picks.push(`Chase invoice ${overdue.invoiceNumber} — ${formatMoney(overdue.balance, overdue.currency)} from ${overdue.customerName}, ${overdue.daysOverdue} days overdue (due ${overdue.dueDate}).`);
  }
  const stale = facts.awaitingEstimates
    .filter(e => e.stale)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || b.ageDays - a.ageDays)[0];
  if (stale) {
    const total = stale.total != null ? formatMoney(stale.total, stale.currency) : 'total not recorded';
    picks.push(`Follow up estimate ${stale.number} — ${total} for ${stale.customerName || 'unknown customer'}, sent ${stale.ageDays} days ago with no reply.`);
  }
  const stuck = facts.openJobs.slice().sort((a, b) => b.ageDays - a.ageDays)[0];
  if (stuck && stuck.ageDays > 0) {
    picks.push(`Look at job ${stuck.ro || stuck.id} — open ${stuck.ageDays} days (${stuck.customerName || 'unknown customer'}${stuck.vehicleLabel ? `, ${stuck.vehicleLabel}` : ''}, status ${stuck.status}).`);
  }
  return picks.slice(0, 3);
}

export function buildMorningBriefAnswer(facts: MorningBriefFacts, today: string): string {
  const stale = facts.awaitingEstimates.filter(e => e.stale);
  const owedInvoices = facts.owedGroups.flatMap(g => g.invoices);
  const overdue = owedInvoices.filter(i => i.daysOverdue > 0);
  const lines: string[] = [
    `Morning brief for ${today}:`,
    `  • ${facts.openJobs.length} open job${facts.openJobs.length === 1 ? '' : 's'}`,
    `  • ${stale.length} stale estimate${stale.length === 1 ? '' : 's'} (sent ${STALE_ESTIMATE_DAYS}+ days ago, no reply)`,
    `  • ${owedInvoices.length} unpaid invoice${owedInvoices.length === 1 ? '' : 's'}${overdue.length ? `, ${overdue.length} overdue` : ''}`,
  ];
  const picks = pickStartWith(facts);
  if (picks.length) {
    lines.push('\nStart with these:');
    picks.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
  } else {
    lines.push('\nNothing is overdue, stale, or stuck — a clean board.');
  }
  return lines.join('\n');
}

// ── Vehicle history ──────────────────────────────────────────────────────────

export function buildVehicleHistoryAnswer(history: VehicleHistory): string {
  const v = history.vehicle;
  if (history.events.length === 0) {
    return `No past work on file for ${v.label || 'this vehicle'}${v.plate ? ` (plate ${v.plate})` : ''} yet.`;
  }
  const lines: string[] = [
    `History for ${v.label || 'vehicle'}${v.plate ? ` (plate ${v.plate})` : ''}${v.customerName ? ` — ${v.customerName}` : ''}, most recent first:`,
  ];
  for (const ev of history.events) {
    lines.push(`  • ${dateOnly(ev.date)} — ${ev.summary} [${ev.reference}${ev.status ? `, ${ev.status}` : ''}]`);
  }
  if (history.declinedEstimates.length) {
    lines.push(`\nDeclined work on this vehicle: ${history.declinedEstimates.map(e => `estimate ${e.number}${e.total != null ? ` (${formatMoney(e.total, e.currency)})` : ''}`).join('; ')}.`);
  }
  return lines.join('\n');
}

// ── Follow-up drafts (deterministic fallback) ────────────────────────────────

export function draftEstimateFollowUp(e: EstimateFact, shopName: string): string {
  const total = e.total != null ? ` (${formatMoney(e.total, e.currency)})` : '';
  const vehicle = e.vehicleLabel ? ` for your ${e.vehicleLabel}` : '';
  const shop = shopName || 'the shop';
  return `Hi ${e.customerName || 'there'}, this is ${shop} following up on estimate ${e.number}${total}${vehicle}, which we sent on ${dateOnly(e.sentAt ?? e.createdAt)}. We wanted to check you received it and answer any questions before you decide. If you'd like, we can also talk through a lower-cost option. Just reply here or call the shop — thank you.`;
}

export function draftInvoiceFollowUp(inv: OwedInvoiceFact, shopName: string): string {
  const shop = shopName || 'the shop';
  const due = inv.dueDate
    ? inv.daysOverdue > 0
      ? ` It was due on ${inv.dueDate} (${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} ago).`
      : ` It is due on ${inv.dueDate}.`
    : '';
  const paidNote = inv.paid > 0 ? ` We have received ${formatMoney(inv.paid, inv.currency)} so far.` : '';
  return `Hi ${inv.customerName || 'there'}, this is ${shop} with a friendly reminder about invoice ${inv.invoiceNumber}${inv.vehicleLabel ? ` for your ${inv.vehicleLabel}` : ''}. The remaining balance is ${formatMoney(inv.balance, inv.currency)}.${due}${paidNote} If you have already paid, please disregard this message. Otherwise, reply here and we can help with payment options — thank you.`;
}
