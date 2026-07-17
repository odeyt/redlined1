# RedlineD1 — Disaster Recovery & Project Memory

> Last updated: 2026-07-17  
> This file is the single source of truth for recovering the project after a machine loss.  
> Stored on GitHub at **odeyt/redlined1** — accessible from any device.

---

## 1. Identity & Access

| Item | Value |
|---|---|
| Owner email | thammo01@outlook.com |
| GitHub repo | https://github.com/odeyt/redlined1 |
| Production URL | https://redlined1.com |
| Vercel project | redlined1 (auto-deploys from `main` branch) |
| Supabase project | redlined1 (production) |
| Staging Supabase | redlined1-staging |

**Shop IDs (critical — hardcoded in `lib/usePlan.ts` and `lib/useShop.ts`):**
- D1 Imports Shop 1: `38d55fae-741b-4bac-b520-f96eed65bf38`
- D1 Imports Location 2: `90b72748-bf01-4456-999f-f4ba48091606`

---

## 2. Stack

- **Frontend:** Next.js App Router, TypeScript strict, React 19
- **Backend:** Supabase PostgreSQL with Row Level Security (RLS)
- **Deployment:** Vercel (main branch → production auto-deploy)
- **Auth:** Supabase Auth
- **Repo path (local):** `C:\Users\wallyd1\REDLINE`

---

## 3. Environment Variables (Vercel)

These must be set in Vercel → Project → Settings → Environment Variables.  
Never stored in source control. Retrieve from Supabase dashboard and Stripe.

| Variable | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Production |
| `NEXT_PUBLIC_PLATFORM_OWNER_EMAIL` | Production |
| `NEXT_PUBLIC_BILLING_ENABLED` | Production (set `false` to disable billing gate) |
| `NEXT_PUBLIC_BILLING_EXEMPT_DOMAINS` | Production |
| `STRIPE_SECRET_KEY` | Production |
| `STRIPE_WEBHOOK_SECRET` | Production |

**Staging** vars (Preview scope, `staging` branch) — separate Supabase project.

---

## 4. Supabase — Required RLS Policies

If users get locked out with "Trial Ended" on a paid/internal account, check these policies on the `profiles` table:

```sql
-- Check what policies exist:
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles';

-- Must have at least one of these:
CREATE POLICY "profiles_read" ON profiles FOR SELECT TO authenticated USING (true);

-- Durable safety net (idempotent):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_self_read'
  ) THEN
    CREATE POLICY "profiles_self_read" ON profiles FOR SELECT TO authenticated
    USING (auth.uid() = id);
  END IF;
END $$;
```

**Root cause of 2026-07-17 lockout:** Only `auth_all_profiles` (ALL ops, restrictive USING) existed — blocked non-owner SELECT → plan returned null → everyone showed as 'free'.

---

## 5. Key Architecture Decisions

### Multi-shop pattern
```typescript
getShopId()   // active shop — use for INSERT/UPDATE (single shop writes)
getShopIds()  // active + mirror shops — use for SELECT (reads both locations)
```

### Plan gate (lib/planGate.ts)
```typescript
PAID_PLANS = new Set(['pro','solo','starter','professional','business','enterprise'])
```
Internal D1 shop IDs → always 'pro', bypass all billing checks.

### Billing lockout prevention (3 layers)
1. **DB:** `profiles_read` + `profiles_self_read` RLS SELECT policies
2. **Code:** `profileLoaded` flag — hard lock only fires on confirmed 'free' from DB
3. **Code:** try/catch grace — any error gives 14-day trial, never hard-locks

### Role permissions
Owner configures per-role module access in Settings → Role Permissions.  
Saved to `shop_settings.role_permissions` as `{ manager: [...moduleIds], advisor: [...], technician: [...] }`.  
Module IDs are defined in `lib/mock-data.ts` → `navItems` array.  
Both `components/AppShell.tsx` (routing guard) and `components/Sidebar.tsx` (visual) read from this DB record.

### Command Center routing
Owners and managers land on `command-center` on login (not `dashboard`).  
Controlled by `useEffect` in `AppShell.tsx` + logo-click in `Sidebar.tsx`.

---

## 6. Critical Files

| File | Purpose |
|---|---|
| `lib/usePlan.ts` | Plan status hook — reads profiles, applies grace fallback, exposes profileLoaded |
| `lib/useShop.ts` | Shop/role hook — reads shop_users, resolves role, hardcoded block lists |
| `lib/planGate.ts` | PAID_PLANS set, getPlanStatus(), canAccess(), needsWatermark() |
| `components/AppShell.tsx` | Route guard — uses rolePermissions from DB, profileLoaded for billing lock |
| `components/Sidebar.tsx` | Nav visibility — uses rolePermissions from DB |
| `services/shopSettingsService.ts` | fetchShopSettings(), saveShopSettings(), DEFAULT_ROLE_PERMISSIONS |
| `lib/mock-data.ts` | navItems — canonical list of all module IDs and display names |
| `features/command-center/CommandCenterView.tsx` | Intelligence dashboard — SI-1 through SI-11 |

---

## 7. Session History

### 2026-07-17 — Major session

**Billing lockout fix:**
- Added `profiles_read` RLS policy (Supabase SQL Editor)
- Added `profiles_self_read` RLS policy (idempotent DO $$ block)
- Added `profileLoaded` flag to `usePlan.ts` — hard lock never fires on DB failure
- Commit: `266a620`

**Role permissions routing fix:**
- AppShell now reads `shop_settings.role_permissions` (same as Sidebar) instead of hardcoded arrays
- Fixed race condition: return `[]` while `!permLoaded` to avoid redirect-to-dashboard during async fetch
- Commits: `ac16d64`, `c3aac75`, `c22b8e5`

**Command Center — default home + premium UI:**
- Owners/managers land on Command Center on login and home tap
- Header: dark glass, red glow orb, health ring embedded, animated LIVE badge
- 6 KPI pills (was 4): Critical, High Priority, Open Recs, Overdue Invoices, Revenue Today, Open Jobs
- Critical pills: animated CSS pulse glow + blinking LIVE dot when count > 0
- Commit: `d560968`

**Vehicle form auto-fill:**
- `pullFromRO()` in VehiclesView now pulls from both Repair Orders and Job Cards
- Fields: Damage at Intake, Parts Needed, Parts Exchanged, Flat Rate LAK, Assigned Tech

**Other vehicles chip:**
- Replaced expanded vehicle list with collapsible count chip in vehicle screen view

**Responsive design (20 phases):**
- Fluid typography via `clamp()`, off-canvas drawer, 44px touch targets, iOS 16px inputs
- `maxWidth: '100vw'` on all drawers
- 13 Playwright `@mobile` tests added (`tests/responsive/responsive.spec.ts`)

---

## 8. Staging Setup (paused 2026-06-13)

Staging branch and Supabase project created. Still to do:
1. Delete 2 bad env vars in Vercel named literally "Key" and "Value" (Preview scope)
2. Change prod Supabase vars scope from "Production and Preview" → **Production only**
3. Add 3 new Preview-only vars scoped to `staging` branch with staging Supabase values
4. Add `staging.redlined1.com` in Vercel → Domains, linked to `staging` branch
5. Add CNAME in Namecheap: Host=`staging`, Value=`cname.vercel-dns.com`

---

## 9. Hard Constraints (NEVER violate)

- DO NOT block D1 internal shop IDs — always treat as 'pro'
- DO NOT run destructive SQL on production without explicit instruction
- DO NOT rebuild existing Diagnostics, Copilot, job-card, auth, billing, or feature-flag systems
- DO NOT expose API keys or service-role keys to the browser
- Billing disabled by default (`NEXT_PUBLIC_BILLING_ENABLED=false`)
- No AI API calls in production (providers behind feature flags, default OFF)
- V1 vehicle comms layer is read-only — no ECU programming, DTC clearing, or CAN TX
- VIN is shop-private; global sharing (`share_to_network`) stays false by default
- Everything behind feature flags (default OFF)
- Fire-and-forget all event publishes; wrap every publish in try/catch
