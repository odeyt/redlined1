'use client';

import { AppProvider, useAppState } from '@/lib/store';
import { Sidebar } from './Sidebar';
// Renders on every authenticated screen, so a fault here takes the whole shell
// down — it did exactly that on 2026-08-13, when it opened a second Supabase
// Realtime channel on a topic Sidebar was already using. Verified on
// staging.redlined1.com before returning here. Anything added to this
// component carries the same blast radius; see AlertToaster's own note.
import { AlertToaster } from './AlertToaster';
import { PushPrompt } from './PushPrompt';
import { Header } from './Header';
import { Toast } from './Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { useShop, getBlockedModules } from '@/lib/useShop';
import { FeatureFlagProvider } from '@/components/featureFlags/FeatureFlagProvider';
import { EnvBanner } from '@/components/EnvBanner';
import { SupportWidget } from '@/components/support/SupportWidget';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { flagBlockedModules } from '@/lib/featureFlags/flaggedModules';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '@/lib/store';
import { usePlan } from '@/lib/usePlan';
import { canAccess, needsWatermark } from '@/lib/planGate';
import { isModuleAvailable } from '@/lib/moduleAvailability';
import { fetchShopSettings } from '@/services/shopSettingsService';
import type { RolePermissions, RoleKey } from '@/services/shopSettingsService';
import { parseAlertParam } from '@/lib/alerts/alertLink';
import { setAlertFocus } from '@/lib/alerts/alertFocus';

/**
 * Every screen is loaded on demand.
 *
 * These were static imports, so signing in downloaded and parsed the code for
 * all ~45 screens — about 2MB of JavaScript — before showing the one the user
 * landed on. Each new screen made first load slower for everyone. Now only
 * the shell and the active screen load up front; the rest follow when opened,
 * and the everyday ones are prefetched once the first screen is up.
 */
const STALE_CHUNK_RELOAD_KEY = 'rd1_stale_chunk_reload';

function lazyView(load: () => Promise<React.ComponentType>): React.ComponentType {
  return lazy(() => load().then(
    View => {
      try { sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY); } catch { /* storage blocked */ }
      return { default: View };
    },
    err => {
      // A tab left open across a deploy asks for chunk names the new
      // deployment does not have. One reload fetches the current build; the
      // session flag stops a genuinely broken chunk from reloading forever —
      // the second failure reaches the ErrorBoundary instead.
      try {
        if (!sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1');
          window.location.reload();
        }
      } catch { /* storage blocked — fall through to the ErrorBoundary */ }
      throw err;
    },
  ));
}

const loaders: Record<string, () => Promise<React.ComponentType>> = {
  dashboard: () => import('@/features/dashboard/DashboardView').then(m => m.DashboardView),
  'command-center': () => import('@/features/command-center/CommandCenterView').then(m => m.CommandCenterView),
  access: () => import('@/features/access/AccessView').then(m => m.AccessView),
  subscriptions: () => import('@/features/subscriptions/SubscriptionsView').then(m => m.SubscriptionsView),
  ai: () => import('@/features/ai/AiView').then(m => m.AiView),
  customers: () => import('@/features/customers/CustomersView').then(m => m.CustomersView),
  vehicles: () => import('@/features/vehicles/VehiclesView').then(m => m.VehiclesView),
  'job-cards': () => import('@/features/job-cards/JobCardsView').then(m => m.JobCardsView),
  'job-archive': () => import('@/features/job-cards/JobArchiveView').then(m => m.JobArchiveView),
  scheduling: () => import('@/features/scheduling/SchedulingView').then(m => m.SchedulingView),
  inspections: () => import('@/features/inspections/InspectionsView').then(m => m.InspectionsView),
  communication: () => import('@/features/communication/CommunicationView').then(m => m.CommunicationView),
  estimates: () => import('@/features/estimates/EstimatesView').then(m => m.EstimatesView),
  'repair-orders': () => import('@/features/repair-orders/RepairOrdersView').then(m => m.RepairOrdersView),
  invoices: () => import('@/features/invoices/InvoicesView').then(m => m.InvoicesView),
  payments: () => import('@/features/payments/PaymentsView').then(m => m.PaymentsView),
  parts: () => import('@/features/parts/PartsView').then(m => m.PartsView),
  'parts-orders':    () => import('@/features/parts/PartsOrdersView').then(m => m.PartsOrdersView),
  'parts-received':  () => import('@/features/parts/PartsReceivedView').then(m => m.PartsReceivedView),
  'parts-estimates': () => import('@/features/parts/PartsEstimatesView').then(m => m.PartsEstimatesView),
  technicians: () => import('@/features/technicians/TechniciansView').then(m => m.TechniciansView),
  attendance: () => import('@/features/people/AttendanceView').then(m => m.AttendanceView),
  pay: () => import('@/features/people/PayView').then(m => m.PayView),
  payroll: () => import('@/features/people/PayrollView').then(m => m.PayrollView),
  expenses: () => import('@/features/money/ExpensesView').then(m => m.ExpensesView),
  receivables: () => import('@/features/money/ReceivablesView').then(m => m.ReceivablesView),
  'cash-day': () => import('@/features/money/CashDayView').then(m => m.CashDayView),
  vin: () => import('@/features/vin/VinView').then(m => m.VinView),
  dtc: () => import('@/features/dtc/DtcView').then(m => m.DtcView),
  diagnostics: () => import('@/features/diagnostics/DiagnosticsView').then(m => m.DiagnosticsView),
  appointments: () => import('@/features/scheduling/AppointmentsView').then(m => m.AppointmentsView),
  reports: () => import('@/features/reports/ReportsView').then(m => m.ReportsView),
  'labor-guide': () => import('@/features/labor-guide/LaborGuideView').then(m => m.LaborGuideView),
  'time-tracking': () => import('@/features/time-tracking/TimeTrackingView').then(m => m.TimeTrackingView),
  'repair-intelligence': () => import('@/features/repair-intelligence/RepairIntelligenceView').then(m => m.RepairIntelligenceView),
  triage: () => import('@/features/triage/TriageView').then(m => m.TriageView),
  settings: () => import('@/features/settings/SettingsView').then(m => m.SettingsView),
  'system-health':     () => import('@/features/system-health/SystemHealthView').then(m => m.SystemHealthView),
  'disaster-recovery': () => import('@/features/disaster-recovery/DisasterRecoveryView').then(m => m.DisasterRecoveryView),
  'testing-dashboard': () => import('@/features/testing-dashboard/TestingDashboardView').then(m => m.TestingDashboardView),
  'support-inbox':     () => import('@/features/support-inbox/SupportInboxView').then(m => m.SupportInboxView),
  billing: () => import('@/features/billing/BillingDashboard').then(m => m.BillingDashboard),
  reminders: () => import('@/features/reminders/RemindersView').then(m => m.RemindersView),
};

const views: Record<string, React.ComponentType> = Object.fromEntries(
  Object.entries(loaders).map(([id, load]) => [id, lazyView(load)]),
);
const DashboardView = views.dashboard;

/**
 * The screens staff move between all day. Fetched in the background once the
 * first screen has rendered, so opening one is not a wait on the network.
 * Only fetches the code — nothing mounts and no data loads.
 */
const PREFETCH_MODULES = ['job-cards', 'vehicles', 'customers', 'repair-orders', 'estimates', 'invoices', 'dashboard', 'command-center'];

function prefetchEverydayViews() {
  for (const id of PREFETCH_MODULES) {
    loaders[id]?.().catch(() => { /* prefetch only — the real load reports its own failure */ });
  }
}

function Shell() {
  const { activeModule, toast } = useAppState();
  const dispatch = useAppDispatch();
  const { role, loading: roleLoading } = useShop();
  const { status: planStatus, daysLeft, loading: planLoading, profileLoaded, isFreeForever } = usePlan();
  /**
   * Whether a lapsed plan hard-locks the app.
   *
   * Deliberately INDEPENDENT of NEXT_PUBLIC_BILLING_ENABLED. Accepting payments
   * and locking people out are separate decisions, and tying them together meant
   * switching on checkout would also, as a side effect, start locking every
   * lapsed trial out of the product.
   *
   * Default OFF, because the product is sold as "Free forever with core
   * features" — a lapsed trial drops to the free tier and keeps working, which
   * is what the signup page promises. It also means a fault in the payment path
   * cannot leave a customer both locked out and unable to pay.
   *
   * Set NEXT_PUBLIC_ENFORCE_PLAN_LOCK=true to require a subscription instead.
   */
  const enforcePlanLock = process.env.NEXT_PUBLIC_ENFORCE_PLAN_LOCK === 'true';
  const checkoutFired = useRef(false);
  const defaulted = useRef(false);
  const alertHandled = useRef(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions | null>(null);
  const [permLoaded, setPermLoaded] = useState(false);
  const internalReminders = useFeatureFlag('internal_reminders');

  useEffect(() => {
    fetchShopSettings()
      .then(s => setRolePermissions(s.rolePermissions))
      .catch(() => {})
      .finally(() => setPermLoaded(true));
  }, []);

  /**
   * A notification tapped from the lock screen opens the record it was about.
   *
   * Runs before the Command Center default below and claims `defaulted` so
   * that effect cannot immediately navigate away from the record an owner just
   * tapped through to.
   *
   * The parameter is stripped from the URL afterwards, so a reload — or the
   * PWA being resumed hours later — does not silently yank someone back to an
   * old alert.
   */
  useEffect(() => {
    if (alertHandled.current) return;
    const target = parseAlertParam(new URLSearchParams(window.location.search).get('alert'));
    if (!target) return;
    alertHandled.current = true;
    defaulted.current = true;

    dispatch({ type: 'SET_MODULE', module: target.module });
    // The module mounts and loads its own records, so it cannot be told to
    // open one synchronously. It picks this up when its list arrives.
    setAlertFocus(target);

    const url = new URL(window.location.href);
    url.searchParams.delete('alert');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, [dispatch]);

  // Owners and managers land on Command Center instead of Dashboard
  useEffect(() => {
    if (defaulted.current) return;
    if (roleLoading) return;
    if (role === 'owner' || role === 'manager') {
      defaulted.current = true;
      if (activeModule === 'dashboard') {
        dispatch({ type: 'SET_MODULE', module: 'command-center' });
      }
    }
  }, [roleLoading, role, activeModule, dispatch]);

  // Prefetch the everyday screens once the first one has had the network to itself.
  useEffect(() => {
    if (roleLoading) return;
    const t = window.setTimeout(prefetchEverydayViews, 4000);
    return () => window.clearTimeout(t);
  }, [roleLoading]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  // Pick up pending checkout from localStorage OR from URL params (cross-browser safe)
  useEffect(() => {
    if (roleLoading || checkoutFired.current) return;

    // Check URL params first (set by emailRedirectTo in signup), then localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlPlan = urlParams.get('plan');
    const urlPeriod = urlParams.get('period');

    let raw = localStorage.getItem('rd1_pending_checkout');

    // If URL has plan params, they take priority (email-confirmation cross-browser path)
    if (urlPlan && urlPlan !== 'trial') {
      const fromUrl = JSON.stringify({ planId: urlPlan, billingInterval: urlPeriod || 'monthly' });
      localStorage.setItem('rd1_pending_checkout', fromUrl);
      raw = fromUrl;
      // Clean URL params without reload
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('plan');
      cleanUrl.searchParams.delete('period');
      window.history.replaceState({}, '', cleanUrl.toString());
    }

    if (!raw) return;
    checkoutFired.current = true;

    function firePendingCheckout(rawJson: string) {
      try {
        const { planId, billingInterval } = JSON.parse(rawJson);
        if (!planId || planId === 'trial') {
          localStorage.removeItem('rd1_pending_checkout');
          return;
        }
        fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, billingInterval: billingInterval || 'monthly' }),
        })
          .then(r => {
            if (r.status === 403) {
              localStorage.removeItem('rd1_pending_checkout');
              // Show subscriptions page so user can see their plan status
              dispatch({ type: 'SET_MODULE', module: 'subscriptions' });
              dispatch({ type: 'NOTIFY', message: 'Your account already has full access — no payment required.' });
              return null;
            }
            return r.ok ? r.json() : Promise.reject(r.status);
          })
          .then(json => {
            if (json === null) return;
            if (json?.url) {
              localStorage.removeItem('rd1_pending_checkout');
              window.location.href = json.url;
              return;
            }
            localStorage.removeItem('rd1_pending_checkout');
            dispatch({ type: 'SET_MODULE', module: 'subscriptions' });
          })
          .catch(() => {
            // Transient error — keep key so next page load retries
            dispatch({ type: 'SET_MODULE', module: 'subscriptions' });
          });
      } catch {
        localStorage.removeItem('rd1_pending_checkout');
      }
    }

    import('@/lib/supabase').then(({ supabase }) =>
      supabase.auth.getUser().then(({ data }) => {
        const email = (data.user?.email ?? '').toLowerCase();
        const domain = email.split('@')[1] ?? '';
        const exemptEmails = new Set(
          (process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
        );
        const exemptDomains = new Set(
          (process.env.NEXT_PUBLIC_BILLING_EXEMPT_DOMAINS ?? '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
        );
        if (exemptEmails.has(email) || (domain && exemptDomains.has(domain))) {
          localStorage.removeItem('rd1_pending_checkout');
          dispatch({ type: 'SET_MODULE', module: 'subscriptions' });
          dispatch({ type: 'NOTIFY', message: 'Your account already has full access — no payment required.' });
        } else {
          firePendingCheckout(raw!);
        }
      })
    );
  }, [roleLoading, dispatch]);

  // Role-based module blocking — mirrors Sidebar logic exactly.
  // Use the owner-configured allowlist from shop_settings when available;
  // fall back to hardcoded defaults only if no saved permissions exist.
  const roleBlocked = (() => {
    if (roleLoading || !role) return [];
    if (role === 'owner') return [];
    if (!permLoaded) return []; // allow all while loading — avoids redirect-to-dashboard race; DB permissions apply once loaded
    const allowed = rolePermissions?.[role as RoleKey];
    if (allowed && allowed.length > 0) {
      return Object.keys(views).filter(id => !allowed.includes(id));
    }
    return getBlockedModules(role);
  })();

  // Plan-based module blocking — only block if profile was actually read AND plan is free.
  // If profileLoaded is false the DB read failed; don't restrict modules in that case.
  // Free Forever users (isFreeForever=true) are never hard-blocked — they have permanent
  // access to FREE_MODULES. Only expired-trial downgrades (plan was 'trial', now 'free')
  // or billing-enabled scenarios show the lock screen.
  const planReady = !planLoading;
  const planBlocked = (planReady && planStatus === 'free' && profileLoaded && !isFreeForever)
    ? Object.keys(views).filter(m => !canAccess(m, planStatus))
    : [];

  // Modules whose tables do not exist. Blocked for everyone including the
  // platform owner: the page fails on first use regardless of who opens it, so
  // there is nothing for anyone to see. Hiding it in the sidebar is not enough
  // — SET_MODULE can still be dispatched from a tile or a saved state.
  const unavailable = Object.keys(views).filter(m => !isModuleAvailable(m));

  const flagBlocked = flagBlockedModules({ internalReminders });

  const allBlocked = [...new Set([...roleBlocked, ...planBlocked, ...unavailable, ...flagBlocked])];
  const safeModule = allBlocked.includes(activeModule) ? 'dashboard' : activeModule;
  const ActiveView = views[safeModule] || DashboardView;
  // Watermark on invoices only for expired-trial/paid-lapsed, never for Free
  // Forever. Tied to the lock policy, not to billing: if a lapsed trial keeps
  // full free-tier use, stamping its invoices would be a hostile half-measure.
  const showWatermark = planReady && needsWatermark(planStatus) && safeModule === 'invoices'
    && enforcePlanLock && !isFreeForever;

  return (
    <>
      <EnvBanner />

      {/* Mounted at the shell so it is reachable from every module — a customer
          who hits a problem on the Parts page should not have to navigate
          somewhere else to report it. Renders nothing when signed out. */}
      <SupportWidget />

      {/* Hard lock for a lapsed plan. Shown only when the shop has deliberately
          opted into requiring a subscription (NEXT_PUBLIC_ENFORCE_PLAN_LOCK),
          NOT merely because billing is switched on — see enforcePlanLock above.
          Free Forever users (plan='free') never see this, and if profileLoaded
          is false the DB read failed, so a billing infrastructure problem can
          never lock anyone out. */}
      {planReady && planStatus === 'free' && profileLoaded && enforcePlanLock && !isFreeForever && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Inter',system-ui,sans-serif",
          padding: '24px',
        }}>
          <div style={{
            maxWidth: 480, width: '100%',
            background: '#0d0d14', border: '1.5px solid rgba(204,0,0,0.4)',
            borderRadius: 20, padding: '40px 36px', textAlign: 'center',
            boxShadow: '0 0 60px rgba(204,0,0,0.15)',
          }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>🔒</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
              padding: '4px 14px', borderRadius: 9999,
              background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#cc0000' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ff6666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Subscription Required</span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
              Your subscription has ended
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, margin: '0 0 28px' }}>
              Subscribe to restore full access to job cards, estimates, invoices, inspections, and everything else in Redlined1.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href="/#pricing"
                style={{
                  display: 'block', padding: '14px 28px', borderRadius: 12,
                  background: 'linear-gradient(135deg,#e52020,#aa0000)',
                  color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(204,0,0,0.4)',
                }}
              >
                Choose a Plan →
              </a>
              <a
                href="/settings"
                style={{
                  display: 'block', padding: '12px 28px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 13, textDecoration: 'none',
                }}
              >
                Manage Account
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Trial warning banner — show in last 2 days */}
      {planReady && planStatus === 'trial' && daysLeft !== null && daysLeft <= 2 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 8000,
          background: 'linear-gradient(135deg,rgba(204,0,0,0.95),rgba(170,0,0,0.95))',
          padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          fontFamily: "'Inter',system-ui,sans-serif", boxShadow: '0 2px 12px rgba(204,0,0,0.4)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            ⚠️ Your trial ends in {daysLeft === 0 ? 'less than a day' : `${daysLeft} day${daysLeft > 1 ? 's' : ''}`}.
          </span>
          <a
            href="/#pricing"
            style={{ padding: '6px 16px', borderRadius: 8, background: '#fff', color: '#cc0000', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}
          >
            Upgrade Now
          </a>
        </div>
      )}

      <div className="shell" style={planStatus === 'trial' && daysLeft !== null && daysLeft <= 2 ? { paddingTop: '40px' } : {}}>
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="main">
          <Header onMobileNavToggle={() => setMobileNavOpen(o => !o)} />
          <AlertToaster />
          <PushPrompt />
          <div className="content" style={{ position: 'relative' }}>
            <Toast message={toast} />
            <ErrorBoundary>
              {/* Views are mounted only once useShop has resolved the active
                  shop AND its mirror links. Nearly every view fetches on mount
                  via getShopIds(); mounting earlier meant that fetch saw the
                  active shop alone, so a multi-location shop showed just one
                  location's records and never re-fetched. Gating here fixes it
                  for every view at once rather than per-view. */}
              {roleLoading
                ? <div style={{ padding: '40px 24px', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
                : (
                  <Suspense fallback={<div style={{ padding: '40px 24px', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}>
                    <ActiveView />
                  </Suspense>
                )}
            </ErrorBoundary>
            {/* Invoice watermark when trial expired and user managed to reach invoices */}
            {showWatermark && (
              <div aria-hidden="true" style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  fontSize: 'clamp(32px,6vw,72px)', fontWeight: 900, color: 'rgba(204,0,0,0.12)',
                  textTransform: 'uppercase', letterSpacing: '0.15em',
                  transform: 'rotate(-30deg)', userSelect: 'none', whiteSpace: 'nowrap',
                }}>
                  TRIAL EXPIRED
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

export function AppShell() {
  return (
    <AppProvider>
      <FeatureFlagProvider>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </FeatureFlagProvider>
    </AppProvider>
  );
}
