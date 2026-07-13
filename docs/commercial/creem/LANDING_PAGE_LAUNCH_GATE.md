# Landing Page Launch Gate
**Epic:** C-2.4
**Status:** BLOCKED — multiple prerequisites not met

---

## Purpose

The `/landing-preview` route is an internal preview. The root `/` redirects to `/login`.

This document defines the gate that must pass before:
1. Removing `noindex` from the landing page
2. Making the landing page the root `/`
3. Allowing search engine indexing

---

## Current State

| Item | Status |
|------|--------|
| `/landing-preview` exists | ✅ Yes |
| Landing page has `noindex` metadata | ✅ Yes (correct for now) |
| Root `/` shows landing page | ❌ No — redirects to `/login` |
| Pricing section present | ✅ Yes (`#pricing`) |
| CTAs route to working signup | ✅ Yes (`/signup`) |

---

## Required Before Removing noindex / Replacing Root

### Technical Gates

- [ ] All CTA destinations work (`/signup`, `/pricing`, contact)
- [ ] Signup flow works end-to-end (account creation → trial provisioning)
- [ ] Trial provisioning confirmed (new accounts get trial state)
- [ ] Pricing matches canonical plan catalog exactly
- [ ] Mobile layout passes (test on 375px viewport)
- [ ] No broken links in navigation or footer

### Legal Gates

- [ ] `/privacy` — Privacy Policy live and linked from footer
- [ ] `/terms` — Terms of Service live and linked from footer
- [ ] `/refund-policy` — Refund/Cancellation Policy live and linked from footer
- [ ] `support@redlined1.com` active and linked from footer

### Payment Gates

- [ ] Payment path is sandbox-certified (SANDBOX CERTIFIED verdict)
- [ ] Creem merchant account approved for live payments
- [ ] Live products configured (8 product IDs)
- [ ] Production webhook configured and tested (canary complete)

### Compliance Gates

- [ ] No fake testimonials or fabricated customer counts
- [ ] No unsupported claims ("SOC 2 compliant", "HIPAA compliant", etc.)
- [ ] No trademark-confusing badges
- [ ] Landing page accessible to Creem account reviewer

### SEO Gate

- [ ] All above gates passed
- [ ] Odey explicit authorization to index

---

## Action Plan

1. Complete all three legal pages (`/privacy`, `/terms`, `/refund-policy`)
2. Add links to legal pages in `MarketingFooter.tsx`
3. Add `support@redlined1.com` to footer
4. Complete sandbox certification (Phases 6-10)
5. Complete canary transaction (Phase 13)
6. Make landing page accessible at `/` (optionally keep `/landing-preview` as alias)
7. Remove `noindex` from landing page metadata
8. Submit to Creem account review
9. After account review approved: enable production billing

---

## noindex Must NOT Be Removed Until

All rows in the table above are checked. This is a hard gate.

Billing code being ready is NOT sufficient to remove noindex.
Canary success is NOT sufficient to remove noindex without legal pages.
