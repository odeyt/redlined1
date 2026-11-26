# Redlined1 API v1

Base URL `https://www.redlined1.com` · all paths under `/api/v1`.

The machine-readable contract is [`openapi.yaml`](./openapi.yaml). Only what is
in that file exists.

Bot access to estimates and invoices: design in [`PLAN.md`](./PLAN.md),
go-live steps and the smoke test (`scripts/api-smoke.ts`) in
[`ROLLOUT.md`](./ROLLOUT.md).

## Authentication

```
Authorization: Bearer rl_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A key belongs to one **organization**, optionally narrowed to one **shop**.

**The key is the tenant.** No field in a body, query string or header can
change which organization or shop a request touches. To act on a different
tenant, use a different key. This is not a convention — the route handlers
never read a tenant from input, and a test fails if one starts to.

The secret is shown once, when the key is issued, and stored only as a SHA-256
hash. It cannot be recovered. If it leaks, revoke it and issue another; the
revocation takes effect on the next request.

The Supabase service-role key is **not** an API credential and must never be
given to an integration. It bypasses every row-level policy.

### Issuing and revoking

Operator-side, server only:

```bash
npx tsx scripts/api-key.ts issue --org <uuid> --shop <uuid> \
  --name "Xero sync" --scopes customers:read,customers:write

npx tsx scripts/api-key.ts list
npx tsx scripts/api-key.ts revoke --id <uuid>
```

## Scopes

| Scope | Grants |
|---|---|
| `customers:read` | list and read customers |
| `customers:write` | create customers (includes read) |
| `estimates:read` | list and read estimates (behind `api_v1_documents`) |
| `estimates:write` | create and edit **draft** estimates (behind `api_v1_documents`) |
| `invoices:read` | list and read invoices, with amount paid and balance (behind `api_v1_documents`) |
| `invoices:write` | create and edit **draft** invoices (behind `api_v1_documents`) |
| `pdf:read` | download estimates and invoices as PDF, together with the matching read scope (behind `api_v1_documents`) |

Converting an approved estimate needs both `estimates:write` and
`invoices:write`.

Deny by default. A scope not listed on the key is refused, and scopes do not
imply one another beyond the table above. `customers:write` deliberately does
**not** grant archiving: archiving removes a customer from every screen in the
app, and a contact-sync integration should not be able to do it by accident.

## Versioning

`/api/v1` is stable. Within v1 we may **add** endpoints, optional request
fields and response fields. We will not remove or rename a field, change a
type, change an error `code`, or alter the meaning of an existing field.

A breaking change means `/api/v2`. When v2 ships, v1 keeps working for at least
**six months**, and the deprecation is announced with a date before the clock
starts. There is no `/api/latest` — a caller that cannot name its version
cannot be kept working.

## Responses

Success:

```json
{ "data": { }, "meta": { "request_id": "…" } }
```

Error:

```json
{ "error": { "code": "SCOPE_REQUIRED", "message": "…", "request_id": "…" } }
```

Every response carries `request_id`, also returned as the `x-request-id`
header. Quote it when reporting a problem — it is how a request is found in our
logs. Errors never contain database messages, policy names or stack traces.

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_REQUIRED` | 401 | No credential |
| `INVALID_API_KEY` | 401 | Not a known key |
| `API_KEY_REVOKED` | 401 | Revoked |
| `FORBIDDEN` | 403 | Not permitted |
| `SCOPE_REQUIRED` | 403 | Missing a scope |
| `SHOP_NOT_ACCESSIBLE` | 403 | Shop not on this key, or a write with no unambiguous shop |
| `ENTITLEMENT_DENIED` | 402 | The organization's plan does not include this |
| `NOT_FOUND` | 404 | No such resource — **also** returned for another tenant's resource |
| `CONFLICT` | 409 | Conflicts with current state |
| `IDEMPOTENCY_CONFLICT` | 409 | Same `Idempotency-Key`, different body |
| `VALIDATION_FAILED` | 422 | Body failed validation; see `details.issues` |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Ours. Quote the `request_id` |

## Pagination

`?page=1&page_size=25`, capped at 100. Ordering is by name then id, so paging
is stable when two records share a name. `meta.has_more` tells you whether to
continue.

## Idempotency

Send `Idempotency-Key` on `POST`:

```
Idempotency-Key: 6f5d1e3c-…
```

- same key + same body → the original response, replayed, with
  `meta.idempotent_replay: true`
- same key + different body → `IDEMPOTENCY_CONFLICT`

Use it. A timed-out `POST` is indistinguishable from a failed one, and without
a key the safe retry does not exist.

## Rate limits

120 requests per key per minute, fixed window. Over it: `429 RATE_LIMITED` with
the limit in `details`.

Limits are per **key**, not per IP — integrations share hosting, and an IP limit
would throttle unrelated businesses together. If you need more, ask rather than
sharding across keys.

## Security notes

- Keep the secret server-side. It is not safe in a browser, a mobile binary or
  a public repository.
- Rotate by issuing a new key, moving traffic, then revoking the old one.
  Revocation is immediate; there is no grace period.
- Requests are logged with the key id, never the secret.
- Cross-tenant access returns `404`, so probing ids tells you nothing.

## Worked example

```bash
curl https://www.redlined1.com/api/v1/customers?page_size=2 \
  -H "Authorization: Bearer $REDLINED1_API_KEY"

curl -X POST https://www.redlined1.com/api/v1/customers \
  -H "Authorization: Bearer $REDLINED1_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"Somchai Vong","phone":"+856 20 5555 1234"}'
```

## Estimates and invoices (bot access)

Plan: [`PLAN.md`](PLAN.md). Every endpoint below answers **404** unless the
`api_v1_documents` feature flag is on for every shop the key covers. The flag
is seeded off and is read on every request, so switching it off takes effect
at once.

| Endpoint | Scope |
|---|---|
| `GET /api/v1/me` | any one scope |
| `GET /api/v1/estimates`, `GET /api/v1/estimates/{id}` | `estimates:read` |
| `GET /api/v1/invoices`, `GET /api/v1/invoices/{number}` | `invoices:read` |
| `POST /api/v1/estimates` (draft) | `estimates:write` |
| `PATCH /api/v1/estimates/{id}` (draft only) | `estimates:write` |
| `POST /api/v1/estimates/{id}/convert-to-invoice` (approved only) | `estimates:write` + `invoices:write` |
| `POST /api/v1/invoices` (draft) | `invoices:write` |
| `PATCH /api/v1/invoices/{number}` (draft only) | `invoices:write` |
| `GET /api/v1/estimates/{id}/pdf` | `estimates:read` + `pdf:read` |
| `GET /api/v1/invoices/{number}/pdf` | `invoices:read` + `pdf:read` |

### PDFs

- They use the same layout as the PDF the shop emails, rendered by the same
  code (`lib/documents/pdf.ts`).
- A **Draft** is stamped DRAFT across the page with "not issued, not valid for
  payment" under the header. Its filename ends in `-DRAFT.pdf`.
- Totals are the ones the screens show, and they match the JSON. A line in
  another currency is printed in its own currency and left out of the
  subtotal. Line cost and markup are never printed.
- The trial "REDLINED1" watermark appears on the same shops the app puts it
  on: never on the D1 shops, and otherwise when the owner's plan is free.
- If the shop profile has no name, address or phone, the request is refused
  with 409 `SHOP_IDENTITY_INCOMPLETE`, the same as emailing a document.
- Nothing is sent to anyone. The PDF is returned to the caller only.

### Issuing keys

Shop owners issue and revoke keys in **Settings → API Keys**. The screen is
hidden while `api_v1_documents` is off.
- It has two presets. **Read only** (Wally Bot) reads customers, vehicles,
  estimates and invoices. **Read + write drafts** (CRM) adds draft writes and
  PDFs.
- The secret is shown once. A key issued there only reaches that shop.
- Each key's recent actions are listed under it.
- Organization-wide keys are still issued and revoked by an operator with
  `npx tsx scripts/api-key.ts`.

Estimates and invoices made by a key carry a **CREATED BY API** badge in the
app, so staff can check a bot's draft before sending it.

### A closed location's history (one shop)

When a location closes and is merged into another, its records stay where
they are. D1 Imports was merged into D1 Imports - Location 2 this way on
2026-10-17. A key for the open shop reads them as part of it, as staff do.

- A shop counts as merged into the key's shop only when it is archived,
  mirrored in both directions with the key's shop, and in the key's
  organization. An open sister location is never merged in.
- `GET /me` lists such shops under `merged_shops`.
- Customers, vehicles, estimates and invoices from a merged shop appear in
  lists and searches, and can be read by their existing ids. They can be named
  in a new draft (`customer_id`, `vehicle_id`).
- New records always go to `write_shop_id`, using that shop's numbering. No
  historical row is moved or renumbered.
- The feature flag is checked on the key's own open shop only.

Customer ids look like `C-1789703178771`. They are not uuids, so use them
exactly as the API returns them. `GET /customers?search=` matches name,
email, or phone digits.

### Writing drafts

- **Always Draft.** A key cannot set a status, totals, discount or tax rate.
  Discount is 0 and tax is the shop's default from Settings. A body that sets
  any field not in the contract is refused with 422.
- **Drafts only.** Editing anything that is not a Draft returns 409
  `CONFLICT` with `details.code` `NOT_DRAFT`. The edit only applies while the
  document is still a Draft, so if a person sends it during a bot's edit,
  nothing is overwritten.
- **The shop's margins are safe.** A key never sees line cost or markup. It
  cannot replace the lines of a draft that carries them (409
  `LINES_HAVE_COST_DATA`). Its other fields can still be edited.
- **Convert** works only on an Approved estimate (409 `NOT_APPROVED`
  otherwise), and only once. A second attempt returns 409
  `ALREADY_CONVERTED` with the first invoice's number. A unique index in the
  database settles a race.
- **`Idempotency-Key` is required** on every POST here. A retry with the same
  key and body replays the first response. The same key with a different
  body returns `IDEMPOTENCY_CONFLICT`.
- `customer_id` and `vehicle_id` must belong to the key's shop, otherwise 404.
  A vehicle registered to another customer is refused with 422.
- The key needs a single shop. A multi-shop key cannot write.
- Every write is audited with `api_client_id` and `api_client_name` (the key's
  id and label, never the secret).
- **The database migration must be applied before the flag is turned on.**
  `supabase/migrations/2026-11-25_api_v1_documents.sql` adds the numbering
  function and the provenance columns. Without it, every write fails.

- **Lists** are newest first. Filters: `status`, `customer_id`,
  `created_since`. Paging: `page`, `page_size` (max 100). An unknown status
  or a malformed filter is 422, never a silently wider list.
- **`updated_since` is not supported yet.** The tables have no `updated_at`
  column, so it is refused (422) rather than ignored. To see whether a
  document changed, read it by id.
- **Money** is decimal in the document's currency (USD, THB, LAK). Totals are
  computed the same way the staff screens compute them. A line in another
  currency is listed under `totals.line_totals_by_currency` and left out of the
  subtotal.
- **Never returned:** the shop's internal line `cost` and `markup`, parts
  procurement data, and `shop_id`.
- **Invoices** include `amount_paid` and `balance_due`, netted from the
  payments ledger. A payment in a different currency is listed in
  `currency_mismatches`. It is never converted.
- There is no endpoint that sends, emails, approves, records a payment, voids
  or deletes.

## What is not here yet

Repair orders, payments, inspections, inventory and reporting are not exposed. See
[`../m13-api-readiness.md`](../m13-api-readiness.md) for the state of each and
why.
