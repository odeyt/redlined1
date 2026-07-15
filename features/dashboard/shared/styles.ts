import type { CSSProperties } from 'react';

export const cardClick: CSSProperties = {
  cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s, background 0.15s',
};

export const dashStyle = `
  /* ── KPI hero cards ── */
  .dash-kpi:hover {
    transform: translateY(-3px) scale(1.01);
    box-shadow: 0 14px 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09) !important;
  }

  /* ── Table rows ── */
  .dash-row:hover {
    background: rgba(255,255,255,0.04) !important;
  }
  [data-theme="light"] .dash-row:hover {
    background: var(--surface-soft) !important;
  }

  /* ── Parts mini-card ── */
  .dash-parts:hover {
    background: rgba(255,255,255,0.04) !important;
    border-radius: 8px;
  }
  [data-theme="light"] .dash-parts:hover {
    background: var(--surface-soft) !important;
  }

  /* ── Chart bars ── */
  .dash-bar {
    background: linear-gradient(180deg, #e03030 0%, #7a0a0a 100%) !important;
    box-shadow: 0 0 10px rgba(224,48,48,0.4);
  }
  [data-theme="light"] .dash-bar {
    background: var(--accent) !important;
    box-shadow: none;
  }
  .dash-bar:hover {
    filter: brightness(1.3);
    transform: scaleY(1.05);
    transform-origin: bottom;
    box-shadow: 0 0 20px rgba(224,48,48,0.65) !important;
  }

  /* ── Financial section divider ── */
  .dash-fin-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 28px 0 16px;
  }
  .dash-fin-head-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .dash-fin-head-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--line) 0%, transparent 100%);
  }

  /* ── Panel: neon accent top-line on hover ── */
  [data-theme="dark"] .panel:hover {
    border-color: rgba(224,48,48,0.22);
    box-shadow: 0 6px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(224,48,48,0.1), inset 0 1px 0 rgba(255,255,255,0.05);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  /* ── Status badge glow in dark ── */
  [data-theme="dark"] .dash-badge-paid   { box-shadow: 0 0 8px rgba(34,197,94,0.35); }
  [data-theme="dark"] .dash-badge-open   { box-shadow: 0 0 8px rgba(96,165,250,0.35); }
  [data-theme="dark"] .dash-badge-draft  { box-shadow: 0 0 8px rgba(245,158,11,0.35); }
`;
