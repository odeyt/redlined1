# Creem Merchant Eligibility — RedlineD1
**Epic:** C-2.4 — Creem Sandbox Certification, Account-Review Gate, Controlled Live Cutover
**Status:** PENDING USER CONFIRMATION

---

## CRITICAL GATE

No live payment can be processed until ALL fields below are confirmed by Odey and eligibility is verified by Creem.

This document records only owner-confirmed information.
Identity documents, bank details, API keys, and secrets must NEVER appear here.

---

## Merchant Account Information

| Field | Value | Confirmed by Owner |
|-------|-------|--------------------|
| Merchant account type | individual or business | ☐ Pending |
| Legal name | — | ☐ Pending |
| Business / entity name | — | ☐ Pending |
| Country of tax residence or incorporation | — | ☐ Pending |
| Payout country | — | ☐ Pending |
| Payout method | — | ☐ Pending |
| Creem Store ID | — | ☐ Pending |
| Account-review status | Not submitted | ☐ Pending |
| Approval date | — | ☐ Pending |
| Support email | support@redlined1.com (recommended) | ☐ Pending |
| Product URL | https://www.redlined1.com | ☐ Pending |

---

## Eligibility Decision

**Current status: NO-GO FOR LIVE MODE — awaiting owner confirmation of above fields.**

### If jurisdiction is supported by Creem

- Proceed to Phase 9 (Account-Review Readiness Audit)
- Submit Creem merchant account review
- Wait for explicit approval before live keys

### If jurisdiction is NOT supported by Creem

**Issue: NO-GO FOR CREEM LIVE MODE**

Actions:
- Keep Test Mode available for UAT certification
- Do not submit false country or entity information
- Do not configure live checkout
- Evaluate alternative processors:
  - Paddle (strong Southeast Asia support)
  - Stripe (Thailand/Laos limitations — verify)
  - Lemon Squeezy (US/EU entity required)
  - 2Checkout / Verifone
- Document fallback at architecture level in a separate ADR

---

## Instructions for Odey

1. Log in to your Creem dashboard at https://app.creem.io
2. Go to Settings → Business Details
3. Confirm the legal name, entity type, and country registered
4. Go to Payouts → confirm payout country and method
5. Copy your Store ID from Settings → General
6. Reply with each field above so this document can be completed

**Do not paste API keys or bank details — only the fields listed above.**

---

## Safety Rule

> Do not treat physical location alone as proof of legal eligibility.
> Do not infer jurisdiction from context.
> Only user-confirmed, Creem-verified information is authoritative.
