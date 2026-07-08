# Billing Test Plan

## API Tests

### Plans endpoint
```
GET /api/billing/plans
Expected: 200, { plans: [...] } with 4 plans
```

### Unauthenticated checkout blocked
```
POST /api/billing/checkout (no session cookie)
Expected: 401 Unauthorized
```

### Unauthenticated status blocked
```
GET /api/billing/status (no session cookie)
Expected: 401 Unauthorized
```

### Technician blocked from billing
```
GET /api/billing/status (logged in as technician)
Expected: 403 Forbidden
```

### Billing disabled state
```
NEXT_PUBLIC_BILLING_ENABLED=false
GET /api/billing/status
Expected: { billingEnabled: false }
```

### Webhook idempotency
```
POST /api/billing/webhook/creem (same provider_event_id twice)
Expected: Both return 200, second event skipped (processed=true already)
```

### Webhook invalid signature
```
POST /api/billing/webhook/creem (wrong signature, CREEM_WEBHOOK_SECRET set)
Expected: 400 Invalid webhook
```

## Manual UI Tests

### Billing dashboard — billing disabled
- Set NEXT_PUBLIC_BILLING_ENABLED=false
- Navigate to Billing & Subscription
- Expected: "Billing is not enabled in this environment."

### Billing dashboard — no subscription
- Set NEXT_PUBLIC_BILLING_ENABLED=true
- No shop_subscriptions row exists
- Expected: Shows plan UI, no crash

### Billing dashboard — trialing
- Insert trial subscription row
- Expected: Shows plan name, "trialing" badge, trial days remaining

### Billing dashboard — past due
- Set subscription status = 'past_due'
- Expected: Red warning banner shown

### Sidebar — billing nav item
- Log in as owner
- Expected: "Billing & Subscription" nav item visible
- Log in as technician
- Expected: Nav item NOT visible
