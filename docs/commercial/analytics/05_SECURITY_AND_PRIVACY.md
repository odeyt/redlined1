# Billing Health Dashboard — Security & Privacy

## Access Control
- Authorization: server-side only via `verifyPlatformOwner()` in `lib/adminAuth.ts`
- Auth mechanism: Supabase session cookie or Bearer token → email match against `PLATFORM_OWNER_EMAIL` env var
- No client-side authorization — the page redirects to /login before any client JS is sent
- Normal shop owners: cannot access /admin/billing-health — redirected silently
- Technicians: same — no access
- Unauthenticated: same — no access

## What Is NOT Exposed
| Data | Available in dashboard? |
|---|---|
| Payment card numbers | No |
| Full customer billing payloads | No — only event_type and processing status |
| Creem secrets or API keys | No |
| Webhook signatures | No |
| Raw webhook body / payload | No |
| Cross-shop billing details to tenants | No — tenant screens never link here |
| Internal D1 shop IDs in client code | No — excluded server-side before response |
| Customer PII (names, phones) | No |
| Vehicle data | No |
| Invoice line item details | No |

## What IS Shown (Aggregates Only)
- Subscription counts by status and plan (no shop IDs in UI)
- MRR / ARR / ARPA (platform-level, no per-shop breakdown)
- Trial counts and conversion rate
- Webhook event types, failure counts, and latency percentiles
- Partial provider event IDs (event type and date only — no full payload)
- Refund counts and totals (no customer identity)

## Database Access
- All queries use the Supabase service role key via `getAdminDb()`
- RLS on `commercial_acquisition_costs` and `billing_metric_snapshots`: service_role only
- No anon key used in admin routes

## No Billing State Changes
This dashboard is purely read-only.
It never modifies subscriptions, payment events, or billing status.
The only write is POST /api/admin/billing-health/acquisition (acquisition cost log only).

## NEXT_PUBLIC_BILLING_ENABLED
Remains `false`. This dashboard does not require billing to be enabled.
It reads existing data — does not trigger any billing flows.
