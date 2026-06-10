# Redlined1 — Full Build Phase Procedures

---

## Phase 1: Convert Static Prototype to Next.js UI ✅ COMPLETE

**Status:** Done. See README.md for structure and run instructions.

**Deliverables completed:**
- Next.js 15 App Router + TypeScript
- 22 feature modules, all sidebar navigation works
- React Context + useReducer state management
- All 40+ prototype actions wired with toast feedback
- Mobile-responsive layout matching prototype design
- 5 typed mock service files
- Production build passes with zero errors

---

## Phase 2: Add Database Schema with Supabase / Postgres

**Goal:** Design and deploy the full relational schema. No app wiring yet — schema only.

### 2.1 Set Up Supabase Project

1. Go to https://supabase.com and create a new project
2. Choose a region close to your users
3. Save your project URL and anon/service role keys to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

4. Add `.env.local` to `.gitignore` — never commit credentials

### 2.2 Install Supabase Client

```bash
npm install @supabase/supabase-js
npm install @supabase/ssr
```

Create `lib/supabase/client.ts` (browser client) and `lib/supabase/server.ts` (server component client).

### 2.3 Write Migration Files

Create `supabase/migrations/` folder. Write one SQL file per table group.

**Core tables to create (in dependency order):**

```
plans
shops
users (extends Supabase auth.users)
shop_users
subscriptions
plan_features
customers
vehicles
job_cards
repair_orders
appointments
inspections
inspection_items
estimates
estimate_lines
invoices
invoice_lines
payments
parts
part_reservations
messages
technician_tasks
audit_logs
diagnostic_sessions
```

**Key schema rules:**
- Every table gets `id uuid primary key default gen_random_uuid()`
- Every table gets `created_at timestamptz default now()` and `updated_at timestamptz`
- All foreign keys reference `uuid` primary keys
- Use `shop_id uuid references shops(id)` on every tenant-owned table (multi-tenancy from day one)
- Enable Row Level Security (RLS) on every table
- Write RLS policies: users can only read/write rows where `shop_id = auth.jwt()->>'shop_id'`

**Reference:** `outputs/autoops-crm-mvp-feature-design-and-database-schema.md` has the full column list for each table.

### 2.4 Apply Migrations

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

Or paste each SQL file into the Supabase SQL editor manually.

### 2.5 Seed Mock Data

Create `supabase/seed.sql` with INSERT statements for:
- 1 demo shop
- 5 demo plans (Free, Starter, Pro, Enterprise, Pro Trial)
- 4 demo users
- Sample customers, vehicles, job cards, invoices (matches Phase 1 mock data)

### 2.6 Verify

- Open Supabase Table Editor and confirm all tables exist
- Run `select count(*) from customers;` in the SQL editor
- Confirm RLS is enabled on every table (shield icon in Table Editor)

**Phase 2 done when:** All tables exist in Supabase, RLS is on, seed data is present.

---

## Phase 3: Add Auth and Roles

**Goal:** Replace the mock login in `AccessView.tsx` with real Supabase Auth. Enforce roles.

### 3.1 Auth Flow

Install SSR helpers (already done in Phase 2):

```bash
npm install @supabase/ssr
```

Create:
- `middleware.ts` at project root — refreshes session on every request, redirects unauthenticated users to `/login`
- `app/login/page.tsx` — email/password login form using `supabase.auth.signInWithPassword()`
- `app/auth/callback/route.ts` — handles the OAuth/email confirm redirect

### 3.2 Session Handling

In `lib/supabase/server.ts`, use `createServerClient` from `@supabase/ssr` with cookie-based session storage.

In `middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Refresh session, redirect /login if no session
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}
```

### 3.3 Role Model

Roles live in `shop_users.role` (not in Supabase Auth metadata).

**Roles:** Owner, Admin, Service Advisor, Technician, Parts Manager, Accountant, Read-only Staff

After login, fetch the user's role from `shop_users` and store it in a React context or Next.js server layout.

Create `lib/auth.ts`:
- `getCurrentUser()` — returns user + role from the session
- `requireRole(role)` — throws/redirects if role is insufficient
- `hasPermission(user, action)` — permission check helper

### 3.4 Protect Pages

In `app/layout.tsx` (server component):

```typescript
const user = await getCurrentUser()
if (!user) redirect('/login')
```

Pass `user` + `role` down via a server-to-client boundary (React Server Component → Client Context).

### 3.5 Invite Flow

Replace mock `INVITE_USER` action with a real Supabase invite:

```typescript
await supabase.auth.admin.inviteUserByEmail(email)
// Then insert into shop_users with the role
```

This requires the service role key — call it from a Next.js Route Handler, never from the browser.

### 3.6 Password Reset

Use `supabase.auth.resetPasswordForEmail(email)` — Supabase sends the reset email.

**Phase 3 done when:** Real login works, sessions persist, middleware protects all routes, roles are enforced server-side.

---

## Phase 4: Add Real CRUD for Customers, Vehicles, Job Cards, Estimates, Invoices

**Goal:** Replace all mock data arrays in the store with live Supabase reads and writes.

### 4.1 Data Fetching Pattern

Use Next.js Server Components for initial page data (fast, no loading flicker):

```typescript
// app/customers/page.tsx (Server Component)
const { data: customers } = await supabase
  .from('customers')
  .select('*')
  .eq('shop_id', shopId)
  .order('created_at', { ascending: false })
```

Use React Query (`@tanstack/react-query`) for client-side mutations and cache invalidation:

```bash
npm install @tanstack/react-query
```

### 4.2 Route Handlers for Mutations

Create `app/api/` route handlers for all write operations. Never run service-role queries from the browser.

Example structure:
```
app/api/customers/route.ts         GET + POST
app/api/customers/[id]/route.ts    GET + PATCH + DELETE
app/api/job-cards/route.ts
app/api/job-cards/[id]/route.ts
app/api/job-cards/[id]/approve/route.ts
app/api/invoices/route.ts
app/api/invoices/[id]/send/route.ts
app/api/invoices/[id]/paid/route.ts
app/api/payments/route.ts
app/api/parts/[id]/reserve/route.ts
```

### 4.3 Replace Each Mock Data Source (in order)

Work through these one at a time. For each:
1. Add a `useQuery` hook that fetches from Supabase
2. Add `useMutation` hooks for create/update/delete
3. Remove the matching array from `lib/store.tsx`
4. Update the feature view to use the new hook

**Order (least risky first):**
1. `customers` — simple CRUD, no dependencies
2. `vehicles` — depends on customers
3. `parts` — simple CRUD
4. `job_cards` — depends on customers + vehicles
5. `repair_orders` — depends on job_cards
6. `inspections` + `inspection_items`
7. `estimates` + `estimate_lines`
8. `invoices` + `invoice_lines`
9. `payments`
10. `technician_tasks`
11. `appointments`
12. `messages`

### 4.4 Optimistic Updates

Use React Query's `onMutate` / `onError` / `onSettled` for optimistic UI — the table row updates instantly while the API call is in flight, and rolls back on error.

### 4.5 Real-time (Optional Enhancement)

Supabase supports Postgres LISTEN/NOTIFY via `supabase.channel()`. Subscribe to job_cards changes so the dashboard updates live when a technician changes a job status from a different device.

### 4.6 File Uploads (Inspection Photos)

Use Supabase Storage for inspection photos:

```typescript
const { data } = await supabase.storage
  .from('inspection-photos')
  .upload(`${shopId}/${jobCardId}/${filename}`, file)
```

**Phase 4 done when:** All five entities (customers, vehicles, job cards, estimates, invoices) read from and write to Supabase. Mock arrays removed from store.

---

## Phase 5: Add Stripe Subscriptions and Feature Gating

**Goal:** Charge for plans. Enforce limits server-side. Free users hit paywalls.

### 5.1 Stripe Setup

```bash
npm install stripe @stripe/stripe-js
```

Add to `.env.local`:
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 5.2 Create Products and Prices in Stripe Dashboard

| Plan | Price |
|---|---|
| Free | $0/month |
| Starter | $39/month |
| Pro | $99/month |
| Enterprise | Custom (contact sales) |

Save the Stripe `price_id` for each plan in your `plans` table.

### 5.3 Checkout Flow

Create `app/api/stripe/checkout/route.ts`:

```typescript
const session = await stripe.checkout.sessions.create({
  customer_email: user.email,
  line_items: [{ price: priceId, quantity: 1 }],
  mode: 'subscription',
  success_url: `${origin}/settings?upgraded=true`,
  cancel_url: `${origin}/settings`,
  metadata: { shopId, planId },
})
return NextResponse.json({ url: session.url })
```

On the frontend, redirect the user to `session.url`.

### 5.4 Webhook Handler

Create `app/api/stripe/webhook/route.ts`. Handle these events:

| Event | Action |
|---|---|
| `checkout.session.completed` | Create/update `subscriptions` row, set plan |
| `invoice.payment_succeeded` | Extend subscription, record payment |
| `invoice.payment_failed` | Set subscription to `past_due` |
| `customer.subscription.deleted` | Downgrade to Free |

Use `stripe.webhooks.constructEvent()` to verify the webhook signature.

### 5.5 Customer Portal

```typescript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${origin}/settings`,
})
redirect(portalSession.url)
```

This lets customers manage their own billing, cancel, or upgrade — Stripe handles the UI.

### 5.6 Feature Gating

Create `lib/features.ts`:

```typescript
export function canAccess(subscription: Subscription, feature: string): boolean {
  const limits = planLimits[subscription.plan]
  return limits.features.includes(feature)
}

export function isWithinLimit(subscription: Subscription, resource: string, currentCount: number): boolean {
  return currentCount < planLimits[subscription.plan].limits[resource]
}
```

**Never gate features only on the client.** Always check in the Route Handler or Server Component before returning data or executing writes.

In API routes:
```typescript
const sub = await getShopSubscription(shopId)
if (!canAccess(sub, 'digital_inspections')) {
  return NextResponse.json({ error: 'Upgrade required' }, { status: 403 })
}
```

**Phase 5 done when:** Free/Starter/Pro plans are live in Stripe, checkout works, webhooks update the database, feature gates block API writes for underpaid tiers.

---

## Phase 6: Add AI, SMS/Email, VIN/DTC APIs

**Goal:** Replace all mock services with real third-party integrations. Keep them behind feature gates.

### 6.1 AI — Claude API (Anthropic)

```bash
npm install @anthropic-ai/sdk
```

Add to `.env.local`:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

**Where to use AI:**
- `app/api/ai/fill-job-card/route.ts` — Given customer + vehicle, draft job card fields
- `app/api/ai/write-estimate/route.ts` — Given inspection findings, draft estimate lines
- `app/api/ai/audit-invoice/route.ts` — Given invoice, flag missing PO, tax, shop supplies
- `app/api/ai/explain-dtc/route.ts` — Given DTC code + vehicle, write customer-friendly explanation
- `app/api/ai/draft-message/route.ts` — Given job card, draft SMS/email approval or follow-up

Use streaming responses (`anthropic.messages.stream()`) for the estimate writer so the advisor sees text appearing live.

**Always require human approval before sending AI-drafted messages or estimates.**

Gate all AI routes behind `canAccess(sub, 'ai_assistant')` — Free plan gets zero AI credits.

### 6.2 SMS/Email — Twilio + SendGrid (or Resend)

**SMS (Twilio):**
```bash
npm install twilio
```
```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
```

Create `app/api/messages/send/route.ts`:
```typescript
await twilioClient.messages.create({
  to: customer.phone,
  from: process.env.TWILIO_FROM_NUMBER,
  body: message.body,
})
```

**Email (Resend — simplest for Next.js):**
```bash
npm install resend
```
```env
RESEND_API_KEY=re_...
```

Use React Email (`npm install react-email @react-email/components`) to build HTML invoice and estimate templates.

**Approval links:** Generate a signed URL (`/approve?token=jwt_signed_token`) that customers click in the SMS/email. The token encodes the estimate ID and shop ID. The `/approve` page verifies the token and updates `estimates.status = 'approved'` without requiring the customer to have an account.

### 6.3 VIN Decoder

**Recommended provider:** NHTSA free API (no key needed) for basic decodes, or a paid provider (DataOne, Polk) for full spec data.

Replace `services/vinDecoderService.ts`:

```typescript
export async function decodeVin(vin: string): Promise<VinResult> {
  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
  )
  const data = await res.json()
  // Map NHTSA response to VinResult shape
}
```

Call this from a Route Handler (`app/api/vin/route.ts`), not from the browser, to keep the API key hidden if you use a paid provider.

### 6.4 DTC Lookup

**Recommended provider:** ALLDATA, Mitchell1, or a DTC-specific API (several on RapidAPI).

For MVP, the existing mock data covers the most common codes. Add a real provider call as a fallback when the local mock returns "Unknown":

```typescript
export async function lookupDtc(code: string): Promise<DtcResult> {
  const local = dtcData[code.toUpperCase()]
  if (local) return local
  // Call paid DTC API
  return await fetchFromDtcProvider(code)
}
```

### 6.5 Scan Tool Diagnostics

**Phase 6 option A (simulated, keep as-is):** Fine for most shop software — technicians enter DTCs manually.

**Phase 6 option B (real hardware bridge):** Requires a backend bridge process (not Next.js) that connects to the OBD-II adapter (Bluetooth, USB, or J2534) and exposes a WebSocket. The Next.js app connects via `useWebSocket`. This is a significant engineering effort — plan for a separate service.

**Phase 6 option C (third-party telematics):** For fleet customers, integrate with Samsara, Geotab, or Verizon Connect fleet APIs to pull live vehicle health data.

### 6.6 Payment Links (Stripe)

Replace the "Send payment link" mock action with a real Stripe Payment Link:

```typescript
const paymentLink = await stripe.paymentLinks.create({
  line_items: invoice.lines.map(line => ({
    price_data: { currency: 'usd', product_data: { name: line[0] }, unit_amount: Math.round(line[2] * 100) },
    quantity: line[1],
  })),
  metadata: { invoiceId: invoice.id },
})
```

Include the URL in the invoice SMS/email. When the customer pays, a Stripe webhook calls your payment handler.

**Phase 6 done when:** AI drafts are live, SMS/email sends real messages, VIN/DTC use real APIs, payment links work end-to-end.

---

## Phase 7: Test, Secure, and Deploy

**Goal:** Production-ready, hardened, monitored, deployed.

### 7.1 Testing

**Unit tests — Vitest:**
```bash
npm install -D vitest @vitejs/plugin-react
```
- Test all reducer cases in `lib/store.tsx`
- Test `calculateInvoice()` edge cases
- Test `canAccess()` and `isWithinLimit()` for every plan/feature combination
- Test `lookupDtc()` and `decodeVin()` service functions

**Integration tests — Playwright:**
```bash
npm install -D @playwright/test
```
Key flows to cover end-to-end:
- Login → create job card → approve → convert to RO → create invoice → mark paid
- Create estimate from inspection → approve → convert to invoice
- Stripe checkout → subscription active → feature gate lifted
- Invite user → user accepts → role enforced

**API tests:**
- Test every Route Handler with real Supabase (use a test project or a transaction that rolls back)
- Test webhook handler with `stripe trigger checkout.session.completed`

### 7.2 Security Hardening

**Authentication:**
- Verify `shop_id` on every API route — never trust client-supplied shop IDs
- Require re-authentication for destructive actions (delete customer, void invoice)
- Set short JWT expiry (1 hour) + refresh tokens

**Authorization:**
- All RLS policies active in Supabase
- All Route Handlers check session + role before any DB operation
- Service role key never in client-side code

**Input validation:**
- Use `zod` to validate all incoming request bodies in Route Handlers
- Sanitize all string inputs before inserting to DB (Supabase client uses parameterized queries by default)

**Secrets:**
- All API keys in environment variables, never hardcoded
- Use Vercel/Railway environment variable UI for production secrets
- Rotate Stripe webhook secret and Supabase service role key before go-live

**Rate limiting:**
- Add `@upstash/ratelimit` to AI and SMS Route Handlers
- Limit AI calls per shop per day based on plan credits

**Headers:**
Add to `next.config.ts`:
```typescript
headers: async () => [{
  source: '/(.*)',
  headers: [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ]
}]
```

### 7.3 Performance

- Use Next.js `loading.tsx` for Suspense boundaries on data-heavy views
- Paginate all tables (invoices, job cards, parts) — never load unbounded lists
- Add database indexes on: `shop_id`, `customer_id`, `status`, `created_at` on all major tables
- Use Supabase connection pooling (PgBouncer) for production

### 7.4 Monitoring and Logging

**Error tracking:**
```bash
npm install @sentry/nextjs
```
Configure `sentry.client.config.ts` and `sentry.server.config.ts`. Add `withSentryConfig` to `next.config.ts`.

**Logging:**
- Log all audit events to your `audit_logs` table (already in schema)
- Log API errors with user ID, shop ID, and stack trace — never log PII in plaintext

**Uptime monitoring:** Use Better Uptime, Checkly, or Vercel's built-in monitoring.

### 7.5 Deployment — Vercel (Recommended)

```bash
npm install -g vercel
vercel login
vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deployments on push.

**Environment variables to set in Vercel dashboard:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`

**Custom domain:** Add your domain in Vercel → Settings → Domains. Vercel handles SSL automatically.

**Stripe webhook endpoint:** After deploying, register your production URL in the Stripe dashboard:
`https://yourdomain.com/api/stripe/webhook`

### 7.6 Pre-Launch Checklist

- [ ] All RLS policies active and tested
- [ ] Stripe webhook verified in production
- [ ] `.env.local` not committed to git
- [ ] All API routes return proper HTTP status codes
- [ ] Error boundaries on all feature views
- [ ] Mobile layout tested on real devices
- [ ] Sentry capturing errors in production
- [ ] Database indexes applied
- [ ] Rate limiting on AI and SMS routes
- [ ] Terms of service and privacy policy pages exist
- [ ] GDPR/data deletion flow exists for customer data
- [ ] Backup / restore plan for Supabase (point-in-time recovery enabled)

**Phase 7 done when:** All tests pass, security review complete, app deployed to production URL with custom domain, monitoring active.

---

## Summary Timeline

| Phase | Scope | Estimated Effort |
|---|---|---|
| 1 — Next.js UI | ✅ Done | Done |
| 2 — DB Schema | Supabase tables, RLS, seed | 1–2 days |
| 3 — Auth + Roles | Real login, middleware, invite | 2–3 days |
| 4 — Real CRUD | Replace mock data with Supabase queries | 5–7 days |
| 5 — Stripe | Checkout, webhooks, feature gates | 3–4 days |
| 6 — AI / APIs | Claude, Twilio, Resend, VIN, DTC | 4–6 days |
| 7 — Test + Deploy | Playwright, Sentry, Vercel, hardening | 3–5 days |

**Recommended order:** Complete each phase fully before starting the next. Phase 3 (auth) must be done before Phase 4 (CRUD) — every database query needs a real `shop_id` from a real session.
