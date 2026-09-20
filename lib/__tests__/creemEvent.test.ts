/**
 * Classification, decisions, metadata and plan rules for Creem events, and the period reader. Pure functions; every
 * value is synthetic. Shapes follow key names read from stored production events.
 * See lib/billing/creemEvent.ts, creemPlan.ts and creemPeriod.ts.
 */
import {
  asId, classifyCreemEvent, decideCreemEvent, metadataOf, parseEnvelope, parseUnresolvedReason, resolveEventMetadata, unresolvedError,
  BILLING_ELIGIBLE_ROLES, UNRESOLVED_PREFIX, UNRESOLVED_REASON_TEXT, type CreemEnvelope,
} from '../billing/creemEvent';
import { resolvePlan } from '../billing/creemPlan';
import { parseProviderDate, readSubscriptionPeriod } from '../billing/creemPeriod';

const env = (eventType: string, data: Record<string, unknown>, providerEventId = 'evt_1'): CreemEnvelope =>
  ({ eventType, providerEventId, data, objectMalformed: false });

describe('decideCreemEvent: apply, acknowledge quietly, or hold', () => {
  const ours = { metadata: { shop_id: 'shop', user_id: 'user', plan_key: 'solo' } };

  it.each([
    // ── applied ────────────────────────────────────────────────────────────────────────────────────────────
    ['our metadata on a checkout', 'checkout.completed', { metadata: { shop_id: 'x' } }, 'apply', 'redlined_subscription'],
    ['our user_id on a renewal', 'subscription.paid', { metadata: { user_id: 'x' } }, 'apply', 'redlined_subscription'],
    ['our plan_key', 'subscription.paid', { metadata: { plan_key: 'solo' } }, 'apply', 'redlined_subscription'],
    ['our plan_id', 'subscription.paid', { metadata: { plan_id: 'solo' } }, 'apply', 'redlined_subscription'],
    ['metadata only on the nested subscription', 'checkout.completed', { subscription: { id: 's', metadata: { user_id: 'x' } } }, 'apply', 'redlined_subscription'],
    ['ours even when the order says one-time', 'checkout.completed', { ...ours, order: { type: 'onetime' } }, 'apply', 'redlined_subscription'],
    ['a cancellation of ours', 'subscription.canceled', ours, 'apply', 'redlined_subscription'],
    ['a past-due of ours', 'subscription.past_due', ours, 'apply', 'redlined_subscription'],
    ['a subscription lifecycle event with no metadata is still applied, so it can be reported unresolved', 'subscription.paid', {}, 'apply', 'unattributed_subscription'],
    ['a checkout with a nested subscription but no metadata', 'checkout.completed', { subscription: { id: 's' } }, 'apply', 'unattributed_subscription'],
    ['a checkout with a subscription id string but no metadata', 'checkout.completed', { subscription: 'sub_1' }, 'apply', 'unattributed_subscription'],
    ['a recurring product with no metadata', 'checkout.completed', { product: { billing_type: 'recurring' } }, 'apply', 'unattributed_subscription'],
    // ── acknowledged quietly: ONLY a positively identified external one-time order ─────────────────────────
    ['a one-time product with no metadata', 'checkout.completed', { product: { billing_type: 'onetime' }, order: { type: 'onetime' } }, 'acknowledge', 'external_order'],
    ['one-time known only from the order', 'checkout.completed', { order: { type: 'onetime' } }, 'acknowledge', 'external_order'],
    ['an order.* event that is one-time', 'order.paid', { order: { type: 'onetime' } }, 'acknowledge', 'external_order'],
    // ── held ───────────────────────────────────────────────────────────────────────────────────────────────
    ['a checkout of no recognisable kind is NOT assumed to be an external order', 'checkout.completed', {}, 'hold', 'malformed'],
    ['a checkout whose billing type is unknown', 'checkout.completed', { order: { type: 'weird' } }, 'hold', 'malformed'],
    ['a refund', 'refund.created', { order: { type: 'onetime' } }, 'hold', 'refund_or_dispute'],
    ['a dispute', 'dispute.created', {}, 'hold', 'refund_or_dispute'],
    ['a chargeback spelled as an event on the checkout', 'checkout.chargeback', {}, 'hold', 'refund_or_dispute'],
    ['a subscription update (an upgrade) with our metadata', 'subscription.update', ours, 'hold', 'unhandled_subscription'],
    ['a subscription event with no metadata that is not a handled type', 'subscription.trialing', {}, 'hold', 'unhandled_subscription'],
    ['one-time-shaped but an unknown type is not quietly acknowledged', 'customer.created', { order: { type: 'onetime' } }, 'hold', 'unknown'],
    ['a non-subscription event with our metadata that we do not handle', 'checkout.expired', ours, 'hold', 'unknown'],
    ['an unknown type with nothing else', 'something.else', {}, 'hold', 'unknown'],
  ] as const)('%s', (_name, type, data, action, cls) => {
    const d = decideCreemEvent(env(type, data as Record<string, unknown>));
    expect(d.action).toBe(action);
    expect(d.eventClass).toBe(cls);
  });

  it.each([
    ['no event type', { ...env('', ours) }, 'missing_event_type'],
    ['no event id', { ...env('subscription.paid', ours, '') }, 'missing_event_id'],
    ['an unreadable object', { ...env('checkout.completed', {}), objectMalformed: true }, 'malformed_object'],
  ] as const)('holds an event with %s, even one that would otherwise be applied', (_n, e, reason) => {
    expect(decideCreemEvent(e)).toEqual({ action: 'hold', eventClass: 'malformed', reason });
  });

  it('holds a refund or unhandled subscription event with the right reason', () => {
    expect(decideCreemEvent(env('refund.created', {}))).toEqual({ action: 'hold', eventClass: 'refund_or_dispute', reason: 'refund_or_dispute' });
    expect(decideCreemEvent(env('subscription.update', ours))).toEqual({ action: 'hold', eventClass: 'unhandled_subscription', reason: 'unhandled_subscription_event' });
    expect(decideCreemEvent(env('checkout.completed', {}))).toEqual({ action: 'hold', eventClass: 'malformed', reason: 'malformed_checkout' });
    expect(decideCreemEvent(env('nope.nope', {}))).toEqual({ action: 'hold', eventClass: 'unknown', reason: 'unknown_event_type' });
  });

  it('empty metadata values do not make an order ours', () => {
    expect(decideCreemEvent(env('checkout.completed', { metadata: { shop_id: '', user_id: '  ' }, order: { type: 'onetime' } })).action).toBe('acknowledge');
  });

  it('classifyCreemEvent reports the class of a stored event', () => {
    expect(classifyCreemEvent('subscription.paid', ours)).toBe('redlined_subscription');
    expect(classifyCreemEvent('checkout.completed', { order: { type: 'onetime' } })).toBe('external_order');
    expect(classifyCreemEvent('refund.created', {})).toBe('refund_or_dispute');
  });
});

describe('resolveEventMetadata: ONE coherent source, and a conflict is never merged', () => {
  const A = { shop_id: 'shop-a', user_id: 'user-a', plan_key: 'solo', plan_id: 'solo' };

  it('finds no Redlined1 metadata, and ignores keys that are not ours', () => {
    expect(resolveEventMetadata({})).toEqual({ kind: 'none' });
    expect(resolveEventMetadata({ metadata: { note: 'x' }, subscription: { metadata: { other: 'y' } } })).toEqual({ kind: 'none' });
    expect(resolveEventMetadata({ subscription: 'sub_1' })).toEqual({ kind: 'none' });
  });

  it('reads the object\'s own metadata, or the nested subscription\'s, whole and from one place', () => {
    expect(resolveEventMetadata({ metadata: A })).toEqual({ kind: 'ok', meta: A, source: 'object' });
    expect(resolveEventMetadata({ subscription: { metadata: A } })).toEqual({ kind: 'ok', meta: A, source: 'subscription' });
  });

  it('accepts the same metadata in both places', () => {
    expect(resolveEventMetadata({ metadata: A, subscription: { metadata: { ...A, extra: 'ignored-in-comparison' } } })).toMatchObject({ kind: 'ok', source: 'object' });
  });

  it.each([
    ['a different shop', { metadata: A, subscription: { metadata: { ...A, shop_id: 'shop-b' } } }],
    ['a different buyer', { metadata: A, subscription: { metadata: { ...A, user_id: 'user-b' } } }],
    ['a different plan', { metadata: A, subscription: { metadata: { ...A, plan_key: 'business' } } }],
    ['a key on one side only (never key-wise merged)', { metadata: { shop_id: 'shop-a' }, subscription: { metadata: { user_id: 'user-a' } } }],
    ['an extra identifying key on one side', { metadata: A, subscription: { metadata: { shop_id: 'shop-a', user_id: 'user-a' } } }],
  ])('rejects %s as a conflict', (_n, data) => {
    expect(resolveEventMetadata(data as Record<string, unknown>)).toEqual({ kind: 'conflict' });
  });

  it('non-string values are ignored and empty values do not count', () => {
    expect(metadataOf({ metadata: { shop_id: 7, user_id: null, plan_key: 'solo' } })).toEqual({ plan_key: 'solo' });
    expect(metadataOf({ metadata: 'nope' })).toEqual({});
    expect(metadataOf({})).toEqual({});
    expect(resolveEventMetadata({ metadata: { shop_id: '', user_id: '' } })).toEqual({ kind: 'none' });
  });
});

describe('resolvePlan: never a default', () => {
  const OLD = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (k.startsWith('CREEM_') && k.endsWith('_PRODUCT_ID')) delete process.env[k];
    Object.assign(process.env, OLD);
  });

  it.each([
    ['solo', { plan_key: 'solo' }], ['starter', { plan_id: 'starter' }], ['professional', { plan_key: 'professional', plan_id: 'professional' }],
    ['business', { plan_key: 'Business' }],
  ])('accepts %s', (plan, meta) => {
    expect(resolvePlan(meta, {})).toEqual({ kind: 'plan', planKey: plan });
  });

  it('a missing plan is unresolved, NEVER professional', () => {
    expect(resolvePlan({ shop_id: 's', user_id: 'u' }, {})).toEqual({ kind: 'unresolved', reason: 'plan_missing' });
    expect(resolvePlan({}, {})).toEqual({ kind: 'unresolved', reason: 'plan_missing' });
  });

  it.each([['platinum'], ['pro'], ['free'], ['trial'], ['enterprise'], ['__proto__'], ['constructor']])('an unknown or unsellable plan "%s" is unresolved', p => {
    expect(resolvePlan({ plan_key: p }, {})).toEqual({ kind: 'unresolved', reason: 'plan_unknown' });
  });

  it('plan_key and plan_id that disagree are a conflict, not a choice', () => {
    expect(resolvePlan({ plan_key: 'solo', plan_id: 'business' }, {})).toEqual({ kind: 'unresolved', reason: 'plan_conflict' });
  });

  describe('against the product actually purchased (the existing CREEM_*_PRODUCT_ID variables)', () => {
    beforeEach(() => {
      process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_solo_m';
      process.env.CREEM_SOLO_ANNUAL_PRODUCT_ID = 'prod_solo_a';
      process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_biz_m';
    });

    it('accepts a product that matches the plan, monthly or annual', () => {
      expect(resolvePlan({ plan_key: 'solo' }, { product: { id: 'prod_solo_m' } })).toEqual({ kind: 'plan', planKey: 'solo' });
      expect(resolvePlan({ plan_key: 'solo' }, { product: 'prod_solo_a' })).toEqual({ kind: 'plan', planKey: 'solo' });
    });

    it('a product of ANOTHER plan than the metadata says is a conflict (a renewal after a plan change is not written back as the old plan)', () => {
      expect(resolvePlan({ plan_key: 'solo' }, { product: { id: 'prod_biz_m' } })).toEqual({ kind: 'unresolved', reason: 'plan_conflict' });
    });

    it('a product Redlined1 does not sell is unknown', () => {
      expect(resolvePlan({ plan_key: 'solo' }, { product: { id: 'prod_from_somewhere_else' } })).toEqual({ kind: 'unresolved', reason: 'plan_unknown' });
    });

    it('two different products on the object and its subscription are a conflict', () => {
      expect(resolvePlan({ plan_key: 'solo' }, { product: { id: 'prod_solo_m' }, subscription: { product: { id: 'prod_biz_m' } } })).toEqual({ kind: 'unresolved', reason: 'plan_conflict' });
    });

    it('an event that names no product relies on the validated metadata', () => {
      expect(resolvePlan({ plan_key: 'solo' }, {})).toEqual({ kind: 'plan', planKey: 'solo' });
    });

    it('one product id configured for two plans is ambiguous, never assumed', () => {
      process.env.CREEM_STARTER_MONTHLY_PRODUCT_ID = 'prod_solo_m';
      expect(resolvePlan({ plan_key: 'solo' }, { product: { id: 'prod_solo_m' } })).toEqual({ kind: 'unresolved', reason: 'plan_conflict' });
    });
  });

  it('with no product ids configured there is nothing to compare, and the validated metadata stands', () => {
    expect(resolvePlan({ plan_key: 'solo' }, { product: { id: 'anything' } })).toEqual({ kind: 'plan', planKey: 'solo' });
  });
});

describe('billing-eligible roles are an allowlist', () => {
  it('accepts owner and manager only', () => {
    expect([...BILLING_ELIGIBLE_ROLES].sort()).toEqual(['manager', 'owner']);
    for (const r of ['technician', 'advisor', '', 'admin', 'Owner', 'superuser']) expect(BILLING_ELIGIBLE_ROLES.has(r)).toBe(false);
  });
});

describe('unresolved-event vocabulary', () => {
  it('round-trips every reason, has text for each, and stays in a fixed vocabulary', () => {
    for (const reason of Object.keys(UNRESOLVED_REASON_TEXT) as Array<keyof typeof UNRESOLVED_REASON_TEXT>) {
      expect(unresolvedError(reason)).toBe(`${UNRESOLVED_PREFIX}${reason}`);
      expect(parseUnresolvedReason(unresolvedError(reason))).toBe(reason);
      expect(UNRESOLVED_REASON_TEXT[reason].length).toBeGreaterThan(10);
    }
  });

  it('does not mistake an ordinary error, an unknown reason or nothing for an unresolved event', () => {
    expect(parseUnresolvedReason('shop_subscriptions insert failed: boom')).toBeNull();
    expect(parseUnresolvedReason('UNRESOLVED:made_up')).toBeNull();
    expect(parseUnresolvedReason('UNRESOLVED_SHOP:no_shop_metadata')).toBeNull();
    expect(parseUnresolvedReason(null)).toBeNull();
    expect(parseUnresolvedReason('')).toBeNull();
  });
});

describe('envelope and ids', () => {
  it('reads the envelope Creem sends, and the older spellings', () => {
    expect(parseEnvelope({ id: 'evt_1', eventType: 'subscription.paid', object: { a: 1 } })).toEqual({ eventType: 'subscription.paid', providerEventId: 'evt_1', data: { a: 1 }, objectMalformed: false });
    expect(parseEnvelope({ event_id: 'evt_2', type: 'x', data: { b: 2 } })).toEqual({ eventType: 'x', providerEventId: 'evt_2', data: { b: 2 }, objectMalformed: false });
  });

  it('a missing type or id is empty, never the text "undefined" or "[object Object]"', () => {
    expect(parseEnvelope({ object: {} })).toMatchObject({ eventType: '', providerEventId: '' });
    expect(parseEnvelope({ id: { nope: 1 }, eventType: ['x'], object: {} })).toMatchObject({ eventType: '', providerEventId: '' });
    expect(parseEnvelope({ id: 42, eventType: 'x', object: {} })).toMatchObject({ providerEventId: '42' });
  });

  it('an object that is present but not an object is malformed, and is never read as data', () => {
    for (const bad of ['text', 7, ['a'], true]) {
      expect(parseEnvelope({ id: 'e', eventType: 'checkout.completed', object: bad })).toMatchObject({ objectMalformed: true, data: {} });
    }
    expect(parseEnvelope({ id: 'e', eventType: 'checkout.completed' })).toMatchObject({ objectMalformed: false });
  });

  it('reads nested or flat provider ids, and never "undefined"', () => {
    expect(asId({ id: 'cus_1' })).toBe('cus_1');
    expect(asId('cus_2')).toBe('cus_2');
    expect(asId(undefined)).toBe('');
    expect(asId({ nope: 1 })).toBe('');
  });
});

describe('readSubscriptionPeriod', () => {
  const S = '2026-09-01T00:00:00.000Z';
  const E = '2026-10-01T00:00:00.000Z';

  it('reads the fields a subscription.* event carries', () => {
    const p = readSubscriptionPeriod({ current_period_start_date: S, current_period_end_date: E });
    expect(p.start?.toISOString()).toBe(S);
    expect(p.end?.toISOString()).toBe(E);
  });

  it('reads them from the nested subscription on checkout.completed', () => {
    const p = readSubscriptionPeriod({ subscription: { current_period_start_date: S, current_period_end_date: E } });
    expect(p.end?.toISOString()).toBe(E);
  });

  it('prefers the object\'s own fields over the nested ones', () => {
    const p = readSubscriptionPeriod({ current_period_end_date: E, subscription: { current_period_end_date: '2030-01-01T00:00:00.000Z' } });
    expect(p.end?.toISOString()).toBe(E);
  });

  it('does not read the old, never-observed names', () => {
    expect(readSubscriptionPeriod({ current_period_start: S, current_period_end: E })).toEqual({ start: null, end: null });
  });

  it('yields null for a missing period rather than inventing one', () => {
    expect(readSubscriptionPeriod({})).toEqual({ start: null, end: null });
    expect(readSubscriptionPeriod({ subscription: 'sub_1' })).toEqual({ start: null, end: null });
  });

  it('reads one side without the other', () => {
    const p = readSubscriptionPeriod({ current_period_end_date: E });
    expect(p.start).toBeNull();
    expect(p.end?.toISOString()).toBe(E);
  });

  it('drops a period that ends before it starts', () => {
    expect(readSubscriptionPeriod({ current_period_start_date: E, current_period_end_date: S })).toEqual({ start: null, end: null });
  });
});

describe('parseProviderDate', () => {
  it('accepts ISO strings, epoch seconds and epoch milliseconds', () => {
    expect(parseProviderDate('2026-09-01T00:00:00Z')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(parseProviderDate(1788220800)?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(parseProviderDate(1788220800000)?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it.each([[''], ['   '], ['garbage'], [null], [undefined], [NaN], [Infinity], [{}], [[]], ['1970-01-01T00:00:00Z'], ['2500-01-01T00:00:00Z'], [0]])(
    'rejects %p', v => { expect(parseProviderDate(v)).toBeNull(); });
});
