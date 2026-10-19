'use client';

/**
 * Settings → Integrations → WhatsApp Business.
 *
 * Owner only, D1 Imports pilot only, behind the `whatsapp_business` flag.
 * Walks the owner through the order the integration enforces server-side:
 *
 *   1. Eligibility — business number, app version, limitations accepted.
 *   2. Sandbox — Meta's test number, test recipients, templates, one test
 *      message delivered (proves sends AND delivery webhooks).
 *   3. Connect the shop number — Embedded Signup v4, coexistence only. The
 *      number stays on the WhatsApp Business App. Connects SWITCHED OFF, in
 *      sandbox mode.
 *   4. Switch on (master switch) → still only test numbers.
 *   5. Approve live customer messages (typed phrase) — and the deployment's
 *      WHATSAPP_LIVE_SENDING_ENABLED must also be set.
 *   6. Optional automations — off until activated here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { WHATSAPP_FLAG_KEY, isWhatsAppPilotShop } from '@/lib/whatsapp/config';
import { MIN_BUSINESS_APP_VERSION } from '@/lib/whatsapp/eligibility';
import { WHATSAPP_ADDON, WHATSAPP_INCLUDED_PLANS } from '@/config/whatsappEntitlements';
import { invalidateWhatsAppAvailability } from '@/components/whatsapp/useWhatsAppAvailability';
import {
  fetchWhatsAppStatus, updateWhatsAppSettings, disconnectWhatsApp, connectSandbox, finishEmbeddedSignup,
  verifyWhatsApp, templatesAction, type WaConnectionStatus, type WaLanguage,
} from '@/services/whatsappService';

const LIVE_PHRASE = 'SEND LIVE MESSAGES';
const COEXISTENCE_EVENT = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';

const sectionStyle = { borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 16 } as const;
const h3 = { fontSize: 14, fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 } as const;
const sub = { fontSize: 12, color: 'var(--muted)', marginBottom: 10 } as const;
const chip = (bg: string, fg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', background: bg, color: fg }) as const;
const input = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' as const };

interface SessionInfo { event: string; wabaId: string; phoneNumberId: string; businessId?: string }

const ICON: Record<string, string> = { pass: '✅', fail: '❌', confirm: '⬜', pending: '⏳' };

const ATTESTATIONS: Array<{ key: string; label: string }> = [
  { key: 'appVersionOk', label: `The shop phone runs WhatsApp Business App ${MIN_BUSINESS_APP_VERSION} or later` },
  { key: 'onBusinessApp', label: 'The shop number is on the WhatsApp Business App (not personal WhatsApp)' },
  { key: 'limitationsAccepted', label: 'I have read the coexistence limitations below' },
  { key: 'keepAppActive', label: 'Someone will open the Business App on the shop phone at least every 14 days' },
  { key: 'paymentMethodAdded', label: 'A payment method is added in WhatsApp Manager' },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

function loadFacebookSdk(appId: string, version: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.FB) { resolve(window.FB); return; }
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Could not load the Facebook SDK'));
    document.body.appendChild(s);
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function WhatsAppBusinessPanel({ shopId, role }: { shopId: string; role: string }) {
  const flagOn = useFeatureFlag(WHATSAPP_FLAG_KEY);
  const pilot = isWhatsAppPilotShop(shopId);
  const [st, setSt] = useState<WaConnectionStatus | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const [businessPhone, setBusinessPhone] = useState('');
  const [sbPhoneId, setSbPhoneId] = useState('');
  const [sbWabaId, setSbWabaId] = useState('');
  const [sbToken, setSbToken] = useState('');
  const [sbKind, setSbKind] = useState<'sandbox_temporary' | 'system_user'>('sandbox_temporary');
  const [recipientsDraft, setRecipientsDraft] = useState('');
  const [livePhrase, setLivePhrase] = useState('');
  const sessionInfo = useRef<SessionInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchWhatsAppStatus(shopId);
      setSt(s); setErr('');
      if (s.connection?.businessPhoneDigits) setBusinessPhone(`+${s.connection.businessPhoneDigits}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load WhatsApp status'); }
    invalidateWhatsAppAvailability();
  }, [shopId]);

  useEffect(() => {
    if (!flagOn || !pilot || role !== 'owner') return;
    let alive = true;
    fetchWhatsAppStatus(shopId)
      .then(s => {
        if (!alive) return;
        setSt(s); setErr('');
        if (s.connection?.businessPhoneDigits) setBusinessPhone(`+${s.connection.businessPhoneDigits}`);
      })
      .catch(e => { if (alive) setErr(e instanceof Error ? e.message : 'Could not load WhatsApp status'); });
    return () => { alive = false; };
  }, [flagOn, pilot, role, shopId]);

  if (!flagOn || !pilot) return null;

  async function run(label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(label); setErr(''); setMsg('');
    try { await fn(); if (done) setMsg(done); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(''); }
  }

  const c = st?.connection ?? null;
  const connected = st?.status === 'connected';
  const isCoexistence = c?.onboardingType === 'coexistence';
  const att = c?.attestations ?? {};
  const templates = st?.templates ?? [];
  const approvedCount = templates.filter(t => t.status === 'APPROVED').length;

  async function launchEmbeddedSignup() {
    const es = st?.embeddedSignup;
    if (!es?.appId || !es.configId) { setErr('Meta App ID and Embedded Signup configuration are not set for this deployment.'); return; }
    setBusy('signup'); setErr(''); setMsg('');
    sessionInfo.current = null;
    const onMessage = (event: MessageEvent) => {
      try {
        // Only Meta's own windows; an opaque ("null") or malformed origin is ignored.
        if (typeof event.origin !== 'string' || !/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event === 'CANCEL' || data.event === 'ERROR') { sessionInfo.current = { event: data.event, wabaId: '', phoneNumberId: '' }; return; }
        sessionInfo.current = {
          event: String(data.event ?? ''),
          wabaId: String(data.data?.waba_id ?? ''),
          phoneNumberId: String(data.data?.phone_number_id ?? ''),
          businessId: data.data?.business_id ? String(data.data.business_id) : undefined,
        };
      } catch { /* not ours */ }
    };
    window.addEventListener('message', onMessage);
    try {
      const FB = await loadFacebookSdk(es.appId, es.graphVersion);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await new Promise(resolve => FB.login(resolve, {
        config_id: es.configId,
        response_type: 'code',
        override_default_response_type: true,
        // WhatsApp Business App onboarding (coexistence). See
        // docs/whatsapp/META_ONBOARDING.md for the dashboard configuration.
        extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
      }));
      // The session event can land just after the login callback.
      for (let i = 0; i < 20 && !sessionInfo.current; i++) await new Promise(r => setTimeout(r, 100));
      const code = response?.authResponse?.code;
      const info = sessionInfo.current as SessionInfo | null;
      if (!code || !info || info.event === 'CANCEL' || info.event === 'ERROR') throw new Error('Embedded Signup was cancelled. Nothing was connected.');
      if (info.event !== COEXISTENCE_EVENT) throw new Error(`Embedded Signup finished with "${info.event}", not the WhatsApp Business App flow. Nothing was connected.`);
      await finishEmbeddedSignup(shopId, { code, event: info.event, wabaId: info.wabaId, phoneNumberId: info.phoneNumberId, ...(info.businessId ? { businessId: info.businessId } : {}) });
      setMsg('Shop number connected through coexistence. It is switched OFF and in sandbox mode — nothing is sent to customers yet.');
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Embedded Signup failed');
    } finally {
      window.removeEventListener('message', onMessage);
      setBusy('');
    }
  }

  return (
    <Panel
      title="Integrations → WhatsApp Business"
      hint="Send estimates, invoices and repair updates from the shop's own WhatsApp Business number — and keep using the WhatsApp Business App on the shop phone."
      action={st && role === 'owner' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: connected ? 'pointer' : 'not-allowed', opacity: connected ? 1 : 0.5 }} title={connected ? undefined : 'Connect first'}>
          <input type="checkbox" role="switch" aria-label="WhatsApp Business master switch" checked={!!st.enabled} disabled={!connected || !!busy}
            onChange={e => run('enabled', () => updateWhatsAppSettings(shopId, { enabled: e.target.checked }), e.target.checked ? 'WhatsApp Business switched on.' : 'WhatsApp Business switched off. Nothing will be sent.')} />
          {st.enabled ? 'On' : 'Off'}
        </label>
      ) : undefined}
    >
      {role !== 'owner' ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Only the shop owner can manage WhatsApp Business.</div>
      ) : !st ? (
        <div style={{ fontSize: 13, color: err ? '#ef4444' : 'var(--muted)' }}>{err || 'Loading…'}</div>
      ) : (
        <div data-testid="whatsapp-business-panel">
          {/* Status strip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--surface-soft)', border: '1px solid var(--line)' }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <strong style={{ fontSize: 13 }}>{c?.displayPhoneNumber ?? 'Not connected'}</strong>
            {c?.verifiedName && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.verifiedName}</span>}
            <span style={{ flex: 1 }} />
            <span style={connected ? chip('rgba(46,125,50,0.12)', '#2e7d32') : st.status === 'needs_attention' ? chip('rgba(239,68,68,0.12)', '#ef4444') : chip('rgba(107,114,128,0.14)', 'var(--muted)')}>
              {st.status.replace(/_/g, ' ').toUpperCase()}
            </span>
            {connected && (isCoexistence ? <span style={chip('rgba(37,211,102,0.14)', '#128c4b')}>COEXISTENCE</span> : <span style={chip('rgba(59,130,246,0.12)', '#2563eb')}>META TEST NUMBER</span>)}
            <span style={st.mode === 'live' ? chip('rgba(46,125,50,0.12)', '#2e7d32') : chip('rgba(217,119,6,0.14)', '#b45309')}>{st.mode.toUpperCase()}</span>
          </div>
          {st.sendBlocker && connected && <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>Sending: {st.sendBlocker}</div>}
          {err && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{err}</div>}
          {msg && <div style={{ fontSize: 12, color: '#2e7d32', marginTop: 8 }}>{msg}</div>}

          {/* 1. Eligibility */}
          <div style={sectionStyle}>
            <h3 style={h3}>1 · Coexistence eligibility</h3>
            <div style={sub}>RedlineD1 only connects the shop number through Meta&apos;s WhatsApp Business App coexistence flow, so the app, its chats and contacts keep working.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, maxWidth: 460 }}>
              <input style={input} value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="Shop WhatsApp number, e.g. +856 20 5555 1234" aria-label="Shop WhatsApp number" />
              <button className="btn" disabled={!!busy} onClick={() => run('phone', () => updateWhatsAppSettings(shopId, { businessPhone }), 'Business number saved.')}>Save</button>
            </div>
            {ATTESTATIONS.map(a => (
              <label key={a.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={att[a.key] === true} disabled={!!busy}
                  onChange={e => run('att', () => updateWhatsAppSettings(shopId, { attestations: { [a.key]: e.target.checked } }))} style={{ marginTop: 2 }} />
                <span>{a.label}</span>
              </label>
            ))}
            <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
              {(st.eligibility ?? []).map(i => (
                <div key={i.key} style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                  <span>{ICON[i.status]}</span>
                  <span><strong>{i.label}</strong> — <span style={{ color: 'var(--muted)' }}>{i.detail}</span></span>
                </div>
              ))}
            </div>
            <details style={{ marginTop: 10, fontSize: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Coexistence limitations (Meta)</summary>
              <ul style={{ margin: '8px 0 0 18px', color: 'var(--muted)', lineHeight: 1.6 }}>
                <li>Broadcast lists become read-only; disappearing, view-once and live-location messages are turned off in the app.</li>
                <li>All linked devices are unlinked once when connecting; WhatsApp for Windows and WearOS cannot be re-linked.</li>
                <li>Groups, calls, catalog, labels, quick replies and Channels stay in the app only — the API cannot use them.</li>
                <li>Throughput is fixed at 20 messages/second. Meta disconnects the API side after ~14 days without the phone app being opened.</li>
                <li>Messages typed in the app stay free; RedlineD1&apos;s template messages are charged by Meta at Cloud API rates.</li>
                <li>RedlineD1 never deregisters the number. To end coexistence: app → Settings → Account → Business Platform → Disconnect.</li>
              </ul>
            </details>
          </div>

          {/* 2. Sandbox */}
          <div style={sectionStyle}>
            <h3 style={h3}>2 · Test with Meta&apos;s sandbox number {st.sandboxTestPassed && <span style={chip('rgba(46,125,50,0.12)', '#2e7d32')}>TEST DELIVERED</span>}</h3>
            <div style={sub}>From App Dashboard → WhatsApp → API Setup. Proves templates, sending and delivery tracking before the shop number is touched.</div>
            {!(connected && isCoexistence) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, maxWidth: 760 }}>
                <input style={input} value={sbPhoneId} onChange={e => setSbPhoneId(e.target.value)} placeholder="Test phone number ID" aria-label="Test phone number ID" />
                <input style={input} value={sbWabaId} onChange={e => setSbWabaId(e.target.value)} placeholder="Test WhatsApp Business Account ID" aria-label="Test WABA ID" />
                <input style={input} type="password" autoComplete="off" value={sbToken} onChange={e => setSbToken(e.target.value)} placeholder="Access token (write-only)" aria-label="Test access token" />
                <select style={input} value={sbKind} onChange={e => setSbKind(e.target.value as 'sandbox_temporary' | 'system_user')} aria-label="Token type">
                  <option value="sandbox_temporary">Temporary token (24 h)</option>
                  <option value="system_user">System user token</option>
                </select>
                <button className="btn btn-primary" disabled={!!busy || !sbPhoneId || !sbWabaId || !sbToken}
                  onClick={() => run('sandbox', async () => { await connectSandbox(shopId, { phoneNumberId: sbPhoneId.trim(), wabaId: sbWabaId.trim(), accessToken: sbToken.trim(), tokenKind: sbKind }); setSbToken(''); }, 'Test number connected (switched off).')}>
                  {busy === 'sandbox' ? 'Connecting…' : 'Connect test number'}
                </button>
              </div>
            )}
            <div style={{ marginTop: 10, maxWidth: 560 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Sandbox test recipients (max 5) — sandbox mode sends only to these</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{(c?.sandboxRecipients ?? []).join(', ') || 'None yet'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={input} value={recipientsDraft} onChange={e => setRecipientsDraft(e.target.value)} placeholder="+856 20 …, +66 …  (comma-separated, replaces the list)" aria-label="Sandbox recipients" />
                <button className="btn" disabled={!!busy || !recipientsDraft.trim()}
                  onClick={() => run('recips', async () => { await updateWhatsAppSettings(shopId, { sandboxRecipients: recipientsDraft.split(',').map(s => s.trim()).filter(Boolean) }); setRecipientsDraft(''); }, 'Test recipients saved.')}>Save</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>With Meta&apos;s test number, each recipient must also be added and verified under API Setup → &quot;To&quot;.</div>
            </div>
          </div>

          {/* Templates */}
          {connected && (
            <div style={sectionStyle}>
              <h3 style={h3}>Message templates <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{approvedCount}/{templates.length} approved</span></h3>
              <div style={sub}>Meta reviews every template before it can be sent. Templates are per WhatsApp account: submit again after connecting the shop number.</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th style={{ padding: 4 }}>Template</th><th style={{ padding: 4 }}>Language</th><th style={{ padding: 4 }}>Status</th></tr></thead>
                  <tbody>
                    {templates.map(t => (
                      <tr key={`${t.name}-${t.language}`} style={{ borderTop: '1px solid var(--line)' }} title={t.body}>
                        <td style={{ padding: 4, fontFamily: 'monospace' }}>{t.name}</td>
                        <td style={{ padding: 4 }}>{t.language === 'lo' ? 'Lao' : 'English'}</td>
                        <td style={{ padding: 4 }}>
                          <span style={t.status === 'APPROVED' ? chip('rgba(46,125,50,0.12)', '#2e7d32') : t.status === 'REJECTED' ? chip('rgba(239,68,68,0.12)', '#ef4444') : chip('rgba(217,119,6,0.14)', '#b45309')}>{t.status.replace(/_/g, ' ')}</span>
                          {t.rejectedReason && <span style={{ color: '#ef4444' }}> {t.rejectedReason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn" disabled={!!busy} onClick={() => run('submit-en', () => templatesAction(shopId, 'submit', ['en'] as WaLanguage[]), 'English templates submitted to Meta for review.')}>Submit English templates</button>
                <button className="btn" disabled={!!busy} onClick={() => { if (window.confirm('Has a native Lao speaker at D1 reviewed the Lao template text? It cannot be edited after Meta approves it.')) void run('submit-lo', () => templatesAction(shopId, 'submit', ['lo'] as WaLanguage[]), 'Lao templates submitted to Meta for review.'); }}>Submit Lao templates</button>
                <button className="btn" disabled={!!busy} onClick={() => run('sync', () => templatesAction(shopId, 'sync'), 'Template statuses refreshed.')}>Refresh statuses</button>
              </div>
            </div>
          )}

          {/* 3. Coexistence */}
          <div style={sectionStyle}>
            <h3 style={h3}>3 · Connect the shop&apos;s WhatsApp Business App number</h3>
            <div style={sub}>
              Opens Meta&apos;s Embedded Signup. Choose <strong>Connect your existing WhatsApp Business App</strong>, enter the shop number, then on the shop phone tap <strong>Connect</strong> → <strong>Connect to the Business Platform</strong>. RedlineD1 stores the connection switched off and in sandbox mode.
            </div>
            {connected && isCoexistence ? (
              <div style={{ fontSize: 12, display: 'grid', gap: 3 }}>
                <div>Business App + Cloud API: <strong>{c?.isOnBizApp ? 'yes' : 'NO'}</strong> · platform {c?.platformType ?? '—'}</div>
                <div>Quality {c?.qualityRating ?? '—'} · messaging limit {c?.messagingLimitTier ?? '—'} · webhook {c?.webhookVerifiedAt ? 'verified' : 'not verified'} · checked {c?.lastVerifiedAt ? new Date(c.lastVerifiedAt).toLocaleString() : '—'}</div>
                {c?.lastAccountEvent && <div style={{ color: '#b45309' }}>Last Meta account event: {c.lastAccountEvent}</div>}
              </div>
            ) : (
              <>
                <button className="btn btn-primary" disabled={!!busy || !st.readyToConnect || !st.sandboxTestPassed} onClick={launchEmbeddedSignup}
                  title={!st.readyToConnect ? 'Complete the eligibility checklist first' : !st.sandboxTestPassed ? 'Deliver one sandbox test message first' : undefined}>
                  {busy === 'signup' ? 'Waiting for Meta…' : 'Connect existing WhatsApp Business App'}
                </button>
                {(!st.readyToConnect || !st.sandboxTestPassed) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Needs: {[!st.readyToConnect && 'eligibility checklist complete', !st.sandboxTestPassed && 'one sandbox message delivered'].filter(Boolean).join(' · ')}
                  </div>
                )}
              </>
            )}
            {connected && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn" disabled={!!busy} onClick={() => run('verify', () => verifyWhatsApp(shopId), 'Connection verified with Meta.')}>Verify connection</button>
                <button className="btn" style={{ color: 'var(--danger)' }} disabled={!!busy}
                  onClick={() => { if (window.confirm('Disconnect RedlineD1 from WhatsApp? This deletes RedlineD1\'s stored token and stops all sending. It does NOT change the WhatsApp Business App or deregister the number.')) void run('disc', () => disconnectWhatsApp(shopId), 'RedlineD1 disconnected. The WhatsApp Business App is unchanged.'); }}>
                  Disconnect RedlineD1
                </button>
              </div>
            )}
          </div>

          {/* 4. Live approval */}
          {connected && isCoexistence && (
            <div style={sectionStyle}>
              <h3 style={h3}>4 · Live customer messages</h3>
              {st.mode === 'live' ? (
                <>
                  <div style={sub}>Approved {c?.liveApprovedAt ? new Date(c.liveApprovedAt).toLocaleString() : ''}. Staff can send to any opted-in customer.{!st.server?.liveSendingEnv && ' The deployment switch WHATSAPP_LIVE_SENDING_ENABLED is off, so nothing is sent yet.'}</div>
                  <button className="btn" disabled={!!busy} onClick={() => run('sandbox-mode', () => updateWhatsAppSettings(shopId, { mode: 'sandbox' }), 'Back to sandbox: only test numbers receive messages.')}>Return to sandbox mode</button>
                </>
              ) : (
                <>
                  <div style={sub}>Until approved, only the sandbox test numbers above receive messages. Type <strong>{LIVE_PHRASE}</strong> to approve.{!st.server?.liveSendingEnv && ' The deployment must also set WHATSAPP_LIVE_SENDING_ENABLED=true.'}</div>
                  <div style={{ display: 'flex', gap: 8, maxWidth: 460 }}>
                    <input style={input} value={livePhrase} onChange={e => setLivePhrase(e.target.value)} placeholder={LIVE_PHRASE} aria-label="Live approval phrase" />
                    <button className="btn btn-primary" disabled={!!busy || livePhrase !== LIVE_PHRASE}
                      onClick={() => run('live', async () => { await updateWhatsAppSettings(shopId, { mode: 'live', liveConfirmation: livePhrase }); setLivePhrase(''); }, 'Live customer messages approved.')}>Approve live</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 5. Automations */}
          {connected && (
            <div style={sectionStyle}>
              <h3 style={h3}>5 · Automated notifications <span style={chip('rgba(107,114,128,0.14)', 'var(--muted)')}>OPTIONAL</span></h3>
              <div style={sub}>Off by default. Manual sending works without this. Automated messages go only to customers who already opted in, at most once per job stage.</div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 6, cursor: st.enabled ? 'pointer' : 'not-allowed', opacity: st.enabled ? 1 : 0.5 }}>
                <input type="checkbox" checked={!!c?.automationsEnabled} disabled={!st.enabled || !!busy}
                  onChange={e => run('auto', () => updateWhatsAppSettings(shopId, { automationsEnabled: e.target.checked }), e.target.checked ? 'Automated notifications activated.' : 'Automated notifications off.')} />
                Activate automated notifications
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginLeft: 24, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!c?.automationSettings?.jobReadyForPickup} disabled={!!busy}
                  onChange={e => run('auto-ready', () => updateWhatsAppSettings(shopId, { automationSettings: { jobReadyForPickup: e.target.checked } }))} />
                Vehicle ready for pickup (job card reaches &quot;Ready for Pickup&quot;)
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginLeft: 24, marginTop: 6 }}>
                Language
                <select style={{ ...input, width: 'auto' }} value={c?.automationSettings?.language ?? 'en'} disabled={!!busy}
                  onChange={e => run('auto-lang', () => updateWhatsAppSettings(shopId, { automationSettings: { language: e.target.value } }))}>
                  <option value="en">English</option>
                  <option value="lo">ລາວ (Lao)</option>
                </select>
              </label>
            </div>
          )}

          {/* Plan */}
          <div style={{ ...sectionStyle, fontSize: 11, color: 'var(--muted)' }}>
            D1 Imports pilot (internal — always included). For other shops this will be included in {WHATSAPP_INCLUDED_PLANS.map(p => p[0].toUpperCase() + p.slice(1)).join(', ')} and available as the &quot;{WHATSAPP_ADDON.name}&quot; add-on for Solo and Starter — not on sale yet. Meta bills its per-message charges to the WhatsApp Business account directly.
          </div>
        </div>
      )}
    </Panel>
  );
}
