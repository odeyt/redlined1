'use client';

// ── Shared status color map used everywhere in the portal ──────────
export const STATUS_PILL_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  // Universal
  'All':              { bg: '#0d2436',                   text: '#ffffff',  border: '#1b4965',                dot: '#ffffff' },

  // Progress / workflow
  'In Progress':      { bg: 'rgba(37,99,235,0.1)',        text: '#1d4ed8',  border: 'rgba(37,99,235,0.35)',   dot: '#2563eb' },
  'Active':           { bg: 'rgba(16,185,129,0.1)',       text: '#059669',  border: 'rgba(16,185,129,0.35)',  dot: '#10b981' },
  'Open':             { bg: 'rgba(37,99,235,0.1)',        text: '#1d4ed8',  border: 'rgba(37,99,235,0.35)',   dot: '#2563eb' },

  // Done / closed
  'Completed':        { bg: 'rgba(22,163,74,0.1)',        text: '#15803d',  border: 'rgba(22,163,74,0.35)',   dot: '#16a34a' },
  'Complete':         { bg: 'rgba(22,163,74,0.1)',        text: '#15803d',  border: 'rgba(22,163,74,0.35)',   dot: '#16a34a' },
  'Closed':           { bg: 'rgba(22,163,74,0.1)',        text: '#15803d',  border: 'rgba(22,163,74,0.35)',   dot: '#16a34a' },
  'Paid':             { bg: 'rgba(22,163,74,0.1)',        text: '#15803d',  border: 'rgba(22,163,74,0.35)',   dot: '#16a34a' },
  'Approved':         { bg: 'rgba(22,163,74,0.1)',        text: '#15803d',  border: 'rgba(22,163,74,0.35)',   dot: '#16a34a' },
  'Converted':        { bg: 'rgba(16,185,129,0.1)',       text: '#047857',  border: 'rgba(16,185,129,0.35)',  dot: '#059669' },

  // Pending / waiting
  'Pending':          { bg: 'rgba(245,158,11,0.1)',       text: '#b45309',  border: 'rgba(245,158,11,0.35)',  dot: '#d97706' },
  'Pending Approval': { bg: 'rgba(139,92,246,0.1)',       text: '#6d28d9',  border: 'rgba(139,92,246,0.35)', dot: '#7c3aed' },
  'Pending Parts':    { bg: 'rgba(249,115,22,0.1)',       text: '#c2410c',  border: 'rgba(249,115,22,0.35)', dot: '#ea580c' },
  'Waiting Customer': { bg: 'rgba(245,158,11,0.1)',       text: '#b45309',  border: 'rgba(245,158,11,0.35)', dot: '#d97706' },

  // Draft / unsent
  'Draft':            { bg: 'rgba(107,114,128,0.1)',      text: '#4b5563',  border: 'rgba(107,114,128,0.3)', dot: '#6b7280' },

  // Sent / outbound
  'Sent':             { bg: 'rgba(59,130,246,0.1)',       text: '#2563eb',  border: 'rgba(59,130,246,0.35)', dot: '#3b82f6' },

  // Problems / negative
  'Returned Job':     { bg: 'rgba(234,179,8,0.1)',        text: '#92400e',  border: 'rgba(234,179,8,0.35)',  dot: '#ca8a04' },
  'Declined':         { bg: 'rgba(239,68,68,0.1)',        text: '#b91c1c',  border: 'rgba(239,68,68,0.35)',  dot: '#dc2626' },
  'Cancelled':        { bg: 'rgba(239,68,68,0.08)',       text: '#9f1239',  border: 'rgba(239,68,68,0.25)',  dot: '#e11d48' },
  'Overdue':          { bg: 'rgba(239,68,68,0.12)',       text: '#b91c1c',  border: 'rgba(239,68,68,0.4)',   dot: '#dc2626' },

  // Parts orders
  'Ordered':          { bg: 'rgba(59,130,246,0.1)',       text: '#1d4ed8',  border: 'rgba(59,130,246,0.35)', dot: '#3b82f6' },
  'Deposit Paid':     { bg: 'rgba(139,92,246,0.1)',       text: '#6d28d9',  border: 'rgba(139,92,246,0.35)', dot: '#7c3aed' },
  'Backordered':      { bg: 'rgba(249,115,22,0.1)',       text: '#c2410c',  border: 'rgba(249,115,22,0.35)', dot: '#ea580c' },
  'Received':         { bg: 'rgba(22,163,74,0.1)',        text: '#15803d',  border: 'rgba(22,163,74,0.35)',  dot: '#16a34a' },
  'Returned':         { bg: 'rgba(148,163,184,0.1)',      text: '#475569',  border: 'rgba(148,163,184,0.3)', dot: '#94a3b8' },

  // Neutral / archive
  'No open jobs':     { bg: 'rgba(148,163,184,0.08)',     text: '#475569',  border: 'rgba(148,163,184,0.25)',dot: '#94a3b8' },
  'Archived':         { bg: 'rgba(107,114,128,0.08)',     text: '#4b5563',  border: 'rgba(107,114,128,0.2)', dot: '#9ca3af' },
};

export const STATUS_ICONS: Record<string, string> = {
  'All':              '☰',
  'Open':             '📋',
  'In Progress':      '🔧',
  'Pending Parts':    '📦',
  'Pending Approval': '⏳',
  'Complete':         '✅',
  'Completed':        '✅',
  'Closed':           '🔒',
  'Void':             '🚫',
  'Draft':            '✏️',
  'Sent':             '📤',
  'Approved':         '✅',
  'Declined':         '❌',
  'Cancelled':        '🚫',
  'Returned':         '↩️',
  'Returned Job':     '↩️',
  'Overdue':          '⚠️',
  'Ordered':          '🛒',
  'Deposit Paid':     '💰',
  'Backordered':      '⏸️',
  'Received':         '📬',
  'Waiting Customer': '👤',
  'Pending':          '🕐',
  'Pending Customer': '👤',
  'Active':           '▶️',
  'Archived':         '🗃️',
};

function getColor(status: string) {
  return STATUS_PILL_COLORS[status] ?? { bg: 'rgba(107,114,128,0.1)', text: '#4b5563', border: 'rgba(107,114,128,0.3)', dot: '#6b7280' };
}

interface FilterPillsProps {
  statuses: string[];
  active: string;
  counts?: Record<string, number>;
  onChange: (s: string) => void;
}

export function FilterPills({ statuses, active, counts, onChange }: FilterPillsProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {statuses.map(s => {
        const isActive = active === s;
        const c = getColor(s);
        const count = counts?.[s];
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 16px',
              borderRadius: 99,
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              border: `1.5px solid ${isActive ? c.border : 'var(--line)'}`,
              background: isActive ? c.bg : 'var(--surface-soft)',
              color: isActive ? c.text : 'var(--muted)',
              transition: 'all 0.14s',
              whiteSpace: 'nowrap',
              letterSpacing: isActive ? '0.01em' : '0',
              boxShadow: isActive ? `0 0 0 3px ${c.border}55` : 'none',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.background = c.bg;
                e.currentTarget.style.color = c.text;
                e.currentTarget.style.borderColor = c.border;
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--surface-soft)';
                e.currentTarget.style.color = 'var(--muted)';
                e.currentTarget.style.borderColor = 'var(--line)';
              }
            }}
          >
            {STATUS_ICONS[s] ? (
              <span style={{ fontSize: 13, lineHeight: 1 }}>{STATUS_ICONS[s]}</span>
            ) : (
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: isActive ? c.dot : 'var(--muted)',
                flexShrink: 0,
                opacity: isActive ? 1 : 0.45,
                transition: 'background 0.14s',
              }} />
            )}
            {s}
            {count !== undefined && (
              <span style={{
                background: isActive ? c.dot : 'rgba(107,114,128,0.18)',
                color: isActive ? '#fff' : 'var(--muted)',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 700,
                padding: '1px 7px',
                lineHeight: 1.5,
                transition: 'all 0.14s',
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
