/**
 * A customer approving or declining an estimate from their portal link.
 *
 * This used to be a browser-side `.update({ status }).eq('id', estimateId)`
 * through the anon client, with no session and no portal token. Either RLS
 * refused it — and the customer saw "Something went wrong" — or it didn't, and
 * anyone holding an estimate id could approve or decline it.
 *
 * Now the server decides, and it checks, in order:
 *   1. the portal token belongs to a customer
 *   2. the estimate exists AND belongs to that customer (else the same 404,
 *      so a guessed id reveals nothing)
 *   3. the estimate is still awaiting a decision — the update itself is
 *      conditional on that, so two clicks or two tabs cannot both win
 *
 * Pure apart from the store it is handed, so the rules are tested without a
 * database.
 */

import { AUDIT } from '@/lib/domain/audit';

export type EstimateAction = 'approve' | 'decline';

/** Statuses the portal offers Approve / Decline on. Matches PortalClient. */
export const ACTIONABLE_ESTIMATE_STATUSES: readonly string[] = ['Sent', 'Pending'];

const NEXT_STATUS: Record<EstimateAction, string> = { approve: 'Approved', decline: 'Declined' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PortalEstimateRecord {
  id: string;
  shopId: string;
  customerId: string | null;
  status: string;
  estimateNumber: string;
}

export interface EstimateActionStore {
  findCustomerIdByToken(token: string): Promise<string | null>;
  findEstimate(id: string): Promise<PortalEstimateRecord | null>;
  /** Applies `patch` only while the status is one of `fromStatuses`. Returns rows changed. */
  updateIfStatus(id: string, fromStatuses: readonly string[], patch: Record<string, unknown>): Promise<number>;
  audit(entry: {
    shopId: string;
    action: string;
    estimateId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }): Promise<void>;
}

export type EstimateActionResult =
  | { status: 200; body: { ok: true; status: string } }
  | { status: 400 | 404 | 500; body: { error: string } }
  | { status: 409; body: { error: string; status: string } };

export function parseEstimateActionRequest(body: unknown):
  | { ok: true; token: string; estimateId: string; action: EstimateAction }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const token = typeof b.token === 'string' ? b.token.trim() : '';
  const estimateId = typeof b.estimateId === 'string' ? b.estimateId.trim() : '';
  const action = b.action;
  if (!token || token.length > 200) return { ok: false, error: 'A valid portal link is required.' };
  if (!UUID.test(estimateId)) return { ok: false, error: 'A valid estimate is required.' };
  if (action !== 'approve' && action !== 'decline') return { ok: false, error: 'Action must be approve or decline.' };
  return { ok: true, token, estimateId, action };
}

const NOT_FOUND: EstimateActionResult = { status: 404, body: { error: 'Estimate not found.' } };

export async function applyEstimateAction(
  store: EstimateActionStore,
  body: unknown,
  now: Date = new Date(),
): Promise<EstimateActionResult> {
  const req = parseEstimateActionRequest(body);
  if (!req.ok) return { status: 400, body: { error: req.error } };

  const customerId = await store.findCustomerIdByToken(req.token);
  if (!customerId) return NOT_FOUND;

  const estimate = await store.findEstimate(req.estimateId);
  if (!estimate || estimate.customerId !== customerId) return NOT_FOUND;

  if (!ACTIONABLE_ESTIMATE_STATUSES.includes(estimate.status)) {
    return { status: 409, body: { error: 'This estimate has already been answered.', status: estimate.status } };
  }

  const next = NEXT_STATUS[req.action];
  // approved_date matches what the staff-side approveEstimate stamps.
  const patch: Record<string, unknown> = req.action === 'approve'
    ? { status: next, approved_date: now.toISOString() }
    : { status: next };

  const changed = await store.updateIfStatus(estimate.id, ACTIONABLE_ESTIMATE_STATUSES, patch);
  if (changed === 0) {
    // Lost a race: someone answered between the read and the write.
    const current = await store.findEstimate(estimate.id);
    return { status: 409, body: { error: 'This estimate has already been answered.', status: current?.status ?? estimate.status } };
  }

  // The decision has been made and stored; the audit row is the record of
  // who made it. Failing to write it must not undo or hide the customer's
  // answer, so it is reported to the server log rather than to them.
  try {
    await store.audit({
      shopId: estimate.shopId,
      action: req.action === 'approve' ? AUDIT.estimateApproved : AUDIT.estimateUpdated,
      estimateId: estimate.id,
      before: { status: estimate.status },
      after: { ...patch, source: 'customer_portal', estimateNumber: estimate.estimateNumber },
    });
  } catch (e) {
    console.error('[portal estimate-action] audit write failed', estimate.id, e);
  }

  return { status: 200, body: { ok: true, status: next } };
}
