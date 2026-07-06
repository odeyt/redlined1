# Redlined1 — Smoke Test Plan

Run this after every production deploy and on staging before promoting to production.

**Tester:** D1 Imports owner or lead engineer
**Duration:** ~15 minutes
**Environment:** Run once on staging, once on production after deploy

---

## Test Accounts Required

- Owner account (full access)
- One technician account (limited access — for gate tests)

---

## Smoke Tests

### 1. Login
| Step | Action | Expected Result |
|---|---|---|
| 1.1 | Navigate to `redlined1.com` | Redirected to login page |
| 1.2 | Enter valid owner credentials | Redirected to dashboard |
| 1.3 | Confirm shop name shows in header | Shop name visible |
| 1.4 | All nav items visible for owner | No missing modules |

**Status:** ☐ Pass ☐ Fail

---

### 2. Switch Shop (if multi-location)
| Step | Action | Expected Result |
|---|---|---|
| 2.1 | Click shop switcher in header/sidebar | Shop list appears |
| 2.2 | Select alternate shop | Page reloads with new shop context |
| 2.3 | Confirm correct shop name shown | Correct shop displayed |

**Status:** ☐ Pass ☐ Fail ☐ N/A (single location)

---

### 3. Create Customer
| Step | Action | Expected Result |
|---|---|---|
| 3.1 | Navigate to Customers | Customer list loads |
| 3.2 | Click "+ New Customer" | Form opens |
| 3.3 | Fill in name, phone | Fields accept input |
| 3.4 | Save | Customer appears in list |

**Status:** ☐ Pass ☐ Fail

---

### 4. Create Vehicle
| Step | Action | Expected Result |
|---|---|---|
| 4.1 | Navigate to Vehicles | Vehicle list loads |
| 4.2 | Click "+ Add Vehicle" | Form opens |
| 4.3 | Fill in year, make, model | Fields accept input |
| 4.4 | Save | Vehicle appears in list |

**Status:** ☐ Pass ☐ Fail

---

### 5. Create Job Card
| Step | Action | Expected Result |
|---|---|---|
| 5.1 | Navigate to Job Cards | Job card list loads |
| 5.2 | Click "+ New Job Card" | Modal/form opens |
| 5.3 | Select customer and vehicle | Dropdowns populated |
| 5.4 | Enter complaint | Text accepted |
| 5.5 | Save | Job card appears in list with correct status |

**Status:** ☐ Pass ☐ Fail

---

### 6. Create Estimate
| Step | Action | Expected Result |
|---|---|---|
| 6.1 | Navigate to Estimates | Estimates list loads |
| 6.2 | Create new estimate | Form opens |
| 6.3 | Add labor and parts lines | Line items calculate correctly |
| 6.4 | Save | Estimate appears in list with total |

**Status:** ☐ Pass ☐ Fail

---

### 7. Convert to Repair Order
| Step | Action | Expected Result |
|---|---|---|
| 7.1 | Open an estimate | Estimate detail view opens |
| 7.2 | Click "Convert to Repair Order" | Repair order created |
| 7.3 | Navigate to Repair Orders | New repair order visible |

**Status:** ☐ Pass ☐ Fail

---

### 8. Create Invoice
| Step | Action | Expected Result |
|---|---|---|
| 8.1 | Navigate to Invoices | Invoice list loads |
| 8.2 | Create new invoice | Form opens |
| 8.3 | Add line items | Totals calculate correctly |
| 8.4 | Save | Invoice appears with correct total |

**Status:** ☐ Pass ☐ Fail

---

### 9. Record Payment
| Step | Action | Expected Result |
|---|---|---|
| 9.1 | Navigate to Payments | Payments list loads |
| 9.2 | Record payment on an invoice | Payment form opens |
| 9.3 | Enter amount and method | Form accepts input |
| 9.4 | Save | Invoice marked as paid |

**Status:** ☐ Pass ☐ Fail

---

### 10. Repair Intelligence
| Step | Action | Expected Result |
|---|---|---|
| 10.1 | Navigate to Repair Intelligence | Module loads without error |
| 10.2 | Search for a DTC or symptom | Results appear |
| 10.3 | No console errors | Browser console clean |

**Status:** ☐ Pass ☐ Fail

---

### 11. Feature Flags Panel (Owner Only)
| Step | Action | Expected Result |
|---|---|---|
| 11.1 | Navigate to Settings | Settings page loads |
| 11.2 | Scroll to "Feature Flags" section | Panel visible |
| 11.3 | Confirm 10 flags listed | All 10 flags show |
| 11.4 | Toggle one flag on | Toggle turns green, persists on refresh |
| 11.5 | Toggle same flag off | Toggle turns grey, persists on refresh |

**Status:** ☐ Pass ☐ Fail

---

### 12. Technician Access Gates (with technician account)
| Step | Action | Expected Result |
|---|---|---|
| 12.1 | Log in as technician | Dashboard loads |
| 12.2 | Confirm Settings not visible in nav | Settings hidden |
| 12.3 | Confirm Invoices not visible in nav | Invoices hidden |
| 12.4 | Job Cards visible | Job Cards accessible |

**Status:** ☐ Pass ☐ Fail

---

### 13. Logout
| Step | Action | Expected Result |
|---|---|---|
| 13.1 | Click logout | Redirected to login page |
| 13.2 | Try to navigate to dashboard directly | Redirected back to login |

**Status:** ☐ Pass ☐ Fail

---

## Result Summary

| # | Test | Status |
|---|---|---|
| 1 | Login | ☐ |
| 2 | Switch Shop | ☐ |
| 3 | Create Customer | ☐ |
| 4 | Create Vehicle | ☐ |
| 5 | Create Job Card | ☐ |
| 6 | Create Estimate | ☐ |
| 7 | Convert to Repair Order | ☐ |
| 8 | Create Invoice | ☐ |
| 9 | Record Payment | ☐ |
| 10 | Repair Intelligence | ☐ |
| 11 | Feature Flags Panel | ☐ |
| 12 | Technician Access Gates | ☐ |
| 13 | Logout | ☐ |

**Tested by:** ___________________
**Date:** ___________________
**Environment:** ☐ Staging ☐ Production
**Overall:** ☐ PASS — safe to promote/release ☐ FAIL — do not promote
