# Database Security Findings — Table-by-Table Severity Matrix

Companion to [`LIVE_RLS_VERIFICATION.md`](LIVE_RLS_VERIFICATION.md) (narrative
findings) and [`MOBILE_RLS_AUDIT.sql`](MOBILE_RLS_AUDIT.sql) (the script that
resolves every open question here). This document exists to classify
severity per table; it does not repeat the full USING/WITH CHECK expression
text already in `LIVE_RLS_VERIFICATION.md` — see that doc for the exact
policy SQL behind each row's classification.

**No table in this matrix is marked PASS.** PASS is reserved for a table
whose safety has been independently confirmed against a live database in
this session. None have been — this environment has no database execution
access (see `LIVE_RLS_VERIFICATION.md` §Phase 2 status). Every classification
below is `CODE INFERENCE ONLY` unless stated otherwise, and is a *risk
estimate*, not a verified state. Re-run `MOBILE_RLS_AUDIT.sql` and revisit
this document before treating any row as resolved.

## Severity definitions used below

- **CRITICAL** — anon (unauthenticated) read or write is plausible per
  current code/grants, OR a confirmed/strongly-implied cross-tenant access
  path exists for authenticated users, OR a SECURITY DEFINER function could
  let a caller control which shop it acts on.
- **HIGH** — a permissive (non-shop-scoped) policy is committed and, if
  live, lets any authenticated user (any shop) read/write the table — no
  anon exposure, but full cross-tenant exposure for anyone with any account.
- **MEDIUM** — code shows a correctly shop-scoped policy and no anon grant
  evidence, but this is unverified live (this repo has already proven that
  matters), or a role-isolation gap exists within a shop's own boundary
  (not cross-tenant).
- **LOW** — a real but minor gap (missing CHECK/UNIQUE constraint, a
  legacy/likely-dead table, a data-shape mismatch) with no direct tenant or
  anonymous exposure implication.
- **UNKNOWN** — no committed SQL addresses this table at all; severity
  cannot even be estimated from code.

## Table matrix

| Table | RLS enabled (code) | Policies (code) | Grants (code) | Tenant isolation | Role isolation | Mobile access safety | Required remediation | Severity |
|---|---|---|---|---|---|---|---|---|
| `shops` | Was disabled live as of 2026-07-18 | `shops_member_view` drafted, not applied | `anon` SELECT granted (`grant-permissions.sql`), drafted revoke not applied | **None live** — any anon caller can list all shops | n/a | Mobile reads this table directly with the anon key — directly exposed | Apply `docs/PRODUCTION_SECURITY_REMEDIATION.sql` (already drafted) | **CRITICAL** |
| `shop_users` | Was disabled live as of 2026-07-18 | `shop_users_own` drafted, not applied | `anon` SELECT granted, drafted revoke not applied | **None live** — full shop/user/role map readable by anyone | n/a | Mobile reads this table directly — directly exposed | Same as `shops` | **CRITICAL** |
| `profiles` | Enabled, but `USING (true)` | `profiles_read` (all authenticated, all rows), `profiles_self_update`, `profiles_owner_manage` (old role system) | Not in `grant-permissions.sql`'s anon list specifically | **No cross-tenant boundary at all for reads** — any logged-in user reads every user's name/email/role platform-wide | `profiles_owner_manage` uses `profiles.role = 'Owner'`, a *platform-wide* Title-Case flag, not "owner of the shop being acted on" — a Shop A owner could satisfy this check while acting on Shop B data if any policy/route trusted it in isolation | Mobile does not query `profiles` directly today (uses `shop_users` for role) — no direct mobile exposure via this path, but the live web app is exposed | Draft a shop-scoped or field-limited replacement policy (see Phase 4 below) | **HIGH** |
| `technicians` | Enabled, but `USING (true)` for read | `technicians_read` (all authenticated, all rows), `technicians_write` (old role system) | `anon` full CRUD granted | **No cross-tenant boundary for reads**, and if the anon grant is still live with no RLS override for `anon` specifically, **anon read is also plausible** | `technicians_write` uses `my_role() IN ('Owner','Advisor')` — platform-wide, not shop-scoped | Mobile does not read `technicians` directly today | Shop-scope the read policy; revoke anon grant | **CRITICAL** (anon-write plausibility) |
| `customers` | Enabled, shop-scoped fix committed | `customers_shop_scoped` (`shop_id = ANY(my_shop_ids())`) | `anon` full CRUD granted 2026-06-20, predates the fix, revoke not confirmed | Correct in code, **unverified live** | `FOR ALL` — no role distinction within a shop (any member role can delete a customer) | **Mobile reads this table directly with the anon key** — this is the highest-mobile-relevance row in this matrix | Confirm anon grant revoked; consider role-gating deletes | **MEDIUM** (would be LOW if anon revoke were confirmed) |
| `vehicles` | Same as `customers` | `vehicles_shop_scoped` | Same anon-grant caveat | Correct in code, unverified live | Same `FOR ALL` gap | **Mobile reads this table directly** | Same as `customers` | **MEDIUM** |
| `job_cards` | Same pattern | `job_cards_shop_scoped` | Same anon-grant caveat | Correct in code, unverified live | Same `FOR ALL` gap for direct table access — but the mobile app's only *write* path is `/api/job-status`, which bypasses this table's RLS entirely via the service-role client and has its own hardened authorization (see `JOB_STATUS_SECURITY_AUDIT.md`) | **Mobile reads this table directly for lists/detail; writes go through the hardened API, not direct table access** | Confirm anon grant revoked for direct reads | **MEDIUM** |
| `closed_jobs` | UNKNOWN — no RLS statement found for this specific table | None found | Not in `grant-permissions.sql` | UNKNOWN | UNKNOWN | Not read by mobile today | Determine live RLS state; likely needs the same fix as `job_cards` | **UNKNOWN** |
| `repair_orders` | Enabled, shop-scoped fix committed | `repair_orders_shop_scoped` | `anon` full CRUD granted, revoke not confirmed | Correct in code, unverified live | `FOR ALL`, no role gate | Not read by the mobile app today (mobile uses `job_cards`, not `repair_orders` — see data-model note in `LIVE_RLS_VERIFICATION.md`) | Confirm anon grant revoked | **MEDIUM** |
| `repair_cases` (+ `repair_case_dtcs`/`_symptoms`/`_tests`/`_parts`/`_outcomes`) | **No RLS statement found anywhere in this repo for any of these 6 tables** | None found | Not in `grant-permissions.sql` (created later than that script) | UNKNOWN — no committed policy to even infer from | UNKNOWN | Not read by mobile today | Full RLS design needed from scratch — currently the least-covered repair-entity family in the schema | **UNKNOWN** |
| `appointments` | Enabled, dedicated shop-scoping fix (2026-06-22) | `appointments_read/insert/update/delete` (`shop_id IN (shops.owner_id=uid() UNION shop_users.user_id=uid())`) | `anon` full CRUD granted 2026-06-20, before this fix, revoke not confirmed | Correct in code, unverified live | No role gate | Not read by mobile today | Confirm anon grant revoked | **MEDIUM** |
| `inspections` (+ `inspection_findings`) | `inspections` enabled + shop-scoped; `inspection_findings` UNKNOWN (no RLS statement found for the child table specifically) | `inspections_shop_scoped` | `anon` full CRUD granted on `inspections`, revoke not confirmed; `inspection_findings` not in the grant script | Parent correct in code, unverified live; child UNKNOWN | No role gate on parent | Not read by mobile today | Confirm parent anon-grant revoked; determine child table RLS state | **MEDIUM** (parent) / **UNKNOWN** (child) |
| `estimates` (+ `estimate_lines`, `estimate_followups`) | `estimates` enabled + shop-scoped + a `portal` policy for anon (status-only update, gated by `portal_token`); `estimate_lines`/`estimate_followups` — no RLS statement found | `estimates_shop_scoped`, `estimates_portal_update` (anon, but scoped to rows with a set `portal_token` and restricted to `status IN ('Approved','Declined')`) | `anon` full CRUD granted on `estimates` from the 2026-06-20 blanket script — this is broader than the intentional portal policy alone (the portal policy is narrow/safe by design; the blanket grant is not) | `estimates` correct in code, unverified live; child tables UNKNOWN | No role gate | Not read by mobile today | Confirm the blanket anon CRUD grant (not the narrow portal policy) is revoked on `estimates`; determine child-table RLS | **HIGH** (until the blanket grant is confirmed revoked, since a wide-open anon grant sits alongside an intentionally narrow anon policy — worst case is the grant wins) |
| `invoices` | Same pattern as `customers` | `invoices_shop_scoped` | `anon` full CRUD granted, revoke not confirmed | Correct in code, unverified live | `FOR ALL`, no role gate — a technician could delete an invoice per this policy alone | Not read by mobile today | Confirm anon grant revoked; consider role-gating deletes to owner/manager/advisor | **MEDIUM** |
| `payments` | Same pattern | `payments_shop_scoped` (superseding an older role-gated version, if the newer one is what's live) | `anon` full CRUD granted, revoke not confirmed | Correct in code, unverified live | **`FOR ALL`, no role gate at all if the shop-scoped policy is what's live** — the *old* `payments_delete`/`payments_update` role restriction (`Owner`/`Advisor` only) may have been dropped when replaced; this task explicitly requires technicians be denied payments access, and current code cannot confirm that holds | Not read by mobile today (Phase 3 mobile work, out of scope for this task, would need this resolved first) | Confirm anon grant revoked; **explicitly re-add a role gate excluding technician**, since the shop-scoping migration may have silently dropped the older role restriction | **HIGH** (role-isolation regression risk, not just anon/tenant) |
| `subscriptions` | UNKNOWN — no RLS statement found | None found | Not in `grant-permissions.sql` | UNKNOWN | UNKNOWN | Not read by mobile | Determine live RLS state; financial data, same priority as `payments` | **UNKNOWN** (treat as HIGH-risk-until-checked given the data sensitivity) |
| `messages` | **No RLS statement found anywhere** | None | `anon` full CRUD granted | Appears to be a legacy/possibly-dead table (no `.from('messages')` call found anywhere in current app code after a full-repo search) but the schema and grant both still exist | UNKNOWN | Not read by mobile | Determine if this table is truly dead; if so, consider dropping the anon grant regardless (dead tables with open grants are still a live attack surface) | **CRITICAL** (grant exists regardless of whether app code currently uses the table) |
| `audit_logs` (legacy, pre-existing) | UNKNOWN — no RLS statement found | None | `anon` full CRUD granted | UNKNOWN | UNKNOWN | Not used by mobile; not reused for the new job-status audit trail (see `JOB_STATUS_SECURITY_AUDIT.md` — schema doesn't fit) | Same as `messages` — anon grant on an audit table is especially bad (an attacker could read or *forge* audit history) | **CRITICAL** |
| `job_status_transitions` (new, this session) | Drafted with RLS enabled + forced, shop-scoped read policy, **no write policy/grant for anon or authenticated at all** | `job_status_transitions_shop_read` | None to anon/authenticated (service-role only, by design) | Correct by design | Read-only for all non-service roles, by design | Written only by `/api/job-status` (service-role client) | Apply the migration (`supabase/migrations/job_status_audit_log.sql`) before relying on the audit trail | **N/A — not yet applied, no live exposure possible since the table doesn't exist yet** |
| `entity_images`, `vehicle_images` (uploaded-file metadata) | **No RLS statement found for either** | None | `anon` full CRUD granted on `vehicle_images`; `entity_images` (created later) not in the grant script — its default PostgREST exposure is UNKNOWN | UNKNOWN | UNKNOWN | Not read by mobile today, but Phase 3 (media uploads) would touch these directly — **do not build mobile uploads until this is resolved**, matching this task's own storage-phase instruction | Determine live RLS state for both; see `STORAGE_SECURITY_AUDIT.md` for the companion Storage-bucket-level findings | **CRITICAL** (`vehicle_images`) / **UNKNOWN** (`entity_images`) |
| `parts` | Enabled, shop-scoped fix committed | `parts_shop_scoped` | `anon` full CRUD granted, revoke not confirmed | Correct in code, unverified live | No role gate (older `parts_write`/`parts_tech_update` role split may have been dropped by the same policy-replacement pattern as `payments`) | Not read by mobile | Confirm anon grant revoked | **MEDIUM** |
| `parts_orders`, `parts_vendors`, `parts_inventory` | **No RLS statement found for any of the three** | None | `anon` full CRUD granted on `parts_orders`/`parts_vendors`; `parts_inventory` not in the grant script | UNKNOWN | UNKNOWN | Not read by mobile | Determine live RLS state | **CRITICAL** (the two with confirmed anon grants) / **UNKNOWN** (`parts_inventory`) |
| `maintenance_schedules` | Enabled, shop-scoped fix committed | `maintenance_schedules_shop_scoped` | `anon` full CRUD granted, revoke not confirmed | Correct in code, unverified live | No role gate | Not read by mobile | Confirm anon grant revoked | **MEDIUM** |
| `shop_settings` | Enabled, shop-scoped fix committed | `shop_settings_shop_scoped` (superseding an older owner-only-write policy) | `anon` full CRUD granted, revoke not confirmed | Correct in code, unverified live | **Same role-gate-regression risk as `payments`/`parts`** — this table holds business config (and, per `MESSAGING_SECRETS_AUDIT.md`, live messaging provider tokens in `messaging_settings` jsonb); if the old owner-only write gate was dropped, any shop member of any role could rewrite it | `/api/job-status` GET reads `shop_settings` for the public status-tracker page (service-role, unaffected by this) | Confirm anon grant revoked; re-confirm an owner/manager-only write gate is in place, especially given the messaging-secrets sensitivity already flagged elsewhere in this repo's docs | **HIGH** |
| `campaigns`, `followups` | Enabled, but `USING (true)` (`FOR ALL`) | `campaigns_staff_all`, `followups_staff_all` | Not in `grant-permissions.sql` (campaigns not listed; followups not listed either) | **No cross-tenant boundary** if this permissive policy is what's live | No role gate | Not read by mobile | Shop-scope both | **HIGH** |
| `technician_tasks`, `time_entries` | **No RLS statement found for either** | None | `anon` full CRUD granted on both | UNKNOWN | UNKNOWN | Not read by mobile | Determine live RLS state | **CRITICAL** |
| `shop_mirrors` | UNKNOWN — no RLS statement found | None | Not in `grant-permissions.sql` | UNKNOWN | UNKNOWN | Read by the web sidebar (`components/Sidebar.tsx`) for multi-location switching; not read by mobile | Determine live RLS state | **UNKNOWN** |
| `users` (undocumented, distinct from `profiles`/`auth.users`) | UNKNOWN — table's existence itself is unconfirmed; no app code reads/writes a table literally named `users` | None | `anon` + `authenticated` full CRUD granted **if the table exists** | UNKNOWN | UNKNOWN | Not read by mobile | **First confirm whether `public.users` exists at all** (`MOBILE_RLS_AUDIT.sql` Section 1 will show this) — if it does, it is dead-code-adjacent with a live open grant, same class of risk as `messages`/`audit_logs` | **UNKNOWN, escalates to CRITICAL if the table is confirmed to exist** |

## Cross-cutting CRITICAL findings (not table-specific)

- **`public.my_shop_ids()`** — the SECURITY DEFINER function nearly every
  shop-scoped policy above depends on. Its `search_path` pinning and
  EXECUTE-grant restriction to `authenticated`/`service_role` only (rather
  than `PUBLIC`) are drafted in `docs/PRODUCTION_SECURITY_REMEDIATION.sql`
  but **not yet applied**. This function does not accept a caller-supplied
  shop_id (it derives everything from `auth.uid()` internally), so it is
  not itself a role-escalation vector as currently written — but confirm
  this holds after any remediation migration touches it.
- **Anon CRUD grants are the dominant CRITICAL-severity driver in this
  matrix** — 12+ tables carry a live (as committed) `anon` grant for
  insert/update/delete, not just select. RLS being correctly shop-scoped
  does not fully neutralize this if RLS is ever accidentally disabled on a
  table again (as happened to `shops`/`shop_users`) — the grant is a second,
  independent layer that should also be revoked, not relied upon to be
  harmless because a policy currently exists.

## What would move a row to PASS

A row moves from its current label to **PASS** only when
`docs/MOBILE_RLS_AUDIT.sql` has actually been run against the target
database and its output confirms: RLS enabled, RLS forced, a policy exists
whose `USING`/`WITH CHECK` expression references `shop_id`/`my_shop_ids()`
(or an equivalent real scoping predicate, not `true` and not only
`auth.uid() IS NOT NULL`), and no `anon` grant beyond what's intentionally
designed (e.g. the narrow `estimates_portal_update` pattern). See Phase 4
of this task for the remediation designed to get every CRITICAL/HIGH row
here to that state.
