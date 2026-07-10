# SI-12 Service Advisor — Staff UAT Plan

**Feature:** Intelligent Service Advisor  
**Version:** SI-12  
**Date:** ____________  
**Tester:** ____________  
**Location:** ☐ Shop 1 (D1 Imports)  ☐ Shop 2 (D1 Imports — Location 2)  
**Supervisor Sign-Off:** ____________  

---

## Important: Before Starting

1. Confirm `intelligent_service_advisor` feature flag is ON in Supabase.
2. Confirm `service_advisor_estimate_panel` feature flag is ON in Supabase.
3. All other SI-12 flags should be OFF unless testing that specific feature.
4. Do NOT approve or send any estimates created only for testing purposes.

---

## Scenario 1 — Clean Valid Estimate

**Setup:** Open a real estimate with complete descriptions, correct pricing, no inspection gaps.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Estimate page loads normally | ✓ Page renders fully before advisor panel | | |
| Service Advisor panel appears below estimate | ✓ Panel loads without error | | |
| Quality review shows no critical issues | ✓ Score ≥ 80 | | |
| No false suggestions generated | ✓ No "Review whether" items for correct estimate | | |
| Panel failure (if it crashes) | ✓ Estimate still fully usable | | |

**Evidence accuracy:** ☐ High  ☐ Medium  ☐ Low  ☐ Not applicable  
**Notes:** _______________________________________________

---

## Scenario 2 — Missing Labor Description

**Setup:** Create or find a draft estimate with one or more blank line descriptions.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Quality panel shows "Missing line description" | ✓ Detected | | |
| Severity is Warning or Critical | ✓ Not Info for blank description | | |
| Affected line is identified | ✓ Line-level detail shown | | |
| Estimate total unchanged | ✓ Original total intact | | |
| Suggestion language is review-based | ✓ "Review whether…" not "You must sell…" | | |

**Inappropriate upsell check:** ☐ None found  ☐ Concern (describe below)  
**Notes:** _______________________________________________

---

## Scenario 3 — Zero-Price Item

**Setup:** Add a line item with zero unit price to a draft estimate.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| "Zero-price line item" warning appears | ✓ Detected | | |
| Advisor asks to confirm if intentional | ✓ Not prescriptive | | |
| Estimate total not changed by advisor | ✓ Zero line remains as-is | | |
| Other lines not flagged | ✓ No false positives on priced lines | | |

**Notes:** _______________________________________________

---

## Scenario 4 — Mixed-Currency Estimate

**Setup:** Open an estimate with both USD and THB line items.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Mixed-currency warning appears | ✓ Detected | | |
| Warning is informational (not blocking) | ✓ Can still proceed | | |
| Currency breakdown remains unchanged | ✓ Totals same as without advisor | | |

**Notes:** _______________________________________________

---

## Scenario 5 — Declined Work

**Setup:** Open an estimate for a customer with prior declined work on file.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Declined work suggestion appears | ✓ Listed in Related Services | | |
| Original decline date and service shown | ✓ With evidence | | |
| Disclaimer shown ("requires technician verification") | ✓ Present | | |
| Cannot be auto-added to estimate | ✓ Accept/dismiss only | | |
| No fabricated services suggested | ✓ Only real prior declined work | | |

**Explanation usefulness:** ☐ Very useful  ☐ Useful  ☐ Not useful  
**Notes:** _______________________________________________

---

## Scenario 6 — Approved But Unscheduled Estimate

**Setup:** Check Follow-Up section for an approved estimate with no scheduled appointment.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Estimate appears in follow-up section | ✓ High priority | | |
| Score shows "already approved" as positive factor | ✓ Score ≥ 70 | | |
| "Schedule approved work" action available | ✓ Listed | | |
| Approve/disapprove state unchanged | ✓ Estimate status not altered | | |

**Notes:** _______________________________________________

---

## Scenario 7 — Estimate with Inspection Findings

**Setup:** Open an estimate with a linked digital inspection that has at least one unquoted finding.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Unquoted inspection finding flagged | ✓ "Inspection finding not on estimate" | | |
| Safety finding is Critical severity | ✓ If safety, severity = critical | | |
| Finding name shown in suggestion | ✓ Specific, not generic | | |
| Estimate lines unchanged | ✓ No auto-add of inspection item | | |

**Notes:** _______________________________________________

---

## Scenario 8 — Vehicle with Repeat Concern

**Setup:** Find or create an estimate for a vehicle with prior job card concern for the same issue.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Repeat concern visible in context (if surfaced) | ✓ Or graceful empty state | | |
| Vehicle history does not expose VIN | ✓ VIN not visible in any advisor UI | | |
| Only relevant historical data shown | ✓ Not all customer data dumped | | |

**Notes:** _______________________________________________

---

## Scenario 9 — Customer with Unpaid Balance

**Setup:** Open an estimate for a customer with outstanding unpaid invoices.

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Unpaid balance visible in context summary (if shown) | ✓ Or not shown | | |
| Customer payment detail NOT visible in advisor panel | ✓ No raw invoice amounts shown to advisor | | |
| Suggestion language does not reference "collect payment" | ✓ Not a collections tool | | |

**Notes:** _______________________________________________

---

## Scenario 10 — Advisor Panel Failure Isolation

**Setup:** Simulate a broken advisor panel (can be done by temporarily blocking the API call in dev tools, or by disabling the flag mid-session).

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Estimate page remains fully functional | ✓ Can still edit, save, send estimate | | |
| Panel shows graceful error (not a full-page crash) | ✓ "Service Advisor unavailable" message | | |
| Approval workflow still accessible | ✓ Approve button works | | |
| No JavaScript error cascade | ✓ Console errors isolated to advisor | | |

**Notes:** _______________________________________________

---

## Summary

| Scenario | Pass | Fail | Skip |
|----------|------|------|------|
| 1. Clean estimate | ☐ | ☐ | ☐ |
| 2. Missing description | ☐ | ☐ | ☐ |
| 3. Zero-price item | ☐ | ☐ | ☐ |
| 4. Mixed currency | ☐ | ☐ | ☐ |
| 5. Declined work | ☐ | ☐ | ☐ |
| 6. Approved unscheduled | ☐ | ☐ | ☐ |
| 7. Inspection findings | ☐ | ☐ | ☐ |
| 8. Repeat concern | ☐ | ☐ | ☐ |
| 9. Unpaid balance | ☐ | ☐ | ☐ |
| 10. Panel failure isolation | ☐ | ☐ | ☐ |

**Overall result:** ☐ PASS  ☐ FAIL  ☐ CONDITIONAL  

**Ready for Shop 1 rollout:** ☐ Yes  ☐ No  ☐ Needs review  

**Tester signature:** ________________________  
**Date:** ____________  
**Supervisor:** ________________________  
