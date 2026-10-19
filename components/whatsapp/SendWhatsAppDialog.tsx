'use client';

/**
 * Send WhatsApp dialog for one estimate, invoice or job card.
 *
 * Everything shown comes from GET /api/whatsapp/messages, computed by the same
 * server code that sends: recipient (masked), consent, template approval, the
 * exact message preview, duplicate status and delivery history. Staff choose
 * only the language, confirm consent when there is none on file, and confirm
 * a resend of unchanged content. One request id per dialog; a new one after a
 * failure, so a double-click never sends twice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDialogState, sendWhatsApp, recordWhatsAppConsent, WaApiError,
  type WaDialogState, type WaLanguage, type WaResourceType,
} from '@/services/whatsappService';
import { AuthSessionError } from '@/lib/apiClient';

interface Props {
  shopId: string;
  resourceType: WaResourceType;
  resourceId: string;
  title: string;
  onClose: () => void;
}

const KIND_LABEL: Record<WaResourceType, string> = { estimate: 'Estimate', invoice: 'Invoice', job: 'Repair update' };

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC4122-shaped fallback for older browsers.
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function fmt(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function StatusTicks({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string; label: string }> = {
    pending: { t: '🕓', c: 'var(--muted)', label: 'Sending' },
    sent: { t: '✓', c: 'var(--muted)', label: 'Sent' },
    delivered: { t: '✓✓', c: 'var(--muted)', label: 'Delivered' },
    read: { t: '✓✓', c: '#2196f3', label: 'Read' },
    failed: { t: '⚠', c: '#ef4444', label: 'Failed' },
  };
  const m = map[status] ?? map.sent;
  return <span title={m.label} style={{ color: m.c, fontWeight: 700, fontSize: 12 }}>{m.t} {m.label}</span>;
}

const pill = (bg: string, fg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', background: bg, color: fg });
const note = (color: string) => ({ fontSize: 12, color, background: 'var(--surface-soft)', border: `1px solid ${color}33`, borderRadius: 8, padding: '8px 10px', marginTop: 10 });

export function SendWhatsAppDialog({ shopId, resourceType, resourceId, title, onClose }: Props) {
  const [lang, setLang] = useState<WaLanguage>('en');
  const [state, setState] = useState<WaDialogState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentSource, setConsentSource] = useState<'staff_verbal' | 'staff_written'>('staff_verbal');
  const [consentNote, setConsentNote] = useState('');
  const [confirmResend, setConfirmResend] = useState(false);
  const requestId = useRef(newRequestId());

  const reload = useCallback(async (l: WaLanguage) => {
    setLoadError('');
    try {
      setState(await fetchDialogState(shopId, resourceType, resourceId, l));
    } catch (e) {
      setLoadError(e instanceof AuthSessionError ? e.message : e instanceof Error ? e.message : 'Could not load WhatsApp status');
    }
  }, [shopId, resourceType, resourceId]);

  useEffect(() => {
    let alive = true;
    fetchDialogState(shopId, resourceType, resourceId, lang)
      .then(s => { if (alive) { setState(s); setLoadError(''); } })
      .catch(e => { if (alive) setLoadError(e instanceof AuthSessionError ? e.message : e instanceof Error ? e.message : 'Could not load WhatsApp status'); });
    return () => { alive = false; };
  }, [shopId, resourceType, resourceId, lang]);

  const consent = state?.consent?.status ?? null;
  const needsConsent = consent !== 'opted_in';
  const blocked = !state || !state.canSend || !state.recipient || state.sandboxBlocked || consent === 'opted_out'
    || state.template.status !== 'APPROVED' || !!state.linkIssue || (needsConsent && !consentChecked)
    || (!!state.duplicate && !confirmResend);

  async function send() {
    if (!state || blocked) return;
    setSending(true); setResult(null);
    try {
      const out = await sendWhatsApp(shopId, {
        resourceType, resourceId, language: lang, clientRequestId: requestId.current,
        ...(state.duplicate ? { confirmResend: true } : {}),
        ...(needsConsent ? { recordConsent: { source: consentSource, ...(consentNote.trim() ? { note: consentNote.trim() } : {}) } } : {}),
      });
      setResult({ ok: true, text: `${out.replay ? 'Already sent' : 'Sent'} to ${out.message.toMasked}${out.message.mode === 'sandbox' ? ' (sandbox)' : ''}. Delivery status updates below.` });
      requestId.current = newRequestId();
      setConfirmResend(false);
      await reload(lang);
    } catch (e) {
      requestId.current = newRequestId();
      setResult({ ok: false, text: e instanceof WaApiError || e instanceof Error ? e.message : 'Send failed' });
      await reload(lang);
    } finally { setSending(false); }
  }

  async function optOut() {
    if (!window.confirm('Record that this customer does NOT want WhatsApp messages? Nothing more will be sent to this number until they opt in again.')) return;
    try {
      await recordWhatsAppConsent(shopId, { resourceType, resourceId, status: 'opted_out', source: 'staff_opt_out' });
      await reload(lang);
    } catch (e) { setResult({ ok: false, text: e instanceof Error ? e.message : 'Could not record opt-out' }); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Send WhatsApp" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, width: 500, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>💬</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Send via WhatsApp</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{KIND_LABEL[resourceType]} · {title}</div>
          </div>
          {state && (state.mode === 'live'
            ? <span style={pill('rgba(46,125,50,0.12)', '#2e7d32')}>LIVE</span>
            : <span style={pill('rgba(217,119,6,0.14)', '#b45309')}>SANDBOX</span>)}
        </div>

        {loadError && <div style={note('#ef4444')}>{loadError}</div>}
        {!state && !loadError && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</div>}

        {state && <>
          {state.sendBlocker && <div style={note('#ef4444')}>{state.sendBlocker}</div>}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>To</div>
              {state.recipient
                ? <div style={{ fontSize: 14, fontWeight: 600 }}>{state.recipient.name || 'Customer'} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{state.recipient.masked}</span></div>
                : <div style={{ fontSize: 13, color: '#ef4444' }}>No usable mobile number on file. Add one to the customer record with the country code.</div>}
            </div>
            <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Message language">
              {(['en', 'lo'] as const).map(l => (
                <button key={l} type="button" onClick={() => setLang(l)}
                  style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: lang === l ? 700 : 500, cursor: 'pointer', border: `1.5px solid ${lang === l ? '#25d366' : 'var(--line)'}`, background: lang === l ? 'rgba(37,211,102,0.1)' : 'transparent', color: 'var(--text)' }}>
                  {l === 'en' ? 'English' : 'ລາວ'}
                </button>
              ))}
            </div>
          </div>

          {state.sandboxBlocked && <div style={note('#b45309')}>Sandbox mode: this customer is not one of the test numbers in Settings → Integrations, so nothing will be sent to them.</div>}

          {/* Consent */}
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>WhatsApp consent</div>
              {consent === 'opted_in' && <span style={pill('rgba(46,125,50,0.12)', '#2e7d32')}>OPTED IN</span>}
              {consent === 'opted_out' && <span style={pill('rgba(239,68,68,0.12)', '#ef4444')}>OPTED OUT</span>}
              {!consent && <span style={pill('rgba(107,114,128,0.14)', 'var(--muted)')}>NOT RECORDED</span>}
            </div>
            {consent === 'opted_in' && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Since {fmt(state.consent?.optedInAt ?? null)} · <button type="button" onClick={optOut} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}>Customer asked to stop</button>
              </div>
            )}
            {consent === 'opted_out' && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>The customer opted out {fmt(state.consent?.optedOutAt ?? null)}. Do not message them on WhatsApp unless they ask to opt in again.</div>}
            {needsConsent && consent !== 'opted_out' && state.recipient && <>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginTop: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 2 }} />
                <span>The customer agreed to receive estimates, invoices and repair updates from us on WhatsApp.</span>
              </label>
              {consentChecked && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <select value={consentSource} onChange={e => setConsentSource(e.target.value as 'staff_verbal' | 'staff_written')}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}>
                    <option value="staff_verbal">Told us in person / by phone</option>
                    <option value="staff_written">In writing (form, message)</option>
                  </select>
                  <input value={consentNote} onChange={e => setConsentNote(e.target.value)} maxLength={500} placeholder="Note (optional)"
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }} />
                </div>
              )}
            </>}
          </div>

          {/* Preview */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>Message preview</div>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{state.template.name}</span>
              <span style={state.template.status === 'APPROVED' ? pill('rgba(46,125,50,0.12)', '#2e7d32') : pill('rgba(217,119,6,0.14)', '#b45309')}>{state.template.status.replace(/_/g, ' ')}</span>
            </div>
            {/* textTransform none: the app shell is uppercase; the preview must show exactly what the customer receives. */}
            <div data-testid="whatsapp-preview" style={{ background: '#e7ffdb', color: '#111b21', borderRadius: '10px 10px 10px 2px', padding: '10px 12px', fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', textTransform: 'none', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
              {state.preview}
              {state.buttonLabel && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', marginTop: 10, paddingTop: 8, textAlign: 'center', color: '#027eb5', fontWeight: 600 }}>🔗 {state.buttonLabel}</div>
              )}
            </div>
            {state.buttonLabel && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>The button opens the customer&apos;s secure portal link. The link is never shown in the message text.</div>}
            {state.template.status !== 'APPROVED' && <div style={note('#b45309')}>Meta has not approved this template in {lang === 'en' ? 'English' : 'Lao'} yet. The owner submits templates in Settings → Integrations → WhatsApp Business.</div>}
            {state.linkIssue && <div style={note('#b45309')}>{state.linkIssue}</div>}
          </div>

          {state.duplicate && (
            <div style={note('#b45309')}>
              Already sent {fmt(state.duplicate.sentAt)} — <StatusTicks status={state.duplicate.status} />. Nothing has changed since.
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, cursor: 'pointer', color: 'var(--text)' }}>
                <input type="checkbox" checked={confirmResend} onChange={e => setConfirmResend(e.target.checked)} /> Send it again anyway
              </label>
            </div>
          )}

          {result && <div style={note(result.ok ? '#2e7d32' : '#ef4444')}>{result.text}</div>}

          {/* History */}
          {state.history.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Delivery history</div>
              {state.history.map(h => (
                <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
                  <span style={{ minWidth: 92 }}><StatusTicks status={h.status} /></span>
                  <span style={{ color: 'var(--muted)', flex: 1 }}>
                    {fmt(h.readAt ?? h.deliveredAt ?? h.sentAt ?? h.createdAt)} · {h.toMasked} · {h.language === 'lo' ? 'Lao' : 'English'}{h.trigger === 'automated' ? ' · auto' : ''}{h.mode === 'sandbox' ? ' · sandbox' : ''}
                    {h.error && <span style={{ color: '#ef4444' }}> · {h.error}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 20px', borderRadius: 999, border: '1px solid var(--line)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Close
          </button>
          <button type="button" disabled={blocked || sending} onClick={send}
            style={{ padding: '9px 22px', borderRadius: 999, border: 'none', background: blocked || sending ? '#9ca3af' : '#25d366', color: '#fff', cursor: blocked || sending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            {sending ? '⟳ Sending…' : '💬 Send WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}
