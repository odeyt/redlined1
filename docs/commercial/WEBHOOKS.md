# Webhooks

## Endpoint

```
POST /api/billing/webhook/creem
```

No authentication required. Signature verification via `CREEM_WEBHOOK_SECRET`.

## Idempotency

Every event is stored in `billing_events` with `provider_event_id`.
If an event with the same ID arrives again, it is skipped (already processed).

## Supported Events

| Creem Event | Action |
|-------------|--------|
| `checkout.completed` | Activate subscription, store customer/subscription IDs |
| `subscription.updated` | Update status and period dates |
| `subscription.cancelled` | Set status to `cancelled` |
| `subscription.past_due` | Set status to `past_due`, record `past_due_at` |
| `payment.failed` | Set status to `past_due` |

## Signature Verification

Uses HMAC-SHA256. Header: `X-Creem-Signature: sha256=<hex>`.

If `CREEM_WEBHOOK_SECRET` is not set, signature check is skipped (dev only).

## Debugging

Check `billing_events` table:
```sql
SELECT * FROM billing_events ORDER BY created_at DESC LIMIT 20;
```

Unprocessed events:
```sql
SELECT * FROM billing_events WHERE processed = false ORDER BY created_at DESC;
```

Failed events:
```sql
SELECT * FROM billing_events WHERE error IS NOT NULL ORDER BY created_at DESC;
```
