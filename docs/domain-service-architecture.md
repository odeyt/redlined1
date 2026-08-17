# Domain service architecture (M1–M2)

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

## Payments: the ledger (M2)

Payments are **append-only**. They cannot be edited or deleted — not by a user,
not by the service role. A mistake is corrected by appending its opposite.

```text
  P-1  payment    +500 THB   INV-1
  R-1  reversal   -500 THB   INV-1   reverses P-1   reason: "entered twice"
  P-2  payment    +450 THB   INV-1
                  ------
  net              450 THB
```

Why this shape rather than an edit:

- Every report, dashboard and metric sums `amount`. A reversal is negative, so
  all six other readers of the table stay correct **with no changes** — they
  were checked and are SELECT-only.
- "Paid 500, later reversed" is a different fact from "paid nothing", and only
  one of them reconciles against a bank statement.
- A deleted row cannot be explained afterwards. A reversed one explains itself.

### The operations

| Was | Is |
|---|---|
| `updatePayment(id, fields)` | `correctPayment(id, corrected, reason)` |
| `deletePayment(id)` | `reversePayment(id, reason)` |

A **reason is required** by the domain even though the column allows null: a
reversal nobody explained is what an auditor asks about six months later.

`correct()` is two writes, and **the order is the safeguard**. PostgREST cannot
span them in one transaction, so the reversal goes first: a failure after step
one leaves the payment cancelled and visible rather than duplicated. A lost
payment can be re-entered; a customer billed twice cannot be un-billed as
easily. The error names which half happened.

### Enforced in the database, not just here

`supabase/migrations/2026-08-17_m2_payment_ledger.sql`:

- `REVOKE UPDATE, DELETE, TRUNCATE` plus a trigger — the same two locks as
  `audit_events`, for the same reason.
- A reversal must be the **exact negative** of its target, in the same currency
  and shop, and the target must not itself be a reversal.
- A partial unique index allows **one reversal per payment**, so two people
  clicking Reverse at the same moment cannot drive an invoice negative.
- `payments.invoice_number → invoices.number` changed from **ON DELETE SET
  NULL** to **ON DELETE RESTRICT**. The constraint always existed — the M0
  audit was wrong to say otherwise — but its delete rule quietly blanked a
  payment's invoice link when the invoice was deleted. INV-0003 demonstrated
  this in production: it is gone, and a payment still carries the note
  "Credit card payment — INV-0003". A billed invoice can no longer be deleted
  out from under its payments.
- `payments.customer_id` has the same SET NULL rule and is deliberately **not**
  changed here. Whether a customer with payment history should be deletable at
  all is a product decision, not a side effect of the payment ledger.

### Arithmetic helpers

`netAmount(entries)` and `liveEntries(entries)` exist so no caller has to
remember that reversals are *already* negative. Subtracting them again
double-counts, which is the one mistake this shape invites.

### Deployment order

The application must ship **before** the migration. The old code issues UPDATE
and DELETE; migration-first would make the live Edit and Delete buttons fail in
front of customers.


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

## Not in M1 or M2

API v1, MCP, WhatsApp, voice, HR, payroll, expenses, receivables, event
publishing, and the remaining ~40 services. `organization_id` exists and is
back-filled; **nothing reads it yet**.

The Redline Intelligence Bus (`lib/intelligence-bus/`) was reviewed and left
untouched. Its event envelope already carries `organization_id`, which is
consistent with the tier introduced here. Activation belongs to the event
milestone.

---

## Capabilities (M4)

**What a role may DO, as distinct from what it may SEE.**

`shop_settings.role_permissions` is a per-shop allowlist of module *names*,
evaluated in the browser. It can hide the Payments screen from managers. It
cannot express "may read their own pay but not anyone else's", because a module
name has no notion of a row, a verb or a subject — and that becomes
load-bearing the moment an employees table has a pay rate on it.

`lib/auth/capabilities.ts` is the vocabulary. `DomainContext.capabilities` is
the resolved list. `requireCapability(context, id, phrase)` is the check.

```text
shop_users.role  +  shop_settings.capability_overrides
                    │
            capabilitiesFor()          ← one implementation, both sides
                    │
        DomainContext.capabilities
                    │
     requireCapability(ctx, 'payments.reverse', 'reverse payments')
```

### Nobody's access changed

The default grants were derived from the existing blocked-module lists in
`lib/useShop.ts`, and `capabilities.test.ts` re-derives them from those lists
rather than restating them — so the two cannot drift without a failure. This
shipped as a new vocabulary for the same access.

### Rules

- **Read is separate from write**, everywhere.
- **`payments.record` is separate from `payments.reverse`.** Taking money is a
  daily task; cancelling a recorded payment rewrites the books.
- **Deny beats grant**, and beats the default.
- **A `planned` capability grants nothing**, whatever the stored settings say.
  Same lesson as the alerts catalogue: a switch for something nothing enforces
  looks like it works and does nothing. HR and money capabilities are declared
  so the milestones have a target, and they are inert.
- **An empty capability list means no permissions.** A caller that forgot to
  resolve them gets nothing rather than everything.
- **`createSystemContext` is unrestricted** — a back-fill has no role and must
  not do half its work. Its gate is that it is unreachable from a request.

### Both sides, and the duplication that costs

`public.has_capability(shop_id, capability)` answers the same question inside
Postgres, so RLS policies can use it — `audit_events` is the first, replacing a
hardcoded `role IN ('owner','manager')`.

The role defaults are therefore written twice: once in TypeScript, once in
PL/pgSQL. That is real duplication. The alternative was routing every policy
through the application, which would make RLS decorative. The test
`the database agrees with the application` parses the SQL function and fails if
the two lists ever disagree.

### Still module-based

Navigation is unchanged — `role_permissions` and `getBlockedModules` still
decide which screens appear. Capabilities decide what actions succeed. Merging
them is a later milestone; doing both at once would change what people see and
what they may do in one release, with no way to tell which broke.

**There is no editor yet.** `capability_overrides` resolves correctly and is
`{}` everywhere; a per-shop UI is deferred.
