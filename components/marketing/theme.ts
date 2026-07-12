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
  primary: '#B42318',
  primaryHover: '#991B12',
  surfaceBg: '#FAFAFA',
  surfaceWhite: '#FFFFFF',
  surfaceDark: '#171717',
  textMain: '#171717',
  textOnDark: '#FAFAFA',
  textMuted: '#525252', // darker than the spec's #737373 for extra safety margin on small text
  textLight: '#A3A3A3', // DECORATIVE ONLY - fails WCAG AA as text per DESIGN_VERIFIED.md. Never used for copy in these components.
  borderLight: '#E5E5E5',
  borderDark: 'rgba(255,255,255,0.12)',
  success: '#059669',
  successBg: '#ECFDF5',
  warning: '#F59E0B',
  warningOnDark: '#FBBF24',
  focusRing: '#2563EB',
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
  fontSize: 'clamp(28px, 4vw, 36px)',
  fontWeight: 500,
  lineHeight: 1.15,
  letterSpacing: '-0.025em',
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
  color: colors.surfaceWhite,
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
  background: colors.surfaceWhite,
  color: colors.textMain,
  fontWeight: 600,
  fontSize: '15px',
  padding: '13px 24px',
  borderRadius: layout.radiusSm,
  border: `1px solid ${colors.borderLight}`,
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
  background: '#F5F5F5',
  color: '#A3A3A3',
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

