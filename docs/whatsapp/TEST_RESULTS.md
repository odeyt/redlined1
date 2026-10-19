# WhatsApp Business: test results

Run on 2026-10-19 on branch `claude/whatsapp-business-coexistence-c273e6` (Windows 11, Node 26).

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **Pass**, 0 errors |
| Unit + route tests (whole repo) | `npx jest` | **Pass**: 299 suites, **5,397 tests**, 0 failures |
| WhatsApp tests only | `npx jest lib/whatsapp app/api/whatsapp` | **Pass**: 3 suites, **79 tests** |
| Database (real Postgres 17, Supabase image) | `npm run test:db:whatsapp` | **Pass**: **47 checks** |
| Production build | `npm run build` | **Pass**. All 10 new routes are listed (`/api/whatsapp/*` ×9, `/api/webhooks/whatsapp`). |
| Lint ratchet | `npm run lint:ratchet` | **Pass**: 178 errors vs baseline 180, warnings 168 = baseline. The new files add 0 errors. |

## What the tests prove

**`lib/whatsapp/__tests__/sendService.test.ts`** (24). These run against a schema-faithful fake database. It rejects any column that production does not have (captured schema) or that the migration does not create (parsed from the SQL file).
- A historical **D1 Imports** invoice (archived shop) is sent from the merged shop. Recipient, totals ($106.35 = 100 + 6.35% tax) and the portal link are all derived on the server. A LAK estimate in Lao and a job-card repair update resolved through its repair order are also sent.
- A document of another tenant returns not found.
- Gates: not connected, master switch off, live without the env switch, live without coexistence, live allowed once every gate passes, sandbox recipient allowlist, no phone, consent required / recorded inline / logged, opt-out final, template not APPROVED (missing language or PENDING), portal-scope mismatch refused, no customer record, expired token marks the row failed, Meta refusal recorded and the key freed for a retry.
- Duplicates: dialog replay, unchanged content refused until a confirmed resend, changed document allowed, other language still a duplicate, crashed pending attempt released after 2 minutes.
- Automations: require activation and never record consent.

**`lib/whatsapp/__tests__/core.test.ts`** (36): Lao/Thai phone normalization and masking; template rules (placeholder order, no variable at start/end, examples, link only in the button, fixed portal base URL); webhook HMAC verification; parsing (statuses, STOP keyword, account events, echoes/history ignored and never stored); forward-only status precedence; eligibility (country, attestations, server config, coexistence check); pilot allowlist; entitlements (internal / plan / add-on / not purchasable while billing is off); dedupe keys; mock transport refused on production; AES-GCM token round-trip, tamper detection and missing key; the fake DB's own schema guard.

**`app/api/whatsapp/__tests__/routes.test.ts`** (19). The real route handlers, with the mock transport:
- An advisor can send; a technician gets 403; a non-pilot shop, the archived D1 shop and a disabled flag get 404; `to`/`text` in the body gets 400; a duplicate gets 409 with the earlier send.
- Non-owners get the minimal status; the token never appears in any response; sandbox recipients are masked.
- Live needs the exact phrase and coexistence, and returning to sandbox revokes it. Only the owner can change settings; switching off stops automations; the switch cannot be turned on before connecting.
- Embedded Signup with a non-coexistence event gets 409 and nothing is stored; it requires the checklist and a delivered sandbox test. The sandbox path refuses a Business App number and stores a test number switched off with an encrypted token.
- Webhook: verify-token handshake; 401 on a missing or bad signature with nothing changed; statuses never regress; STOP → opt-out → the next send is refused; PARTNER_REMOVED switches sending off.

**`tests/db/run-whatsapp-db-tests.mjs`** (47, real Postgres 17.6 with Supabase default grants):
- The migration applies and re-applies; the flag is seeded once, disabled, scoped to the merged shop.
- 6 tables: RLS on, 0 policies, 0 PUBLIC/anon/authenticated grants (catalog `aclexplode`); anon and authenticated are denied.
- Defaults are sandbox, off, no automations. Live is impossible without approval, and impossible on a test number even with approval. ≤5 recipients; E.164 only; plaintext tokens refused.
- Unique dedupe key and client request id; a failed send frees the key; the server cannot delete delivery history.
- Consent history is append-only (even for a superuser UPDATE); consent records cannot be deleted.
- The rollback refuses while locked and changes nothing; unlocked, it drops exactly the WhatsApp tables and the flag, leaves business tables untouched, is re-runnable, and the migration re-applies cleanly afterwards.

## Bugs found and fixed by these tests

1. **Rollback could never run.** The unlock `set_config(..., true)` was placed before `BEGIN`, so its transaction-local value was gone by the time the lock check ran. Moved inside the transaction (found by `test:db:whatsapp`).
2. **Message preview showed UPPERCASE text.** The app shell uppercases everything (`body { text-transform: uppercase }`), so the preview did not match what the customer receives. The preview now preserves case (found while taking screenshots).
3. **Lint**: three `set-state-in-effect` errors in the new components were fixed, so lint debt did not grow.

## Not tested here (needs Meta or the owner)

- A real send through Meta's sandbox number and a real delivery webhook. This needs a Meta app, a test number and the env vars. Steps are in `META_ONBOARDING.md` §4, and the code requires it before the shop number can be connected.
- The Embedded Signup popup (needs the Meta app configuration and the owner's phone).
- Template approval by Meta, and native-speaker review of the Lao text.
- Playwright end-to-end tests against a signed-in session. The screenshots were rendered from the real components with mocked API responses (see `README.md`).
- The migration on staging or production. The owner applies it.
