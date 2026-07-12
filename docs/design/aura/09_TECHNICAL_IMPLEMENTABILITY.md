# Part 9 — Technical Implementability

## Repository facts confirmed

- `package.json` dependencies: `next@^16.2.9`, `react@^19`, `react-dom@^19`,
  `@supabase/ssr`, `@supabase/supabase-js`, `pdf-lib`, `resend`, `xlsx`,
  `zod`, `@sentry/nextjs`. **No `tailwindcss` package.** No icon library
  (`lucide-react`, `@iconify/react`, `react-icons`, etc.) present. No
  animation library (`framer-motion`, `gsap`) present.
- No `tailwind.config.*` or `postcss.config.*` file exists anywhere in the
  repo root.
- `app/portal/page.tsx` (the current live homepage) uses `'use client'` and
  inline React style objects / plain className strings with a custom CSS
  variable system, not Tailwind utility classes — confirmed by direct read
  of the file.

**Conclusion: Tailwind is not installed or configured in this codebase.**
Any implementation of DESIGN.md's tokens must either (a) be hand-translated
into the existing inline-style/CSS-variable convention already used in
`app/portal/page.tsx`, or (b) require a net-new Tailwind installation
decision, which is a build-tooling change outside the scope of "implement a
design spec" and should be called out to the owner explicitly before anyone
assumes Tailwind classes from DESIGN.md's prose (e.g. `max-w-7xl`,
`rounded-md`, `rounded-2xl`, `h-16`) can be used as-is.

## Flagged risky patterns from DESIGN.md's own `Assets` section

DESIGN.md's `Assets` section (lines 119-126) explicitly lists:

```
Stylesheets: https://cdn.tailwindcss.com
Scripts: https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js
Fonts: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap
```

This is a direct transcript of what the Aura tool generated (and used to
render its own preview) — it is **not safe to carry into a Next.js
production implementation as-is**:

1. **CDN Tailwind (`cdn.tailwindcss.com`) in production — BLOCKER.** The
   Tailwind Play CDN build is explicitly documented by Tailwind itself as
   unsuitable for production (no purging, large payload, runtime JIT compile
   in the browser, console warning injected on every page load). Since this
   repo has no Tailwind installed at all, this reference must simply be
   dropped, not deployed. **Do not implement this literally.**
2. **External runtime icon script (`iconify-icon.min.js` from a CDN) —
   BLOCKER.** Loading a third-party script from `code.iconify.design` at
   runtime is an unnecessary external dependency and a CSP/performance/
   supply-chain risk for a production SaaS marketing page. It also
   contradicts the mission's explicit "Flag any use of... external runtime
   icon scripts" rule.
3. **Remote Google Fonts `<link>` via `fonts.googleapis.com` — IMPORTANT,
   not a hard blocker.** Next.js's built-in `next/font/google` mechanism
   downloads and self-hosts Google Fonts at build time, avoiding the
   render-blocking external request and the third-party tracking/latency
   concern of a live `fonts.googleapis.com` request. The spec's raw
   `<link>`-style reference should be replaced with `next/font/google`'s
   `Inter` import.

These three items are the single biggest gap between "the file Aura
generated as its own preview" and "what's safe to ship." All three are
addressed in Part 11's normalized spec and are the primary drivers of Part
13's "Technical feasibility" score.

## Other technical implementability checks

| Item | Assessment |
|---|---|
| Font-loading approach | Should use `next/font/google` (`Inter`, weights 400/500/600) instead of the CDN `<link>`. Feasible — Next.js 16 supports this natively. |
| SVG/icon strategy | No icon library currently installed. DESIGN.md's named library ("Solar-linear/Solar-bold" via Iconify) does not exist in the repo. Recommend a locally-installed icon set (e.g. `lucide-react`, tree-shakeable, no runtime CDN) rather than the CDN Iconify script. |
| External CDN dependencies | Two found and flagged above (Tailwind CDN, Iconify CDN) — both should be removed/replaced. |
| Client component requirements | The existing homepage is already a full `'use client'` component; a rebuilt page can mix server components (static hero copy, SEO metadata) with client islands (calculators, pricing toggle, FAQ accordion, mobile nav) per Next.js App Router best practice — this is feasible and preferred over an all-client page for performance. |
| Pricing toggle | Not described in DESIGN.md (only a static 3-column grid). If a monthly/yearly toggle is added later, it needs its own client component — currently no such interaction is specified to audit. |
| Calculators (ROI/time-savings) | Not present in DESIGN.md at all (Part 5) — no interaction pattern to assess yet. |
| FAQ interaction | Not present in DESIGN.md (Part 8) — no interaction pattern to assess yet. |
| Mobile navigation | DESIGN.md only says "mobile is hinted via high-contrast buttons" (line 72) — this is not an implementable spec; a real mobile nav (hamburger/drawer or bottom nav) needs to be designed, not just "hinted." |
| Animations | Described only as smooth-scroll, `duration-300` hover transitions, and a "pause when tab inactive" performance control (line 106). No heavy animation library is required or implied — this is good; low-JS CSS transitions are compatible with a lightweight implementation. |
| Image optimization | DESIGN.md's mockups (desktop/mobile device frames) should be served via `next/image` for automatic optimization/responsive sizing; not specified either way in DESIGN.md, so this is a build-time recommendation rather than a corrected error. |
| noindex preview route | Not mentioned in DESIGN.md; should be added at implementation time if a staging/preview URL is used before launch, per standard SEO hygiene — recommendation, not a spec defect. |
| SEO metadata | Not mentioned in DESIGN.md — needs to be authored separately (title, description, OG tags) using Next.js App Router `metadata` export. |
| Structured data | Not mentioned — recommend `SoftwareApplication` or `Organization` JSON-LD at implementation time; not a DESIGN.md defect since token specs don't typically carry structured data. |
| Accessibility | See Part 10 for the full audit. |
| Reduced motion | Not mentioned in DESIGN.md. Should add a `prefers-reduced-motion` media query to disable the scroll/hover transitions described, especially since the spec already shows performance-consciousness ("Aura Controls" pause-when-inactive concept, line 106) — extending that same philosophy to motion-sensitivity is a natural, low-cost addition. |
| Performance risks | The two CDN dependencies (Tailwind, Iconify) are the primary performance risks identified; both are addressable by using local/installed equivalents already idiomatic to this Next.js codebase. |

## Summary

| Issue | Classification |
|---|---|
| CDN Tailwind Play script referenced in Assets | **BLOCKER** |
| CDN Iconify runtime script referenced in Assets | **BLOCKER** |
| Remote `<link>` Google Fonts instead of `next/font` | IMPORTANT |
| No icon library installed matching the named "Solar" icon set | IMPORTANT |
| Mobile nav only "hinted," not specified | IMPORTANT |
| No reduced-motion, SEO metadata, or structured-data guidance | MINOR (additive recommendations, not corrections of stated content) |
| Overall page architecture (server/client split, image optimization) | ACCEPTABLE / feasible with standard Next.js 16 patterns already used elsewhere in this repo |

**Verdict: technically implementable, but only after removing the two CDN
BLOCKER dependencies from the `Assets` section.** Everything else in
DESIGN.md's visual system (colors, spacing, radii, shadows, layout grid) maps
cleanly onto plain CSS/CSS variables consistent with the existing
`app/portal/page.tsx` convention and requires no unusual tooling.
