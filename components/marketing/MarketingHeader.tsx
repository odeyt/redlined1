'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { colors, buttonPrimary, buttonSecondary } from './theme';

const NAV_LINKS = [
  { href: '#workflow', label: 'Product' },
  { href: '#intelligence', label: 'Intelligence' },
  { href: '#migration', label: 'Migration' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * MarketingHeader - sticky glassmorphic nav bar.
 *
 * Mobile navigation is a real accessible disclosure pattern (not "hinted"
 * buttons, which DESIGN_VERIFIED.md flagged as a FAIL): aria-expanded on the
 * toggle, Escape closes it, a focus trap keeps keyboard focus inside the
 * open panel, and the toggle/links meet a 44x44px minimum touch target.
 */
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(250, 250, 250, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid rgba(0,0,0,0.06)`,
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          marginInline: 'auto',
          paddingInline: '24px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="#top" aria-label="RedlineD1 home" style={{ display: 'flex', alignItems: 'center' }}>
          <RedlineD1Logo variant="full" height={32} animated={true} />
        </Link>

        <nav aria-label="Primary" style={{ display: 'none' }} className="rd1-desktop-nav">
          <ul style={{ display: 'flex', gap: '28px', listStyle: 'none', margin: 0, padding: 0 }}>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  style={{
                    color: colors.textMuted,
                    fontSize: '14px',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div style={{ display: 'none', alignItems: 'center', gap: '12px' }} className="rd1-desktop-actions">
          <Link href="/login" style={{ ...buttonSecondary, padding: '10px 18px', fontSize: '14px' }}>
            Sign In
          </Link>
          <Link href="/signup" style={{ ...buttonPrimary, padding: '10px 18px', fontSize: '14px' }}>
            Start Free Trial
          </Link>
        </div>

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="rd1-mobile-nav-panel"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
          className="rd1-mobile-toggle"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            border: `1px solid ${colors.borderLight}`,
            borderRadius: '6px',
            background: colors.surfaceWhite,
            cursor: 'pointer',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '18px' }}>{open ? '✕' : '☰'}</span>
        </button>
      </div>

      {open && (
        <div
          id="rd1-mobile-nav-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="rd1-mobile-panel"
          style={{
            borderTop: `1px solid ${colors.borderLight}`,
            background: colors.surfaceWhite,
            padding: '16px 24px 24px',
          }}
        >
          <nav aria-label="Mobile">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '44px',
                      color: colors.textMain,
                      fontSize: '16px',
                      fontWeight: 500,
                      textDecoration: 'none',
                    }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <Link href="/login" style={{ ...buttonSecondary, width: '100%' }} onClick={() => setOpen(false)}>
              Sign In
            </Link>
            <Link href="/signup" style={{ ...buttonPrimary, width: '100%' }} onClick={() => setOpen(false)}>
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
