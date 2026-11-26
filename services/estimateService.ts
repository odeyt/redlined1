/**
 * Compatibility wrapper. The estimate logic now lives in lib/domain/estimates.ts.
 *
 * Every screen keeps calling these functions exactly as before; they build a
 * domain context from the signed-in session and delegate. Server code (API v1)
 * must use lib/domain/estimates.ts directly.
 */
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { browserDeps } from '@/lib/domain/browserAdapter';
import { createEstimateDomain, type EstimateFull } from '@/lib/domain/estimates';
import { nextDocumentNumber } from './documentNumberService';

export type { EstimateLine, EstimateFull } from '@/lib/domain/estimates';

// The arithmetic lives in lib/domain/estimateMath.ts so the customer portal
// totals an estimate exactly as this screen does.
export { calculateEstimateTotals, type EstimateTotals } from '@/lib/domain/estimateMath';

async function domain() {
  return createEstimateDomain(await browserDeps());
}

export async function fetchEstimates(): Promise<EstimateFull[]> {
  return (await domain()).list();
}

export async function createEstimate(est: Omit<EstimateFull, 'id' | 'createdAt'>): Promise<EstimateFull> {
  return (await domain()).create(est);
}

export async function updateEstimate(id: string, updates: Partial<EstimateFull>): Promise<void> {
  return (await domain()).update(id, updates);
}

export async function approveEstimate(id: string): Promise<void> {
  await (await domain()).approve(id);

  // Outbound integrations stay here rather than in the domain layer, as with
  // customers: whether an API-initiated approval should reach them is a
  // separate decision. Both are fire-and-forget and never throw.
  try {
    const { publishEvent } = await import('@/intelligence/IntelligenceService');
    publishEvent('EstimateApproved', getShopId(), '', 'estimate', id);
  } catch { /* intelligence must never affect production */ }
  try {
    const { publishSapeleeEvent } = await import('@/lib/sapelee/publish');
    publishSapeleeEvent(supabase, {
      eventType: 'estimate.accepted',
      payload: { estimateId: id },
      shopId: getShopId(),
      aggregateType: 'estimate',
      aggregateId: id,
    });
  } catch { /* sapelee integration must never affect production */ }
}

export async function deleteEstimate(id: string): Promise<void> {
  return (await domain()).remove(id);
}

export async function nextEstimateNumber(): Promise<string> {
  return nextDocumentNumber('estimate');
}

export async function cloneEstimate(est: EstimateFull): Promise<EstimateFull> {
  const newNumber = await nextEstimateNumber();
  const clonedNotes = est.notes
    ? `[Cloned from ${est.estimateNumber}]\n${est.notes}`
    : `[Cloned from ${est.estimateNumber}]`;
  return createEstimate({
    estimateNumber: newNumber,
    customerName: est.customerName,
    customerId: est.customerId,
    vehicle: est.vehicle,
    jobCardId: est.jobCardId,
    status: 'Draft',
    lines: est.lines,
    discount: est.discount,
    shopSupplies: est.shopSupplies,
    taxRate: est.taxRate,
    notes: clonedNotes,
    validUntil: '',
    approvedDate: null,
    currency: est.currency,
  });
}
