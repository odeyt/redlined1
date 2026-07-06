'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { PricingCards } from '@/components/billing/PricingCards';
import { SubscriptionStatus } from '@/components/billing/SubscriptionStatus';
import { BillingPortalButton } from '@/components/billing/BillingPortalButton';
import type { BillingInterval, RedlinedPlanId } from '@/lib/payments/types';

export function SubscriptionsView() {
  const { customers, vehicles, jobCards, invoices } = useAppState();
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
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Failed to start checkout');
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
              status={null}
              planName="No active subscription"
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
