# Job Archive — Test Procedures
**Redlined1 · D1 Imports**
Date: 2026-06-20

---

## Prerequisites
- At least one Job Card exists with status **Complete**, **Closed**, or **Invoiced**
- Logged in as **Owner** or **Manager** (Technician role does not see Job Archive)

---

## Test 1 — Page Loads Without Error

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Job Archive** in sidebar | Page loads, no red error text |
| 2 | Confirm header shows "Job Archive" | Subtitle: "Permanent record of all completed, closed, and invoiced jobs" |
| 3 | Confirm 4 stat cards visible | Archived Jobs · Avg Days to Close · Total Labor Hours · Total Parts Value |

**Pass criteria:** No "column does not exist" error. Stats show numbers (may be 0 if no closed jobs).

---

## Test 2 — Jobs Appear When Status is Correct

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to **Job Cards**, open an existing job | Note the job card number |
| 2 | Change status to **Complete** or **Closed** | Status badge updates |
| 3 | Go to **Job Archive** | That job now appears in the table |
| 4 | Confirm columns: Customer, Vehicle, Technician(s), Status, Check-In, Closed, Days, Labor h, RO/Invoice |

**Pass criteria:** Job appears within one page reload. All columns populated or show "—".

---

## Test 3 — Period Filter

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **This Month** | Only jobs closed this calendar month shown |
| 2 | Click **This Quarter** | Jobs from current quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) |
| 3 | Click **This Year** | All jobs closed in current year |
| 4 | Click **All Time** | All archived jobs regardless of date |
| 5 | Confirm counter "X of Y jobs" updates with each filter | |

**Pass criteria:** Job counts change correctly with each period filter.

---

## Test 4 — Search

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type a customer name in the search box | Only rows with that customer shown |
| 2 | Clear and type a vehicle name | Only matching vehicles shown |
| 3 | Clear and type a technician name | Rows with that technician shown |
| 4 | Clear and type an RO number | Matching RO row shown |
| 5 | Clear and type an invoice number | Matching invoice row shown |
| 6 | Type gibberish | "No jobs match your current filter" message shown |

**Pass criteria:** Search filters correctly across all 5 fields.

---

## Test 5 — Row Expand (Details Panel)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click any row in the table | Row expands, ▼ arrow changes to ▲ |
| 2 | Confirm 3-column detail panel: Job Details · Timeline · Financials & References | All sections visible |
| 3 | Verify Job Details shows: Customer, Vehicle, Service Type, Notes (if any) | Correct data |
| 4 | Verify Timeline shows: Check-In date, Closed date, Total Days, Technicians | Correct data |
| 5 | Verify Financials shows: Labor Hours, Parts Total, RO #, Invoice #, Status badge | Correct data |
| 6 | Click the row again | Row collapses back |
| 7 | Click a different row while one is open | Previous row closes, new row opens |

**Pass criteria:** Expand/collapse works. No data shows as "—" that should have a value.

---

## Test 6 — Summary Stats Update with Filter

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With **All Time** selected, note all 4 stat card values | Record numbers |
| 2 | Switch to **This Month** | Stats recalculate for filtered subset |
| 3 | Type a customer name in search | Stats recalculate again for that subset |
| 4 | Avg Days to Close: green if ≤3 days, amber if 4–7, red if 8+ | Color coding correct |

**Pass criteria:** Stats always reflect the current filtered set, not total database count.

---

## Test 7 — Export CSV

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With jobs visible, click **⬇ Export CSV** | File downloads immediately |
| 2 | Open the CSV in Excel or Google Sheets | 12 columns: Customer, Vehicle, Technicians, Status, Service Type, Check-In, Closed, Days, Labor h, Parts $, RO #, Invoice # |
| 3 | Confirm row count matches filtered count on screen | |
| 4 | Switch to **This Month** filter, export again | CSV contains only this month's jobs |
| 5 | With no jobs showing (e.g. "This Month" and 0 jobs), confirm Export CSV button is disabled | Button greyed out |

**Pass criteria:** CSV downloads, correct columns, correct row count, respects active filter.

---

## Test 8 — Status Badge Colors

| Status | Expected Color |
|--------|---------------|
| Complete | Green |
| Closed | Green |
| Invoiced | Blue |

---

## Test 9 — Days Open Color Coding

| Days Open | Expected Color |
|-----------|---------------|
| 0–3 days | Default (white/black) |
| 4–7 days | Amber / orange |
| 8+ days | Red |

---

## Test 10 — Feature Toggle (Settings)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Go to **Settings → Portal Customization → Feature Toggles** | "Job Archive" toggle visible |
| 2 | Toggle **Job Archive** OFF, click Save | Sidebar no longer shows "Job Archive" item |
| 3 | Toggle it back ON, click Save | Sidebar shows "Job Archive" again |

**Pass criteria:** Toggle hides/shows the sidebar item without affecting data.

---

## Known Limitations
- Job Archive reads from `job_cards` table — jobs must have `status` set to Complete, Closed, or Invoiced to appear
- Labor hours and parts total come from the job card record directly; they do not pull from linked Repair Orders
- Period filter uses `closed_date` — jobs with no closed date are excluded from period filters but appear under All Time

---

## Bug Fixed (2026-06-20)
- **"column job_cards.repair_stage does not exist"** — `next_action` column was referenced in the SELECT query but does not exist in the database. Fixed by replacing with the `notes` column.
