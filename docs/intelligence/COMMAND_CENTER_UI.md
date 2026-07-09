# Command Center UI

## Location

Sidebar → **Command Center** (second nav item, below Dashboard).
Owner and Manager only. Technicians are blocked at the route level and in `TECHNICIAN_BLOCKED`.

## Feature Flags

| Flag | Effect when OFF |
|---|---|
| `recommendation_engine` | Shows "Command Center is not enabled" message |
| `intelligence_bus` | Tables may not exist — shows migration message |
| `command_center` | Not yet wired to UI gate (tables gate is sufficient for now) |

## Sections

### 1. Shop Health Score
0–100 score computed deterministically from open recommendations and signals:
- −15 per critical recommendation
- −8 per high recommendation
- −5 per stuck repair order
- −3 per overdue invoice
- −2 per low-inventory item (max −10)

Color: green ≥ 80, amber ≥ 55, red < 55.

### 2. Top Priorities
Top 5 recommendations sorted by priority (critical → high → medium → low).
Each card shows: icon, title, priority badge, description, reason, estimated revenue, confidence.
Actions: **Done** (marks complete) / **Dismiss**.

### 3. Revenue Opportunities
- Unpaid invoice count
- Stale estimate count
- Completed jobs not invoiced
- Revenue today

### 4. Operations Risks
- Stuck repair orders
- Low inventory items
- Overdue invoices
- Open job cards
- Repair cases created today

### 5. Live Signals Panel
6 signal tiles: revenue today, payments today, open jobs, stale estimates, low inventory, repair cases today.

### 6. Refresh Intelligence Button
Calls `POST /api/intelligence/recommendations` then reloads both recommendations and signals.

## Safe States

| Condition | What user sees |
|---|---|
| Tables not migrated | "Intelligence Bus tables are not active yet." |
| Flag disabled | "Command Center is not enabled." |
| Technician role | "Command Center is only available to owners and managers." |
| No recommendations | "Your shop is clear. No urgent recommendations right now." |
| API error | Error message banner at bottom |

## Access Control

- Component-level: checks `role` from `useShop()` — renders `DisabledState` for non-owner/manager
- Route-level: `command-center` added to `TECHNICIAN_BLOCKED` in `lib/useShop.ts`
- API-level: all three intelligence API routes enforce owner/manager role server-side

## API Routes Used

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/intelligence/recommendations` | Load open recommendations |
| POST | `/api/intelligence/recommendations` | Generate fresh recommendations |
| PATCH | `/api/intelligence/recommendations` | Complete or dismiss a recommendation |
| GET | `/api/intelligence/signals` | Load live signals |
