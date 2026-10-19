/**
 * A customer approving or declining an estimate from their portal link.
 *
 * This used to be a browser-side `.update({ status }).eq('id', estimateId)`
 * through the anon client, with no session and no portal token. Either RLS
 * refused it — and the customer saw "Something went wrong" — or it didn't, and
 * anyone holding an estimate id could approve or decline it.
 *
 * Now the server decides, and it checks, in order:
 *   1. the token is well formed and belongs to a customer, with their shop
 *   2. the estimate exists AND belongs to that customer AND a shop in their
 *      portal scope (their own shop, or the shop it was merged into/from —
 *      lib/portal/portalScope.ts)
 *   3. the estimate is still awaiting a decision — the update itself is
 *      conditional on that (and on customer and shop), so two clicks or two
 *      tabs cannot both win
 * A malformed token or id, an unknown token, and a missing or someone
 * else's estimate all get the same 404, so a guess reveals nothing.
 *
 * Pure apart from the store it is handed, so the rules are tested without a
 * database.
 */

import { AUDIT } from '@/lib/domain/audit';
import { isWellFormedPortalToken } from './portalToken';

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
  /** The customer and shop a well-formed token belongs to, or null. */
  findCustomerByToken(token: string): Promise<{ id: string; shopId: string } | null>;
  /**
   * The shops this customer's documents may live in (portalShopScope). When
   * absent, only the customer's own shop — the behaviour before the merge.
   */
  findScope?(customer: { id: string; shopId: string }): Promise<string[]>;
  findEstimate(id: string): Promise<PortalEstimateRecord | null>;
  /**
   * Applies `patch` to the estimate with this id, customer and shop, only
   * while its status is one of `fromStatuses`. Returns rows changed.
   */
  updateIfStatus(
    scope: { id: string; customerId: string; shopId: string },
    fromStatuses: readonly string[],
    patch: Record<string, unknown>,
  ): Promise<number>;
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

/**
 * Only the action is a 400. A malformed token or estimate id is answered
 * exactly like an unknown one (404), so the shape of a guess reveals nothing.
 */
export function parseEstimateActionRequest(body: unknown):
  | { ok: true; token: string; estimateId: string; action: EstimateAction }
  | { ok: false; status: 400 | 404; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const action = b.action;
  if (action !== 'approve' && action !== 'decline') return { ok: false, status: 400, error: 'Action must be approve or decline.' };
  const token = b.token;
  const estimateId = b.estimateId;
  if (!isWellFormedPortalToken(token) || typeof estimateId !== 'string' || !UUID.test(estimateId)) {
    return { ok: false, status: 404, error: NOT_FOUND_MESSAGE };
  }
  return { ok: true, token, estimateId, action };
}

const NOT_FOUND_MESSAGE = 'Estimate not found.';
const NOT_FOUND: EstimateActionResult = { status: 404, body: { error: NOT_FOUND_MESSAGE } };

export async function applyEstimateAction(
  store: EstimateActionStore,
  body: unknown,
  now: Date = new Date(),
): Promise<EstimateActionResult> {
  const req = parseEstimateActionRequest(body);
  if (!req.ok) return req.status === 400 ? { status: 400, body: { error: req.error } } : NOT_FOUND;

  const customer = await store.findCustomerByToken(req.token);
  if (!customer) return NOT_FOUND;

  // Same customer AND a shop in their portal scope: a record carrying this
  // customer's id under any other shop is not theirs to answer.
  const scope = store.findScope ? await store.findScope(customer) : [customer.shopId];
  const estimate = await store.findEstimate(req.estimateId);
  if (!estimate || estimate.customerId !== customer.id || !scope.includes(estimate.shopId)) return NOT_FOUND;

  if (!ACTIONABLE_ESTIMATE_STATUSES.includes(estimate.status)) {
    return { status: 409, body: { error: 'This estimate has already been answered.', status: estimate.status } };
  }

  const next = NEXT_STATUS[req.action];
  // approved_date matches what the staff-side approveEstimate stamps.
  const patch: Record<string, unknown> = req.action === 'approve'
    ? { status: next, approved_date: now.toISOString() }
    : { status: next };

  const changed = await store.updateIfStatus(
    // The estimate's own shop, already checked to be in scope.
    { id: estimate.id, customerId: customer.id, shopId: estimate.shopId },
    ACTIONABLE_ESTIMATE_STATUSES,
    patch,
  );
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
