'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { colors, buttonPrimary, buttonSecondary } from './theme';

const NAV_ITEMS = [
  {
    label: 'Product',
    href: '#workflow',
    dropdown: [
      { label: 'Job Cards & Workflow', href: '#workflow', desc: 'Manage every repair from intake to delivery' },
      { label: 'Estimates & Invoicing', href: '#workflow', desc: 'Send quotes and collect payment fast' },
      { label: 'Digital Inspections', href: '#workflow', desc: 'Photo-based reports customers approve online' },
      { label: 'Parts & Inventory', href: '#workflow', desc: 'Track stock, set reorder alerts' },
      { label: 'Appointments', href: '#workflow', desc: 'Schedule and manage service bookings' },
      { label: 'Command Center', href: '#command-center', desc: 'Full shop overview at a glance' },
    ],
  },
  {
    label: 'Intelligence',
    href: '#intelligence',
    dropdown: [
      { label: 'Repair Intelligence', href: '#intelligence', desc: 'Knowledge graph built from every closed job' },
      { label: 'Vehicle Intelligence', href: '#vehicle-intelligence', desc: 'Full vehicle health and service history' },
      { label: 'Service Advisor', href: '#service-advisor', desc: 'Evidence-backed recommendations per job' },
      { label: 'Customer Intelligence', href: '#customer-intelligence', desc: 'Lifetime value, retention, and segments' },
      { label: 'Confidence Scoring', href: '#intelligence', desc: 'Explainable 0–98% scores, never a black box' },
    ],
  },
  {
    label: 'Migration',
    href: '#migration',
    dropdown: [
      { label: 'Switch from Mitchell 1', href: '#migration', desc: 'Full data migration with zero downtime' },
      { label: 'Switch from Shop-Ware', href: '#migration', desc: 'Import customers, vehicles, and history' },
      { label: 'Switch from Tekmetric', href: '#migration', desc: 'Move your shop in a weekend' },
      { label: 'Import from Spreadsheets', href: '#migration', desc: 'CSV import for customers and vehicles' },
    ],
  },
  {
    label: 'Pricing',
    href: '#pricing',
    dropdown: [
      { label: 'Free Plan', href: '#pricing', desc: 'Core tools, up to 10 customers — always free' },
      { label: 'Pro — $29.99/mo', href: '#pricing', desc: 'Unlimited jobs, invoices, and team access' },
      { label: 'Pro Plus — $49.99/mo', href: '#pricing', desc: 'AI credits, advanced permissions, priority support' },
      { label: 'Yearly savings', href: '#pricing', desc: 'Save up to $119 by paying annually' },
    ],
  },
  {
    label: 'FAQ',
    href: '#faq',
    dropdown: [
      { label: 'How does the free trial work?', href: '#faq', desc: '7 days full Pro access, no card required' },
      { label: 'Can I import my existing data?', href: '#faq', desc: 'Yes — CSV and direct migrations supported' },
      { label: 'Is it mobile-friendly?', href: '#faq', desc: 'Yes — installable PWA, works offline' },
      { label: 'How do I get support?', href: '#faq', desc: 'Email admin@redlined1.com anytime' },
    ],
  },
];

interface DropdownItem { label: string; href: string; desc: string }

function NavDropdown({ items, onClose }: { items: DropdownItem[]; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        minWidth: '280px',
        background: colors.surfaceWhite,
        border: `1px solid ${colors.borderLight}`,
        borderRadius: '12px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '8px',
        zIndex: 200,
        animation: 'rd1-drop 0.15s ease',
      }}
    >
      <style>{`@keyframes rd1-drop { from { opacity:0; transform:translateX(-50%) translateY(-6px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`}</style>
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          onClick={onClose}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '10px 12px',
            borderRadius: '8px',
            textDecoration: 'none',
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = colors.surfaceBg)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: colors.textMain }}>{item.label}</span>
          <span style={{ fontSize: '12px', color: colors.textMuted, lineHeight: 1.4 }}>{item.desc}</span>
        </a>
      ))}
    </div>
  );
}

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openDropdown(label: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActiveDropdown(label);
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setActiveDropdown(null), 120);
  }

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
        background: 'rgba(250, 250, 250, 0.92)',
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

        {/* Desktop nav */}
        <nav aria-label="Primary" style={{ display: 'none' }} className="rd1-desktop-nav">
          <ul style={{ display: 'flex', gap: '4px', listStyle: 'none', margin: 0, padding: 0 }}>
            {NAV_ITEMS.map((item) => (
              <li
                key={item.label}
                style={{ position: 'relative' }}
                onMouseEnter={() => openDropdown(item.label)}
                onMouseLeave={scheduleClose}
              >
                <a
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    color: activeDropdown === item.label ? colors.textMain : colors.textMuted,
                    fontSize: '14px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    background: activeDropdown === item.label ? colors.surfaceBg : 'transparent',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                >
                  {item.label}
                  <svg
                    width="10" height="6" viewBox="0 0 10 6" fill="none"
                    aria-hidden="true"
                    style={{
                      transition: 'transform 0.2s',
                      transform: activeDropdown === item.label ? 'rotate(180deg)' : 'rotate(0deg)',
                      opacity: 0.5,
                    }}
                  >
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                {activeDropdown === item.label && (
                  <NavDropdown
                    items={item.dropdown}
                    onClose={() => setActiveDropdown(null)}
                  />
                )}
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

        {/* Mobile toggle */}
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

      {/* Mobile panel */}
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
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0' }}>
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '44px',
                      color: colors.textMain,
                      fontSize: '16px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      borderBottom: `1px solid ${colors.borderLight}`,
                      paddingBlock: '4px',
                    }}
                  >
                    {item.label}
                  </a>
                  <ul style={{ listStyle: 'none', margin: '4px 0 8px', padding: '0 0 0 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {item.dropdown.map((sub) => (
                      <li key={sub.label}>
                        <a
                          href={sub.href}
                          onClick={() => setOpen(false)}
                          style={{
                            display: 'block',
                            padding: '6px 0',
                            fontSize: '13px',
                            color: colors.textMuted,
                            textDecoration: 'none',
                            fontWeight: 500,
                          }}
                        >
                          {sub.label}
                        </a>
                      </li>
                    ))}
                  </ul>
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
