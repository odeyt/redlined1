'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { colors, container, h2Style, badge, buttonPrimary, buttonSecondary, card } from './theme';

const STATUS: Record<string, { bg: string; fg: string; dot: string }> = {
  Pass:      { bg: '#ECFDF5', fg: '#065F46', dot: '#059669' },
  Attention: { bg: '#FFFBEB', fg: '#92400E', dot: '#F59E0B' },
  Fail:      { bg: '#FFF5F5', fg: '#C62828', dot: '#F44336' },
  'N/A':     { bg: '#F5F5F5', fg: '#525252', dot: '#A3A3A3' },
};

function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status] ?? STATUS['N/A'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px',
      background: s.bg, color: s.fg,
    }}>
      <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

const DEMO_ITEMS: { cat: string; name: string; status: keyof typeof STATUS; note?: string; photo?: boolean }[] = [
  { cat: 'Brakes',     name: 'Front brake pads', status: 'Attention', note: '3 mm remaining — recommend replacement' },
  { cat: 'Brakes',     name: 'Rear brake pads',  status: 'Pass' },
  { cat: 'Brakes',     name: 'Brake fluid',       status: 'Pass' },
  { cat: 'Under Hood', name: 'Battery',           status: 'Fail',      note: 'Load test failed — 234 CCA, spec 550 CCA', photo: true },
  { cat: 'Under Hood', name: 'Air filter',        status: 'Attention', note: 'Heavily soiled' },
  { cat: 'Tires',      name: 'Front left tire',   status: 'Pass' },
  { cat: 'Tires',      name: 'Rear left tire',    status: 'Attention', note: '4/32 tread depth' },
  { cat: 'Fluids',     name: 'Engine oil',        status: 'Pass' },
  { cat: 'Fluids',     name: 'Coolant',           status: 'Pass' },
];

const FEATURES: { icon: string; title: string; desc: string; color: string; detail: string }[] = [
  {
    icon: '📋',
    title: 'Built-In Inspection Checklists',
    desc: 'Default 26-item checklist covers Brakes, Tires, Fluids, Lights, Under Hood, and Suspension.',
    color: '#6366f1',
    detail: 'Default 26-item checklist covers Brakes, Tires, Fluids, Lights, Under Hood, and Suspension — plus a full vehicle intake and outtake QA checklist. Custom shop templates also supported. Every technician works from the same consistent structure.',
  },
  {
    icon: '🔴',
    title: 'Pass / Attention / Fail Ratings',
    desc: 'Technicians classify every item as Pass, Attention, Fail, or N/A — colour-coded so critical items stand out.',
    color: '#ef4444',
    detail: 'Technicians classify every item as Pass, Attention, Fail, or N/A. Findings are colour-coded and grouped so the most critical items stand out immediately. Customers see a clear, visual summary — no interpretation required.',
  },
  {
    icon: '📷',
    title: 'Per-Item Photos',
    desc: 'Attach a photo to any inspection item directly from a phone or tablet camera.',
    color: '#0ea5e9',
    detail: 'Attach a photo to any inspection item directly from a phone or tablet camera. Photos are stored securely and appear in the customer-facing report alongside the finding. Visual evidence removes doubt and builds trust.',
  },
  {
    icon: '✍️',
    title: 'Technician Notes',
    desc: 'Add concise notes to any Attention or Fail item — measurements, observations, or repair recommendations.',
    color: '#f59e0b',
    detail: 'Add a concise note to any Attention or Fail item — measurements, observations, or repair recommendations — so the customer understands exactly what was found. Notes carry over to estimates automatically.',
  },
  {
    icon: '🔗',
    title: 'Customer Share Link',
    desc: 'Generate a secure, unique link for each completed inspection. No account required to view.',
    color: '#10b981',
    detail: 'Generate a secure, unique link for each completed inspection and share it with the customer via SMS or messaging app. No account required to view. Customers review the full report — photos, findings, and notes — on any device.',
  },
  {
    icon: '✅',
    title: 'Online Customer Approval',
    desc: 'Customers approve or decline each recommended repair individually — timestamped digital approval.',
    color: '#8b5cf6',
    detail: 'Customers review findings, photos, and notes, then approve or decline each recommended repair individually. Their name serves as a timestamped digital approval — recorded in the inspection record. No paper forms, no phone tag.',
  },
  {
    icon: '✉️',
    title: 'Email Report',
    desc: "Send the full inspection report directly to the customer's email address from inside the app.",
    color: '#ec4899',
    detail: "Send the full inspection report directly to the customer's email address from inside the app. The email includes a link to the interactive report — customers can review and approve from their inbox without downloading anything.",
  },
  {
    icon: '🖨️',
    title: 'Print-Ready Report',
    desc: 'Generate a clean, branded printed report from any browser.',
    color: '#f97316',
    detail: 'Generate a clean, branded printed report from any browser. Customer-facing summary includes shop logo, contact details, inspection results, and photos. Hand a professional printed report to the customer at vehicle handover.',
  },
  {
    icon: '📄',
    title: 'Connected to Estimates',
    desc: 'Convert a completed inspection directly to an estimate — findings carry over automatically.',
    color: '#14b8a6',
    detail: 'Convert a completed inspection directly to an estimate — findings carry over to the estimate without re-entering vehicle or customer details. AI-assisted estimate drafting also available. One click from inspection to revenue.',
  },
  {
    icon: '📂',
    title: 'Permanent Vehicle History',
    desc: 'Every inspection is linked to the customer and vehicle record — visible on every future visit.',
    color: '#cc0000',
    detail: 'Every completed inspection is linked to the customer and vehicle record. Recurring concerns, previously recommended work, and condition changes are visible on every future visit. Build trust with documented history the customer can see.',
  },
];

const WORKFLOW_STEPS = [
  { label: 'Inspect',  desc: 'Complete structured checklist on any device' },
  { label: 'Document', desc: 'Attach photos and technician notes per item' },
  { label: 'Review',   desc: 'View summary: Pass / Attention / Fail counts' },
  { label: 'Share',    desc: 'Send secure link or email report to customer' },
  { label: 'Approve',  desc: 'Customer approves or declines each finding' },
  { label: 'Repair',   desc: 'Convert findings to an estimate and job' },
];

export function DVISection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % FEATURES.length), 3000);
    return () => clearInterval(t);
  }, []);

  const feat = FEATURES[active];

  return (
    <>
      {/* Hero intro */}
      <section id="digital-inspections" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceWhite }}>
        <div style={container}>

          <div style={{ maxWidth: '760px', marginBottom: '56px' }}>
            <span style={{ ...badge, background: colors.successBg, color: colors.successText, marginBottom: '16px' }}>
              Digital Vehicle Inspections Built In
            </span>
            <h2 style={{ ...h2Style, fontSize: 'clamp(28px, 4vw, 44px)' }}>
              Show customers what the technician sees.
            </h2>
            <p style={{ fontSize: '18px', lineHeight: 1.6, color: colors.textMuted, marginTop: '16px', maxWidth: '640px' }}>
              Document vehicle condition with structured inspection findings, technician notes, and visual evidence. RedlineD1 keeps every inspection connected to the customer, vehicle, job, estimate, and repair history.
            </p>
            <p style={{ fontSize: '15px', lineHeight: 1.6, color: colors.textMuted, marginTop: '10px', maxWidth: '640px' }}>
              Inspect. Document. Explain. Approve. Repair.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '28px' }}>
              <Link href="/signup" data-analytics="dvi_hero_trial" style={buttonPrimary}>
                Start Free Trial
              </Link>
              <a href="#dvi-features" data-analytics="dvi_features_scroll" style={buttonSecondary}>
                Explore DVI Features
              </a>
            </div>
          </div>

          {/* Inspection workflow steps */}
          <div style={{ marginBottom: '56px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted, marginBottom: '20px' }}>
              Inspection workflow
            </p>
            <div className="rd1-scroll-x">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', minWidth: '680px' }}>
                {WORKFLOW_STEPS.map((step, i) => (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', flex: 1 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '10px 12px', borderRadius: '8px',
                        fontSize: '13px', fontWeight: 600,
                        background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`,
                        color: colors.textMain, textAlign: 'center', whiteSpace: 'nowrap',
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: colors.primary, marginRight: '6px' }}>{i + 1}</span>
                        {step.label}
                      </div>
                      <p style={{ fontSize: '11px', color: colors.textMuted, textAlign: 'center', marginTop: '6px', lineHeight: 1.4, paddingInline: '4px' }}>
                        {step.desc}
                      </p>
                    </div>
                    {i < WORKFLOW_STEPS.length - 1 && (
                      <div aria-hidden="true" style={{ width: '20px', height: '2px', background: colors.borderLight, marginTop: '20px', flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Demo mockup + supporting copy */}
          <div className="rd1-two-col">
            <div>
              <div style={{ ...card, padding: '0', overflow: 'hidden', maxWidth: '480px' }}>
                <div style={{ background: colors.primary, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Digital Vehicle Inspection</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>DVI-0042</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>2019 Toyota Hilux</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>Tech: J. Santos</div>
                    <div style={{ marginTop: '6px', background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                      18 / 24 items
                    </div>
                  </div>
                </div>
                <div style={{ height: '4px', background: colors.borderLight }}>
                  <div style={{ height: '100%', width: '75%', background: colors.primary }} aria-label="75% complete" />
                </div>
                <div style={{ display: 'flex', borderBottom: `1px solid ${colors.borderLight}` }}>
                  {[
                    { label: 'Fail',      count: 1, ...STATUS.Fail },
                    { label: 'Attention', count: 3, ...STATUS.Attention },
                    { label: 'Pass',      count: 5, ...STATUS.Pass },
                    { label: 'N/A',       count: 6, ...STATUS['N/A'] },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 4px', borderRight: `1px solid ${colors.borderLight}` }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: s.dot }}>{s.count}</div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {DEMO_ITEMS.map((item) => (
                    <div key={item.name} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '8px 10px', borderRadius: '8px',
                      background: item.status === 'Fail' ? '#FFF5F5' : item.status === 'Attention' ? '#FFFBEB' : colors.surfaceBg,
                      border: `1px solid ${item.status === 'Fail' ? '#FECACA' : item.status === 'Attention' ? '#FDE68A' : colors.borderLight}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: colors.textMain }}>{item.name}</div>
                        {item.note && (
                          <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px', lineHeight: 1.4 }}>{item.note}</div>
                        )}
                      </div>
                      {item.photo && (
                        <div
                          aria-label="Inspection photo thumbnail"
                          style={{
                            width: '32px', height: '32px', borderRadius: '5px',
                            background: 'linear-gradient(135deg, #374151, #1F2937)',
                            border: `2px solid ${STATUS.Fail.dot}`,
                            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '14px',
                          }}
                          role="img"
                        >
                          📷
                        </div>
                      )}
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
                <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${colors.borderLight}`, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '120px', padding: '8px 12px', borderRadius: '6px', background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, fontSize: '11px', fontWeight: 600, color: colors.textMuted, textAlign: 'center' }}>
                    🔗 Share Link
                  </div>
                  <div style={{ flex: 1, minWidth: '120px', padding: '8px 12px', borderRadius: '6px', background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, fontSize: '11px', fontWeight: 600, color: colors.textMuted, textAlign: 'center' }}>
                    ✉️ Email Report
                  </div>
                  <div style={{ flex: 1, minWidth: '120px', padding: '8px 12px', borderRadius: '6px', background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '11px', fontWeight: 600, color: '#1D4ED8', textAlign: 'center' }}>
                    📋 Create Estimate →
                  </div>
                </div>
              </div>
              <p style={{ marginTop: '10px', fontSize: '11px', color: colors.textMuted, fontStyle: 'italic' }}>
                Sample inspection data shown for demonstration. No real customer records used.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: colors.textMain, margin: '0 0 10px' }}>
                  One connected workflow from inspection to invoice.
                </h3>
                <p style={{ fontSize: '15px', lineHeight: 1.65, color: colors.textMuted, margin: 0 }}>
                  Digital inspections connect directly to the vehicle record, job card, estimate, and permanent repair history. Technicians never re-enter what the inspection already captured.
                </p>
              </div>
              {[
                { label: 'Structured inspection checklists', sub: 'Default template + custom shop checklists supported' },
                { label: 'Pass, Attention, Fail condition ratings', sub: 'Every item classified and colour-coded for immediate clarity' },
                { label: 'Photos and technician notes per item', sub: 'Visual evidence stored with each finding' },
                { label: 'Customer-facing shareable report', sub: 'Secure link — no login required to view' },
                { label: 'Online approval — approve or decline per item', sub: 'Customer signs by name; decision is timestamped' },
                { label: 'Connected to estimates and repair history', sub: 'One click from completed inspection to estimate draft' },
              ].map(pt => (
                <div key={pt.label} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: colors.successBg, border: `1px solid ${colors.successText}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                    <span style={{ fontSize: '10px', color: colors.successText, fontWeight: 800 }}>✓</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: colors.textMain }}>{pt.label}</div>
                    <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '2px' }}>{pt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive feature showcase */}
      <section id="dvi-features" style={{ paddingBlock: 'clamp(56px, 8vw, 96px)', background: colors.surfaceBg }}>
        <div style={container}>
          <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
            <h2 style={h2Style}>Everything the inspection needs, built into every job.</h2>
            <p style={{ color: colors.textMuted, marginTop: '12px', lineHeight: 1.6 }}>
              These capabilities are available now in every active RedlineD1 account.
            </p>
          </div>

          {/* Feature pills */}
          <div className="rd1-scroll-x" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', minWidth: '600px' }}>
              {FEATURES.map((f, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={f.title}
                    onClick={() => setActive(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '10px 16px', borderRadius: '9999px',
                      fontSize: '13px', fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `2px solid ${isActive ? f.color : colors.borderLight}`,
                      background: isActive ? f.color : colors.surfaceWhite,
                      color: isActive ? '#fff' : colors.textMain,
                      transition: 'all 0.25s ease',
                      boxShadow: isActive ? `0 4px 16px ${f.color}44` : 'none',
                      transform: isActive ? 'translateY(-2px)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '15px', lineHeight: 1 }} aria-hidden="true">{f.icon}</span>
                    {f.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active feature detail */}
          <div style={{
            padding: '32px 36px', borderRadius: '20px',
            border: `2px solid ${feat.color}33`,
            background: `${feat.color}08`,
            transition: 'all 0.3s ease',
            display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '16px',
              background: feat.color, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px',
              boxShadow: `0 4px 20px ${feat.color}55`,
              transition: 'all 0.3s ease',
            }}>
              {feat.icon}
            </div>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: feat.color, transition: 'color 0.3s' }}>
                  {feat.title}
                </div>
                <span style={{ ...badge, background: colors.successBg, color: colors.successText }}>Available now</span>
              </div>
              <p style={{ fontSize: '15px', color: colors.textMain, lineHeight: 1.7, margin: 0 }}>
                {feat.detail}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: '16px', height: '3px', background: colors.borderLight, borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${((active + 1) / FEATURES.length) * 100}%`,
              background: feat.color, borderRadius: '9999px',
              transition: 'width 0.3s ease, background 0.3s ease',
            }} />
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '14px', justifyContent: 'center' }}>
            {FEATURES.map((f, i) => (
              <div
                key={i}
                onClick={() => setActive(i)}
                style={{
                  width: i === active ? 24 : 8, height: 8, borderRadius: '9999px',
                  background: i === active ? feat.color : colors.borderLight,
                  cursor: 'pointer', transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>

          {/* Mobile mechanic callout */}
          <div style={{
            marginTop: '48px', padding: '28px 32px',
            background: colors.surfaceDark, borderRadius: '16px',
            display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center',
          }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                For mobile mechanics
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.textOnDark, margin: '0 0 8px' }}>
                Professional inspections — even without a physical shop.
              </h3>
              <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
                Inspect a vehicle at the customer home, workplace, roadside location, or fleet yard. Capture photos and findings from your phone, share the report instantly, and keep every inspection linked to the customer and vehicle record.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
              {[
                'Phone-friendly inspection workflow',
                'On-site photo capture',
                'Consistent inspection checklists',
                'Professional customer report',
                'Online customer approval',
                'Inspection history — no office required',
              ].map(pt => (
                <div key={pt} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: colors.successText, fontWeight: 800 }}>✓</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
