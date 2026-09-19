# Owner portal — definitions

Read-only platform-owner views (`/admin`, `/admin/accounts`, `/admin/support`, `/admin/billing-health`).
Every figure below is computed on the server from existing records. Nothing here changes an
account, plan, subscription, ticket or profile.

Code is the source of truth; this page says where each definition lives.

## 1. Commercial state (one resolver)

`lib/admin/accountStatus.ts` → `deriveAccountStatus`. The Overview, Accounts directory, Account detail
and Billing Health all use it (Billing Health via `getCommercialOverview` → `summarizeCommercial`).

| Status | Meaning |
|---|---|
| `internal` | Shop is in `INTERNAL_SHOP_IDS`. Only that list marks a shop internal — never an email, name, plan or missing subscription. Excluded from every commercial total, never gated. |
| `free` | Free entitlement. |
| `trialing` | Trial *access* (profile entitlement). Not the same as a billing-provider trial. |
| `active_paid` | Paid entitlement confirmed by an active subscription record. |
| `cancel_scheduled` | Still paying this period, cancelling at period end. |
| `past_due` | Payment failed. |
| `cancelled_access_retained` | Cancelled but access kept — documented product policy, not a defect. |
| `expired` | Subscription period ended, entitlement is Free. |
| `paid_unverified` | Paid access the billing record does not confirm. Says nothing about *why*. |
| `billing_mismatch` | Records contradict each other. |

Precedence: internal → contradictory evidence (`billing_mismatch`, fails closed) → `paid_unverified`
→ confirmed states. A plan label alone is never payment.

Revenue (MRR/ARR/ARPA) counts only shops with `revenueVerified`: `active_paid` or `cancel_scheduled`,
a provider reference, and a non-manual provider. ARR is **MRR × 12, a run-rate**, not booked revenue.
Excluded shops are counted and explained on the Overview and Billing Health.

Scope of the commercial figures: every **non-internal** shop, **archived shops included**. Archiving a
shop hides it from the active tiles; it does not stop a provider-backed subscription from billing, so
that money still counts. The same applies to the exclusion counts and the reconciliation indicator, which
is why they can exceed the active-shop tiles (archived shops with a billing problem are also listed
separately on the Overview).

Intervals: a subscription is priced monthly, or annual ÷ 12. Checkout only produces `monthly` or `annual`
(matched case-insensitively). A missing interval is assumed monthly and counted in `assumedMonthlyInterval`.
Any other value (`quarterly`, `yearly`, a number…) has no known price: the subscription is **excluded from MRR
and counted under "unrecognised billing interval"** — never priced as annual or monthly by guess.

Reconciliation indicator (`reconciliationOf`): `mismatch` if any shop is `billing_mismatch`; else
`unverified` if any is `paid_unverified`; else `reconciled`. Internal shops are ignored.

## 2. Activation

`lib/admin/activationRules.ts` (definition), `lib/admin/activationData.ts` (reads).

**Activated shop** = a non-internal shop with a customer **and** a vehicle **and** at least one repair
order/job **or** estimate. Derived from rows that already exist. An unreadable table makes a milestone
*unknown*, never *no*.

Not tracked anywhere, so not reported: first customer communication, upgrade page viewed, checkout started.

## 3. Logins without a shop membership

`lib/admin/profileDiagnostics.ts`. A profile with no `shop_users` row. A cause is reported only when a
record establishes it (unverified email, a provisioning claim with/without a shop, no sign-in account).
A verified profile with no claim is reported as *cause not established*. Invited-pending and
test/abandoned-account intent cannot be derived. Output is counts plus masked rows — no email or id.

## 4. Support queue

`lib/admin/supportTriage.ts`.

- **Open**: a ticket is open unless its status is `closed`; a lead is open while its status is `new`,
  `contacted`, `qualified` or `scheduled`.
- **Needs attention**: an open ticket whose latest message is not from support, or a lead with status `new`.
- **Overdue**: a ticket that needs attention and has been waiting on us for 2+ days, counted from the first
  unanswered customer message — not from when the ticket was opened (tickets only).
- **Confirmed test/spam**: only an explicit owner marker (a ticket's newest row in
  `support_ticket_triage_events`, or a lead with status `spam`). Never inferred from a subject, shop name or
  message text. Confirmed test/spam is kept and excluded from counts.
- Tickets and leads are different things and are counted separately.

**Marking a ticket** (platform owner only): `POST /api/admin/support/triage` with `{ ticketId, triage }`, where
`triage` is `real`, `test`, `spam` or `unreviewed` (clears a marking). Each call appends an audit row (who, when,
what); nothing is edited or deleted, and the ticket's own record and messages are never touched. Customers have
no access to the marker table at all.

`support_ticket_triage_events` needs the local migration
`supabase/migrations/2026-09-19_support_ticket_triage.sql` (**not applied**). Until it is, every ticket reads as
*unreviewed*, the page says so, and the marking control returns "not available".

## 5. Directory scope

`archived=active|archived|internal|all` match the Overview tiles exactly: active external, archived
external, internal. Archived shops stay in the directory; nothing is deleted.
