'use client';

import React, { useState } from 'react';
import type { RepairOrder } from '@/services/repairOrderService';
import type { RepairCase } from '@/services/repairCaseService';
import {
  createRepairCaseFromJob,
  addDtcToRepairCase,
  addSymptomToRepairCase,
  addTestToRepairCase,
  addPartToRepairCase,
  addOutcomeToRepairCase,
} from '@/services/repairCaseService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  ro: RepairOrder;
  onClose: () => void;
  onCreated: (rc: RepairCase) => void;
}

interface WizardData {
  // Page 1 — Vehicle
  make: string;
  model: string;
  year: string;
  vin: string;
  mileage: string;
  engine: string;
  transmission: string;
  // Page 2 — Complaint & DTCs
  complaint: string;
  cause: string;
  symptoms: string[];
  symptomInput: string;
  primaryDtc: string;
  additionalDtcs: string[];
  dtcInput: string;
  // Page 3 — Tests
  tests: string[];
  customTestInput: string;
  // Page 4 — Repair
  finalFix: string;
  laborHours: string;
  partsReplaced: string[];
  partsInput: string;
  // Page 5 — Outcome
  repairSuccessful: boolean;
  comeback: boolean;
  warranty: boolean;
  confidence: number;
  // Page 6 — Lesson
  lessonLearned: string;
}

const STANDARD_TESTS = [
  'Voltage Test',
  'Resistance Test',
  'Pressure Test',
  'Smoke Test',
  'Compression Test',
  'Oscilloscope',
  'Programming / Calibration',
  'Other',
];

// ─── Parse vehicle string ─────────────────────────────────────────────────────
// RO.vehicle is a plain text string like "HYUNDAI ACCENT BLUE" or "2019 Toyota Camry"

function parseVehicleString(v: string): { make: string; model: string; year: string } {
  const cleaned = v.trim();
  const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : '';
  const withoutYear = cleaned.replace(year, '').trim();
  const parts = withoutYear.split(/\s+/).filter(Boolean);
  const make = parts[0] ?? '';
  const model = parts.slice(1).join(' ');
  return { make, model, year };
}

// ─── Auto-filled badge ────────────────────────────────────────────────────────

function AutoBadge() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: '#4caf5022', color: '#4caf50', border: '1px solid #4caf5044',
      letterSpacing: '0.04em', marginLeft: 6,
    }}>
      AUTO-FILLED
    </span>
  );
}

// ─── Init wizard from RO ──────────────────────────────────────────────────────

function initWizardData(ro: RepairOrder): { data: WizardData; autoFilled: Set<string> } {
  const roAny = ro as unknown as Record<string, unknown>;
  const auto = new Set<string>();

  const vehicleStr = (ro.vehicle as string) || '';
  const { make, model, year } = parseVehicleString(vehicleStr);
  if (make) auto.add('make');
  if (model) auto.add('model');
  if (year) auto.add('year');

  const complaint = (ro.concern ?? '') as string;
  if (complaint) auto.add('complaint');

  const cause = (ro.cause ?? '') as string;
  if (cause) auto.add('cause');

  const finalFix = (ro.correction ?? '') as string;
  if (finalFix) auto.add('finalFix');

  const laborHours = String(roAny.laborHours ?? roAny.labor_hours ?? '');
  if (laborHours && laborHours !== '0') auto.add('laborHours');

  const partNames: string[] = [];
  const roParts = ro.parts ?? [];
  roParts.forEach(p => {
    const name = (p as unknown as Record<string, unknown>).description as string | undefined;
    if (name) partNames.push(name);
  });
  if (partNames.length > 0) auto.add('partsReplaced');

  const data: WizardData = {
    make,
    model,
    year,
    vin: '',
    mileage: '',
    engine: '',
    transmission: '',
    complaint,
    cause,
    symptoms: [],
    symptomInput: '',
    primaryDtc: '',
    additionalDtcs: [],
    dtcInput: '',
    tests: [],
    customTestInput: '',
    finalFix,
    laborHours,
    partsReplaced: partNames,
    partsInput: '',
    repairSuccessful: true,
    comeback: false,
    warranty: false,
    confidence: 80,
    lessonLearned: '',
  };

  return { data, autoFilled: auto };
}

// ─── Sub-pages ────────────────────────────────────────────────────────────────

function PageVehicle({
  data,
  set,
  auto,
}: {
  data: WizardData;
  set: (d: Partial<WizardData>) => void;
  auto: Set<string>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
        Fields marked <span style={{ color: '#4caf50', fontWeight: 700 }}>AUTO-FILLED</span> are pulled directly from the Repair Order. Review and correct if needed.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
        <Row label={<>Make {auto.has('make') && <AutoBadge />}</>}>
          <input className="wiz-input" value={data.make} onChange={e => set({ make: e.target.value })} placeholder="e.g. Toyota" />
        </Row>
        <Row label={<>Model {auto.has('model') && <AutoBadge />}</>}>
          <input className="wiz-input" value={data.model} onChange={e => set({ model: e.target.value })} placeholder="e.g. Camry" />
        </Row>
        <Row label={<>Year {auto.has('year') && <AutoBadge />}</>}>
          <input className="wiz-input" value={data.year} onChange={e => set({ year: e.target.value })} placeholder="e.g. 2019" />
        </Row>
        <Row label="VIN">
          <input className="wiz-input" value={data.vin} onChange={e => set({ vin: e.target.value })} placeholder="Optional" />
        </Row>
        <Row label="Mileage">
          <input className="wiz-input" value={data.mileage} onChange={e => set({ mileage: e.target.value })} placeholder="e.g. 82500" type="number" />
        </Row>
        <Row label="Engine">
          <input className="wiz-input" value={data.engine} onChange={e => set({ engine: e.target.value })} placeholder="e.g. 2.5L 4-cyl" />
        </Row>
      </div>
      <Row label="Transmission">
        <select className="wiz-input" value={data.transmission} onChange={e => set({ transmission: e.target.value })}>
          <option value="">Select…</option>
          <option>Automatic</option>
          <option>Manual</option>
          <option>CVT</option>
          <option>DCT</option>
          <option>Unknown</option>
        </select>
      </Row>
    </div>
  );
}

function PageComplaint({
  data,
  set,
  auto,
}: {
  data: WizardData;
  set: (d: Partial<WizardData>) => void;
  auto: Set<string>;
}) {
  function addSymptom() {
    const s = data.symptomInput.trim();
    if (!s) return;
    set({ symptoms: [...data.symptoms, s], symptomInput: '' });
  }
  function removeSymptom(i: number) {
    set({ symptoms: data.symptoms.filter((_, idx) => idx !== i) });
  }
  function addDtc() {
    const d2 = data.dtcInput.trim().toUpperCase();
    if (!d2) return;
    set({ additionalDtcs: [...data.additionalDtcs, d2], dtcInput: '' });
  }
  function removeDtc(i: number) {
    set({ additionalDtcs: data.additionalDtcs.filter((_, idx) => idx !== i) });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Row label={<>Customer Complaint {auto.has('complaint') && <AutoBadge />}</>}>
        <textarea className="wiz-input" value={data.complaint} onChange={e => set({ complaint: e.target.value })} rows={3} placeholder="What the customer reported…" />
      </Row>
      <Row label={<>Technician Diagnosis / Cause {auto.has('cause') && <AutoBadge />}</>}>
        <textarea className="wiz-input" value={data.cause} onChange={e => set({ cause: e.target.value })} rows={3} placeholder="Root cause identified by technician…" />
      </Row>
      <Row label="Symptoms">
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="wiz-input" value={data.symptomInput} onChange={e => set({ symptomInput: e.target.value })} onKeyDown={e => e.key === 'Enter' && addSymptom()} placeholder="Add symptom + Enter" />
          <button className="wiz-btn-sm" onClick={addSymptom}>Add</button>
        </div>
        <TagList items={data.symptoms} onRemove={removeSymptom} />
      </Row>
      <Row label="Primary DTC">
        <input className="wiz-input" value={data.primaryDtc} onChange={e => set({ primaryDtc: e.target.value.toUpperCase() })} placeholder="e.g. P0300" />
      </Row>
      <Row label="Additional DTCs">
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="wiz-input" value={data.dtcInput} onChange={e => set({ dtcInput: e.target.value })} onKeyDown={e => e.key === 'Enter' && addDtc()} placeholder="Add DTC + Enter" />
          <button className="wiz-btn-sm" onClick={addDtc}>Add</button>
        </div>
        <TagList items={data.additionalDtcs} onRemove={removeDtc} />
      </Row>
    </div>
  );
}

function PageTests({ data, set }: { data: WizardData; set: (d: Partial<WizardData>) => void }) {
  function toggle(t: string) {
    if (data.tests.includes(t)) {
      set({ tests: data.tests.filter(x => x !== t) });
    } else {
      set({ tests: [...data.tests, t] });
    }
  }
  function addCustom() {
    const t = data.customTestInput.trim();
    if (!t || data.tests.includes(t)) return;
    set({ tests: [...data.tests, t], customTestInput: '' });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Select all diagnostic tests performed:</p>
      {STANDARD_TESTS.map(t => (
        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={data.tests.includes(t)} onChange={() => toggle(t)} />
          <span>{t}</span>
        </label>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input className="wiz-input" value={data.customTestInput} onChange={e => set({ customTestInput: e.target.value })} onKeyDown={e => e.key === 'Enter' && addCustom()} placeholder="Add custom test + Enter" />
        <button className="wiz-btn-sm" onClick={addCustom}>Add</button>
      </div>
      {data.tests.filter(t => !STANDARD_TESTS.includes(t)).length > 0 && (
        <TagList items={data.tests.filter(t => !STANDARD_TESTS.includes(t))} onRemove={i => {
          const custom = data.tests.filter(t => !STANDARD_TESTS.includes(t));
          const toRemove = custom[i];
          set({ tests: data.tests.filter(t => t !== toRemove) });
        }} />
      )}
    </div>
  );
}

function PageRepair({
  data,
  set,
  auto,
}: {
  data: WizardData;
  set: (d: Partial<WizardData>) => void;
  auto: Set<string>;
}) {
  function addPart() {
    const p = data.partsInput.trim();
    if (!p) return;
    set({ partsReplaced: [...data.partsReplaced, p], partsInput: '' });
  }
  function removePart(i: number) {
    set({ partsReplaced: data.partsReplaced.filter((_, idx) => idx !== i) });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Row label={<>Final Fix / Correction {auto.has('finalFix') && <AutoBadge />}</>}>
        <textarea className="wiz-input" value={data.finalFix} onChange={e => set({ finalFix: e.target.value })} rows={3} placeholder="What was done to fix the vehicle?" />
      </Row>
      <Row label={<>Labor Hours {auto.has('laborHours') && <AutoBadge />}</>}>
        <input className="wiz-input" value={data.laborHours} onChange={e => set({ laborHours: e.target.value })} type="number" step="0.5" placeholder="e.g. 2.5" />
      </Row>
      <Row label={<>Parts Replaced {auto.has('partsReplaced') && <AutoBadge />}</>}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="wiz-input" value={data.partsInput} onChange={e => set({ partsInput: e.target.value })} onKeyDown={e => e.key === 'Enter' && addPart()} placeholder="Add part + Enter" />
          <button className="wiz-btn-sm" onClick={addPart}>Add</button>
        </div>
        <TagList items={data.partsReplaced} onRemove={removePart} />
      </Row>
    </div>
  );
}

function PageOutcome({ data, set }: { data: WizardData; set: (d: Partial<WizardData>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row label="Repair Successful?">
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', gap: 6, cursor: 'pointer' }}><input type="radio" checked={data.repairSuccessful} onChange={() => set({ repairSuccessful: true })} /> Yes</label>
          <label style={{ display: 'flex', gap: 6, cursor: 'pointer' }}><input type="radio" checked={!data.repairSuccessful} onChange={() => set({ repairSuccessful: false })} /> No</label>
        </div>
      </Row>
      <Row label="Comeback?">
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', gap: 6, cursor: 'pointer' }}><input type="radio" checked={!data.comeback} onChange={() => set({ comeback: false })} /> No</label>
          <label style={{ display: 'flex', gap: 6, cursor: 'pointer' }}><input type="radio" checked={data.comeback} onChange={() => set({ comeback: true })} /> Yes</label>
        </div>
      </Row>
      <Row label="Warranty Claim?">
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', gap: 6, cursor: 'pointer' }}><input type="radio" checked={!data.warranty} onChange={() => set({ warranty: false })} /> No</label>
          <label style={{ display: 'flex', gap: 6, cursor: 'pointer' }}><input type="radio" checked={data.warranty} onChange={() => set({ warranty: true })} /> Yes</label>
        </div>
      </Row>
      <Row label={`Confidence: ${data.confidence}%`}>
        <input type="range" min={0} max={100} value={data.confidence} onChange={e => set({ confidence: Number(e.target.value) })} style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>0% — Not sure</span><span>50% — Likely</span><span>100% — Certain</span>
        </div>
      </Row>
    </div>
  );
}

function PageLesson({ data, set }: { data: WizardData; set: (d: Partial<WizardData>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
        What should another technician know before diagnosing this same issue?
      </p>
      <textarea
        className="wiz-input"
        value={data.lessonLearned}
        onChange={e => set({ lessonLearned: e.target.value })}
        rows={6}
        placeholder="e.g. Always check the ground strap before replacing the alternator on this model…"
      />
    </div>
  );
}

// ─── Shared atoms ──────────────────────────────────────────────────────────────

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>{label}</label>
      {children}
    </div>
  );
}

function TagList({ items, onRemove }: { items: string[]; onRemove: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 13 }}>
          {item}
          <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: 0, fontSize: 14 }}>×</button>
        </span>
      ))}
    </div>
  );
}

const PAGE_TITLES = [
  'Vehicle Information',
  'Complaint & Diagnosis',
  'Diagnostic Tests',
  'Repair',
  'Outcome',
  'Lesson Learned',
];

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function RepairCaseWizard({ ro, onClose, onCreated }: Props) {
  const [page, setPage] = useState(1);
  const [{ data, autoFilled }] = useState(() => initWizardData(ro));
  const [wizData, setWizData] = useState<WizardData>(data);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(patch: Partial<WizardData>) {
    setWizData(prev => ({ ...prev, ...patch }));
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const roAny = ro as unknown as Record<string, unknown>;
      const rc = await createRepairCaseFromJob({
        repairOrderId: ro.id,
        roNumber: ro.roNumber || (roAny.ro_number as string | undefined),
        make: wizData.make || undefined,
        model: wizData.model || undefined,
        year: wizData.year || undefined,
        vin: wizData.vin || undefined,
        engine: wizData.engine || undefined,
        transmission: wizData.transmission || undefined,
        mileage: wizData.mileage ? Number(wizData.mileage) : undefined,
        complaint: wizData.complaint || undefined,
        technicianNotes: wizData.cause || undefined,
        finalFix: wizData.finalFix || undefined,
        lessonLearned: wizData.lessonLearned || undefined,
        laborHours: wizData.laborHours ? Number(wizData.laborHours) : undefined,
        confidenceScore: wizData.confidence,
        verificationStatus: 'pending',
        isAnonymized: true,
        shareToNetwork: false,
      });

      const saves: Promise<unknown>[] = [];

      if (wizData.primaryDtc) {
        saves.push(addDtcToRepairCase(rc.id, { code: wizData.primaryDtc }));
      }
      wizData.additionalDtcs.forEach(code => {
        saves.push(addDtcToRepairCase(rc.id, { code }));
      });
      wizData.symptoms.forEach(symptom => {
        saves.push(addSymptomToRepairCase(rc.id, symptom));
      });
      wizData.tests.forEach(testName => {
        saves.push(addTestToRepairCase(rc.id, { testName }));
      });
      wizData.partsReplaced.forEach(partName => {
        saves.push(addPartToRepairCase(rc.id, { partName, replaced: true }));
      });
      saves.push(addOutcomeToRepairCase(rc.id, {
        outcome: wizData.repairSuccessful ? 'Repair successful' : 'Repair unsuccessful',
        comeback: wizData.comeback,
        warrantyClaim: wizData.warranty,
        verifiedFix: wizData.repairSuccessful,
      }));

      await Promise.all(saves);
      onCreated(rc);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to create repair case.');
    } finally {
      setSaving(false);
    }
  }

  const roLabel = ro.roNumber || (ro as unknown as Record<string, unknown>).ro_number as string || ro.id?.slice(0, 8);
  const autoCount = autoFilled.size;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 12, width: 580, maxWidth: '95vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>RO #{roLabel}</div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Create Repair Intelligence Case</h2>
              {autoCount > 0 && (
                <div style={{ fontSize: 12, color: '#4caf50', marginTop: 4 }}>
                  {autoCount} field{autoCount !== 1 ? 's' : ''} auto-filled from Repair Order
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          {/* Progress */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>Page {page} of 6 — {PAGE_TITLES[page - 1]}</span>
            </div>
            <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2 }}>
              <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${(page / 6) * 100}%`, transition: 'width 0.2s' }} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {page === 1 && <PageVehicle data={wizData} set={set} auto={autoFilled} />}
          {page === 2 && <PageComplaint data={wizData} set={set} auto={autoFilled} />}
          {page === 3 && <PageTests data={wizData} set={set} />}
          {page === 4 && <PageRepair data={wizData} set={set} auto={autoFilled} />}
          {page === 5 && <PageOutcome data={wizData} set={set} />}
          {page === 6 && <PageLesson data={wizData} set={set} />}

          {error && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fee', border: '1px solid #f99', borderRadius: 6, color: '#c00', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>
            Skip
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {page > 1 && (
              <button onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                Previous
              </button>
            )}
            {page < 6 ? (
              <button onClick={() => setPage(p => p + 1)} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: 13 }}>
                Next
              </button>
            ) : (
              <button onClick={handleCreate} disabled={saving} style={{ background: saving ? 'var(--text-muted)' : 'var(--accent)', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: saving ? 'not-allowed' : 'pointer', color: '#fff', fontWeight: 600, fontSize: 13 }}>
                {saving ? 'Creating…' : 'Create Repair Case'}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .wiz-input {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
          box-sizing: border-box;
        }
        .wiz-input:focus { outline: 2px solid var(--accent); outline-offset: 0; }
        textarea.wiz-input { resize: vertical; font-family: inherit; }
        select.wiz-input { appearance: auto; }
        .wiz-btn-sm {
          white-space: nowrap;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg-tertiary);
          cursor: pointer;
          font-size: 13px;
          color: var(--text-primary);
        }
        .wiz-btn-sm:hover { background: var(--bg-hover); }
      `}</style>
    </>
  );
}
