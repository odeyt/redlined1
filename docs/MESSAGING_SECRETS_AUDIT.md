# Messaging Provider Credentials — Secret-Storage Audit

**Status: audited, NOT fixed.** No migration, rotation, or code change has
been made for this finding. This is a report + proposed design only, per
the standing instruction to determine the exposure before touching
credentials.

## Executive summary

`shop_settings.messaging_settings` — a jsonb column holding the shop's live
**Twilio Auth Token**, **LINE Notify token**, and **Telegram Bot Token** — is
readable by the browser anon-key client, and is in fact fetched into
**every authenticated screen's network response**, not just the Settings
page, because every screen calls a shared `fetchShopSettings()` that does
`select('*')`. This is a live credential-exposure issue, independent of
(and more severe than) the `send-message` recipient-injection bug it was
found while investigating.

## 1. Exact columns / JSON paths

- Table: `public.shop_settings`. **No `CREATE TABLE public.shop_settings` exists in this repo** — the table predates every tracked migration (created directly in the Supabase dashboard, not in source control). Only `ALTER TABLE public.shop_settings ADD COLUMN ...` statements exist (e.g. `supabase/migration_multitenant.sql:40` adds `shop_id`).
- Column: `messaging_settings` (jsonb). **Its own `ADD COLUMN` is not in any tracked SQL file either** — same out-of-band-creation gap. Its shape is only inferable from application code.
- JSON sub-keys in use (`services/shopSettingsService.ts:25-42`, `app/api/send-message/route.ts`):
  - `twilioSid`, `twilioToken`, `twilioFrom` (SMS/WhatsApp — Twilio)
  - `smsEnabled`, `whatsappEnabled` (booleans)
  - `lineToken`, `lineEnabled` (LINE Notify)
  - `telegramBotToken`, `telegramEnabled` (Telegram)

## 2. Current RLS policy

RLS is enabled on `shop_settings`. The effective policy (`shop_settings_shop_scoped`, defined identically in `supabase/migration_multitenant.sql:207-212`, `_v2.sql:188-193`, `_fix.sql:128-133`):
```sql
CREATE POLICY "shop_settings_shop_scoped" ON public.shop_settings
  FOR ALL TO authenticated
  USING    (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));
```
- Command: `ALL` (SELECT + INSERT + UPDATE + DELETE all under one policy).
- Role: `authenticated` only — `anon` has no matching policy, so despite `grant-permissions.sql:22` granting `select, insert, update, delete on shop_settings to anon, authenticated`, an anon (logged-out) request should return zero rows.
- **No role check** — any `shop_users` row for that shop, regardless of role (owner/manager/advisor/technician), satisfies `shop_id = ANY(my_shop_ids())`.
- An earlier version (`supabase/rls_phase7.sql:82-88`) had a *read* policy with `USING (true)` (no shop scoping at all) and a separate Owner-only *write* policy — superseded by the multitenant migration above, which removed the Owner-only write restriction in the process.
- ⚠️ Per this repo's own `docs/PRODUCTION_SECURITY_REMEDIATION.sql` (written earlier in this project), two other tables' live RLS state was confirmed to diverge from what their migration files claimed. **This table's live RLS status has not been independently re-verified against production** — treat the above as "what the migration files say," not confirmed live state, until checked with the same kind of anon-key probe used for `shops`/`shop_users`.

## 3. Current client-side reads

`services/shopSettingsService.ts:85-92`, `fetchShopSettings()`:
```ts
const { data, error } = await supabase          // browser anon-key client (lib/supabase.ts)
  .from('shop_settings')
  .select('*')                                    // includes messaging_settings
  .eq('shop_id', getShopId())
  .maybeSingle();
```
Called from `lib/supabase.ts`'s browser client (anon key), **not** a service-role client.

**Every one of these 12 client components calls `fetchShopSettings()`**, and therefore receives the full row — including `messaging_settings` — in its network response, regardless of whether that screen displays messaging settings at all:
`InspectionsView.tsx`, `LegacyDashboardView.tsx`, `EstimatesView.tsx`, `JobCardsView.tsx`, `SettingsView.tsx`, `PaymentsView.tsx`, `VehiclesView.tsx`, `CommunicationView.tsx`, `InvoicesView.tsx`, `AppointmentsView.tsx`, `ReportsView.tsx`, `RepairOrdersView.tsx`.

**`SettingsView.tsx` additionally loads the live secret values into visible form state** (`:129`, `setMessaging({ ...DEFAULT_MESSAGING, ...s.messaging })`), rendering them in `type="password"` inputs (`:876-930`). `type="password"` only masks the *display* — the actual token is present as the input's `value`, in React state, and in the network response, all inspectable via browser DevTools by any staff member who can open Settings (which, per §2, is any role, not just Owner).

## 4. Which roles can retrieve the values

**Any authenticated member of the shop, any role** (`owner`, `manager`, `advisor`, `technician`) — the RLS policy makes no role distinction. A technician account, which the rest of this security pass has been careful to *exclude* from privileged actions (invite, member removal, customer notifications), can read the shop's live Twilio/LINE/Telegram credentials just by loading almost any screen in the app, since the exposure isn't gated behind Settings at all.

## 5. Do secrets appear in browser network responses?

**Yes, confirmed.** Any of the 12 screens listed in §3 issues a `GET`-equivalent (PostgREST `select=*`) request to `shop_settings` and receives `messaging_settings` — including `twilioToken`, `lineToken`, `telegramBotToken` — in the JSON response body. This is visible in the Network tab of any authenticated session, not a theoretical risk.

## 6. Service-role or provider token in mobile-accessible data?

- **No service-role key is exposed anywhere client-side** — confirmed separately in this project's mobile-app audit (`lib/env.ts` only reads `EXPO_PUBLIC_*`, which structurally cannot include a service-role key).
- **However, if the mobile app ever calls the same `fetchShopSettings()`-equivalent query pattern against this table** (which mirrors the web app's direct-Supabase-read architecture by design — see the original mobile architecture audit), it would inherit this exact same exposure: the live Twilio/LINE/Telegram **provider tokens** (not a Supabase service-role key, but still a real third-party secret) would end up in the mobile app's own network traffic and, if cached or logged client-side, on the device. This is a live risk for the mobile Phase 2 work (job cards / messaging features), not just the web app — flagging so mobile screens don't replicate the same `select('*')` pattern.

## Proposed safe design (NOT implemented — for review)

The correct fix is **server-only storage**, following the exact pattern this
codebase already uses correctly for `SUPABASE_SERVICE_ROLE_KEY` and for
`send-message`'s own `getMessagingSettings()` (service-role client,
column-scoped `select('messaging_settings')`, server-side only):

1. **Stop selecting `messaging_settings` from any browser-context query.**
   Change `fetchShopSettings()` (or add a second, narrower function) so the
   12 non-Settings callers get a row shape that excludes `messaging_settings`
   entirely — e.g. `select('id, shop_id, name, phone, address, ...')`
   listing every column *except* `messaging_settings`, or split
   `messaging_settings` into its own table with tighter RLS.
2. **Settings UI**: replace the "fetch full secret, display masked, resend
   full secret on save" flow with a **write-only** pattern —
     - `GET` (server route, service-role): returns only a boolean per
       channel (`twilioConfigured: true/false`) and non-secret fields
       (`twilioFrom` is arguably fine to show, since it's a phone number
       staff would recognize, not a bearer credential) — never the actual
       token.
     - The token input starts empty; submitting a new value calls a
       **server route** (service-role) that upserts it. Leaving it blank
       on save means "keep the existing value," never round-tripped to the
       browser to be re-displayed.
3. **Longer-term**: move provider credentials out of a plain jsonb column
   entirely into a secrets manager (Supabase Vault, or an external one) and
   have the server route decrypt/fetch at send-time only. This is the
   "Vault design" the standing instruction referenced — recommended as the
   real end state, with the write-only route (item 2) as the safe interim
   step that closes the *browser exposure* immediately without requiring a
   Vault integration project first.
4. **RLS**: add a role check to `shop_settings_shop_scoped` (or split into
   a broadly-readable-non-secret-columns policy + an Owner/Manager-only
   policy for whatever remains sensitive) so even the interim server route
   enforces the same "not every role should touch this" boundary the rest
   of this security pass established for invite/member-management.
5. **Rotate the credentials already exposed.** Once the above ships,
   the current Twilio/LINE/Telegram tokens should be treated as
   compromised (they've been in an unknown number of staff members'
   browser sessions/DevTools already) and rotated at the provider. Not done
   here per the explicit instruction not to migrate/rotate yet — this is
   the action item for whoever approves the design above.

## Verification needed before treating this as fully scoped

- Confirm `shop_settings` RLS live state matches migration files (same
  anon-key-probe method already used for `shops`/`shop_users` — see
  `docs/LIVE_PRODUCTION_SECURITY_VERIFICATION.md` for the method).
- Confirm whether `messaging_settings`'s column type/constraints match what
  application code assumes, since no tracked migration defines it.
