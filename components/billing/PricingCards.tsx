'use client';

import { useState } from 'react';
import { PLANS, PLAN_ORDER, annualSavings } from '@/config/plans';
import type { BillingInterval, RedlinedPlanId } from '@/lib/payments/types';

interface PricingCardsProps {
  currentPlanId?: RedlinedPlanId | null;
  onSelectPlan?: (planId: RedlinedPlanId, interval: BillingInterval) => void;
  loading?: boolean;
}

const CHECK = '✓';
const LOCK  = '—';

function featureRow(label: string, value: boolean | number | null | string) {
  const display =
    value === true        ? <span style={{ color: '#22c55e', fontWeight: 700 }}>{CHECK}</span> :
    value === false       ? <span style={{ color: 'var(--muted)' }}>{LOCK}</span> :
    value === null        ? <span style={{ color: '#22c55e', fontWeight: 700 }}>Unlimited</span> :
    typeof value === 'number' && value > 0 ? <span style={{ fontWeight: 600 }}>{value.toLocaleString()}</span> :
    <span style={{ color: 'var(--muted)' }}>{LOCK}</span>;

  return { label, display };
}

export function PricingCards({ currentPlanId, onSelectPlan, loading }: PricingCardsProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const plans = PLAN_ORDER.map(id => PLANS[id]);

  return (
    <div>
      {/* Interval toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: interval === 'monthly' ? 'var(--text)' : 'var(--muted)' }}>
          Monthly
        </span>
        <button
          onClick={() => setInterval(i => i === 'monthly' ? 'annual' : 'monthly')}
          style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: interval === 'annual' ? '#cc0000' : 'var(--surface-soft)',
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3,
            left: interval === 'annual' ? 23 : 3,
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: interval === 'annual' ? 'var(--text)' : 'var(--muted)' }}>
          Annual
          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
            SAVE UP TO 17%
          </span>
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {plans.map(plan => {
          const isCurrent = currentPlanId === plan.id;
          const isHighlighted = plan.highlighted;
          const price = interval === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
          const savings = annualSavings(plan);
          const isEnterprise = plan.id === 'enterprise';

          const features = [
            featureRow('Unlimited Invoices',    plan.features.unlimitedInvoices),
            featureRow('Technicians',            plan.features.maxTechnicians ?? null),
            featureRow('AI Advisor',             plan.features.aiAdvisor),
            featureRow('SMS Credits',            plan.features.smsCredits),
            featureRow('Digital Inspections',    plan.features.digitalInspections),
            featureRow('Smart Intake',           plan.features.smartIntake),
            featureRow('Repair Intelligence',    plan.features.repairIntelligence),
            featureRow('Reports',                plan.features.reports),
            featureRow('Multi-Location',         plan.features.multiLocation),
            featureRow('Priority Support',       plan.features.prioritySupport),
          ];

          return (
            <div
              key={plan.id}
              style={{
                background: 'var(--surface)',
                border: `2px solid ${isCurrent ? '#22c55e' : isHighlighted ? '#cc0000' : 'var(--line)'}`,
                borderRadius: 14,
                padding: 22,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {isHighlighted && !isCurrent && (
                <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#cc0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 12px', borderRadius: 20, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                  MOST POPULAR
                </div>
              )}
              {isCurrent && (
                <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#22c55e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 12px', borderRadius: 20, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                  CURRENT PLAN
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.03em' }}>{plan.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{plan.description}</div>
              </div>

              <div style={{ marginBottom: 18 }}>
                {isEnterprise ? (
                  <div style={{ fontSize: 20, fontWeight: 900 }}>Custom</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 28, fontWeight: 900 }}>${price}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      /{interval === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </div>
                )}
                {interval === 'annual' && savings && !isEnterprise && (
                  <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginTop: 2 }}>
                    Save {savings}% vs monthly
                  </div>
                )}
              </div>

              {/* Features */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {features.map(f => (
                  <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>{f.label}</span>
                    {f.display}
                  </div>
                ))}
              </div>

              {/* CTA */}
              {isCurrent ? (
                <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#22c55e', padding: '10px 0' }}>
                  Active Plan
                </div>
              ) : isEnterprise ? (
                <a
                  href="mailto:admin@redlined1.com"
                  style={{
                    display: 'block', textAlign: 'center', background: 'var(--surface-soft)',
                    border: '1px solid var(--line)', borderRadius: 8,
                    padding: '10px 0', fontWeight: 700, fontSize: 13,
                    color: 'var(--text)', textDecoration: 'none',
                  }}
                >
                  Contact Sales
                </a>
              ) : (
                <button
                  onClick={() => onSelectPlan?.(plan.id, interval)}
                  disabled={loading}
                  onMouseEnter={e => { if (isHighlighted && !loading) { e.currentTarget.style.background = '#cc0000'; e.currentTarget.style.color = '#fff'; } }}
                  onMouseLeave={e => { if (isHighlighted && !loading) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cc0000'; } }}
                  style={{
                    background: isHighlighted ? 'transparent' : 'var(--surface-soft)',
                    color: isHighlighted ? '#cc0000' : 'var(--text)',
                    border: `2px solid ${isHighlighted ? '#cc0000' : 'var(--line)'}`,
                    borderRadius: 999, padding: '10px 0', fontWeight: 700,
                    fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                    width: '100%', opacity: loading ? 0.7 : 1,
                    transition: 'background .15s, color .15s',
                  }}
                >
                  {loading ? 'Redirecting…' : `Upgrade to ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
