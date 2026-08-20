# Redlined1 API v1

Base URL `https://www.redlined1.com` · all paths under `/api/v1`.

The machine-readable contract is [`openapi.yaml`](./openapi.yaml). Only what is
in that file exists.

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

## What is not here yet

Vehicles, repair orders, invoices, payments, appointments, inspections,
inventory and reporting are not exposed. See
[`../m13-api-readiness.md`](../m13-api-readiness.md) for the state of each and
why.
