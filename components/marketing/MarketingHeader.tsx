'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';

const NAV_ITEMS = [
  {
    label: 'Product',
    href: '#workflow',
    dropdown: [
      { label: 'Job Cards & Workflow', href: '#workflow', desc: 'Manage every repair from intake to delivery' },
      { label: 'Estimates & Invoicing', href: '#workflow', desc: 'Send quotes and collect payment fast' },
      { label: 'Digital Inspections', href: '#digital-inspections', desc: 'Photo-based reports customers approve online' },
      { label: 'Command Center', href: '#intelligence', desc: 'Full shop overview at a glance' },
    ],
  },
  {
    label: 'Intelligence',
    href: '#intelligence',
    dropdown: [
      { label: 'Repair Intelligence', href: '#intelligence', desc: 'Knowledge graph built from every closed job' },
      { label: 'Vehicle Intelligence', href: '#vehicle-intelligence', desc: 'Full vehicle health and service history' },
      { label: 'Customer Intelligence', href: '#customer-intelligence', desc: 'Lifetime value, retention, and segments' },
      { label: 'Service Advisor AI', href: '#service-advisor', desc: 'Evidence-backed estimate review' },
    ],
  },
  {
    label: 'Migration',
    href: '#migration',
    dropdown: [
      { label: 'Self-Service Import', href: '#migration', desc: 'CSV/Excel import for parts and inventory' },
      { label: 'Assisted Migration', href: '#migration', desc: 'Our team maps and validates your data' },
      { label: 'White-Glove Migration', href: '#migration', desc: 'Full-service migration end to end' },
    ],
  },
  {
    label: 'Pricing',
    href: '#pricing',
    dropdown: [
      { label: 'Solo — $24/mo', href: '#pricing', desc: 'For independent and mobile mechanics' },
      { label: 'Starter — $49/mo', href: '#pricing', desc: 'For small shops building a team' },
      { label: 'Professional — $99/mo', href: '#pricing', desc: 'Most popular — AI intelligence included' },
      { label: 'Business — $179/mo', href: '#pricing', desc: 'Multi-location, unlimited seats' },
    ],
  },
  {
    label: 'FAQ',
    href: '#faq',
    dropdown: [
      { label: 'Free plan details', href: '#faq', desc: 'Full platform access, no card required' },
      { label: 'Data import options', href: '#faq', desc: 'CSV and full migration supported' },
      { label: 'Mobile app', href: '#faq', desc: 'Installable PWA, works on any device' },
      { label: 'Support', href: '#faq', desc: 'Email admin@redlined1.com anytime' },
    ],
  },
];

interface DropdownItem { label: string; href: string; desc: string }

function NavDropdown({ items, onClose }: { items: DropdownItem[]; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 12px)', left: '50%', transform: 'translateX(-50%)',
      minWidth: '260px',
      background: 'rgba(15,15,15,0.97)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
      padding: '8px', zIndex: 200,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      animation: 'rd1-drop 0.15s ease',
    }}>
      <style>{`@keyframes rd1-drop { from { opacity:0; transform:translateX(-50%) translateY(-6px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`}</style>
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          onClick={onClose}
          style={{
            display: 'flex', flexDirection: 'column', gap: '2px',
            padding: '10px 12px', borderRadius: '8px',
            textDecoration: 'none', transition: 'background 0.12s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{item.label}</span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{item.desc}</span>
        </a>
      ))}
    </div>
  );
}

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
      if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); return; }
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
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: scrolled ? 'rgba(8,8,8,0.95)' : 'rgba(8,8,8,0.8)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
      transition: 'all 0.3s ease',
    }}>
      <div style={{
        maxWidth: '1280px', marginInline: 'auto',
        paddingInline: 'clamp(16px, 4vw, 32px)',
        height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" aria-label="RedlineD1 home" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <RedlineD1Logo variant="full" height={32} animated={true} background="dark" />
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" style={{ display: 'none' }} className="rd1-desktop-nav">
          <ul style={{ display: 'flex', gap: '2px', listStyle: 'none', margin: 0, padding: 0 }}>
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
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '8px 14px', borderRadius: '8px',
                    color: activeDropdown === item.label ? '#fff' : 'rgba(255,255,255,0.55)',
                    fontSize: '14px', fontWeight: 500, textDecoration: 'none',
                    background: activeDropdown === item.label ? 'rgba(255,255,255,0.07)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {item.label}
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"
                    style={{ transition: 'transform 0.2s', transform: activeDropdown === item.label ? 'rotate(180deg)' : 'rotate(0deg)', opacity: 0.4 }}>
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                {activeDropdown === item.label && (
                  <NavDropdown items={item.dropdown} onClose={() => setActiveDropdown(null)} />
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Desktop CTAs */}
        <div style={{ display: 'none', alignItems: 'center', gap: '10px' }} className="rd1-desktop-actions">
          <Link href="/login" style={{
            padding: '9px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
            color: 'rgba(255,255,255,0.55)', textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            transition: 'all 0.2s',
          }}>
            Sign In
          </Link>
          <>
            <style>{`
              @keyframes nav-btn-pulse { 0%,100%{box-shadow:0 0 16px rgba(204,0,0,0.55),0 2px 20px rgba(204,0,0,0.4)}50%{box-shadow:0 0 32px rgba(204,0,0,0.9),0 4px 32px rgba(204,0,0,0.65)} }
              @keyframes nav-btn-shimmer { 0%{background-position:-200px 0}100%{background-position:200px 0} }
              .rd1-nav-trial:hover{animation:none!important;box-shadow:0 0 48px rgba(204,0,0,1),0 6px 36px rgba(204,0,0,0.8)!important;transform:translateY(-1px) scale(1.02)}
            `}</style>
            <Link href="/signup" className="rd1-nav-trial" style={{
              padding: '9px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 700,
              color: '#fff', textDecoration: 'none',
              background: 'linear-gradient(135deg, #e52020 0%, #aa0000 100%)',
              border: '1px solid rgba(255,100,100,0.2)',
              animation: 'nav-btn-pulse 2.5s ease-in-out infinite',
              transition: 'transform 0.2s, box-shadow 0.2s',
              position: 'relative', overflow: 'hidden', display: 'inline-block',
            }}>
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.12) 50%,transparent 60%)', backgroundSize: '200px 100%', animation: 'nav-btn-shimmer 3s linear infinite', pointerEvents: 'none' }} />
              Start Free
            </Link>
          </>
        </div>

        {/* Mobile toggle */}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="rd1-mobile-nav-panel"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(v => !v)}
          className="rd1-mobile-toggle"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '44px', height: '44px',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
            cursor: 'pointer', color: '#fff', fontSize: '18px',
          }}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
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
            borderTop: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(10,10,10,0.98)',
            padding: '16px 24px 28px',
            backdropFilter: 'blur(16px)',
          }}
        >
          <nav aria-label="Mobile">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', minHeight: '48px',
                      color: 'rgba(255,255,255,0.85)', fontSize: '16px', fontWeight: 600,
                      textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {item.label}
                  </a>
                  <ul style={{ listStyle: 'none', margin: '4px 0 8px', padding: '0 0 0 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {item.dropdown.map(sub => (
                      <li key={sub.label}>
                        <a href={sub.href} onClick={() => setOpen(false)}
                          style={{ display: 'block', padding: '6px 0', fontSize: '13px', color: 'rgba(255,255,255,0.35)', textDecoration: 'none', fontWeight: 500 }}>
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
            <Link href="/login" onClick={() => setOpen(false)} style={{
              display: 'block', textAlign: 'center', padding: '13px', borderRadius: '10px',
              color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontWeight: 600, fontSize: '15px',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
            }}>
              Sign In
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)} style={{
              display: 'block', textAlign: 'center', padding: '13px', borderRadius: '10px',
              color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '15px',
              background: 'linear-gradient(135deg, #e52020 0%, #aa0000 100%)',
              animation: 'nav-btn-pulse 2.5s ease-in-out infinite',
            }}>
              Start Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
