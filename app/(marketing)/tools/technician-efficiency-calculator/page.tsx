'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';
import { FAQSection } from '@/components/seo/FAQSection';

// Metadata exported from server file — this page is a client component.
// See: app/(marketing)/tools/technician-efficiency-calculator/metadata.ts

const FAQS = [
  {
    question: 'What is technician efficiency rate?',
    answer:
      'Efficiency rate is the percentage of a technician\'s clocked hours that are billed to customers. A technician who clocks 40 hours but only bills 32 hours has an 80% efficiency rate. The gap is absorbed by comebacks, training, shop prep, and downtime.',
  },
  {
    question: 'What is a good efficiency rate for an auto repair shop?',
    answer:
      'Most independent shops run between 70–90% efficiency. Shops with strong digital inspection workflows and clear job dispatching tend to land at 85–90%. Below 70% usually signals a dispatching, comeback, or training issue worth investigating.',
  },
  {
    question: 'How do I improve technician efficiency?',
    answer:
      'The fastest wins are usually reducing comebacks (which consume unbillable rework time), improving job dispatching so techs spend less time waiting, and using digital vehicle inspections to identify additional approved work that keeps bays full.',
  },
  {
    question: 'What is the difference between efficiency and productivity?',
    answer:
      'Efficiency measures billable hours against clocked hours. Productivity measures billable hours against available hours (e.g., hours in a work week). A tech can be efficient but not productive if they are only at the shop part-time. Both numbers matter.',
  },
];

function currency(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(val: number): string {
  return `${val.toFixed(1)}%`;
}

export default function TechnicianEfficiencyCalculatorPage() {
  const [techs, setTechs] = useState(2);
  const [hoursPerWeek, setHoursPerWeek] = useState(40);
  const [weeksPerYear] = useState(50);
  const [laborRate, setLaborRate] = useState(110);
  const [currentBillableHrs, setCurrentBillableHrs] = useState(28);

  const totalClockedHoursWeek = techs * hoursPerWeek;
  const currentBillableWeek = techs * currentBillableHrs;
  const currentEfficiency = totalClockedHoursWeek > 0 ? (currentBillableWeek / totalClockedHoursWeek) * 100 : 0;

  const currentAnnualRevenue = currentBillableWeek * weeksPerYear * laborRate;
  const targetBillableWeek = techs * hoursPerWeek * 0.85;
  const targetAnnualRevenue = targetBillableWeek * weeksPerYear * laborRate;
  const annualGap = targetAnnualRevenue - currentAnnualRevenue;
  const weeklyGap = annualGap / weeksPerYear;

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line, #d1d5db)',
    fontSize: 15, background: 'var(--surface, #fff)', color: 'inherit', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--muted, #6b7280)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const card: React.CSSProperties = {
    background: 'var(--surface, #f9fafb)', border: '1px solid var(--line, #e5e7eb)',
    borderRadius: 12, padding: '20px 24px',
  };

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
      <Breadcrumb
        items={[
          { name: 'Tools', href: '/tools' },
          { name: 'Technician Efficiency Calculator', href: '/tools/technician-efficiency-calculator' },
        ]}
      />

      <h1 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 12 }}>
        Technician Efficiency Calculator
      </h1>
      <p style={{ fontSize: 17, color: 'var(--muted, #6b7280)', marginBottom: 36, lineHeight: 1.6 }}>
        Find your current efficiency rate and calculate how much revenue you could recover by closing the gap to 85%.
      </p>

      {/* Inputs */}
      <section style={{ display: 'grid', gap: 20, marginBottom: 32 }}>
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Shop inputs</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={label}>Number of technicians</label>
              <input style={inp} type="number" min={1} max={50} value={techs} onChange={e => setTechs(Number(e.target.value))} />
            </div>
            <div>
              <label style={label}>Hours clocked per tech / week</label>
              <input style={inp} type="number" min={1} max={80} value={hoursPerWeek} onChange={e => setHoursPerWeek(Number(e.target.value))} />
            </div>
            <div>
              <label style={label}>Avg billable hrs per tech / week</label>
              <input style={inp} type="number" min={0} max={80} value={currentBillableHrs} onChange={e => setCurrentBillableHrs(Number(e.target.value))} />
            </div>
            <div>
              <label style={label}>Labor rate ($/hr)</label>
              <input style={inp} type="number" min={1} max={500} value={laborRate} onChange={e => setLaborRate(Number(e.target.value))} />
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section style={{ display: 'grid', gap: 16, marginBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Your results</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            { label: 'Current efficiency rate', value: pct(currentEfficiency), highlight: currentEfficiency < 80 },
            { label: 'Current weekly billable hrs', value: `${currentBillableWeek.toFixed(0)} hrs` },
            { label: 'Current annual labor revenue', value: currency(currentAnnualRevenue) },
          ].map(item => (
            <div key={item.label} style={{
              ...card,
              borderLeft: item.highlight ? '4px solid #f59e0b' : '4px solid var(--accent, #ef4444)',
            }}>
              <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{
          ...card,
          background: 'var(--accent-bg, #fef2f2)',
          borderLeft: '4px solid #ef4444',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Revenue gap at 85% target efficiency</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>Weekly gap</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{currency(weeklyGap)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>Annual gap</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{currency(annualGap)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>At 85% efficiency</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{currency(targetAnnualRevenue)}</div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--muted, #9ca3af)', margin: 0 }}>
          85% is used as a realistic target for a well-run independent shop. Adjust your inputs to model your actual situation. This calculator does not account for parts revenue or sublet work.
        </p>
      </section>

      <FAQSection faqs={FAQS} />
      <PageCTA
        heading="Track technician efficiency in real time"
        subtext="RedlineD1 shows you billable hours vs. clocked hours per technician, per day — so you can spot efficiency drops before they hit your revenue."
        primaryLabel="Start Free"
        primaryHref="/signup"
      />
    </main>
  );
}
