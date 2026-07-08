'use client';

import { useState, useEffect } from 'react';
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

interface CustomerOption { id: string; name: string }
interface VehicleOption  { id: string; label: string; make: string; model: string; year: string; engine: string; mileage: string; fuelType: string; transmission: string }

const EMPTY_NEW = { name: '', phone: '', email: '', type: 'Retail' };

export function VehicleStep({ vehicle, onChange, onNext }: Props) {
  const [customers, setCustomers]           = useState<CustomerOption[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

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
        .select('id, name')
        .eq('shop_id', shopId)
        .order('name')
        .limit(200);
      setCustomers(data ?? []);
    })();
  }, []);

  async function handleCustomerSelect(customerId: string) {
    const customer = customers.find(c => c.id === customerId);
    onChange({ ...vehicle, customerId, customerName: customer?.name ?? '' });

    if (!customerId) { setVehicleOptions([]); return; }
    setLoadingVehicles(true);
    const shopId = await getShopId();
    const { data } = await supabase
      .from('vehicles')
      .select('id, label, make, model, year, engine, mileage, fuel_type, transmission, plate')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId)
      .order('label')
      .limit(500);
    setVehicleOptions((data ?? []).map(v => ({
      id:           v.id,
      label:        [
        `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim(),
        v.plate ? `#${v.plate}` : '',
      ].filter(Boolean).join(' '),
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

  function handleVehicleSelect(vehicleId: string) {
    const v = vehicleOptions.find(o => o.id === vehicleId);
    if (!v) return;
    onChange({
      ...vehicle,
      vehicleId:    v.id,
      make:         v.make,
      model:        v.model,
      year:         v.year,
      engine:       v.engine,
      mileage:      v.mileage,
      fuelType:     v.fuelType,
      transmission: v.transmission,
    });
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
        .select('id, name')
        .single();

      if (error) throw new Error(error.message);

      const created: CustomerOption = { id: data.id, name: data.name };
      setCustomers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange({ ...vehicle, customerId: created.id, customerName: created.name });

      setNewCustomer(EMPTY_NEW);
      setShowNewCustomer(false);
      setVehicleOptions([]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, value: string, key: keyof TriageVehicle, placeholder = '') {
    return (
      <div className="field" key={key}>
        <label>{label}</label>
        <input
          value={value}
          placeholder={placeholder}
          onChange={e => onChange({ ...vehicle, [key]: e.target.value })}
        />
      </div>
    );
  }

  const canProceed = !!(vehicle.make && vehicle.model && vehicle.year);

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Select an existing customer to auto-load their vehicle, or enter details manually.
      </p>

      {/* Customer selector row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Customer (optional)</label>
          <select value={vehicle.customerId ?? ''} onChange={e => {
            setShowNewCustomer(false);
            setSaveError(null);
            handleCustomerSelect(e.target.value);
          }}>
            <option value="">— Walk-in / New customer —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={() => { setShowNewCustomer(v => !v); setSaveError(null); }}
          title="Add new customer"
          style={{
            padding: '0 14px',
            height: 38,
            background: showNewCustomer ? 'rgba(204,0,0,0.10)' : 'var(--surface)',
            border: `1px solid ${showNewCustomer ? '#cc0000' : 'var(--line)'}`,
            borderRadius: 8,
            color: showNewCustomer ? '#cc0000' : 'var(--text)',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {showNewCustomer ? '✕ Cancel' : '+ New Customer'}
        </button>
      </div>

      {/* Inline new-customer form */}
      {showNewCustomer && (
        <div style={{
          margin: '8px 0 16px',
          padding: '16px 18px',
          background: 'rgba(204,0,0,0.05)',
          border: '1px solid rgba(204,0,0,0.22)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#cc0000', marginBottom: 12 }}>
            👤 New Customer
          </div>

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
              <input
                value={newCustomer.phone}
                placeholder="e.g. 555-0100"
                onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input
                type="email"
                value={newCustomer.email}
                placeholder="e.g. john@example.com"
                onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select value={newCustomer.type} onChange={e => setNewCustomer(p => ({ ...p, type: e.target.value }))}>
                {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {saveError && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>⚠ {saveError}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleSaveNewCustomer}
              disabled={saving || !newCustomer.name.trim()}
              style={{
                padding: '8px 18px',
                background: (saving || !newCustomer.name.trim()) ? 'var(--surface-soft)' : '#cc0000',
                color:      (saving || !newCustomer.name.trim()) ? 'var(--muted)' : '#fff',
                border: 'none', borderRadius: 8,
                fontWeight: 700, fontSize: 13,
                cursor: (saving || !newCustomer.name.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : '✓ Save & Select'}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewCustomer(false); setNewCustomer(EMPTY_NEW); setSaveError(null); }}
              style={{
                padding: '8px 14px', background: 'transparent',
                border: '1px solid var(--line)', borderRadius: 8,
                fontSize: 13, cursor: 'pointer', color: 'var(--text)',
              }}
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
