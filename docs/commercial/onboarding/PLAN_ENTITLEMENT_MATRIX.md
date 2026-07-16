# Plan Entitlement Matrix — RedlineD1

**Version:** 1.0 — C-3  
**Source of truth:** `config/plans.ts` + `lib/planGate.ts`

---

## Pricing (USD)

| Plan | Monthly | Annual | Annual/mo equiv | Savings |
|------|---------|--------|-----------------|---------|
| Trial | Free | Free | — | — |
| Solo | $24 | $240 | $20/mo | ~17% |
| Starter | $49 | $490 | $40.83/mo | ~17% |
| Professional | $99 | $990 | $82.50/mo | ~17% |
| Business | $179 | $1,790 | $149.17/mo | ~17% |
| Enterprise | Custom | Custom | Custom | Negotiated |

---

## Feature Entitlements

| Feature | Trial | Solo | Starter | Professional | Business | Enterprise |
|---------|-------|------|---------|--------------|----------|------------|
| **Duration** | 7 days | Subscription | Subscription | Subscription | Subscription | Contract |
| **Technician seats** | Unlimited | 1 | 3 | 8 | Unlimited | Unlimited |
| **Job cards** | Up to 10 | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| **Estimates** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Invoices** | ✓ (watermarked) | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Digital inspections** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Vehicle history** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Customer management** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Team assignments** | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| **Scheduling** | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| **Inventory tracking** | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| **Reports / Analytics** | ✓ | — | — | ✓ | ✓ | ✓ |
| **Repair Intelligence** | ✓ | — | — | ✓ | ✓ | ✓ |
| **Owner Command Center** | ✓ | — | — | ✓ | ✓ | ✓ |
| **Customer retention alerts** | ✓ | — | — | ✓ | ✓ | ✓ |
| **AI estimate assistant** | ✓ | — | — | ✓ | ✓ | ✓ |
| **Multi-location** | — | — | — | — | ✓ | ✓ |
| **Fleet management** | — | — | — | — | ✓ | ✓ |
| **Custom inspection templates** | — | — | — | — | ✓ | ✓ |
| **Dedicated onboarding** | — | — | — | — | ✓ | ✓ |
| **API access** | — | — | — | — | — | ✓ (planned) |
| **White-label** | — | — | — | — | — | ✓ (planned) |
| **Invoice watermark** | YES | — | — | — | — | — |
| **Priority support** | — | — | — | — | ✓ | ✓ |
| **SMS credits** | 0 | 0 | 0 | 500 | 2,000 | Custom |

---

## planGate.ts Mapping

```
'trial'        → PlanStatus 'trial'   (full access for 7 days, watermark on invoices)
'solo'         → PlanStatus 'pro'     (full access per entitlement matrix)
'starter'      → PlanStatus 'pro'
'professional' → PlanStatus 'pro'
'business'     → PlanStatus 'pro'
'enterprise'   → PlanStatus 'pro'
'internal'     → PlanStatus 'pro'     (D1 shops — permanent)
null / 'free'  → PlanStatus 'free'    (trial expired — limited modules only)
```

## Free (expired trial) Accessible Modules

```
dashboard, settings, subscriptions, system-health, disaster-recovery, testing-dashboard
```

All other modules are blocked until a paid plan is active.

---

## Canonical Plan Keys

Valid: `trial`, `solo`, `starter`, `professional`, `business`, `enterprise`, `internal`

Legacy (normalize only, do not create): `shop_pro`, `free`, `basic`, `pro`, `premium`

---

## Notes

- Trial features listed above reflect the **current policy**: full access during trial period.
- The "Up to 10 jobs" limit mentioned in the pricing section is **marketing copy** — not yet enforced in code. Enforcement must be explicitly approved before implementing.
- Invoice watermark applies when `planStatus === 'free'` (expired trial) only, not during trial.
- AI features are behind feature flags and are not active in production.
