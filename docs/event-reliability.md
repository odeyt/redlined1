# Domain event reliability (M12.3)

## Delivery semantics

**At-least-once, not exactly-once.** The business write and the event write are
not one transaction — the domain layer talks to PostgREST, which has no
client-side transaction, so the event is inserted immediately *after* the row it
describes. A process dying between the two loses the event. Consumers must be
idempotent.

## The tenancy invariant

**Every shop belongs to exactly one organization.** A solo shop gets its own
single-shop organization; that is the model M1 established and it means nothing
downstream has to special-case a tenant without one.

`rib_events.organization_id` is NOT NULL, so a shop without an organization can
only produce undeliverable events.

M1 back-filled every shop existing on 2026-08-16 but did not update the shop
creation path, so every shop created afterwards arrived with
`organization_id` NULL — two did before it was noticed.

- Creation path fixed in `commercial/onboarding/ShopProvisioningService.ts`
- Existing rows: `supabase/migrations/2026-08-20_m12_3_shop_organization_backfill.sql`
- `NOT NULL` is deliberately **not** added yet — a constraint added before every
  path is proven safe turns a provisioning bug into a failed signup.

## Fail fast, then rebuild

`emitDomainEvent` refuses to queue an event whose shop has no organization. It
logs, alerts, and returns false; the business action still completes.

Nothing is lost by not writing that row, because the business record is the
source of truth and the event can be rebuilt from it.

## Tools

```
npm run events:relay              # drain the outbox into rib_events
npm run events:dead               # operator worklist of dead events
npm run events:reconcile -- --since 2026-08-20            # dry run
npm run events:reconcile -- --since 2026-08-20 --execute  # emit what is missing
```

The reconciler derives the **same idempotency key the live emitter uses**, so an
event that already exists is skipped and running twice changes nothing. It is
dry-run by default and `--execute` requires `--since`: reconciling with no lower
bound would replay the entire history of the system as fresh events.

Two event types are organization-scoped (`payroll.finalised`, `leave.approved`)
and their business rows do not record which shop the action happened in. Where
the organization holds one shop that is unambiguous; where it holds more (D1
Imports has two locations) the reconciler reports AMBIGUOUS and leaves them
alone rather than guessing.

## Recovering a dead event

- **No organization** — fix the tenancy, then reconcile from the business
  record. Do *not* requeue the dead row; it predates the fix and the reconciler
  produces a correct event with the right routing.
- **Genuine delivery failure** — `npm run events:dead -- --requeue <id>` once
  the cause is fixed. The idempotency key prevents double delivery. Requeue
  refuses while routing identity is still missing.

`rib_events` is immutable by rule (UPDATE and DELETE are no-ops), so recovery
never rewrites delivered history.

## Alerting

The relay alerts only on events that reached `dead` **in that pass**. Alerting
inside the relay loop would fire on every retry of an event that succeeds on
attempt three; alerting on a scan of all dead rows would re-fire the same
events forever. Alerts carry identifiers and the error, never the payload.

## Known gap

There is no scheduled reconciliation. A miss is currently found by running the
reconciler by hand. Wiring it into a workflow is worth doing before M14, when
outbound webhooks make completeness matter to somebody outside the system.
