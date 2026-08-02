/**
 * Extracting Creem's provider ids, and not losing them again.
 *
 * Creem nests these as objects rather than flat *_id fields. Confirmed against
 * a real stored checkout.completed payload on 2026-08-02:
 *
 *   object.customer.id   cust_…
 *   object.order.id      ord_…
 *   object.product.id    prod_…
 *   object.metadata      { plan_id, shop_id, user_id, plan_key, billing_interval }
 *
 * The handler read data.customer_id and data.subscription_id, so both stored
 * empty. provider_subscription_id is the handle used to cancel, resume, change
 * plan and open the billing portal — an empty one means a paying customer
 * cannot cancel, which is a support problem and, in some jurisdictions, a
 * compliance one.
 *
 * checkout.completed carries NO subscription at all; that id first arrives on
 * the subscription.* events. So the second rule matters as much as the first:
 * an event that lacks an id must not overwrite one already stored.
 */

/** Mirrors asId() in app/api/billing/webhook/creem/route.ts. */
const asId = (v: unknown): string =>
  typeof v === 'string' ? v
  : (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string')
    ? (v as { id: string }).id
    : '';

/** Mirrors the conditional-spread update payload. */
function updatePayload(data: Record<string, unknown>) {
  const providerCustomerId     = asId(data.customer) || asId(data.customer_id);
  const providerSubscriptionId = asId(data.subscription) || asId(data.subscription_id);
  return {
    plan_key: 'starter',
    status:   'active',
    ...(providerCustomerId     ? { provider_customer_id:     providerCustomerId }     : {}),
    ...(providerSubscriptionId ? { provider_subscription_id: providerSubscriptionId } : {}),
    ...(data.current_period_start ? { current_period_start: 'set' } : {}),
  };
}

describe('provider id extraction', () => {
  it('reads the customer id from the nested object Creem sends', () => {
    expect(asId({ id: 'cust_abc', email: 'x@y.z' })).toBe('cust_abc');
  });

  it('still accepts a plain string id, in case Creem flattens it', () => {
    expect(asId('cust_abc')).toBe('cust_abc');
  });

  it('yields empty for absent or malformed values rather than "undefined"', () => {
    expect(asId(undefined)).toBe('');
    expect(asId(null)).toBe('');
    expect(asId({ no_id: true })).toBe('');
    expect(asId(42)).toBe('');
  });
});

describe('a later event must not erase ids an earlier one stored', () => {
  it('checkout.completed writes the customer but never blanks the subscription', () => {
    // Real shape: customer present, no subscription, no period.
    const payload = updatePayload({ customer: { id: 'cust_abc' }, order: { id: 'ord_1' } });
    expect(payload.provider_customer_id).toBe('cust_abc');
    expect('provider_subscription_id' in payload).toBe(false);
    expect('current_period_start' in payload).toBe(false);
  });

  it('subscription.paid supplies the subscription id and the period', () => {
    const payload = updatePayload({
      customer: { id: 'cust_abc' },
      subscription: { id: 'sub_xyz' },
      current_period_start: '2026-08-02T00:00:00Z',
    });
    expect(payload.provider_subscription_id).toBe('sub_xyz');
    expect(payload.current_period_start).toBe('set');
  });

  it('an event carrying nothing writes only plan and status', () => {
    expect(Object.keys(updatePayload({})).sort()).toEqual(['plan_key', 'status']);
  });
});
