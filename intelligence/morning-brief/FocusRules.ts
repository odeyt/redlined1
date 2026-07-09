// SI-7: Morning Brief — Recommended Focus Rules
// Deterministic priority order. No AI. No external calls.

const CASH_COLLECTION_THRESHOLD = 500;    // USD
const STALE_ESTIMATE_THRESHOLD  = 1000;   // USD
const LOW_INVENTORY_THRESHOLD   = 5;      // items

export function determineFocus(signals: Record<string, number | null>): string {
  const overdueTotal           = signals.overdue_invoice_total        ?? 0;
  const completedNotInvoiced   = signals.completed_not_invoiced_count ?? 0;
  const staleEstimateTotal     = signals.stale_estimate_total         ?? 0;
  const stuckJobCount          = signals.stuck_job_count              ?? 0;
  const lowInventoryCount      = signals.low_inventory_count          ?? 0;
  const repairCasesToday       = signals.repair_cases_created_today   ?? 0;
  const unpaidTotal            = signals.unpaid_invoice_total         ?? 0;
  const approvedNotScheduled   = signals.approved_not_scheduled_count ?? 0;

  // 1. Overdue cash — highest urgency
  if (overdueTotal > CASH_COLLECTION_THRESHOLD) {
    const amt = formatMoney(overdueTotal);
    return `Collect overdue invoices — ${amt} is past due. Call customers before noon for same-day payment.`;
  }

  // 2. Completed work sitting uninvoiced — immediate lost revenue
  if (completedNotInvoiced > 0) {
    const jobs = completedNotInvoiced === 1 ? '1 completed job' : `${completedNotInvoiced} completed jobs`;
    return `Invoice ${jobs} that are done but not yet billed. This is revenue already earned — collect it today.`;
  }

  // 3. High unpaid total even if not overdue yet
  if (unpaidTotal > CASH_COLLECTION_THRESHOLD * 3) {
    return `Chase unpaid invoices — ${formatMoney(unpaidTotal)} is outstanding. Follow up with customers today.`;
  }

  // 4. Stale estimates losing to inaction
  if (staleEstimateTotal > STALE_ESTIMATE_THRESHOLD) {
    return `Follow up on stale estimates — ${formatMoney(staleEstimateTotal)} in approved work is waiting. Reach out to convert.`;
  }

  // 5. Approved estimates not scheduled
  if (approvedNotScheduled > 0) {
    return `Schedule ${approvedNotScheduled} approved estimate${approvedNotScheduled > 1 ? 's' : ''} — customers have said yes, now book the work.`;
  }

  // 6. Blocked repair flow
  if (stuckJobCount > 0) {
    return `Unblock ${stuckJobCount} stuck repair order${stuckJobCount > 1 ? 's' : ''} — investigate what is causing delays and assign a technician.`;
  }

  // 7. Inventory risk
  if (lowInventoryCount > LOW_INVENTORY_THRESHOLD) {
    return `Restock low inventory — ${lowInventoryCount} parts are below minimum. Order critical items before jobs are delayed.`;
  }

  // 8. Knowledge capture lagging
  if (repairCasesToday === 0) {
    return `Capture repair knowledge today — log at least one repair case to build the shop's diagnostic database.`;
  }

  // 9. All clear
  return `Maintain momentum — no urgent issues detected. Focus on quality work and follow up with customers from recent completed jobs.`;
}

function formatMoney(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
