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

---

## Update after M13.2

**Vehicles: SHIPPED** — ported to `lib/domain/vehicles.ts`, exposed as
`GET/POST /api/v1/vehicles` and `GET/PATCH /api/v1/vehicles/:id`.

Entitlements were traced properly rather than assumed. `config/plans.ts` — the
canonical registry — gates `unlimitedInvoices`, `maxTechnicians`, `aiAdvisor`,
`smsCredits`, `digitalInspections`, `smartIntake`, `multiLocation`, `reports`,
`repairIntelligence`, `triage`, `prioritySupport`. **No vehicle key exists on
any plan**, so vehicle read and write are not plan-limited and the write
endpoint is not blocked.

`lib/api/entitlements.ts` now closes the M13.1 architecture gap: an API key
resolves to an organization, its shops, their owners, their subscriptions, and
the highest tier among them. `requireFeature` and `requireCapacity` take a
feature key from the registry, never a plan name. Nothing calls them yet
because nothing exposed is gated — they exist so the next slice that IS gated
cannot ship without one.

### No vehicle RIB event — and a divergence worth knowing

`DOMAIN_EVENTS` has no vehicle type, and none was invented for this.

But `services/vehicleService.saveVehicle` publishes a **Sapelee** bus event
(`vehicle.created`) — a different system from the M12 RIB outbox. The API path
does **not**, because that publish stayed in the browser service rather than
moving into the domain.

So a vehicle created in the app produces a Sapelee event and one created
through the API does not. That is a real divergence, left deliberately: moving
an integration's traffic is a decision about another product's data, not a
side effect of adding an endpoint. Decide it before Sapelee starts relying on
vehicle events being complete.

---

## Update after M13.3

**Appointments: SHIPPED** — `lib/domain/appointments.ts`, exposed as
`GET/POST /api/v1/appointments` and `GET/PATCH /api/v1/appointments/:id`.

Entitlements: no appointment key exists in `config/plans.ts`, on any plan, so
appointments are not plan-limited. Same evidence path as vehicles.

### The model is not what an appointments API usually assumes

Read from the schema and the nine production rows:

- **No timestamp.** `date` (`YYYY-MM-DD`) and `time` (`HH:MM`) are two TEXT
  columns. No end time, no duration.
- **No timezone anywhere.** `shops` is `id, name, slug, created_at,
  organization_id` — there is no timezone column, so nothing in Redlined1
  records what zone "10:10" means. The API therefore returns the wall clock
  verbatim and says so in `meta.timezone`. Converting it to an instant would
  assert a precision the data does not have.
- **`customer`, `vehicle` and `technician` are free text**, not foreign keys —
  "SAISAVANH MOTOR", "Audi R8 2008 #6666", "Beck". One production row has a
  vehicle description in the customer field. There is nothing to tenant-verify
  and equally no id through which another tenant could leak; the boundary is
  `shop_id` alone.
- **No status machine.** `reminder` holds "Checked in" or "None" in the data
  and defaults to "Confirmed" in the old service — three values, two sources,
  zero transitions defined anywhere. It is a marker, not a lifecycle, and none
  was invented.
- **Overlap is allowed.** No conflict rule exists in any code path; two
  appointments may share a technician and a slot. Proven by booking one.

## Sapelee integration — decision: C, REQUIRES SEPARATE HARDENING

M13.2 reported the vehicle divergence as vehicle-specific. That was too
narrow. `publishSapeleeEvent` is called from **at least six services** —
appointments, customers, estimates, invoices, job cards, vehicles — always
from the service layer, never from `lib/domain`. So **every** API slice built
so far diverges, customers included, not just vehicles.

Evidence for C rather than A/B/D:

- It is a real integration, not dead code: `sapelee_event_outbox` holds 86
  rows.
- It is flag-gated and currently **off** locally —
  `NEXT_PUBLIC_SAPELEE_EVENTS_ENABLED` is unset, and `publishSapeleeEvent`
  is documented as "a complete no-op — not even a queue write" when
  unconfigured. Yet rows exist, so it has been on somewhere.
- The publish sites are UI-layer side effects by construction: the SDK comment
  records "the browser client at every real call site found in the Part 1
  audit".

Moving publishing into the domain (option A) would make API traffic appear in
another product's feed and would need double-publish protection across six
call sites at once. Doing that entity-by-entity as a side effect of API work
guarantees a half-migrated integration. It needs one deliberate pass.

Until then: **no API-originated event reaches Sapelee, for any resource.**

### RIB

`DOMAIN_EVENTS` contains no appointment type and none was created. Appointment
mutations produce an audit row and nothing on the outbox — the same as
customers and vehicles.
