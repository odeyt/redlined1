/**
 * Modules withheld because the database cannot support them yet.
 *
 * This is a third axis, separate from plan and role: not "has this shop paid
 * for it" or "is this person allowed", but "does it work at all".
 *
 * An audit on 2026-08-03 found 28 tables referenced in code that do not exist
 * in the database. Diagnostics is the module that cannot survive it — every
 * one of the thirteen tables it reads is absent, so the page fails on first
 * use. It is advertised on the Professional ($99/mo) and Business ($179/mo)
 * plan cards, and nobody had hit it only because no shop has ever held a paid
 * plan.
 *
 * Deliberately NOT listed:
 *
 *   ai (AI Copilot)      — its missing table, ai_usage_logs, is written to and
 *                          never read, so the feature works. What is lost is
 *                          usage metering, which is a cost-control problem, not
 *                          a broken module.
 *   repair-intelligence  — the repair_case_* tables it needs do exist; they
 *                          were merely unreadable by service_role until the
 *                          grants were restored the same day.
 *
 * Remove an entry here once its tables exist and the module has been exercised
 * against real data — not merely once the tables are created.
 *
 * See docs/missing-tables-audit-2026-08-03.md.
 */
export const UNAVAILABLE_MODULES = new Set<string>([
  'diagnostics',
]);

export function isModuleAvailable(moduleId: string): boolean {
  return !UNAVAILABLE_MODULES.has(moduleId);
}
