# Redlined1 MVP Feature Design and Database Schema

## 1. Product Summary

**Product name:** Redlined1

**Goal:** A SaaS CRM and shop operations platform for automotive repair shops, mobile mechanics, parts sellers, fleet service companies, and multi-location service businesses.

The MVP should help a shop manage the full service workflow:

Lead or appointment -> customer -> vehicle -> job card -> inspection -> estimate -> approval -> repair order -> parts/labor -> invoice -> payment -> follow-up.

## 2. Target Users

- Solo mobile mechanic
- Small repair shop owner
- Service advisor
- Technician
- Parts counter staff
- Fleet service manager
- Multi-location shop administrator
- Company owner / operator

## 3. MVP Feature Scope

### 3.1 Authentication and User Login

MVP features:

- Email/password login
- Password reset
- User invitation
- Shop/team account creation
- Role-based access control
- Subscription-aware feature access
- Session management

Recommended roles:

- Owner
- Admin
- Service Advisor
- Technician
- Parts Manager
- Accountant
- Read-only Staff

### 3.2 Customer CRM

MVP features:

- Create and edit customers
- Customer type: retail, fleet, dealer, wholesale, insurance
- Contact info
- Notes and tags
- Communication history
- Linked vehicles
- Linked job cards, estimates, invoices, and payments

### 3.3 Vehicle Management

MVP features:

- Vehicle profile
- VIN
- Year, make, model, trim
- Mileage
- Plate
- Customer ownership
- Service history
- Diagnostics history

### 3.4 Scheduling

MVP features:

- Appointment list/calendar
- Bay or mobile route assignment
- Technician assignment
- Status: Scheduled, Confirmed, Checked In, No Show, Completed, Cancelled
- Reminder status
- Convert appointment to job card

### 3.5 Job Cards

Job cards should be the core workflow object.

MVP features:

- Create job card from customer, vehicle, appointment, or mobile request
- Assign technician
- Track service location
- Track mobile route or shop bay
- Track workflow status
- Link inspection, estimate, repair order, parts, labor, invoice, payment, and messages

Suggested statuses:

- Booked
- Dispatched
- Checked In
- Inspection
- Awaiting Approval
- Approved
- In Progress
- Waiting on Parts
- Ready to Invoice
- Invoiced
- Paid
- Completed
- Cancelled

### 3.6 Digital Inspections

MVP features:

- Inspection checklist
- Pass / Attention / Fail results
- Technician notes
- Photo placeholders
- Customer-visible findings
- Convert inspection findings to estimate lines

### 3.7 Estimates

MVP features:

- Estimate header
- Labor lines
- Parts lines
- Fees
- Tax
- Discount
- Customer approval status
- Approve / decline estimate
- Convert approved estimate to repair order and/or invoice

Suggested statuses:

- Draft
- Sent
- Viewed
- Pending Approval
- Approved
- Partially Approved
- Declined
- Expired
- Converted

### 3.8 Repair Orders

MVP features:

- Complaint / concern
- Cause
- Correction
- Technician assignment
- Labor lines
- Parts lines
- Internal notes
- Customer-facing notes
- Link to job card and estimate

### 3.9 Parts Inventory

MVP features:

- Part number
- Brand
- Description
- Category
- Cost
- Retail price
- Quantity on hand
- Supplier
- Bin/location
- Low stock threshold
- Reserve parts to job card
- Sell parts on invoice

### 3.10 Invoicing

MVP features:

- Invoice from job card or estimate
- Labor lines
- Parts lines
- Fees
- Discounts
- Tax
- Payment status
- Send invoice/payment link placeholder
- Mark paid
- Print/download placeholder

Suggested statuses:

- Draft
- Sent
- Viewed
- Partially Paid
- Paid
- Overdue
- Void

### 3.11 Payments

MVP features:

- Manual payment recording
- Payment method
- Paid date
- Balance due
- Link payment to invoice

Future:

- Stripe integration
- ACH
- Card terminal
- Deposits
- Partial payments

### 3.12 Customer Communication

MVP features:

- SMS/email log
- Estimate approval message
- Invoice payment message
- Appointment reminder
- Follow-up message
- Status tracking: Draft, Queued, Sent, Failed

Future:

- Twilio
- SendGrid
- WhatsApp
- Two-way texting

### 3.13 VIN Decoding

MVP features:

- VIN input
- Mock decode result
- Save decoded data to vehicle

Future:

- NHTSA VIN API
- Paid VIN provider
- OEM build data

### 3.14 DTC Lookup

MVP features:

- Search diagnostic trouble code
- Show description, category, causes, severity, inspection steps
- Save DTC note to job card

Future:

- OEM service info
- Paid DTC database
- AI diagnostic assistant

### 3.15 Scan Tool Diagnostic Interface

MVP features:

- Simulated connection
- Read mock trouble codes
- Clear mock codes
- Live data cards
- Save diagnostic report to job card

Future:

- Bluetooth OBD-II
- J2534
- Backend diagnostic gateway
- Real-time telematics

### 3.16 Technician Workflow

MVP features:

- Assigned tasks
- Start task
- Complete task
- Log labor time
- Link task to job card
- Link task to inspection or repair order

### 3.17 AI Features

MVP AI should be lightweight and controlled.

MVP features:

- AI estimate draft
- AI customer message draft
- AI DTC plain-language explanation
- AI invoice audit
- AI job triage suggestion

Important: AI should draft and suggest only. A human should approve messages, estimates, invoices, and customer-facing notes.

### 3.18 Reporting

MVP features:

- Revenue summary
- Open invoices
- Job card status report
- Technician productivity
- Low stock parts
- Common DTCs
- Fleet account activity

## 4. Free vs Paid Subscription Strategy

You plan to offer the MVP free with restrictions. Recommended plan structure:

### Free Plan

Best for solo trial users.

Limits:

- 1 shop/location
- 1 owner user
- 1 technician user
- Up to 25 customers
- Up to 25 vehicles
- Up to 20 job cards per month
- Up to 10 invoices per month
- Manual payments only
- Mock VIN decode only
- Mock DTC lookup only
- Simulated scan tool only
- Basic scheduling
- Basic customer CRM
- No AI or very limited AI credits
- No multi-location
- No fleet accounts
- No custom branding
- No API integrations

### Starter Paid Plan

For solo mobile mechanics and small shops.

Includes:

- More customers and vehicles
- More job cards and invoices
- Digital inspections
- Estimate approvals
- Customer communication templates
- Basic AI assistant
- Basic reports

### Pro Paid Plan

For growing shops.

Includes:

- Multiple users
- Technician workflow
- Parts inventory
- Advanced invoicing
- SMS/email integrations
- VIN provider integration
- DTC provider integration
- Payment integration
- Advanced reports

### Business / Enterprise Plan

For multi-location shops and fleet service companies.

Includes:

- Multi-location
- Fleet accounts
- Role permissions
- PO approval rules
- SLA tracking
- Advanced AI
- API access
- Audit logs
- Custom branding
- Priority support

## 5. Feature Gating Model

Use feature flags and plan limits.

Examples:

- `max_users`
- `max_locations`
- `max_customers`
- `max_vehicles`
- `max_job_cards_per_month`
- `max_invoices_per_month`
- `can_use_ai`
- `ai_credits_per_month`
- `can_use_digital_inspections`
- `can_use_parts_inventory`
- `can_use_sms`
- `can_use_payments`
- `can_use_multi_location`
- `can_use_fleet_accounts`
- `can_use_real_vin_api`
- `can_use_real_dtc_api`
- `can_use_scan_tool_integration`
- `can_export_reports`

## 6. Database Options

### Option A: PostgreSQL

Recommended for this SaaS.

Why:

- Best fit for relational business data
- Strong support for multi-tenant SaaS
- Great with Prisma, Drizzle, Supabase, Neon, Railway, Render, AWS RDS
- Handles complex relationships well
- Good reporting queries

Best choice if building a serious SaaS product.

### Option B: Supabase

Recommended if you want faster MVP speed.

Why:

- PostgreSQL included
- Authentication included
- Row-level security
- Storage for inspection photos
- Edge functions
- Realtime features

Best choice if you want to launch quickly with less backend work.

### Option C: Firebase / Firestore

Good for rapid development, less ideal for complex shop operations.

Pros:

- Fast auth setup
- Realtime features
- Easy frontend integration

Cons:

- More difficult relational reporting
- Harder invoice/job/parts relational queries
- Can get expensive or messy as business logic grows

### Option D: MySQL

Acceptable, but PostgreSQL is usually better for this SaaS.

### Recommendation

Use **PostgreSQL**.

If you want the fastest MVP path, use **Supabase PostgreSQL + Supabase Auth**.

If you want a more custom backend, use **PostgreSQL + Prisma + Next.js/NestJS + Stripe Billing**.

## 7. Authentication and Access Control

Recommended auth model:

- Users belong to one or more shops.
- Shops belong to a subscription plan.
- Users have roles inside shops.
- Permissions are checked by role and subscription feature flags.

Important tables:

- users
- shops
- shop_users
- roles
- permissions
- subscriptions
- plans
- plan_features

Login options:

- Supabase Auth
- Clerk
- Auth0
- Firebase Auth
- NextAuth/Auth.js

Recommendation:

- For fast MVP: Supabase Auth or Clerk
- For custom SaaS: Auth.js with PostgreSQL adapter

## 8. Suggested Database Schema

Below is a practical PostgreSQL-style schema.

### 8.1 Core SaaS Tables

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE shops (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  business_type TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_rate NUMERIC(6,4) DEFAULT 0,
  labor_rate NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE shop_locations (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- shop, mobile_route, warehouse, fleet_depot
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE shop_users (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(shop_id, user_id)
);
```

### 8.2 Subscription Tables

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE plan_features (
  id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(id),
  feature_key TEXT NOT NULL,
  feature_value TEXT NOT NULL,
  UNIQUE(plan_id, feature_key)
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL, -- free, trialing, active, past_due, canceled
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  external_customer_id TEXT,
  external_subscription_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 8.3 CRM and Vehicle Tables

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_type TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  vin TEXT,
  year INT,
  make TEXT,
  model TEXT,
  trim TEXT,
  engine TEXT,
  transmission TEXT,
  drivetrain TEXT,
  mileage INT,
  license_plate TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 8.4 Scheduling and Job Cards

```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_id UUID REFERENCES customers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  location_id UUID REFERENCES shop_locations(id),
  assigned_user_id UUID REFERENCES users(id),
  scheduled_start TIMESTAMP NOT NULL,
  scheduled_end TIMESTAMP,
  service_requested TEXT,
  status TEXT NOT NULL,
  reminder_status TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE job_cards (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  appointment_id UUID REFERENCES appointments(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  location_id UUID REFERENCES shop_locations(id),
  assigned_user_id UUID REFERENCES users(id),
  job_number TEXT NOT NULL,
  service_type TEXT,
  channel TEXT, -- shop, mobile, fleet, dealer, wholesale
  status TEXT NOT NULL,
  priority TEXT,
  approval_status TEXT,
  customer_complaint TEXT,
  internal_notes TEXT,
  customer_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(shop_id, job_number)
);
```

### 8.5 Digital Inspections

```sql
CREATE TABLE inspections (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  job_card_id UUID NOT NULL REFERENCES job_cards(id),
  technician_id UUID REFERENCES users(id),
  status TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP
);

CREATE TABLE inspection_items (
  id UUID PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES inspections(id),
  category TEXT,
  item_name TEXT NOT NULL,
  result TEXT NOT NULL, -- pass, attention, fail, pending
  notes TEXT,
  photo_url TEXT,
  sort_order INT DEFAULT 0
);
```

### 8.6 Estimates

```sql
CREATE TABLE estimates (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  job_card_id UUID NOT NULL REFERENCES job_cards(id),
  estimate_number TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  sent_at TIMESTAMP,
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(shop_id, estimate_number)
);

CREATE TABLE estimate_lines (
  id UUID PRIMARY KEY,
  estimate_id UUID NOT NULL REFERENCES estimates(id),
  line_type TEXT NOT NULL, -- labor, part, fee, discount
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0
);
```

### 8.7 Repair Orders and Technician Workflow

```sql
CREATE TABLE repair_orders (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  job_card_id UUID NOT NULL REFERENCES job_cards(id),
  ro_number TEXT NOT NULL,
  status TEXT NOT NULL,
  complaint TEXT,
  cause TEXT,
  correction TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  UNIQUE(shop_id, ro_number)
);

CREATE TABLE technician_tasks (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  job_card_id UUID NOT NULL REFERENCES job_cards(id),
  repair_order_id UUID REFERENCES repair_orders(id),
  technician_id UUID REFERENCES users(id),
  task_name TEXT NOT NULL,
  status TEXT NOT NULL,
  labor_hours NUMERIC(10,2) DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### 8.8 Parts Inventory

```sql
CREATE TABLE parts (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  part_number TEXT NOT NULL,
  brand TEXT,
  description TEXT NOT NULL,
  category TEXT,
  cost NUMERIC(10,2) DEFAULT 0,
  retail_price NUMERIC(10,2) DEFAULT 0,
  supplier TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(shop_id, part_number)
);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  part_id UUID NOT NULL REFERENCES parts(id),
  location_id UUID REFERENCES shop_locations(id),
  quantity_on_hand INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 0,
  bin_location TEXT
);

CREATE TABLE part_transactions (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  part_id UUID NOT NULL REFERENCES parts(id),
  job_card_id UUID REFERENCES job_cards(id),
  transaction_type TEXT NOT NULL, -- receive, reserve, use, return, adjust, sell
  quantity INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 8.9 Invoices and Payments

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  job_card_id UUID REFERENCES job_cards(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  shop_supplies NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date DATE,
  sent_at TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(shop_id, invoice_number)
);

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  line_type TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  external_payment_id TEXT,
  paid_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 8.10 Communication

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  customer_id UUID REFERENCES customers(id),
  job_card_id UUID REFERENCES job_cards(id),
  invoice_id UUID REFERENCES invoices(id),
  channel TEXT NOT NULL, -- sms, email, whatsapp
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 8.11 Diagnostics, VIN, DTC, and AI

```sql
CREATE TABLE diagnostic_sessions (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  job_card_id UUID REFERENCES job_cards(id),
  vehicle_id UUID REFERENCES vehicles(id),
  technician_id UUID REFERENCES users(id),
  source TEXT NOT NULL, -- simulated, obd, j2534, api
  status TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE dtc_records (
  id UUID PRIMARY KEY,
  diagnostic_session_id UUID NOT NULL REFERENCES diagnostic_sessions(id),
  code TEXT NOT NULL,
  category TEXT,
  description TEXT,
  severity TEXT,
  common_causes TEXT,
  inspection_steps TEXT
);

CREATE TABLE ai_suggestions (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  related_type TEXT NOT NULL, -- job_card, estimate, invoice, dtc, message
  related_id UUID,
  suggestion_type TEXT NOT NULL,
  prompt TEXT,
  output TEXT NOT NULL,
  status TEXT NOT NULL, -- draft, accepted, edited, rejected
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 8.12 Audit Logs

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

## 9. MVP Build Recommendation

Best stack for the MVP:

- Frontend: React or Next.js
- Backend: Next.js API routes, NestJS, or Express
- Database: PostgreSQL
- ORM: Prisma or Drizzle
- Auth: Supabase Auth, Clerk, or Auth.js
- Billing: Stripe
- File storage: Supabase Storage or S3
- AI: OpenAI API with strict human approval workflow

Fastest practical MVP path:

**Next.js + Supabase PostgreSQL + Supabase Auth + Stripe Billing + OpenAI API**

## 10. MVP Priority Build Order

1. Authentication, shops, users, roles
2. Subscription plans and feature gating
3. Customers and vehicles
4. Scheduling and job cards
5. Digital inspections
6. Estimates
7. Repair orders and technician workflow
8. Parts inventory
9. Invoices and manual payments
10. Customer communication
11. VIN/DTC mock services
12. AI drafting and audit logs
13. Reports
