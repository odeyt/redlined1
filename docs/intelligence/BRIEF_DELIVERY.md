# Morning Brief Delivery (SI-7)

## Current State

**Dashboard only.** No email, SMS, or push notifications yet.

The delivery infrastructure is built and ready. Adding a new channel requires:
1. Implement the send function in a new file (e.g. `BriefEmailSender.ts`)
2. Call `createDeliveryLog` + `markDeliverySent` / `markDeliveryFailed`
3. Enable `morning_brief_delivery` feature flag

## Delivery Channels (planned)

| Channel | Status | Notes |
|---------|--------|-------|
| Dashboard | ✅ Active | Shown in Command Center panel |
| Email | 🔜 Planned | Via Resend (already in project) |
| SMS | 🔜 Planned | Via provider abstraction |
| WhatsApp | 🔜 Planned | Via provider abstraction |
| Push | 🔜 Planned | Future native app |

## DB Schema

`brief_delivery_logs` table:
- One row per delivery attempt per channel per brief
- `status`: pending → sent or failed
- `error`: stored on failure (max 500 chars)
- Cascades delete when parent `morning_briefs` row deleted

## Key Functions

```typescript
// BriefDeliveryService.ts
prepareDelivery(shopId, briefId, channel, recipientUserId?, recipientEmail?)
createDeliveryLog(shopId, briefId, channel, recipientUserId?)
markDeliverySent(logId)
markDeliveryFailed(logId, error)
```

## Security

- Delivery logs are shop-scoped with RLS
- Owner/manager read only
- Technicians blocked
- Service role can write (for server-side delivery)
- Never sends to customers — internal briefing only
