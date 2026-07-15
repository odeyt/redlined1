'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Dark neon design tokens
const D = {
  bg: '#080808',
  surface: '#0d0d14',
  surfaceSoft: '#111118',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  red: '#cc0000',
  redGlow: 'rgba(204,0,0,0.25)',
  text: '#e8eaf0',
  muted: 'rgba(255,255,255,0.45)',
  mutedLight: 'rgba(255,255,255,0.28)',
};

const STATUS: Record<string, { bg: string; fg: string; dot: string; border: string }> = {
  Pass:      { bg: 'rgba(22,163,74,0.12)',  fg: '#4ade80', dot: '#22d3a0', border: 'rgba(34,211,160,0.3)' },
  Attention: { bg: 'rgba(202,138,4,0.12)',  fg: '#fbbf24', dot: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  Fail:      { bg: 'rgba(220,38,38,0.12)',  fg: '#f87171', dot: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  'N/A':     { bg: 'rgba(255,255,255,0.05)', fg: 'rgba(255,255,255,0.35)', dot: 'rgba(255,255,255,0.25)', border: 'rgba(255,255,255,0.1)' },
};

function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status] ?? STATUS['N/A'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px',
      background: s.bg, color: s.fg, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot, flexShrink: 0, boxShadow: `0 0 6px ${s.dot}` }} />
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
    color: '#818cf8',
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
    color: '#38bdf8',
    detail: 'Attach a photo to any inspection item directly from a phone or tablet camera. Photos are stored securely and appear in the customer-facing report alongside the finding. Visual evidence removes doubt and builds trust.',
  },
  {
    icon: '✍️',
    title: 'Technician Notes',
    desc: 'Add concise notes to any Attention or Fail item — measurements, observations, or repair recommendations.',
    color: '#fbbf24',
    detail: 'Add a concise note to any Attention or Fail item — measurements, observations, or repair recommendations — so the customer understands exactly what was found. Notes carry over to estimates automatically.',
  },
  {
    icon: '🔗',
    title: 'Customer Share Link',
    desc: 'Generate a secure, unique link for each completed inspection. No account required to view.',
    color: '#22d3a0',
    detail: 'Generate a secure, unique link for each completed inspection and share it with the customer via SMS or messaging app. No account required to view. Customers review the full report — photos, findings, and notes — on any device.',
  },
  {
    icon: '✅',
    title: 'Online Customer Approval',
    desc: 'Customers approve or decline each recommended repair individually — timestamped digital approval.',
    color: '#a78bfa',
    detail: 'Customers review findings, photos, and notes, then approve or decline each recommended repair individually. Their name serves as a timestamped digital approval — recorded in the inspection record. No paper forms, no phone tag.',
  },
  {
    icon: '✉️',
    title: 'Email Report',
    desc: "Send the full inspection report directly to the customer's email address from inside the app.",
    color: '#f472b6',
    detail: "Send the full inspection report directly to the customer's email address from inside the app. The email includes a link to the interactive report — customers can review and approve from their inbox without downloading anything.",
  },
  {
    icon: '🖨️',
    title: 'Print-Ready Report',
    desc: 'Generate a clean, branded printed report from any browser.',
    color: '#fb923c',
    detail: 'Generate a clean, branded printed report from any browser. Customer-facing summary includes shop logo, contact details, inspection results, and photos. Hand a professional printed report to the customer at vehicle handover.',
  },
  {
    icon: '📄',
    title: 'Connected to Estimates',
    desc: 'Convert a completed inspection directly to an estimate — findings carry over automatically.',
    color: '#2dd4bf',
    detail: 'Convert a completed inspection directly to an estimate — findings carry over to the estimate without re-entering vehicle or customer details. AI-assisted estimate drafting also available. One click from inspection to revenue.',
  },
  {
    icon: '📂',
    title: 'Permanent Vehicle History',
    desc: 'Every inspection is linked to the customer and vehicle record — visible on every future visit.',
    color: '#e74c3c',
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
      <section
        id="digital-inspections"
        style={{
          paddingBlock: 'clamp(56px, 8vw, 128px)',
          background: D.bg,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background grid */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(${D.border} 1px, transparent 1px), linear-gradient(90deg, ${D.border} 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, left: '30%',
          width: '600px', height: '400px',
          background: 'radial-gradient(ellipse, rgba(204,0,0,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '1280px', marginInline: 'auto', paddingInline: '24px', position: 'relative' }}>

          <div style={{ maxWidth: '760px', marginBottom: '56px' }}>
            {/* Eyebrow */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(34,211,160,0.1)', border: '1px solid rgba(34,211,160,0.25)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22d3a0', boxShadow: '0 0 8px #22d3a0' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#22d3a0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Digital Vehicle Inspections Built In</span>
            </div>

            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1, margin: '0 0 16px' }}>
              Show customers what the technician sees.
            </h2>
            <p style={{ fontSize: '18px', lineHeight: 1.6, color: D.muted, marginTop: '16px', maxWidth: '640px', margin: 0 }}>
              Document vehicle condition with structured inspection findings, technician notes, and visual evidence. RedlineD1 keeps every inspection connected to the customer, vehicle, job, estimate, and repair history.
            </p>
            <p style={{ fontSize: '15px', lineHeight: 1.6, color: D.mutedLight, marginTop: '10px', maxWidth: '640px' }}>
              Inspect. Document. Explain. Approve. Repair.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '28px' }}>
              <Link href="/signup" data-analytics="dvi_hero_trial" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', background: D.red, color: '#fff',
                fontWeight: 700, fontSize: '15px', padding: '13px 28px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                minHeight: '44px', textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(204,0,0,0.4)',
                transition: 'all 0.2s',
              }}>
                Start Free Trial
              </Link>
              <a href="#dvi-features" data-analytics="dvi_features_scroll" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', background: 'rgba(255,255,255,0.06)', color: '#fff',
                fontWeight: 600, fontSize: '15px', padding: '13px 28px',
                borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
                minHeight: '44px', textDecoration: 'none',
                transition: 'all 0.2s',
              }}>
                Explore DVI Features
              </a>
            </div>
          </div>

          {/* Inspection workflow steps */}
          <div style={{ marginBottom: '56px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.muted, marginBottom: '20px' }}>
              Inspection workflow
            </p>
            <div className="rd1-scroll-x">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', minWidth: '720px' }}>
                {WORKFLOW_STEPS.map((step, i) => (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flex: 1 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '12px 14px', borderRadius: '12px',
                        fontSize: '13px', fontWeight: 700,
                        background: D.surface,
                        border: `1px solid ${D.border}`,
                        borderTop: `2px solid ${D.red}`,
                        color: '#fff',
                        textAlign: 'center', whiteSpace: 'nowrap',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        gap: '6px',
                      }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 800, color: D.red,
                          background: 'rgba(204,0,0,0.12)', borderRadius: '50%',
                          width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: `0 0 8px ${D.redGlow}`,
                        }}>{i + 1}</span>
                        {step.label}
                      </div>
                      <p style={{ fontSize: '11px', color: D.muted, textAlign: 'center', marginTop: '8px', lineHeight: 1.45, paddingInline: '4px' }}>
                        {step.desc}
                      </p>
                    </div>
                    {i < WORKFLOW_STEPS.length - 1 && (
                      <div aria-hidden="true" style={{
                        width: '24px', height: '2px',
                        background: `linear-gradient(90deg, ${D.red}, rgba(204,0,0,0.3))`,
                        marginTop: '22px', flexShrink: 0,
                        boxShadow: '0 0 6px rgba(204,0,0,0.4)',
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Demo mockup + supporting copy */}
          <div className="rd1-two-col">
            <div>
              <div style={{
                background: D.surface, border: `1px solid ${D.border}`,
                borderRadius: '20px', overflow: 'hidden', maxWidth: '480px',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}>
                {/* Card header */}
                <div style={{
                  background: 'linear-gradient(135deg, #7a1414 0%, #1a0505 100%)',
                  padding: '16px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Digital Vehicle Inspection</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>DVI-0042</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>2019 Toyota Hilux</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Tech: J. Santos</div>
                    <div style={{ marginTop: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                      18 / 24 items
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ height: '100%', width: '75%', background: `linear-gradient(90deg, ${D.red}, #ff4444)`, boxShadow: '0 0 8px rgba(204,0,0,0.5)' }} aria-label="75% complete" />
                </div>
                {/* Status summary row */}
                <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}` }}>
                  {[
                    { label: 'Fail',      count: 1, ...STATUS.Fail },
                    { label: 'Attention', count: 3, ...STATUS.Attention },
                    { label: 'Pass',      count: 5, ...STATUS.Pass },
                    { label: 'N/A',       count: 6, ...STATUS['N/A'] },
                  ].map((s, idx) => (
                    <div key={s.label} style={{
                      flex: 1, textAlign: 'center', padding: '10px 4px',
                      borderRight: idx < 3 ? `1px solid ${D.border}` : undefined,
                      background: s.bg,
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: s.dot, textShadow: `0 0 10px ${s.dot}` }}>{s.count}</div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* Items list */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', background: D.surface }}>
                  {DEMO_ITEMS.map((item) => {
                    const s = STATUS[item.status];
                    return (
                      <div key={item.name} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '8px 10px', borderRadius: '8px',
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: '#e8eaf0' }}>{item.name}</div>
                          {item.note && (
                            <div style={{ fontSize: '11px', color: D.muted, marginTop: '2px', lineHeight: 1.4 }}>{item.note}</div>
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
                              fontSize: '14px', boxShadow: `0 0 8px ${STATUS.Fail.border}`,
                            }}
                            role="img"
                          >
                            📷
                          </div>
                        )}
                        <StatusBadge status={item.status} />
                      </div>
                    );
                  })}
                </div>
                {/* Card footer actions */}
                <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${D.border}`, display: 'flex', gap: '8px', flexWrap: 'wrap', background: D.surfaceSoft }}>
                  {[
                    { icon: '🔗', label: 'Share Link', color: 'rgba(255,255,255,0.06)', border: D.border, fg: D.muted },
                    { icon: '✉️', label: 'Email Report', color: 'rgba(255,255,255,0.06)', border: D.border, fg: D.muted },
                    { icon: '📋', label: 'Create Estimate →', color: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)', fg: '#818cf8' },
                  ].map(btn => (
                    <div key={btn.label} style={{
                      flex: 1, minWidth: '110px', padding: '8px 10px', borderRadius: '8px',
                      background: btn.color, border: `1px solid ${btn.border}`,
                      fontSize: '11px', fontWeight: 600, color: btn.fg, textAlign: 'center',
                    }}>
                      {btn.icon} {btn.label}
                    </div>
                  ))}
                </div>
              </div>
              <p style={{ marginTop: '10px', fontSize: '11px', color: D.mutedLight, fontStyle: 'italic' }}>
                Sample inspection data shown for demonstration. No real customer records used.
              </p>
            </div>

            {/* Supporting copy */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
                  One connected workflow from inspection to invoice.
                </h3>
                <p style={{ fontSize: '15px', lineHeight: 1.65, color: D.muted, margin: 0 }}>
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
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: 'rgba(34,211,160,0.12)', border: '1px solid rgba(34,211,160,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: '2px',
                    boxShadow: '0 0 8px rgba(34,211,160,0.15)',
                  }}>
                    <span style={{ fontSize: '10px', color: '#22d3a0', fontWeight: 800 }}>✓</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e8eaf0' }}>{pt.label}</div>
                    <div style={{ fontSize: '12px', color: D.muted, marginTop: '2px' }}>{pt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Interactive feature showcase */}
      <section
        id="dvi-features"
        style={{
          paddingBlock: 'clamp(56px, 8vw, 96px)',
          background: D.surfaceSoft,
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(${D.border} 1px, transparent 1px), linear-gradient(90deg, ${D.border} 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />

        <div style={{ maxWidth: '1280px', marginInline: 'auto', paddingInline: '24px', position: 'relative' }}>
          <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.025em', margin: '0 0 12px' }}>
              Everything the inspection needs, built into every job.
            </h2>
            <p style={{ color: D.muted, marginTop: '12px', lineHeight: 1.6, fontSize: '16px' }}>
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
                      border: `1.5px solid ${isActive ? f.color : 'rgba(255,255,255,0.1)'}`,
                      background: isActive ? `${f.color}22` : 'rgba(255,255,255,0.04)',
                      color: isActive ? f.color : 'rgba(255,255,255,0.55)',
                      transition: 'all 0.25s ease',
                      boxShadow: isActive ? `0 0 16px ${f.color}44` : 'none',
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
            border: `1.5px solid ${feat.color}44`,
            background: `linear-gradient(135deg, ${feat.color}12 0%, ${D.surface} 60%)`,
            boxShadow: `0 0 40px ${feat.color}18, 0 8px 32px rgba(0,0,0,0.4)`,
            transition: 'all 0.3s ease',
            display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '16px',
              background: `${feat.color}22`,
              border: `1.5px solid ${feat.color}55`,
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px',
              boxShadow: `0 0 24px ${feat.color}44`,
              transition: 'all 0.3s ease',
            }}>
              {feat.icon}
            </div>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: feat.color, transition: 'color 0.3s', textShadow: `0 0 20px ${feat.color}66` }}>
                  {feat.title}
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '9999px',
                  background: 'rgba(34,211,160,0.12)', color: '#22d3a0',
                  border: '1px solid rgba(34,211,160,0.3)',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22d3a0', boxShadow: '0 0 5px #22d3a0' }} />
                  Available now
                </span>
              </div>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, margin: 0 }}>
                {feat.detail}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: '16px', height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${((active + 1) / FEATURES.length) * 100}%`,
              background: feat.color,
              borderRadius: '9999px',
              boxShadow: `0 0 8px ${feat.color}`,
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
                  background: i === active ? feat.color : 'rgba(255,255,255,0.12)',
                  cursor: 'pointer', transition: 'all 0.3s ease',
                  boxShadow: i === active ? `0 0 8px ${feat.color}` : 'none',
                }}
              />
            ))}
          </div>

          {/* Mobile mechanic callout */}
          <div style={{
            marginTop: '48px', padding: '28px 32px',
            background: 'linear-gradient(135deg, rgba(204,0,0,0.08) 0%, #0d0d14 60%)',
            border: '1px solid rgba(204,0,0,0.2)',
            borderRadius: '20px',
            boxShadow: '0 4px 32px rgba(0,0,0,0.4), 0 0 40px rgba(204,0,0,0.05)',
            display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center',
          }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(204,0,0,0.8)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                For mobile mechanics
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                Professional inspections — even without a physical shop.
              </h3>
              <p style={{ fontSize: '14px', lineHeight: 1.6, color: D.muted, margin: 0 }}>
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
                  <span style={{
                    fontSize: '10px', color: '#22d3a0', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: 'rgba(34,211,160,0.12)',
                    flexShrink: 0,
                  }}>✓</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
