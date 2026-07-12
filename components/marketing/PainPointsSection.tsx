import { colors, container, h2Style, card } from './theme';

const PAIN_POINTS = [
  'Estimates that never get followed up',
  'Completed jobs that never get invoiced',
  'Unpaid invoices that go unnoticed',
  'Declined work nobody revisits',
  'Technicians re-diagnosing the same problem twice',
  "Repair knowledge that lives only in one person's memory",
  'Owners digging through reports to find what matters',
  'Customer and vehicle history scattered across systems',
  'Inventory shortages discovered mid-job',
  'Limited visibility once a business has more than one location',
];

/** PainPointsSection - see LANDING_PAGE_MASTER_SPEC.md Section 5.3. */
export function PainPointsSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
          <h2 style={h2Style}>Repair shops lose money in ways most software never shows.</h2>
        </div>
        <div className="rd1-card-grid rd1-card-grid-2">
          {PAIN_POINTS.map((point) => (
            <div key={point} style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span aria-hidden="true" style={{ color: colors.primary, fontSize: '18px', lineHeight: 1 }}>&#8226;</span>
              <span style={{ fontSize: '15px', color: colors.textMain, lineHeight: 1.5 }}>{point}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: '32px', fontSize: '16px', fontWeight: 500, color: colors.textMain }}>
          RedlineD1 connects these problems inside one operating system.
        </p>
      </div>
    </section>
  );
}
