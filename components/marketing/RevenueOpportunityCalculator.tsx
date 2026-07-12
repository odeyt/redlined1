'use client';

import { useId, useMemo, useState } from 'react';
import { colors, container, h2Style, card, disclaimer } from './theme';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  max?: number;
}

function NumberField({ label, value, onChange, prefix, suffix, max = 100000 }: NumberFieldProps) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor={id} style={{ fontSize: '13px', fontWeight: 500, color: colors.textMain }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${colors.borderLight}`, borderRadius: '6px', background: colors.surfaceWhite }}>
        {prefix && <span style={{ paddingLeft: '12px', color: colors.textMuted, fontSize: '14px' }}>{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={0}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          style={{
            flex: 1,
            minHeight: '44px',
            padding: '10px 12px',
            fontSize: '15px',
            border: 'none',
            outline: 'none',
            color: colors.textMain,
            background: 'transparent',
            width: '100%',
          }}
        />
        {suffix && <span style={{ paddingRight: '12px', color: colors.textMuted, fontSize: '14px' }}>{suffix}</span>}
      </div>
    </div>
  );
}

const currency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * RevenueOpportunityCalculator - see LANDING_PAGE_MASTER_SPEC.md Section 7.2.
 * Results are always labeled "Potential Opportunity", never "Guaranteed
 * Revenue" or "Projected Revenue".
 */
export function RevenueOpportunityCalculator() {
  const [avgInvoice, setAvgInvoice] = useState(350);
  const [estimatesPerMonth, setEstimatesPerMonth] = useState(40);
  const [approvalImprovementPct, setApprovalImprovementPct] = useState(5);
  const [missedInvoicesPerMonth, setMissedInvoicesPerMonth] = useState(3);
  const [avgMissedInvoiceValue, setAvgMissedInvoiceValue] = useState(300);

  const result = useMemo(() => {
    const approvalOpportunity = estimatesPerMonth * avgInvoice * (approvalImprovementPct / 100);
    const missedInvoiceRecovery = missedInvoicesPerMonth * avgMissedInvoiceValue;
    const monthlyOpportunity = approvalOpportunity + missedInvoiceRecovery;
    const annualOpportunity = monthlyOpportunity * 12;
    return { approvalOpportunity, missedInvoiceRecovery, monthlyOpportunity, annualOpportunity };
  }, [avgInvoice, estimatesPerMonth, approvalImprovementPct, missedInvoicesPerMonth, avgMissedInvoiceValue]);

  return (
    <section id="revenue-calculator" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={h2Style}>What could better follow-up be worth?</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            Editable, conservative example inputs. Every figure below is an illustrative opportunity, not a promise.
          </p>
        </div>

        <div className="rd1-two-col">
          <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <NumberField label="Average invoice value" value={avgInvoice} onChange={setAvgInvoice} prefix="$" />
            <NumberField label="Estimates created per month" value={estimatesPerMonth} onChange={setEstimatesPerMonth} />
            <NumberField label="Illustrative approval improvement" value={approvalImprovementPct} onChange={setApprovalImprovementPct} suffix="%" max={50} />
            <NumberField label="Missed invoices per month" value={missedInvoicesPerMonth} onChange={setMissedInvoicesPerMonth} max={200} />
            <div style={{ gridColumn: '1 / -1' }}>
              <NumberField label="Average missed-invoice value" value={avgMissedInvoiceValue} onChange={setAvgMissedInvoiceValue} prefix="$" />
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.textMuted }}>
              Potential Opportunity
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: colors.textMuted }}>Monthly</div>
                <div style={{ fontSize: '28px', fontWeight: 600, color: colors.textMain }}>{currency(result.monthlyOpportunity)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: colors.textMuted }}>Annual</div>
                <div style={{ fontSize: '28px', fontWeight: 600, color: colors.textMain }}>{currency(result.annualOpportunity)}</div>
              </div>
            </div>
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${colors.borderLight}`, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: colors.textMuted }}>
              <div>From approval-rate improvement: {currency(result.approvalOpportunity)}/mo</div>
              <div>From recovered missed invoices: {currency(result.missedInvoiceRecovery)}/mo</div>
            </div>
          </div>
        </div>

        <p style={{ ...disclaimer, marginTop: '20px' }}>
          Illustrative estimate only. Actual results vary by shop activity, pricing, customer behavior, and staff execution.
        </p>
      </div>
    </section>
  );
}
