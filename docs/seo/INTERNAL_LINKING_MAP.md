# RedlineD1 — Internal Linking Map

Last updated: 2026-07-21

---

## Primary navigation links (present on all marketing pages via marketing layout)

- `/` — Home
- `/pricing` — Pricing
- `/signup` — Get Started (CTA)
- `/login` — Sign In

---

## Feature page cross-links

Each feature landing page should link to at least 2 related feature pages:

| Source page | Links to |
|-------------|----------|
| `/mobile-mechanic-software` | `/digital-vehicle-inspection-software`, `/auto-repair-invoicing-software`, `/repair-order-software` |
| `/digital-vehicle-inspection-software` | `/repair-order-software`, `/mobile-mechanic-software`, `/resources/digital-vehicle-inspection-checklist` |
| `/auto-repair-invoicing-software` | `/repair-order-software`, `/auto-repair-estimate-software`, `/tools/missed-revenue-calculator` |
| `/repair-order-software` | `/digital-vehicle-inspection-software`, `/auto-repair-invoicing-software`, `/resources/repair-order-template` |
| `/ai-auto-repair-shop-software` | `/digital-vehicle-inspection-software`, `/multi-location-auto-repair-software`, `/pricing` |
| `/auto-repair-estimate-software` | `/auto-repair-invoicing-software`, `/repair-order-software` |
| `/multi-location-auto-repair-software` | `/ai-auto-repair-shop-software`, `/pricing` |
| `/solo-mechanic-shop-software` | `/mobile-mechanic-software`, `/pricing`, `/tools/labor-rate-calculator` |

---

## Tool page links

| Source | Links to |
|--------|----------|
| `/tools/labor-rate-calculator` | `/auto-repair-invoicing-software`, `/pricing`, `/signup` |
| `/tools/missed-revenue-calculator` | `/auto-repair-invoicing-software`, `/ai-auto-repair-shop-software`, `/pricing` |
| `/tools/technician-efficiency-calculator` | `/ai-auto-repair-shop-software`, `/digital-vehicle-inspection-software`, `/pricing` |

---

## Resource page links

| Source | Links to |
|--------|----------|
| `/resources/digital-vehicle-inspection-checklist` | `/digital-vehicle-inspection-software`, `/repair-order-software`, `/signup` |
| `/resources/repair-order-template` | `/repair-order-software`, `/auto-repair-invoicing-software`, `/signup` |

---

## Comparison page links

| Source | Links to |
|--------|----------|
| `/compare` | `/compare/redlined1-vs-tekmetric`, `/compare/redlined1-vs-shopmonkey`, `/pricing`, `/signup` |
| `/compare/redlined1-vs-tekmetric` | `/compare`, `/pricing`, `/signup`, `/mobile-mechanic-software` |
| `/compare/redlined1-vs-shopmonkey` | `/compare`, `/pricing`, `/signup`, `/digital-vehicle-inspection-software` |

---

## Pricing page links

| Source | Links to |
|--------|----------|
| `/pricing` | `/signup`, `/compare`, feature landing pages |

---

## Link implementation notes

- Use `<Link href="...">` (Next.js) on all internal links — never `<a href>` without `target="_blank"` consideration
- Anchor text should be descriptive, not "click here" or "learn more"
- Good anchor text examples:
  - "digital vehicle inspection software" → `/digital-vehicle-inspection-software`
  - "labor rate calculator" → `/tools/labor-rate-calculator`
  - "DVI checklist" → `/resources/digital-vehicle-inspection-checklist`
- Avoid over-linking: 2–4 contextual links per page body is appropriate
- Navigation and footer links do not count toward contextual links

---

## Footer link set (implemented in marketing layout footer)

Expected minimum footer links:
- Product: `/mobile-mechanic-software`, `/digital-vehicle-inspection-software`, `/auto-repair-invoicing-software`, `/repair-order-software`
- Resources: `/tools/labor-rate-calculator`, `/resources/digital-vehicle-inspection-checklist`, `/compare`
- Company: `/pricing`, `/privacy`, `/terms`, `/refund-policy`, `/help`
- Account: `/login`, `/signup`
