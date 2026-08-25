'use client';

/**
 * Stage one of vehicle-first discovery: OEM references, not parts.
 *
 * ## What this screen is allowed to claim
 *
 * Almost nothing. The vehicle-scoped endpoint returns two fields — a part
 * name and an OEM number — proven by a controlled live call. There is no
 * brand, no price, no image, no supplier and no applicability evidence at
 * this stage, so this component shows no price, no brand, no image, no
 * "Add to Estimate" and no fitment verdict.
 *
 * It deliberately does NOT say LIKELY FIT. Fitment describes a part, and
 * there is no part yet — only a number the catalogue lists against this
 * vehicle. It says CATALOG VEHICLE REFERENCE, which is exactly what it has.
 *
 * ## Why the list is filtered and paged rather than trimmed
 *
 * One live query returned 186 references under a single product name. The
 * first fix capped the server response at 60, which dropped 126 of them while
 * the count beside the list still read like the whole answer. Long lists are
 * a UI problem: every reference is delivered, and the technician narrows them
 * here. No provider call is made by filtering, paging or sorting.
 */
import { useMemo, useState } from 'react';

export interface OemReferenceGroup {
  productName: string;
  oemNumbers: string[];
  relevance: 'high' | 'medium' | 'low';
}

interface Props {
  groups: OemReferenceGroup[];
  /** Runs the canonical OEM catalogue search for one reference. */
  onSelect: (oemNumber: string) => void;
  /** True while that search is in flight, so the list cannot be double-fired. */
  busy?: boolean;
}

/** Shown before paging. Enough to judge the list, short enough to scroll past. */
const PAGE = 25;

const RELEVANCE_LABEL: Record<string, string> = {
  high: 'MATCHES YOUR SEARCH',
  medium: 'PARTIAL SEARCH MATCH',
  low: 'DIFFERENT PART',
};

/** Loose match so "7L0 698" finds "7L0698151M". */
function matches(oem: string, filter: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const f = norm(filter);
  return !f || norm(oem).includes(f);
}

function ReferenceGroup({ group, onSelect, busy }: { group: OemReferenceGroup } & Omit<Props, 'groups'>) {
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(
    () => group.oemNumbers.filter(o => matches(o, filter)),
    [group.oemNumbers, filter],
  );
  const page = visible.slice(0, shown);
  const total = group.oemNumbers.length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{group.productName}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {RELEVANCE_LABEL[group.relevance]}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
        {total} OEM reference{total === 1 ? '' : 's'} found for this catalog vehicle.
      </div>

      {total > PAGE && (
        <input
          value={filter}
          onChange={e => { setFilter(e.target.value); setShown(PAGE); }}
          placeholder="Search OEM references"
          aria-label={`Search OEM references for ${group.productName}`}
          style={{
            width: '100%', maxWidth: 320, marginTop: 8, padding: '8px 10px',
            borderRadius: 8, border: '1px solid var(--line)', fontSize: 13,
            background: 'var(--surface)', color: 'var(--text)', minHeight: 38,
          }}
        />
      )}

      {/* Always states what is on screen against what exists. A list that
          shows 25 of 186 without saying so reads as the whole answer. */}
      <div style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 6px' }}>
        {visible.length === 0
          ? `No reference matches "${filter}".`
          : `Showing ${page.length} of ${visible.length}${
            visible.length !== total ? ` (filtered from ${total})` : ''}`}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {page.map(oem => (
          <button
            key={oem}
            type="button"
            disabled={busy}
            onClick={() => onSelect(oem)}
            title={`Search the parts catalog for ${oem}`}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              cursor: busy ? 'default' : 'pointer', minHeight: 34,
              border: '1px solid var(--line)', background: 'transparent',
              color: 'var(--text)', opacity: busy ? 0.5 : 1,
            }}
          >
            {oem}
          </button>
        ))}
      </div>

      {page.length < visible.length && (
        <button
          type="button"
          onClick={() => setShown(n => n + PAGE)}
          style={{
            marginTop: 8, padding: '7px 14px', borderRadius: 999, fontSize: 12,
            fontWeight: 700, cursor: 'pointer', minHeight: 34,
            border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)',
          }}
        >
          Show more ({visible.length - page.length} left)
        </button>
      )}
    </div>
  );
}

export function VehicleOemReferences({ groups, onSelect, busy }: Props) {
  if (!groups.length) return null;

  return (
    <div data-testid="vehicle-oem" style={{
      border: '1px solid var(--line)', borderRadius: 10, padding: 14,
      background: 'var(--surface-soft)', marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
        VEHICLE PART REFERENCES
      </div>
      {/* The stage label. Never a fitment verdict: there is no part yet. */}
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.06em', marginTop: 2 }}>
        CATALOG VEHICLE REFERENCE
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 12px' }}>
        Select an OEM reference to search the parts catalog. These are part numbers
        the catalog lists for this vehicle — not offers, and not yet checked for fitment.
      </div>

      {groups.map(g => (
        <ReferenceGroup key={g.productName} group={g} onSelect={onSelect} busy={busy} />
      ))}
    </div>
  );
}
