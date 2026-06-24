import type { CSSProperties } from 'react';

/**
 * Deterministic, consistent color assignment for technician names.
 * The same name always gets the same color across every view.
 * Colors are chosen to be readable on both light and dark backgrounds.
 */

const TECH_PALETTE: { bg: string; text: string; border: string }[] = [
  { bg: 'rgba(239,68,68,0.12)',   text: '#dc2626', border: 'rgba(239,68,68,0.35)'   }, // red
  { bg: 'rgba(249,115,22,0.12)',  text: '#ea580c', border: 'rgba(249,115,22,0.35)'  }, // orange
  { bg: 'rgba(234,179,8,0.14)',   text: '#b45309', border: 'rgba(234,179,8,0.4)'    }, // amber
  { bg: 'rgba(34,197,94,0.12)',   text: '#15803d', border: 'rgba(34,197,94,0.35)'   }, // green
  { bg: 'rgba(20,184,166,0.12)',  text: '#0f766e', border: 'rgba(20,184,166,0.35)'  }, // teal
  { bg: 'rgba(59,130,246,0.12)',  text: '#1d4ed8', border: 'rgba(59,130,246,0.35)'  }, // blue
  { bg: 'rgba(99,102,241,0.12)',  text: '#4338ca', border: 'rgba(99,102,241,0.35)'  }, // indigo
  { bg: 'rgba(168,85,247,0.12)',  text: '#7e22ce', border: 'rgba(168,85,247,0.35)'  }, // purple
  { bg: 'rgba(236,72,153,0.12)',  text: '#be185d', border: 'rgba(236,72,153,0.35)'  }, // pink
  { bg: 'rgba(6,182,212,0.12)',   text: '#0e7490', border: 'rgba(6,182,212,0.35)'   }, // cyan
  { bg: 'rgba(132,204,22,0.12)',  text: '#4d7c0f', border: 'rgba(132,204,22,0.35)'  }, // lime
  { bg: 'rgba(251,191,36,0.13)',  text: '#92400e', border: 'rgba(251,191,36,0.4)'   }, // yellow
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getTechColor(name: string) {
  const key = name.trim().toLowerCase();
  return TECH_PALETTE[hashName(key) % TECH_PALETTE.length];
}

/**
 * Renders a single technician name as a colored pill.
 * Returns a plain style object — apply to a <span>.
 */
export function techPillStyle(name: string): CSSProperties {
  const c = getTechColor(name);
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.02em',
    background: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
    whiteSpace: 'nowrap',
    lineHeight: 1.5,
  };
}

/**
 * Parse a comma-separated technician string into individual names.
 */
export function parseTechNames(value: string): string[] {
  return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
}
