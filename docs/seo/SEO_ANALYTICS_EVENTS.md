# RedlineD1 — SEO Analytics Events

Last updated: 2026-07-21

---

## Purpose

Define the analytics event taxonomy for marketing funnel tracking. These events enable measurement of SEO-driven traffic conversion through to signup.

---

## GA4 event taxonomy

### Page-level events (auto-tracked by GA4)

| Event | Trigger | Notes |
|-------|---------|-------|
| `page_view` | Every page load | GA4 default; includes page_title, page_location |
| `session_start` | First event in session | GA4 default |
| `first_visit` | New user | GA4 default |

### Custom marketing events

| Event name | When to fire | Parameters |
|-----------|-------------|-----------|
| `cta_click` | Any "Get Started" or "Start Free Trial" button | `{ cta_location: 'hero' \| 'pricing' \| 'footer' \| 'nav', plan: string \| null }` |
| `pricing_plan_click` | Clicking a specific plan's CTA on pricing page | `{ plan: 'free' \| 'solo' \| 'starter' \| 'professional' \| 'business' }` |
| `comparison_viewed` | View of any comparison page | `{ competitor: 'tekmetric' \| 'shopmonkey' \| 'autoleap' }` |
| `tool_used` | Calculator submit/result shown | `{ tool: 'labor_rate' \| 'missed_revenue' \| 'technician_efficiency' }` |
| `resource_print` | Print button clicked on resource page | `{ resource: 'dvi_checklist' \| 'repair_order_template' }` |
| `faq_expanded` | FAQ item expanded | `{ question_index: number, page: string }` |

### Conversion events (mark as conversions in GA4)

| Event | Conversion rationale |
|-------|---------------------|
| `cta_click` | Signals intent to sign up |
| `pricing_plan_click` | High-intent — user selected a plan |

---

## Implementation pattern

```tsx
// components/marketing/CTAButton.tsx (or inline)
'use client';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function trackEvent(eventName: string, params: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// Usage:
<button
  onClick={() => {
    trackEvent('cta_click', { cta_location: 'hero', plan: null });
    router.push('/signup');
  }}
>
  Get Started Free
</button>
```

---

## Funnel stages

```
Organic search
    ↓
Landing page (feature page, comparison page, tool page)
    ↓
Pricing page
    ↓
Signup page
    ↓
In-app onboarding
    ↓
Trial → Paid conversion
```

GA4 funnel exploration: set up "Signup funnel" with steps:
1. `page_view` where `page_location` contains `/pricing`
2. `pricing_plan_click`
3. `page_view` where `page_location` contains `/signup`

---

## Privacy and data minimization

- No PII in event parameters
- No user ID, email, shop ID, or technician name in GA4 events
- Tool results (calculated values) are NOT sent to analytics
- `resource_print` event captures only the resource name, not the user

---

## Search Console + GA4 linking

After both are configured:
1. In GA4 → Admin → Product Links → Search Console Links
2. Link the `https://www.redlined1.com` property
3. This enables "Queries" report in GA4 showing which search terms drive traffic

---

## Implementation status

- [ ] GA4 property created
- [ ] Measurement ID added to `app/layout.tsx`
- [ ] `cta_click` event instrumented on marketing CTAs
- [ ] `pricing_plan_click` event instrumented on pricing page
- [ ] Conversion events configured in GA4
- [ ] Search Console linked to GA4
