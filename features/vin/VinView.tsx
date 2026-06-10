'use client';

import { useState } from 'react';
import { Panel } from '@/components/Panel';
import { decodeVinAPI, vinChecksum, type VinDecodeResult } from '@/services/vinDecoderService';
import { fetchCustomerNames } from '@/services/vehicleService';
import { supabase } from '@/lib/supabase';

type SaveTarget = 'none' | 'vehicle' | 'job-card';

const FIELD_LABELS: { key: keyof VinDecodeResult; label: string; icon: string }[] = [
  { key: 'year',              label: 'Model Year',       icon: '📅' },
  { key: 'make',              label: 'Make',             icon: '🏭' },
  { key: 'model',             label: 'Model',            icon: '🚗' },
  { key: 'trim',              label: 'Trim Level',       icon: '✨' },
  { key: 'bodyStyle',         label: 'Body Style',       icon: '🔲' },
  { key: 'vehicleType',       label: 'Vehicle Type',     icon: '🏷️' },
  { key: 'driveType',         label: 'Drive Type',       icon: '⚙️' },
  { key: 'engineCylinders',   label: 'Cylinders',        icon: '🔩' },
  { key: 'engineDisplacement',label: 'Displacement (L)', icon: '📐' },
  { key: 'engineHP',          label: 'Horsepower',       icon: '💪' },
  { key: 'fuelType',          label: 'Fuel Type',        icon: '⛽' },
  { key: 'transmission',      label: 'Transmission',     icon: '🔄' },
  { key: 'manufacturer',      label: 'Manufacturer',     icon: '🏢' },
  { key: 'plantCity',         label: 'Plant City',       icon: '🏭' },
  { key: 'plantCountry',      label: 'Plant Country',    icon: '🌍' },
];

const SAMPLE_VINS = [
  { label: '2023 Ford F-150', vin: '1FTFW1E85PFA24680' },
  { label: '2022 Toyota Camry', vin: '4T1C11AK5NU046971' },
  { label: '2021 Chevy Silverado', vin: '1GCUYDED5MZ126802' },
  { label: '2020 Honda CR-V', vin: '7FARW2H58LE020001' },
  { label: '2019 BMW 3-Series', vin: 'WBA5R1C50KAJ83150' },
];

export function VinView() {
  const [vin, setVin] = useState('');
  const [result, setResult] = useState<VinDecodeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saveTarget, setSaveTarget] = useState<SaveTarget>('vehicle');
  const [saving, setSaving] = useState(false);

  // For saving to vehicle
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [mileage, setMileage] = useState('');
  const [plate, setPlate] = useState('');
  const [customersLoaded, setCustomersLoaded] = useState(false);

  // For saving to job card
  const [serviceType, setServiceType] = useState('');
  const [jobNotes, setJobNotes] = useState('');

  const [history, setHistory] = useState<VinDecodeResult[]>([]);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const vinValid = vin.trim().length === 17;
  const checksumOk = vinValid ? vinChecksum(vin.trim()) : null;

  async function handleDecode() {
    if (!vinValid) return setError('VIN must be exactly 17 characters.');
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await decodeVinAPI(vin.trim());
      if (!data.make && !data.model) throw new Error('VIN not found in NHTSA database. Check the VIN and try again.');
      setResult(data);
      setHistory(prev => [data, ...prev.filter(h => h.vin !== data.vin)].slice(0, 10));
      if (!customersLoaded) {
        fetchCustomerNames().then(c => { setCustomers(c); setCustomersLoaded(true); }).catch(() => {});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Decode failed. Check your internet connection.');
    } finally { setLoading(false); }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      if (saveTarget === 'vehicle') {
        await supabase.from('vehicles').insert({
          vin: result.vin,
          label: result.label || `${result.year} ${result.make} ${result.model}`.trim(),
          trim: result.trim,
          engine: `${result.engineCylinders ? result.engineCylinders + '-cyl' : ''} ${result.engineDisplacement ? result.engineDisplacement + 'L' : ''} ${result.fuelType || ''}`.trim(),
          transmission: result.transmission,
          mileage: mileage || '0',
          plate: plate || '',
          status: 'Active',
          recommendation: '',
          customer_id: customerId || null,
        });
        notify(`${result.label} saved as vehicle record.`);
      } else if (saveTarget === 'job-card') {
        await supabase.from('job_cards').insert({
          customer: customerName || 'Unknown',
          vehicle: result.label,
          service_type: serviceType || 'General Service',
          status: 'New',
          channel: 'Walk-In',
          notes: `VIN: ${result.vin}\n${result.engineCylinders ? 'Engine: ' + result.engineCylinders + '-cyl ' + result.engineDisplacement + 'L' : ''}\nDrive: ${result.driveType}\n${jobNotes}`.trim(),
        });
        notify(`Job card created for ${result.label}.`);
      }
    } catch (e: unknown) {
      setError('Save failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

        {/* ── Main Decoder ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <Panel title="🔍 VIN Decoder" hint="Live decode via NHTSA vPIC API — free, no API key required">
            {/* Input */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    value={vin}
                    onChange={e => { setVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '')); setError(''); setResult(null); }}
                    maxLength={17}
                    placeholder="Enter 17-character VIN"
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 18,
                      fontFamily: 'monospace', letterSpacing: '0.12em', fontWeight: 700,
                      border: `2px solid ${vin.length === 17 ? (checksumOk ? '#4caf50' : '#ff9800') : 'var(--line)'}`,
                      background: 'var(--surface)', color: 'var(--text)', outline: 'none',
                    }}
                  />
                  {vin.length > 0 && (
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700 }}>
                      <span style={{ color: 'var(--muted)' }}>{vin.length}/17</span>
                      {vin.length === 17 && (
                        <span style={{ marginLeft: 8, color: checksumOk ? '#4caf50' : '#ff9800' }}>
                          {checksumOk ? '✓ Valid' : '⚠ Check digit'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                  I, O, Q not allowed in VINs · Position 9 is the check digit
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleDecode}
                disabled={!vinValid || loading}
                style={{ padding: '12px 28px', fontSize: 15, fontWeight: 700, minWidth: 140 }}
              >
                {loading ? '⏳ Decoding…' : '🔍 Decode VIN'}
              </button>
            </div>

            {/* Sample VINs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Try:</span>
              {SAMPLE_VINS.map(s => (
                <button key={s.vin} onClick={() => { setVin(s.vin); setError(''); setResult(null); }}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--muted)', cursor: 'pointer' }}>
                  {s.label}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: '#fff0f0', border: '1px solid #fecaca', borderRadius: 8, color: '#f44336', fontSize: 13, marginTop: 10 }}>
                ⚠ {error}
              </div>
            )}
          </Panel>

          {/* Results */}
          {result && (
            <>
              {/* Header */}
              <div style={{ background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)' }}>{result.label || 'Unknown Vehicle'}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 15, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.1em' }}>{result.vin}</div>
                    {result.manufacturer && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Manufactured by {result.manufacturer}{result.plantCity ? ` · ${result.plantCity}, ${result.plantCountry}` : ''}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: checksumOk ? '#4caf5022' : '#ff980022', color: checksumOk ? '#4caf50' : '#ff9800', border: `1px solid ${checksumOk ? '#4caf5044' : '#ff980044'}` }}>
                      {checksumOk ? '✓ VIN Checksum Valid' : '⚠ Check Digit Mismatch'}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Source: NHTSA vPIC API</div>
                  </div>
                </div>

                {/* Fields grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {FIELD_LABELS.filter(f => result[f.key]).map(({ key, label, icon }) => (
                    <div key={key} style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                        {icon} {label}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{result[key]}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save panel */}
              <Panel title="💾 Save to Redlined1 CRM" hint="Add decoded vehicle to your records">
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {([['vehicle', '🚗 Save as Vehicle Record'], ['job-card', '📋 Create Job Card'], ['none', 'Skip']] as [SaveTarget, string][]).map(([val, lbl]) => (
                    <button key={val} onClick={() => setSaveTarget(val)}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${saveTarget === val ? 'var(--accent)' : 'var(--line)'}`, background: saveTarget === val ? 'rgba(204,0,0,0.08)' : 'var(--surface-soft)', color: saveTarget === val ? 'var(--accent)' : 'var(--text)', fontWeight: saveTarget === val ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {saveTarget === 'vehicle' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div className="login-field">
                      <label>Customer</label>
                      <select value={customerId} onChange={e => { const c = customers.find(c => c.id === e.target.value); setCustomerId(e.target.value); if (c) setCustomerName(c.name); }}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                        <option value="">— select customer —</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="login-field">
                      <label>License Plate</label>
                      <input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="ABC1234" />
                    </div>
                    <div className="login-field">
                      <label>Current Mileage</label>
                      <input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="0" />
                    </div>
                    <div className="login-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ background: 'var(--surface-soft)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--muted)', width: '100%' }}>
                        VIN, make, model, trim, engine, transmission auto-filled from decode
                      </div>
                    </div>
                  </div>
                )}

                {saveTarget === 'job-card' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div className="login-field">
                      <label>Customer Name</label>
                      <select value={customerId} onChange={e => { const c = customers.find(c => c.id === e.target.value); setCustomerId(e.target.value); if (c) setCustomerName(c.name); }}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                        <option value="">— select customer —</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="login-field">
                      <label>Service Requested</label>
                      <input value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="Oil change, inspection…" />
                    </div>
                    <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Notes</label>
                      <input value={jobNotes} onChange={e => setJobNotes(e.target.value)} placeholder="Additional notes for the job card…" />
                    </div>
                  </div>
                )}

                {saveTarget !== 'none' && (
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : saveTarget === 'vehicle' ? '💾 Save Vehicle Record' : '📋 Create Job Card'}
                  </button>
                )}
              </Panel>
            </>
          )}
        </div>

        {/* ── Right: History + Info ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {history.length > 0 && (
            <Panel title="🕐 Decode History">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map(h => (
                  <div key={h.vin} onClick={() => { setVin(h.vin); setResult(h); }}
                    style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: result?.vin === h.vin ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{h.label || h.vin}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', marginTop: 2, letterSpacing: '0.08em' }}>{h.vin}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="ℹ️ VIN Structure" hint="How a 17-character VIN is structured">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              {[
                { pos: '1–3', label: 'World Manufacturer ID', color: '#2196f3' },
                { pos: '4–8', label: 'Vehicle Descriptor', color: '#ff9800' },
                { pos: '9',   label: 'Check Digit', color: '#9c27b0' },
                { pos: '10',  label: 'Model Year', color: '#4caf50' },
                { pos: '11',  label: 'Plant Code', color: '#f44336' },
                { pos: '12–17', label: 'Sequential Serial #', color: '#888' },
              ].map(({ pos, label, color }) => (
                <div key={pos} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 11, padding: '2px 4px', borderRadius: 4, background: color + '22', color }}>{pos}</div>
                  <div style={{ color: 'var(--muted)' }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(33,150,243,0.07)', borderRadius: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
              <strong>Data source:</strong> NHTSA vPIC API (api.nhtsa.gov) — official US government vehicle database. Free, no API key required.
            </div>
          </Panel>
        </div>

      </div>
    </>
  );
}
