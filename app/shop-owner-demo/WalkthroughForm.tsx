'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/track';

/**
 * "Book a walkthrough" — a request form, not a calendar.
 *
 * No scheduling provider is configured in this deployment (see the note in
 * app/shop-audit/ShopAuditForm.tsx), so this does what that form does: posts
 * to /api/shop-audit, which stores the request in shop_audit_leads and emails
 * the owner. `source: 'shop-owner-demo'` is what tells the owner it is a
 * walkthrough request, in the stored row and in the email subject.
 *
 * Spam protection is layered with the endpoint's: it rate-limits per IP and
 * caps every field; this adds a honeypot (`website`) that people never see.
 */

type Status = 'idle' | 'sending' | 'sent';
type FieldErrors = Partial<Record<'fullName' | 'email' | 'consent', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WalkthroughForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [technicianCount, setTechnicianCount] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');

  const [status, setStatus] = useState<Status>('idle');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  // Read once, lazily, for the same reason ShopAuditForm does: the values
  // never change after mount, and there is no location on the server.
  const [utm] = useState(() => {
    if (typeof window === 'undefined') return { source: '', medium: '', campaign: '' };
    const p = new URLSearchParams(window.location.search);
    return {
      source: p.get('utm_source') ?? '',
      medium: p.get('utm_medium') ?? '',
      campaign: p.get('utm_campaign') ?? '',
    };
  });

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (status === 'sent') successRef.current?.focus();
  }, [status]);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = 'Enter your name.';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!consent) next.consent = 'Please confirm we may contact you about this request.';
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The guard, not only the disabled button: a second Enter can land before
    // React re-renders.
    if (status !== 'idle') return;

    const problems = validate();
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }

    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/shop-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName, email, phone, shopName, technicianCount, preferredTime,
          preferredContactMethod: 'email',
          website,
          source: 'shop-owner-demo',
          utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
        setStatus('idle');
        return;
      }
      trackEvent('generate_lead', { page: 'shop_owner_demo', lead_type: 'walkthrough' });
      setStatus('sent');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div className="sod-form-done">
        <h3 ref={successRef} tabIndex={-1}>Request received</h3>
        <p>
          Thanks. We will email <strong>{email}</strong> to find a time for your walkthrough.
        </p>
        <p className="sod-muted">
          Want to look around first? You can open a free account now and keep it after the walkthrough.
        </p>
        <Link
          href="/signup"
          className="sod-btn sod-btn-primary"
          onClick={() => trackEvent('start_free_click', { page: 'shop_owner_demo', cta_location: 'form_success' })}
          data-analytics="start_free_click"
          data-cta-location="form_success"
        >
          Start free
        </Link>
      </div>
    );
  }

  const busy = status === 'sending';
  const invalid = (k: keyof FieldErrors) => (fieldErrors[k] ? true : undefined);

  return (
    <form className="sod-form" onSubmit={handleSubmit} noValidate aria-describedby="sod-form-note">
      <div className="sod-field">
        <label htmlFor="sod-name">Your name <span aria-hidden="true">*</span></label>
        <input id="sod-name" name="fullName" type="text" autoComplete="name" required maxLength={120}
          value={fullName} onChange={e => setFullName(e.target.value)}
          aria-invalid={invalid('fullName')} aria-describedby={fieldErrors.fullName ? 'sod-name-err' : undefined} />
        {fieldErrors.fullName && <p id="sod-name-err" className="sod-field-err">{fieldErrors.fullName}</p>}
      </div>

      <div className="sod-field">
        <label htmlFor="sod-email">Email <span aria-hidden="true">*</span></label>
        <input id="sod-email" name="email" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourshop.com"
          aria-invalid={invalid('email')} aria-describedby={fieldErrors.email ? 'sod-email-err' : undefined} />
        {fieldErrors.email && <p id="sod-email-err" className="sod-field-err">{fieldErrors.email}</p>}
      </div>

      <div className="sod-field-row">
        <div className="sod-field">
          <label htmlFor="sod-phone">Phone (optional)</label>
          <input id="sod-phone" name="phone" type="tel" autoComplete="tel" maxLength={40}
            value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="sod-field">
          <label htmlFor="sod-shop">Shop name (optional)</label>
          <input id="sod-shop" name="shopName" type="text" autoComplete="organization" maxLength={160}
            value={shopName} onChange={e => setShopName(e.target.value)} />
        </div>
      </div>

      <div className="sod-field-row">
        <div className="sod-field">
          <label htmlFor="sod-techs">Technicians (optional)</label>
          <input id="sod-techs" name="technicianCount" type="number" min={0} max={10000} inputMode="numeric"
            value={technicianCount} onChange={e => setTechnicianCount(e.target.value)} />
        </div>
        <div className="sod-field">
          <label htmlFor="sod-time">Best day or time (optional)</label>
          <input id="sod-time" name="preferredTime" type="text" maxLength={160}
            value={preferredTime} onChange={e => setPreferredTime(e.target.value)} placeholder="e.g. Tuesday mornings" />
        </div>
      </div>

      {/* Honeypot: off-screen, out of the tab order, hidden from screen readers. */}
      <div className="sod-hp" aria-hidden="true">
        <label htmlFor="sod-website">Website</label>
        <input id="sod-website" name="website" type="text" tabIndex={-1} autoComplete="off"
          value={website} onChange={e => setWebsite(e.target.value)} />
      </div>

      <div className="sod-consent">
        <input id="sod-consent" name="consent" type="checkbox" checked={consent}
          onChange={e => setConsent(e.target.checked)}
          aria-invalid={invalid('consent')} aria-describedby={fieldErrors.consent ? 'sod-consent-err' : undefined} />
        <label htmlFor="sod-consent">
          RedlineD1 may contact me about this request. I have read the{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </label>
      </div>
      {fieldErrors.consent && <p id="sod-consent-err" className="sod-field-err">{fieldErrors.consent}</p>}

      {error && <p className="sod-form-err" ref={errorRef} tabIndex={-1} role="alert">{error}</p>}

      <button type="submit" className="sod-btn sod-btn-primary sod-btn-block" disabled={busy}>
        {busy ? 'Sending…' : 'Book a walkthrough'}
      </button>
      <p id="sod-form-note" className="sod-muted sod-small">
        We reply by email to arrange a time. The walkthrough is a live look at the product with your questions — no obligation.
      </p>
    </form>
  );
}
