type Maturity = 'Standard' | 'Limited' | 'Available' | 'Advanced' | 'Evidence-Based' | 'Planned';

const ROWS: { category: string; traditional: Maturity; redline: Maturity }[] = [
  { category: 'Customers',                       traditional: 'Standard', redline: 'Available'       },
  { category: 'Vehicles',                        traditional: 'Standard', redline: 'Available'       },
  { category: 'Estimates',                       traditional: 'Standard', redline: 'Available'       },
  { category: 'Repair Orders',                   traditional: 'Limited',  redline: 'Available'       },
  { category: 'Invoices',                        traditional: 'Standard', redline: 'Available'       },
  { category: 'Inventory',                       traditional: 'Limited',  redline: 'Available'       },
  { category: 'Technician Workflow',             traditional: 'Limited',  redline: 'Available'       },
  { category: 'Repair Intelligence',             traditional: 'Planned',  redline: 'Evidence-Based'  },
  { category: 'Vehicle Intelligence',            traditional: 'Limited',  redline: 'Advanced'        },
  { category: 'Customer Lifetime Intelligence',  traditional: 'Limited',  redline: 'Advanced'        },
  { category: 'Owner Decision Intelligence',     traditional: 'Limited',  redline: 'Evidence-Based'  },
  { category: 'Business Memory',                 traditional: 'Planned',  redline: 'Available'       },
  { category: 'Evidence-Based Recommendations',  traditional: 'Planned',  redline: 'Evidence-Based'  },
  { category: 'Knowledge Retention',             traditional: 'Limited',  redline: 'Advanced'        },
  { category: 'Migration Assistance',            traditional: 'Standard', redline: 'Available'       },
  { category: 'Mobile Readiness',                traditional: 'Limited',  redline: 'Available'       },
  { category: 'Digital Vehicle Inspections',     traditional: 'Limited',  redline: 'Available'       },
];

const BADGE: Record<Maturity, { bg: string; fg: string; label: string }> = {
  Standard:        { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.35)', label: 'Standard'       },
  Limited:         { bg: 'rgba(255,255,255,0.04)', fg: 'rgba(255,255,255,0.25)', label: 'Limited'        },
  Available:       { bg: 'rgba(34,197,94,0.12)',   fg: '#22c55e',                label: 'Available'      },
  Advanced:        { bg: 'rgba(99,102,241,0.15)',  fg: '#818cf8',                label: 'Advanced'       },
  'Evidence-Based':{ bg: 'rgba(204,0,0,0.15)',     fg: '#ff6666',                label: 'Evidence-Based' },
  Planned:         { bg: 'rgba(255,255,255,0.04)', fg: 'rgba(255,255,255,0.2)',  label: 'Planned'        },
};

function MaturityBadge({ value }: { value: Maturity }) {
  const c = BADGE[value];
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      background: c.bg, color: c.fg,
    }}>
      {c.label}
    </span>
  );
}

/**
 * ComparisonSection — never names a specific competitor.
 * "Traditional Shop Software" is a generic category label.
 */
export function ComparisonSection() {
  return (
    <section id="comparison" style={{ paddingBlock: 'clamp(56px,8vw,128px)', background: '#0d0d14', position: 'relative', overflow: 'hidden' }}>

      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.03) 1px,transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: '5%', width: 500, height: 350, background: 'radial-gradient(ellipse,rgba(99,102,241,0.07) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Feature Comparison</span>
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,46px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 14px', maxWidth: 680, lineHeight: 1.1 }}>
            Traditional shop software vs.<br />
            <span style={{ color: '#cc0000' }}>RedlineD1 Automotive Business OS.</span>
          </h2>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th scope="col" style={{ textAlign: 'left', padding: '16px 20px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.07)', width: '45%' }}>Category</th>
                <th scope="col" style={{ textAlign: 'left', padding: '16px 20px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Traditional Shop Software</th>
                <th scope="col" style={{ textAlign: 'left', padding: '16px 20px', fontSize: 11, fontWeight: 700, color: '#cc0000', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>RedlineD1</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.category} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <th scope="row" style={{ textAlign: 'left', padding: '13px 20px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {row.category}
                  </th>
                  <td style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <MaturityBadge value={row.traditional} />
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <MaturityBadge value={row.redline} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.2)', maxWidth: 760, lineHeight: 1.7, fontStyle: 'italic' }}>
          "Traditional Shop Software" describes common patterns across general-purpose shop-management tools, not any specific product.
          RedlineD1 ratings reflect verified, currently shipped capability — see the Product Evolution section for what is available now versus rolling out.
        </p>
      </div>
    </section>
  );
}
