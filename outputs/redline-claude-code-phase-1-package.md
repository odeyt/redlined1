# Redlined1 Claude Code Phase 1 Package

Use this package to ask Claude Code to convert the current Redlined1 static prototype into a proper Next.js app.

## Current Prototype Files

Give Claude Code these files from this workspace:

- `index.html`
- `styles.css`
- `app.js`
- `services/vinDecoderService.js`
- `services/dtcLookupService.js`
- `services/scanToolService.js`
- `services/invoiceService.js`
- `services/partsInventoryService.js`
- `outputs/autoops-crm-mvp-feature-design-and-database-schema.md`

The app is currently a static JavaScript prototype. It is not production-ready yet.

## Phase 1 Goal

Convert the static Redlined1 automotive CRM prototype into a clean **Next.js App Router + TypeScript** frontend application using mock data only.

Do **not** add real database, real authentication, Stripe, Supabase, OpenAI API, SMS, email, or live scan tool integration in Phase 1.

Phase 1 is only:

- Next.js project structure
- TypeScript
- React components
- Mock data
- Working navigation
- Working local state actions
- Mobile-responsive UI
- Same Redlined1 feature coverage as the prototype

## Primary Claude Code Prompt

Copy and paste this into Claude Code:

```text
You are helping me convert my Redlined1 automotive CRM SaaS prototype into a production-oriented Next.js application.

Project name: Redlined1

Redlined1 is an automotive CRM and shop operations SaaS for:
- Mobile mechanics
- Repair shops
- Parts sellers
- Fleet service companies
- Multi-location automotive service businesses

The current prototype is a static HTML/CSS/JavaScript app. Convert it into a Next.js App Router project using TypeScript.

Use the existing prototype files as the source of truth:
- index.html
- styles.css
- app.js
- services/vinDecoderService.js
- services/dtcLookupService.js
- services/scanToolService.js
- services/invoiceService.js
- services/partsInventoryService.js
- outputs/autoops-crm-mvp-feature-design-and-database-schema.md

PHASE 1 ONLY:
Do not add real database, Supabase, Clerk, Stripe, OpenAI API, Twilio, SendGrid, VIN API, DTC API, or real scan tool integration yet.

Build Phase 1 as a frontend-only Next.js app with mock data and working local state.

Technical requirements:
- Use Next.js App Router
- Use TypeScript
- Use React components
- Keep the current Redlined1 visual style
- Preserve mobile responsiveness
- Use mock data from the prototype
- Keep actions functional with React state
- Use the existing service boundaries as local mock services
- Organize files clearly

Recommended structure:
- app/layout.tsx
- app/page.tsx
- app/globals.css
- components/AppShell.tsx
- components/Sidebar.tsx
- components/Header.tsx
- components/StatCard.tsx
- components/Panel.tsx
- components/DataTable.tsx
- components/Badge.tsx
- components/Icon.tsx
- components/Workflow.tsx
- components/Toast.tsx
- features/dashboard/DashboardView.tsx
- features/access/AccessView.tsx
- features/subscriptions/SubscriptionsView.tsx
- features/ai/AiView.tsx
- features/customers/CustomersView.tsx
- features/vehicles/VehiclesView.tsx
- features/job-cards/JobCardsView.tsx
- features/scheduling/SchedulingView.tsx
- features/inspections/InspectionsView.tsx
- features/communication/CommunicationView.tsx
- features/estimates/EstimatesView.tsx
- features/repair-orders/RepairOrdersView.tsx
- features/invoices/InvoicesView.tsx
- features/payments/PaymentsView.tsx
- features/parts/PartsView.tsx
- features/technicians/TechniciansView.tsx
- features/vin/VinView.tsx
- features/dtc/DtcView.tsx
- features/diagnostics/DiagnosticsView.tsx
- features/reports/ReportsView.tsx
- features/settings/SettingsView.tsx
- lib/mock-data.ts
- lib/types.ts
- lib/actions.ts
- services/vinDecoderService.ts
- services/dtcLookupService.ts
- services/scanToolService.ts
- services/invoiceService.ts
- services/partsInventoryService.ts

Feature coverage to preserve:
- Dashboard
- Login and roles mock screen
- Subscription plans and feature gates mock screen
- AI Copilot mock screen
- Customer CRM
- Vehicle management
- Job cards
- Scheduling
- Digital inspections
- Customer communication
- Estimates
- Repair orders
- Invoices
- Manual payments
- Parts inventory
- Technician workflow
- VIN decoder
- DTC lookup
- Simulated scan tool diagnostics
- Reports
- Settings

Functional behavior to preserve:
- Sidebar navigation changes active module
- Create job card
- AI fill job card form
- Approve job card
- Convert job card to repair order
- Create invoice from job card
- View invoice
- Send invoice
- Mark invoice paid
- Record manual payment
- Reserve part and reduce quantity
- Send customer follow-up
- Create job from vehicle
- Check in appointment
- Send appointment reminder
- Complete inspection
- Create estimate from inspection
- Approve/decline estimate
- Convert estimate to invoice
- Start/complete technician task
- Decode VIN using mock service
- Lookup DTC using mock service
- Connect/read/clear simulated scan tool
- Save diagnostic report to job card
- Switch mock user
- Invite mock user
- Change mock role
- Change mock subscription plan
- Export report
- Save settings
- Show toast feedback after actions

Important UI instructions:
- Do not create a marketing landing page.
- The first screen should be the actual app dashboard.
- Keep the design professional and operational, not playful.
- Keep the app useful on phone-sized screens.
- Keep unique colored icons for sidebar categories.
- Keep dense but readable tables and cards.
- Avoid nested cards.
- Avoid decorative gradients/orbs.

Deliverables:
1. A working Next.js TypeScript frontend app.
2. The Redlined1 dashboard loads at `/`.
3. All feature modules are accessible from the sidebar.
4. All current prototype actions work with local React state.
5. No real backend integrations yet.
6. Include a short README with:
   - how to run locally
   - what was converted
   - what remains for Phase 2

After implementation:
- Run `npm run build` if possible.
- Run `npm run lint` if available.
- Start the dev server and verify the main screens render.
- Stop after Phase 1 and summarize the file structure, completed work, and next steps.
```

## Follow-Up Prompt 1: If Claude Tries to Add Backend Too Early

```text
Pause backend work. For Phase 1, do not add Supabase, Prisma, database migrations, Stripe, OpenAI API, Twilio, SendGrid, or real auth.

Keep this phase frontend-only with mock data and local React state.

Focus on:
- component structure
- TypeScript types
- UI conversion
- responsive layout
- working mock actions
- clear service boundaries for future backend work
```

## Follow-Up Prompt 2: If Styling Changes Too Much

```text
The visual style changed too much. Please preserve the Redlined1 prototype design more closely.

Keep:
- dark left sidebar
- compact SaaS dashboard layout
- white operational panels
- status badges
- stat cards
- dense tables
- unique colored category icons
- responsive mobile horizontal nav
- professional automotive shop management feel

Do not redesign it as a marketing site.
```

## Follow-Up Prompt 3: If Buttons Do Not Work

```text
Many buttons are still decorative. Please wire every Phase 1 button to local React state.

At minimum, these must work:
- Create job card
- Approve job card
- Convert job card to RO
- Create invoice
- Send invoice
- Mark invoice paid
- Record payment
- Reserve part
- Complete inspection
- Create estimate from inspection
- Approve estimate
- Convert estimate to invoice
- Start/complete technician task
- Decode VIN
- Lookup DTC
- Connect/read/clear scan tool
- Save diagnostic report
- Invite user
- Change role
- Change plan
- Save settings

Every action should show toast feedback and update visible data.
```

## Follow-Up Prompt 4: If TypeScript Is Messy

```text
Please clean up the TypeScript model.

Create clear interfaces/types in `lib/types.ts` for:
- User
- Shop
- Plan
- Customer
- Vehicle
- Appointment
- JobCard
- Inspection
- Estimate
- RepairOrder
- Invoice
- Payment
- Part
- Message
- DiagnosticSession
- TechnicianTask
- AiSuggestion
- AuditLog

Use these types across mock data, components, and action handlers.
```

## Follow-Up Prompt 5: If File Structure Is Too Large

```text
The file structure is too fragmented. Keep it professional but manageable.

You may consolidate small shared components, but keep each major feature module separate:
- Dashboard
- Access
- Subscriptions
- AI
- Customers
- Vehicles
- Job Cards
- Scheduling
- Inspections
- Communication
- Estimates
- Repair Orders
- Invoices
- Payments
- Parts
- Technicians
- VIN
- DTC
- Diagnostics
- Reports
- Settings
```

## Phase 1 Acceptance Criteria

The Phase 1 conversion is complete only if:

- `npm run dev` starts the Next.js app.
- The app loads at `/`.
- The first screen is the Redlined1 dashboard.
- Sidebar navigation works.
- All modules render.
- Main buttons mutate local React state.
- Toast feedback appears after actions.
- Mobile layout is usable.
- Build succeeds or errors are clearly documented.
- No real backend dependencies are required.

## Phase 2 Prompt Preview

Do not use this until Phase 1 is complete.

```text
Now begin Phase 2 for Redlined1.

Add Supabase PostgreSQL and real authentication.

Use the MVP database schema document as the source of truth.

Phase 2 scope:
- Supabase project setup notes
- SQL migration files
- Supabase Auth integration
- users, shops, shop_users, plans, plan_features, subscriptions tables
- server-side role checks
- subscription-aware feature-gating helper
- keep existing frontend mock screens, but begin replacing mock auth/subscription data with Supabase data

Do not add Stripe yet. Stripe is Phase 3.
```

## Phase 3 Prompt Preview

```text
Begin Phase 3 for Redlined1.

Add Stripe Billing for Free, Starter, Pro, and Enterprise plans.

Scope:
- Stripe products/prices setup guide
- checkout session creation
- customer portal
- webhook handler
- subscriptions table updates
- feature gating based on active plan
- free plan limits

Keep all paid feature checks server-side.
```

## Recommended Claude Code Working Style

Ask Claude Code to work in phases:

1. Convert UI to Next.js.
2. Add TypeScript types and mock state.
3. Wire actions.
4. Verify responsive design.
5. Build and lint.
6. Stop and summarize.

Do not ask Claude Code to build the full production SaaS in one pass.

