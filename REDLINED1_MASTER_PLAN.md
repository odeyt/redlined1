# REDLINED1 MASTER PLAN
## Single Source of Truth — Product, Engineering, AI, and Growth Strategy

**Version:** 1.0 (Aligned with RedlineD1 v1.0.0 Production Baseline)
**Date:** 2026-07-03
**Owner:** D1 Imports / RedlineD1 Product Team
**Status:** Active — This document governs all future RedlineD1 decisions

---

## 1. Executive Summary

RedlineD1 is not a CRM.

It started as one. D1 Imports built it to manage their own shops because existing tools were too expensive, too slow, too American, and not built for how real repair shops actually work — especially in Southeast Asia and multi-currency, multi-language environments.

But RedlineD1 is becoming something more valuable than a CRM: an **AI Automotive Intelligence Platform**.

The difference matters. A CRM stores records. An intelligence platform learns from every record, gets smarter from every repair, and helps technicians and owners make better decisions tomorrow based on everything that happened today.

**What makes RedlineD1 different:**

- Built by a real repair shop, tested daily in real operations
- Designed from the ground up for multi-currency, multi-language, multi-shop environments
- AI is embedded in the workflow — not bolted on as a chatbot
- Every completed repair becomes structured knowledge
- The platform gets smarter with every job closed

RedlineD1 v1.0.0 is the production baseline: a complete shop operations platform used live by D1 Imports Shop 1 and Shop 2. Everything from here forward builds the intelligence layer on top of that proven foundation.

---

## 2. Product Vision

**RedlineD1 will become the operating system and intelligence layer for automotive repair shops worldwide.**

The vision has three horizons:

**Near-term (v2.0):** Every repair shop workflow — customer intake, inspection, repair, estimate, invoice, payment — is faster, more accurate, and AI-assisted.

**Mid-term (v3.0–v4.0):** Anonymized repair intelligence from thousands of shops creates a verified knowledge base that helps any shop diagnose and fix vehicles faster. Shops contribute knowledge and receive knowledge.

**Long-term (v5.0+):** RedlineD1 operates as an autonomous shop intelligence layer — AI service advisor, AI foreman, AI parts manager — that works alongside human technicians rather than replacing them.

The moat is not the software. The moat is the structured, verified, anonymized repair intelligence accumulated from every job closed on the platform.

---

## 3. Product Mission

**Help repair shops run faster, communicate better, reduce mistakes, increase profit, and make better repair decisions using AI and structured repair intelligence.**

This mission has five measurable dimensions:

| Dimension | What it means |
|-----------|---------------|
| Run faster | Less time on paperwork, faster estimate creation, faster customer updates |
| Communicate better | Clear customer messages, digital inspections, approval workflows |
| Reduce mistakes | AI second opinions, QA checklists, verified repair procedures |
| Increase profit | Better estimate accuracy, upsell suggestions, profitability analytics |
| Better decisions | Repair intelligence, DTC explanations, similar case lookup, comeback risk |

---

## 4. Strategic Pillars

RedlineD1 is built on three pillars. Every feature must strengthen at least one. The most valuable features strengthen all three.

---

### Pillar 1 — Shop Operations

**What it covers:**
Customer management, vehicle management, job cards, repair orders, digital inspections, estimates, invoices, payments, parts inventory, scheduling, technician management, time tracking, labor guide, customer portal, notifications.

**The question it answers:**
Can a repair shop run its entire operation on RedlineD1 — from the first call to the final payment — without needing another tool?

**Success metric:**
A shop can process a vehicle from intake to invoice entirely within RedlineD1. Zero dependency on paper, spreadsheets, or competing software for core operations.

**Current status (v1.0.0):** Largely complete. The foundation is live and proven at D1 Imports.

---

### Pillar 2 — Shop Intelligence

**What it covers:**
AI-assisted DTC explanations, AI estimate drafting from inspections, AI invoice summaries, AI customer message drafting, AI second opinion on diagnoses, profitability analytics, technician productivity metrics, comeback risk identification, maintenance upsell suggestions.

**The question it answers:**
Does RedlineD1 help the shop make better decisions and save time on every job?

**Success metric:**
A technician or service advisor completing a job with AI assistance saves measurable time and produces a better result — clearer communication, more accurate estimate, faster diagnosis — compared to without AI.

**Current status (v1.0.0):** Foundation laid. AI API route, prompt registry, service layer, and mock mode are in place. Buttons exist in DTC View and Inspections View. Intelligence features are the primary focus of v2.0.

---

### Pillar 3 — Industry Intelligence

**What it covers:**
Anonymized repair cases, verified repair outcomes, similar vehicle lookups, repair knowledge graph, benchmark data across shops, future global repair intelligence network.

**The question it answers:**
Does every repair make the platform smarter? Does a technician working on a 2019 Toyota Camry benefit from the experience of every other technician who has worked on that vehicle, engine, and fault code?

**Success metric:**
A technician diagnosing an unfamiliar fault can look up similar verified repairs from the knowledge base and reduce diagnostic time measurably.

**Current status (v1.0.0):** Database schema created (6-table repair intelligence schema). RepairIntelligenceView module exists. No network sharing yet — that comes in v3.0.

---

## 5. Core Product Principles

These principles are not guidelines. They are rules. When a feature conflicts with a principle, the principle wins.

### 5.1 Real Shop Workflow First
Features are designed around how D1 Imports actually works, not how software vendors imagine shops work. If it doesn't fit in a real shop's day, it doesn't ship.

### 5.2 Technician Approval Required for AI
AI output is always a suggestion. A technician or service advisor must review and approve before AI output is used in any customer-facing or production context. No exceptions.

### 5.3 Never Overwrite Human Notes with AI
AI may suggest. AI may draft. AI may supplement. AI must never silently replace or overwrite something a human wrote. Human notes are authoritative.

### 5.4 Mobile-First Technician Workflow
A technician in a bay should be able to update a job card, upload a photo, and record time on a phone in under 30 seconds. If it requires a desktop, the feature is not done.

### 5.5 Fast Before Fancy
A feature that loads instantly and does one thing well beats a feature with animations and dashboards that takes three seconds to render. Performance is a feature.

### 5.6 Data Quality Creates AI Quality
The intelligence of the platform is only as good as the data technicians enter. Every UI decision should make it easier to capture accurate, structured data. Garbage in, garbage out.

### 5.7 Every Feature Must Justify Its Existence
Every feature must improve at least one of: revenue, retention, repair intelligence, productivity, or competitive moat. If it does none of these, it does not get built.

### 5.8 Multi-Shop From Day One
All data is scoped by `shop_id`. RLS enforces it. No feature is built assuming a single shop. This is a platform, not a single-tenant app.

### 5.9 Customer Data Is Private
Customer personal information stays within the shop. It is never used for AI training, cross-shop sharing, or analytics beyond the shop that owns it. Trust is the foundation.

### 5.10 Make Repair Knowledge Reusable
When a technician diagnoses a vehicle and records the fix, that knowledge should be available — in anonymized form — to help the next technician facing the same problem. Repair knowledge is an asset that should compound.

---

## 6. AI Strategy

### 6.1 What AI Must Not Be

AI in RedlineD1 is not a generic chatbot. It is not a search engine wrapper. It is not a novelty feature added to impress investors. A chatbot that answers general automotive questions has no moat and no lasting value.

### 6.2 What AI Must Do

AI in RedlineD1 must perform real shop work — the same tasks that currently consume technician time, service advisor time, and owner time.

**Current AI task types (v1.0.0):**

| Task | Trigger | Output |
|------|---------|--------|
| DTC Explanation | Technician looks up a fault code | Plain-language explanation for customer + diagnostic steps |
| Estimate Draft | Inspection completed with Fail/Attention items | Suggested line items with labor and parts |
| Customer Message Draft | Job card status updated | Professional SMS or email update for customer |
| Invoice Summary | Invoice ready to send | Professional narrative summary of work done |
| Repair Case Summary | Repair order closed | Structured summary for knowledge base |

**Future AI task types (v2.0+):**

- Second opinion on diagnosis (compare against similar verified cases)
- Maintenance upsell suggestions based on mileage and vehicle history
- Comeback risk prediction based on repair type and technician history
- Profitability analysis per job, technician, vehicle type
- Parts pricing optimization
- Customer churn risk prediction
- Warranty claim drafting

### 6.3 AI Rules

| Rule | Why |
|------|-----|
| AI output is always labeled as suggestion | Technician liability protection |
| AI must log every call (model, tokens, cost) | Cost control and audit trail |
| AI must support mock mode (no API key required) | Development and demo environments |
| AI must support provider switching | Claude today, others tomorrow |
| AI uses structured JSON outputs | Machine-readable, UI-renderable |
| AI prompts live in a central registry | Consistent voice, easy to update |
| AI secrets stay server-side only | Security |
| AI must include safety disclaimer for automotive context | "AI suggestions must be verified by a qualified technician" |

### 6.4 AI Becomes Workflow-Native

The goal is not an AI page. The goal is AI embedded invisibly in every workflow step — a button that appears at the right moment, does the right thing, and saves real minutes.

- DTC View: AI explains the code while the technician is looking at it
- Inspection View: AI drafts the estimate from the inspection findings
- RO View: AI generates the invoice summary when the RO is complete
- Job Card: AI drafts the customer update when status changes

AI should feel less like a feature and more like a capable colleague who is always there when you need them.

### 6.5 AI Provider Strategy

Default: Anthropic Claude (claude-haiku-4-5-20251001 for speed and cost).

Architecture must support switching providers. The `/api/ai` route, `aiService.ts`, and `prompts.ts` are designed to be provider-agnostic. Claude is the current choice because:

- Fast inference
- Strong instruction following
- Structured JSON output reliability
- Reasonable cost at Haiku tier

Future: OpenAI fallback, fine-tuned automotive models, local inference for sensitive environments.

### 6.6 AI Cost Management

| Tier | Daily Limit | Estimated Monthly Cost |
|------|-------------|----------------------|
| Free | 10 requests | < $1 |
| Pro | 200 requests | ~$5–15 |
| Pro Plus | 1,000 requests | ~$25–75 |
| Enterprise | Custom | Negotiated |

Token costs are logged per call in `ai_usage_logs`. The `ai_usage_daily` view provides per-shop daily aggregates for billing and monitoring.

---

## 7. Repair Intelligence Strategy

### 7.1 The Core Idea

Every completed repair at every shop contains valuable knowledge. That knowledge currently lives in technician heads, paper ROs, and disconnected systems. When a technician leaves, the knowledge leaves with them. When the same fault appears two weeks later on a different vehicle, the shop starts from zero again.

RedlineD1 changes this. Every completed repair creates a structured, searchable, anonymizable repair case.

### 7.2 Repair Case Structure

A complete repair case includes:

**Vehicle Identity:**
- Make, Model, Year, Engine, Transmission
- VIN (anonymized for network sharing)
- Mileage at repair

**Problem:**
- Customer complaint (verbatim)
- Symptoms observed
- DTCs retrieved (codes + descriptions + modules)

**Diagnosis:**
- Tests performed (test name, result, passed/failed, notes)
- Scan data (future)
- Technical service bulletins consulted (future)

**Repair:**
- Parts replaced (name, part number, supplier, cost)
- Labor hours
- Technician notes
- Final fix (plain language)

**Outcome:**
- Verified fix status
- Customer satisfaction
- Comeback within 30 days
- Comeback within 90 days
- Warranty claim filed
- Confidence score

### 7.3 Verification Levels

Repair cases gain trust over time:

| Level | Criteria | Value |
|-------|----------|-------|
| Pending | Case created, repair complete | Low |
| Technician Verified | Tech confirms fix resolved complaint | Medium |
| 30-Day Verified | No comeback within 30 days | High |
| 90-Day Gold Verified | No comeback within 90 days + customer confirmed | Highest |

Gold Verified cases become the highest-confidence entries in the knowledge base. AI second opinions should weight them most heavily.

### 7.4 Case Creation Triggers

Repair cases should be created automatically when:
- A Repair Order status changes to Complete or Closed
- A Job Card is closed
- Manually by a technician or service advisor

The Repair Intelligence module provides manual case creation when a repair doesn't have a formal RO (mobile mechanics, quick repairs, walk-ins).

### 7.5 Privacy by Design

Before any case enters the shared network:
- Customer name, contact, and identifying details are stripped
- VIN is truncated or hashed (WMI preserved for make/model matching)
- Shop identity can be anonymized if the shop opts out of attribution
- Technician identity is always anonymized in network data

Sharing is always opt-in. A shop's repair cases are private by default. The shop decides what enters the network.

---

## 8. Automotive Knowledge Graph Strategy

### 8.1 What the Knowledge Graph Is

A knowledge graph is not a database of records. It is a map of relationships. Instead of asking "what repairs have been done?" it allows asking "what is the most common fix for fault code P0301 on a 2018 Ford F-150 with a 5.0L V8 at 90,000+ miles, where the customer complaint was rough idle?"

The answer is found by traversing connections: Vehicle → Engine → ECU → DTC → Symptom → Test → Part → Repair Procedure → Outcome.

### 8.2 The Nodes

| Node | Examples |
|------|---------|
| Manufacturer | Toyota, Ford, Honda, BMW |
| Model | Camry, F-150, Civic, 3 Series |
| Platform | GA70K (Camry 2018–2022 TNGA-K) |
| Engine | 2AR-FE, Coyote 5.0, K20C |
| ECU / Module | PCM, TCM, BCM, ABS |
| DTC | P0300, C0035, U0100 |
| Symptom | Rough idle, hard start, brake pull |
| Test | Compression test, live data scan, cylinder contribution |
| Part | Ignition coil, O2 sensor, wheel speed sensor |
| Repair Procedure | Coil pack replacement, sensor calibration |
| Labor Time | Hours per procedure per vehicle |
| Technician | Aggregated skill profile (anonymized) |
| Outcome | Fixed, returned, escalated, warranty |
| Comeback | Yes/No, days until return |
| Warranty | Claim filed, parts warranty, labor warranty |

### 8.3 Why This Is the Moat

Any competitor can build a CRM. Many have. Any competitor can add AI features. Many will.

But the knowledge graph — built from real, verified, structured repair data contributed by real shops over real years — cannot be bought, scraped, or built in six months. It grows linearly with the number of shops and repairs on the platform. The more shops that use RedlineD1, the smarter the graph becomes, which attracts more shops, which makes the graph smarter.

This is the compounding moat. Every shop that joins makes the platform more valuable for every other shop. This is the business model, not just the feature set.

### 8.4 Graph Reasoning vs. Record Retrieval

Today: "Show me repairs with DTC P0301 on Toyota Camry."
Knowledge graph: "Given this vehicle, these symptoms, these codes, and this mileage, what is the most likely root cause, and what is the statistically most successful repair path?"

The second question requires connected data. It cannot be answered by a standard relational database query alone. It requires inference across node relationships — which is what the knowledge graph enables.

---

## 9. Marketplace Strategy

### 9.1 The Principle

The marketplace is last, not first.

A marketplace only has value when the core platform has strong retention, high data quality, and a user base that trusts the platform enough to bring third parties into their workflow. Building marketplace features before that baseline exists creates complexity without value.

### 9.2 Future Marketplace Categories

**Parts & Supply:**
- Parts supplier integrations (real-time pricing, availability)
- OEM and aftermarket catalog connections
- Supplier comparison and ordering

**Labor & Knowledge:**
- Labor guide providers (Chilton, ALLDATA, Mitchell)
- Technical service bulletin feeds
- OEM wiring diagrams

**Diagnostic Tools:**
- Scan tool integrations (Autel, Launch, Snap-on API)
- Live data streams from diagnostic hardware
- Remote diagnostic support

**Payments & Finance:**
- Payment processing (Stripe, Square, local payment rails)
- Financing options for customers
- Factoring / invoice financing for shops

**Business Operations:**
- Accounting integrations (QuickBooks, Xero)
- Fleet management connections
- Insurance claim processing

**Expansion:**
- Warranty providers
- Training courses and technician certification
- AI agent add-ons (specialized automotive AI services)
- OEM data licensing

### 9.3 Marketplace Sequencing

| Phase | When | What |
|-------|------|------|
| Do not build | v1.0–v2.0 | Any marketplace features |
| Evaluate | v3.0 | Parts supplier pilot integration |
| Build carefully | v4.0 | Curated marketplace with select partners |
| Scale | v5.0+ | Open API for approved third parties |

---

## 10. Monetization Strategy

### 10.1 Pricing Tiers

**Free / Trial:**
- Time-limited or feature-limited access
- Up to 10 AI requests per day
- Core CRM (customers, vehicles, job cards)
- No advanced features, no AI intelligence
- Goal: let shops experience the platform with zero friction

**Pro:**
- Full shop operations: estimates, invoices, payments, inspections, scheduling, parts, technician management
- Email/SMS notifications (usage-based)
- Repair intelligence (basic — own shop cases only)
- Up to 200 AI requests per day
- Multi-currency support
- Customer portal
- Price: TBD per shop/month (target competitive with Tekmetric/Shopmonkey)

**Pro Plus:**
- Everything in Pro
- Advanced AI features (second opinion, comeback prediction, profitability analysis)
- Repair intelligence insights (cross-shop anonymized data — when network exists)
- Advanced analytics and reporting
- Up to 1,000 AI requests per day
- Priority support
- Price: TBD — premium tier

**Enterprise:**
- Everything in Pro Plus
- Unlimited AI requests
- Multi-location management (cross-shop views)
- Custom integrations
- Advanced role permissions
- Dedicated support
- API access for custom integrations
- Custom SLA
- Price: Negotiated per contract

### 10.2 Add-Ons

| Add-On | Description |
|--------|-------------|
| AI Credits | Top-up AI request limits beyond plan tier |
| SMS Usage | Per-message billing for outbound SMS |
| Payment Processing | Per-transaction fee for integrated payments |
| Marketplace Integrations | Per-integration or revenue share |
| Premium Repair Intelligence Reports | One-time or subscription reports per vehicle type |

### 10.3 Monetization Principles

- Never charge for data that makes shops better at their core job
- AI features may be premium, but basic AI assistance should be accessible
- Pricing must make sense in Southeast Asian markets — not only USD-centric North American pricing
- Repair intelligence contributions from shops should reduce or eliminate their subscription cost (contribution as currency)

---

## 11. Roadmap by Business Milestone

Releases are named by what they unlock, not by the features they contain.

---

### Foundation — v1.0.0 ✅ COMPLETE
**Theme:** Can a shop run on RedlineD1?

Delivered:
- Complete shop operations (customers, vehicles, job cards, ROs, estimates, invoices, payments, inspections, scheduling, parts, technicians, time tracking, VIN decoder, DTC lookup, labor guide)
- Multi-shop support with Supabase RLS
- Customer portal and public pages
- Email/SMS via Resend
- AI foundation (API route, prompt registry, mock mode, service wrapper)
- Repair Intelligence database schema
- ErrorBoundary, pagination, Zod validation schemas
- Production baseline archived: RedlineD1-v1.0.0-D1Production-2026-07-03

---

### Intelligence — v2.0.0 🔄 CURRENT FOCUS
**Theme:** Does RedlineD1 make shops smarter on every job?

Target deliverables:
- AI embedded in DTC, Inspections, Repair Orders, Job Cards, Invoices
- Repair Intelligence module with manual case creation
- AI usage tracking and display (owner-only)
- Zod validation wired into all 10 form handlers
- Pagination on all list views
- Repair case auto-creation when RO is closed
- AI second opinion (similar case lookup within own shop)
- Owner profitability dashboard
- Technician productivity metrics
- Comeback tracking
- Mobile technician workflow improvements
- Build stability: zero type errors, lint passing

---

### Network — v3.0.0
**Theme:** Does every repair make the whole platform smarter?

Target deliverables:
- Opt-in anonymized repair case sharing
- Network case search (find similar repairs across shops)
- Verification workflow (30-day, 90-day Gold)
- Confidence scoring
- Repair Intelligence insights dashboard
- Privacy controls (shop controls what is shared)
- Contribution incentives (reduced subscription for verified cases)

---

### Knowledge Graph — v4.0.0
**Theme:** Can RedlineD1 reason from repair data, not just retrieve it?

Target deliverables:
- Graph layer connecting vehicles, DTCs, symptoms, tests, parts, outcomes
- Graph-powered AI second opinion (cross-shop verified cases)
- Diagnostic path suggestions (what tests to run, in what order)
- Parts co-occurrence analysis (what else typically fails when X fails)
- Technical service bulletin integration
- Labor time recommendations from verified cases

---

### Marketplace — v4.0.0 / v5.0.0
**Theme:** Can shops get what they need without leaving RedlineD1?

Target deliverables:
- Parts supplier pricing integration (pilot)
- Accounting integration (QuickBooks/Xero)
- Payment processing integration
- Third-party plugin API (approved partners)
- Diagnostic tool data ingestion

---

### Autonomous Shop — v5.0.0
**Theme:** Does RedlineD1 operate proactively alongside the shop?

Target deliverables:
- AI service advisor (customer intake, appointment scheduling suggestions)
- AI foreman (job assignment based on technician skills and workload)
- AI parts manager (reorder suggestions, supplier comparison)
- AI marketing assistant (customer follow-up campaigns, review requests)
- Predictive maintenance reminders per vehicle
- Fleet intelligence for fleet customers

---

## 12. Feature Acceptance Criteria

Before any feature is added to the roadmap, it must pass this checklist. If it fails more than two of these, it should not be built.

| Question | Expected Answer |
|----------|-----------------|
| What specific problem does it solve? | Named, concrete problem with a real user |
| Which strategic pillar does it strengthen? | Pillar 1, 2, or 3 (ideally more than one) |
| Does it increase revenue directly or indirectly? | Yes — or it improves retention which does |
| Does it increase retention? | Yes — shop would miss it if removed |
| Does it improve repair intelligence quality or quantity? | Yes |
| Does it improve technician or advisor productivity? | Measurable time saved |
| Does it improve data quality? | Captures more structured data |
| Is it safe for a live production shop? | Zero risk of data loss or corruption |
| Can D1 Imports test it in a real workflow? | Yes — internal testing is required |
| Can it scale to 100 shops without re-architecture? | Yes |
| Does it protect customer privacy? | Yes — no customer data leaks |
| Is it worth the engineering time vs. alternatives? | Yes — better ROI than other options |

If the answer to any question is "maybe," clarify before building.

---

## 13. Engineering Rules

These rules are not preferences. They apply to every change, every time.

### 13.1 Stability

- Production stability comes before new features, always
- Small, safe, testable changes over large rewrites
- Risky architectural changes require explicit approval and a documented plan
- Never remove a working feature without a replacement or explicit approval

### 13.2 Code Quality

- TypeScript strict mode enforced
- Zod validation on all form inputs and API boundaries
- No `any` types without explicit justification and comment
- Services stay separated from UI components — no Supabase calls inside feature components
- AI prompts live in `lib/ai/prompts.ts` — never hardcoded in components

### 13.3 Database / Multi-Tenancy

- `shop_id` on every tenant-scoped table, enforced at RLS level
- RLS policies must never be weakened or bypassed
- All schema changes go through migration files — no manual schema drift
- Migration files are idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`)
- Foreign key relationships use `ON DELETE CASCADE` for dependent records

### 13.4 Security

- No secrets in client-side code — `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` are server-only
- All AI API calls are authenticated (Bearer token via Supabase session)
- Environment variables documented in `.env.example` — actual values never committed
- `.env.local` excluded from all snapshots and git commits

### 13.5 AI Engineering Rules

- Every AI call must be logged (model, tokens, cost, shop, user, feature)
- AI prompts include `SAFETY_RULES` block with automotive technician disclaimer
- AI API runs in mock mode when `ANTHROPIC_API_KEY` is absent
- AI output must never auto-apply to production records — always requires human approval
- AI suggestions must be labeled as suggestions in the UI

### 13.6 Definition of Done

A feature is not done until:
1. `npm run build` passes with zero type errors
2. All changed files are reviewed for regressions
3. Feature works in the RepairD1 UI without console errors
4. D1 Imports can use it in a real workflow
5. Lint issues are documented if not resolvable (not silently ignored)

---

## 14. Data and Privacy Rules

### 14.1 Customer Data

Customer personal information (name, phone, email, address, vehicle) is private to the shop that owns it. It is:
- Never shared across shops
- Never used for AI training
- Never included in anonymized network exports
- Never exposed in public API endpoints without explicit token authorization

### 14.2 Repair Intelligence Privacy

Before any repair case enters the shared network:
- Customer identity is fully stripped
- Vehicle VIN is truncated (first 9 characters — WMI + model platform only)
- Shop identity is anonymizable (shop chooses attribution level)
- Technician identity is always anonymized in network data
- Sharing requires explicit opt-in per shop

### 14.3 RLS Rules

- `shop_id = ANY(public.my_shop_ids())` on all SELECT, INSERT, UPDATE, DELETE policies
- RLS is enabled on every table — no exceptions
- Service role key is server-only and used only for admin operations requiring bypass
- RLS must be tested after every migration

### 14.4 AI Data Rules

- AI context sent to Anthropic should not include customer PII when avoidable
- AI logs (`ai_usage_logs`) must not store the full prompt text (only metadata: model, tokens, feature, cost)
- Sensitive business data (pricing, margins) must not be shared across shops via AI

---

## 15. What NOT To Build

Saying no is as important as saying yes. These are explicit exclusions:

| Do Not Build | Why |
|-------------|-----|
| Random features without business value | Every feature has an opportunity cost |
| Generic automotive chatbot | No moat, no workflow value |
| Social features inside the CRM | Wrong product category |
| Native mobile app before PWA is excellent | Premature platform split |
| Complex marketplace before v3.0 | Core product must come first |
| AI that auto-modifies production records | Liability, trust, safety |
| Features that look impressive but save no time | Vanity features waste engineering time |
| Dashboards before data quality is strong | Garbage data produces garbage dashboards |
| Multi-tenant admin console before needed | Overengineering |
| Real-time collaboration features before stability | Complexity without proven demand |
| OEM data scraping or unlicensed data sources | Legal and relationship risk |
| Features that only serve enterprise and break SMB workflow | Platform fragmentation |

---

## 16. Competitor Strategy

### 16.1 Who The Competitors Are

North American shop management software: Tekmetric, Shopmonkey, AutoLeap, Shop-Ware, Mitchell1, Protractor.

These tools are well-funded, well-established, and built primarily for the North American English-speaking market.

### 16.2 How NOT To Compete

Do not compete feature-for-feature. Copying Tekmetric's feature list produces a worse Tekmetric with no reason for anyone to switch. That is a slow death.

### 16.3 How To Compete

**Origin advantage:** RedlineD1 was built by a real repair shop, tested in real operations every day, and designed around how shops actually work — not how analysts imagine they work. This produces a tighter product-market fit, especially for shops that feel underserved by enterprise-oriented tools.

**Geography advantage:** Southeast Asian markets (Thailand, Laos, Cambodia, Vietnam) are largely unserved by North American shop software. Multi-currency (USD, CAD, THB, LAK), multi-language support, and understanding of regional business norms is a day-one advantage.

**AI-native advantage:** Competitors are adding AI as a feature layer on top of legacy architecture. RedlineD1 is building AI into the workflow from the architecture level. The AI prompt registry, usage logging, mock mode, and service wrapper are infrastructure — not afterthoughts.

**Intelligence moat:** The repair intelligence network and knowledge graph are not replicable by competitors unless they start building the same infrastructure today. Data moats take years to accumulate. RedlineD1 is starting now.

**Speed advantage:** A small team iterating on a live product used internally can move faster than any enterprise software vendor. The D1 Imports testing laboratory means real feedback from real users within hours, not weeks.

---

## 17. D1 Imports Internal Testing Strategy

D1 Imports is not just a customer. It is the testing laboratory that makes RedlineD1 better than any software that has never seen a real shop.

### 17.1 Testing Roles at D1 Imports

| Role | What They Test |
|------|---------------|
| Owner | Profitability features, reports, AI insights, settings, billing |
| Manager | Job assignment, RO management, technician oversight, approvals |
| Technician | Job card updates, time tracking, mobile workflow, DTC lookup, inspections |
| Service Advisor | Estimates, invoices, customer communication, scheduling, portal |
| Real Customer | Portal, inspection approval, job status page, invoice links |

### 17.2 Testing Protocol for Major Features

Before any major feature ships to other shops:

1. Feature is implemented and build passes
2. Feature is tested end-to-end using real D1 Imports data (not mock data)
3. Each role tests the feature in their actual workflow
4. Feedback is captured — what broke, what was confusing, what was missing
5. Fixes are applied
6. Feature ships after internal sign-off

### 17.3 What Internal Testing Catches That QA Misses

- Workflow assumptions that don't match reality (the spec said X but shops actually do Y)
- Performance issues under real data volume
- UI confusion that developers don't notice because they know how it works
- Edge cases in multi-currency, multi-technician, multi-vehicle workflows
- Integration gaps (the estimate was created but the RO didn't pick it up)

D1 Imports is the truth. If it doesn't work there, it doesn't work.

---

## 18. ChatGPT + Claude Development Workflow

RedlineD1 is developed using a two-model collaboration. Each model plays to its strengths.

### 18.1 ChatGPT — Product Architect and Strategist

ChatGPT operates as the CPO (Chief Product Officer) and architect:

| Responsibility | Description |
|----------------|-------------|
| Product strategy | Vision, roadmap, prioritization, feature decisions |
| Technical architecture | System design, data models, integration patterns |
| Feature specification | Detailed specs before implementation begins |
| AI strategy | Prompt design, model selection, workflow integration |
| Business model | Pricing, monetization, market positioning |
| Architecture review | Review implemented features for structural soundness |
| Next step definition | After each Claude implementation, define what comes next |

### 18.2 Claude Code — Implementation Engineer

Claude Code (via Claude Code CLI) operates as the engineering team:

| Responsibility | Description |
|----------------|-------------|
| Code implementation | Write, edit, and refactor TypeScript/TSX |
| Migration writing | SQL migrations for Supabase |
| UI building | Feature components, forms, views |
| Build validation | `npm run build` must pass before any claim of "done" |
| Refactoring | Clean up on request, never speculatively |
| Risk reporting | Report what changed, what was skipped, what might break |
| Test execution | Run existing test suites when available |

### 18.3 The Standard Workflow

```
1. Owner defines goal
        ↓
2. ChatGPT creates product/technical specification
        ↓
3. Claude Code implements from the specification
        ↓
4. Claude reports:
   - Files changed
   - What was skipped and why
   - Build status (pass/fail)
   - Known risks or open questions
        ↓
5. Owner tests in D1 Imports live workflow
        ↓
6. ChatGPT reviews result and defines next step
        ↓
7. Repeat
```

### 18.4 Rules for This Workflow

- Claude does not decide what to build next — it implements what is specified
- ChatGPT does not touch code — it specifies, reviews, and advises
- Neither model skips the build check
- Neither model assumes a feature is done without the owner testing it
- Specifications are written before implementation begins — not during
- If the spec is ambiguous, Claude flags it before building rather than guessing

---

## 19. Release Management

### 19.1 Release Naming Convention

| Version | Name | Theme |
|---------|------|-------|
| v1.0.0 | Foundation | Shop operations complete |
| v2.0.0 | Intelligence | AI embedded in every workflow |
| v3.0.0 | Network | Anonymized repair intelligence sharing |
| v4.0.0 | Knowledge Graph | Connected repair reasoning |
| v5.0.0 | Autonomous Shop | AI operating alongside the shop |

### 19.2 Release Requirements

Every major version release must include:

| Artifact | Description |
|----------|-------------|
| Backup snapshot | Full project copy in `Releases/` directory |
| RELEASE_MANIFEST.md | Versions, health status, file counts, env vars |
| CHANGELOG.md | Feature list with before/after for each change |
| RESTORE.md | Step-by-step restore guide |
| DATABASE_STATE.md | Migration status, table list, pending steps |
| Build verification | `npm run build` passing, documented |
| Known issues list | Honest documentation of what is not yet fixed |

### 19.3 Git Strategy

- `main` branch is always production-ready
- Feature work happens in branches (`feature/v2-ai-buttons`, etc.)
- No direct commits to main without a working build
- Commits are tagged at each major version (`v1.0.0`, `v2.0.0`)
- GitHub remote: `https://github.com/odeyt/redlined1.git`

---

## 20. North Star Metric

**Number of verified repair cases created per month.**

This single metric captures whether the platform is being used for real work, whether technicians are completing the repair loop, and whether the intelligence moat is growing.

A shop that creates verified repair cases is:
- Completing jobs on the platform (operations ✅)
- Documenting their knowledge (intelligence ✅)
- Contributing to the network (industry intelligence ✅)

### Supporting Metrics

| Metric | What It Measures |
|--------|-----------------|
| AI actions completed per month | Is AI saving time? |
| Estimate creation time (AI vs manual) | Is AI measurably faster? |
| Customer digital approval rate | Are customers engaging with inspections? |
| Comeback rate per shop | Is RedlineD1 helping reduce comebacks? |
| Technician productivity (jobs/day) | Is the workflow faster? |
| Average invoice value | Are estimates more complete? |
| Shop retention rate (monthly) | Do shops keep paying? |
| Repair case completeness score | Is data quality improving? |
| AI suggestion acceptance rate | Do technicians trust and use AI output? |

---

## 21. Final Decision Rule

This rule governs every product and engineering decision at RedlineD1.

> **If a feature does not help a repair shop operate better, make more money, reduce mistakes, improve customer trust, or increase repair intelligence — it should not be built.**

Every feature begins with this question. If the answer requires more than one sentence to get to yes, reconsider.

RedlineD1 exists because real shops have real problems that real software has failed to solve. The purpose of this platform is to solve those problems — simply, reliably, and intelligently — and to get smarter at solving them every single day.

---

*This document was established as the single source of truth for RedlineD1 on 2026-07-03, aligned with the v1.0.0 Production Baseline. It should be reviewed and updated at each major version release.*
