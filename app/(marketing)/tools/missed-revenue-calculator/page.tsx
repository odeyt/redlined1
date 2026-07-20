'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';
import { FAQSection } from '@/components/seo/FAQSection';

const FAQS = [
  {
    question: 'What counts as a "lapsed" customer?',
    answer:
      'A lapsed customer is one who visited your shop within the past 1–3 years but has not returned within their expected service interval. The definition varies by shop — some use 12 months, others 18 or 24. This calculator uses 12 months as the default but you can adjust it.',
  },
  {
    question: 'How does follow-up affect recovery rate?',
    answer:
      'Studies in the automotive service industry suggest that proactive outreach — personalized service reminders, follow-up calls, or targeted campaigns — can recover 10–30% of lapsed customers. Without outreach, natural return rates for lapsed customers tend to be much lower. The recovery percentage you use here should reflect realistic expectations for your market and outreach quality.',
  },
  {
    question: 'What is a realistic average repair order (ARO) to use?',
    answer:
      'Your actual ARO from the last 12 months is the most accurate input. Industry averages for independent shops vary significantly by region, specialty, and shop size — but $350–$600 per repair order is commonly cited for general repair. If you specialize in higher-ticket work, your ARO may be substantially higher.',
  },
  {
    question: 'Is this an accurate projection of what I\'ll actually recover?',
    answer:
      'This calculator produces an estimate based on your inputs, not a guarantee. Actual revenue recovery depends on the quality of your outreach, your pricing, local competition, and other factors. Use this as a planning tool to understand the scale of the opportunity, not as a precise forecast.',
  },
];

function currency(val: number): string {
  return `$${Math.round(val).toLocaleString('en-US')}`;
}

export default function MissedRevenueCalculatorPage() {
  const [roPerMonth, setRoPerMonth] = useState(80);
  const [avgRo, setAvgRo] = useState(420);
  const [lapseRate, setLapseRate] = useState(30);
  const [recoveryRate, setRecoveryRate] = useState(20);
  const [visitsPerYear, setVisitsPerYear] = useState(1.5);

  // Annual ROs
  const annualRos = roPerMonth * 12;
  // Unique customers (approximate — many come more than once)
  const uniqueCustomers = annualRos / visitsPerYear;
  // Lapsed customers per year
  const lapsedPerYear = uniqueCustomers * (lapseRate / 100);
  // Revenue from lapsed customers if they had returned
  const missedRevenue = lapsedPerYear * avgRo * visitsPerYear;
  // Revenue recoverable with outreach
  const recoverableRevenue = missedRevenue * (recoveryRate / 100);

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line, #d1d5db)',
    fontSize: 15, background: 'var(--surface, #fff)', color: 'inherit', boxSizing: 'border-box',
  };
  const labelSt: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--muted, #555)' };

  return (
    <>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Tools', href: '/tools' }, { name: 'Missed Revenue Calculator', href: '/tools/missed-revenue-calculator' }]} />
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16, maxWidth: 720 }}>
          Auto Repair Shop Missed Revenue Calculator
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, maxWidth: 620, color: 'var(--muted, #555)', marginBottom: 8 }}>
          Estimate how much revenue your shop loses each year when customers lapse — and how much
          you could recover with consistent follow-up.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted, #888)', marginBottom: 40 }}>
          Estimates only. Actual results depend on outreach quality, market conditions, and customer behavior.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(260px, 360px)', gap: 32, alignItems: 'start' }}>
          {/* Inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ padding: 24, borderRadius: 12, border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Your shop numbers</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelSt}>Repair orders per month</label>
                  <input type="number" style={inp} min={1} value={roPerMonth} onChange={e => setRoPerMonth(Math.max(1, Number(e.target.value)))} />
                </div>
                <div>
                  <label style={labelSt}>Average repair order value ($)</label>
                  <input type="number" style={inp} min={50} value={avgRo} onChange={e => setAvgRo(Math.max(50, Number(e.target.value)))} />
                </div>
                <div>
                  <label style={labelSt}>Average visits per customer per year</label>
                  <input type="number" style={inp} min={0.5} max={12} step={0.5} value={visitsPerYear} onChange={e => setVisitsPerYear(Math.max(0.5, Number(e.target.value)))} />
                  <p style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 6 }}>Most customers visit 1–2 times per year for general repair shops.</p>
                </div>
              </div>
            </div>

            <div style={{ padding: 24, borderRadius: 12, border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface, #fff)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Lapse and recovery assumptions</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelSt}>% of customers who lapse each year</label>
                  <input type="number" style={inp} min={1} max={80} value={lapseRate} onChange={e => setLapseRate(Math.min(80, Math.max(1, Number(e.target.value))))} />
                  <p style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 6 }}>A customer is lapsed if they haven't returned in 12+ months. 25–40% is common for general repair shops.</p>
                </div>
                <div>
                  <label style={labelSt}>% of lapsed customers recoverable with outreach</label>
                  <input type="number" style={inp} min={1} max={60} value={recoveryRate} onChange={e => setRecoveryRate(Math.min(60, Math.max(1, Number(e.target.value))))} />
                  <p style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 6 }}>A realistic recovery rate with proactive follow-up is 10–30%. Higher with personalized outreach.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div style={{ position: 'sticky', top: 20 }}>
            <div style={{ padding: 28, borderRadius: 12, border: '2px solid var(--accent, #dc2626)', background: 'var(--surface, #fff)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Your opportunity</h2>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginBottom: 4 }}>ESTIMATED ANNUAL LAPSED REVENUE</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>{currency(missedRevenue)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 4 }}>Revenue from customers who didn't return</div>
              </div>

              <div style={{ marginBottom: 28, paddingTop: 20, borderTop: '1px solid var(--line, #e5e7eb)' }}>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginBottom: 4 }}>RECOVERABLE WITH FOLLOW-UP</div>
                <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--accent, #dc2626)', fontVariantNumeric: 'tabular-nums' }}>{currency(recoverableRevenue)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 4 }}>Potential annual revenue recovery</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Estimated unique customers/yr</span>
                  <span style={{ fontWeight: 600 }}>{Math.round(uniqueCustomers).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Lapsed customers/year</span>
                  <span style={{ fontWeight: 600 }}>{Math.round(lapsedPerYear).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted, #666)' }}>Recoverable customers</span>
                  <span style={{ fontWeight: 600 }}>{Math.round(lapsedPerYear * recoveryRate / 100).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--surface-soft, #f9fafb)', border: '1px solid var(--line, #e5e7eb)', fontSize: 13 }}>
              <strong>Note:</strong> RedlineD1 surfaces lapsed customer opportunities automatically using your actual repair order data — no spreadsheet required.
            </div>

            <a href="/signup" style={{ display: 'block', marginTop: 12, background: 'var(--accent, #dc2626)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px', borderRadius: 10, textDecoration: 'none', textAlign: 'center' }}>
              See which customers are lapsed → Start Free
            </a>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related tools and pages</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/tools/labor-rate-calculator', label: 'Labor Rate Calculator', desc: 'Find out if your labor rate covers your actual costs.' },
              { href: '/ai-auto-repair-shop-software', label: 'AI Shop Intelligence', desc: 'RedlineD1 automatically identifies lapsed customers and revenue opportunities.' },
              { href: '/auto-repair-invoicing-software', label: 'Invoicing Software', desc: 'Complete billing workflow from estimate to paid invoice.' },
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
        heading="Stop guessing which customers to call"
        subtext="RedlineD1 surfaces lapsed customers and revenue gaps from your actual data — automatically."
        primaryLabel="Start Free"
        secondaryLabel="See AI Intelligence"
        secondaryHref="/ai-auto-repair-shop-software"
      />
    </>
  );
}
