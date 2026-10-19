# WhatsApp Business: security and rollback

## Security model

### Who can do what

| Action | Roles | Route |
|---|---|---|
| See whether Send WhatsApp is available | owner, manager, advisor | `GET /api/whatsapp/connection` (returns only `available, canSend, sendBlocker, mode, status, enabled` to non-owners) |
| Send one document / record consent | owner, manager, advisor | `POST /api/whatsapp/send`, `POST /api/whatsapp/consent` |
| Dialog state (masked recipient, preview, history) | owner, manager, advisor | `GET /api/whatsapp/messages` |
| Connect, verify, templates, master switch, live approval, automations, disconnect | **owner only** | `/connection` (PUT/DELETE), `/sandbox`, `/embedded-signup`, `/verify`, `/templates` |
| Trigger the "ready for pickup" automation check | any member (incl. technician) | `POST /api/whatsapp/automation`. It sends only if the owner activated automations, and is quietly skipped otherwise. |
| Meta webhook | Meta (signature) | `GET/POST /api/webhooks/whatsapp` |

Every `/api/whatsapp/*` route first runs `requireWhatsAppAccess` (`lib/whatsapp/server.ts`), which requires all four of:
1. a valid Supabase session and the role in that shop (`requireShopRole`);
2. the shop is on the **pilot allowlist**, which holds only the merged D1 Imports shop `90b72748…`;
3. the **`whatsapp_business` feature flag** is on for that shop/role/user;
4. the shop is **entitled** (internal D1 shops always are).

Any other shop gets the same 404 "not available", so the integration is not advertised to other tenants.

### Nothing customer-facing comes from the browser

- Request bodies are zod `.strict()`. A `to`, `phone`, `text` or any other unknown field is a 400.
- Recipient, customer name, vehicle, document number and **total** are read on the server, inside the merged-shop scope (`lib/whatsapp/resolveDocument.ts`). Totals are computed by the same pure functions the staff screens use. Unlike the legacy Twilio `/api/send-message`, none of the content is caller-supplied.
- Only Meta-approved templates are sent; RedlineD1 never sends free text.

### Merged-shop access (historical documents)

The connection belongs to the active merged shop. Documents are looked up with `mergedShopScope(db, shopId)`: the active shop plus the archived D1 Imports shop mirrored into it, never any other shop. A document of any other tenant resolves as "not found". Tested in `lib/whatsapp/__tests__/sendService.test.ts` against production column names.

### Secrets

| Secret | Where | Protection |
|---|---|---|
| Cloud API access token | `whatsapp_connection_secrets.access_token_enc` | **AES-256-GCM encrypted by the app** with `WHATSAPP_TOKEN_ENCRYPTION_KEY` (server env). The table is service-role only, and a CHECK rejects anything not in the `v1:` encrypted format. It is decrypted only in the send/verify/template paths, after every gate has passed. It is never returned by any route (tested) and never logged. |
| App secret | `WHATSAPP_APP_SECRET` env | Server only. Used for the code exchange and webhook HMAC. |
| Webhook verify token | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` env | Server only. Compared in constant time. |
| Encryption key | `WHATSAPP_TOKEN_ENCRYPTION_KEY` env | Server only. Never in the database. |

Why encrypt on top of service-role-only? The production security hold (`docs/security-hold-remediation-plan.md`) showed that database-side paths such as pg_net's queue can expose data to roles that should not see it. An encrypted token is useless without the Vercel env key.

The Embedded Signup code is exchanged server to server, and the business token never reaches the browser. The sandbox form's token field is write-only (`type=password`, cleared after save, never displayed).

### Database

All six tables have **RLS on with no policies**, and **no grants to PUBLIC / anon / authenticated** (verified from the catalog with `aclexplode`, because `information_schema` hides PUBLIC grants). Schema-level guard rails:
- `mode = 'live'` is impossible without `live_approved_at`/`live_approved_by` **and** `onboarding_type = 'coexistence'`.
- At most 5 sandbox recipients; phone numbers are E.164 digits only.
- `whatsapp_messages`: unique `(shop_id, client_request_id)`; unique `(shop_id, dedupe_key) WHERE status <> 'failed'`; unique `wamid`. Even the service role cannot DELETE or TRUNCATE.
- `whatsapp_consent_events`: append-only (trigger plus grants). Even the service role cannot UPDATE, DELETE or TRUNCATE.

### Consent (Meta opt-in policy)

- A business-initiated message needs the customer's opt-in. When none is on file, staff must tick "The customer agreed…" and pick how (in person/phone, or in writing). It is recorded with the user and time, and appended to the immutable log.
- **STOP / UNSUBSCRIBE / ຢຸດ** from the customer → opt-out (webhook). **START** → opt-in. Staff can also record "Customer asked to stop".
- An opt-out is final for every send path. Re-opting in requires a note.
- Automated sends never record consent; they go only to customers who already opted in.
- Every template carries the footer "Reply STOP to opt out".

### Sandbox vs live: three gates before a real customer is messaged

1. **Sandbox mode** (the default for every new connection, including the real shop number) sends **only** to the ≤5 allow-listed test numbers.
2. **Owner live approval**: type `SEND LIVE MESSAGES`. The user and time are recorded and enforced by a DB CHECK. Switching back to sandbox revokes it.
3. **Deployment switch** `WHATSAPP_LIVE_SENDING_ENABLED=true` in Vercel. Without it, live mode sends nothing.

The connection also has to report coexistence (`is_on_biz_app = true`, `platform_type = CLOUD_API`) at send time.

### Protecting the owner's number

- Only the coexistence finish event is accepted. A Cloud-API-only registration, a new number or a migration is refused, and nothing is stored.
- The connection is stored only if Meta confirms `is_on_biz_app = true` **and** `platform_type = CLOUD_API`.
- The sandbox path refuses any number Meta reports as on the Business App.
- RedlineD1 **never calls `/register` or `/deregister`**. "Disconnect RedlineD1" only deletes RedlineD1's stored token and switches sending off. The Business App and the Meta registration are untouched.
- `Verify connection`, and `account_update` webhooks containing REMOVED / DELETED / DISCONNECT / OFFBOARD / BANNED / DISABLED / RESTRICT, switch sending off automatically.

### Webhook

- POST must carry a valid `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret, constant-time compare). Otherwise it gets a 401 and nothing changes.
- Statuses only move forward (`sent → delivered → read`; `failed` cannot undo `delivered`/`read`). Updates are conditional on the status that was read, so concurrent webhooks cannot regress a row.
- Inbound message **text is never stored**, and neither are coexistence echoes (`smb_message_echoes`), chat history or contact sync. Only exact opt-out/opt-in keywords are acted on.

### Duplicate prevention

- One `clientRequestId` per dialog. Double-clicks and network retries replay the first result.
- `dedupe_key` = sha256(shop, document, template, recipient, content fingerprint: status and total, or the job stage). The same unchanged content cannot be sent twice unless staff tick "Send it again anyway". A failed send frees the key; a pending row older than 2 minutes is treated as crashed.
- Rate limit: 30 sends per shop per minute. This is in-process and best-effort, like the existing messaging routes. It is **not** a security control.

### Privacy

Staff screens show only a masked number (`+856 •••• 1234`). Full numbers stay on the server. VIN is never part of any template or query. Secure links are the customer's existing portal token (`/portal/<token>`). It is carried only in the template's URL button, never in the message text. Meta does see the full URL, as with any link sent over WhatsApp.

### Resilience (CLAUDE.md 11–12)

- Every WhatsApp path is separate from the document workflows. If Meta, the webhook or the WhatsApp tables are unavailable, invoices, estimates and job cards work exactly as before; only the WhatsApp action reports an error.
- The job card automation is fire-and-forget, called after the stage is saved. Its errors are swallowed and it can never undo or delay the save.
- The Send button renders nothing unless the flag is on, the shop is the pilot, and the connection is connected.

---

## Rollback

Use the least destructive option that solves the problem.

| Level | What | Effect | Reversible |
|---|---|---|---|
| 1 | Settings → WhatsApp Business → master switch **Off** | All sending stops at once (manual and automated). Settings and history are kept. | Yes, switch on |
| 2 | Settings → Feature Flags → `whatsapp_business` **Off** | The integration disappears from Settings and all document screens; every `/api/whatsapp/*` route returns 404. | Yes |
| 3 | Vercel: unset `WHATSAPP_LIVE_SENDING_ENABLED` and redeploy | Live sends stop; sandbox still works | Yes |
| 4 | Settings → **Disconnect RedlineD1** | Stored token deleted; status `disconnected` | Reconnect through onboarding |
| 5 | SQL: `UPDATE public.whatsapp_connections SET enabled = false, automations_enabled = false;` | Same as 1, if the UI is unavailable | Yes |
| 6 | Revert the PR | Code removed. Tables stay, unused. | Yes |
| 7 | `supabase/migrations/2026-10-19_whatsapp_business_rollback.sql` | **Drops the tables (consent and delivery history are lost)** and the flag row | Re-apply the migration; history is gone |

Level 7 is locked: uncomment the `set_config` line just after `BEGIN`. Export first:
```sql
SELECT * FROM public.whatsapp_consent_events;
SELECT * FROM public.whatsapp_messages;
```

None of these levels changes anything at Meta. To end coexistence itself, the owner opens the WhatsApp Business App → Settings → Account → **Business Platform** → **Disconnect Account**. Meta does not allow `/deregister` for a coexistence number, and RedlineD1 never calls it.

All levels were exercised in tests: master switch, flag, live gates and disconnect in `app/api/whatsapp/__tests__/routes.test.ts`; the locked rollback, its re-run and a clean re-apply in `npm run test:db:whatsapp`.
