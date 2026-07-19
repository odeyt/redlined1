# `send-message` Recipient Resolution — Design & Remaining Work

## What changed

`POST /api/send-message` previously accepted a caller-supplied `to` field as
the literal SMS/WhatsApp/LINE/Telegram destination, with no verification it
had anything to do with the shop's actual customer data. Any authenticated
shop member could direct a message — through the shop's own paid Twilio/LINE
credentials — to an arbitrary phone number, LINE token, or Telegram chat ID.

The route now accepts `{ shopId, channel, resourceType, resourceId, doc }`.
`to` is gone from the schema entirely, and `SendMessageSchema` is `.strict()`
— a caller that still sends a `to` field (or any other unrecognized field)
gets an explicit `400`. It is **rejected**, not silently stripped: a
security-conscious caller should see a hard failure that tells them the
field isn't accepted, not a request that quietly succeeds while ignoring
part of what they sent.

**Message content is a separate concern from recipient resolution.**
`doc.*` (type, number, vehicle, total, status, shopName, shopPhone) is still
entirely caller-supplied — sourced from data the client already loaded
through its own RLS-protected reads, so it isn't a cross-tenant leak, but a
stale or buggy client screen could send a customer a message with an
incorrect `total`/`status` (e.g. "Paid" after an invoice was reopened).
`total` and `status` are the two fields worth moving to a server-side
lookup by `resourceId` in a follow-up; `type`/`vehicle`/`shopName`/`shopPhone`
are lower-risk descriptive fields. Not done in this pass.

## Recipient resolution (server-side only)

`resourceType` is one of `job | customer | estimate | invoice`. `resourceId`
is the id of that record. The server resolves the destination itself, always
scoped to the caller's authorized `shopId`:

| resourceType | Query | Notes |
|---|---|---|
| `job` | `job_cards.customer_phone` / `customer_email` WHERE `id = resourceId AND shop_id = shopId` | Real per-row columns, added by `migration_repair_stages.sql` — same pattern `job-notify` already uses. |
| `customer` | `customers.phone` / `email` WHERE `id = resourceId AND shop_id = shopId` | Direct. |
| `estimate` | `estimates.customer_id` → `customers.phone`/`email`, both hops scoped to `shop_id` | `customer_id` can be `null` for an estimate never linked to a customer record — treated as "no trusted recipient", not an error to fall back from. |
| `invoice` | `invoices.customer_id` → `customers.phone`/`email`, same as estimate | `invoices`' primary key is the `number` column (`INV-0001`-style text, not `id`). |

If resolution finds no phone number for the requested channel, the request
is rejected (`400`) — there is no fallback to any caller-supplied value at
any point in this flow.

## Provider credentials — read exclusively from `shop_messaging_secrets`

`getMessagingSettings()` reads Twilio SID/token/from and the per-channel
`*_enabled` flags from `public.shop_messaging_secrets` — a server-only table
with no anon/authenticated grants and no RLS policies at all (default deny;
see `docs/MESSAGING_SECRETS_MIGRATION.sql`). The old
`shop_settings.messaging_settings` jsonb column, which was readable by the
browser anon-key client via a shared `select('*')` in multiple screens, is
never read by this route. This closes the credential-storage exposure
described in the (now superseded) `docs/MESSAGING_SECRETS_AUDIT.md` — see
`docs/MESSAGING_SECRETS_MIGRATION.sql` and
`docs/MESSAGING_SECURITY_DEPLOYMENT_SEQUENCE.md` for the exact two-phase
migration and deployment order this depended on.

Two related, narrower read surfaces exist for the client side:
- `GET /api/shop-messaging-secrets` (owner only) — redacted `configured`/
  `enabled`/`fromNumber` status, used by Settings. Never a secret value.
- `GET /api/messaging-channels-status` (owner/manager/advisor) — `enabled`
  booleans only, no `configured`/`fromNumber`/secret detail at all. Used by
  the Invoices/Estimates send modals to decide which channel buttons to
  show, without granting those roles any visibility into whether/how
  credentials are configured.

## LINE and Telegram are disabled, not partially fixed

A repo-wide grep (`line_token|telegram_chat|chat_id`, including every
`supabase/*.sql` migration) confirms: no table anywhere maps a specific
customer to a LINE Notify token or a Telegram chat ID. A shop-level LINE/
Telegram credential is an **outbound relay credential**, not a per-customer
recipient. There is nothing to resolve server-side for these two channels
today.

Per the standing instruction not to ship an authenticated arbitrary-message
relay, both channels now return a clear `400` unconditionally:
`"LINE sending is not available yet — no verified per-customer contact
channel exists for this channel."` (same wording pattern for Telegram). The
`/api/messaging-channels-status` endpoint also hardcodes `line`/`telegram`
to `false` regardless of the stored `line_enabled`/`telegram_enabled`
columns, so no client surface ever offers a button that's guaranteed to
fail. The Settings UI still lets an owner store LINE/Telegram credentials
and toggle their stored `enabled` flag (for whenever the channel does ship),
with an explicit on-screen warning that sending is temporarily disabled
regardless of that flag.

**Required migration before LINE/Telegram can ship:**
```sql
create table if not exists customer_contact_channels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id text not null references customers(id) on delete cascade,
  channel text not null check (channel in ('line', 'telegram')),
  external_id text not null, -- LINE Notify token or Telegram chat_id
  created_at timestamptz default now(),
  unique (shop_id, customer_id, channel)
);
-- RLS: shop_id = ANY(my_shop_ids()), same pattern as every other shop-scoped table.
```
Staff would populate this once per customer (e.g. when a customer messages
the shop's LINE/Telegram bot for the first time, capturing their id), and
`send-message` would resolve `channel = 'line'/'telegram'` from this table
exactly like it now resolves phone/email — never from the request body.
Not created here; this is a schema change requiring its own review, not
something to bundle into an auth fix.

## Durable abuse-control requirement

The current rate limit (`isRateLimited`, `lib/apiHelpers.ts`) is an
in-process, best-effort mitigation — it resets on cold start and isn't
shared across concurrent serverless instances. It is **not a security
control**. Before this endpoint carries real production message volume,
replace it with a durable, globally-consistent limiter (Upstash Redis /
Vercel KV), keyed at minimum by `shopId` and ideally also by the resolved
destination (phone number), to catch abuse that's spread across many
distinct `resourceId`s within the same shop. Tracked as a follow-up, not
blocking this fix (the primary vulnerability — arbitrary destination
injection — is closed regardless of rate-limit durability).

## Related, separately shipped: `JobIdSchema` required UUID format incorrectly

`job_cards.id` is a `text primary key` populated by the app as
`` `JC-${Date.now()}` `` (`services/jobCardService.ts`, `createJobCard`) —
**not a UUID**. `JobIdSchema` previously required `.uuid()` format, which
rejected every real job id with a `400` in production. Shipped separately as
`fix/job-id-hotfix` (commit `95a3988`, "fix: accept real job card
identifiers") and folded into this branch's base — see
`docs/MESSAGING_SECURITY_DEPLOYMENT_SEQUENCE.md` step 1.
`customers.id` (`` `C-${Date.now()}` ``) and `invoices.number`
(`INV-0001`-style) are the same non-UUID text-PK pattern, handled here via
`ResourceIdSchema`, used by `send-message` specifically.
