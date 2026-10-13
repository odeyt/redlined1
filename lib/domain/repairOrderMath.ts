/**
 * Repair order arithmetic. Pure — no database, no browser client.
 *
 * Moved out of services/repairOrderService.ts (which re-exports it) so the
 * customer portal, a server component, totals a repair order the same way the
 * staff screen does.
 */
export function calcPartsTotal(parts: ReadonlyArray<{ qty: number; unitCost: number }>): number {
  return parts.reduce((s, p) => s + p.qty * p.unitCost, 0);
}

export function calcROTotal(ro: {
  laborHours: number;
  laborRate: number;
  partsTotal: number;
  parts?: ReadonlyArray<{ qty: number; unitCost: number }>;
}): number {
  const live = ro.parts && ro.parts.length > 0 ? calcPartsTotal(ro.parts) : ro.partsTotal;
  return ro.laborHours * ro.laborRate + live;
}
