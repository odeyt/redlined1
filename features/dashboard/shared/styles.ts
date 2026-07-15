import type { CSSProperties } from 'react';

export const cardClick: CSSProperties = {
  cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s, background 0.15s',
};

export const dashStyle = `
  .dash-kpi:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.13);
    background: var(--surface-soft) !important;
  }
  .dash-row:hover {
    background: var(--surface-soft) !important;
  }
  .dash-parts:hover {
    background: var(--surface-soft) !important;
  }
  .dash-bar:hover {
    filter: brightness(1.25);
    transform: scaleY(1.04);
    transform-origin: bottom;
  }
`;
