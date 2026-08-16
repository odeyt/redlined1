# M0 — Master Architecture Audit

Read-only audit of Redlined1 as it stands, against a proposed expansion into an
Automotive Business OS + Back Office + AI platform.

**Nothing in this milestone changed production.** No schema, no migrations, no
data, no deploy, no environment or billing settings. The only artefact is this
file, on branch `audit/m0-backoffice-platform`, unmerged.

---

## 1. Executive summary

- Repository is `redlined1`, branch `staging`, HEAD `c8cc6f5`, **working tree clean** at audit start.
- The product is far more built out than a shop-management MVP: 101 API routes, 38 feature modules, 43 services, 64 migrations, 109 test suites / 1541 tests passing.
- **Tenancy is shop-level, not organization-level.** `shops` → `shop_users` → auth users. There is no `organizations` table. Multi-location today is `shop_mirrors`, a peer-to-peer mirroring table, not a parent-child hierarchy.
- **The single biggest blocker to API / MCP / WhatsApp / voice is the service layer**: ~30 of 43 services in `services/` import the *browser* Supabase client (`@/lib/supabase`). They cannot be called from a route handler, a webhook, or an AI tool. Business logic is reachable only from a signed-in browser tab.
- Tenancy is enforced in **two independent places that must agree**: RLS in Postgres, and `getShopIds()` (`lib/shopStore.ts`) — a module-level mutable variable in the browser. The second is not a security control.
- **RLS holds.** Anonymous reads were tested against 31 tables: zero rows leaked; 15 refused outright with 42501, 16 returned 0 rows.
- **An append-only event bus already exists and is dormant.** `lib/intelligence-bus/` (RIB) has publish, subscribe, idempotency, loop guard, payload/secret guard, and an immutable `rib_events` store whose envelope already carries `organization_id`. `rib_events` has **0 rows**.
- A second, *working* event mechanism exists: `sapelee_event_outbox` — a real transactional outbox with `idempotency_key`, `attempts`, `next_attempt_at`, 67 rows.
- **`audit_logs` exists and is unusable**: columns are `action, "user" text, entity, time text`. No shop_id, no actor id, no before/after, no append-only enforcement, **0 rows**. Nothing writes to it.
- **There is no receivables model.** No stored balance, no aging, no credit notes, no write-offs, no adjustments. `payments.invoice_number` is a text reference with no foreign key to `invoices.number`.
- **Payments are mutable and deletable** (`updatePayment`, `deletePayment` in `services/paymentService.ts`) with no ledger, no reversal, no audit. This is the highest-risk finding for any financial expansion.
- HR foundations partially exist: `technicians` already carries `pay_type, pay_rate, hire_date, status, user_id`, and `time_entries` already has `clock_in / clock_out`. Attendance and payroll would *extend* these, not replace them.
- **AI is already real and reasonably well-architected**: `lib/platform/ai/AiProvider.ts` is a provider-agnostic abstraction (OpenAI + Anthropic), with quota control in `lib/ai/aiQuota.ts`. But `ai_usage_logs` has a migration and **does not exist in the live database** — schema drift.
- **MCP does not exist anywhere.** Zero matches outside an unrelated string in `lib/logo.ts`.
- **WhatsApp is outbound-only, via Twilio** (`app/api/send-message/route.ts`, `whatsapp:` prefix). There is no inbound webhook, no `conversations` table, no `messages` in use (`messages` table exists, 0 rows). An AI receptionist needs a conversation layer that does not exist yet.
- **Voice: nothing.** No `MediaRecorder`, no `getUserMedia` for audio, no transcription. Camera capture exists and proves the permission/PWA plumbing works.
- **No Expo / React Native project.** PWA is real: manifest, service worker with install/activate/fetch/push/notificationclick, offline caching, web push live.
- **No rate limiting anywhere.** `zod` is used in exactly 1 of 101 API routes. No API versioning, no OpenAPI, no pagination convention, no API keys, no machine auth.
- Recommendation: **GO WITH PRECONDITIONS.** The data model is sound enough to build on, but service extraction and an audit log must precede any financial or AI-write work.

---

## 2. Repository baseline

| Item | Value | Evidence |
|---|---|---|
| Repository | `redlined1` | `git remote -v` → `github.com/odeyt/redlined1.git` |
| Branch at audit start | `staging` | `git branch --show-current` |
| Commit | `c8cc6f57e9258b40358413a13e6cea8716c0a7d8` | `git rev-parse HEAD` |
| Working tree | **clean** | `git status --short` → empty |
| Node | v26.1.0 | `node --version` |
| Package manager | npm 11.13.0 (`package-lock.json`) | |
| Next.js | ^16.2.9 | `package.json` |
| React | ^19.0.0 | |
| TypeScript | ^5 | |
| Supabase | `supabase-js` ^2.108.0, `ssr` ^0.10.3 | |
| Tests | Jest ^30.4.2 + ts-jest; Playwright ^1.61.1 | |
| Test result | 109 suites / 1541 tests passing | `npx jest` |
| Validation | `zod` ^4.4.3 (present, barely used in API) | |
| Error tracking | `@sentry/nextjs` ^10.63.0 | |
| Push | `web-push` ^3.6.7 | |
| Expo / React Native | **absent** | 0 matches in `package.json` |
| i18n | **absent** | no locales, no `useTranslation` |
| Migrations | 64 files | `supabase/migrations/` |
| API routes | 101 | `find app/api -name route.ts` |
| Feature modules | 38 | `features/` |
| Services | 43 | `services/` |

---

## 3. Existing architecture map

The most important structural fact: **Redlined1 is a single-page application behind one route.**
`app/page.tsx` renders `<AppShell />`, and every "screen" is a key in the `views`
map in `components/AppShell.tsx` selected by `activeModule` in a reducer
(`lib/store.tsx`). There is no route per module.

```text
/                         → AppShell (the entire authenticated product)
│   modules selected by reducer state, not by URL:
│   dashboard, command-center, customers, vehicles, job-cards, job-archive,
│   scheduling, inspections, communication, estimates, repair-orders,
│   invoices, payments, parts, parts-orders, parts-received, parts-estimates,
│   technicians, vin, dtc, diagnostics, appointments, reports, labor-guide,
│   time-tracking, repair-intelligence, triage, settings, access,
│   subscriptions, ai, billing, system-health, disaster-recovery,
│   testing-dashboard, support-inbox
│
├── /login /signup /forgot-password /reset-password /auth/error
├── /landing-preview /help /contact-sales /privacy /terms /refund-policy
├── /billing/success /billing/canceled
├── /admin/billing-health          (platform owner)
├── /admin/sapelee
├── /inspection/[token]            (customer, no session)
├── /portal/[token]                (customer, no session)
├── /status/[token]                (customer, no session)
└── /api/...                       (101 routes)
```

Consequences worth stating plainly:

- **Deep linking barely exists.** It was added for alerts only, as
  `/?alert=entityType:entityId` (`lib/alerts/alertLink.ts`, consumed in
  `AppShell`). Any future notification, WhatsApp reply, or AI answer that wants
  to point at a record has to go through that one mechanism or extend it.
- **Authorization is largely client-side for navigation** — `getBlockedModules`
  in `lib/useShop.ts` plus `rolePermissions` from `shop_settings`. The server
  guard that matters is `lib/serverAuth.ts` (`requireShopRole`), used by API
  routes.
- `proxy.ts` sits in front of routing (there is no `middleware.ts`); it carries a
  `publicPaths` list, which is how `/api/push/send` is reachable by a webhook with
  no session.

### API surface, grouped

| Group | Count | Notes |
|---|---|---|
| `intelligence/*` | ~25 | Recommendations, learning, memory, morning brief, decision engine |
| `billing/*`, `webhooks/creem`, `webhooks/stripe` | ~11 | SaaS subscription billing |
| `admin/billing-health/*` | 8 | Platform-owner analytics |
| `diagnostics/*` | 5 | Scan-tool bridge, sessions |
| `push/*` | 3 | subscribe, send, coverage |
| `support/*` | 3 | Ticketing + AI assistant |
| `labor-guide/*`, `labor-lookup` | 3 | |
| messaging (`send-message`, `send-document`, `send-followup`, `job-notify`, `messaging-channels-status`, `shop-messaging-secrets`) | 6 | **outbound only** |
| customer-facing token endpoints (`inspection-share`, `inspection-approve`, `inspection-email`, `job-status`) | 4 | |
| `rib/publish`, `rib/replay`, `platform/events` | 3 | Event bus, dormant |
| `sapelee/*` | 2 | Outbox flush + metrics |
| other | rest | health, ping, provision, invite, members, role-permissions, feature-flags, ai, chat |

---

## 4. Existing database map

Verified against the **live** database (schema and row counts only — no customer
records printed).

### Identity

| Table | Rows | Key columns | Concern |
|---|---|---|---|
| `profiles` | 13 | `id, email, role, plan, trial_ends_at, shop_name, shop_id, billing_status` | Carries a **legacy single `shop_id` and `role`** that duplicates `shop_users`. Two sources of truth. |
| `users` | **0** | — | Dead table. Parallel to `profiles`. Should be confirmed unused and dropped in a later milestone. |

### Tenant

| Table | Rows | Key columns |
|---|---|---|
| `shops` | 7 | `id, name, slug, created_at` |
| `shop_users` | 17 | `shop_id, user_id, role` — the real membership table |
| `shop_mirrors` | 2 | `shop_id, mirror_shop_id` — peer visibility, **not** hierarchy |
| `shop_settings` | 4 | 40 columns: branding, labor rate, tax, prefixes, `role_permissions`, feature toggles, `default_currency`, `alert_preferences` |

### Workshop operations

| Table | Rows | Notable |
|---|---|---|
| `customers` | 76 | `id, name, type, phone, email, address, tags, follow_up, owner_id, shop_id` |
| `vehicles` | 108 | 30 columns incl. `status, completed_at, assigned_tech, tech_pay_entries, flat_rate_lak` |
| `job_cards` | 43 | **text PK** (`JC-1786168862456`); `technicians` is an array of **names**, not ids |
| `repair_orders` | 41 | `concern/cause/correction`, `work_lines`, `parts` |
| `estimates` | 26 | `lines` jsonb, `discount`, `tax_rate` |
| `inspections` | 50 | `items` jsonb, `share_token`, `customer_approval` |
| `appointments` | 9 | `date, time, bay, technician` |
| `technicians` | 25 | `pay_type, pay_rate, hire_date, status, user_id` ← **HR seed** |
| `technician_tasks` | 0 | unused |
| `time_entries` | 5 | `clock_in, clock_out, technician_id, job_card_id` ← **attendance seed** |

### Financial

| Table | Rows | Notable |
|---|---|---|
| `invoices` | 37 | **PK is `number`, not `id`** — a fact that has already caused a production outage. Has `due_date`, `paid_date`, `lines`, `discount`, `tax_rate`, `repair_order_id` |
| `payments` | 13 | `invoice_number` (text, **no FK**), `amount`, `method`, `status`, `currency`, `payment_date` |
| `parts_orders` / `parts_estimates` | 9 / 31 | already have `deposit_paid`, `balance_due` |
| `shop_subscriptions` | 1 | SaaS billing — **not** shop revenue |
| `commercial_plans` | 4 | plan registry with `max_users`, `max_locations`, `ai_credits_per_month` |
| `billing_events` | 6 | provider webhook log with `processed`, `provider_event_id` |
| `usage_records` | 5 | metered usage |
| `payment_events`, `subscriptions` | 0 | unused |

### Files, config, audit, events

| Table | Rows | Notable |
|---|---|---|
| `entity_images` | 219 | polymorphic `entity_type`/`entity_id` — a good precedent |
| `document_counters` | 10 | per-shop, per-doc-type sequence |
| `feature_flags` | 59 | scope: global/shop/user/role/environment |
| `audit_logs` | **0** | **stub, unusable** — see §20 |
| `alert_events` | 5 | the alerts feed |
| `push_subscriptions` | 1 | web push devices |
| `ro_status_events` | 9 | status history for repair orders only |
| `sapelee_event_outbox` | 67 | **working transactional outbox** |
| `rib_events` / `rib_subscriptions` / `rib_event_deliveries` | 0 / 0 / 0 | **built, dormant** |
| `messages` | 0 | exists, unused |
| `support_tickets` / `support_messages` | 7 / 8 | the only working conversation model |
| `ai_usage_logs` | **missing from DB** | migration exists → **schema drift** |

Plus ~45 intelligence/diagnostic tables (`recommendations`, `repair_cases`,
`diagnostic_*`, `automotive_graph_*`, `customer_lifetime_profiles`, …), which are
out of scope for Back Office but do consume roadmap attention.

---

## 5. Tenancy model

**Today:**

```text
auth.users
    ↓ shop_users (shop_id, user_id, role)
  shops
    ↕ shop_mirrors (shop_id ↔ mirror_shop_id)
```

There is **no organization tier**. `D1 Imports → Shop 1 / Shop 2` is currently
expressed as two peer shops that mirror each other, with `getShopIds()`
returning `[currentShop, ...mirrors]` and services calling
`.in('shop_id', getShopIds())`.

- Canonical tenant identifier: `shops.id` (uuid).
- Membership: `shop_users`. One user *can* belong to multiple shops — verified: 17 memberships across 7 shops, and technicians exist per-shop with the same name (`John` has a row in both `90b72748…` and `38d55fae…`).
- Role assignment: `shop_users.role` (server-authoritative) — **and** `profiles.role` (legacy, still read in places).
- Enforcement: RLS in Postgres, plus `.in('shop_id', getShopIds())` in every service.

**Can it support an organization tier without a second tenancy model?** Yes, but
only if the org is added *above* shops and `shop_mirrors` is eventually
reinterpreted or retired:

```text
organizations
    ↓
  shops  (shops.organization_id)
    ↓
shop_users
```

`rib_events` already reserves `organization_id` in its envelope, which suggests
this was the original intent. **Recommendation:** introduce
`organizations` + `shops.organization_id` in M1 as a nullable, back-filled
column, and derive mirroring from org membership later. Do **not** build Back
Office tables keyed on `shop_id` only if payroll is expected to roll up across
locations — an employee working at both D1 shops is already representable in
`shop_users` but has **two** `technicians` rows, which will double-count in
payroll.

> **Duplication risk found:** `technicians` is per-shop. A person at two
> locations is two rows. Any `employees` table must be **per organization/person**,
> linked to `shop_users` for placement, or payroll will be wrong on day one.

---

## 6. Authorization model

Roles in use: `owner`, `manager`, `advisor`, `technician`
(`lib/serverAuth.ts` → `ALL_SHOP_ROLES`; `lib/alerts/catalogue.ts` → `ALERT_ROLES`).
There is also a **platform owner** concept outside shop roles
(`/api/admin/me`, `NEXT_PUBLIC_PLATFORM_OWNER_EMAIL`).

| Capability | Owner | Manager | Advisor | Technician | Enforced where |
|---|---|---|---|---|---|
| Sign in, see shell | ✓ | ✓ | ✓ | ✓ | Supabase auth |
| Module visibility | ✓ | configurable | configurable | configurable | `shop_settings.role_permissions` + `getBlockedModules` (**client**) |
| Read shop data | ✓ | ✓ | ✓ | ✓ | RLS via `shop_users` membership |
| Alerts received | financial + ops | financial + ops | ops | own jobs | `lib/alerts/catalogue.ts` |
| Push coverage report | ✓ | ✓ | ✗ | ✗ | `app/api/push/coverage/route.ts` (server) |
| Invite / manage members | ✓ | — | — | — | `app/api/members`, `invite` |
| Billing / subscription | ✓ | — | — | — | `app/api/billing/*` |
| Platform admin | platform owner only | — | — | — | `/api/admin/*` |

**The honest assessment:** authorization is *mostly* membership-based
(are you in this shop?) rather than capability-based (may you do this thing?).
`role_permissions` is a per-shop allowlist of **module names**, stored in
`shop_settings` — it is a navigation filter, not a permission system, and it is
evaluated in the browser.

**Can it support `payroll.read` / `salary_advances.approve`?** Not as-is. Module
allowlists cannot express "may read own salary but not others'". Payroll needs:

1. A capability enum, not module names.
2. Server-side evaluation on every read (RLS predicates, not UI filters).
3. Row-level scoping to *self* for employees, and to *organization* for owners.

This is the strongest argument for making **M2 (RBAC) precede M3 (Employees)** —
see §23.

---

## 7. Shop operations capability matrix

| Capability | Status | Source |
|---|---|---|
| Customers | **EXISTS** | `services/customerService.ts`, `features/customers/` |
| Vehicles | **EXISTS** | `services/vehicleService.ts`, `features/vehicles/` |
| Work orders / repair orders | **EXISTS** | `services/repairOrderService.ts` |
| Job cards | **EXISTS** | `services/jobCardService.ts` |
| Technician assignment | **PARTIAL** | `job_cards.technicians` is an array of **names**, matched per shop; `technicians.user_id` links to a login only where set (1 of 25) |
| Appointments | **EXISTS** | `services/appointmentService.ts` |
| Invoices | **EXISTS** | `services/invoiceService.ts` |
| Invoice line items | **EXISTS** (jsonb, not a table) | `invoices.lines` |
| Payments | **PARTIAL** | `services/paymentService.ts` — create/update/delete, no ledger |
| DVI / inspections | **EXISTS** | `services/inspectionService.ts`, `features/inspections/` |
| Vehicle status | **EXISTS** | `vehicles.status`, `ro_status_events` |
| Vehicle intake | **EXISTS** | triage / guided intake, `vehicles.damage_intake` |
| Vehicle release | **MISSING** | no release event, no gate on unpaid balance |
| Customer balances | **MISSING** | nothing computes or stores it |
| Receivables | **MISSING** | — |
| Time tracking | **PARTIAL** | `time_entries` + `services/timeTrackingService.ts`, feature-flagged |
| Parts inventory / orders / estimates | **EXISTS** | `features/parts/*` |
| Estimates | **EXISTS** | `services/estimateService.ts` |
| Customer portal | **EXISTS** | `/portal/[token]`, `/status/[token]`, `/inspection/[token]` |

---

## 8. Financial architecture

### The flow as it actually is

```text
customers ──< vehicles
    │
    └──< job_cards (text PK)
            │ job_card_id
            ├──< repair_orders ──(unique)── invoices.repair_order_id
            ├──< estimates
            ├──< inspections
            └──< invoices (PK = number)
                     ▲
                     │ invoice_number  (TEXT, no FK)
                  payments
```

### Findings

- **Totals are derived, never stored.** `calculateTotals()` in
  `services/invoiceService.ts:76` computes subtotal → discount → shop supplies →
  tax → total on every render. There is no `total` column.
- **Multi-currency is real and partly ad hoc.** Lines can carry their own
  currency; `calculateTotals` groups by currency and returns `byCurrency`, with
  `getEffectiveTotal()` picking a display amount. `lib/recordCurrency.ts` derives
  a record's currency from its lines.
- **Balance does not exist.** Nothing sums payments against an invoice. The
  invoice's `status` (`Draft`/`Paid`) is set manually.
- **Partial payments are not modelled.** `payments` rows are independent; there
  is no allocation table, so two partial payments and one overpayment are
  indistinguishable from three unrelated rows.
- **No FK between `payments.invoice_number` and `invoices.number`.** A payment
  can reference an invoice that does not exist, or be orphaned by a renumber.
- **Deposits are handled as negative invoice lines** (`services/__tests__/invoiceCredits.test.ts`),
  and `parts_orders` / `parts_estimates` have their own `deposit_paid` /
  `balance_due` / `deposit` columns. That is **three** deposit mechanisms.
- **No due-date enforcement, no overdue status, no aging, no payment promises,
  no credit notes, no write-offs, no adjustments, no refunds.** `due_date` exists
  on `invoices` and is not acted on.
- **Payments are mutable and hard-deletable** — `updatePayment()`,
  `deletePayment()` in `services/paymentService.ts:71,87`, with no audit trail.
- **Vehicle release is not gated on balance** because neither release nor balance
  exists.

### What is reusable for AR

| Target | Reuse | Build |
|---|---|---|
| Accounts receivable | `invoices` (+ `due_date`), `payments`, `customers` | allocation of payment→invoice; derived or materialised balance |
| Receivable aging | `invoices.due_date`, `payments.payment_date` | aging buckets as a **view**, not a table |
| Owner financial dashboard | `invoices`, `payments`, `repair_orders`, `usage_records` | nothing new — this is a query problem |
| Daily reconciliation | `payments.method`, `payment_date`, `currency` | a closing/period concept, which does not exist |

### Boundaries that must not be crossed

Three financial domains exist or are planned. They share vocabulary and nothing
else, and conflating them would be severe:

```text
1. SaaS BILLING        shop_subscriptions, commercial_plans, billing_events,
   (Redlined1 revenue)  usage_records, /api/billing/*, /api/webhooks/creem
                        ── money the SHOP pays REDLINED1

2. SHOP INVOICING      invoices, payments, estimates, parts_orders
   (shop revenue)       ── money the CUSTOMER pays the SHOP

3. PAYROLL (future)     ── money the SHOP pays its STAFF
```

**Rule for all future work:** no table, service, report or dashboard may join
across these three without an explicit, named, reviewed reason. In particular,
"revenue" on an owner dashboard means (2), never (1).

---

## 9. Employee / HR readiness

Current meanings:

| Term | Reality |
|---|---|
| `auth.users` | the credential |
| `profiles` | 1:1 with auth user; carries legacy `role` + single `shop_id` |
| `shop_users` | the real membership + role, many-to-many |
| `technicians` | **per shop**, a staff *directory* row: `name, role, phone, email, specialty, certifications, pay_type, pay_rate, hire_date, status, notes, user_id` |
| "employee" | does not exist |
| "staff" | does not exist |

`technicians` already contains: shop assignment ✓, hire date ✓, employment
status ✓, pay type ✓, pay rate ✓, phone/email ✓. It does **not** contain:
emergency contact, attendance, leave, payroll, advances, deductions, bonuses.

`time_entries` already contains `clock_in`, `clock_out`, `technician_id`,
`job_card_id` — job-linked time, which is closer to *labour costing* than to
attendance, but is the obvious base for both.

### Recommendation (not implemented)

**Do not create a parallel identity.** Use:

```text
auth.users ──1:1── profiles
                      │
                      └──< employees (organization-scoped, the HR record)
                                │
                                ├──< employment_assignments → shops   (replaces per-shop technicians rows)
                                ├──< attendance  (extends time_entries)
                                ├──< leave_requests
                                ├──< salary_records / salary_advances
                                └──< payroll_run_lines
```

with `technicians` retained as the **shop-facing directory view** so job cards,
which store technician *names*, keep working untouched. An `employees` row
should be reachable from a `technicians` row (`technicians.employee_id`) rather
than the other way round, so that the two shops' duplicate `John` rows collapse
onto one person.

Not every employee is a technician (advisors, cleaners, drivers), so
`employees` cannot simply be `technicians` renamed.

---

## 10. Service layer readiness

**This is the finding that determines the whole roadmap.**

| Service group | Client (`@/lib/supabase`) | Server-capable |
|---|---|---|
| customer, vehicle, jobCard, repairOrder, estimate, invoice, payment, inspection, appointment, technician, parts*, entityImage, timeTracking, alertEvent, portal, support, triage, campaign, dashboardLayout, documentNumber, globalSearch, maintenance, knowledgeGraph, repairCase, intelligentServiceAdvisor, aiService, vehicleImage, shopSettings | **~30 — browser only** | — |
| backupService, businessMemory, customerLifetimeIntelligence, dtcLookup, laborGuide, messagingSecrets, observability, partsInventory, scanTool, vehicleIntelligence, vinDecoder | — | pure / server-safe |
| shopSettingsService | both | both |

Business logic *is* factored into services — `createJobCard()`, `updateInvoice()`,
`createPayment()` exist as named functions. The problem is not structure, it is
**binding**: they close over a browser Supabase client and over
`getShopIds()`, which reads a module-level mutable in `lib/shopStore.ts` set
during sign-in.

That means:

- An API route cannot call `createPayment()`.
- An MCP tool cannot call `getCustomerBalance()`.
- A WhatsApp webhook cannot call `createAppointment()`.
- Any of those would have to **reimplement** the logic, producing exactly the
  duplicate systems this audit is meant to prevent.

### Required shape

```text
services/            → thin browser adapters (unchanged public API)
        ↓ delegates to
domain/<entity>.ts   → pure functions taking (db, ctx: {orgId, shopIds, actorId, role})
        ↑ called by
app/api, MCP tools, webhooks, cron, AI tool layer
```

The tenancy context must become an **explicit argument**, not ambient state.
That single change is what makes the same code safe to run for a browser
session, a service-role webhook, and an AI tool.

---

## 11. API readiness

| Dimension | State |
|---|---|
| Route count | 101 |
| Auth | Bearer JWT via `lib/serverAuth.ts` `requireShopRole()` — **good**, and it treats `shopId` as a resource identifier, never as proof |
| Consistency | **mixed** — some routes hand-roll the same check (`app/api/role-permissions/route.ts`) instead of using `requireShopRole` |
| Validation | `zod` in **1 of 101** routes |
| Rate limiting | **none** |
| Idempotency | only in `lib/intelligence-bus/idempotency.ts` and billing |
| Versioning | none |
| Pagination | no convention |
| Error model | ad hoc `{ error }`; `lib/errorMessage.ts` exists client-side |
| OpenAPI | none |
| Webhooks (inbound) | Creem, Stripe only |
| Webhooks (outbound) | `rib_subscriptions` + `rib_event_deliveries` exist, **0 rows** |
| Cron | **none** (`vercel.json` absent) — `sapelee/flush` and `intelligence/*` recalculation are manual scripts |

**Recommendation:** `/api/v1` should **not** wrap the current routes. It should
be a thin HTTP surface over the extracted domain layer (§10). Wrapping first
would harden the coupling that needs removing. The existing `requireShopRole` is
the right authorization primitive to build on.

---

## 12. Event architecture

Four mechanisms exist. This matters, because the instinct would be to build a
fifth.

| Mechanism | State | Fit for domain events |
|---|---|---|
| **RIB** — `lib/intelligence-bus/` + `rib_events`, `rib_subscriptions`, `rib_event_deliveries` | Fully built: publish, subscribe, idempotency, loop guard, payload/secret guard, replay endpoint, append-only store, envelope carries `organization_id`. **0 rows — dormant.** | **Best fit. Adopt, do not rebuild.** |
| **Sapelee outbox** — `sapelee_event_outbox` | Working: `idempotency_key`, `status`, `attempts`, `max_attempts`, `next_attempt_at`, `correlation_id`. 67 rows. | Proven delivery pattern; the transactional half RIB needs |
| **Postgres triggers** — `alert_*`, `notify_push_on_alert` | Working in production, 8 alert events | Correct for in-transaction fan-out; **fragile** — two outages traced to trigger bugs (`NEW.id` on a table keyed on `number`; `22P02` on a text[] append) |
| **Supabase Realtime** | Working, one channel per subscriber | Live UI only; **two channels on one topic took production down** — documented in `components/AlertToaster.tsx` |

### Recommended direction

```text
domain service (one transaction)
   ├── writes business rows
   └── writes event row      ← same transaction (outbox)
                │
      relay (cron / pg_net)
                │
   ┌────────────┼──────────────┬─────────────┐
 in-app      web push      webhooks      AI / WhatsApp
```

Two rules the current triggers already violate in spirit:

1. **Domain events must be emitted by the service layer, not by triggers.** A
   trigger cannot know the actor's intent, cannot be tested without a database,
   and — as proven twice — a bug in it *blocks the business operation itself*.
2. **External delivery must never happen inside the transaction.** Write to the
   outbox; deliver after commit; dedupe on `idempotency_key`.

---

## 13. MCP readiness

**MCP does not exist in this repository.** Searches for `mcp`, `Model Context
Protocol`, `jsonrpc`, `json-rpc`, `SSE`, `Streamable HTTP` returned one
irrelevant substring match in `lib/logo.ts`.

Recommended placement — an adapter, never a database client:

```text
                 domain/ (§10)
                      │
      ┌───────────────┼────────────────┐
   app/api/v1     mcp-server        AI tools
      │               │                │
   REST client    AI clients       receptionist
```

Feasibility given today's code: **blocked until §10 is done.** An MCP tool
cannot call today's services at all.

Tool tiers, once the domain layer exists:

| Tier | Tools | Gate |
|---|---|---|
| Read | `search_customer`, `lookup_vehicle`, `get_vehicle_history`, `get_open_work_orders`, `get_invoice`, `get_customer_balance`, `list_overdue_invoices`, `get_shop_summary` | org policy + role |
| Controlled write | `create_appointment`, `create_customer_note`, `create_follow_up`, `create_draft_estimate` | org policy + role + audit row |
| High risk | `record_payment`, `refund_payment`, `modify_invoice_total`, `approve_salary_advance`, `run_payroll`, `release_vehicle` | **human approval step**, never autonomous |

Payroll and salary tools should not exist in the MCP surface at all in the first
generation.

---

## 14. AI architecture readiness

**Already substantial:**

- `lib/platform/ai/AiProvider.ts` — provider-agnostic interface with a documented
  rule: *"The orchestrator and all engines call this interface — never providers
  directly."* Fallback chain primary → secondary → mock.
- Providers: `OpenAiProvider.ts`, `AnthropicProvider.ts`.
- Config: `AI_PROVIDER`, `AI_MODEL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `DIAGNOSTIC_OPENAI_MODEL`, `DIAGNOSTIC_CLAUDE_MODEL`.
- Quota: `lib/ai/aiQuota.ts` with `AI_DAILY_LIMIT_FREE` / `AI_DAILY_LIMIT_PRO`.
- Consumers: `/api/ai`, `/api/chat`, `/api/support/assistant`, the whole
  `intelligence/*` estate, `lib/diagnostics/providers/`.

**Gaps:**

- `ai_usage_logs` — **migration exists, table absent from the live database.**
  Token accounting is therefore not being persisted. This is a real drift bug,
  not a design choice.
- No prompt registry or versioning; prompts are inline.
- No per-organization AI policy.
- No tool layer — AI today reads through purpose-built endpoints, which is
  accidentally safe but not a designed boundary.

**Architectural rule to adopt explicitly:**

```text
AI  →  Tool Policy Layer  →  domain services  →  RLS  →  data
```

AI must never hold a database handle, and must never be given the service-role
key. Each capability is a named tool with a typed schema, an org policy flag, a
role requirement, and an audit row.

---

## 15. WhatsApp readiness

**Current state:** outbound only, over **Twilio**, not the Meta Cloud API.
`app/api/send-message/route.ts` sends via
`https://api.twilio.com/.../Messages.json` with a `whatsapp:` prefix on `From`
and `To`. Per-shop credentials (`twilio_sid`, `twilio_token`, `twilio_from`,
`sms_enabled`, `whatsapp_enabled`) come from `services/messagingSecretsService.ts`.

Notably good: the route **never takes the recipient from the request body** — it
resolves it server-side from the shop's own records.

**Missing for a receptionist:** everything inbound. No webhook, no conversation,
no message store in use, no delivery events, no channel connection model, no
human handoff.

**Phone normalisation:** `customers.phone` is free text. Nothing normalises to
E.164. Matching an inbound WhatsApp number to a customer will fail on real Lao
data (leading `0`, `+856`, spaces) unless normalisation is added first.

Recommended structures — none of which exist today, so no duplication risk
except `messages` (0 rows, unused; either adopt or drop it, do not leave both):

```text
channel_connections        (shop_id, channel, credentials_ref, status)
conversations              (shop_id, channel, external_id, customer_id?, state, assigned_to)
conversation_participants
messages                   (conversation_id, direction, body, media, external_id)
message_delivery_events    (message_id, status, provider_payload)
ai_conversation_state      (conversation_id, mode: ai|human, context)
human_assignments
```

**Integration must be an adapter.** No work-order or invoice code may import
messaging. The path is: webhook → adapter → conversation service → AI policy →
domain services.

---

## 16. Customer communication timeline

Nothing generic exists. `ro_status_events` covers repair orders only;
`alert_events` is a notification feed, not history; `audit_logs` is empty.
`entity_images` is the one polymorphic precedent that works.

Options:

| Option | Pros | Cons |
|---|---|---|
| **A. Polymorphic `activities` table** | one query, simple UI, easy to extend | write coupling everywhere; risks becoming a dumping ground |
| **B. Event projection from RIB** | single source of truth; replayable; already built | requires RIB to be live first; eventual consistency |
| **C. Reuse `audit_logs`** | no new table | audit and timeline are different audiences — an audit log must be complete and immutable, a timeline must be curated and editable-in-presentation |
| **D. Query aggregation across domain tables** | zero write cost, always accurate | N queries per view; cannot include WhatsApp without a message store; poor pagination |

**Recommendation: D first, then B.** Start with aggregation — it is honest,
needs no new tables, and works today. Once RIB is live (§12), project the same
events into a read model and swap the query. Explicitly **not C**: conflating
audit with timeline is how audit logs get edited.

---

## 17. Voice readiness

Nothing exists. No `MediaRecorder`, no audio `getUserMedia`, no speech API, no
transcription. `components/camera/CameraCapture.tsx` and `lib/vin/scanVin.ts`
prove the PWA permission model and media plumbing work for video.

- **V1 dictation** — feasible now. `MediaRecorder` → upload → server-side
  transcription → text into a field. Needs a new storage path (`shop-assets` is
  image-MIME-restricted: `allowed_mime_types` is jpeg/png/webp/heic/heif, and
  10 MB) — audio would need its own bucket or a widened MIME list.
- **V2 voice commands** — depends entirely on the AI tool layer (§14) and the
  domain layer (§10). Not startable before those.
- **V3 realtime conversational** — out of scope for this horizon.

Backend sharing: transcription must be a server endpoint
(`/api/v1/voice/transcribe`) so that browser, PWA and any native client use the
same path. Do not put a provider key in a client.

---

## 18. Mobile / PWA readiness

| Item | State | Evidence |
|---|---|---|
| Manifest | ✓ `Redlined1 — Shop Operations`, `start_url: /login`, `display: standalone`, 4 icons | `public/manifest.json` |
| Service worker | ✓ install / activate / fetch / message / push / notificationclick | `public/sw.js` |
| Offline | ✓ cache-first with network fallback | `public/sw.js` fetch handler |
| Web push | ✓ live, VAPID, iOS-installed-app aware | `lib/push/subscribe.ts` |
| Installability | ✓ verified on a real iPhone | |
| Camera | ✓ | `components/camera/CameraCapture.tsx` |
| Microphone | ✗ | — |
| Responsive | ✓ (760px breakpoint work, `100dvh` handling) | `app/globals.css` |
| Expo / React Native | **absent** | |

**Recommendation: (A) share the same backend/API, single repository, no
monorepo restructure yet.** A native client is only worth it for camera-heavy
technician workflows and background reliability; both are already adequate in
the PWA. Revisit only after `/api/v1` exists — a native app without a versioned,
authenticated API would be built against internals and would break constantly.

---

## 19. Notification infrastructure

| Channel | State |
|---|---|
| In-app toasts | ✓ `components/AlertToaster.tsx` |
| Notification panel | ✓ `lib/useNotifications.ts` + `ro_status_events` |
| Web push | ✓ trigger → `pg_net` → `/api/push/send` → web-push |
| Email | ✓ for inspections (`/api/inspection-email`) |
| SMS / WhatsApp | ✓ outbound via Twilio |
| Mobile push | via PWA only |
| Retries / delivery tracking | **only** in `sapelee_event_outbox` |
| Queues | none |

Target, once RIB is live:

```text
domain event → outbox → notification service → { in-app, web push, WhatsApp, email }
```

The per-role preference model (`lib/alerts/catalogue.ts`, storing *disabled* ids
so new alerts default on) is good and should be extended, not replaced.

---

## 20. Back Office gap matrix

| Capability | Status | Basis / dependency |
|---|---|---|
| Employees | **EXTEND EXISTING** | `technicians` (pay_rate, hire_date, status, user_id) + `shop_users`; needs an org-scoped `employees` record to de-duplicate people across shops |
| Attendance | **EXTEND EXISTING** | `time_entries` has clock_in/clock_out; needs day-level records, absence, and separation from job costing |
| Leave / days off | **NEW MODULE** | nothing exists |
| Salary | **PARTIAL** | `technicians.pay_type`, `pay_rate` exist but are unversioned — salary history is required |
| Salary advances | **NEW MODULE** | nothing exists |
| Payroll | **NEW MODULE** | depends on employees + attendance + salary + advances |
| Expenses | **NEW MODULE** | nothing exists; `parts_orders` costs are inventory, not expenses |
| Accounts receivable | **NEW MODULE** | reuses `invoices` + `payments`; needs allocation + balance |
| Receivable aging | **NEW (view)** | derived from AR; no table needed |
| Daily cash reconciliation | **NEW MODULE** | needs a period/closing concept that does not exist |
| Management reporting | **PARTIAL** | `features/reports/`, `/api/intelligence/*`, `admin/billing-health` exist but report on different domains |
| Owner dashboard | **EXTEND EXISTING** | `features/dashboard/` + Command Center + `react-grid-layout` already support draggable widgets |
| Internal events | **REUSE EXISTING** | **RIB is built and dormant — activate it** |
| REST API v1 | **NEW** | blocked on §10 |
| API keys / scopes | **NEW** | nothing exists |
| Outbound webhooks | **REUSE EXISTING** | `rib_subscriptions` / `rib_event_deliveries` |
| AI tool layer | **NEW** | `AiProvider` exists; the tool/policy boundary does not |
| MCP | **NEW** | blocked on §10 |
| WhatsApp inbound | **NEW** | outbound exists; conversations do not |
| AI receptionist | **NEW** | blocked on conversations |
| Shared inbox | **PARTIAL** | `support_tickets` / `support_messages` is the working pattern to generalise |
| Voice | **NEW** | nothing exists |
| Native mobile | **NEW** | blocked on API v1 |

---

## 21. Security findings

### CRITICAL

**C1 — Payments are mutable and hard-deletable with no audit trail.**
`services/paymentService.ts:71,87`. Combined with an empty `audit_logs`, a
payment can be altered or erased leaving no evidence. Before any AR, payroll or
AI-write work, payments must become append-only with reversal entries.

**C2 — `audit_logs` is a stub and nothing writes to it.**
`supabase-schema.sql:164` — `action, "user" text, entity, time text`. No
`shop_id`, no actor uuid, no before/after, no append-only enforcement, 0 rows.
Every future financial and HR obligation in this plan assumes an audit log
exists. It does not.

### HIGH

**H1 — Tenancy depends on a browser-held variable.** `getShopIds()` reads a
module-level mutable in `lib/shopStore.ts`, and every service filters with it.
RLS is the real defence, but any code path where an RLS policy is permissive and
the filter is wrong leaks across shops. This has already produced fixes
(`2026-08-02_close_remaining_tenant_leaks.sql`).

**H2 — No rate limiting on any of 101 routes**, including `/api/ai`,
`/api/chat`, `/api/support/assistant` and `/api/send-message` — endpoints that
cost money per call and can send messages to customers.

**H3 — Input validation is effectively absent.** `zod` is a dependency and is
used in 1 route.

**H4 — Payroll data has no isolation model yet.** With module-name-based
`role_permissions` evaluated client-side, there is no mechanism today that would
stop a manager reading another employee's salary once the column exists.

**H5 — Schema drift between migrations and the live database.**
`ai_usage_logs` has a migration and does not exist. If that is true of one table,
the migration set is not a reliable description of production.

**H6 — Business-critical triggers are unversioned logic in the database.** Two
production outages already originated there (invoice payments blocked for three
days by `NEW.id` on a table keyed on `number`; a `22P02` array-literal bug that
would have blocked every job card edit). PL/pgSQL is not type-checked at
`CREATE`, so a clean migration proves nothing.

### MEDIUM

**M1 — `payments.invoice_number` has no foreign key** to `invoices.number`.
Orphan and mismatch are both possible.

**M2 — `job_cards.technicians` stores names, not ids.** Renaming a technician
silently detaches their history; two shops with the same name collide.

**M3 — Duplicate identity surfaces**: `profiles.role` / `profiles.shop_id`
alongside `shop_users`; an empty `users` table alongside `profiles`.

**M4 — Three deposit mechanisms** (negative invoice lines,
`parts_orders.deposit_paid`, `parts_estimates.deposit`).

**M5 — No inbound webhook authentication pattern beyond billing.** WhatsApp will
need signature verification and replay protection; the only precedent is
`x-push-secret`, a shared secret duplicated inline in a database trigger.

**M6 — No cron.** Anything requiring scheduled delivery (outbox relay, aging,
reminders) currently has no runner.

### LOW

**L1** — `npm audit` reports 6 pre-existing high-severity advisories (not
re-verified in this audit; carried forward from prior sessions).
**L2** — ESLint config crashes (`Converting circular structure to JSON`), so lint
is not enforced anywhere.
**L3** — `messages`, `technician_tasks`, `payment_events`, `subscriptions`,
`license_checks`, `observability_logs`, `intelligence_events` are declared and
unused — future duplication traps.

---

## 22. Technical debt that could block expansion

1. **Browser-bound service layer** (§10) — blocks API, MCP, WhatsApp, voice, native.
2. **Ambient tenancy** (`getShopIds`) — blocks any non-browser caller.
3. **No audit log** — blocks payroll, AR, AI writes, and any compliance story.
4. **Mutable payments** — blocks reconciliation and AR integrity.
5. **No organization tier** — blocks multi-location payroll and org-level reporting.
6. **Per-shop `technicians` rows** — will double-count people in payroll.
7. **Trigger-based business logic** — repeated production risk.
8. **Schema drift** — the migration set cannot currently be trusted as truth.
9. **SPA with no routes** — every deep link, notification target, and AI "show me
   this record" answer has to go through one bespoke `?alert=` mechanism.
10. **No lint, no rate limiting, no validation** — the guardrails a larger API
    surface assumes.

---

## 23. Recommended target architecture

```text
                        ┌───────────────────────────────┐
                        │        domain/  (pure)        │
                        │  ctx = {orgId, shopIds,       │
                        │         actorId, role}        │
                        │  customers  vehicles  jobs    │
                        │  invoices   payments  parts   │
                        │  employees  attendance        │
                        │  payroll    expenses  AR      │
                        └───────────────┬───────────────┘
                                        │ every write also
                                        │ writes: audit row + outbox event
        ┌───────────────┬───────────────┼───────────────┬────────────────┐
        │               │               │               │                │
   services/        app/api/v1      mcp-server     tool policy      outbox relay
   (browser)         + API keys      (AI clients)   layer (AI)       (cron)
        │               │               │               │                │
      Web UI      native / partners   Claude etc.   receptionist    push · webhooks
        │                                                │            · WhatsApp
      PWA                                            WhatsApp          · email
                                                      adapter
```

Deviations from the brief's suggested structure, with reasons:

- **Events sit under the domain layer, not beside it.** Emitting from services
  rather than triggers is the correction for two production incidents.
- **Audit is not optional and not a module** — it is a side effect of every
  domain write, in the same transaction.
- **Back Office is not a separate top-level tree.** Employees, payroll and AR are
  domain entities alongside invoices; a parallel tree invites a parallel
  identity model, which §9 warns against.
- **RIB is adopted, not rebuilt.** It already exists with the right properties.

---

## 24. Recommended M1–M25 sequence

The proposed order front-loads features and defers the foundations they depend
on. Recommended reordering:

| # | Milestone | Change |
|---|---|---|
| **M1** | **Domain layer extraction + tenancy context + audit log + organizations** | **NEW — was "back-office foundations"** |
| M2 | Capability-based RBAC + RLS expansion | unchanged position, now able to use ctx |
| M3 | Payments hardening: append-only, reversals, invoice FK | **moved up from M8/M9** — C1/C2 block everything financial |
| M4 | Employees (org-scoped, de-duplicating `technicians`) | was M3 |
| M5 | Attendance + leave (extending `time_entries`) | was M4 |
| M6 | Salary (versioned) + advances | was M5 |
| M7 | Payroll | was M6 |
| M8 | Expenses | was M7 |
| M9 | Receivables + aging | was M8 |
| M10 | Cash reconciliation + period closing | was M9 |
| M11 | Owner dashboard / reporting | was M10 |
| **M12** | **Activate RIB + outbox relay + cron** | **moved up from M11** — needed before WhatsApp and notifications |
| M13 | API v1 over the domain layer | was M12 |
| M14 | API keys + scopes + outbound webhooks | was M13 |
| M15 | AI tool + policy layer | was M14 |
| M16 | MCP adapter | was M15 |
| **M17** | **Conversations + inbound messaging (phone normalisation first)** | **moved up — was M16/M18** |
| M18 | WhatsApp channel adapter | was M16 |
| M19 | AI receptionist | was M17 |
| M20 | Shared human/AI inbox | was M18 |
| M21 | Voice transcription (dictation) | was M19 |
| M22 | AI voice commands | was M20 |
| M23 | PWA/mobile hardening | was M21 |
| M24 | Expo / native (only if API v1 is stable) | was M22 |
| M25 | WhatsApp voice notes → transcription | was M23 |
| M26 | AI owner assistant | was M24 |
| M27 | Security hardening | was M25 — **but C1/C2/H2/H3 must not wait this long** |

Dependency corrections driving the reorder:

- Service extraction **must** precede API v1, MCP, AI tools, WhatsApp and native.
- The audit log **must** precede payroll, AR and AI writes.
- Conversations **must** precede the receptionist.
- Phone normalisation **must** precede WhatsApp customer matching.
- Cron **must** exist before any outbox-driven delivery.
- API authentication **must** precede external mobile clients.

---

## 25. Proposed M1 scope

**Objective:** make business logic callable from outside the browser, with
explicit tenancy and a real audit trail — without changing a single thing a user
sees.

### Not in scope
No UI change, no new user-facing feature, no HR tables, no AR logic, no AI.

### Tables

| Table | Action |
|---|---|
| `organizations` | **new** — `id, name, slug, created_at` |
| `shops` | **add** `organization_id uuid null references organizations(id)`, back-filled; stays nullable in M1 |
| `audit_events` | **new** — replaces the unusable `audit_logs`; `id, organization_id, shop_id, actor_user_id, actor_role, action, entity_type, entity_id, before jsonb, after jsonb, metadata jsonb, request_id, created_at` |
| `audit_logs` | **leave untouched** — 0 rows; deprecate in a later milestone rather than dropping during a foundation change |

### Enums
`audit_action` (`create` / `update` / `delete` / `reverse` / `approve` / `reject`).
No enum on `entity_type` — a text column with a check is cheaper to extend.

### Functions / policies
- `append_only_audit_events()` trigger rejecting `UPDATE` and `DELETE`.
- RLS on both new tables: read scoped to organization membership derived through
  `shops` → `shop_users`; **insert only via `SECURITY DEFINER`** from the domain
  layer, never directly by `authenticated`.
- No changes to any existing policy.

### Service-layer work
- New `domain/` directory. Port **three** entities only — `customers`,
  `invoices`, `payments` — as pure functions taking `(db, ctx)`.
- `services/customerService.ts`, `invoiceService.ts`, `paymentService.ts` become
  thin adapters that build `ctx` from `shopStore` and delegate. **Their exported
  signatures do not change**, so no view is touched.
- `lib/tenancy.ts`: `buildBrowserContext()` and `buildServerContext(req)`.

### UI routes
None.

### Tests (all must be new, and must fail before the change)
- tenancy: a ctx for shop A cannot read or write shop B, for each ported entity
- audit: every domain write produces exactly one `audit_events` row with actor and before/after
- append-only: `UPDATE` and `DELETE` on `audit_events` are rejected
- adapter equivalence: browser service functions return identical results pre/post port
- org back-fill: every existing shop has an `organization_id`
- RLS: anonymous and cross-org reads return zero rows

### Migration order
1. `organizations`
2. `shops.organization_id` (nullable) + back-fill + index
3. `audit_events` + append-only trigger + RLS
4. grants

Each migration must be **executed in a rolled-back transaction first** — a clean
`CREATE FUNCTION` proves nothing (§21 H6).

### Rollback
1. Revert the application commit (adapters delegate → adapters inline again).
2. `DROP TABLE audit_events;`
3. `ALTER TABLE shops DROP COLUMN organization_id;`
4. `DROP TABLE organizations;`

Safe in that order because nothing reads `organization_id` in M1 and
`audit_events` has no dependants.

### Definition of done
- All existing 1541 tests still pass, plus the new suites.
- Three services delegate to `domain/` with unchanged signatures.
- A route handler can call `domain/invoices.get()` with a server context — proven
  by a test, not by assertion.
- Every write through the three ported entities produces an audit row.
- Staging verified by a human on a real device before merge.
- Production behaviour visibly unchanged.

---

## 26. STOP / GO

```text
GO WITH PRECONDITIONS
```

The foundation is better than the brief assumes — real tenancy, holding RLS,
a genuine AI abstraction, a complete dormant event bus, working billing
separation, 1541 passing tests. This is not a codebase that needs rewriting.

But four things must be true before **any** Back Office or AI-write milestone
begins:

1. **The domain layer is extracted with explicit tenancy context** (M1). Without
   it, every one of API v1, MCP, WhatsApp, voice and native rebuilds the business
   rules, which is the specific failure this plan exists to avoid.
2. **A real audit log exists and is written by every domain write** (M1). Payroll
   and receivables cannot be built on a table with `time text` and zero rows.
3. **Payments become append-only with reversals, and gain a foreign key**
   (M3, moved up). Mutable, deletable, unaudited money is the single highest risk
   in the current system.
4. **Schema drift is reconciled.** `ai_usage_logs` exists as a migration and not
   as a table. Until the migration set matches production, no migration-based
   plan is trustworthy.

Rate limiting and input validation (H2, H3) should be pulled forward opportunistically
rather than waiting for a hardening milestone at the end.

---

## 27. Production safety confirmation

```text
No production data changed          ✓
No production schema changed        ✓
No migrations executed              ✓
No deployment performed             ✓
No environment variables changed    ✓
No billing settings changed         ✓
No integration credentials changed  ✓
No source behaviour changed         ✓
```

Read-only database access was used to verify schema, row counts and RLS
behaviour. No customer, employee or financial records are reproduced in this
document.

Artefact created: `docs/m0-architecture-audit.md` on branch
`audit/m0-backoffice-platform` — **not merged, not pushed.**
