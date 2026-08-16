# Domain service architecture

> **External integrations call domain services; they do not reimplement
> business rules or receive arbitrary database access.**

That sentence is the whole design. Everything below is how it is enforced.

---

## Why this exists

Before M1, business logic lived in `services/*.ts`, and about thirty of those
modules imported the browser Supabase client and read tenancy from
`lib/shopStore.ts` — a module-level mutable set during sign-in.

That meant `createInvoice()` could only run inside a signed-in browser tab. A
route handler, a WhatsApp webhook, a scheduled job, an MCP tool and an AI tool
have no such tab, so each would have had to write its own version of the rule.
Two implementations of an invoice total is how a system comes to disagree with
itself about what a customer owes.

M1 does not migrate all 43 services. It establishes the shape and ports three:
**customers, invoices, payments.**

---

## The shape

```text
        UI component
             │
     services/*.ts            ← compatibility wrapper, signatures unchanged
             │
  lib/domain/browserAdapter   ← THE ONLY reader of shopStore
             │
      DomainContext           ← explicit: org, shop, read scope, actor
             │
      lib/domain/*.ts         ← the rules; no client, no globals
             │
        DomainDb              ← injected by the caller
             │
          RLS                 ← still authoritative
```

Later callers join at the context, not at the top:

```text
app/api/v1  ─┐
MCP tool    ─┤
webhook     ─┼─→ build a DomainContext ─→ same domain services
cron job    ─┤
AI tool     ─┘
```

---

## DomainContext

`lib/domain/context.ts`

```ts
interface DomainContext {
  organizationId: string | null;  // nullable through M1
  shopId: string;                 // where a write lands — exactly one
  shopIds: string[];              // what a read may span — shop + mirrors
  actor: { type: ActorType; userId: string | null; role: string | null };
  requestId?: string;
}
```

Three decisions worth knowing:

- **Reads are wider than writes.** `shopIds` covers mirrors so a two-location
  owner sees both; `shopId` is singular so a write cannot land in the wrong
  one by accident.
- **`createDomainContext()` refuses a missing shop** rather than defaulting.
  The failure mode of a defaulted tenant is touching somebody else's data.
- **`actor.userId` is advisory.** The authoritative actor is stamped by the
  database from `auth.uid()`. Requiring it here would tempt callers into
  inventing a placeholder, and a fabricated id in an audit trail is worse than
  a null one.

`ActorType` is `user | system | api | mcp | ai | webhook`. It exists so that
"who changed this payment" has a different answer for a service advisor, a
webhook retry and an AI agent — after the fact, that distinction is often the
only thing that explains the change.

---

## Client injection

`lib/domain/db.ts` exports a **type**, never an instance. Nothing under
`lib/domain/` may import a Supabase client. The caller chooses:

| Caller | Client | Privilege |
|---|---|---|
| Browser session | anon client | RLS as the signed-in user |
| Route handler | request-scoped client with the caller's JWT | RLS as that user |
| Webhook / job | service role | deliberate, rare, already authorized by its route |

That choice belongs to the caller because only the caller knows what its
situation deserves. Baking one in is how a service-role key becomes reachable
from a component.

**Domain authorization does not replace RLS.** The context narrows what a query
asks for; the database decides what it is allowed to have. Both, never either.

---

## Enforcement

`lib/domain/__tests__/noBrowserState.test.ts` fails the build if any domain
module imports `@/lib/supabase`, references `supabase-server` or
`SERVICE_ROLE`, reads `shopStore` / `getShopIds`, or touches `window`,
`localStorage` or `sessionStorage`.

`browserAdapter.ts` is the single exception, and the same suite asserts
positively that it still does its job — so the rule cannot be satisfied by
quietly deleting the adapter.

---

## Audit

`lib/domain/audit.ts` → `record_audit_event` → `audit_events`.

Every domain mutation writes one row. One shape for all of them: a per-service
audit format is the same as no audit format.

The function is `SECURITY DEFINER` and refuses to take the caller's word for
three things:

| Field | Source |
|---|---|
| `actor_user_id` | `auth.uid()`, never an argument |
| shop membership | verified against `shop_users` before any write |
| `organization_id` | derived from the shop |

Two locks make it append-only: `REVOKE UPDATE, DELETE, TRUNCATE` from every
application role, and a `BEFORE UPDATE OR DELETE` trigger that raises. Either
alone is insufficient — the grant stops the ordinary path, the trigger stops
anything arriving with more privilege than expected, including a future
service-role script that means well.

Reads are restricted to `owner` and `manager`. That policy is the seam that
will keep salary history out of general view when payroll arrives.

**A failed audit write throws.** The tempting alternative — swallow it so
logging cannot break a payment — would leave the table looking healthy while
recording nothing, which is the exact state M1 exists to end.

### Redaction

`redactSnapshot()` replaces anything matching
`token|secret|password|api_key|authorization|auth|credential|p256dh|private`
with `[redacted]`, and summarises values over 2000 characters. An audit row is
read by more people and kept longer than the record it describes.

Snapshot scope differs by entity, deliberately:

- **customers** — trimmed to name, type, phone, email, follow-up. An audit
  table full of personal data is a liability.
- **invoices** — includes line items. "The total changed" without "which line"
  is not an answer.
- **payments** — the entire financial record. If a row is deleted this is the
  only surviving evidence, and an amount without its method, reference and date
  cannot be reconciled against a bank statement.

---

## Payments: what M1 did *not* fix

M0 found payments could be edited and hard-deleted with no ledger and no
record. **M1 does not fix that.** Moving the functions did not make them safe.

What M1 did:

1. routed both through one place, and
2. made both write an audit row first — the deletion audit is written *before*
   the row is removed, so a failure leaves an extra row rather than losing the
   evidence.

They are exported as `updateLegacy` / `removeLegacy` in the domain layer so no
new caller adopts them by accident, and so their removal in M2 is a compile
error at every remaining call site rather than a silent behaviour change.

### Known callers, for M2's blast radius

| Call site | Operation |
|---|---|
| `features/payments/PaymentsView.tsx:220` | `updatePayment` — edit an existing payment |
| `features/payments/PaymentsView.tsx:237` | `deletePayment` — delete from the payments list |
| `features/invoices/InvoicesView.tsx:681` | `deletePayment` — remove a payment from an invoice |

Three call sites, two components. M2 replaces them with adjustment and reversal
entries.

---

## Ported in M1

| Entity | Domain module | Wrapper |
|---|---|---|
| Customers | `lib/domain/customers.ts` | `services/customerService.ts` |
| Invoices | `lib/domain/invoices.ts` + `lib/domain/invoiceMath.ts` | `services/invoiceService.ts` |
| Payments | `lib/domain/payments.ts` | `services/paymentService.ts` |

`invoiceMath.ts` holds the shape and arithmetic — `calculateTotals`,
`getEffectiveTotal`, `mapInvoiceRow` — moved out of the service so code with no
browser session can reach it. The service re-exports every name, so every
existing import path still works and there is **exactly one** implementation of
an invoice total.

Outbound integrations (Sapelee, intelligence events) stayed in the wrappers.
Whether a webhook- or AI-initiated payment should also fire them is a decision
for the event milestone, not a side effect of moving code.

---

## Adding an entity

1. Write `lib/domain/<entity>.ts` exporting `create<Entity>Domain({ db, context })`.
2. Scope reads with `context.shopIds`, writes with `context.shopId`.
3. Call `writeAuditEvent` on every mutation; add the action to `AUDIT`.
4. Reduce the service to a wrapper that calls `browserDeps()` and delegates.
5. Keep the exported signatures identical, so no view changes.

The enforcement suite picks up new files automatically.

---

## Not in M1

API v1, MCP, WhatsApp, voice, HR, payroll, expenses, receivables, event
publishing, and the remaining ~40 services. `organization_id` exists and is
back-filled; **nothing reads it yet**.

The Redline Intelligence Bus (`lib/intelligence-bus/`) was reviewed and left
untouched. Its event envelope already carries `organization_id`, which is
consistent with the tier introduced here. Activation belongs to the event
milestone.
