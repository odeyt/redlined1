'use client';

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
  animated?: boolean;
}

/** CSS keyframes injected once into the document head. */
const KEYFRAMES = `
@keyframes rd1-needle-rev {
  0%   { transform: rotate(-60deg); }
  30%  { transform: rotate(52deg);  }
  55%  { transform: rotate(20deg);  }
  75%  { transform: rotate(62deg);  }
  90%  { transform: rotate(10deg);  }
  100% { transform: rotate(-60deg); }
}
`;

let injected = false;
function injectKeyframes() {
  if (typeof document === 'undefined' || injected) return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
}

/** Gauge mark — needle animates when animated=true. */
function GaugeMark({
  stroke,
  needle,
  id,
  animated,
}: {
  stroke: string;
  needle: string;
  id: string;
  animated: boolean;
}) {
  if (animated) injectKeyframes();

  return (
    <svg
      viewBox="0 0 48 48"
      width="40"
      height="40"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, overflow: 'visible' }}
    >
      {/* Outer gauge arc — ~270°, open at bottom */}
      <path
        d="M 9 35 A 18 18 0 1 1 39 35"
        fill="none"
        stroke={stroke}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* Redline arc — top-right high-rpm zone */}
      <path
        d="M 24 6 A 18 18 0 0 1 39 35"
        fill="none"
        stroke={colors.primary}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Tick marks at low, mid, and redline */}
      {[
        { angle: -90, opacity: 0.3 },
        { angle: -45, opacity: 0.3 },
        { angle: 0,   opacity: 0.3 },
        { angle: 45,  opacity: 0.6 },
        { angle: 80,  opacity: 1   },
      ].map(({ angle, opacity }) => {
        const rad = (angle * Math.PI) / 180;
        const cx = 24, cy = 24, r = 18;
        const x1 = cx + (r - 3.5) * Math.cos(rad - Math.PI / 2);
        const y1 = cy + (r - 3.5) * Math.sin(rad - Math.PI / 2);
        const x2 = cx + (r - 6.5) * Math.cos(rad - Math.PI / 2);
        const y2 = cy + (r - 6.5) * Math.sin(rad - Math.PI / 2);
        return (
          <line
            key={angle}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={angle >= 45 ? colors.primary : stroke}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={opacity}
          />
        );
      })}
      {/* Needle — pivots from centre, animated via CSS transform-origin */}
      <g
        style={{
          transformOrigin: '24px 24px',
          animation: animated
            ? 'rd1-needle-rev 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite'
            : undefined,
          transform: animated ? undefined : 'rotate(30deg)',
        }}
      >
        <line
          x1="24" y1="24"
          x2="24" y2="9"
          stroke={needle}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
      {/* Centre pivot dot */}
      <circle cx="24" cy="24" r="3.5" fill={needle} />
      <title id={id}>RedlineD1 gauge mark</title>
    </svg>
  );
}

/**
 * RedlineD1Logo — accessible SVG logo.
 *
 * animated=true  → needle revs up and down automatically (used on login page
 *                  and marketing header)
 * animated=false → static needle at mid-high position (sidebar, app header)
 *
 * variant: 'full' | 'compact' | 'monochrome'
 * background: 'light' | 'dark'
 */
export function RedlineD1Logo({
  variant = 'full',
  background = 'light',
  tagline = false,
  height = 40,
  animated = false,
  style,
  className,
}: RedlineD1LogoProps) {
  const isDark = background === 'dark';
  const wordmarkColor =
    variant === 'monochrome'
      ? isDark ? colors.textOnDark : colors.textMain
      : isDark ? colors.textOnDark : colors.textMain;
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
        <GaugeMark stroke={gaugeStroke} needle={needleColor} id={titleId} animated={animated} />
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
