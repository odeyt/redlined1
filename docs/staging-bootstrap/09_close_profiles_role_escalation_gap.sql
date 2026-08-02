-- ============================================================
-- Close a self-role-escalation path found during this session's
-- role-escalation audit (docs/ROLE_ESCALATION_SECURITY_AUDIT.md).
--
-- FINDING: 20260721_01's profiles_self_update policy
-- (USING (id = auth.uid()) WITH CHECK (id = auth.uid())) allows a
-- caller to update ANY column of their own profiles row, including
-- `role`. The accompanying profiles_role_values_check CHECK
-- CONSTRAINT only validates that the new value is one of
-- ('Owner','Advisor','Technician','Manager', NULL) — it does NOT
-- prevent a user from CHANGING their own role to a more privileged
-- one, since 'Owner' is itself a valid value in that list. This is
-- exactly the "a CHECK constraint that only validates allowed role
-- strings is not sufficient" gap this task's Phase 6 explicitly
-- warns about.
--
-- CONFIRMED EXPLOITABLE, not just theoretical: app/api/test-results/route.ts
-- reads `profiles.role` directly (`if (profile?.role !== 'owner')`)
-- to gate access — a technician/advisor/manager could self-update
-- profiles.role to 'Owner' via the client-side authenticated
-- Supabase client (the profiles_self_update policy permits it) and
-- then pass that route's authorization check despite not actually
-- being a shop owner. Real-world impact of that specific route is
-- low (it serves e2e test report JSON, not business data), but the
-- underlying escalation primitive is real and could affect any
-- other code that trusts profiles.role — a full repo grep found
-- this to be the only current caller, but the fix closes the
-- primitive itself, not just this one call site.
--
-- FIX: Postgres column-level privileges. Revoking UPDATE on
-- specifically the `role` column from `authenticated` means any
-- UPDATE statement whose SET clause touches `role` is rejected at
-- the grant-check layer — before RLS is even evaluated, and
-- regardless of what profiles_self_update's USING/WITH CHECK say.
-- This mirrors the same "grants are the real boundary" pattern
-- already relied on for shop_users (which has no UPDATE grant for
-- authenticated at all).
--
-- DO NOT APPLY TO PRODUCTION — staging only until approved.
-- ============================================================

BEGIN;

REVOKE UPDATE (role) ON public.profiles FROM authenticated;

-- service_role is unaffected (BYPASSRLS + not subject to column
-- grants in the same way superuser-equivalent roles operate) — the
-- app's own service-role-backed routes (app/api/invite PATCH, the
-- only legitimate role-change path) continue to work unchanged.

COMMIT;
