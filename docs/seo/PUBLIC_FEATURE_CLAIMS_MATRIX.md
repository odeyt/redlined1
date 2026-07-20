# RedlineD1 — Public Feature Claims Matrix

Last updated: 2026-07-21  
Source of truth: `lib/entitlements/planRegistry.ts`

---

## Purpose

Cross-reference every public marketing feature claim against the actual entitlement system. Any claim on a public page must have a corresponding row here showing verification.

---

## Plan limits matrix

| Feature | Free | Solo | Starter | Professional | Business | Source |
|---------|------|------|---------|-------------|---------|--------|
| Technician seats | 1 | 1 | **1** | 8 | Unlimited | planRegistry.ts `techniciansTotal` |
| Active repair orders | 5/mo | 50/mo | 100/mo | 500/mo | Unlimited | `activeROs` |
| Locations | 1 | 1 | 1 | 1 | 10 | `locationsTotal` |
| Vehicles | 25 | 100 | 250 | 1000 | Unlimited | `vehiclesTotal` |
| Customers | 25 | 100 | 250 | 1000 | Unlimited | `customersTotal` |
| Invoices/month | 5 | 50 | 100 | 500 | Unlimited | `invoicesPerMonth` |
| AI advisor | No | No | No | Yes | Yes | `aiAdvisor` |
| AI learning rules | No | No | No | Yes | Yes | `aiLearningRules` |
| Smart diagnostics | No | No | No | Yes | Yes | `smartDiagnostics` |
| Digital inspections | Yes | Yes | Yes | Yes | Yes | `digitalInspections` |
| Inventory tracking | No | Yes | Yes | Yes | Yes | `inventoryTracking` |
| Parts ordering | No | No | Yes | Yes | Yes | `partsOrdering` |
| Customer portal | No | No | No | Yes | Yes | `customerPortal` |
| Priority support | No | No | Yes | Yes | Yes | `prioritySupport` |
| Team assignments | No | No | Yes | Yes | Yes | `teamAssignments` |
| Multi-location | No | No | No | No | Yes | `locationsTotal: 10` |
| Custom reports | No | No | No | Yes | Yes | `customReports` |

---

## Marketing copy claim verification

### HeroSection.tsx

| Claim | Verified? | Notes |
|-------|----------|-------|
| "Free Forever plan — no credit card" | ✅ | `free` plan, `requiresCheckout: false`, `expires: false` |
| "Solo at $24/mo" | ✅ | planRegistry.ts `monthlyPrice: 24` |
| "Starter at $49/mo" | ✅ | planRegistry.ts `monthlyPrice: 49` |
| "Professional at $99/mo" | ✅ | planRegistry.ts `monthlyPrice: 99` |
| "Business at $179/mo" | ✅ | planRegistry.ts `monthlyPrice: 179` |
| "Sample data shown for illustration only" | ✅ | Dashboard mockup is labeled |

### PricingSection.tsx

| Claim | Verified? | Notes |
|-------|----------|-------|
| Starter: "1 technician seat" | ✅ | planRegistry.ts `techniciansTotal: 1` (corrected in this audit) |
| Professional: "Up to 8 technicians" | ✅ | planRegistry.ts `techniciansTotal: 8` |
| Business: "Unlimited technicians" | ✅ | planRegistry.ts `techniciansTotal: -1` (unlimited sentinel) |
| Professional: "AI intelligence features" | ✅ | planRegistry.ts `aiAdvisor: true` on professional+ |
| Business: "Up to 10 locations" | ✅ | planRegistry.ts `locationsTotal: 10` |

### FAQSection.tsx

| Claim | Verified? | Notes |
|-------|----------|-------|
| Starter $49/month includes 1 technician seat | ✅ | Corrected in this audit |
| Professional $99/month supports up to 8 technicians | ✅ | planRegistry.ts |
| AI intelligence on Professional and above | ✅ | planRegistry.ts |

### Feature landing pages (Mobile Mechanic, DVI, etc.)

| Claim | Verified? | Notes |
|-------|----------|-------|
| "Digital vehicle inspections" available | ✅ | All plans include `digitalInspections: true` |
| "Built in a real repair shop" | ✅ | D1 Imports, two-location Laos operation |
| "AI coach" on Professional | ✅ | planRegistry.ts `aiAdvisor: true` on professional+ |

### Comparison pages

| Claim | Verified? | Notes |
|-------|----------|-------|
| RedlineD1 features (our side) | ✅ | All drawn from planRegistry.ts |
| Competitor features | ⚠️ | All marked "Verify with vendor" — not asserted as confirmed |

---

## Claims requiring future verification before assertion

| Potential claim | Why not yet assertable | What's needed |
|----------------|----------------------|--------------|
| "Most affordable mobile mechanic software" | No pricing comparison verified | Market survey |
| "Only AI auto repair software built in a real shop" | Can't verify competitors | Market research |
| Any named customer testimonial | No real customers yet | Actual customer data |
| App store ratings | No app yet | App launch |
| "ISO certified" / "SOC 2 certified" | Not certified | Certification |

---

## Internal shop IDs (never expose publicly)

- `38d55fae-741b-4bac-b520-f96eed65bf38` — D1 Imports location 1
- `90b72748-bf01-4456-999f-f4ba48091606` — D1 Imports location 2

These IDs bypass all plan limits. They must never appear in public SEO content, sitemap, or marketing copy.
