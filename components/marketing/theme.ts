/**
 * components/marketing/theme.ts
 *
 * Shared style tokens for the /landing-preview marketing route, sourced from
 * docs/design/aura/DESIGN_VERIFIED.md (the normalized Aura spec, NOT the raw
 * alpha DESIGN.md). Plain TS objects, consumed as inline React style objects,
 * matching the existing app/portal/page.tsx convention (no Tailwind is
 * installed in this repo - see docs/design/aura/M2_CHANGE_MANIFEST.md).
 */
import type { CSSProperties } from 'react';

export const colors = {
  primary: '#cc0000',
  primaryHover: '#e60000',
  white: '#ffffff',
  surfaceBg: '#080808',
  surfaceWhite: '#111111',
  surfaceDark: '#0a0a0a',
  textMain: '#f0f0f0',
  textOnDark: '#f0f0f0',
  textMuted: '#888888',
  textLight: '#555555',
  borderLight: 'rgba(255,255,255,0.08)',
  borderDark: 'rgba(255,255,255,0.14)',
  success: '#10b981',
  successText: '#34d399',
  successBg: 'rgba(16,185,129,0.1)',
  warning: '#f59e0b',
  warningOnDark: '#fbbf24',
  focusRing: '#cc0000',
} as const;

export const font = {
  family: "'Inter', system-ui, -apple-system, sans-serif",
} as const;

export const layout = {
  containerMax: '1280px',
  sectionPadY: 'clamp(56px, 8vw, 128px)',
  radiusSm: '6px',
  radiusLg: '16px',
  radiusFull: '9999px',
};

export const container: CSSProperties = {
  maxWidth: layout.containerMax,
  marginInline: 'auto',
  paddingInline: '24px',
};

export const sectionBase: CSSProperties = {
  paddingBlock: layout.sectionPadY,
};

export const eyebrow: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: colors.primary,
};

export const h2Style: CSSProperties = {
  fontSize: 'clamp(28px, 4vw, 40px)',
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: '-0.03em',
  color: colors.textMain,
  margin: 0,
};

export const bodyLg: CSSProperties = {
  fontSize: '18px',
  lineHeight: 1.6,
  color: colors.textMuted,
};

export const buttonPrimary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  background: colors.primary,
  color: colors.white,
  fontWeight: 600,
  fontSize: '15px',
  padding: '13px 24px',
  borderRadius: layout.radiusSm,
  border: `1px solid ${colors.primary}`,
  cursor: 'pointer',
  minHeight: '44px',
  textDecoration: 'none',
  transition: 'background-color 0.15s ease, transform 0.15s ease',
};

export const buttonSecondary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  background: 'rgba(255,255,255,0.06)',
  color: colors.textMain,
  fontWeight: 600,
  fontSize: '15px',
  padding: '13px 24px',
  borderRadius: layout.radiusSm,
  border: `1px solid ${colors.borderDark}`,
  cursor: 'pointer',
  minHeight: '44px',
  textDecoration: 'none',
  transition: 'background-color 0.15s ease, transform 0.15s ease',
};

export const buttonDisabled: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  background: 'rgba(255,255,255,0.05)',
  color: '#555555',
  fontWeight: 600,
  fontSize: '15px',
  padding: '13px 24px',
  borderRadius: layout.radiusSm,
  border: `1px solid ${colors.borderLight}`,
  cursor: 'not-allowed',
  minHeight: '44px',
};

export const card: CSSProperties = {
  background: colors.surfaceWhite,
  border: `1px solid ${colors.borderLight}`,
  borderRadius: layout.radiusLg,
  padding: '24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
};

export const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '3px 8px',
  borderRadius: layout.radiusFull,
};

export const disclaimer: CSSProperties = {
  fontSize: '13px',
  color: colors.textMuted,
  lineHeight: 1.5,
  fontStyle: 'italic',
};

