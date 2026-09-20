# Creem webhook: event handling, retry rules and idempotency

Applies to `app/api/billing/webhook/creem/route.ts`. This document is descriptive. **It contains a proposed
database migration as text only. Nothing here has been applied, and no migration file is part of the change that
added this document.**

## What each event becomes

Every event is classified first (`lib/billing/creemEvent.ts`), and only then does the handler look for a shop.

| Class | What it is | What the handler does |
|---|---|---|
| `redlined_subscription` | Carries Redlined1 checkout metadata (`shop_id`, `user_id`, `plan_key` or `plan_id`) | Links to a shop and applies it |
| `unattributed_subscription` | A subscription or subscription lifecycle event with **no** Redlined1 metadata | Held as unresolved (below); nothing is applied |
| `external_order` | A one-time order with no Redlined1 metadata (payment link, Creem dashboard) | Recorded as processed. It is not a Redlined1 subscription and there is no shop to find, so it is **not** an alert |
| `other` | Refunds, disputes, unknown types | Recorded as processed |

Events that must reach a shop are: `checkout.completed`, `subscription.created`, `subscription.active`,
`subscription.paid` (activation and renewal), `subscription.cancelled`/`canceled`/`expired`, and
`subscription.past_due`/`unpaid`.

## Finding the shop: never a guess

1. `metadata.shop_id`, and only if that shop exists.
2. Otherwise `metadata.user_id`, and only if that user belongs to **exactly one** shop.

A buyer in several shops is not assigned whichever membership row came first (the old behaviour). It is unresolved.

## Unresolved events, and how they are acknowledged

A subscription event that must reach a shop but cannot is stored with `processed = false` and
`error = 'UNRESOLVED_SHOP:<reason>'`, where the reason is one of `no_shop_metadata`, `shop_not_found`,
`no_membership`, `ambiguous_membership`. The vocabulary is fixed; nothing customer-supplied is ever written there.

* **Visible to the owner.** Billing Health already counts "error set and not processed" as *failed*, so these show in
  its webhook figures. `GET /api/admin/billing-health/unresolved` (platform owner only, read-only) lists them with the
  row id, event type, time, reason, a masked event reference and whether the event carried a shop or user id. It never
  returns the payload, an email, a customer id or a full provider id.
* **Acknowledged with HTTP 200.** The event's metadata does not change on retry, so a 5xx would only make Creem
  redeliver the same unresolvable event and raise the same alert each time.
* **Retried only when retrying can help.** A database failure while resolving or writing answers 5xx, so Creem
  redelivers, and the redelivery reuses the event's row (it does not add another).
* **A redelivery re-evaluates.** If the cause has been fixed (for example the buyer's membership corrected), a
  redelivery of the same event resolves it, reuses the same row, clears the error and applies it.
* **Nothing is applied to any shop while an event is unresolved.** If our own checkout identified the buyer
  (`metadata.user_id`), that buyer's own `profiles.plan` is still set, as it always was, and no shop record is touched.

## Subscription period

Read from the provider's own fields: `current_period_start_date` / `current_period_end_date` on `subscription.*`
events, and the same fields on the nested `subscription` of `checkout.completed`. The old names
(`current_period_start`/`current_period_end`) were never seen in a stored payload and are not read. A missing or
implausible date is stored as unknown (the columns are nullable) or, on an existing row, left as it was. It is never
guessed. Existing stored dates are not changed by this code; only future events write them.

The period is display data. Entitlement is `getPlanStatus(profiles.plan, profiles.trial_ends_at)`; no application code
and, as verified read-only on 2026-09-20, no database function, view, policy, trigger or generated column refers to it
(pg_cron is not installed, and the repository has no Vercel cron configuration or cron route). `lib/__tests__/creemWebhookRoute.test.ts` pins this.

## Idempotency: what is and is not guaranteed

**Guaranteed (sequential deliveries):**

* a redelivery of an already-processed event is skipped;
* a redelivery of an event that failed, or was left unresolved, **reuses** its `billing_events` row instead of adding one;
* every write is safe to repeat.

**Not guaranteed (overlapping deliveries):** the handler checks "does this event id exist?" and then inserts. That is a
read followed by a write made by the application, not an atomic operation. `billing_events` has no unique index on
`provider_event_id`, and `shop_subscriptions` has no unique constraint on `shop_id` (only its primary key). Two
deliveries that overlap can therefore both pass the check and both insert, leaving two event rows and, for a shop that
has no subscription yet, two subscription rows.

This is real, not theoretical: on a purchase, Creem sent `subscription.paid` and `checkout.completed` about one second
apart. Only a database constraint closes it. `lib/__tests__/creemWebhookRoute.test.ts` pins the current behaviour as a
**known limitation**, and separately shows the handler behaving correctly against a database that has the constraints.

### Proposed migration (NOT applied, NOT part of this change)

Review and approve separately. Pre-flight (read-only), both must return zero rows:

```sql
SELECT provider, provider_event_id, count(*) FROM public.billing_events
 WHERE provider_event_id IS NOT NULL AND provider_event_id <> '' GROUP BY 1, 2 HAVING count(*) > 1;
SELECT shop_id, count(*) FROM public.shop_subscriptions GROUP BY 1 HAVING count(*) > 1;
```

Then, outside a transaction (`CONCURRENTLY` cannot run inside one):

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS billing_events_provider_event_uniq
  ON public.billing_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL AND provider_event_id <> '';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS shop_subscriptions_shop_id_uniq
  ON public.shop_subscriptions (shop_id);
```

Rollback: `DROP INDEX CONCURRENTLY IF EXISTS billing_events_provider_event_uniq;` and
`DROP INDEX CONCURRENTLY IF EXISTS shop_subscriptions_shop_id_uniq;`

Before approving the second index, confirm nothing deliberately keeps several subscription rows for one shop
(`commercial/subscriptions/subscriptionService.ts` can insert a trial row when the licensing scaffold is switched on;
nothing calls it today). The handler already copes with the constraints: an insert that loses the race returns
`23505` and is treated as a duplicate (events) or applied to the row that won (subscriptions).
