'use client';

import { AppProvider, useAppState } from '@/lib/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toast } from './Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { useShop, getBlockedModules } from '@/lib/useShop';
import { DashboardView } from '@/features/dashboard/DashboardView';
import { AccessView } from '@/features/access/AccessView';
import { SubscriptionsView } from '@/features/subscriptions/SubscriptionsView';
import { AiView } from '@/features/ai/AiView';
import { CustomersView } from '@/features/customers/CustomersView';
import { VehiclesView } from '@/features/vehicles/VehiclesView';
import { JobCardsView } from '@/features/job-cards/JobCardsView';
import { JobArchiveView } from '@/features/job-cards/JobArchiveView';
import { SchedulingView } from '@/features/scheduling/SchedulingView';
import { InspectionsView } from '@/features/inspections/InspectionsView';
import { CommunicationView } from '@/features/communication/CommunicationView';
import { EstimatesView } from '@/features/estimates/EstimatesView';
import { RepairOrdersView } from '@/features/repair-orders/RepairOrdersView';
import { InvoicesView } from '@/features/invoices/InvoicesView';
import { PaymentsView } from '@/features/payments/PaymentsView';
import { PartsView } from '@/features/parts/PartsView';
import { PartsOrdersView } from '@/features/parts/PartsOrdersView';
import { PartsReceivedView } from '@/features/parts/PartsReceivedView';
import { PartsEstimatesView } from '@/features/parts/PartsEstimatesView';
import { TechniciansView } from '@/features/technicians/TechniciansView';
import { VinView } from '@/features/vin/VinView';
import { DtcView } from '@/features/dtc/DtcView';
import { DiagnosticsView } from '@/features/diagnostics/DiagnosticsView';
import { AppointmentsView } from '@/features/scheduling/AppointmentsView';
import { ReportsView } from '@/features/reports/ReportsView';
import { SettingsView } from '@/features/settings/SettingsView';
import { LaborGuideView } from '@/features/labor-guide/LaborGuideView';
import { TimeTrackingView } from '@/features/time-tracking/TimeTrackingView';
import { RepairIntelligenceView } from '@/features/repair-intelligence/RepairIntelligenceView';
import { TriageView } from '@/features/triage/TriageView';
import { SystemHealthView } from '@/features/system-health/SystemHealthView';
import { DisasterRecoveryView } from '@/features/disaster-recovery/DisasterRecoveryView';
import { TestingDashboardView } from '@/features/testing-dashboard/TestingDashboardView';
import { FeatureFlagProvider } from '@/components/featureFlags/FeatureFlagProvider';
import { EnvBanner } from '@/components/EnvBanner';
import { BillingDashboard } from '@/features/billing/BillingDashboard';
import { CommandCenterView } from '@/features/command-center/CommandCenterView';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '@/lib/store';
import { usePlan } from '@/lib/usePlan';
import { canAccess, needsWatermark } from '@/lib/planGate';
import { fetchShopSettings } from '@/services/shopSettingsService';
import type { RolePermissions, RoleKey } from '@/services/shopSettingsService';

const views: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  'command-center': CommandCenterView,
  access: AccessView,
  subscriptions: SubscriptionsView,
  ai: AiView,
  customers: CustomersView,
  vehicles: VehiclesView,
  'job-cards': JobCardsView,
  'job-archive': JobArchiveView,
  scheduling: SchedulingView,
  inspections: InspectionsView,
  communication: CommunicationView,
  estimates: EstimatesView,
  'repair-orders': RepairOrdersView,
  invoices: InvoicesView,
  payments: PaymentsView,
  parts: PartsView,
  'parts-orders':    PartsOrdersView,
  'parts-received':  PartsReceivedView,
  'parts-estimates': PartsEstimatesView,
  technicians: TechniciansView,
  vin: VinView,
  dtc: DtcView,
  diagnostics: DiagnosticsView,
  appointments: AppointmentsView,
  reports: ReportsView,
  'labor-guide': LaborGuideView,
  'time-tracking': TimeTrackingView,
  'repair-intelligence': RepairIntelligenceView,
  triage: TriageView,
  settings: SettingsView,
  'system-health':     SystemHealthView,
  'disaster-recovery': DisasterRecoveryView,
  'testing-dashboard': TestingDashboardView,
  billing: BillingDashboard,
};

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions | null>(null);
  const [permLoaded, setPermLoaded] = useState(false);

  useEffect(() => {
    fetchShopSettings()
      .then(s => setRolePermissions(s.rolePermissions))
      .catch(() => {})
      .finally(() => setPermLoaded(true));
  }, []);

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

  const allBlocked = [...new Set([...roleBlocked, ...planBlocked])];
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
                : <ActiveView />}
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
