/**
 * Classification and parsing of Creem events, and the period reader. Pure functions; every value is synthetic.
 * Shapes follow key names read from stored production events. See lib/billing/creemEvent.ts and creemPeriod.ts.
 */
import {
  asId, classifyCreemEvent, eventMetadata, metadataOf, needsShop, parseEnvelope, parseUnresolvedReason, unresolvedError,
  UNRESOLVED_PREFIX, UNRESOLVED_REASON_TEXT,
} from '../billing/creemEvent';
import { parseProviderDate, readSubscriptionPeriod } from '../billing/creemPeriod';

describe('classifyCreemEvent', () => {
  const ours = { metadata: { shop_id: 'shop', user_id: 'user', plan_key: 'solo' } };

  it.each([
    ['any Redlined1 metadata key makes it ours: shop_id', 'checkout.completed', { metadata: { shop_id: 'x' } }, 'redlined_subscription'],
    ['user_id', 'subscription.paid', { metadata: { user_id: 'x' } }, 'redlined_subscription'],
    ['plan_key', 'subscription.paid', { metadata: { plan_key: 'solo' } }, 'redlined_subscription'],
    ['plan_id', 'subscription.paid', { metadata: { plan_id: 'solo' } }, 'redlined_subscription'],
    ['metadata only on the nested subscription', 'checkout.completed', { subscription: { id: 's', metadata: { user_id: 'x' } } }, 'redlined_subscription'],
    ['ours even when the order is one-time', 'checkout.completed', { ...ours, order: { type: 'onetime' } }, 'redlined_subscription'],
    ['a subscription lifecycle event with no metadata', 'subscription.paid', {}, 'unattributed_subscription'],
    ['a cancellation with no metadata', 'subscription.cancelled', {}, 'unattributed_subscription'],
    ['a checkout carrying a nested subscription object but no metadata', 'checkout.completed', { subscription: { id: 's' } }, 'unattributed_subscription'],
    ['a checkout carrying a subscription id string but no metadata', 'checkout.completed', { subscription: 'sub_1' }, 'unattributed_subscription'],
    ['a recurring product with no metadata', 'checkout.completed', { product: { billing_type: 'recurring' } }, 'unattributed_subscription'],
    ['an object that is itself a subscription', 'checkout.completed', { object: 'subscription' }, 'unattributed_subscription'],
    ['a one-time product with no metadata is an external order', 'checkout.completed', { product: { billing_type: 'onetime' }, order: { type: 'onetime' } }, 'external_order'],
    ['one-time known only from the order', 'checkout.completed', { order: { type: 'onetime' } }, 'external_order'],
    ['a refund is something else', 'refund.created', { object: 'refund' }, 'other'],
    ['a checkout of unknown kind with no subscription is not assumed to be one', 'checkout.completed', {}, 'other'],
  ] as const)('%s', (_name, type, data, expected) => {
    expect(classifyCreemEvent(type, data as Record<string, unknown>)).toBe(expected);
  });

  it('empty metadata values do not count as Redlined1 metadata', () => {
    expect(classifyCreemEvent('checkout.completed', { metadata: { shop_id: '', user_id: '' }, order: { type: 'onetime' } })).toBe('external_order');
  });

  it('eventMetadata reads the object\'s own metadata over the nested subscription\'s, and either alone', () => {
    const top = { metadata: { shop_id: 'top-shop', plan_key: 'solo' }, subscription: { metadata: { shop_id: 'nested-shop', user_id: 'nested-user' } } };
    expect(eventMetadata(top)).toEqual({ shop_id: 'top-shop', plan_key: 'solo', user_id: 'nested-user' });
    expect(eventMetadata({ subscription: { metadata: { user_id: 'u' } } })).toEqual({ user_id: 'u' });
    expect(eventMetadata({ metadata: { user_id: 'u' } })).toEqual({ user_id: 'u' });
    expect(eventMetadata({ subscription: 'sub_1' })).toEqual({});
  });

  it('classification and shop resolution read the same metadata, so they cannot disagree', () => {
    const nestedOnly = { subscription: { id: 's', metadata: { shop_id: 'x' } } };
    expect(classifyCreemEvent('checkout.completed', nestedOnly)).toBe('redlined_subscription');
    expect(eventMetadata(nestedOnly).shop_id).toBe('x');
  });

  it('non-string metadata values are ignored', () => {
    expect(metadataOf({ metadata: { shop_id: 7, user_id: null, plan_key: 'solo' } })).toEqual({ plan_key: 'solo' });
    expect(metadataOf({ metadata: 'nope' })).toEqual({});
    expect(metadataOf({})).toEqual({});
  });
});

describe('needsShop: which events must reach a shop\'s subscription record', () => {
  it.each([
    ['checkout.completed', 'redlined_subscription', true],
    ['subscription.paid', 'redlined_subscription', true],
    ['subscription.created', 'unattributed_subscription', true],
    ['subscription.active', 'redlined_subscription', true],
    ['subscription.cancelled', 'unattributed_subscription', true],
    ['subscription.canceled', 'redlined_subscription', true],
    ['subscription.expired', 'redlined_subscription', true],
    ['subscription.past_due', 'redlined_subscription', true],
    ['subscription.unpaid', 'redlined_subscription', true],
    ['checkout.completed', 'external_order', false],
    ['checkout.completed', 'other', false],
    ['refund.created', 'other', false],
    ['subscription.update', 'redlined_subscription', false],    // not an event this handler acts on
    ['subscription.trialing', 'unattributed_subscription', false],
  ] as const)('%s / %s -> %s', (type, cls, expected) => {
    expect(needsShop(type, cls)).toBe(expected);
  });
});

describe('unresolved-event vocabulary', () => {
  it('round-trips every reason, and stays in a fixed vocabulary', () => {
    for (const reason of Object.keys(UNRESOLVED_REASON_TEXT) as Array<keyof typeof UNRESOLVED_REASON_TEXT>) {
      expect(unresolvedError(reason)).toBe(`${UNRESOLVED_PREFIX}${reason}`);
      expect(parseUnresolvedReason(unresolvedError(reason))).toBe(reason);
    }
  });

  it('does not mistake an ordinary error, an unknown reason or nothing for an unresolved event', () => {
    expect(parseUnresolvedReason('shop_subscriptions insert failed: boom')).toBeNull();
    expect(parseUnresolvedReason('UNRESOLVED_SHOP:made_up')).toBeNull();
    expect(parseUnresolvedReason(null)).toBeNull();
    expect(parseUnresolvedReason('')).toBeNull();
  });
});

describe('envelope and ids', () => {
  it('reads the envelope Creem sends, and the older spellings', () => {
    expect(parseEnvelope({ id: 'evt_1', eventType: 'subscription.paid', object: { a: 1 } })).toEqual({ eventType: 'subscription.paid', providerEventId: 'evt_1', data: { a: 1 } });
    expect(parseEnvelope({ event_id: 'evt_2', type: 'x', data: { b: 2 } })).toEqual({ eventType: 'x', providerEventId: 'evt_2', data: { b: 2 } });
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
