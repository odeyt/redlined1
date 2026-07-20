'use client';

import { webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';

export { metadata } from './metadata';

const SLUG = '/resources/digital-vehicle-inspection-checklist';
const TITLE = 'Digital Vehicle Inspection Checklist';
const DESCRIPTION =
  'A complete multi-point vehicle inspection checklist for auto repair shops. Use it as a training guide, customer handout, or starting template for your DVI process.';

const CATEGORIES = [
  {
    name: 'Tires and Wheels',
    icon: '🔵',
    items: [
      'Tread depth — front (inches/mm)',
      'Tread depth — rear (inches/mm)',
      'Tire condition (cuts, bulges, uneven wear)',
      'Tire pressure vs. placard spec (PSI)',
      'Spare tire condition and pressure',
      'Wheel condition (cracks, bends, corrosion)',
      'Lug nuts — condition and torque',
      'Valve stem condition',
    ],
  },
  {
    name: 'Brakes',
    icon: '🔴',
    items: [
      'Front brake pad thickness (mm)',
      'Rear brake pad thickness (mm)',
      'Front rotor condition (scoring, runout, thickness)',
      'Rear rotor condition',
      'Brake fluid level',
      'Brake fluid color and condition',
      'Parking brake operation',
      'Brake lines — visible sections for leaks or corrosion',
      'Brake caliper operation and slide pins',
    ],
  },
  {
    name: 'Fluids',
    icon: '🟡',
    items: [
      'Engine oil — level, color, condition',
      'Coolant — level, color, freeze point',
      'Power steering fluid level',
      'Transmission fluid level and condition',
      'Differential fluid (if serviceable)',
      'Windshield washer fluid',
      'Brake fluid (see Brakes)',
    ],
  },
  {
    name: 'Engine and Under Hood',
    icon: '🟠',
    items: [
      'Belts — condition and tension (serpentine, timing if visible)',
      'Hoses — condition (cracks, swelling, softness)',
      'Battery terminals — corrosion, tightness',
      'Battery condition (CCA test result if tested)',
      'Air filter condition',
      'Cabin air filter condition',
      'PCV valve condition',
      'Spark plug wires / coil packs (if inspectable)',
      'Evidence of oil or fluid leaks under hood',
    ],
  },
  {
    name: 'Suspension and Steering',
    icon: '⚙️',
    items: [
      'Shock / strut condition (leaks, damage)',
      'Tie rod ends (play)',
      'Ball joints (play)',
      'Sway bar links and bushings',
      'CV axle boots condition',
      'Wheel bearing (play and noise)',
      'Steering rack boots',
      'Alignment — steering wheel centering',
    ],
  },
  {
    name: 'Exhaust',
    icon: '💨',
    items: [
      'Exhaust manifold — condition, leaks',
      'Catalytic converter — condition',
      'Muffler and pipes — condition, hangers',
      'Exhaust color and smoke',
    ],
  },
  {
    name: 'Lights and Electrical',
    icon: '💡',
    items: [
      'Headlights — both beams (high and low)',
      'Tail lights',
      'Brake lights',
      'Turn signals — all four corners',
      'Reverse lights',
      'Hazard lights',
      'Dashboard warning lights active',
      'Interior lights',
      'Horn operation',
      'Windshield wipers — condition and operation',
    ],
  },
  {
    name: 'Safety and Comfort',
    icon: '✅',
    items: [
      'Seatbelts — all positions (latch, retract)',
      'Windshield — chips, cracks, visibility',
      'All windows — operation',
      'Door locks and handles — operation',
      'HVAC — heat and AC operation',
      'OBD-II scan — active or pending codes',
    ],
  },
];

const CONDITION_RATINGS = [
  { code: 'G', color: '#16a34a', label: 'Good', desc: 'No action needed at this time.' },
  { code: 'A', color: '#b45309', label: 'Attention', desc: 'Monitor or schedule for next visit.' },
  { code: 'U', color: '#dc2626', label: 'Urgent', desc: 'Requires repair — advise customer now.' },
  { code: 'N/A', color: '#6b7280', label: 'Not Applicable', desc: 'Component not present or not inspected.' },
];

export default function DVIChecklistPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) })),
        }}
      />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 32px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Resources', href: '/resources' }, { name: 'DVI Checklist', href: SLUG }]} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24, marginBottom: 32 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>
              Digital Vehicle Inspection Checklist
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: 'var(--muted, #555)', maxWidth: 600, margin: 0 }}>
              A complete multi-point inspection checklist for independent auto repair shops.
              Covers 8 categories and 70+ inspection items — use it as-is or adapt it for your shop.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'flex-start' }}>
            <button
              onClick={() => window.print()}
              style={{ background: 'var(--surface-soft, #f1f5f9)', border: '1px solid var(--line, #d1d5db)', padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              🖨 Print
            </button>
            <a
              href="/digital-vehicle-inspection-software"
              style={{ background: 'var(--accent, #dc2626)', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
            >
              Use Digital DVI in RedlineD1 →
            </a>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.4)', fontSize: 13, color: '#92400e', marginBottom: 40 }}>
          <strong>For training and reference only.</strong> This checklist is a starting point — adapt it for your shop&apos;s equipment, specializations, and local regulations. Always use qualified technicians and follow manufacturer service procedures.
        </div>

        {/* Condition rating key */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Condition rating key</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {CONDITION_RATINGS.map(({ code, color, label, desc }) => (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--surface-soft, #f9fafb)', border: '1px solid var(--line, #e5e7eb)', minWidth: 180 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color, minWidth: 28 }}>{code}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #666)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Checklist categories */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {CATEGORIES.map((cat) => (
            <section key={cat.name}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{cat.icon}</span> {cat.name}
              </h2>
              <div style={{ borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-soft, #f9fafb)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, borderBottom: '1px solid var(--line, #e5e7eb)', width: '60%' }}>Item</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600, borderBottom: '1px solid var(--line, #e5e7eb)' }}>G</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600, borderBottom: '1px solid var(--line, #e5e7eb)' }}>A</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600, borderBottom: '1px solid var(--line, #e5e7eb)' }}>U</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, borderBottom: '1px solid var(--line, #e5e7eb)' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.items.map((item, i) => (
                      <tr key={item} style={{ background: i % 2 === 0 ? 'var(--surface, #fff)' : 'var(--surface-soft, #fafafa)' }}>
                        <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--line, #f0f0f0)' }}>{item}</td>
                        <td style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line, #f0f0f0)' }}>
                          <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, border: '2px solid #16a34a' }} />
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line, #f0f0f0)' }}>
                          <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, border: '2px solid #b45309' }} />
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line, #f0f0f0)' }}>
                          <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, border: '2px solid #dc2626' }} />
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--line, #f0f0f0)', color: 'var(--muted, #888)', fontSize: 12 }}>
                          <div style={{ height: 24, borderBottom: '1px solid var(--line, #e0e0e0)', minWidth: 120 }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <div style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Make your inspections digital</h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--muted, #555)', maxWidth: 640, marginBottom: 24 }}>
            This printed checklist is a starting point. RedlineD1 turns your inspection process into a
            digital workflow — technicians capture photos, document findings by category, and customers
            receive a professional report they can view and approve from their phone.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
            {[
              { href: '/digital-vehicle-inspection-software', label: 'Digital Vehicle Inspection Software', desc: 'How RedlineD1 handles DVI end to end.' },
              { href: '/mobile-mechanic-software', label: 'Mobile Mechanic Software', desc: 'Run inspections in the field from any device.' },
              { href: '/auto-repair-invoicing-software', label: 'Estimate and Invoice', desc: 'Convert inspection findings to estimates automatically.' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} style={{ display: 'block', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: 'var(--surface, #fff)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <PageCTA
        heading="Ready to go digital?"
        subtext="RedlineD1's DVI tool runs on any phone or tablet — no separate app required."
        primaryLabel="Start Free"
        secondaryLabel="See DVI Software"
        secondaryHref="/digital-vehicle-inspection-software"
      />
    </>
  );
}
