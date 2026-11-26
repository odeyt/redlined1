# Machine API for bots: plan and build record

Status: **APPROVED 2026-11-24.** Phase 1 (estimate domain port) is built.
Phase 2 (migration + flag) is written, with numbering option A chosen on
2026-11-25; the owner has not applied it yet. Phase 3 (read endpoints) is
built behind the flag. Phase 4 (draft writes and convert) is built behind the
flag. Phase 5 (PDFs) is built behind the flag. Phase 6 (owner API Keys
screen and badge) is built behind the flag. Phase 7 (docs, smoke-test script,
rollout runbook) is done. **All build phases are complete.** What remains is
the owner's rollout in [`ROLLOUT.md`](ROLLOUT.md): review and merge, apply the
migration, test a read-only key on a preview, then switch on production.

**Phase 7 notes:**
- `scripts/api-smoke.ts` is the brief's Part 4 checklist, adapted to the real
  API (`rl_live_` keys, the actual error codes, no finalize or webhooks). It is
  read-only by default. `--write`, `--convert` and `--rate-limit` are opt-in.
  `app/api/v1/__tests__/apiSmoke.test.ts` runs it against the real route
  handlers, so a check that always passes would fail the suite.
- **Brief items not built, on purpose:**
  - `openapi.json` is not served: the contract lives in `openapi.yaml`.
  - No `.env.example` additions: no new environment variables are needed.
  - Finalize, webhooks and MCP are deferred (Q3).
  - The idempotency cleanup job would delete production rows, which needs the
    owner's approval.

**Phase 6 notes:**
- Settings → API Keys is for owners only and hidden while `api_v1_documents`
  is off (`features/settings/ApiKeysPanel.tsx`). The server side is
  `app/api/api-keys/route.ts`.
- Keys issued there are always limited to the owner's shop. The secret is
  shown once. Only its hash and an 8-character prefix are stored.
  Organization-wide keys (issued with `scripts/api-key.ts`) are listed but
  can only be revoked by an operator.
- Issuing and revoking are audited as `api_client.issued` and
  `api_client.revoked`, through the owner's own session, so the row names the
  owner. If the audit row can't be written, the new key is revoked and its
  secret is never shown.
- Each key shows its last 5 API actions in this shop, taken from the audit log.
- The "Created by API" badge is on estimate and invoice list rows and detail
  headers. It doesn't name the key: the browser can't read `api_keys`, by
  design. Owners see key names in Settings.
- Not checked in a browser against real data: the panel stays hidden until
  the flag is on, and there is no staging database. It is covered by render
  tests.

**Phase 5 notes:**
- `buildPdf` was moved verbatim to `lib/documents/pdf.ts`, and the email
  route imports it. On 2026-11-25 its output was checked byte for byte against
  the previous route's code on 4 documents: identical apart from pdf-lib's
  creation timestamps.
- **Pre-existing issue in the email PDF, not changed:** `send-document` adds
  every line into one subtotal whatever its currency, so an estimate with THB
  and USD lines gets one mixed figure. The staff screens and the API leave the
  other-currency lines out. The API PDF uses the screens' totals. Fixing the
  emailed PDF is a separate change to a customer-facing path.
- `pdf:read` is required in addition to the read scope, so a key can be given
  the data without the printable document.

**Phase 4 decisions made while building (owner may revisit):**
- **No invoice plan cap.** §8 said `requireCapacity('invoices')`, but
  `unlimitedInvoices` is a yes/no flag with no number, and nothing in the app
  limits invoices on any plan. The API matches the staff screens.
- **Default currency** follows the staff forms: THB for the two D1 shops, USD
  otherwise. A test pins the D1 list to the one in the forms. A key may send
  LAK, THB or USD.
- **Margin guard:** a key may not replace the lines of a draft whose lines
  carry cost, markup or parts-source data, because it cannot see them. Its
  other fields stay editable.
- **Audit field names** are `api_client_id` and `api_client_name`. The audit
  redactor blanks anything named `api_key*` as a secret.
- Converting copies the estimate's lines, discount and tax rate as stored, as
  the staff screen does. Cost and markup stay on the invoice for the shop and
  are never returned.

**Deviation found in phase 3:** `updated_since` (agreed in Q3) cannot be
built yet. Neither `estimates` nor `invoices` has an `updated_at` column in
any schema file in the repo. Keeping one current would need a trigger or
edits to every write path, staff screens included.

**Decided 2026-11-25: keep `created_since`.** No `updated_at` column, no
trigger, no change to staff save paths. Bots find new documents with
`created_since` and check a known document for changes by reading it by id.
`updated_since` stays refused with a 422. Revisit only if a bot actually needs
change polling.

## Owner decisions (2026-11-24)

- **Q1, AI agents:** "I approve external Grok Bot agents creating and editing
  draft estimates and invoices through API v1. They're not approved to send,
  approve, finalize, record payments, void or delete."
- **Q2:** extend the existing API v1. No second key or auth system.
- **Q3:** core first. Finalize, webhooks and the MCP connector are deferred.
  Bots poll with the `updated_since` filter.
- **Q4–Q7:** go with the plan's recommendations unless one changes how money
  or customer data works:
  - Q4: `discount` and `tax_rate` are not settable by a bot (shop defaults).
    Document and line `currency` are limited to what the staff screens already
    allow (LAK, THB, USD), defaulting to the shop's currency. This matches the UI.
  - Q5: API conversion requires an Approved estimate.
  - Q6: no staging database. The migration goes to production with the flag off.
  - Q7: the owner checks for existing keys (`npx tsx scripts/api-key.ts list`)
    before rollout. This doesn't block the build.
- **Rollout:**
  1. Keep `api_v1_documents` off in production until a **read-only** key has
     been tested on a preview deploy.
  2. Then turn on write access for the **RedlineD1 CRM** key only.
  3. **Wally Bot stays read-only** (`customers:read`, `vehicles:read`,
     `estimates:read`, `invoices:read`).
Branch: `feature/machine-api-v1` (from `main` at `dc1f628`).
Brief: `CLAUDE_CODE_PROMPT.md` (Grok Bot agents drafting estimates and invoices).

---

## 0. The headline finding

**The brief assumes Redlined1 has no machine API. It has one.** API v1 shipped
in August 2026 (M13.1–M13.3):

| Already live | Where |
|---|---|
| Keys: `rl_live_<32 hex>`, SHA-256 at rest, shown once, revocable, org-owned and optionally shop-scoped | `lib/api/principal.ts`, `scripts/api-key.ts`, table `api_keys` |
| Scopes, deny-by-default, mapped to domain capabilities | `lib/api/scopes.ts` |
| One wrapper: request id → auth → rate limit → scope → tenant → domain | `lib/api/handler.ts` (`withApi`) |
| Idempotency, reserve-first (race proven and fixed) | `lib/api/idempotency.ts`, table `api_idempotency` |
| Rate limit: 120/min per key, in Postgres, no Redis | RPC `api_rate_limit_hit` |
| Stable error codes, `{data, meta}` envelope, OpenAPI contract | `lib/api/errors.ts`, `docs/api/openapi.yaml`, `docs/api/README.md` |
| Org-level plan entitlement checks (built, not yet called) | `lib/api/entitlements.ts` |
| Endpoints: customers (list/get/create), vehicles (list/get/create/patch), appointments | `app/api/v1/*` |
| Policy for what may be exposed, and in what order | `docs/m13-api-readiness.md` |

**Recommendation: extend this API rather than build the one the brief
describes.** Building a second key system, a second error format and a second
idempotency table next to the first would give two implementations of the same
security rules. The v1 contract (`docs/api/README.md`) also promises callers
that existing codes and shapes will not change within v1.

So where the brief and the live API disagree, this plan keeps the live API:

| Brief says | Live API does | Plan |
|---|---|---|
| Key prefix `rl1_live_` | `rl_live_` | Keep `rl_live_` |
| HMAC with `API_KEY_PEPPER` | SHA-256 of a 128-bit random secret | Keep. A pepper protects low-entropy secrets; these are random. Adding one would invalidate every issued key. |
| Error codes `invalid_state`, `{error:{code,details}}` | `CONFLICT`, `VALIDATION_FAILED`… same envelope shape | Keep the existing codes. A non-draft edit is `409 CONFLICT` with a `reason`. |
| Cursor pagination | `page` / `page_size` (max 100) + `has_more` | Keep, and add `updated_since` to the new list endpoints |
| Upstash / Redis rate limit | Postgres counter | Keep. No new infrastructure. |
| `Idempotency-Key` required on POST | Optional | **Required** on the new POST endpoints only (additive for v1) |
| New `ApiAuditLog` table | `record_audit_event` RPC → `audit_events`, actor type `api` | Reuse, and add the key id and name to `metadata` (today the key is not recorded, which is a gap) |
| Vercel Cron for webhooks | Scheduled jobs are GitHub Actions (`domain-event-relay.yml`, etc.) | Follow the repo: GitHub Actions |
| Vitest if no tests | Jest + ts-jest, 300+ suites; Playwright smoke | Jest |

---

## 1. Inspection results

1. **Framework:** Next.js 16 (App Router), React 19, TypeScript strict, Node
   runtime route handlers. Vercel deploys from `main`, project
   `redlined1-s-projects/redlined1`.
2. **Database:** Supabase Postgres with RLS. No ORM: `@supabase/supabase-js`.
   Migrations are hand-written SQL in `supabase/migrations/`, **applied by the
   owner in the SQL editor** (not the Supabase CLI). Claude has no production DB
   access.
3. **Auth:** Supabase Auth for people. API keys are not Supabase users, so the
   API uses the service-role client, and tenant scoping is enforced by the
   domain layer (`context.shopIds` for reads, `context.shopId` for writes, both
   from the key). Roles live in shop memberships (`owner`, manager, technician…);
   `role === 'owner'` gates owner-only screens.
4. **Tenancy:** `organizations` → `shops` (`shops.organization_id`); every
   business table has `shop_id`. Production D1 was merged into Location 2 on
   2026-10-17, so a D1 bot key would be shop-scoped to Location 2.
5. **Real models** (see the mapping in §2). The ones the brief guesses wrong:
   - **Customers** have one `name`, not first/last. No structured address.
   - **Estimates** (`estimates`, PK `id` uuid) store the vehicle as **free
     text** (`vehicle`), not a vehicle id. No odometer column.
   - **Invoices** (`invoices`, **PK `number`**, no `id`) also store `customer`
     and `vehicle` as text. There is **no link from an invoice to its
     estimate**; conversion only writes "Converted from EST-0042" into notes.
   - **Line items** are JSONB `{description, laoDescription?, note, qty, rate,
     currency?, cost?, markup?}`. There is **no line type**
     (labor/part/fee) and **no per-line taxable flag**. `cost` and `markup`
     are the shop's internal margin.
   - **Money** is decimal in the document's currency (USD, THB, LAK), and each
     line may carry its own currency. Not integer cents. The API will return
     decimals plus currency codes, as the existing totals code does.
   - **Numbering:** `next_document_number(p_shop_id, p_doc_type)` RPC, row-locked:
     `EST-0001`, `INV-0001`. Only a browser wrapper exists today.
6. **Totals:** `lib/domain/estimateMath.ts` and `lib/domain/invoiceMath.ts`
   (`calculateTotals`, `getEffectiveTotal`). Both are pure and server-safe.
   **Estimate → invoice conversion happens only in the browser**
   (`EstimatesView.handleConvertToInvoice`). It does not require approval
   (anything not already Converted can be converted).
7. **PDF:** exists. `app/api/send-document/route.ts` builds estimate and
   invoice PDFs with `pdf-lib` (`buildPdf`, A4, with an optional watermark). It is
   inline in the email route, so it needs extracting to be reused. No new
   library is needed.
8. **What reaches customers or money, so the API must never call it:**
   - Emails: `/api/send-document`, `/api/send-followup`, `/api/send-message`,
     `/api/inspection-email`, Resend.
   - WhatsApp: `/api/whatsapp`. Portal shares: `/api/inspection-share`, portal tokens.
   - Payments: `lib/domain/payments.ts`, `invoices.markPaid`.
   - Billing: Stripe and Creem.
   - Staff alerts by DB trigger: `estimates_alert_approved` fires on approval and
     `invoices_alert_paid` on payment. Both go through the push/pg_net path that
     is under the production security hold. The API never approves or pays, so
     neither fires from it.
9. **Tests/CI:** Jest (`npm run test:unit`), Playwright smoke on every PR
   preview, `tsc --noEmit`, ESLint with a ratchet. There is an existing API
   security test file, `lib/api/__tests__/apiSecurity.test.ts`.
10. **Infra:** no Redis/KV, no queue. Rate limiting is in Postgres. Scheduled
    work runs as GitHub Actions. There is a **domain event outbox** (`emitDomainEvent` →
    relay → `rib_events`), but **no outbound HTTP webhooks** exist.

### Hard blockers the readiness doc already names

- **Estimates have no server-side domain module.** Their rules and audit live in
  `services/estimateService.ts` (browser client). Per `m13-api-readiness.md`, a
  resource is exposed only through `lib/domain/<entity>.ts`. So step one is
  porting estimates there, with the UI calling the same code.
- **Invoices are plan-limited** (`unlimitedInvoices` is false on free plans).
  An API invoice write must go through `requireCapacity` in `lib/api/entitlements.ts`.

---

## 2. Mapping: API resource → real table

| API field | Real column | Notes |
|---|---|---|
| **Estimate** | `estimates` | |
| `id` | `id` (uuid) | |
| `number` | `estimate_number` | allocated server-side, never accepted |
| `status` | `status` | see §4 |
| `customer_id` | `customer_id` | verified in-tenant; `customer_name` copied from the customer |
| `vehicle_id` (input) | (none) | resolved in-tenant to the vehicle's label, written to `vehicle` (text), as the UI does |
| `vehicle` (output) | `vehicle` | text label only; **no VIN** in estimate/invoice output |
| `lines[]` | `lines` | `{description, lao_description?, note?, qty, rate, currency?}`. `cost`/`markup` neither accepted nor returned. |
| `discount`, `tax_rate` | `discount`, `tax_rate` | **not settable by a bot** in v1: tax from shop settings, discount 0 (open question Q4) |
| `subtotal/tax/total` | computed | `calculateEstimateTotals`, read-only |
| `currency` | `currency` | default from shop settings |
| `notes`, `valid_until` | `notes`, `valid_until` | |
| `created_via`, `created_by_api_key` | **new** columns | |
| **Invoice** | `invoices` | |
| `number` (also the id) | `number` | the table has no `id` |
| `customer_id`, `vehicle` | `customer_id`, `customer`, `vehicle` | as estimates |
| `estimate_id` | **new** `source_estimate_id` | set by convert |
| `due_date`, `paid_date` | `due_date`, `paid_date` | `paid_date` read-only |
| `total`, `currency` | `getEffectiveTotal` | read-only |
| `amount_paid`, `balance_due` | `lib/domain/receivables.ts` | read-only, from the payments ledger |
| **Customer**, **Vehicle** | already live | unchanged |

---

## 3. Proposed scope for v1 of the bot API

**Build now** (if approved):

| Endpoint | Scope | Rule |
|---|---|---|
| `GET /api/v1/me` | any valid key | key name, shop, scopes |
| `GET /api/v1/estimates`, `/{id}` | `estimates:read` | `status`, `customer_id`, `updated_since`, paging |
| `POST /api/v1/estimates` | `estimates:write` | **always Draft**; `status` in the body ignored; `Idempotency-Key` required |
| `PATCH /api/v1/estimates/{id}` | `estimates:write` | Draft only, else `409 CONFLICT` |
| `POST /api/v1/estimates/{id}/convert-to-invoice` | `estimates:write` + `invoices:write` | **Approved only** (stricter than the UI), creates a Draft invoice, marks the estimate Converted; DB-unique per estimate |
| `GET /api/v1/invoices`, `/{number}` | `invoices:read` | |
| `POST /api/v1/invoices` | `invoices:write` | always Draft; plan capacity checked |
| `PATCH /api/v1/invoices/{number}` | `invoices:write` | Draft only |
| `GET /api/v1/estimates/{id}/pdf`, `/invoices/{number}/pdf` | `pdf:read` | same `pdf-lib` layout; **DRAFT** watermark on drafts |
| Settings → API Keys (owner only) | session | list, create (secret shown once), revoke; per-key activity from the audit log |
| "Created by API: ‹key›" badge | UI | on estimates and invoices |

**Not in v1, by design:** sending or emailing anything, approving, marking
paid, recording payments, refunds, voiding, deleting, and changing settings or
users. Those endpoints simply do not exist, and tests assert the email and
payment modules are never called.

**Recommend deferring** (each needs your separate yes):

- **`/finalize`.** In Redlined1, "Sent" means issued to the customer, which is
  the step this whole design keeps human. Even "request finalize" needs a new
  banner and approve flow. Bots can't use it until there is a human queue to
  read it.
- **Outbound webhooks.** The brief itself notes the Grok bots will poll. A safe
  build needs an encrypted secret, SSRF guards, a retry worker and an admin
  view. That's a sizeable piece with no receiver yet, so it's better done when
  one exists, on top of the existing event outbox.
- **MCP server (brief phase 8).** It comes after the REST API proves itself in
  production.

---

## 4. Status mapping

| API | Estimates (`status`) | Invoices (`status`) |
|---|---|---|
| `draft` | Draft | Draft |
| `sent` | Sent | Sent |
| `approved` | Approved | n/a |
| `declined` | Declined | n/a |
| `converted` | Converted | n/a |
| `paid` | n/a | Paid |
| `refunded` | n/a | Refunded |
| `void` | Void | Void |

The API never writes any status except Draft (on create) and Converted (on
convert from Approved). There is no `partially_paid` status in Redlined1;
partial payment shows as `amount_paid` / `balance_due`.

---

## 5. Migration (additive only, for owner review)

File: `supabase/migrations/2026-11-xx_api_v1_documents.sql`. **No drops, no
data rewrites.** All new columns are nullable, so existing rows are untouched.
The owner applies it, staging first if available.

```sql
BEGIN;

-- Who created a document: NULL = the app (every existing row), 'api' = a key.
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS created_via text
  CHECK (created_via IS NULL OR created_via IN ('ui', 'api'));
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS created_by_api_key_id uuid
  REFERENCES public.api_keys(id) ON DELETE SET NULL;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_via text
  CHECK (created_via IS NULL OR created_via IN ('ui', 'api'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_by_api_key_id uuid
  REFERENCES public.api_keys(id) ON DELETE SET NULL;

-- The estimate an invoice was converted from. Unique: one invoice per
-- estimate, enforced by the database, so a retried convert cannot bill twice
-- (same pattern as invoices_one_per_repair_order).
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source_estimate_id uuid
  REFERENCES public.estimates(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_source_estimate
  ON public.invoices (source_estimate_id) WHERE source_estimate_id IS NOT NULL;

-- Keys issued from the owner screen record who issued them.
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

-- Feature flag row, seeded OFF (pattern of 2026-09-26_intent_intake_flag.sql).
-- INSERT INTO public.feature_flags (...) VALUES ('api_v1_documents', ..., false)
-- ON CONFLICT DO NOTHING;   -- exact columns copied from that migration

COMMIT;

-- Rollback (no data loss: the columns are new and nullable):
--   DROP INDEX IF EXISTS invoices_one_per_source_estimate;
--   ALTER TABLE public.invoices  DROP COLUMN IF EXISTS source_estimate_id,
--     DROP COLUMN IF EXISTS created_by_api_key_id, DROP COLUMN IF EXISTS created_via;
--   ALTER TABLE public.estimates DROP COLUMN IF EXISTS created_by_api_key_id,
--     DROP COLUMN IF EXISTS created_via;
--   ALTER TABLE public.api_keys  DROP COLUMN IF EXISTS created_by_user_id;
```

### Found in Phase 1: the API cannot allocate document numbers yet

`next_document_number` (latest version in
`2026-08-11_invoice_number_global_sequence.sql`) is SECURITY DEFINER and
refuses any caller that isn't a `shop_users` member via `auth.uid()`. It is
executable by `authenticated` only. An API request runs as `service_role` with
no user, so it would get `not a member of shop` (or no EXECUTE at all).

**Decided 2026-11-25: option A.** Built in
`supabase/migrations/2026-11-25_api_v1_documents.sql` and
`allocateDocumentNumberForApi` in `lib/domain/documentNumbers.ts`. The API
function checks that the shop exists instead of checking membership. The shop
always comes from the key. `lib/__tests__/documentNumbering.test.ts` fails if
the two counter bodies ever differ.

- **Option A (chosen):** a new function `api_next_document_number(p_shop_id,
  p_doc_type)`, executable by `service_role` only, that runs the same counter
  logic. The existing function stays byte-for-byte unchanged, so staff saves
  carry no risk. The cost is that the counter body exists twice; a test pins
  the two bodies to be identical below the membership check.
- **Option B:** `CREATE OR REPLACE` the existing function to skip the membership
  check when `auth.uid()` is NULL, and grant it to `service_role`. That's one
  body, but it edits the function every staff save depends on.

Either way, invoice numbers stay on the global `invoice_number_seq`, because
`invoices.number` is the table's primary key.

**New environment variables: none.** The brief's `API_KEY_PEPPER`,
`UPSTASH_*` and `CRON_SECRET` aren't needed with the existing design.
`WEBHOOK_SIGNING_SECRET_ENCRYPTION_KEY` comes only with webhooks, which are
deferred.

---

## 6. Files

**New**
- `lib/domain/estimates.ts`: server-safe estimate domain (list, get, create,
  update, approve, convert), with capabilities, audit, and `estimate.approved`
  moved from planned to emitted.
- `lib/domain/documentNumbers.ts`: server-side `next_document_number`.
- `lib/documents/pdf.ts`: `buildPdf` extracted from `send-document`, plus a DRAFT watermark.
- `app/api/v1/me/route.ts`
- `app/api/v1/estimates/route.ts`, `[id]/route.ts`, `[id]/convert-to-invoice/route.ts`, `[id]/pdf/route.ts`
- `app/api/v1/invoices/route.ts`, `[number]/route.ts`, `[number]/pdf/route.ts`
- `app/api/api-keys/route.ts` (owner session: list, create, revoke)
- `features/settings/ApiKeysPanel.tsx`
- `lib/api/__tests__/*`: new route and guard tests (§8)
- `supabase/migrations/2026-11-25_api_v1_documents.sql` and `_rollback.sql`

**Modified**
- `lib/api/scopes.ts`: adds `estimates:read|write`, `invoices:read|write`, `pdf:read`.
- `lib/api/handler.ts`: puts the key id and name into the audit metadata, checks
  the feature flag, and requires `Idempotency-Key` for routes that opt in.
- `services/estimateService.ts`: delegates to the domain module, keeping the UI
  behavior identical (the pattern `services/customerService.ts` uses, via
  `lib/domain/browserAdapter.ts`).
- `app/api/send-document/route.ts`: imports `buildPdf` from the new module, with no change in output.
- `features/estimates/EstimatesView.tsx`, `features/invoices/InvoicesView.tsx`: the API badge.
- `features/settings/SettingsView.tsx`: mounts the API Keys panel (owner only).
- `docs/api/README.md`, `docs/api/openapi.yaml`, `docs/m13-api-readiness.md`

Not touched: the payments, email, WhatsApp, portal, billing and push code.

---

## 7. Phases (each stops for approval)

1. **Estimate domain port.** This changes no behavior: the UI calls the same rules
   through `lib/domain/estimates.ts`. Full test suite plus a manual estimate
   create/approve/convert on a preview.
2. **Migration plus feature flag.** You apply the SQL. The flag stays off.
3. **Read endpoints** (`/me`, estimates, invoices) behind the flag.
4. **Draft writes and convert,** with the safety tests.
5. **PDF extraction and endpoints.**
6. **Owner API Keys screen and the badge.**
7. **Docs and OpenAPI.** Then you issue a test key for a test shop and run the
   brief's Part 4 checklist on a preview.

---

## 8. Safety rules and how each is enforced

| Rule | Enforcement | Test |
|---|---|---|
| Bot documents are Draft | create sets `status: 'Draft'`; the body schema has no status field (`.strict()` rejects it) | POST with `"status":"Sent"` → 422, nothing created |
| Drafts only are editable | domain checks status before update, conditional `.eq('status','Draft')` | PATCH a Sent estimate → 409 |
| Convert only from Approved, once | status check + unique index | convert Draft → 409; double convert → one invoice |
| No sending/paying | no such endpoint; route modules don't import send/payment code | import-graph test; mocks of Resend and payments never called |
| Tenant isolation | key-derived `shopIds`; ids from another shop → 404 | cross-tenant GET/PATCH/convert → 404 |
| Totals server-side | schema has no total fields | sent totals → 422; returned totals equal `estimateMath` |
| Audited with key | `writeAuditEvent` metadata `{api_key_id, api_key_name}` | assert on mocked RPC |
| Plan limits | `requireCapacity('invoices')` | free-plan key over cap → 402 |
| Off unless enabled | feature flag `api_v1_documents` | flag off → 404 |
| VIN stays shop-private | estimate/invoice output has the vehicle label only | output schema snapshot |

---

## 9. Risks

- **CLAUDE.md hard constraint 2** says no AI in product code without explicit
  approval. This API calls no model, but its stated purpose is to let external
  AI agents (Grok) write drafts into the shop's records. **Owner approval for
  that use is needed, in writing** (open question Q1).
- **The production security hold is still open** (pg_net/grants). This plan adds
  no pg_net use and no triggers, but it does add a new write path on
  production. Recommend shipping it only behind the flag, and with read-only
  keys first.
- **The estimate port touches a daily staff workflow** (hard constraint 1). It
  is mitigated by "UI behavior identical", the existing tests and a manual
  preview run before merge.
- **`invoice.issued` fires on creating a Draft** (existing behavior from the
  UI). API-created drafts will emit it too. That's harmless today (no external
  subscriber), but the name overstates a draft.
- **Line items have no type/taxable.** The brief's labor/part/fee lines can't be
  stored faithfully without a schema change. The plan uses the real shape
  instead of inventing one.
- **The idempotency table grows forever.** The existing table has no expiry job.
  Add a cleanup (rows older than 7 days) to an existing GitHub Actions job.

---

## 10. Open questions for the owner

1. **AI-agent use (CLAUDE.md constraint 2).** Do you approve external AI agents
   (Grok Bot) writing **draft** estimates and invoices through this API? Yes or no.
2. **Extend the existing API** (recommended) or build the brief's design from
   scratch? The latter would mean a second key system and a breaking change for
   any existing key holders.
3. **Scope.** Ship §3 "Build now", and defer finalize, webhooks and MCP? Yes or no.
4. **Bot pricing control.** May a bot set `discount` or `tax_rate` on a draft, or
   are they always the shop defaults (recommended)? And may a bot set line
   `currency` (THB/USD/LAK)?
5. **Convert rule.** API conversion requires Approved, while the UI allows any
   non-converted estimate. Keep the stricter API rule (recommended)?
6. **Staging.** Is there a staging database to run the migration on first? If
   not, it goes to production behind the flag, which stays off.
7. **Existing keys.** Have any API keys been issued on production (run
   `npx tsx scripts/api-key.ts list`)? This tells us whether anything already
   depends on v1.
