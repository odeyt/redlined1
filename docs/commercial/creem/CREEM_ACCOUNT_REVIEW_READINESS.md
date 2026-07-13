# Creem Account Review Readiness Audit
**Epic:** C-2.4
**Date:** 2026-07-13
**Production URL:** https://www.redlined1.com
**Status:** PARTIAL — several required pages MISSING

---

## Summary

Creem requires a live, accessible merchant application with specific public pages before approving a merchant account for live payments. This audit identifies what exists and what is missing.

---

## Audit Results

### ✅ Required: Live product or accessible application

| Route | Description | Status |
|-------|-------------|--------|
| `https://www.redlined1.com` | Root — redirects to `/login` | ✅ Accessible |
| `https://www.redlined1.com/landing-preview` | Full landing page | ✅ Accessible (noindex) |
| `https://www.redlined1.com/signup` | Trial signup | ✅ Accessible |
| `https://www.redlined1.com/login` | App login | ✅ Accessible |

**Gap:** The landing page is at `/landing-preview` with `noindex`. The root `/` redirects to `/login` — this means Creem reviewers visiting the domain will not see product information without being logged in. **Recommend moving the landing page to `/` or at minimum making it accessible before account review submission.**

---

### ✅ Required: Clear product description and visible pricing

| Route | Content | Status |
|-------|---------|--------|
| `/landing-preview` | Full product description, feature list, pricing section | ✅ Present |
| `/landing-preview#pricing` | Solo $24/mo, Starter $49/mo, Professional $99/mo, Business $179/mo | ✅ Correct canonical prices |

**Gap:** Not publicly indexed. Creem reviewer must know to visit `/landing-preview` directly.

---

### ❌ Required: Privacy Policy

| Route | Status |
|-------|--------|
| `/privacy` | ❌ MISSING — route does not exist |
| `/privacy-policy` | ❌ MISSING — route does not exist |

**Blocker.** A Privacy Policy is required by Creem for merchant approval and is legally required for any app collecting user data (GDPR, CCPA). **Must be created before account review submission.**

---

### ❌ Required: Terms of Service

| Route | Status |
|-------|--------|
| `/terms` | ❌ MISSING — route does not exist |
| `/terms-of-service` | ❌ MISSING — route does not exist |

**Blocker.** Terms of Service is required by Creem. **Must be created before account review submission.**

---

### ❌ Required: Refund / Cancellation Policy

| Route | Status |
|-------|--------|
| `/refund-policy` | ❌ MISSING — route does not exist |
| `/cancellation` | ❌ MISSING — route does not exist |

**Blocker.** Creem requires a clear refund and cancellation policy. **Must be created or included in Terms of Service before account review submission.**

---

### ⚠️ Required: Reachable branded support email

| Evidence | Status |
|---------|--------|
| `admin@redlined1.com` in footer Contact Sales link | ✅ Present in marketing footer |
| `support@redlined1.com` | ⚠️ NOT yet present — this should be the support address |
| Email actually responds | ⚠️ Unconfirmed |

**Recommendation:** Create `support@redlined1.com` as a dedicated support address and add it to the footer, Privacy Policy, Terms of Service, and Creem Business Details. Using `admin@redlined1.com` is acceptable but a branded support address is better for merchant credibility.

---

### ⚠️ Required: Cancellation mechanism or Customer Portal

| Evidence | Status |
|---------|--------|
| Customer portal route `/api/billing/portal` | ✅ Implemented (on creem branch) |
| Portal accessible after subscription | ✅ Yes — redirects to Creem's customer portal |
| Instructions for cancellation visible to users | ⚠️ Not yet visible — need CTA in app |

---

### ✅ Confirmed: No fake testimonials or customer counts

Review of `landing-preview` page components (HeroSection, FAQSection, etc.) — no fabricated social proof or customer numbers found.

---

### ✅ Confirmed: No unsupported badges or trademark-confusing content

Review found no third-party award badges or trademark-confusing branding.

---

## Blockers Before Account Review

The following must exist before submitting Creem merchant account review:

| # | Blocker | Action Required |
|---|---------|----------------|
| 1 | Privacy Policy missing | Create `/app/privacy/page.tsx` |
| 2 | Terms of Service missing | Create `/app/terms/page.tsx` |
| 3 | Refund/Cancellation Policy missing | Create `/app/refund-policy/page.tsx` OR add to Terms |
| 4 | Landing page noindex | Consider making landing accessible at `/` |
| 5 | Support email | Create `support@redlined1.com` and add to footer/legal pages |
| 6 | Merchant eligibility confirmed | Complete `CREEM_MERCHANT_ELIGIBILITY.md` |

---

## Recommended Support Email

```
support@redlined1.com
```

This email must:
- Match the business email registered in Creem Business Details
- Actually receive and respond to messages
- Be listed in Privacy Policy, Terms of Service, and Creem dashboard

---

## Do Not Submit Review Until

- [ ] All three legal pages (Privacy, Terms, Refund) exist and are linked from the footer
- [ ] Support email is active and accessible
- [ ] Landing page is accessible to reviewers (either remove noindex or share direct URL)
- [ ] Merchant eligibility (country, entity) confirmed in `CREEM_MERCHANT_ELIGIBILITY.md`
- [ ] Sandbox UAT is SANDBOX CERTIFIED (Phases 6-10)
