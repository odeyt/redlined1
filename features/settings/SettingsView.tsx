'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { navItems } from '@/lib/mock-data';
import { fetchShopSettings, saveShopSettings, uploadLogo, DEFAULT_PAYMENT_METHODS, DEFAULT_ROLE_PERMISSIONS, RolePermissions, RoleKey } from '@/services/shopSettingsService';
import { PAYMENT_METHODS } from '@/services/paymentService';
import { INSPECTION_TEMPLATE } from '@/services/inspectionService';
import { supabase } from '@/lib/supabase';

// Modules that can never be hidden
const LOCKED_MODULES = ['dashboard', 'settings'];

// Which modules are premium-only (visual indicator)
const PREMIUM_MODULES = ['ai', 'reports', 'diagnostics', 'subscriptions', 'access'];

const BUSINESS_TYPES = [
  'Solo mobile mechanic',
  'Single repair shop',
  'Multi-location shop group',
  'Enterprise fleet service company',
  'Dealership service center',
  'Tire & wheel specialist',
  'Transmission specialist',
  'Body & collision shop',
  'Fleet maintenance company',
  'Custom / Other',
];

export function SettingsView() {
  const fileRef = useRef<HTMLInputElement>(null);

  // Branding
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  // Portal / Business config
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [laborRate, setLaborRate] = useState(145);
  const [defaultTaxRate, setDefaultTaxRate] = useState(8.25);
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [estimatePrefix, setEstimatePrefix] = useState('EST-');
  const [businessType, setBusinessType] = useState('Single repair shop');
  const [serviceTypes, setServiceTypes] = useState('Oil Change,Brakes,Tires,Alignment,Engine,Transmission,Electrical,AC/Heat,Diagnostics,Inspection,Detailing,Custom');
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>(DEFAULT_PAYMENT_METHODS);
  const [enableTimeTracking, setEnableTimeTracking] = useState(true);

  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [activeRoleTab, setActiveRoleTab] = useState<RoleKey>('manager');
  const [savingRolePerms, setSavingRolePerms] = useState(false);

  const [inspTemplate, setInspTemplate] = useState<Array<{ category: string; name: string }>>(INSPECTION_TEMPLATE.map(({ category, name }) => ({ category, name })));
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPortal, setSavingPortal] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [savedBranding, setSavedBranding] = useState(false);
  const [savedPortal, setSavedPortal] = useState(false);
  const [savedRolePerms, setSavedRolePerms] = useState(false);
  const [savedTemplate, setSavedTemplate] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('redlined1-theme') as 'light' | 'dark' | null;
    if (saved) { setTheme(saved); document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : ''); }
    fetchShopSettings().then(s => {
      setCompanyName(s.companyName); setTagline(s.tagline); setLogoUrl(s.logoUrl);
      setAddress(s.address); setPhone(s.phone); setEmail(s.email); setWebsite(s.website);
      setHiddenModules(s.hiddenModules ?? []);
      setLaborRate(s.laborRate ?? 145);
      setDefaultTaxRate((s.defaultTaxRate ?? 0.08) * 100);
      setInvoicePrefix(s.invoicePrefix ?? 'INV-');
      setEstimatePrefix(s.estimatePrefix ?? 'EST-');
      setBusinessType(s.businessType ?? 'Single repair shop');
      setServiceTypes(s.serviceTypes ?? '');
      setEnabledPaymentMethods(s.enabledPaymentMethods ?? DEFAULT_PAYMENT_METHODS);
      setEnableTimeTracking(s.enableTimeTracking ?? true);
      setRolePermissions(s.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS);
      if (s.inspectionTemplate && s.inspectionTemplate.length > 0) {
        setInspTemplate(s.inspectionTemplate);
      }
    }).catch(err => setError('Could not load settings: ' + err.message));
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwDone(false);
    if (pwNew.length < 8) return setPwError('Password must be at least 8 characters.');
    if (pwNew !== pwConfirm) return setPwError('Passwords do not match.');
    setPwSaving(true);
    try {
      // Re-authenticate first to verify current password
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Could not identify current user.');
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwCurrent });
      if (signInErr) throw new Error('Current password is incorrect.');
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      setPwDone(true);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setPwSaving(false);
    }
  }

  function applyTheme(t: 'light' | 'dark') {
    setTheme(t);
    localStorage.setItem('redlined1-theme', t);
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : '');
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await uploadLogo(file);
      setLogoUrl(url);
      notify('Logo uploaded.');
    } catch (err: unknown) {
      setError('Logo upload failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setUploading(false); }
  }

  function flashSaved(setter: (v: boolean) => void) {
    setter(true);
    setTimeout(() => setter(false), 3000);
  }

  async function handleSaveBranding() {
    setSaving(true);
    try {
      await saveShopSettings({ companyName, tagline, logoUrl, address, phone, email, website });
      window.dispatchEvent(new CustomEvent('shop-settings-updated', { detail: { companyName, tagline, logoUrl } }));
      flashSaved(setSavedBranding);
    } catch (err: unknown) {
      setError('Save failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setSaving(false); }
  }

  async function handleSavePortal() {
    setSavingPortal(true);
    try {
      await saveShopSettings({
        hiddenModules,
        laborRate,
        defaultTaxRate: defaultTaxRate / 100,
        invoicePrefix,
        estimatePrefix,
        businessType,
        serviceTypes,
        enabledPaymentMethods,
        enableTimeTracking,
      });
      window.dispatchEvent(new CustomEvent('shop-settings-updated', { detail: { hiddenModules } }));
      flashSaved(setSavedPortal);
    } catch (err: unknown) {
      setError('Save failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setSavingPortal(false); }
  }

  function toggleModule(id: string) {
    if (LOCKED_MODULES.includes(id)) return;
    setHiddenModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }

  function toggleRolePerm(role: RoleKey, moduleId: string) {
    setRolePermissions(prev => {
      const current = prev[role];
      return {
        ...prev,
        [role]: current.includes(moduleId)
          ? current.filter(m => m !== moduleId)
          : [...current, moduleId],
      };
    });
  }

  async function handleSaveRolePerms() {
    setSavingRolePerms(true);
    try {
      await saveShopSettings({ rolePermissions });
      window.dispatchEvent(new CustomEvent('shop-settings-updated', { detail: { rolePermissions } }));
      flashSaved(setSavedRolePerms);
    } catch (err: unknown) {
      setError('Save failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setSavingRolePerms(false); }
  }

  const currentLogo = logoPreview ?? logoUrl;
  const visibleCount = navItems.filter(([id]) => !hiddenModules.includes(id)).length;

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}
      {error && (
        <p style={{ color: 'var(--danger)', padding: '10px 14px', background: '#fff0f0', borderRadius: 6, marginBottom: 12 }}>
          {error} <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
        </p>
      )}

      {/* ── CHANGE PASSWORD ── */}
      <Panel title="Change Password" hint="Update your login password — required after your first sign-in with a temporary password">
        {pwDone ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(76,175,80,0.08)', border: '1px solid #4caf5044', borderRadius: 10 }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: '#4caf50', fontSize: 14 }}>Password updated successfully</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Your new password is active. Use it on your next login.</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, alignItems: 'end' }}>
              <div className="login-field" style={{ margin: 0 }}>
                <label>Current Password</label>
                <input type="password" value={pwCurrent} onChange={e => { setPwCurrent(e.target.value); setPwError(''); setPwDone(false); }}
                  placeholder="Your current password" required
                  style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%' }} />
              </div>
              <div className="login-field" style={{ margin: 0 }}>
                <label>New Password</label>
                <input type="password" value={pwNew} onChange={e => { setPwNew(e.target.value); setPwError(''); setPwDone(false); }}
                  placeholder="At least 8 characters" required minLength={8}
                  style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%' }} />
              </div>
              <div className="login-field" style={{ margin: 0 }}>
                <label>Confirm New Password</label>
                <input type="password" value={pwConfirm} onChange={e => { setPwConfirm(e.target.value); setPwError(''); setPwDone(false); }}
                  placeholder="Repeat new password" required
                  style={{ border: `1px solid ${pwConfirm && pwConfirm !== pwNew ? '#f44336' : 'var(--line)'}`, borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%' }} />
              </div>
            </div>
            {pwError && (
              <p style={{ marginTop: 10, fontSize: 13, color: '#f44336', padding: '8px 12px', background: 'rgba(244,67,54,0.07)', borderRadius: 6 }}>
                {pwError}
              </p>
            )}
            <div style={{ marginTop: 14 }}>
              <button type="submit" className="btn btn-primary" disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}>
                {pwSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </Panel>

      {/* ── BRANDING ── */}
      <Panel title="Shop Branding" hint="Company name, logo, and contact info — shown on invoices and estimates">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="login-field">
              <label>Company Name</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your shop name" />
            </div>
            <div className="login-field">
              <label>Tagline</label>
              <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Service, fleet, mobile, parts" />
            </div>
            <div className="login-field">
              <label>Business Address</label>
              <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder={'123 Main St\nCity, State 00000'} rows={2} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="login-field">
                <label>Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
              </div>
              <div className="login-field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="shop@example.com" />
              </div>
            </div>
            <div className="login-field">
              <label>Website</label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.yourshop.com" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Logo */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {currentLogo
                  ? <img src={currentLogo} alt="Logo" style={{ height: 56, maxWidth: 160, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--line)', padding: 4, background: '#fff' }} />
                  : <div style={{ width: 80, height: 56, borderRadius: 8, border: '2px dashed var(--line)', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 11 }}>No logo</div>
                }
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload Logo'}</button>
                  {currentLogo && <button className="btn" style={{ fontSize: 12 }} onClick={() => { setLogoUrl(null); setLogoPreview(null); }}>Remove</button>}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>PNG, JPG, SVG</span>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
              </div>
            </div>

            {/* Sidebar preview */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Sidebar Preview</label>
              <div style={{ background: 'var(--nav)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                {currentLogo
                  ? <img src={currentLogo} alt="Logo" style={{ height: 38, width: 38, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 3 }} />
                  : <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>{companyName?.slice(0, 2).toUpperCase() || 'RL'}</div>
                }
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{companyName || 'Your Shop Name'}</div>
                  <div style={{ color: '#888', fontSize: 11 }}>{tagline || 'Your tagline here'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSaveBranding} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save Branding'}</button>
          {savedBranding && <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 13 }}>✓ Branding saved</span>}
        </div>
      </Panel>

      {/* ── APPEARANCE ── */}
      <Panel title="Appearance" hint="Choose how the app looks on your device">
        <div style={{ display: 'flex', gap: 16 }}>
          {(['light', 'dark'] as const).map(t => (
            <button key={t} onClick={() => applyTheme(t)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 32px', borderRadius: 12, cursor: 'pointer', border: theme === t ? '2px solid var(--accent)' : '2px solid var(--line)', background: t === 'dark' ? '#111' : '#fff', color: t === 'dark' ? '#f0f0f0' : '#111', fontWeight: theme === t ? 700 : 400 }}>
              <span style={{ fontSize: 28 }}>{t === 'light' ? '☀️' : '🌙'}</span>
              <span style={{ fontSize: 14, textTransform: 'capitalize' }}>{t}</span>
              {theme === t && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Active</span>}
            </button>
          ))}
        </div>
      </Panel>

      {/* ── PORTAL CUSTOMIZATION ── */}
      <Panel title="Portal Customization" hint="Toggle modules on/off, set business defaults — customize the portal for your shop">

        {/* Feature Toggles */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Feature Toggles</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>⏱ Time Tracking</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Allow technicians to clock in/out per job. Adds "Time Tracking" to the sidebar.</div>
              </div>
              <button
                onClick={() => setEnableTimeTracking(v => !v)}
                style={{
                  width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: enableTimeTracking ? 'var(--accent)' : 'var(--line)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: enableTimeTracking ? 25 : 3,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          </div>
        </div>

        {/* Business Type */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Business Type</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {BUSINESS_TYPES.map(type => (
              <button key={type} onClick={() => setBusinessType(type)}
                style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontSize: 13, border: businessType === type ? '2px solid var(--accent)' : '1px solid var(--line)', background: businessType === type ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)', fontWeight: businessType === type ? 700 : 400, color: businessType === type ? 'var(--accent)' : 'var(--text)' }}>
                {businessType === type && '✓ '}{type}
              </button>
            ))}
          </div>
        </div>

        {/* Business Defaults */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Business Defaults</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div className="login-field">
              <label>Labor Rate ($/hr)</label>
              <input type="number" value={laborRate} onChange={e => setLaborRate(Number(e.target.value))} min="0" step="5" />
            </div>
            <div className="login-field">
              <label>Default Tax Rate (%)</label>
              <input type="number" value={defaultTaxRate} onChange={e => setDefaultTaxRate(Number(e.target.value))} min="0" max="30" step="0.25" />
            </div>
            <div className="login-field">
              <label>Invoice Prefix</label>
              <input value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)} placeholder="INV-" />
            </div>
            <div className="login-field">
              <label>Estimate Prefix</label>
              <input value={estimatePrefix} onChange={e => setEstimatePrefix(e.target.value)} placeholder="EST-" />
            </div>
          </div>
        </div>

        {/* Service Types */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>Service Types</h3>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)' }}>Comma-separated list — used in job cards and estimates dropdowns</p>
          <textarea value={serviceTypes} onChange={e => setServiceTypes(e.target.value)} rows={3}
            placeholder="Oil Change,Brakes,Tires,Alignment,Engine,Transmission,Electrical,AC/Heat,Diagnostics,Inspection"
            style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: '100%', resize: 'vertical' }} />
          {/* Tag preview */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {serviceTypes.split(',').map(s => s.trim()).filter(Boolean).map(s => (
              <span key={s} style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--surface-soft)', border: '1px solid var(--line)', fontSize: 12 }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Payment Methods */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Accepted Payment Methods</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Only checked methods appear in the payment dropdown.{' '}
                <strong>{enabledPaymentMethods.length}</strong> of {PAYMENT_METHODS.length} enabled.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="mini-btn" onClick={() => setEnabledPaymentMethods(PAYMENT_METHODS.map(m => m.value))}>Enable All</button>
              <button className="mini-btn" onClick={() => setEnabledPaymentMethods(DEFAULT_PAYMENT_METHODS)}>Reset to Defaults</button>
            </div>
          </div>

          {/* Recommended banner */}
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}>
            💡 <strong>Best practice for most auto repair shops:</strong> Cash · Check · Credit Card · Debit Card · Apple Pay · Google Pay · Zelle · Fleet Account.
            Enable crypto or wire transfer only if you actively accept them — a shorter list reduces entry errors.
          </div>

          {/* Grouped method toggles */}
          {(['In Person', 'Card', 'Digital', 'Bank', 'Account', 'Crypto'] as const).map(group => {
            const groupMethods = PAYMENT_METHODS.filter(m => m.group === group);
            if (groupMethods.length === 0) return null;
            const groupLabels: Record<string, string> = {
              'In Person': '💵 In Person',
              'Card':      '💳 Card',
              'Digital':   '📱 Digital Wallets',
              'Bank':      '🏛 Bank / Wire',
              'Account':   '📋 Account / Net Terms',
              'Crypto':    '₿ Cryptocurrency',
            };
            const allOn = groupMethods.every(m => enabledPaymentMethods.includes(m.value));
            return (
              <div key={group} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{groupLabels[group]}</span>
                  <button
                    className="mini-btn"
                    style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={() => {
                      const vals = groupMethods.map(m => m.value);
                      if (allOn) setEnabledPaymentMethods(prev => prev.filter(v => !vals.includes(v)));
                      else setEnabledPaymentMethods(prev => [...new Set([...prev, ...vals])]);
                    }}
                  >
                    {allOn ? 'Disable group' : 'Enable group'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {groupMethods.map(m => {
                    const on = enabledPaymentMethods.includes(m.value);
                    return (
                      <button
                        key={m.value}
                        onClick={() => setEnabledPaymentMethods(prev =>
                          on ? prev.filter(v => v !== m.value) : [...prev, m.value]
                        )}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                          border: on ? '2px solid var(--accent)' : '1px solid var(--line)',
                          background: on ? 'rgba(204,0,0,0.07)' : 'var(--surface-soft)',
                          fontWeight: on ? 700 : 400,
                          color: on ? 'var(--accent)' : 'var(--muted)',
                          transition: 'all .12s',
                        }}
                      >
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          {on && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                        </div>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Module Visibility */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Sidebar Modules</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>{visibleCount} of {navItems.length} modules visible</p>
            </div>
            <button className="mini-btn" onClick={() => setHiddenModules([])}>Show All</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {navItems.map(([id, , label]) => {
              const isLocked = LOCKED_MODULES.includes(id);
              const isHidden = hiddenModules.includes(id);
              const isPremium = PREMIUM_MODULES.includes(id);
              return (
                <div key={id} onClick={() => toggleModule(id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: isLocked ? 'not-allowed' : 'pointer', border: `1px solid ${isHidden ? 'var(--line)' : 'var(--accent)'}`, background: isHidden ? 'var(--surface-soft)' : 'rgba(204,0,0,0.05)', opacity: isLocked ? 0.5 : 1, transition: 'all 0.15s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isHidden ? 'var(--line)' : 'var(--accent)'}`, background: isHidden ? 'transparent' : 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {!isHidden && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, flex: 1, color: isHidden ? 'var(--muted)' : 'var(--text)' }}>{label}</span>
                  {isLocked && <span style={{ fontSize: 10, color: 'var(--muted)' }}>🔒</span>}
                  {isPremium && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>★ Pro</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleSavePortal} disabled={savingPortal}>{savingPortal ? 'Saving…' : 'Save Portal Settings'}</button>
          {savedPortal
            ? <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 13 }}>✓ Portal settings saved</span>
            : <span style={{ fontSize: 12, color: 'var(--muted)' }}>Changes apply immediately to the sidebar</span>
          }
        </div>
      </Panel>

      <Panel title="Role Permissions" hint="Choose which modules each staff role can access — applies to Manager, Service Advisor, and Technician">
        {/* Role tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['manager', 'advisor', 'technician'] as RoleKey[]).map(r => {
            const labels: Record<RoleKey, string> = { manager: 'Manager', advisor: 'Service Advisor', technician: 'Technician' };
            const isActive = activeRoleTab === r;
            return (
              <button
                key={r}
                onClick={() => setActiveRoleTab(r)}
                style={{
                  padding: '7px 18px', borderRadius: 8, border: `1px solid ${isActive ? 'var(--accent)' : 'var(--line)'}`,
                  background: isActive ? 'rgba(204,0,0,0.12)' : 'var(--surface-soft)',
                  color: isActive ? 'var(--accent)' : 'var(--muted)', fontSize: 13, fontWeight: isActive ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {labels[r]}
              </button>
            );
          })}
        </div>

        {/* Module checkboxes for active tab */}
        <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--muted)' }}>
          {rolePermissions[activeRoleTab].length} of {navItems.length} modules enabled for {activeRoleTab === 'advisor' ? 'Service Advisors' : activeRoleTab === 'manager' ? 'Managers' : 'Technicians'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 20 }}>
          {navItems.map(([id, , label]) => {
            const isAllowed = rolePermissions[activeRoleTab].includes(id);
            return (
              <div
                key={id}
                onClick={() => toggleRolePerm(activeRoleTab, id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${isAllowed ? 'var(--accent)' : 'var(--line)'}`,
                  background: isAllowed ? 'rgba(204,0,0,0.05)' : 'var(--surface-soft)',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${isAllowed ? 'var(--accent)' : 'var(--line)'}`,
                  background: isAllowed ? 'var(--accent)' : 'transparent',
                  display: 'grid', placeItems: 'center',
                }}>
                  {isAllowed && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, flex: 1, color: isAllowed ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleSaveRolePerms} disabled={savingRolePerms}>
            {savingRolePerms ? 'Saving…' : 'Save Role Permissions'}
          </button>
          <button
            className="mini-btn"
            onClick={() => setRolePermissions(prev => ({ ...prev, [activeRoleTab]: DEFAULT_ROLE_PERMISSIONS[activeRoleTab] }))}
          >
            Reset to Default
          </button>
          {savedRolePerms && <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 13 }}>✓ Role permissions saved</span>}
        </div>
      </Panel>

      <Panel title="DVI Inspection Template" hint="Add, remove, or reorder checklist items used for Digital Vehicle Inspections">
        {/* Add new item */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={newItemCategory}
            onChange={e => setNewItemCategory(e.target.value)}
            placeholder="Category (e.g. Brakes)"
            style={{ flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
          />
          <input
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            placeholder="Item name (e.g. Front brake pads)"
            style={{ flex: 2, minWidth: 180, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
          />
          <button className="btn btn-primary" onClick={() => {
            if (!newItemCategory.trim() || !newItemName.trim()) return;
            setInspTemplate(prev => [...prev, { category: newItemCategory.trim(), name: newItemName.trim() }]);
            setNewItemName('');
          }}>+ Add Item</button>
        </div>

        {/* Grouped items */}
        {[...new Set(inspTemplate.map(i => i.category))].map(cat => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--line)' }}>{cat}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {inspTemplate.filter(i => i.category === cat).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-soft)', borderRadius: 8 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{item.name}</span>
                  <button onClick={() => setInspTemplate(prev => prev.filter(i => !(i.category === item.category && i.name === item.name)))}
                    style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--danger)', background: 'rgba(244,67,54,0.08)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer' }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={savingTemplate} onClick={async () => {
            setSavingTemplate(true);
            try {
              await saveShopSettings({ inspectionTemplate: inspTemplate });
              flashSaved(setSavedTemplate);
            } catch { setError('Failed to save template'); }
            finally { setSavingTemplate(false); }
          }}>
            {savingTemplate ? 'Saving…' : 'Save Template'}
          </button>
          <button className="mini-btn" onClick={() => setInspTemplate(INSPECTION_TEMPLATE.map(({ category, name }) => ({ category, name })))}>
            Reset to Default
          </button>
          {savedTemplate && <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 13 }}>✓ Template saved</span>}
        </div>
      </Panel>
    </>
  );
}
