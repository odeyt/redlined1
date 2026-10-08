# Push dispatch redesign — no credential in the pg_net queue

**Status: design only.** Nothing here is implemented, applied or deployed. Each
step needs the owner's approval at the time, and staging goes first.

Part of the production security hold (`docs/security-hold-remediation-plan.md`).

## The problem

Today an alert is pushed like this:

1. A row is inserted into `public.alert_events`.
2. Trigger `alert_events_push` runs `public.notify_push_on_alert()`, which reads
   the secret from Vault and calls `net.http_post` to
   `https://www.redlined1.com/api/push/send`. The call carries header
   `x-push-secret` and body `{"record": <the whole alert row>}`.
3. pg_net writes that request, **decrypted header included**, into
   `net.http_request_queue` until its worker sends it.
4. `app/api/push/send/route.ts` accepts the request if the header equals Vercel
   `PUSH_WEBHOOK_SECRET`, then **pushes the title and body it was sent**.

Supabase documents that every database role that can use pg_net can read the
queued headers, and that Vault protects the secret only at rest: the decrypted
value lands in the `headers` column like any other header. Supabase does not
support changing the pg_net grants for one project, and removing PUBLIC's grants
breaks pg_net. ("Database roles can read request headers queued by pg_net";
"Revoking access to pg_net objects has no effect", Supabase troubleshooting
guides.)

So **rotating the secret while keeping this mechanism would expose the new value
the same way.** And because the route trusts the body, anyone who has the secret
can push any text, with the shop's icon, to the shop's phones.

## Proposed design: send only the alert id; the receiver loads the alert

Make the request carry nothing worth stealing, and make the receiver trust only
the database.

**Sender (trigger function):** `net.http_post` with body `{"alert_id": "<uuid>"}`
and no secret header. No Vault read.

**Receiver (`/api/push/send`):**

1. Parse `alert_id`. Reject anything that is not a UUID (400).
2. **Claim** the alert atomically with the service role: set
   `push_dispatched_at = now()` where `id = alert_id`,
   `push_dispatched_at IS NULL` and `created_at > now() - interval '15 minutes'`,
   returning the row.
3. If no row comes back, return 200 with `{ok: true, sent: 0}` and do nothing.
   That covers an unknown id, an id already pushed, and an old alert.
4. Otherwise build the notification **from the claimed row**, never from the
   request body. Recipients and preferences are resolved as today.

**Why this is safe without a secret:**

| Someone who… | Can… |
|---|---|
| reads the queue | see an alert id. It is not a credential. |
| calls the route with a made-up id | nothing: there is no such alert. |
| calls the route with a real id they read | trigger, at most once and only within 15 minutes, the push that was about to be sent anyway. |
| replays a request | nothing: the alert is already claimed. |
| wants to push their own text | not possible: the text comes from `alert_events`, which they cannot write (RLS; `authenticated` has SELECT only). |

There is no secret left to rotate. `PUSH_WEBHOOK_SECRET` and the Vault entry are
**retired**, not replaced, once the old path is removed.

**Database change (additive, non-destructive):**
`ALTER TABLE public.alert_events ADD COLUMN IF NOT EXISTS push_dispatched_at timestamptz;`
plus an index if needed. Existing rows stay NULL; the 15-minute window means old
alerts can never be pushed by this route.

**Trade-offs:**

- If the route is down for longer than 15 minutes, those alerts are not pushed
  later. That is the same as today, where a failed pg_net call is not retried.
  They still record and show in the app.
- Anyone can make the route do one indexed `UPDATE … WHERE id = …` per request.
  That is cheap. Rate limiting can be added if it ever matters.
- `net._http_response` keeps response bodies for 6 hours by default. The new
  response (`{ok, sent, pruned}`) contains nothing sensitive.

**Alternative, not recommended:** keep a secret but send an HMAC of the body and
a timestamp instead of the secret itself. The key would stay inside the
function, but the receiver would still trust a body built in the database, it
needs replay protection anyway, and it keeps a key to manage. The claim design
gets the same protection with less.

## Rollout (each step separately approved; staging first, then production)

The receiver and sender change together, so pushes never break:

1. **Migration A (additive):** add `alert_events.push_dispatched_at`.
2. **Deploy route v2**, which accepts both:
   - new requests `{alert_id}`, handled by the claim path above, with no secret;
   - old requests with `x-push-secret` + `{record}`, still checked against
     `PUSH_WEBHOOK_SECRET`, but now also handled by the **claim path using
     `record.id`**, so the body's text is ignored and nothing is pushed twice.
3. **Migration B:** replace `notify_push_on_alert()` so it sends only
   `{alert_id}`, with no header secret and no Vault read. The trigger is
   unchanged.
4. **Verify:** cause one alert. `net._http_response` shows 200 with `sent >= 1`,
   the phone receives it, and `alert_events.push_dispatched_at` is set for that
   row.
5. **Deploy route v3:** remove the old path and the `PUSH_WEBHOOK_SECRET` check.
6. **Retire the secret (owner):** delete Vercel `PUSH_WEBHOOK_SECRET` and the
   Vault entry `push_webhook_secret`.

**Rollback:** before step 5, put back the previous function definition (it only
needs the Vault entry, which still exists). After step 5, roll back by
redeploying route v2 alongside it. The emergency stop for push only is unchanged:
`DROP TRIGGER IF EXISTS alert_events_push ON public.alert_events;`. Alerts
keep recording.

**Repo changes this implies (not written yet):**

- `app/api/push/send/route.ts`: claim path, then remove the secret.
- `app/__tests__/pushWebhookRouting.test.ts`: it asserts the `x-push-secret`
  check exists. That changes to asserting the claim, and that the body text is
  never used.
- `proxy.ts`: the comment about `/api/push/send` checking `x-push-secret`. The
  route stays on the public list.
- A new migration for steps 1 and 3. Keep
  `supabase/migrations/2026-08-16_push_on_alert_webhook.sql` as history.
- A pure helper (for example in `lib/alerts/`), with jest tests for the UUID
  check and the claim decision.
