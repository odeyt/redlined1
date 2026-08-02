'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/store';
import { usePlan } from '@/lib/usePlan';
import { Panel } from '@/components/Panel';
import { PricingCards } from '@/components/billing/PricingCards';
import { SubscriptionStatus } from '@/components/billing/SubscriptionStatus';
import { BillingPortalButton } from '@/components/billing/BillingPortalButton';
import type { BillingInterval, RedlinedPlanId } from '@/lib/payments/types';

export function SubscriptionsView() {
  const { customers, vehicles, jobCards, invoices } = useAppState();
  const { status: planStatus, isFreeForever } = usePlan();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  async function handleSelectPlan(planId: RedlinedPlanId, interval: BillingInterval) {
    setCheckoutLoading(true);
    setCheckoutError('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval: interval }),
      });
      // Not every failure answers with JSON. An expired Vercel Deployment
      // Protection session redirects with an empty body, and a crashed route
      // can return nothing at all — res.json() then throws "Unexpected end of
      // JSON input", which tells the customer nothing and hides the status
      // code that would have explained it.
      const raw = await res.text();
      let data: { url?: string; error?: string; detail?: string } = {};
      try {
        data = raw ? JSON.parse(raw) as typeof data : {};
      } catch {
        throw new Error(
          `Checkout did not return a valid response (HTTP ${res.status}). ` +
          (res.redirected || res.status === 307 || res.status === 401
            ? 'The request was redirected to a login page — your session may have expired. Reload and try again.'
            : 'Please try again, or contact support if this continues.'),
        );
      }

      if (!res.ok || !data.url) {
        const msg = data.error ?? `Failed to start checkout (HTTP ${res.status})`;
        throw new Error(data.detail ? `${msg}: ${data.detail}` : msg);
      }
      window.location.href = data.url;
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Something went wrong');
      setCheckoutLoading(false);
    }
  }

  const usage = {
    customers: customers.length,
    vehicles: vehicles.length,
    jobs: jobCards.length,
    invoices: invoices.length,
  };

  return (
    <>
      {/* Current subscription status */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <SubscriptionStatus
              status={planStatus === 'pro' ? 'active' : null}
              planName={
                planStatus === 'pro' ? 'Pro'
                : isFreeForever ? 'Free Forever'
                : 'Free'
              }
            />
          </div>
          <div style={{ paddingTop: 4 }}>
            <BillingPortalButton label="Manage Billing" />
          </div>
        </div>
      </div>

      {/* Pricing plans */}
      <Panel title="Plans" hint="Choose a plan to unlock features. Annual billing saves up to 17%.">
        {checkoutError && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
            {checkoutError}
          </div>
        )}
        <PricingCards
          currentPlanId={null}
          onSelectPlan={handleSelectPlan}
          loading={checkoutLoading}
        />
      </Panel>

      {/* Shop usage summary */}
      <Panel title="Shop Usage" hint="Data snapshot from your current workspace">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {Object.entries(usage).map(([key, val]) => (
            <div key={key} style={{
              background: 'var(--surface-soft)', borderRadius: 10,
              padding: '14px 18px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{val}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, textTransform: 'capitalize' }}>{key}</div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
