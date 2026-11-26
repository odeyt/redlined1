'use client';

// SI-5: one recommendation as a decision. Answers, in order:
//   Do this → Why it matters → Evidence (the actual records) → Impact → buttons
// Shown inside a Command Center recommendation card when the
// actionable_recommendations flag is on. Read-only: it changes nothing, it
// only opens the screen where staff act.

import { formatMoney } from '@/lib/currencies';
import type { DecisionEvidence, EvidenceRecord } from '@/lib/intelligence/decisionEvidence';

function RecordRow({ r }: { r: EvidenceRecord }) {
  const who = [r.customer, r.vehicle, r.detail].filter(Boolean).join(' · ');
  return (
    <li style={{
      display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 6, padding: '7px 11px', fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{r.label}</span>
      {who && <span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' }}>{who}</span>}
      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{r.note}</span>
      {r.amount != null && (
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(r.amount, r.currency ?? undefined)}
        </span>
      )}
    </li>
  );
}

export function DecisionPanel({
  decision, whyItMatters, accent, onNavigate,
}: {
  decision: DecisionEvidence;
  whyItMatters: string | null;
  accent: string;
  onNavigate: (module: string) => void;
}) {
  const label = { fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 5 };
  const hidden = decision.recordCount - decision.records.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="decision-panel">
      <div>
        <div style={label}>Do this</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.5 }}>{decision.nextStep}</div>
      </div>

      {whyItMatters && (
        <div>
          <div style={label}>Why it matters</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{whyItMatters}</div>
        </div>
      )}

      <div>
        <div style={label}>
          Evidence · {decision.recordCount} record{decision.recordCount === 1 ? '' : 's'}
        </div>
        {decision.records.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {decision.records.map((r, i) => <RecordRow key={`${r.label}-${i}`} r={r} />)}
          </ul>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>No matching records right now.</div>
        )}
        {hidden > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
            Showing the first {decision.records.length} of {decision.recordCount}. The total below covers all of them.
          </div>
        )}
      </div>

      <div>
        <div style={label}>Impact</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#059669', lineHeight: 1.5 }}>{decision.impact}</div>
      </div>

      {decision.actions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {decision.actions.map(a => (
            <button
              key={a.module}
              type="button"
              onClick={() => onNavigate(a.module)}
              style={{
                fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 999,
                border: `1.5px solid ${accent}`, background: `${accent}14`, color: 'var(--text)', cursor: 'pointer',
              }}>
              {a.label} →
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
