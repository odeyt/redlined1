# Marketing capture: failure recovery

What to do when a take stops. It applies to the alert and push gates
(correlation Option A) and to the request ledger.

**Three rules hold for every case below.**

1. **Repair nothing automatically.** Demo records stay as the take left them
   until you decide otherwise. Resetting them is a production write that needs
   its own approval.
2. **Never disable or suppress a production trigger, a notification, or the
   pg_net worker**, for the demo shop or any other.
3. **Run OWNER FINISH SQL anyway**, even when the take stopped early. Requests
   that did fire deserve an answer, and the capture writes its ledger and
   LEDGER TOKEN whatever happens
   (`marketing-output/capture-ledger-<timestamp>.json`).

## The order the gates run in

| Stage | Who runs it | Stops the take |
|---|---|---|
| OWNER START SQL | you, in the SQL Editor, immediately before the capture | row 999 must read CAPTURE MAY START |
| Existing start gates | the capture | any failure, before a page exists |
| Request-ledger self-test | the capture, in the recording context | any probe not aborted in the browser |
| Alert start gates | the capture | any failure |
| Checkpoints, one per status change | the capture | an unexpected alert, target, shop, subscription or outbox row |
| Alert finish gates | the capture | any failure |
| Existing finish gates | the capture | any failure |
| OWNER FINISH SQL | you | row 999 must read PROVEN |

## OWNER START SQL says DO NOT START

Nothing has run; nothing needs repairing. Fix what the STOP rows name, then run
it again.

- **Rows 31-40 (pg_net privileges).** PUBLIC, `anon` or `authenticated` can read
  the queue or the responses, queue requests, or call a net function. **Do not
  grant, revoke or otherwise change privileges to get past this**: least-privilege
  remediation is a separate, separately approved piece of work. The capture waits.
- **Rows 50-52 (a second HTTP caller, or a Database Webhook).** The window can no
  longer be exclusive. Report it; do not remove the caller to make the capture run.
- **Rows 54-61 (triggers and function fingerprints).** The live definitions no
  longer equal the repository source, so the expected alert count is not proven.
  A REVIEW verdict means only the whitespace matches; that is not a pass. Reconcile
  first, the way the growth migrations were reconciled.
- **Rows 10-23 (isolation).** The demo tenant is not as it should be: fix the
  demo records (a production write, separately approved) and run START again.
- **Row 71 (`cache_size`).** The request-id sequence hands out ids in batches, so
  request numbering cannot be trusted. Stop.

## The capture refuses to start

The message names each failed gate.

- **Request-ledger self-test failure.** The blocking did not install. Nothing was
  recorded and nothing left the browser. Report it; do not run the capture with
  the ledger off.
- **A technician has a login, a contact detail exists, an alert is unmuted, a
  subscription exists.** Fix the demo records first (production write, separate
  approval).
- **Source-derived alerts differ from the expectation.** The repository's trigger
  source changed. Update `EXPECTED_ALERTS`, the expected values in both owner SQL
  files, and the pinned hashes together, and have them reviewed.

## A checkpoint fails mid-take

The capture stops pressing at once, so the walkthrough goes no further.

| What the message says | What it means | What to do |
|---|---|---|
| `CRITICAL: a push subscription exists` | a device could receive a demo alert | Stop. Identify the subscription's user. Report before anything else. |
| `CRITICAL: Sapelee outbox rows exist` | an event is queued for an external system | Stop. **Do not flush the outbox**; flushing is what delivers it. Do not delete the row. Report. |
| `UNPROVEN: N alert(s) were written in another shop` | a real shop used the app during the window | Not a leak. The take is unusable. Retake at a quieter hour. |
| `event type ...`, `has a target user/role`, `belongs to another shop`, `is not about RO-DEMO-330` | an alert nobody expected | Stop. Report the rows; delete nothing. |
| `expected alert did not appear within 20000 ms` | the alert or status row never arrived | Stop. Check whether the status change was saved at all, then report. |
| `request ledger: ...` | the browser tried something unapproved | Stop. The request was aborted before it left the browser. Report what it was. |

## The finish gates fail

The video exists, but the take is not usable until every failure is explained.
Then run OWNER FINISH SQL, whose verdict is the one that counts.

## OWNER FINISH SQL verdicts

| Row 999 | Meaning | What to do |
|---|---|---|
| `PROVEN` | every demo alert is paired with its own request, each answered 200 with `{"ok":true,"sent":0}` | The take is usable. |
| `PENDING` | pg_net has not answered every request yet | Wait a minute and run it again. Still pending after a few minutes: treat as a lost response. |
| `UNPROVEN` | the window was not exclusive (another shop's alert, a sequence gap, a frozen or out-of-order transaction, an expired response) | Nothing is known to be wrong, and nothing is proven either. The take is unusable; retake at a quieter hour. |
| `FAILED` | a mismatch: a missing alert, a wrong transition, a non-200, a timeout, a body that is not exactly `{"ok":true,"sent":0}`, a ledger that disagrees | Stop and report, with the per-alert rows 41-45. |
| `CRITICAL` | `sent` above zero, a `pruned` key, a subscription, a Sapelee row, or the invoice sequence moved | Stop immediately. A push may have reached a device, or the shared invoice series moved. Report before anything else. Repair nothing. |

Rows 41-45 read one per alert: the alert id, its type, the same-transaction
status change, the request id, the HTTP status, timeout, error and body keys.
That is the correlation; read those rows before the summary.

**A lost response** (`FAILED`, body `-`, nothing queued) means pg_net never
recorded an answer. The alert rows are already written and no device was
reached, since the demo shop has no subscriptions. Check the route's logs for
that minute if you want the answer; there is nothing to retry, and nothing to
repair.

## Cleanup after any take

Nothing is cleaned up automatically.

- Demo alert rows, status events, audit rows and the labour-guide row **stay**.
  `audit_events` is append-only by trigger.
- pg_net responses expire on their own (`pg_net.ttl`, START row 72). **Never
  write to the `net` schema.**
- The video and the capture ledger stay under `marketing-output/`, which is
  gitignored. The ledger holds ids, statuses, hostnames and paths only.
- **Another take needs a reset** of the demo job card and repair order to
  `Booked` / `Open`. That reset is a production write needing its own approval,
  and it raises one further `ro.status_changed` alert with its own pg_net
  request. Run it inside its own START/FINISH window, expecting exactly one
  alert, rather than letting it land in the next take's window.
