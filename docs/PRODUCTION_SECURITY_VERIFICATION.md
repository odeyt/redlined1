# Production Security Verification — Post-Remediation Test Plan

Run this **after** you've executed `docs/PRODUCTION_SECURITY_REMEDIATION.sql` in the
Supabase SQL Editor. Every test below is safe to run against production: the anon-key
probes are read-only, and the authenticated tests use accounts you already control.

Set these in your shell first (never commit real values — get them from your own
`.env.local`, do not paste them into any file or chat):

```bash
export SUPABASE_URL="<your NEXT_PUBLIC_SUPABASE_URL>"
export SUPABASE_ANON_KEY="<your NEXT_PUBLIC_SUPABASE_ANON_KEY>"
export SITE_URL="https://www.redlined1.com"   # or your staging URL
```

---

## 1. Anonymous requests cannot enumerate shops

```bash
curl -s "$SUPABASE_URL/rest/v1/shops?select=id,name&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
**Expect:** `[]` (empty array). Before the fix this returned real shop rows.

## 2. Anonymous requests cannot enumerate shop_users

```bash
curl -s "$SUPABASE_URL/rest/v1/shop_users?select=*&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
**Expect:** `[]`. Before the fix this returned 8 real `{shop_id, user_id, role}` rows.

## 3. An authenticated user can access only authorized shop data

Log into the app as a real staff account (any role). In the browser dev console or via
the app's normal UI:
- Dashboard loads with that user's own shop name and role (via `lib/useShop.ts`).
- No console errors on the `shop_users`/`shops` reads that used to run unauthenticated
  behind the scenes.

To confirm at the REST layer, grab that user's access token (Supabase client session,
`localStorage` key `sb-<project-ref>-auth-token`, field `access_token`) and run:
```bash
export USER_TOKEN="<that user's access_token>"
curl -s "$SUPABASE_URL/rest/v1/shop_users?select=shop_id,role" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $USER_TOKEN"
```
**Expect:** only that user's own membership row(s) — not other users' rows, even from
the same shop.

## 4. A user from shop A cannot access shop B

Using two real accounts belonging to different shops (`userA`, `userB`):
```bash
export USER_A_TOKEN="<userA access_token>"
curl -s "$SUPABASE_URL/rest/v1/shops?select=id,name&id=eq.<shopB_id>" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $USER_A_TOKEN"
```
**Expect:** `[]`. Also exercise this through the app-level routes:
```bash
curl -s -X POST "$SITE_URL/api/job-notify" \
  -H "Authorization: Bearer $USER_A_TOKEN" -H "Content-Type: application/json" \
  -d '{"jobId":"<any shopB job id>","shopId":"<shopB_id>","stage":"ready"}'
```
**Expect:** `403 {"error":"Not a member of this shop"}`.

## 5. A non-owner cannot create invitations or change roles

Using a `manager`/`advisor`/`technician` account's token against their **own** shop:
```bash
curl -s -X POST "$SITE_URL/api/invite" \
  -H "Authorization: Bearer $NON_OWNER_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"technician","shopId":"<their own shop_id>"}'
```
**Expect:** `403 {"error":"Insufficient role for this action"}`.

Repeat against `PATCH /api/invite` and `DELETE /api/members` — same expected `403`.

## 6. An owner can perform legitimate member-management actions

Using a real `owner` account's token against their own shop:
```bash
curl -s -X GET "$SITE_URL/api/members?shopId=<their shop_id>" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```
**Expect:** `200` with the full member roster (not just the owner's own row — confirms
`app/api/members` GET's service-role listing still works after RLS tightened).

Also smoke-test in the actual UI: Settings → Team → invite a real test account, confirm
the email arrives and the new member appears in the roster; change their role; remove
them. All three should succeed for an owner.

## 7. Forged shop_id, user_id, role, or owner_id fields are rejected

Using a valid, low-privilege account's token (e.g. `technician` at shop A), attempt to
impersonate a different identity purely via body fields:
```bash
# Claim to be acting for a shop you don't belong to
curl -s -X POST "$SITE_URL/api/invite" \
  -H "Authorization: Bearer $TECH_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"x@example.com","role":"owner","shopId":"<some other real shop_id>"}'
```
**Expect:** `403` — the shopId in the body is never trusted as proof of membership;
`requireShopRole()` looks up the *caller's own* `shop_users` row for that shopId, which
doesn't exist, so it's rejected regardless of what the body claims.

```bash
# Attempt role self-escalation via job-status body fields (jobId/shopId only ever
# used as resource identifiers, never as identity)
curl -s -X POST "$SITE_URL/api/job-status" \
  -H "Authorization: Bearer $TECH_TOKEN" -H "Content-Type: application/json" \
  -d '{"jobId":"<real job at a shop tech is NOT a member of>","shopId":"<that shop_id>","stage":"ready"}'
```
**Expect:** `403`.

## 8. Invalid and expired bearer tokens are rejected

```bash
# Missing token
curl -s -X POST "$SITE_URL/api/invite" -H "Content-Type: application/json" \
  -d '{"email":"x@example.com","role":"technician","shopId":"<any shop_id>"}'
# Expect: 401 {"error":"Missing bearer token"}

# Malformed token
curl -s -X POST "$SITE_URL/api/invite" \
  -H "Authorization: Bearer not-a-real-jwt" -H "Content-Type: application/json" \
  -d '{"email":"x@example.com","role":"technician","shopId":"<any shop_id>"}'
# Expect: 401 {"error":"Invalid or expired token"}

# Expired token (use a token from a session you've since signed out of, or wait
# for a short-lived token to expire)
curl -s -X POST "$SITE_URL/api/invite" \
  -H "Authorization: Bearer $EXPIRED_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"x@example.com","role":"technician","shopId":"<any shop_id>"}'
# Expect: 401 {"error":"Invalid or expired token"}
```

## 9. Existing authenticated website workflows still operate

Manual smoke test as each role (owner, manager, advisor, technician) on a real or
staging shop:
- [ ] Log in, dashboard loads with correct shop name/role
- [ ] View job cards / repair orders list
- [ ] Advance a job card's repair stage (owner/manager/advisor/technician — `POST
      /api/job-status`)
- [ ] Generate/view a job's public status-tracking link (`PUT /api/job-status`)
- [ ] Trigger a customer SMS/email notification (`POST /api/job-notify`)
- [ ] Owner: view team roster, invite a member, change a role, remove a member
- [ ] Non-owner: confirm the invite/role-change/remove UI is either hidden or returns
      a clear 403 if attempted directly

## 10. Public job-status access remains limited to its intended secure token mechanism

```bash
# No auth header at all — this MUST still work, it's the customer-facing tracker
curl -s "$SITE_URL/api/job-status?token=<a real status_token>"
```
**Expect:** `200` with job status — confirms `GET /api/job-status` is unaffected (by
design, documented in the route's header comment — it's gated by the opaque token
itself, not by shop membership).

```bash
# Guessing/enumerating tokens must not work
curl -s "$SITE_URL/api/job-status?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
```
**Expect:** `404 {"error":"Not found"}`.

```bash
# But generating a NEW token (PUT) still requires real shop-staff auth
curl -s -X PUT "$SITE_URL/api/job-status" -H "Content-Type: application/json" \
  -d '{"jobId":"<real job id>","shopId":"<its shop_id>"}'
# Expect: 401 (no token supplied)
```

---

## Rollback procedure

If any of the above reveals a regression (most likely candidate: #6, the member
roster), the commented-out rollback block at the bottom of
`docs/PRODUCTION_SECURITY_REMEDIATION.sql` reverts RLS on both tables to their prior
disabled state and restores the anon grant. Run it in the SQL Editor, then re-run tests
1–2 above to confirm you're back to the pre-fix (open) state before investigating
further — do not leave the app in a half-migrated state.

The code-level fixes (`lib/serverAuth.ts` and the four route changes) are independent
of the SQL and do not need to be rolled back together — they only make routes *more*
restrictive, so they cannot cause the kind of breakage the SQL rollback would be
needed for. If a route-level fix itself needs reverting, use `git revert` on that
commit once one exists.
