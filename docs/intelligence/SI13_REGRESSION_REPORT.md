# SI-13 Regression Report — Customer Lifetime Intelligence

**Date:** 2026-07-10
**Branch:** `feature/si-13-customer-lifetime-intelligence`

---

## Protected Modules Verified

| Module | Change Type | Status |
|--------|-------------|--------|
| customers CRUD | Read-only integration | No changes |
| estimates | No touch | No changes |
| invoices | No touch | No changes |
| job cards | No touch | No changes |
| vehicles | Read-only | No changes |
| appointments | Read-only | No changes |
| payments | No touch | No changes |
| SI-11 Learning Engine | No touch | No changes |
| SI-12 Service Advisor | No touch | No changes |
| Command Center | No touch (flag-gated addition only) | No changes |
| Morning Brief | No touch (flag-gated addition only) | No changes |
| Vehicle Intelligence | No touch | No changes |
| Authentication / shop switching | No touch | No changes |
| Billing | No touch | No changes |

---

## Additive Changes Only

- 5 new tables — no schema changes to existing tables
- 10 new feature flags — all OFF
- New intelligence engines — isolated from core workflow
- New API routes — separate namespace `/api/intelligence/customer/`
- New UI components — mounted optionally, behind flag check
- `package.json` — 1 script added

---

## Zero-Impact Guarantee

- All engines wrapped in try/catch in orchestrator
- CustomerIntelligenceErrorBoundary prevents panel crash from affecting customer page
- Fire-and-forget DB writes — never block core requests
- Feature flags: panel does not render when flag is OFF
- No automatic actions: no SMS, email, invoice, appointment, or estimate created automatically

---

## Privacy Verified

- No name, phone, email, or address stored in SI-13 tables
- `price_sensitive` segment filtered from API responses (internal only)
- VIN not stored in any SI-13 table
- Payment instrument data not stored
- All scores labeled as internal operational metrics

---

## TypeScript / Build

- `npx tsc --noEmit` — must pass before merge
- `npm run build` — must pass before merge
- All 7 test specs — must pass before merge
