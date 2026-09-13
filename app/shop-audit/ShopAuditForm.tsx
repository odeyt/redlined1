'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * The Book a Shop Audit request form.
 *
 * Split from page.tsx so the page itself stays a server component and can
 * export metadata; only this part needs interactivity.
 *
 * Deliberately not a booking widget. No scheduling provider is configured in
 * this deployment, and inventing a Calendly URL would send owners to a link
 * nobody owns — so this captures the request and says plainly what happens
 * next.
 */

const CONTACT_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

type Status = 'idle' | 'sending' | 'sent';

export function ShopAuditForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [country, setCountry] = useState('');
  const [locationCount, setLocationCount] = useState('');
  const [technicianCount, setTechnicianCount] = useState('');
  const [monthlyVehicleVolume, setMonthlyVehicleVolume] = useState('');
  const [currentSoftware, setCurrentSoftware] = useState('');
  const [biggestChallenge, setBiggestChallenge] = useState('');
  const [preferredContactMethod, setPreferredContactMethod] = useState('email');
  const [preferredTime, setPreferredTime] = useState('');
  const [consent, setConsent] = useState(false);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  // Attribution, read once. A lazy initialiser rather than an effect: the
  // values never change after mount, and setting state from an effect body
  // trips react-hooks/set-state-in-effect for a cascading render this does
  // not need. Guarded for the server render, where there is no location.
  const [utm] = useState(() => {
    if (typeof window === 'undefined') return { source: '', medium: '', campaign: '' };
    const p = new URLSearchParams(window.location.search);
    return {
      source: p.get('utm_source') ?? '',
      medium: p.get('utm_medium') ?? '',
      campaign: p.get('utm_campaign') ?? '',
    };
  });

  // Focus follows the outcome: to the error so a screen reader announces why
  // the submission stopped, or to the confirmation so it is not missed.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (status === 'sent') successRef.current?.focus();
  }, [status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Duplicate-submission protection: the guard, not just the disabled
    // attribute. A second Enter press can land before React re-renders.
    if (status !== 'idle') return;

    if (!consent) {
      setError('Please confirm you agree to be contacted about your request.');
      return;
    }

    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/shop-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName, email, phone, shopName, country,
          locationCount, technicianCount, monthlyVehicleVolume,
          currentSoftware, biggestChallenge,
          preferredContactMethod, preferredTime,
          source: 'shop-audit',
          utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
        setStatus('idle');
        return;
      }
      setStatus('sent');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0 20px' }} data-analytics="shop_audit_submitted">
        <div style={{ fontSize: 44, marginBottom: 16 }} aria-hidden="true">✅</div>
        <h2
          ref={successRef}
          tabIndex={-1}
          style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: '#fff' }}
        >
          Request received
        </h2>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
          We have your details and will be in touch at{' '}
          <strong style={{ color: '#fff' }}>{email}</strong> to arrange a time.
        </p>
        <p style={{ color: '#777', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
          The audit is a short workflow conversation — no preparation needed. If you want to get
          started in the meantime, you can open a free account straight away.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" className="login-btn" data-analytics="start_free_clicked" data-cta-location="shop-audit-success" style={{ textDecoration: 'none', padding: '10px 20px' }}>
            Start Free
          </Link>
          <Link href="/" style={{ color: '#cc0000', fontSize: 13, textDecoration: 'none', fontWeight: 600, alignSelf: 'center' }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const busy = status === 'sending';

  return (
    <form onSubmit={handleSubmit} className="login-form" data-analytics="shop_audit_started" noValidate>
      <div className="login-field">
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" type="text" required autoComplete="name"
          value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" />
      </div>

      <div className="login-field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" required autoComplete="email"
          value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourshop.com" />
      </div>

      <div className="login-field">
        <label htmlFor="phone">Phone or WhatsApp</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel"
          value={phone} onChange={e => setPhone(e.target.value)} placeholder="+856 20 1234 5678" />
      </div>

      <div className="login-field">
        <label htmlFor="shopName">Shop name</label>
        <input id="shopName" name="shopName" type="text"
          value={shopName} onChange={e => setShopName(e.target.value)} placeholder="Smith Auto Group" />
      </div>

      <div className="login-field">
        <label htmlFor="country">Country</label>
        <input id="country" name="country" type="text" autoComplete="country-name"
          value={country} onChange={e => setCountry(e.target.value)} placeholder="Laos" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        <div className="login-field">
          <label htmlFor="locationCount">Locations</label>
          <input id="locationCount" name="locationCount" type="number" min={0} inputMode="numeric"
            value={locationCount} onChange={e => setLocationCount(e.target.value)} placeholder="2" />
        </div>
        <div className="login-field">
          <label htmlFor="technicianCount">Technicians</label>
          <input id="technicianCount" name="technicianCount" type="number" min={0} inputMode="numeric"
            value={technicianCount} onChange={e => setTechnicianCount(e.target.value)} placeholder="8" />
        </div>
        <div className="login-field">
          <label htmlFor="monthlyVehicleVolume">Vehicles / month</label>
          <input id="monthlyVehicleVolume" name="monthlyVehicleVolume" type="number" min={0} inputMode="numeric"
            value={monthlyVehicleVolume} onChange={e => setMonthlyVehicleVolume(e.target.value)} placeholder="120" />
        </div>
      </div>

      <div className="login-field">
        <label htmlFor="currentSoftware">Current shop-management software</label>
        <input id="currentSoftware" name="currentSoftware" type="text"
          value={currentSoftware} onChange={e => setCurrentSoftware(e.target.value)}
          placeholder="Spreadsheets, paper, or a product name" />
      </div>

      <div className="login-field">
        <label htmlFor="biggestChallenge">Biggest operational challenge</label>
        <textarea id="biggestChallenge" name="biggestChallenge" rows={4}
          value={biggestChallenge} onChange={e => setBiggestChallenge(e.target.value)}
          placeholder="Where does time or money leak today? Missed calls, estimates never followed up, jobs not invoiced…"
          style={{ resize: 'vertical', width: '100%', fontFamily: 'inherit' }} />
      </div>

      <div className="login-field">
        <label htmlFor="preferredContactMethod">Preferred contact method</label>
        <select id="preferredContactMethod" name="preferredContactMethod"
          value={preferredContactMethod} onChange={e => setPreferredContactMethod(e.target.value)}>
          {CONTACT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div className="login-field">
        <label htmlFor="preferredTime">Preferred day or time (optional)</label>
        <input id="preferredTime" name="preferredTime" type="text"
          value={preferredTime} onChange={e => setPreferredTime(e.target.value)}
          placeholder="Weekday mornings, or a date that suits you" />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '4px 0 6px' }}>
        <input id="consent" name="consent" type="checkbox" checked={consent}
          onChange={e => setConsent(e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
        <label htmlFor="consent" style={{ fontSize: 12.5, color: '#999', lineHeight: 1.55, fontWeight: 400 }}>
          I agree to be contacted about this request and have read the{' '}
          <Link href="/privacy" style={{ color: '#cc0000', fontWeight: 600 }}>Privacy Policy</Link>.
        </label>
      </div>

      {error && (
        <p className="login-error" ref={errorRef} tabIndex={-1} role="alert">{error}</p>
      )}

      <button type="submit" className="login-btn" disabled={busy} data-analytics="shop_audit_submit_clicked">
        {busy ? 'Sending…' : 'Request my shop audit'}
      </button>

      <p style={{ fontSize: 12, color: '#777', lineHeight: 1.6, marginTop: 4, textAlign: 'center' }}>
        This is a workflow consultation, not a guaranteed-revenue offer. Recommendations depend on
        your shop&apos;s processes, team and available data.
      </p>
    </form>
  );
}
