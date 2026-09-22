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

// The REAL id reader the route uses (this file used to keep its own copy).
import { asId } from '../billing/creemEvent';

// The "a later event must not erase an id or period an earlier one stored" rules used to be tested here against a
// copy of the route's update logic, and that copy read a period field name Creem does not send. They are now tested
// against the real route in creemWebhookRoute.test.ts ("an event that carries no period leaves an existing stored
// period exactly as it was", and the renewal tests, which check the stored ids after each event).

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

