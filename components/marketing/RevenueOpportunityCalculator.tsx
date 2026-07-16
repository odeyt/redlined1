'use client';

import { useId, useMemo, useState } from 'react';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', transition: 'border-color 0.2s' }}>
        {prefix && <span style={{ paddingLeft: 14, color: 'rgba(255,255,255,0.35)', fontSize: 14, flexShrink: 0 }}>{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={0}
          max={max}
          onChange={e => { const n = Number(e.target.value); onChange(Number.isFinite(n) ? n : 0); }}
          style={{
            flex: 1, minHeight: 44, padding: '10px 14px',
            fontSize: 16, fontWeight: 600,
            border: 'none', outline: 'none',
            color: '#fff', background: 'transparent', width: '100%',
          }}
        />
        {suffix && <span style={{ paddingRight: 14, color: 'rgba(255,255,255,0.35)', fontSize: 14, flexShrink: 0 }}>{suffix}</span>}
      </div>
    </div>
  );
}

const currency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * RevenueOpportunityCalculator — results always labeled "Potential Opportunity",
 * never "Guaranteed Revenue" or "Projected Revenue".
 */
export function RevenueOpportunityCalculator() {
  const [avgInvoice,               setAvgInvoice]               = useState(350);
  const [estimatesPerMonth,        setEstimatesPerMonth]        = useState(40);
  const [approvalImprovementPct,   setApprovalImprovementPct]   = useState(5);
  const [missedInvoicesPerMonth,   setMissedInvoicesPerMonth]   = useState(3);
  const [avgMissedInvoiceValue,    setAvgMissedInvoiceValue]    = useState(300);

  const result = useMemo(() => {
    const approvalOpportunity    = estimatesPerMonth * avgInvoice * (approvalImprovementPct / 100);
    const missedInvoiceRecovery  = missedInvoicesPerMonth * avgMissedInvoiceValue;
    const monthlyOpportunity     = approvalOpportunity + missedInvoiceRecovery;
    const annualOpportunity      = monthlyOpportunity * 12;
    return { approvalOpportunity, missedInvoiceRecovery, monthlyOpportunity, annualOpportunity };
  }, [avgInvoice, estimatesPerMonth, approvalImprovementPct, missedInvoicesPerMonth, avgMissedInvoiceValue]);

  return (
    <section id="revenue-calculator" style={{ paddingBlock: 'clamp(56px,8vw,128px)', background: '#0d0d14', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes calc-number-glow { 0%,100%{text-shadow:0 0 0 transparent} 50%{text-shadow:0 0 24px rgba(34,197,94,0.4)} }
        .calc-input-wrap:focus-within { border-color: rgba(34,197,94,0.4) !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.08) !important; }
      `}</style>

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(34,197,94,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(34,197,94,0.025) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: '-10%', right: '10%', width: 600, height: 500, background: 'radial-gradient(ellipse,rgba(34,197,94,0.05) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ROI Calculator</span>
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,46px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 12px', lineHeight: 1.1 }}>
            What could better follow-up<br />
            <span style={{ color: '#22c55e' }}>be worth?</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Editable, conservative example inputs. Every figure below is an illustrative opportunity, not a promise.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>

          {/* Input card */}
          <div style={{ padding: '32px', borderRadius: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <NumberField label="Average invoice value"              value={avgInvoice}             onChange={setAvgInvoice}             prefix="$" />
            <NumberField label="Estimates created per month"        value={estimatesPerMonth}      onChange={setEstimatesPerMonth} />
            <NumberField label="Illustrative approval improvement"  value={approvalImprovementPct} onChange={setApprovalImprovementPct} suffix="%" max={50} />
            <NumberField label="Missed invoices per month"          value={missedInvoicesPerMonth} onChange={setMissedInvoicesPerMonth} max={200} />
            <div style={{ gridColumn: '1 / -1' }}>
              <NumberField label="Average missed-invoice value" value={avgMissedInvoiceValue} onChange={setAvgMissedInvoiceValue} prefix="$" />
            </div>
          </div>

          {/* Result card */}
          <div style={{ padding: '32px', borderRadius: 20, background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(0,0,0,0.4) 100%)', border: '1px solid rgba(34,197,94,0.25)', boxShadow: '0 0 40px rgba(34,197,94,0.07)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>
              Potential Opportunity
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Monthly</div>
                <div style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, color: '#22c55e', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {currency(result.monthlyOpportunity)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Annual</div>
                <div style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {currency(result.annualOpportunity)}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'From approval-rate improvement', val: result.approvalOpportunity },
                { label: 'From recovered missed invoices', val: result.missedInvoiceRecovery },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{currency(row.val)}/mo</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.18)', lineHeight: 1.7, fontStyle: 'italic' }}>
          Illustrative estimate only. Actual results vary by shop activity, pricing, customer behavior, and staff execution.
        </p>
      </div>
    </section>
  );
}
