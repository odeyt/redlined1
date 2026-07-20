'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';
import { FAQSection } from '@/components/seo/FAQSection';

// Metadata is exported from a separate server file — this is a client component
// See: app/(marketing)/tools/labor-rate-calculator/metadata.ts

const FAQS = [
  {
    question: 'How do I calculate my break-even labor rate?',
    answer:
      'Your break-even labor rate is the total annual cost of running your shop (technician wages, benefits, overhead, insurance, tools) divided by the total billable hours you expect to produce in a year. This calculator helps you work through each cost category to reach that number.',
  },
  {
    question: 'What is the difference between break-even rate and target rate?',
    answer:
      'Break-even rate covers costs only — at that rate, you make nothing. Target rate adds your desired profit margin on top. Most shops should target at least 15–20% net margin above the break-even rate, though actual targets vary by market, shop size, and overhead structure.',
  },
  {
    question: 'What does "efficiency rate" mean for technicians?',
    answer:
      'Efficiency rate is the percentage of a technician\'s clocked hours that actually become billable hours. A tech working 40 hours per week rarely bills 40 hours — training, cleanup, comebacks, and downtime reduce that. Industry average efficiency typically ranges from 75–90%. Use your actual number if you track it.',
  },
  {
    question: 'Should I use this rate as my posted door rate?',
    answer:
      'This calculator gives you a minimum viable rate to cover costs and hit your target margin. Your posted door rate should also consider your local market, your shop\'s specialization, and your competition. Being priced at your break-even rate leaves no room for unexpected costs.',
  },
];

function currency(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function LaborRateCalculatorPage() {
  const [techs, setTechs] = useState(2);
  const [avgWage, setAvgWage] = useState(25);
  const [benefitsPct, setBenefitsPct] = useState(20);
  const [overheadMonthly, setOverheadMonthly] = useState(4500);
  const [hoursPerWeek, setHoursPerWeek] = useState(40);
  const [efficiencyPct, setEfficiencyPct] = useState(80);
  const [targetMarginPct, setTargetMarginPct] = useState(20);
  const [weeksPerYear] = useState(50); // 2 weeks off

  // Calculations
  const annualWage = techs * avgWage * hoursPerWeek * weeksPerYear;
  const annualBenefits = annualWage * (benefitsPct / 100);
  const annualOverhead = overheadMonthly * 12;
  const totalAnnualCost = annualWage + annualBenefits + annualOverhead;
  const billableHoursPerYear = techs * hoursPerWeek * weeksPerYear * (efficiencyPct / 100);
  const breakEvenRate = billableHoursPerYear > 0 ? totalAnnualCost / billableHoursPerYear : 0;
  const targetRate = breakEvenRate / (1 - targetMarginPct / 100);

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line, #d1d5db)',
    fontSize: 15, background: 'var(--surface, #fff)', color: 'inherit', boxSizing: 'border-box',
  };

  const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--muted, #555)' };

  return (
    <>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Tools', href: '/tools' }, { name: 'Labor Rate Calculator', href: '/tools/labor-rate-calculator' }]} />
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16, maxWidth: 720 }}>
          Auto Repair Labor Rate Calculator
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, maxWidth: 620, color: 'var(--muted, #555)', marginBottom: 8 }}>
          Calculate the labor rate your shop needs to cover its costs and hit your profit target.
          All inputs and formulas are shown transparently — no black boxes.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted, #888)', marginBottom: 40 }}>
          This calculator provides estimates for planning purposes. Consult a financial advisor for business decisions.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(260px, 360px)', gap: 32, alignItems: 'start' }}>
          {/* Inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ padding: 24, borderRadius: 12, border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Technician costs</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={label}>Number of technicians</label>
                  <input type="number" style={inp} min={1} max={50} value={techs} onChange={e => setTechs(Math.max(1, Number(e.target.value)))} />
                </div>
                <div>
                  <label style={label}>Average hourly wage ($/hr)</label>
                  <input type="number" style={inp} min={10} max={200} value={avgWage} onChange={e => setAvgWage(Math.max(0, Number(e.target.value)))} />
                </div>
                <div>
                  <label style={label}>Benefits & payroll overhead (%)</label>
                  <input type="number" style={inp} min={0} max={60} value={benefitsPct} onChange={e => setBenefitsPct(Math.max(0, Number(e.target.value)))} />
                </div>
                <div>
                  <label style={label}>Billable hours/week per tech</label>
                  <input type="number" style={inp} min={1} max={60} value={hoursPerWeek} onChange={e => setHoursPerWeek(Math.max(1, Number(e.target.value)))} />
                </div>
              </div>
            </div>

            <div style={{ padding: 24, borderRadius: 12, border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Shop overhead (monthly)</h2>
              <div>
                <label style={label}>Total monthly overhead (rent, utilities, insurance, tools, etc.)</label>
                <input type="number" style={inp} min={0} value={overheadMonthly} onChange={e => setOverheadMonthly(Math.max(0, Number(e.target.value)))} />
                <p style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 6 }}>Include rent/lease, utilities, insurance, equipment, software, and other fixed costs.</p>
              </div>
            </div>

            <div style={{ padding: 24, borderRadius: 12, border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Productivity & margin</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={label}>Tech efficiency rate (%)</label>
                  <input type="number" style={inp} min={40} max={100} value={efficiencyPct} onChange={e => setEfficiencyPct(Math.min(100, Math.max(40, Number(e.target.value))))} />
                  <p style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 6 }}>Clocked hours that become billable. Industry avg: 75–90%.</p>
                </div>
                <div>
                  <label style={label}>Target net profit margin (%)</label>
                  <input type="number" style={inp} min={0} max={60} value={targetMarginPct} onChange={e => setTargetMarginPct(Math.min(60, Math.max(0, Number(e.target.value))))} />
                  <p style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 6 }}>Typical independent shops target 15–25%.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div style={{ position: 'sticky', top: 20 }}>
            <div style={{ padding: 28, borderRadius: 12, border: '2px solid var(--accent, #dc2626)', background: 'var(--surface, #fff)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Your results</h2>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginBottom: 4 }}>BREAK-EVEN RATE</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent, #dc2626)', fontVariantNumeric: 'tabular-nums' }}>{currency(breakEvenRate)}<span style={{ fontSize: 18, fontWeight: 400 }}>/hr</span></div>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 4 }}>Minimum to cover all costs</div>
              </div>

              <div style={{ marginBottom: 28, paddingTop: 20, borderTop: '1px solid var(--line, #e5e7eb)' }}>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginBottom: 4 }}>TARGET RATE ({targetMarginPct}% margin)</div>
                <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--accent, #dc2626)', fontVariantNumeric: 'tabular-nums' }}>{currency(targetRate)}<span style={{ fontSize: 20, fontWeight: 400 }}>/hr</span></div>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 4 }}>Rate needed to hit your profit target</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Annual tech wages</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{currency(annualWage)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Benefits & payroll</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{currency(annualBenefits)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Annual overhead</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{currency(annualOverhead)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 8 }}>
                  <span>Total annual cost</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{currency(totalAnnualCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Billable hours/year</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(billableHoursPerYear).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--surface-soft, #f9fafb)', border: '1px solid var(--line, #e5e7eb)', fontSize: 13 }}>
              <strong>Formula:</strong> Target rate = (Total annual cost ÷ billable hours) ÷ (1 − margin%)
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>How to use this calculator</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--muted, #666)', marginBottom: 20 }}>
            Enter your actual costs for the most accurate result. If you don&apos;t know the exact numbers, use conservative estimates — it&apos;s better to price slightly above break-even than below it.
          </p>
          <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)' }}>
            <li>Enter the number of technicians and their average hourly wage</li>
            <li>Add benefits and payroll tax overhead as a percentage (20–30% is common)</li>
            <li>Enter your total monthly shop overhead — rent, utilities, insurance, equipment leases, software subscriptions</li>
            <li>Set your efficiency rate — the percentage of clocked hours that become billable</li>
            <li>Set your target net margin to see what rate you need to charge to hit it</li>
          </ol>
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/tools/missed-revenue-calculator', label: 'Missed Revenue Calculator', desc: 'Estimate revenue lost to lapsed customers.' },
              { href: '/auto-repair-invoicing-software', label: 'Auto Repair Invoicing Software', desc: 'Bill at your target rate with consistent estimates and invoices.' },
              { href: '/pricing', label: 'RedlineD1 Pricing', desc: 'Free plan available. Paid plans from $24/month.' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} style={{ display: 'block', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: '#fff' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <FAQSection faqs={FAQS} />
      <PageCTA
        heading="Know your numbers. Run a tighter shop."
        subtext="RedlineD1 tracks labor, parts, and invoices so your data is always current."
        primaryLabel="Start Free"
        secondaryLabel="View Pricing"
      />
    </>
  );
}
