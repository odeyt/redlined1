# Trial-tips emails — launch runbook

Four emails during a new shop's 7-day trial, sent by the app through Resend to
people who ticked "Send me trial tips" (at signup or in Settings) and verified
their address. Code: `lib/trialTips/`. Rules: `supabase/migrations/2026-09-30_trial_tips_email.sql`.
Scheduler: `.github/workflows/trial-tips.yml` (the only one).

| Step | Email | Sent when (from trial start) |
|---|---|---|
| 1 | First Job | 0–2 days — at the first hourly run after verification |
| 2 | Setup Help | 2–4 days |
| 3 | Status Board | 4–6 days |
| 4 | Feedback | 6 days – trial end |

A step whose window has passed is skipped, never sent late. Nobody gets more
than one step per run, or any step twice.

## Off switches (all OFF by default)

1. **Schedule** — the hourly job does nothing unless repository variable
   `TRIAL_TIPS_SCHEDULE_ENABLED` = `true`.
2. **Sending** — the job is a dry run (lists who is due, sends nothing) unless
   `TRIAL_TIPS_SENDING_ENABLED` = `true` **and** every setting below is valid.
   The postal address is one of them: no address, no email.
3. **Audience** — even when sending, only addresses in
   `TRIAL_TIPS_CANARY_RECIPIENTS` are emailed unless `TRIAL_TIPS_AUDIENCE` is
   exactly `everyone`. An empty list emails nobody. Anyone not on the list is
   skipped before anything is claimed, and checked again immediately before the
   Resend request — on retries too.

## Configuration

**GitHub** = repository settings used by the scheduled job. **Vercel** = the
web app (production). "Both" means the same value in both places.

| Setting | Where | Kind | Purpose | Status (2026-09-30) |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Both | GitHub secret / Vercel env | database | present in both |
| `SUPABASE_SERVICE_ROLE_KEY` | Both | GitHub secret / Vercel env | database (server only) | present in both |
| `RESEND_API_KEY` | GitHub | secret | sending (the job is the only sender) | **missing in GitHub**; Vercel has one for other mail — not needed there for this |
| `TRIAL_TIPS_UNSUBSCRIBE_SECRET` | **Both — same value** | secret / env | GitHub signs unsubscribe links; Vercel verifies them | **missing in both** |
| `RESEND_WEBHOOK_SECRET` | Vercel | env (secret) | verifies bounce/complaint webhooks | **missing** |
| `NEXT_PUBLIC_SITE_URL` | Both | GitHub **variable** / Vercel env | https origin for links | present in Vercel; **missing in GitHub** |
| `TRIAL_TIPS_FROM_ADDRESS` | GitHub | variable | an address at `@redlined1.com` (sandbox refused) | **missing** |
| `TRIAL_TIPS_POSTAL_ADDRESS` | GitHub | variable | business mailing address (CAN-SPAM) | **missing — blocks sending** |
| `TRIAL_TIPS_SENDING_ENABLED` | GitHub | variable | `true` to send | unset (off) |
| `TRIAL_TIPS_SCHEDULE_ENABLED` | GitHub | variable | `true` to run hourly | unset (off) |
| `TRIAL_TIPS_AUDIENCE` | GitHub | variable | `everyone`, or anything else = canary | unset (canary) |
| `TRIAL_TIPS_CANARY_RECIPIENTS` | GitHub | **secret** (addresses are masked in logs) | comma-separated canary addresses | unset (nobody) |

Reply-To is fixed in code: `admin@redlined1.com`.

### Confirming the two unsubscribe secrets match — without printing them

The job prints `unsubscribeSecretFingerprint` (12 hex characters of a SHA-256
of the secret) in every run's JSON output; it cannot be reversed into the
secret. To compare with the value you put in Vercel, compute the same thing
locally from the value in your password manager (not in a shared terminal):

```bash
node -e "const s=require('fs').readFileSync(0,'utf8').trim();console.log(require('crypto').createHash('sha256').update('trial-tips-unsubscribe-fingerprint:'+s).digest('hex').slice(0,12))"
```

(paste the secret, then Ctrl+D). The canary step below proves it end to end.

## Pre-launch order

1. Apply the migration to a **staging** copy of the database, never production
   first. As of 2026-09-30 no separate staging database exists in this repo's
   records — create one (docs/second-supabase-project.md) before anything else.
   Confirm `auth.users.email_confirmed_at` exists there.
2. Set the missing settings above. Leave `TRIAL_TIPS_SENDING_ENABLED` and
   `TRIAL_TIPS_SCHEDULE_ENABLED` unset.
3. In Resend → Webhooks, add an endpoint `https://<site>/api/webhooks/resend`
   for `email.bounced`, `email.complained`, `email.suppressed`,
   `suppression.added`; put its signing secret in Vercel as
   `RESEND_WEBHOOK_SECRET`; redeploy.
4. Actions → Trial Tips Emails → Run workflow (manual). Expect
   `"mode": "dry-run"` and a blocker list naming only `TRIAL_TIPS_SENDING_ENABLED`.

## Canary

1. Create a test account with an inbox you control; tick "Send me trial tips"
   at signup; verify the address.
2. Set `TRIAL_TIPS_CANARY_RECIPIENTS` to that address only. Leave
   `TRIAL_TIPS_AUDIENCE` unset.
3. Set `TRIAL_TIPS_SENDING_ENABLED` = `true`. Run the workflow manually once.
4. Check the run output: `"audience": "canary"`, one `sent`, everyone else
   `not_canary`, `needsReview` empty.
5. In Resend → Emails: one email, tags `campaign=trial_tips`, `step=first_job`;
   From your address, Reply-To `admin@redlined1.com`, status delivered.
6. In the inbox: subject, both HTML and plain text, postal address, links.
7. Open the unsubscribe link: it must show "Unsubscribe from trial tips?" (not
   "This link is not valid" — that would mean the two secrets differ). Click
   it; then in Settings the switch shows Off.
8. Run the workflow again: nothing more is sent to the canary.
9. Set `TRIAL_TIPS_SENDING_ENABLED` back to unset until you decide to launch.

Only after the canary passes: set `TRIAL_TIPS_AUDIENCE` = `everyone`, then
`TRIAL_TIPS_SCHEDULE_ENABLED` = `true`.

## "Please stop emailing me" replies

Replies to `admin@redlined1.com` are not read by the app. When one asks to
stop, an operator runs, in the Supabase SQL editor (service role — no need to
sign in as the customer):

```sql
SELECT public.trial_tips_unsubscribe_email('address-from-the-reply@example.com');
```

Result: `unsubscribed` · `already` · `not_subscribed` (never signed up for
tips) · `no_account` (no RedlineD1 account with that address). It is recorded
in the consent history with source `admin`. Takes effect before the next send.

## Sends needing review

An email whose outcome is unknown (network error, Resend 5xx, a crash) is
retried with the same idempotency key only while Resend still deduplicates it
— 24 hours from first use per Resend's documentation; the job stops at 23.
After that it is never resent automatically. Such sends make the job run show
red and appear under `needsReview`, and in SQL:

```sql
SELECT * FROM public.trial_tips_needs_review(now());
```

Check each in Resend → Emails (tag `step`, recipient). If it was delivered:

```sql
UPDATE public.trial_tip_sends SET status = 'sent', sent_at = now(), resend_email_id = '<id from Resend>'
WHERE user_id = '<user id>' AND step = '<step>';
```

If it was not, leave it: the step's window will have moved on.

## Rollback

- **Stop everything now:** unset `TRIAL_TIPS_SENDING_ENABLED` (or
  `TRIAL_TIPS_SCHEDULE_ENABLED`). Takes effect on the next run; nothing else
  changes. Recorded consent, history and the send ledger are kept.
- **Narrow to canary again:** unset `TRIAL_TIPS_AUDIENCE`.
- **Disable the workflow:** Actions → Trial Tips Emails → Disable workflow.
- **Remove the feature:** revert the code. The tables stay (they hold consent
  records, which should be kept); dropping them is destructive and needs
  separate approval.

## Known limits

- **Final-check race.** The job re-checks eligibility immediately before the
  Resend request. An unsubscribe or paid conversion that lands during that one
  HTTPS request is not seen, and that one email goes out; no later step is
  sent. (US law allows 10 business days to honour an opt-out.)
- **Replies are not detected.** See the procedure above.
- **Buttons open the app's home page**, not a specific screen: the app has no
  deep-link URLs.
