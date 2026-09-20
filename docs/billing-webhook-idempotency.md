# Creem webhook: event handling, buyer proof, ordering and idempotency

Applies to `app/api/billing/webhook/creem/route.ts`. This document is descriptive. **It contains proposed database
changes as text only. Nothing here has been applied, and no migration file is part of the change that added or revised
this document.** The signature verification block of the route and the production billing configuration are unchanged.

## The rule: apply it, acknowledge it quietly, or hold it

Every event is decided first (`decideCreemEvent` in `lib/billing/creemEvent.ts`), before any shop is looked at.

| Decision | Which events | What the handler does |
|---|---|---|
| **apply** | Subscription lifecycle events: `checkout.completed`, `subscription.created`/`active`/`paid` (activation, renewal), `subscription.cancelled`/`canceled`/`expired`, `subscription.past_due`/`unpaid` | Proves the buyer and shop (below), resolves the plan (below), and only then changes anything |
| **acknowledge quietly** | **Only** a positively identified external one-time order: `checkout.completed` or `order.*`, billing type `onetime`, no Redlined1 metadata, nothing subscription-shaped | Recorded as processed. No alert: it is not a Redlined1 subscription and has no shop |
| **hold** | Everything else | Recorded as `processed = false`, `error = 'UNRESOLVED:<reason>'`, acknowledged with HTTP 200, alerted once, listed for the owner |

Held classes and their reasons:

| Reason | What it means |
|---|---|
| `missing_event_type` / `missing_event_id` | No type, or no id. An event with no id cannot be told apart from a duplicate, so it is **not applied**, whatever else it says. It is stored with no `provider_event_id` (never a placeholder that could collide) |
| `malformed_object` | `object` is present but is not a JSON object |
| `malformed_checkout` | A `checkout.completed` that is neither ours nor a recognisable one-time order (for example no billing type at all). It is **not** assumed to be an external order |
| `refund_or_dispute` | `refund.*`, `dispute.*`, chargebacks. Money moved; an owner decides what it means for access. Nothing is revoked automatically |
| `unhandled_subscription_event` | Any other `subscription.*` event, for example `subscription.update` (an upgrade). The stored plan is **unchanged**; see Ordering |
| `unknown_event_type` | An event type this code has no rule for |

## Proving the buyer and the shop, before anything changes

`user_id` in the metadata is the buyer that our own checkout authenticated when it created the session (it reads the
signed-in session; the provider only carries the value back; the webhook signature proves the carrier). It is trusted
only as far as it can be checked here.

1. **One metadata source.** A `checkout.completed` carries the same metadata on the event object and on its nested
   subscription. If only one of them has Redlined1 keys, that one is the source, whole. If both do, they must agree
   exactly on `shop_id`, `user_id`, `plan_key`, `plan_id` (same keys, same values). Disagreement, or a key on one side
   only, is `conflicting_metadata`. Keys are never merged across the two places, so a user from one and a shop from the
   other can never be combined into a pair no checkout created.
2. **Buyer present and valid.** A shop id without a valid checkout user is `buyer_unverified`. Nothing is granted.
3. **With a `shop_id`:** the shop must exist (`shop_not_found`), and the buyer must have a membership in **that** shop
   (`buyer_not_member`) in an eligible role. Eligible roles are an allowlist: **`owner` and `manager`**. A technician,
   an advisor, or any other or empty role is `buyer_not_eligible`. If the pair has several membership rows, every one of
   them must be eligible.
4. **Without a `shop_id`:** only a buyer with exactly one membership in total, and only if it is eligible. No membership
   is `no_membership`, more than one is `ambiguous_membership`; a buyer is never assigned one of several shops.
5. **The same proof applies to cancellations and past-due events**, so an unrelated or ineligible user cannot cancel or
   downgrade a shop's subscription.
6. **Only after all of this** is `profiles.plan` written, and then `shop_subscriptions`. Nothing is granted while an event
   is held. A verified buyer with no `profiles` row is `no_buyer_profile` (a retry cannot create one).

The checkout applies the **same rule before it creates a Creem session** (`lib/billing/checkoutEligibility.ts`). It
reads every membership row, selects the shop it will bill, and requires every row for that shop to be eligible —
point 3 above, applied ahead of the payment rather than after it. An advisor or a technician is refused there, so
neither is charged and then held. The allowlist is imported from `lib/billing/creemEvent.ts` rather than restated, so
the two sides cannot drift: change `BILLING_ELIGIBLE_ROLES` and both pick it up at once.

Advisors remain ineligible, deliberately. If they should be able to buy, adding the role to that one constant is the
whole change.

The handler does **not** depend on the checkout for any of this. It proves the buyer itself, so an event that reaches
it by any other route — a payment link, a dashboard subscription, a redelivery — is judged the same way.

### Follow-ups, not in this change

* **A buyer eligible in more than one shop cannot choose which one is billed.** Selection prefers an `owner` row and
  otherwise takes the first shop by id. That is deterministic and repeatable, but it is not a choice: an owner of two
  shops always buys for the same one. A picker in the billing UI that sends an explicit `shop_id` for the route to
  verify against the buyer's memberships would close it.
* **The webhook reads at most five membership rows** (`.limit(5)` in `resolveBuyerShop`) where the checkout reads all
  of them, so for a pair with more than five rows the two could disagree. It is fail-closed as it stands — the
  checkout is the stricter side and refuses before any money moves — but the limit should be raised or removed so
  both read the same set.

## Which plan was bought

`lib/billing/creemPlan.ts`. **Never defaulted.** The old fallback to `professional` is gone.

* `plan_key` and `plan_id` are read from the single metadata source. Neither present: `plan_missing`. Both present and
  different: `plan_conflict`.
* The plan must be one sold through checkout (a price in `config/plans`): `solo`, `starter`, `professional`, `business`.
  Anything else, including `enterprise`, is `plan_unknown`.
* If the event names the product that was bought, it is compared with the existing `CREEM_<PLAN>_<INTERVAL>_PRODUCT_ID`
  variables (read only; not changed): a product Redlined1 does not sell is `plan_unknown`; a product of another plan than
  the metadata says, or two different products on the event, is `plan_conflict`. This is what stops a renewal whose
  metadata still names the old plan from writing that plan back after the customer changed product. If none of those
  variables is configured there is nothing to compare, and the validated metadata stands.

## Held events: visibility and acknowledgement

* **Visible to the owner.** Billing Health counts "error set and not processed" as *failed*.
  `GET /api/admin/billing-health/unresolved` (platform owner only, read-only) lists them with the row id, event type,
  time, reason, a masked event reference and whether the event carried a shop or user id. It never returns the payload,
  an email, a customer id or a full provider id.
* **Acknowledged with HTTP 200.** A held event's bytes never change, so a 5xx would make Creem redeliver the same event
  for up to 24 hours and raise the same alert each time.
* **5xx only for transient failures** (a database error while resolving or writing), where a retry can help. The retry
  reuses the event's row.
* **A redelivery re-evaluates.** If the cause was fixed (a role or membership corrected) a redelivery, or a manual
  resend from the Creem dashboard, reuses the same row, clears the error and applies the event. Reasons that depend only
  on the event's own bytes (`no_shop_metadata`, `plan_*`, `conflicting_metadata`, the classification reasons) cannot be
  fixed that way.

### Resolving an event with no shop metadata (`no_shop_metadata`)

This is a subscription payment that our checkout did not create (a payment link, a subscription made in the Creem
dashboard, or metadata that never arrived). A redelivery cannot fix it. **This process edits no stored payload and needs
no code or data change.**

1. Call `GET /api/admin/billing-health/unresolved` as the platform owner and note the row id, time and masked reference.
2. Find the event in the Creem dashboard by that reference. The dashboard shows the product, amount and customer; copy
   nothing from it into the codebase, a ticket or a chat.
3. Decide whether the payer is a Redlined1 customer: look them up in the owner portal by the identity shown in Creem.
   Expect one shop, and a person who is an owner or manager of it. If not, stop; do not guess.
4. Make it right through the normal path, which proves everything the handler proves:
   * ask the customer to buy again through the in-app checkout, which sends the metadata; and
   * refund the orphan payment in Creem. That refund arrives as a held `refund_or_dispute` event, which is expected.
5. The original row stays listed and counted as failed, because nothing may edit it. Record the outcome against the
   masked reference in your own notes.

There is **no** owner-portal control today that applies a held event to a shop, and this change deliberately adds none.
If one is wanted it must be designed and approved separately, because it would write production data: for example an
owner-only endpoint that takes a `billing_events` id and a shop id, re-runs the buyer and plan checks above, records who
resolved it and when, and marks the row resolved. That needs somewhere to record the resolution (a column or table), so
it is a schema decision too. It is proposed here and not implemented.

## Subscription period

Read from the provider's own fields: `current_period_start_date` / `current_period_end_date` on `subscription.*`
events, and the same fields on the nested `subscription` of `checkout.completed`. The old names were never seen in a
stored payload and are not read. A missing or implausible date is stored as unknown or, on an existing row, left as it
was. It is never guessed.

**The period only moves forward.** It is written by two conditional `UPDATE` statements, separate from the rest of the
subscription write: one that applies when the stored end is NULL, one that applies when the stored end is strictly older
than the incoming end. A late event, a retry, or a redelivery after a newer renewal changes neither column. Because the
database evaluates the condition inside each statement, this holds even when two requests overlap. It decides **only the
two period columns**. It is not used to decide plan or status: a date alone cannot tell a late event from a current one
(a cancellation carries no period at all; an annual and a monthly period differ by construction).

Edge: a customer who cancels and later resubscribes gets a new subscription whose period may end earlier than the stored
one from the old subscription. The stored end then stays at the later value until a period ends later. That is display
data only.

The period is display data. Entitlement is `getPlanStatus(profiles.plan, profiles.trial_ends_at)`; no application code
and, as verified read-only on 2026-09-20, no database function, view, policy, trigger or generated column refers to it
(pg_cron is not installed, and the repository has no Vercel cron configuration or cron route).

## Ordering: what is protected, and what is not

Creem's documentation says events can arrive more than once and in any order. Two hazards follow, and both are
**reproduced by tests** in `lib/__tests__/creemWebhookRoute.test.ts` (named `KNOWN LIMITATION`):

* **Late activation after cancellation.** `subscription.canceled` is applied; an older `subscription.paid` then arrives
  and sets the subscription back to `active` and `profiles.billing_status` to `active`.
* **Plan revert.** A shop is on a higher plan; an older event with internally consistent metadata for a lower plan then
  arrives and writes the lower plan to `shop_subscriptions.plan_key` and `profiles.plan`.

What **is** protected: the period never goes backward; a renewal whose product no longer matches its metadata plan is
held; upgrade events (`subscription.update`) are held rather than ignored, so a plan change is visible instead of silent.

### Why no ordering rule is implemented, and the decision needed

A fail-closed ordering rule needs an authoritative per-subscription event time to compare. The existing schema has none:

* `billing_events.created_at` is when **we received** the event, and `shop_subscriptions.updated_at` is when **we wrote**
  the row. Neither is the provider's time, and a retry gets a new receipt time.
* The provider's own time exists only inside the stored JSON payload (the envelope's `created_at`, and object fields such
  as `updated_at`, `last_transaction_date`, `canceled_at`). Nothing in the schema stores the last applied one, so a rule
  would mean scanning `payload` JSON in `billing_events` (no index on it, no foreign key, no uniqueness) on every event.
  Whether the envelope time is stable across retries and manual resends has not been observed on a live event.
* A date-only rule was rejected on purpose (see the period section). A rule built on an unverified timestamp would, when
  wrong, block a paying customer's activation, which is a worse failure than the hazard.

Options, for the owner to choose between. None is implemented or applied:

**A. Store the provider event time (recommended).** Add nullable `last_provider_event_at timestamptz` (and
`last_provider_event_id text`) to `shop_subscriptions`. Apply each lifecycle event with a conditional `UPDATE ... WHERE
last_provider_event_at IS NULL OR last_provider_event_at < :event_time`, atomic like the period rule; an event whose
envelope carries no parseable time is held, not applied. Additive, nullable, and reversible with `DROP COLUMN`. Needs:
(1) confirmation from real Creem test-mode events that the envelope time is stable across retries and orders correctly
per subscription; (2) a decision for events with equal times (for example `checkout.completed` and `subscription.paid`
about one second apart on a purchase); (3) the unique index on `shop_id` below, so that there is one row to order.

**B. Read the current state from Creem instead of trusting the event.** On each lifecycle event, fetch the subscription
from Creem's API (`getSubscription` already exists in the provider) and write what it says. State is then
order-independent. No schema change, but it adds an outbound call and the API key to the webhook path, must fail
safely when Creem is unreachable (the resilience rule), and changes the model of the handler.

**C. Accept and watch.** Keep the documented risk and add an owner-visible alert when an applied event's period end is
older than the stored end. That detects a late event; it does not stop one.

Until one of these is chosen, treat late activation and plan revert as open risks. Both need a late or duplicated event
to occur: the sequence in a real purchase (`subscription.paid` then `checkout.completed`, about a second apart) does not
trigger them, since both are activations.

## Idempotency: what is and is not guaranteed

**Application-level checks cannot guarantee atomic deduplication without database constraints.** The handler checks
"does this event id exist?" and then inserts: a read followed by a write, made by the application. It is not atomic.

**Guaranteed (sequential deliveries):**

* a redelivery of an already-processed event is skipped;
* a redelivery of an event that failed, or was held, **reuses** its `billing_events` row instead of adding one;
* every write is safe to repeat, and the period cannot move backward.

**Not guaranteed (overlapping deliveries):** `billing_events` has no unique index on `provider_event_id`, and
`shop_subscriptions` has no unique constraint on `shop_id` (only its primary key). Two deliveries that overlap can both
pass the check and both insert, leaving two event rows and, for a shop that has no subscription yet, two subscription
rows. This is real, not theoretical: on a purchase, Creem sent `subscription.paid` and `checkout.completed` about one
second apart. Only a database constraint closes it. The tests pin the current behaviour as a known limitation, and
separately show the handler behaving correctly against a database that has the constraints.

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
`23505` and is treated as a duplicate (events) or applied to the row that won (subscriptions), with the period still
moving forward only.
