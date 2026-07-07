'use client';

import { useState, useEffect } from 'react';
import { TriageVehicle } from '@/lib/triage/QuestionTypes';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

const FUEL_TYPES    = ['Gasoline', 'Diesel', 'Hybrid', 'PHEV', 'Electric', 'E85', 'CNG', 'Unknown'];
const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT', 'DCT', 'Unknown'];

interface Props {
  vehicle: TriageVehicle;
  onChange: (vehicle: TriageVehicle) => void;
  onNext: () => void;
}

interface CustomerOption { id: string; name: string }
interface VehicleOption  { id: string; label: string; make: string; model: string; year: string; engine: string; mileage: string; fuelType: string; transmission: string }

export function VehicleStep({ vehicle, onChange, onNext }: Props) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

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
      .select('id, make, model, year, engine, mileage, fuel_type, transmission')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId)
      .order('label')
      .limit(500);
    setVehicleOptions((data ?? []).map(v => ({
      id:           v.id,
      label:        `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim(),
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

  const canProceed = vehicle.make && vehicle.model && vehicle.year;

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Select an existing customer to auto-load their vehicle, or enter details manually.
      </p>

      {/* Customer selector */}
      {customers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="field">
            <label>Customer (optional)</label>
            <select value={vehicle.customerId ?? ''} onChange={e => handleCustomerSelect(e.target.value)}>
              <option value="">— Walk-in / New customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {vehicleOptions.length > 0 && (
            <div className="field">
              <label>Vehicle on file {loadingVehicles && <span style={{ color: 'var(--muted)' }}>loading…</span>}</label>
              <select value={vehicle.vehicleId ?? ''} onChange={e => handleVehicleSelect(e.target.value)}>
                <option value="">— select vehicle —</option>
                {vehicleOptions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Vehicle fields */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
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
