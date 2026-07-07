# Business Continuity Plan — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07  
**Business:** D1 Imports — Auto Parts Sale & Services

---

## Purpose

Ensure D1 Imports can continue operating during a RedlineD1 outage.
This plan covers both technical recovery and manual business continuity.

---

## Critical Business Functions

| Function | RedlineD1 Dependent | Manual Alternative |
|----------|--------------------|--------------------|
| Customer intake | Yes | Paper intake form |
| Job card creation | Yes | Paper RO form |
| Vehicle lookup | Yes | Manual VIN notation |
| Estimates | Yes | Manual quote form |
| Invoicing | Yes | Manual invoice book |
| Payment recording | Yes | POS / receipt book |
| Appointment scheduling | Yes | Phone + paper calendar |
| Parts ordering | Yes | Call supplier directly |

---

## Outage Response by Duration

### Outage < 15 minutes
- No action required
- Monitor status pages
- Platform team investigating

### Outage 15 minutes – 1 hour
- Begin manual paper fallback for active jobs
- Notify technicians and advisors of outage
- Platform team executing recovery procedure

### Outage 1–4 hours
- Full paper-based operations
- Capture all transactions on paper
- Prioritize invoicing for customers waiting to pay
- Platform team escalating to vendor support

### Outage > 4 hours
- Owner decision: deploy to emergency host or wait
- All manual records must be entered into system after recovery
- Contact Supabase / Vercel support with escalation

---

## Manual Fallback Forms

The following should be available at the shop at all times:

- [ ] Customer intake form (name, phone, vehicle)
- [ ] Job card / repair order template
- [ ] Estimate form with labor rate + parts
- [ ] Invoice template
- [ ] Payment receipt book

**Recommendation:** Print 25 copies of each and store in front desk drawer.

---

## Data Entry After Recovery

When the system comes back online after a manual fallback period:

1. Enter all paper job cards as new job cards in RedlineD1
2. Match customers to existing records (search by phone)
3. Mark invoices as paid if payment was collected during outage
4. Review appointment calendar for any double-bookings

Allow 1 hour of data entry per 4 hours of outage.

---

## Communication Plan

| Audience | Channel | Message |
|----------|---------|---------|
| Technicians | In-person | System is down, use paper forms |
| Service advisors | In-person | Follow manual intake procedure |
| Customers waiting | In-person | Brief delay, we're handling manually |
| Customers with appointments | Phone/text | Confirm appointment manually |

---

## Recovery Readiness Contacts

| Service | Contact | URL |
|---------|---------|-----|
| Supabase Support | support@supabase.io | status.supabase.com |
| Vercel Support | vercel.com/help | vercel-status.com |
| Domain (Namecheap) | namecheap.com/support | — |
| Email (Resend) | resend.com/support | — |
| Payments (Creem) | creem.io | — |

---

## RPO / RTO Commitment

| Metric | Target | Achieved By |
|--------|--------|-------------|
| RPO | < 15 min | Supabase PITR (WAL archiving) |
| RTO | < 10 min | Vercel instant rollback + PITR |
| Manual fallback | Immediate | Paper forms at desk |
| Full rebuild | < 30 min | Git + Supabase + Vercel |
