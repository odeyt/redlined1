# Redlined1 — Phase 1

Automotive CRM and shop operations SaaS frontend. Next.js App Router + TypeScript, mock data only.

## How to Run Locally

```bash
cd C:\Users\wallyd1\REDLINE
npm install
npm run dev
```

Opens at **http://localhost:3000**. The Redlined1 dashboard loads immediately — no login required in Phase 1.

To run on a different port:

```bash
npm run dev -- -p 3001
```

## What Was Converted (Phase 1)

- **Project structure:** Full Next.js 15 App Router with TypeScript scaffolded from the static HTML/JS prototype
- **State management:** `lib/store.tsx` — React Context + `useReducer` replaces the prototype's single mutable `state` object. All 40+ actions from `bindModuleEvents()` are fully wired
- **Types:** `lib/types.ts` — TypeScript interfaces for every entity (User, Customer, Vehicle, JobCard, RepairOrder, Invoice, Payment, Part, Estimate, Inspection, TechnicianTask, Message, AuditLog, VinResult, DtcResult, Plan)
- **Mock data:** `lib/mock-data.ts` — All arrays and constants from `app.js` ported to typed exports
- **Services:** TypeScript versions of all 5 service files (VIN decoder, DTC lookup, scan tool, invoice calculator, parts inventory)
- **Shared components:** AppShell, Sidebar, Header, Icon, Badge, StatCard, Panel, Workflow, Toast
- **Feature modules (22 total):** Dashboard, Login & Roles, Plans & Gates, AI Copilot, Customers, Vehicles, Job Cards, Scheduling, Inspections, Communication, Estimates, Repair Orders, Invoices, Payments, Parts, Technician Workflow, VIN Decode, DTC Lookup, Diagnostics, Appointments, Reports, Settings
- **Styling:** Exact `styles.css` design preserved in `app/globals.css` — dark sidebar, compact SaaS layout, status badges, stat cards, dense tables, colored category icons, full mobile responsiveness

### Functional Actions Wired

Every button mutates React state via dispatch and shows toast feedback:

- Create / approve / convert job card → RO → invoice
- Mark invoice paid / send invoice / view invoice
- Record manual payment
- Reserve parts (decrements quantity)
- Complete inspection / create estimate from inspection
- Approve / decline / convert estimate to invoice
- Start / complete technician task
- Check in appointment / send reminder
- Send customer follow-up message
- Create job from vehicle record
- Invite user / change role / toggle user status
- Switch mock login user
- Apply subscription plan (updates feature gate meters)
- Decode VIN (mock service)
- Lookup DTC (mock service)
- Connect / read codes / clear codes (simulated scan tool)
- Save diagnostic report to job card
- Send AI draft / attach AI note
- Export report / save settings

## File Structure

```
app/
  globals.css          — All styles (ported from styles.css)
  layout.tsx
  page.tsx

components/
  AppShell.tsx         — Root shell with AppProvider + view router
  Sidebar.tsx          — Nav with colored category icons
  Header.tsx           — Topbar with search + global action buttons
  Icon.tsx             — SVG icon component + icon color map
  Badge.tsx            — Status badge with auto color logic
  StatCard.tsx
  Panel.tsx
  Workflow.tsx
  Toast.tsx

features/
  dashboard/           ai/          access/       subscriptions/
  customers/           vehicles/    job-cards/    scheduling/
  inspections/         communication/ estimates/  repair-orders/
  invoices/            payments/    parts/        technicians/
  vin/                 dtc/         diagnostics/  reports/
  settings/

lib/
  types.ts             — All TypeScript interfaces
  mock-data.ts         — All mock data arrays and constants
  store.tsx            — AppProvider, useAppState, useAppDispatch, appReducer

services/
  vinDecoderService.ts
  dtcLookupService.ts
  scanToolService.ts
  invoiceService.ts
  partsInventoryService.ts
```

## Phase 2 (Next)

Add Supabase PostgreSQL + real authentication:
- Supabase project setup
- SQL migration files from the MVP schema doc
- Supabase Auth replacing mock login
- `users`, `shops`, `shop_users`, `plans`, `plan_features`, `subscriptions` tables
- Server-side role checks
- Subscription-aware feature-gating helper
- Keep frontend mock screens, replace mock auth/subscription data with real Supabase data

## Phase 3 (After Phase 2)

Add Stripe Billing for Free / Starter / Pro / Enterprise plans.
