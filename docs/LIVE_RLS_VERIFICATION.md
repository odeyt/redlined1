# Live Supabase RLS Verification

**Status: UNVERIFIED LIVE — code-derived analysis only.** This environment has no
direct database access (no MCP Supabase connector, no raw Postgres connection
string, only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, which give PostgREST-level access
only, not system-catalog access). Per this task's own instruction, every claim
below that is not explicitly marked **CONFIRMED LIVE** is a best-effort
reconstruction from this repo's committed SQL history, not a live database
read. **Run [`docs/MOBILE_RLS_AUDIT.sql`](MOBILE_RLS_AUDIT.sql) in the Supabase
SQL Editor and replace the UNVERIFIED cells below with its actual output
before treating any of this as ground truth.**

## Executive Summary

This repo's own SQL history proves migration files cannot be trusted as
evidence of live state, which is exactly what this task warned against
relying on:

1. **2026-06-10** (`grant-permissions.sql`, `supabase/rls_phase7.sql`): RLS
   enabled on most core tables, but with `USING (true)` policies — i.e. **not**
   shop-scoped, any authenticated user can touch any shop's rows — plus a
   blanket `GRANT ... TO anon` on ~24 tables.
2. **2026-06-13/14** (`supabase/migration_multitenant*.sql`): a real,
   shop-scoped policy set (`shop_id = ANY(my_shop_ids())`) drafted to replace
   the permissive ones, for a *subset* of tables.
3. **2026-06-22** (`supabase/migration_appointments_rls.sql`): a further,
   separate shop-scoping fix, only for `appointments`.
4. **2026-07-18** (`docs/PRODUCTION_SECURITY_REMEDIATION.sql`, this repo):
   despite steps 2–3 having been committed for over a month, this doc
   **confirms `shops` and `shop_users` still had RLS disabled live in
   production** — readable by the public anon key with no login at all —
   and states the fix "NOT yet executed against production" as of that date
   (2 days before this audit).

Point 4 is the load-bearing fact for this whole report: two tables that
migration files *claimed* to have fixed a month earlier were, as of 2 days
ago, still wide open. There is no reason to assume the other ~30 tables in
this schema fared any better — some have a shop-scoped fix committed
(customers, vehicles, job_cards, repair_orders, invoices, estimates, payments,
inspections, parts, maintenance_schedules, shop_settings, appointments) and
may or may not have actually had it applied; others (**technicians,
profiles, campaigns, followups**) have no shop-scoping fix committed *at
all* — only the original 2026-06-10 `USING (true)` policy; and a third group
(**parts_orders, parts_vendors, messages, audit_logs, technician_tasks,
time_entries, estimate_followups, closed_jobs, vehicle_images,
entity_images**) were never in `rls_phase7.sql`'s RLS-enable list in the
first place, meaning if that holds live, they have **no RLS at all**,
combined with the same blanket `anon` grant that made shops/shop_users
exploitable.

**This is not a hypothetical concern list — it is the same exact
vulnerability pattern (RLS-disabled-or-permissive + broad anon GRANT) that
was already confirmed live and unfixed for shops/shop_users as of 2 days
before this audit**, per this repo's own remediation doc. Until
`docs/MOBILE_RLS_AUDIT.sql` is actually run, this must be treated as a live
possibility for every table in the "no committed fix" groups above, not a
resolved historical issue.

## Data model note (relevant to every matrix below)

The mobile app and `/api/job-status` operate on `job_cards`. This schema
also has two **separate, coexisting** repair-entity tables —
`repair_orders` and `repair_cases` — used by other parts of the web app
(customer portal, service-advisor intelligence). They are not aliases of
each other and do not share RLS policies automatically; each needed (and in
`repair_orders`' case, got) its own shop-scoping fix. `repair_cases` and its
child tables (`repair_case_dtcs`, `repair_case_symptoms`, `repair_case_tests`,
`repair_case_parts`, `repair_case_outcomes`) were not covered by any RLS
migration found in this repo at all and are out of this audit's originally
requested scope, but are flagged under Medium Findings below since they hold
shop-scoped repair data.

---

## Table Matrix

Legend: **CONFIRMED LIVE** = independently verified live in this or a prior
session (cited). **CODE (drift risk)** = derived from the *latest* committed
SQL for that table, but this repo has already proven committed SQL can lag
or contradict live state — treat as unverified until the audit script runs.
**UNKNOWN** = no committed policy found at all for this table.

| Table | RLS enabled | RLS forced | SELECT policy | INSERT/UPDATE/DELETE policy | USING expr | WITH CHECK expr | `authenticated` | `anon` | `service_role` | SECURITY DEFINER used | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `shops` | Was **disabled** as of 2026-07-18 | Was false | `shops_member_view` (drafted, not yet applied per remediation doc) | none live | `id = ANY(my_shop_ids())` (drafted) | n/a (SELECT only) | drafted: scoped | drafted: revoke | bypasses RLS | `my_shop_ids()` | **CONFIRMED LIVE vulnerable as of 2026-07-18** — fix drafted in `docs/PRODUCTION_SECURITY_REMEDIATION.sql`, not executed |
| `shop_users` | Was **disabled** as of 2026-07-18 | Was false | `shop_users_own` (drafted) | none live | `user_id = auth.uid()` (drafted) | n/a | drafted: scoped | drafted: revoke | bypasses RLS | `my_shop_ids()` | **CONFIRMED LIVE vulnerable as of 2026-07-18** — same as above |
| `profiles` | Enabled (2026-06-10) | UNKNOWN | `profiles_read`: `to authenticated using (true)` — **not shop-scoped, platform-wide** | `profiles_self_update` (own row); `profiles_owner_manage` (`my_role()='Owner'`, uses the OLD Title-Case role system, not `shop_users.role`) | `true` for read | n/a | full read of every user | no grant found for `profiles` specifically in `grant-permissions.sql` | bypasses RLS | `my_role()` | CODE (drift risk) — **no shop-scoping fix ever committed**; if live, any authenticated user can read every user's name/email/role platform-wide |
| `customers` | Enabled | UNKNOWN | `customers_shop_scoped`: `shop_id = ANY(my_shop_ids())` | same policy, `FOR ALL` | `shop_id = ANY(my_shop_ids())` | same | scoped | `grant-permissions.sql` grants full CRUD to anon (2026-06-20, predates the shop-scoping fix; not confirmed revoked) | bypasses RLS | `my_shop_ids()` | CODE (drift risk) |
| `vehicles` | Enabled | UNKNOWN | `vehicles_shop_scoped` | same, `FOR ALL` | `shop_id = ANY(my_shop_ids())` | same | scoped | anon CRUD granted 2026-06-20, not confirmed revoked | bypasses RLS | `my_shop_ids()` | CODE (drift risk) |
| `job_cards` | Enabled | UNKNOWN | `job_cards_shop_scoped` | same, `FOR ALL` | `shop_id = ANY(my_shop_ids())` | same | scoped | anon CRUD granted, not confirmed revoked | bypasses RLS; app also writes via `/api/job-status` using the **service-role key**, which bypasses RLS entirely regardless of policy | `my_shop_ids()` | CODE (drift risk) |
| `repair_orders` | Enabled | UNKNOWN | `repair_orders_shop_scoped` | same, `FOR ALL` | `shop_id = ANY(my_shop_ids())` | same | scoped | anon CRUD granted, not confirmed revoked | bypasses RLS | `my_shop_ids()` | CODE (drift risk) |
| `appointments` | Enabled (fixed 2026-06-22, separately from the multitenant batch) | UNKNOWN | `appointments_read`: `shop_id IN (owner_id=auth.uid() UNION shop_users.user_id=auth.uid())` | separate insert/update/delete policies, same expression | as above | as above | scoped | anon CRUD granted 2026-06-20 (before this fix), not confirmed revoked | bypasses RLS | none (plain subquery, not `my_shop_ids()` — a second, parallel scoping mechanism) | CODE (drift risk) |
| `inspections` | Enabled | UNKNOWN | `inspections_shop_scoped` | same, `FOR ALL` | `shop_id = ANY(my_shop_ids())` | same | scoped | anon CRUD granted, not confirmed revoked | bypasses RLS | `my_shop_ids()` | CODE (drift risk) |
| `invoices` | Enabled | UNKNOWN | `invoices_shop_scoped` | same, `FOR ALL` | `shop_id = ANY(my_shop_ids())` | same | scoped | anon CRUD granted, not confirmed revoked | bypasses RLS | `my_shop_ids()` | CODE (drift risk) |
| `payments` | Enabled | UNKNOWN | `payments_shop_scoped` | same, `FOR ALL` | `shop_id = ANY(my_shop_ids())` | same | scoped | anon CRUD granted, not confirmed revoked | bypasses RLS | `my_shop_ids()` | CODE (drift risk) |
| `technicians` | Enabled (2026-06-10) | UNKNOWN | `technicians_read`: `to authenticated using (true)` — **not shop-scoped, platform-wide** | `technicians_write`: `my_role() IN ('Owner','Advisor')` (old role system) | `true` for read | n/a | full read across all shops | anon CRUD granted 2026-06-20, not confirmed revoked | bypasses RLS | `my_role()` | CODE (drift risk) — **no shop-scoping fix ever committed** |
| `messages` | **No `ENABLE ROW LEVEL SECURITY` found anywhere in this repo's SQL** | n/a | none found | none found | n/a | n/a | ungated if RLS truly absent | anon CRUD granted 2026-06-20 | bypasses RLS | none | UNKNOWN — likely **no RLS at all**; a legacy table not referenced by any app code found in a full-repo search (may be dead, but the grant and schema both still exist) |
| `vehicle_images` (uploads) | **No `ENABLE ROW LEVEL SECURITY` found** | n/a | none found | none found | n/a | n/a | ungated if RLS truly absent | anon CRUD granted 2026-06-20 | bypasses RLS | none | UNKNOWN — likely **no RLS at all**; separately, the backing Storage bucket `shop-assets` is documented public in `docs/SHOP_ASSETS_STORAGE_REVIEW.md` |
| `entity_images` (uploads) | Not covered by any `.sql` file found in this repo at all (table created in `supabase/migrations/entity_images.sql`, no RLS statement in that file) | n/a | none found | none found | n/a | n/a | ungated if RLS truly absent | not in `grant-permissions.sql` (created later) — check default PostgREST exposure | bypasses RLS | none | UNKNOWN |
| `users` | No `users` table found in app code or schema beyond `auth.users` (Supabase-managed) — `grant-permissions.sql` grants CRUD on a table literally named `users`, distinct from `profiles` | n/a | n/a | n/a | n/a | n/a | anon+authenticated CRUD granted 2026-06-20 | same | n/a | none | UNKNOWN — **confirm in Section 1 of the audit script whether a `public.users` table exists at all**; if it does, it is an undocumented table with a live anon CRUD grant and no RLS evidence found |

**Additional tables discovered during this audit with the same risk shape,
not in the task's original 15-table list, added because they were found to
be at-risk in the same way:**

| Table | Committed RLS fix found? | Notes |
|---|---|---|
| `campaigns`, `followups` | Only the 2026-06-10 `USING (true)` policy — no shop-scoping fix committed | Same platform-wide-read pattern as `profiles`/`technicians` |
| `parts_orders`, `parts_vendors` | None — not in `rls_phase7.sql`'s enable list | Anon CRUD granted 2026-06-20; likely no RLS at all if that holds live |
| `technician_tasks`, `time_entries`, `estimate_followups`, `closed_jobs` | None | Same as above |
| `audit_logs` | None | Also relevant to Phase B — see below; currently has no `shop_id` column (`id, action, "user" text, entity, time, created_at`), so it cannot be reused as-is for the job-status transition audit trail this task's Phase B requires |
| `repair_cases` (+ 5 child tables) | None found | Separate repair-entity table from `job_cards`/`repair_orders`; holds shop-scoped diagnostic data with no confirmed RLS |

---

## Role Matrix

Two independent role systems exist in this codebase's history and were not
reconciled:

1. **`shop_users.role`** — `'owner' | 'manager' | 'advisor' | 'technician'`
   (lowercase). This is what `lib/serverAuth.ts`'s `requireShopRole()` reads,
   and therefore what every `app/api/**` route (including `/api/job-status`)
   actually authorizes against. Canonical list duplicated (not shared) between
   `lib/serverAuth.ts:20-22` and `lib/schemas.ts:47`.
2. **`profiles.role`** — `'Owner' | 'Advisor' | 'Technician' | 'Fleet Client'`
   (Title Case, per `rls_phase7.sql`'s `handle_new_user()` trigger default).
   This is what the OLD, non-shop-scoped RLS policies (`profiles_owner_manage`,
   `technicians_write`, `shop_settings_write`, `parts_write`,
   `payments_update/delete`) call via `my_role()`.

| Check | App-layer (`requireShopRole`, confirmed by reading `lib/serverAuth.ts`) | RLS-layer (unverified live) |
|---|---|---|
| Technician cannot access invoices/payments (owner-only data) | `/api/job-status` allows any of the 4 roles (routine work); no invoices/payments API route restricts by role beyond shop membership — confirm against actual route code if this needs tightening | **`payments_shop_scoped` is `FOR ALL`, no role check at all** — any shop member of any role can read/write/delete payments once shop-scoped; the *old* `payments_delete` role check (`my_role() IN ('Owner','Advisor')`) only applies if the OLD policy is still live instead of the new `FOR ALL` one — this is exactly the kind of ambiguity the audit script must resolve |
| Manager has only manager permissions | No dedicated "manager-only" allowlist route was found; manager is currently treated as a general staff role with the same access as advisor/technician for most operations | Same shop-scoped-but-not-role-scoped pattern as above for most tables |
| Owner has full shop access | `isLastOwner()` protects against removing the last owner; owner passes every `allowedRoles` check trivially since it's in `ALL_SHOP_ROLES` | `shop_settings_write` (old policy) and `profiles_owner_manage` both explicitly gate on owner; but if the OLD `my_role()`-based policies are what's actually live (not the shop-scoped ones), "owner" there means `profiles.role='Owner'` platform-wide, not "owner of this specific shop" — a subtle but real distinction if a user is owner of Shop A and merely a technician of Shop B |
| Platform Admin has platform access only where intended | No `shop_users.role` value for platform admin exists; platform-level admin access is gated separately via `lib/adminAuth.ts` (owner-email allowlist, per `docs/commercial/analytics/05_SECURITY_AND_PRIVACY.md`), not via shop role at all — out of this audit's shop-tenancy scope but confirmed not to overlap with shop roles |

**This ambiguity — "which of the two role systems and which policy
generation is actually live" — cannot be resolved by reading code. It is the
single most important thing `docs/MOBILE_RLS_AUDIT.sql` Section 2 (full
policy dump with `qual`/`with_check` text) will settle.**

---

## Tenant Matrix

Per this task's own framing: **the client-side `.eq('shop_id', activeShopId)`
filter is not a security boundary.** Whether removing it actually gets
blocked depends entirely on which RLS policy generation is live for each
table — see `docs/MOBILE_RLS_AUDIT.sql` Section 6 for the exact REST probes
required (must be run with a real user's `access_token`, not the anon key or
service-role key, and not from the Supabase SQL Editor — the SQL Editor
executes in a context that bypasses RLS entirely, so it cannot be used to
test this).

| Table | If the shop-scoped policy (`migration_multitenant_fix.sql`) is live | If the original permissive policy (`rls_phase7.sql`) is still live instead |
|---|---|---|
| Customers | Blocked — `shop_id = ANY(my_shop_ids())` | **Not blocked** — `USING (true)` lets any authenticated user read/write any shop's customers |
| Vehicles | Blocked | **Not blocked** |
| Job Cards | Blocked | **Not blocked** |
| Repair Orders | Blocked | **Not blocked** |
| Appointments | Blocked (separate policy, same effect) | **Not blocked** — `appointments` was never in `rls_phase7.sql`'s enable list at all, so absent its own 2026-06-22 fix, it likely has no RLS whatsoever |

Given the confirmed shops/shop_users precedent, **do not assume the
"blocked" column is what's actually live for any table** until the audit
script confirms it.

---

## Critical Findings

1. **`shops` and `shop_users` — CONFIRMED LIVE, unauthenticated, cross-tenant
   read exposure as of 2026-07-18** (2 days before this audit), per this
   repo's own `docs/PRODUCTION_SECURITY_REMEDIATION.sql`. A drafted fix
   exists in that file but its own header states it was **not yet executed**.
   This is the highest-priority action item in this entire report — resolve
   it before anything else, including before proceeding to Mobile Phase 3,
   since the mobile app will ship the same anon key in a distributable binary.
2. **`profiles` and `technicians` have no committed shop-scoping fix at
   all** — both still run (per the latest committed SQL) on a
   `USING (true)` policy that grants full, platform-wide read to any
   authenticated user, across every shop, not just their own. If this
   reflects live state, any logged-in user at any shop can read every other
   shop's technician roster and every platform user's name/email/role.
3. **At least 10 tables were never in any RLS-enable statement found in
   this repo** (`messages`, `vehicle_images`, `entity_images`,
   `parts_orders`, `parts_vendors`, `technician_tasks`, `time_entries`,
   `estimate_followups`, `closed_jobs`, and a possible undocumented `users`
   table) — combined with the blanket `anon` CRUD grant in
   `grant-permissions.sql`, if RLS is genuinely absent on any of these,
   they are fully open to an anonymous caller with only the public anon key:
   no login, full read/write/delete.
4. **This repo's migration files have already been proven unreliable as
   evidence of live state once** (finding 1) — every "CODE (drift risk)"
   row in the table matrix above carries the same risk until independently
   verified. Treat the whole matrix as provisional.

## Medium Findings

5. **Two parallel, unreconciled role systems** (`shop_users.role` lowercase
   vs `profiles.role` Title Case) create ambiguity about which authorization
   check is actually enforced by any policy still calling the old
   `my_role()` helper — see Role Matrix above.
6. **`repair_cases`** (+ 5 child tables) is a third, separate repair-entity
   table with no RLS migration found in this repo at all — outside this
   audit's originally-requested table list but holds the same class of
   shop-scoped data as `job_cards`/`repair_orders`.
7. **`shop_users.role` has no CHECK constraint** and **`profiles.email` has
   no UNIQUE constraint** — both already identified in
   `docs/PRODUCTION_SECURITY_REMEDIATION.sql`, with read-only pre-checks
   included there, not yet run.
8. **`audit_logs` exists but cannot be reused for Phase B's transition audit
   trail** — its schema (`id, action, "user" text, entity, time, created_at`)
   has no `shop_id`, no structured old/new-value columns, and `"user"` is a
   free-text field, not a `uuid` FK to `auth.users`. Phase B introduces a
   dedicated, purpose-built table instead (see
   `docs/JOB_STATUS_SECURITY_AUDIT.md`).
9. **`shop-assets` Storage bucket is public** (separate finding, already
   documented in `docs/SHOP_ASSETS_STORAGE_REVIEW.md`, restated here because
   it's the same exposure class as the table-level findings above and
   `docs/MOBILE_RLS_AUDIT.sql` Section 9 re-checks it).

## Recommendations

1. **Run `docs/MOBILE_RLS_AUDIT.sql` against production now**, before any
   further work — it is read-only and safe. Paste the results back and this
   document's "CODE (drift risk)" / "UNKNOWN" rows can be upgraded to
   CONFIRMED or corrected.
2. **Execute `docs/PRODUCTION_SECURITY_REMEDIATION.sql`** (already drafted,
   already reviewed, per its own header) to close the confirmed
   shops/shop_users exposure. This is a production DB write and requires
   your explicit approval to run — this task's Phase A instructions
   explicitly forbid modifying production without it.
3. **Draft (do not yet apply) equivalent shop-scoping fixes for `profiles`
   and `technicians`**, replacing their `USING (true)` policies with
   `shop_id = ANY(my_shop_ids())`-equivalent scoping — `profiles` doesn't
   have a `shop_id` column itself (it's cross-shop by nature, one profile
   per user), so its fix needs different shape: scope to rows the caller
   shares a shop with, or restrict the platform-wide read to only the fields
   actually needed for name lookups (`id, name`), not the full row.
4. **Confirm live RLS state (via the audit script) for the 10 "never
   enabled" tables** before assuming `grant-permissions.sql`'s anon grant
   is harmless dead weight — if any of those tables still receive real
   traffic, this is as severe as the shops/shop_users finding.
5. **Do not ship the mobile app's anon key more broadly (Phase 3: VIN
   scanning, media uploads) until finding 1 is resolved and the audit script
   has run.** The mobile client will embed the same anon key used above.

## GO / NO-GO

**NO-GO for the RLS portion of this task.** A previously-confirmed,
still-unresolved critical production vulnerability exists
(shops/shop_users), and the live state of every other table in this schema
is unverified given this repo's own proof that its migration files cannot
be trusted. Per this task's stop condition — *"If production RLS cannot be
verified: Stop. Produce the SQL audit script. Wait for approval."* — that is
exactly the state this report leaves things in.
