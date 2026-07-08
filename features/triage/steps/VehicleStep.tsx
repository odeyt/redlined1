'use client';

import { useState, useEffect, useRef } from 'react';
import { TriageVehicle } from '@/lib/triage/QuestionTypes';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

const FUEL_TYPES     = ['Gasoline', 'Diesel', 'Hybrid', 'PHEV', 'Electric', 'E85', 'CNG', 'Unknown'];
const TRANSMISSIONS  = ['Automatic', 'Manual', 'CVT', 'DCT', 'Unknown'];
const CUSTOMER_TYPES = ['Retail', 'Fleet', 'Dealer', 'Mobile', 'Insurance', 'Wholesale'];

interface Props {
  vehicle: TriageVehicle;
  onChange: (vehicle: TriageVehicle) => void;
  onNext: () => void;
}

interface CustomerOption { id: string; name: string; phone?: string | null }
interface VehicleOption  { id: string; label: string; make: string; model: string; year: string; engine: string; mileage: string; fuelType: string; transmission: string }

const EMPTY_NEW = { name: '', phone: '', email: '', type: 'Retail' };

export function VehicleStep({ vehicle, onChange, onNext }: Props) {
  const [allCustomers, setAllCustomers]       = useState<CustomerOption[]>([]);
  const [vehicleOptions, setVehicleOptions]   = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  // Search state
  const [query, setQuery]           = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  // New-customer form
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer]         = useState(EMPTY_NEW);
  const [saving, setSaving]                   = useState(false);
  const [saveError, setSaveError]             = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const shopId = await getShopId();
      if (!shopId) return;
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('shop_id', shopId)
        .order('name')
        .limit(500);
      setAllCustomers(data ?? []);
    })();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = query.trim().length === 0
    ? allCustomers.slice(0, 8)
    : allCustomers.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.phone ?? '').includes(query)
      ).slice(0, 10);

  const exactMatch = allCustomers.some(
    c => c.name.toLowerCase() === query.trim().toLowerCase()
  );

  async function handleSelectCustomer(c: CustomerOption) {
    setQuery(c.name);
    setSelectedName(c.name);
    setShowDropdown(false);
    setShowNewCustomer(false);
    onChange({ ...vehicle, customerId: c.id, customerName: c.name });

    setLoadingVehicles(true);
    const shopId = await getShopId();
    const { data } = await supabase
      .from('vehicles')
      .select('id, label, make, model, year, engine, mileage, fuel_type, transmission, plate')
      .eq('shop_id', shopId)
      .eq('customer_id', c.id)
      .order('label')
      .limit(500);
    setVehicleOptions((data ?? []).map(v => ({
      id:           v.id,
      label:        [`${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim(), v.plate ? `#${v.plate}` : ''].filter(Boolean).join(' '),
      make:         v.make ?? '',
      model:        v.model ?? '',
      year:         String(v.year ?? ''),
      engine:       v.engine ?? '',
      mileage:      v.mileage ? String(v.mileage) : '',
      fuelType:     v.fuel_type ?? '',
      transmission: v.transmission ?? '',
    })));
    setLoadingVehicles(false);
  }

  function handleClearCustomer() {
    setQuery('');
    setSelectedName('');
    setShowDropdown(false);
    setVehicleOptions([]);
    onChange({ ...vehicle, customerId: '', customerName: '' });
  }

  function handleVehicleSelect(vehicleId: string) {
    const v = vehicleOptions.find(o => o.id === vehicleId);
    if (!v) return;
    onChange({ ...vehicle, vehicleId: v.id, make: v.make, model: v.model, year: v.year, engine: v.engine, mileage: v.mileage, fuelType: v.fuelType, transmission: v.transmission });
  }

  async function handleSaveNewCustomer() {
    if (!newCustomer.name.trim()) { setSaveError('Name is required.'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const shopId = await getShopId();
      const { data, error } = await supabase
        .from('customers')
        .insert({
          shop_id: shopId,
          name:    newCustomer.name.trim(),
          phone:   newCustomer.phone.trim() || null,
          email:   newCustomer.email.trim() || null,
          type:    newCustomer.type,
        })
        .select('id, name, phone')
        .single();
      if (error) throw new Error(error.message);

      const created: CustomerOption = { id: data.id, name: data.name, phone: data.phone };
      setAllCustomers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCustomer(EMPTY_NEW);
      setShowNewCustomer(false);
      await handleSelectCustomer(created);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  }

  function openNewForm() {
    setShowNewCustomer(true);
    setShowDropdown(false);
    setNewCustomer({ ...EMPTY_NEW, name: query.trim() });
    setSaveError(null);
  }

  function field(label: string, value: string, key: keyof TriageVehicle, placeholder = '') {
    return (
      <div className="field" key={key}>
        <label>{label}</label>
        <input value={value} placeholder={placeholder} onChange={e => onChange({ ...vehicle, [key]: e.target.value })} />
      </div>
    );
  }

  const canProceed = !!(vehicle.make && vehicle.model && vehicle.year);
  const isSelected = !!vehicle.customerId;

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Search for an existing customer to auto-load their vehicle, or enter details manually.
      </p>

      {/* Customer search */}
      <div className="field" style={{ marginBottom: showNewCustomer ? 8 : 16 }}>
        <label>Customer (optional)</label>
        <div ref={searchRef} style={{ position: 'relative' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 10, color: 'var(--muted)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
            <input
              value={query}
              placeholder="Search by name or phone…"
              style={{ paddingLeft: 32, paddingRight: isSelected ? 32 : 12 }}
              onChange={e => {
                setQuery(e.target.value);
                setShowDropdown(true);
                if (isSelected) {
                  onChange({ ...vehicle, customerId: '', customerName: '' });
                  setSelectedName('');
                  setVehicleOptions([]);
                }
              }}
              onFocus={() => setShowDropdown(true)}
              autoComplete="off"
            />
            {isSelected && (
              <button
                type="button"
                onClick={handleClearCustomer}
                title="Clear customer"
                style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Selected badge */}
          {isSelected && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, background: 'rgba(0,180,0,0.1)', color: '#16a34a', border: '1px solid rgba(0,180,0,0.25)', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>
                ✓ {selectedName}
              </span>
              <button type="button" onClick={handleClearCustomer} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                change
              </button>
            </div>
          )}

          {/* Dropdown */}
          {showDropdown && !isSelected && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', marginTop: 4,
              maxHeight: 280, overflowY: 'auto',
            }}>
              {filtered.length === 0 && query.trim() === '' && (
                <div style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13 }}>
                  Start typing to search customers…
                </div>
              )}
              {filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={() => handleSelectCustomer(c)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', borderBottom: '1px solid var(--line)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.phone}</div>}
                </button>
              ))}

              {/* Add new option */}
              {query.trim().length > 0 && !exactMatch && (
                <button
                  type="button"
                  onMouseDown={openNewForm}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', textAlign: 'left',
                    padding: '10px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', color: '#cc0000', fontWeight: 700, fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,0,0,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>+</span>
                  Add &ldquo;{query.trim()}&rdquo; as new customer
                </button>
              )}

              {query.trim().length > 0 && filtered.length === 0 && exactMatch === false && (
                null // handled above
              )}

              {query.trim().length === 0 && (
                <button
                  type="button"
                  onMouseDown={openNewForm}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', textAlign: 'left',
                    padding: '10px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', color: '#cc0000', fontWeight: 700, fontSize: 13,
                    borderTop: filtered.length > 0 ? '1px solid var(--line)' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,0,0,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 16 }}>+</span>
                  Add new customer
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline new-customer form */}
      {showNewCustomer && (
        <div style={{
          margin: '0 0 16px', padding: '16px 18px',
          background: 'rgba(204,0,0,0.05)', border: '1px solid rgba(204,0,0,0.22)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#cc0000', marginBottom: 12 }}>👤 New Customer</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Name <span style={{ color: '#cc0000' }}>*</span></label>
              <input
                value={newCustomer.name}
                placeholder="e.g. John Smith"
                autoFocus
                onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveNewCustomer(); }}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Phone</label>
              <input value={newCustomer.phone} placeholder="e.g. 555-0100" onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input type="email" value={newCustomer.email} placeholder="e.g. john@example.com" onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select value={newCustomer.type} onChange={e => setNewCustomer(p => ({ ...p, type: e.target.value }))}>
                {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {saveError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>⚠ {saveError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleSaveNewCustomer}
              disabled={saving || !newCustomer.name.trim()}
              style={{
                padding: '8px 18px',
                background: (saving || !newCustomer.name.trim()) ? 'var(--surface-soft)' : '#cc0000',
                color:      (saving || !newCustomer.name.trim()) ? 'var(--muted)' : '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13,
                cursor: (saving || !newCustomer.name.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : '✓ Save & Select'}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewCustomer(false); setNewCustomer(EMPTY_NEW); setSaveError(null); }}
              style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Vehicle on file */}
      {vehicleOptions.length > 0 && (
        <div className="field" style={{ marginBottom: 16 }}>
          <label>
            Vehicle on file
            {loadingVehicles && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>loading…</span>}
          </label>
          <select value={vehicle.vehicleId ?? ''} onChange={e => handleVehicleSelect(e.target.value)}>
            <option value="">— select vehicle —</option>
            {vehicleOptions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
      )}

      {/* Vehicle fields */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24, marginTop: 8 }}>
        {field('Make *', vehicle.make, 'make', 'e.g. Toyota')}
        {field('Model *', vehicle.model, 'model', 'e.g. Camry')}
        {field('Year *', vehicle.year, 'year', 'e.g. 2021')}
        {field('Engine', vehicle.engine, 'engine', 'e.g. 2.5L 4-cyl')}
        {field('Mileage', vehicle.mileage, 'mileage', 'e.g. 87500')}
        <div className="field">
          <label>Fuel Type</label>
          <select value={vehicle.fuelType} onChange={e => onChange({ ...vehicle, fuelType: e.target.value })}>
            <option value="">— select —</option>
            {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Transmission</label>
          <select value={vehicle.transmission} onChange={e => onChange({ ...vehicle, transmission: e.target.value })}>
            <option value="">— select —</option>
            {TRANSMISSIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        style={{
          background: canProceed ? '#cc0000' : 'var(--surface-soft)',
          color: canProceed ? '#fff' : 'var(--muted)',
          border: 'none', borderRadius: 8, padding: '10px 28px',
          fontWeight: 700, fontSize: 14, cursor: canProceed ? 'pointer' : 'not-allowed',
        }}
      >
        Continue to Complaint Category →
      </button>
    </div>
  );
}
