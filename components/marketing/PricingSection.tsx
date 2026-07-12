'use client';

import { useState } from 'react';
import Link from 'next/link';
import { colors, container, h2Style, card, buttonPrimary, buttonSecondary, badge } from './theme';

/**
 * PricingSection - single source of truth: docs/design/aura/
 * LANDING_PAGE_MASTER_SPEC.md Section 12. Values re-authored locally from a
 * read-only `git show` of feature/commercial-pricing-trial-entitlements's
 * commercial/plans/planCatalog.ts - no runtime import of that unmerged
 * branch (see M2_CHANGE_MANIFEST.md).
 *
 * Billing is intentionally disabled (NEXT_PUBLIC_BILLING_ENABLED=false).
 * Paid-plan CTAs never call live checkout code - they open a controlled
 * "contact us" state. Only the Trial CTA routes to /signup (account
 * creation, not a payment action).
 */
interface Plan {
  key: string;
  name: string;
  monthly: number | null;
  annual: number | null;
  tagline: string;
  badge?: string;
}

const PLANS: Plan[] = [
  { key: 'trial', name: 'Trial', monthly: 0, annual: 0, tagline: 'Try RedlineD1 free for 7 days.' },
  { key: 'solo', name: 'Solo', monthly: 24, annual: 240, tagline: 'For independent and mobile mechanics.', badge: 'Best for Mobile Mechanics' },
  { key: 'starter', name: 'Starter', monthly: 49, annual: 490, tagline: 'For small shops building a team.' },
  { key: 'professional', name: 'Professional', monthly: 99, annual: 990, tagline: 'For growing shops that want intelligence and automation.', badge: 'Most Popular' },
  { key: 'business', name: 'Business', monthly: 179, annual: 1790, tagline: 'For larger and multi-location operations.' },
  { key: 'enterprise', name: 'Enterprise', monthly: null, annual: null, tagline: 'For groups, chains, and custom deployments.' },
];

export function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const [contactPlan, setContactPlan] = useState<string | null>(null);

  return (
    <section id="pricing" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '24px' }}>
          <h2 style={h2Style}>Simple pricing that scales with your shop.</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <span style={{ fontSize: '14px', color: annual ? colors.textMuted : colors.textMain, fontWeight: 500 }}>Monthly</span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
            className="rd1-switch"
            onClick={() => setAnnual((v) => !v)}
            style={{
              position: 'relative',
              width: '44px',
              height: '24px',
              borderRadius: '9999px',
              background: annual ? colors.primary : colors.borderLight,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <span
              className="rd1-switch-thumb"
              style={{
                position: 'absolute',
                top: '2px',
                left: '2px',
                width: '20px',
                height: '20px',
                borderRadius: '9999px',
                background: colors.surfaceWhite,
                transition: 'transform 0.15s ease',
                transform: annual ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
          <span style={{ fontSize: '14px', color: annual ? colors.textMain : colors.textMuted, fontWeight: 500 }}>
            Annual <span style={{ color: colors.success }}>Save with annual billing.</span>
          </span>
        </div>

        <div className="rd1-card-grid rd1-card-grid-3">
          {PLANS.map((plan) => {
            const price = annual ? plan.annual : plan.monthly;
            const isTrial = plan.key === 'trial';
            const isEnterprise = plan.key === 'enterprise';
            return (
              <div
                key={plan.key}
                style={{
                  ...card,
                  border: plan.badge ? `2px solid ${colors.primary}` : `1px solid ${colors.borderLight}`,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plan.badge && (
                  <span style={{ ...badge, background: colors.primary, color: colors.surfaceWhite, position: 'absolute', top: '-11px', left: '20px' }}>
                    {plan.badge}
                  </span>
                )}
                <div style={{ fontSize: '16px', fontWeight: 600, color: colors.textMain, marginTop: plan.badge ? '8px' : 0 }}>{plan.name}</div>
                <div style={{ fontSize: '13px', color: colors.textMuted, marginTop: '4px', marginBottom: '16px', minHeight: '32px' }}>{plan.tagline}</div>
                <div style={{ marginBottom: '20px' }}>
                  {isEnterprise ? (
                    <span style={{ fontSize: '28px', fontWeight: 600, color: colors.textMain }}>Custom</span>
                  ) : (
                    <>
                      <span style={{ fontSize: '32px', fontWeight: 600, color: colors.textMain }}>
                        {price === 0 ? 'Free' : `$${price}`}
                      </span>
                      {price !== 0 && <span style={{ fontSize: '13px', color: colors.textMuted }}>/{annual ? 'yr' : 'mo'}</span>}
                    </>
                  )}
                </div>
                {isTrial ? (
                  <Link href="/signup" data-analytics="trial_cta_click" style={{ ...buttonPrimary, width: '100%' }}>
                    Start Free Trial
                  </Link>
                ) : isEnterprise ? (
                  <a
                    href="mailto:sales@redlined1.com?subject=Enterprise%20plan%20inquiry"
                    data-analytics="contact_sales_click"
                    style={{ ...buttonSecondary, width: '100%' }}
                  >
                    Contact Sales
                  </a>
                ) : (
                  <button
                    type="button"
                    data-analytics="pricing_plan_selected"
                    onClick={() => setContactPlan(plan.key)}
                    style={{ ...buttonSecondary, width: '100%' }}
                    aria-describedby={contactPlan === plan.key ? `contact-note-${plan.key}` : undefined}
                  >
                    Contact Us to Enable
                  </button>
                )}
                {contactPlan === plan.key && (
                  <p id={`contact-note-${plan.key}`} role="status" style={{ fontSize: '12px', color: colors.textMuted, marginTop: '10px' }}>
                    Billing activation is coming soon. Email{' '}
                    <a href="mailto:sales@redlined1.com" style={{ color: colors.primary }}>sales@redlined1.com</a> and
                    we will set up the {plan.name} plan for you.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
