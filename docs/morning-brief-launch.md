# Morning-brief emails — launch runbook

The Redline AI morning brief, emailed to a shop's owner at **05:00 in the
shop's own timezone**, every day. The brief is the deterministic one from
the in-app panel (open jobs, stale estimates, unpaid invoices, "start with
these 3" — every figure cited by document number). No LLM is involved in
the email.

Code: `lib/morningBrief/` (config, timezone, email, runner),
`scripts/run-morning-brief.ts`, `.github/workflows/morning-brief.yml`
(hourly; each run serves only the shops inside their local 05:00 hour).
Access — who gets a brief at all — is the app's own decision
(`lib/redline-ai/access.ts`): the `redline_ai` flag OR a Professional /
Business / Enterprise plan on the shop owner's profile.

## Off switches (all OFF by default)

1. `MORNING_BRIEF_SCHEDULE_ENABLED` (repository variable) — the workflow's
   scheduled trigger does nothing unless it is exactly `true`.
2. `MORNING_BRIEF_SENDING_ENABLED` (repository variable) — unless exactly
   `true` (and every other gate passes) every run is a **dry run**: it
   reports each eligible shop and the local date of its next 05:00 brief,
   and sends nothing.
3. `MORNING_BRIEF_AUDIENCE` (repository variable) — unless exactly
   `everyone`, only owner addresses in `MORNING_BRIEF_CANARY_RECIPIENTS`
   (secret) are emailed. Unset = canary with nobody.

## Configuration

Repository **variables**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.redlined1.com` (already set for trial-tips) |
| `MORNING_BRIEF_FROM_ADDRESS` | a **bare** address at `@redlined1.com`, e.g. `brief@redlined1.com` — no display name, never the Resend sandbox sender |
| `MORNING_BRIEF_SENDING_ENABLED` | `true` when ready |
| `MORNING_BRIEF_AUDIENCE` | `everyone` only after the canary is verified |
| `MORNING_BRIEF_SCHEDULE_ENABLED` | `true` to start the hourly schedule |

Repository **secrets**: `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (all already set for
trial-tips), plus `MORNING_BRIEF_CANARY_RECIPIENTS` (comma-separated owner
email addresses for canary mode).

## Pre-launch order

1. Apply `supabase/migrations/2026-11-23_morning_brief_email.sql` to
   production (creates `morning_brief_sends`, adds `shop_settings.timezone`).
2. Merge the PR and set the variables/secrets above, **without**
   `MORNING_BRIEF_SCHEDULE_ENABLED`.
3. Run the workflow manually (workflow_dispatch) with sending still off:
   confirm the dry run lists D1 Imports with timezone `Asia/Bangkok`
   (source: state/default — D1's address carries no US state, so check
   what it resolves to and set `shop_settings.timezone` for D1 Imports
   explicitly if the answer is wrong) and the correct next-brief date.
4. Canary (below). 5. Audience → everyone. 6. Schedule on.

## Canary

1. `MORNING_BRIEF_CANARY_RECIPIENTS` = D1 Imports' owner address only;
   audience stays canary.
2. `MORNING_BRIEF_SENDING_ENABLED` = `true`.
3. Run the workflow manually **while D1 Imports is inside its local
   05:00 hour** (Asia/Bangkok), or wait for the hourly run inside it.
   Expect exactly one `sent` item for D1 Imports in the run output and
   one row in `morning_brief_sends`.
4. Open the email: subject `Your morning brief — D1 Imports — <date>`;
   figures match the in-app brief for that morning; the button opens the
   app. Run the workflow again in the same hour — expect `already_sent`,
   no second email.
5. Only then set `MORNING_BRIEF_AUDIENCE` = `everyone`, and finally
   `MORNING_BRIEF_SCHEDULE_ENABLED` = `true`.

## Timezones

Resolution order per shop (`lib/morningBrief/timezone.ts`):
`shop_settings.timezone` (when a valid IANA zone) → US state parsed from
`shop_settings.address` (primary zone per state) → `America/New_York`.
A shop in a split state, or outside the US, should be given an explicit
`shop_settings.timezone` — that is what the column is for.

## Sends needing review

A run that exits non-zero, or a `morning_brief_sends` row in `uncertain`,
means a brief may or may not have been delivered. It is never retried
automatically (a duplicate daily brief is worse than a missed one — the
shop still has the in-app panel). Check the row's `resend_email_id` /
`last_error` and Resend's dashboard. `failed` rows are definite
non-sends and are re-claimed automatically inside the same 05:00 hour.

## Rollback

Set `MORNING_BRIEF_SCHEDULE_ENABLED` to anything but `true` (stops the
schedule) or `MORNING_BRIEF_SENDING_ENABLED` likewise (job runs as dry
runs). No data migration is needed; `morning_brief_sends` can stay.

## Known limits

- The recipient is the shop's owner (the `shop_users` role='owner'
  profile email) — one brief per shop, not per staff member.
- State parsing is a heuristic over a free-text address; the stored
  timezone column is the override.
- The brief is built for the shop's merged scope (a shop merged into
  this one contributes its records), exactly as the in-app panel does.
