# SI-13 Customer Lifetime Intelligence — Staff UAT

**Branch:** `feature/si-13-customer-lifetime-intelligence`
**Date:** 2026-07-10
**All features OFF by default. Enable flags in Supabase to test.**

---

## Setup

Enable in Supabase `feature_flags`:
- `customer_lifetime_intelligence` → true
- `customer_intelligence_panel` → true
- `customer_segmentation` → true
- `customer_revenue_opportunities` → true

---

## Scenarios

### Scenario 1 — Profile Build
1. Navigate to any customer page.
2. Confirm CustomerLifetimePanel is visible below main info.
3. Confirm panel loads without blocking the page.
4. **Pass:** Panel shows financial summary, relationship score, retention risk.

### Scenario 2 — Segment Classification
1. Open a customer with 10+ visits and paid invoices.
2. Check segments card.
3. **Pass:** Shows VIP or High Value segment with primary badge (★).
4. **Fail condition:** price_sensitive label is shown to end user.

### Scenario 3 — Retention Risk
1. Find a customer with last visit > 12 months ago.
2. Open their intelligence panel.
3. **Pass:** Retention card shows High Risk or Critical Risk.
4. **Pass:** Suggested actions are informational only — no automatic actions performed.

### Scenario 4 — Declined Work Opportunities
1. Open a customer who previously declined work.
2. Check Opportunities card.
3. **Pass:** Declined work re-engagement opportunity listed with disclaimer text.
4. **Pass:** Disclaimer includes "Requires technician inspection and advisor review."

### Scenario 5 — Timeline
1. Open any active customer.
2. Check Service History section.
3. **Pass:** Events sorted newest first.
4. **Pass:** Includes job cards, estimates, invoices.

### Scenario 6 — Financial Summary
1. Open customer with paid and unpaid invoices.
2. **Pass:** Outstanding balance shown in red if > 0.
3. **Pass:** Disclaimer: "Internal operational metrics only."

### Scenario 7 — Feature Flag OFF
1. Disable `customer_lifetime_intelligence` flag.
2. Reload customer page.
3. **Pass:** Panel is not shown. Core customer info still visible.
4. **Pass:** Page loads normally.

### Scenario 8 — No Data Customer
1. Open a newly created customer with no history.
2. **Pass:** Panel shows gracefully — no crash, no blank page.
3. **Pass:** Shows "Limited Data" segment.

### Scenario 9 — API Isolation
1. Confirm estimate creation still works.
2. Confirm invoice creation still works.
3. Confirm job card creation still works.
4. **Pass:** None of the above are blocked or slowed by intelligence layer.

### Scenario 10 — Rebuild
1. With flag enabled, trigger rebuild: POST `/api/intelligence/customer/{id}`
2. **Pass:** Returns 200 with full result object.
3. **Pass:** No automatic actions performed (no SMS, no email, no invoice created).

---

## Sign-off

| Scenario | Pass/Fail | Tester | Date |
|----------|-----------|--------|------|
| 1 — Profile Build | | | |
| 2 — Segments | | | |
| 3 — Retention Risk | | | |
| 4 — Declined Work | | | |
| 5 — Timeline | | | |
| 6 — Financial | | | |
| 7 — Flag OFF | | | |
| 8 — No Data | | | |
| 9 — API Isolation | | | |
| 10 — Rebuild | | | |

**Overall:** ☐ PASS  ☐ FAIL

Tester: _________________________ Date: _____________
