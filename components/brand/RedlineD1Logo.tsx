/**
 * components/brand/RedlineD1Logo.tsx
 *
 * Original, from-scratch SVG logo system for RedlineD1. Replaces the
 * current production asset (lib/logo.ts, a single embedded base64 PNG with
 * no variant system) as a design candidate ONLY within the isolated
 * /landing-preview route - lib/logo.ts and the live homepage are not
 * modified by this component's existence.
 *
 * Design direction (from docs/design/aura/DESIGN_VERIFIED.md brand notes):
 * a speedometer/gauge arc suggesting forward motion, paired with an
 * italic-leaning wordmark. This is an original mark authored for this
 * epic - it does not copy any existing "Redline Motors" or third-party
 * artwork, and has no external image dependency (pure inline SVG).
 */
import type { CSSProperties } from 'react';
import { colors } from '@/components/marketing/theme';

export type LogoVariant = 'full' | 'compact' | 'monochrome';
export type LogoBackground = 'light' | 'dark';

interface RedlineD1LogoProps {
  variant?: LogoVariant;
  background?: LogoBackground;
  tagline?: boolean;
  height?: number;
  style?: CSSProperties;
  className?: string;
}

/** The gauge/arc mark shared by every variant. */
function GaugeMark({ stroke, needle, id }: { stroke: string; needle: string; id: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="40"
      height="40"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {/* Outer gauge arc - ~270 degrees, open at the bottom to suggest a speedometer sweep */}
      <path
        d="M 9 35 A 18 18 0 1 1 39 35"
        fill="none"
        stroke={stroke}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* Redline arc segment - the top-right "redline" zone of the gauge */}
      <path
        d="M 24 6 A 18 18 0 0 1 39 35"
        fill="none"
        stroke={colors.primary}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Needle, angled toward the redline zone to suggest forward motion / performance */}
      <line
        x1="24"
        y1="24"
        x2="33"
        y2="14"
        stroke={needle}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="24" cy="24" r="3.5" fill={needle} />
      <title id={id}>RedlineD1 gauge mark</title>
    </svg>
  );
}

/**
 * RedlineD1Logo - accessible SVG logo component.
 *
 * variant: 'full' (mark + wordmark), 'compact' (mark only), 'monochrome'
 * (single-color mark + wordmark, no brand red - for contexts where the red
 * accent would clash, e.g. printed on a colored background).
 * background: 'light' | 'dark' - controls wordmark/needle color so it
 * remains legible on both surfaces (see DESIGN_VERIFIED.md's text-on-dark
 * requirement).
 */
export function RedlineD1Logo({
  variant = 'full',
  background = 'light',
  tagline = false,
  height = 40,
  style,
  className,
}: RedlineD1LogoProps) {
  const isDark = background === 'dark';
  const wordmarkColor = variant === 'monochrome' ? (isDark ? colors.textOnDark : colors.textMain) : isDark ? colors.textOnDark : colors.textMain;
  const accentColor = variant === 'monochrome' ? wordmarkColor : colors.primary;
  const gaugeStroke = isDark ? 'rgba(250,250,250,0.4)' : 'rgba(23,23,23,0.25)';
  const needleColor = variant === 'monochrome' ? wordmarkColor : colors.primary;
  const scale = height / 40;
  const titleId = `rd1-logo-${variant}-${background}`;

  return (
    <span
      role="img"
      aria-label="RedlineD1 - Automotive Business Operating System"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${8 * scale}px`,
        lineHeight: 1,
        ...style,
      }}
    >
      <span style={{ transform: `scale(${scale})`, transformOrigin: 'left center' }}>
        <GaugeMark stroke={gaugeStroke} needle={needleColor} id={titleId} />
      </span>
      {variant !== 'compact' && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: `${20 * scale}px`,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: wordmarkColor,
              whiteSpace: 'nowrap',
            }}
          >
            REDLINE
            <span style={{ fontStyle: 'italic', fontWeight: 700, color: accentColor }}>D1</span>
          </span>
          {tagline && (
            <span
              style={{
                fontSize: `${9 * scale}px`,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: isDark ? 'rgba(250,250,250,0.55)' : colors.textMuted,
                whiteSpace: 'nowrap',
              }}
            >
              Automotive Business Operating System
            </span>
          )}
        </span>
      )}
    </span>
  );
}
