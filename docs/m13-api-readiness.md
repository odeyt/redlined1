# What may be exposed through API v1, and what may not

The deciding question is not "is this useful to an integration" but **"is there
a server-safe domain service that owns the rule"**.

A resource is API-ready when a caller can be authenticated, a tenant fixed from
the key, and the operation performed through `lib/domain/<entity>.ts` — which
scopes reads by `context.shopIds`, writes by `context.shopId`, checks a
capability, writes the audit row, and emits the domain event. Everything the
route does is plumbing.

A resource is **not** ready when its rules live in `services/<entity>Service.ts`
alongside its own Supabase calls. Exposing one of those means either calling a
browser-coupled function from a server route, or re-implementing the rule in
the handler — and a business rule with two implementations has one that is
wrong.

## Ready

| Resource | Domain module | Status |
|---|---|---|
| **Customers** | `lib/domain/customers.ts` | **SHIPPED** — list, get, create |

## Ready, deliberately not exposed yet

| Resource | Domain module | Why it waits |
|---|---|---|
| Invoices | `lib/domain/invoices.ts` | Server-safe and audited, and it emits `invoice.issued`. Financial: an integration creating invoices affects receivables and what a customer is asked to pay. Expose only once the customer slice has run in production and rate limiting has been observed under real traffic. |
| Payments | `lib/domain/payments.ts` | Append-only ledger with reversal, fully audited. Highest blast radius in the system — a wrong write is money. Last, not first. |
| Employees | `lib/domain/employees.ts` | Server-safe. Personal data with little integration demand; exposing it widens the PII surface for no current benefit. |
| Expenses, cash days, payroll, salary, receivables, attendance | `lib/domain/*.ts` | All server-safe. Internal back-office concerns with no external consumer asking for them. Waiting for a real use case beats guessing at a contract. |

## Needs hardening first

| Resource | Blocker |
|---|---|
| Vehicles | No `lib/domain/vehicles.ts`. Rules live in `services/vehicleService.ts` with its own Supabase calls; audit is wired through `auditFromBrowser`, which does not throw. Needs porting before exposure. |
| Repair orders | Same. Also carries a status machine whose transitions are enforced in the service, so a route would bypass them. |
| Appointments | Same shape. Scheduling rules are in the service. |
| Inspections / DVI | Same, plus media associations and a public share-token path that would need its own threat model. |
| Parts / inventory | Same, plus quantity adjustments that are effectively financial. `parts` is keyed `(shop_id, part_number)` — a tenant-safe external identifier has to be decided before anything is exposed. |
| Technicians | Same. Mirrored per shop, so one person appears twice across a two-location organization; the API would need to decide what a "technician" is externally before it can answer a GET. |

## Do not expose

| Resource | Why |
|---|---|
| AI endpoints | Metered and costly. Needs its own quota model tied to entitlements, separate from the request rate limit. |
| Reporting / intelligence | Aggregates across a whole tenant. Cheap to call, expensive to serve, and easy to turn into an accidental data export. |
| Admin / billing-health | Platform-owner surfaces. They read across every tenant, so there is no organization-scoped key that could safely reach them. |
| Anything on `service_role` without a domain service | The pattern this milestone exists to prevent. |

## The order to expand in

1. Customers — **done**, and the pattern to copy.
2. Vehicles, once ported to `lib/domain`. Non-financial, useful, and the natural pair to customers.
3. Repair orders, once ported, with its status machine intact.
4. Invoices — read first, write after.
5. Payments — last, and only when authentication, tenant isolation, scopes, idempotency, rate limiting and audit have all been observed working in production rather than argued about here.

## Entitlements

Not yet enforced on the API path. `lib/billing/feature-gates.ts` gates by
`userId`, and an API key has no user — it has an organization. Wiring the API
to plan limits means an organization-level entitlement check, which does not
exist today.

Until it does, an API key can create customers regardless of plan. That is
acceptable for customers, which are not plan-limited. It is **not** acceptable
for anything that is — invoices under a plan invoice cap, technicians under a
seat limit — and those must not be exposed until the organization-level check
exists. The `ENTITLEMENT_DENIED` error code is reserved for it.
