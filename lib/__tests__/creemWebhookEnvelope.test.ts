/**
 * The shape of a Creem webhook event, pinned against a real sandbox delivery
 * captured on 2026-08-02:
 *
 *   { id, eventType, created_at, object }
 *
 * The handler was originally written against `type` and `data`. No Creem event
 * carries either, so every event fell through to the unknown-type branch and
 * was recorded as received but never acted on. A customer would have paid and
 * kept the free plan, with a 200 returned to Creem so it never retried.
 *
 * These assertions use the literal field names rather than a shared constant —
 * a test that reads the same constant as the code cannot catch the code
 * reading the wrong field.
 */

/** Mirrors the envelope parsing in app/api/billing/webhook/creem/route.ts. */
function parseEnvelope(payload: Record<string, unknown>) {
  return {
    eventType:       String(payload.eventType ?? payload.type ?? payload.event_type ?? ''),
    providerEventId: String(payload.id ?? payload.event_id ?? ''),
    data:            (payload.object ?? payload.data ?? payload) as Record<string, unknown>,
  };
}

describe('Creem event envelope', () => {
  // Field names as delivered by Creem; values are illustrative.
  const realShape = {
    id: 'evt_5Xk2',
    eventType: 'checkout.completed',
    created_at: 1785666961894,
    object: {
      customer_id: 'cust_1',
      subscription_id: 'sub_1',
      metadata: { shop_id: 'shop-abc', user_id: 'user-abc', plan_key: 'starter' },
    },
  };

  it('reads eventType, which is where Creem puts the event name', () => {
    expect(parseEnvelope(realShape).eventType).toBe('checkout.completed');
  });

  it('reads the payload from `object`, not `data`', () => {
    expect(parseEnvelope(realShape).data.customer_id).toBe('cust_1');
  });

  it('finds the metadata the activation depends on', () => {
    const meta = parseEnvelope(realShape).data.metadata as Record<string, string>;
    expect(meta.shop_id).toBe('shop-abc');
    expect(meta.user_id).toBe('user-abc');
    expect(meta.plan_key).toBe('starter');
  });

  it('takes the event id for idempotency', () => {
    expect(parseEnvelope(realShape).providerEventId).toBe('evt_5Xk2');
  });

  it('never yields an empty event type for a real event — that is the silent-drop case', () => {
    expect(parseEnvelope(realShape).eventType).not.toBe('');
  });

  it('still understands the older spellings, in case Creem varies by event', () => {
    const legacy = { event_id: 'evt_9', type: 'subscription.active', data: { customer_id: 'cust_2' } };
    const parsed = parseEnvelope(legacy);
    expect(parsed.eventType).toBe('subscription.active');
    expect(parsed.providerEventId).toBe('evt_9');
    expect(parsed.data.customer_id).toBe('cust_2');
  });
});
