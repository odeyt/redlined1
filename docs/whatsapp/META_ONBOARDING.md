# WhatsApp Business: Meta onboarding, connection and verification

This guide covers connecting D1 Imports' existing WhatsApp Business App number to RedlineD1 through Meta's Cloud API **coexistence** flow. With coexistence, the shop keeps using the WhatsApp Business App on the shop phone exactly as today. RedlineD1 can also send approved template messages (estimates, invoices and repair updates) from the same number.

> **Nothing in this PR connects the production number or sends a live customer message.** Each step below is run by the owner. Every switch starts OFF.

Sources, read 2026-10-19:
- developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users (coexistence)
- developers.facebook.com/docs/whatsapp/embedded-signup/implementation and /versions (Embedded Signup v4)
- developers.facebook.com/docs/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider

Meta changes these pages often, so re-read them before onboarding.

---

## 1. What Meta requires

| Requirement | Who | Notes |
|---|---|---|
| Meta Business portfolio for D1 / RedlineD1, **business verification** completed | Owner | Business Settings → Security Center. Required for Advanced Access and higher messaging limits. |
| A Meta **app** (type Business) with the WhatsApp product | Owner | App Dashboard. Its App ID becomes `NEXT_PUBLIC_WHATSAPP_APP_ID`. |
| **Tech Provider** (or Solution Partner) status for that app | Owner | Coexistence onboarding is only offered to Tech Providers and Solution Partners. Becoming one requires App Review for Advanced Access to `whatsapp_business_management` and `whatsapp_business_messaging`. If D1 does not want to become a Tech Provider, the alternative is a Solution Partner (BSP) that supports coexistence. That path is not built here. |
| **Facebook Login for Business** configuration using the *WhatsApp Embedded Signup* login variation | Owner | Its Configuration ID becomes `NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID`. Choose the WhatsApp products in the configuration. On v4, product selection lives in the configuration, not in code. |
| **Embedded Signup v4** | Code | v2 and v3 were deprecated on **2026-10-15**. RedlineD1 does not send a `version` in `extras`, and Meta serves such requests as v4. |
| Allowed domains and valid OAuth redirect URIs include `https://www.redlined1.com` (and staging if used) | Owner | App Dashboard → Facebook Login for Business → Settings. HTTPS only. |
| WhatsApp Business **App version 2.24.17 or later** on the shop phone | Owner | In the app: Settings → Help → App info. |
| The number is already on the **WhatsApp Business App**, not personal WhatsApp | Owner | Coexistence connects an existing Business App number only. |
| Country supported | Meta | Meta's page does not publish a list. Partner documentation (2026) reports Nigeria (+234) and South Africa (+27) as the remaining exclusions. Laos (+856) is not reported as excluded. The Embedded Signup screen decides: if it does not offer "Connect your existing WhatsApp Business App", the number is not eligible. |
| **Payment method** in WhatsApp Manager | Owner | Overview → Add payment method. Meta says onboarding is complete only after this. |
| Webhook subscribed to `messages`, `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes` | Owner | App Dashboard → WhatsApp → Configuration (section 3 below). |
| Approved **message templates** | Meta review | RedlineD1 submits them from Settings (section 5). Business-initiated messages must be approved templates. |

### Environment variables (Vercel; never committed)

| Variable | Scope | Value |
|---|---|---|
| `NEXT_PUBLIC_WHATSAPP_APP_ID` | Public | Meta App ID |
| `NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID` | Public | Embedded Signup configuration ID |
| `WHATSAPP_APP_SECRET` | **Server, Sensitive** | App Secret: used for the code exchange and for verifying webhook signatures |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **Server, Sensitive** | Any long random string. The same value goes in the App Dashboard. |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | **Server, Sensitive** | 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `WHATSAPP_LIVE_SENDING_ENABLED` | Server | Leave **unset**. Set to `true` only when the owner approves live customer messages. |
| `WHATSAPP_GRAPH_API_VERSION` | Server, optional | Defaults to `v23.0` |
| `WHATSAPP_TRANSPORT` | Local dev only | `mock` = no network calls. Ignored on production. |

---

## 2. Apply the database migration

The owner runs this in the Supabase SQL editor (staging first, then production):

```
supabase/migrations/2026-10-19_whatsapp_business.sql
```

It only adds tables and seeds the `whatsapp_business` flag **disabled** for the merged D1 Imports shop. Verify with:

```sql
SELECT flag_key, scope, shop_id, enabled FROM feature_flags WHERE flag_key = 'whatsapp_business';
-- expect: whatsapp_business | shop | 90b72748-bf01-4456-999f-f4ba48091606 | false

SELECT c.relname, c.relrowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies,
       (SELECT count(*) FROM aclexplode(c.relacl) a WHERE a.grantee = 0
          OR a.grantee IN ('anon'::regrole, 'authenticated'::regrole)) AS client_grants
  FROM pg_class c WHERE c.relname LIKE 'whatsapp_%' AND c.relkind = 'r' ORDER BY 1;
-- expect 6 rows: relrowsecurity = t, policies = 0, client_grants = 0
```

Then enable the flag for the pilot shop in Settings → Feature Flags (the row exists, so the toggle works). With the flag on, Settings shows **Integrations → WhatsApp Business** to the owner. Nothing can send yet.

---

## 3. Webhook

App Dashboard → WhatsApp → Configuration:

- **Callback URL:** `https://www.redlined1.com/api/webhooks/whatsapp`
- **Verify token:** the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Click **Verify and save**. The Settings checklist then shows "Webhook verified by Meta".
- Subscribe to the fields `messages`, `account_update`, `history`, `smb_app_state_sync` and `smb_message_echoes`.

The route is public in `proxy.ts`, like the other provider webhooks. Every POST must carry a valid `X-Hub-Signature-256`, or it gets a 401. Inbound message text, echoes and chat history are acknowledged but **not stored**.

---

## 4. Sandbox test (required before the shop number)

1. App Dashboard → WhatsApp → **API Setup**: note the test **Phone number ID** and **WhatsApp Business Account ID**, and generate a temporary access token (valid 24 h). Under "To", add and verify up to 5 test recipient phones (staff phones).
2. RedlineD1 → Settings → Integrations → WhatsApp Business → **2 · Test with Meta's sandbox number**: paste the three values and choose **Connect test number**. RedlineD1 asks Meta about the number before saving, and **refuses** any number Meta reports as a WhatsApp Business App number. The shop number can never be connected through this path.
3. Enter the same test recipient numbers in **Sandbox test recipients**. In sandbox mode RedlineD1 sends **only** to these numbers, even if staff press Send on a real customer's invoice.
4. Templates → **Submit English templates**. Wait for Meta's review (usually minutes to hours), then **Refresh statuses** until they show APPROVED.
5. Switch the master switch **On**.
6. Create a test customer whose phone is one of the test recipients. Then open an invoice → **💬 Send WhatsApp**, tick consent, and send.
7. On the phone, confirm the message arrives. In the dialog's delivery history, confirm it moves to ✓✓ Delivered / Read. The panel then shows **TEST DELIVERED**, which unlocks step 3.

---

## 5. Connect the shop number (coexistence)

Prerequisites, all enforced by the server:
- Every item in **1 · Coexistence eligibility** is ticked and passing.
- One sandbox message has been delivered.
- All server env vars from section 1 are set.

Steps:
1. Keep the shop phone nearby with the WhatsApp Business App open and up to date.
2. Settings → **Connect existing WhatsApp Business App**. Meta's Embedded Signup popup opens.
3. Choose **Connect your existing WhatsApp Business App**, select or create the business portfolio, and enter the shop's number.
4. On the shop phone, the app shows a prompt. Tap **Connect**, then **Connect to the Business Platform**. Choose whether to share chat history (RedlineD1 does not import history either way).
5. RedlineD1 receives `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` and then:
   - exchanges the one-time code (valid about 30 seconds) for a business token on the server;
   - reads the number from Meta and **requires `is_on_biz_app = true` and `platform_type = CLOUD_API`**, which proves coexistence;
   - subscribes the app to the account's webhooks;
   - stores the connection **switched off, in sandbox mode**, with the token AES-256-GCM encrypted.
   - It **does not call `/register`**: Meta says to skip registration for Business App numbers. It never calls `/deregister`.
   - Any other finish event (Cloud-API-only registration, new number, migration) is **refused, and nothing is stored**.
6. Submit templates again. Templates belong to a WhatsApp Business Account, so the sandbox approvals do not carry over and were cleared when the account changed. Wait for APPROVED.
7. Put the owner's own phone in **Sandbox test recipients**. Switch **On**, then send yourself an invoice. The message now comes from the real shop number but can still only reach test numbers.

### Verify the connection at any time

**Verify connection** re-reads the number from Meta. It shows quality rating, messaging limit tier, `is_on_biz_app`, `platform_type` and webhook status. If Meta no longer reports coexistence (the owner disconnected in the app, or about 14 days passed without the phone app being opened), RedlineD1 marks the connection **needs attention**, switches sending **off** and returns to sandbox mode.

Optional direct check (owner, Graph API Explorer):
```
GET /<PHONE_NUMBER_ID>?fields=is_on_biz_app,platform_type,display_phone_number,quality_rating
→ is_on_biz_app: true, platform_type: "CLOUD_API"
```

---

## 6. Go live (owner approval, two gates)

1. Settings → **4 · Live customer messages** → type `SEND LIVE MESSAGES` → **Approve live**. The owner's id and the time are recorded. The database refuses live mode without them, and on anything but a coexistence connection.
2. In Vercel, set `WHATSAPP_LIVE_SENDING_ENABLED=true` and redeploy. Until this is set, live mode still sends nothing.

From then on, staff can send to any customer who has **opted in**. Every send still needs an approved template, a usable number and no duplicate.

**Automated notifications** (optional, section 5 of the panel): off by default. With "Vehicle ready for pickup" ticked, a job card reaching *Ready for Pickup* sends one repair update to an already opted-in customer. Automated sends never record consent, and each job stage is sent at most once.

---

## 7. Lao templates

The Lao (`lo`) template text in `lib/whatsapp/templates.ts` is a **draft**. Before **Submit Lao templates**, a native speaker at D1 should review it. Meta does not allow editing an approved template's text, only replacing it under a new name. The English templates do not depend on the Lao ones.
