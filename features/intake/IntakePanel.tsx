'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAppDispatch } from '@/lib/store';
import { useShop } from '@/lib/useShop';
import type { Customer } from '@/lib/types';
import { fetchVehicles, saveVehicle, type VehicleRecord } from '@/services/vehicleService';
import { fetchTechnicians, uniqueTechsByPerson, type Technician } from '@/services/technicianService';
import { fetchShopSettings, SHOP_PRICING_DEFAULTS } from '@/services/shopSettingsService';
import type { AppointmentRecord } from '@/services/appointmentService';
import type { RepairOrder } from '@/services/repairOrderService';
import { startServiceVisit, createPartsInquiry } from '@/services/intakeService';
import {
  INTAKE_CHOICES, normalizeVehicleLabel, toDateTimeLocal,
  validatePartsInquiry, validateServiceIntake,
  type FieldErrors, type IntakeIntent,
} from '@/lib/intake/intentIntake';
import { requestOpenRepairOrder } from '@/lib/intake/openRecord';

/**
 * "What does this customer need?" — the intent-based intake.
 *
 * Opened after a new customer or vehicle is saved, from an existing
 * customer's record, and when an appointment is checked in. Each choice
 * leads to the existing workflow for it; only "Vehicle here for service"
 * opens a repair order, and only when staff press the button that says so.
 *
 * Behind the `intent_intake` feature flag; callers check it before mounting.
 */

export type IntakeContext = 'customer' | 'vehicle' | 'existing' | 'checkin';

export interface IntakePanelProps {
  /** The customer the intake is for. Null when it must be chosen (check-in with an ambiguous name). */
  customer: Customer | null;
  /** Offered when `customer` is null. */
  customerOptions?: Customer[];
  /** Preselected vehicle — the one just saved, or matched from an appointment. */
  vehicle?: VehicleRecord | null;
  /** Vehicle label to preselect when only a label is known (appointments). */
  vehicleLabel?: string;
  appointment?: AppointmentRecord | null;
  /** Skip the choice screen and open this form directly. */
  initialIntent?: IntakeIntent;
  context: IntakeContext;
  onClose: () => void;
}

type Step = 'choose' | 'service' | 'parts' | 'active' | 'created' | 'parts_done';

const LOCATION_SUGGESTIONS = ['In shop', 'Bay 1', 'Bay 2', 'Customer parking', 'Mobile / on-site'];

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
};
const panel: React.CSSProperties = {
  background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 14,
  width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: '22px 20px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
};
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 6, marginBottom: 14 };
const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '10px 12px', fontSize: 16, borderRadius: 8,
  border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontFamily: 'inherit',
};
const errStyle: React.CSSProperties = { color: '#dc2626', fontSize: 13, margin: 0 };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700 };

function newJobCardId(): string {
  return `JC-${Date.now()}`;
}

function newRequestUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for very old browsers: RFC-4122 v4 shape from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function IntakePanel(props: IntakePanelProps) {
  const { context, onClose, appointment } = props;
  const dispatch = useAppDispatch();
  const { currentShop } = useShop();
  const titleId = useId();

  const [step, setStep] = useState<Step>(props.initialIntent === 'service_now' ? 'service'
    : props.initialIntent === 'parts' ? 'parts' : 'choose');
  const [customer, setCustomer] = useState<Customer | null>(props.customer);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>(props.vehicle ? [props.vehicle] : []);
  // Which customer's vehicles are loaded; "loading" is derived from it rather
  // than set inside the effect.
  const [vehiclesLoadedFor, setVehiclesLoadedFor] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [currency, setCurrency] = useState<string>(SHOP_PRICING_DEFAULTS.currency);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  // Settled once per form, so a retry or double tap reuses the same id and
  // cannot create a second job card or quotation (services/intakeService.ts).
  const jobCardId = useRef(newJobCardId());
  const partsRequestId = useRef(newRequestUuid());

  // ── Service-visit form ────────────────────────────────────────────────────
  const [vehicleId, setVehicleId] = useState(props.vehicle?.id ?? '');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicleLabel, setNewVehicleLabel] = useState('');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [concern, setConcern] = useState(appointment?.data[3] ?? '');
  const [location, setLocation] = useState('In shop');
  const [arrivedAt, setArrivedAt] = useState(toDateTimeLocal(new Date()));
  const [technician, setTechnician] = useState(appointment?.data[7]?.split(',')[0]?.trim() ?? '');
  const [activeOrders, setActiveOrders] = useState<RepairOrder[]>([]);
  const [created, setCreated] = useState<{ jobCardId: string; roNumber: string | null; needsTechnician: boolean } | null>(null);

  // ── Parts-inquiry form ────────────────────────────────────────────────────
  const [partRequested, setPartRequested] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [fitment, setFitment] = useState('');
  const [partsVehicleId, setPartsVehicleId] = useState(props.vehicle?.id ?? '');
  const [contactPhone, setContactPhone] = useState(props.customer?.phone ?? '');
  const [contactEmail, setContactEmail] = useState(props.customer?.email ?? '');
  const [referral, setReferral] = useState(false);
  const [referredBy, setReferredBy] = useState('');
  const [partsDone, setPartsDone] = useState<{ id: string } | null>(null);

  // Load the customer's vehicles, technicians and currency. Failures leave
  // the lists empty; the forms still work (a vehicle can be added inline).
  useEffect(() => {
    fetchTechnicians(true).then(setTechnicians).catch(() => {});
    fetchShopSettings().then(s => setCurrency(s.defaultCurrency || SHOP_PRICING_DEFAULTS.currency)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customer) return;
    fetchVehicles()
      .then(all => {
        const mine = all.filter(v => v.customerId === customer.id);
        setVehicles(mine);
        // An appointment names its vehicle by label; preselect it when it matches exactly one.
        if (!props.vehicle && props.vehicleLabel) {
          const want = normalizeVehicleLabel(props.vehicleLabel);
          const hits = mine.filter(v => normalizeVehicleLabel(v.label) === want);
          if (hits.length === 1) { setVehicleId(hits[0].id); setPartsVehicleId(hits[0].id); }
        } else if (!props.vehicle && mine.length === 1) {
          setVehicleId(mine[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setVehiclesLoadedFor(customer.id));
  }, [customer, props.vehicle, props.vehicleLabel]);

  const vehiclesLoading = !!customer && vehiclesLoadedFor !== customer.id;

  // Escape closes, unless something is being saved.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === vehicleId) ?? null, [vehicles, vehicleId]);
  const partsVehicle = useMemo(() => vehicles.find(v => v.id === partsVehicleId) ?? null, [vehicles, partsVehicleId]);
  const techNames = useMemo(() => uniqueTechsByPerson(technicians).map(t => t.name), [technicians]);

  function pick(intent: IntakeIntent) {
    setErrors({}); setFormError('');
    if (intent === 'service_now') { setStep('service'); return; }
    if (intent === 'parts') { setStep('parts'); return; }
    if (intent === 'service_later') {
      // The existing appointment form, prefilled. No repair order: the car is not here yet.
      dispatch({ type: 'SET_PREFILL', prefill: { customerName: customer?.name, customerId: customer?.id, vehicle: selectedVehicle?.label ?? props.vehicle?.label } });
      dispatch({ type: 'SET_MODULE', module: 'appointments' });
      onClose();
      return;
    }
    // record_only: the customer (or vehicle) is already saved; create nothing.
    dispatch({
      type: 'NOTIFY',
      message: context === 'vehicle'
        ? 'Vehicle saved. Start service or a parts request from it any time.'
        : `${customer?.name ?? 'Customer'} saved. Start service or a parts request from their record any time.`,
    });
    onClose();
  }

  async function addVehicleInline(): Promise<VehicleRecord | null> {
    if (!customer) return null;
    const label = newVehicleLabel.trim();
    if (!label) { setErrors(e => ({ ...e, vehicle: 'Enter the vehicle (year, make, model).' })); return null; }
    const saved = await saveVehicle({
      customerId: customer.id, vin: '', label, trim: '', engine: '', transmission: '',
      mileage: '', plate: newVehiclePlate.trim(), status: '', recommendation: '',
    });
    setVehicles(v => [saved, ...v]);
    setVehicleId(saved.id);
    setPartsVehicleId(saved.id);
    setAddingVehicle(false);
    setNewVehicleLabel(''); setNewVehiclePlate('');
    return saved;
  }

  async function submitService(allowSeparateVisit = false) {
    if (busy) return;
    setFormError(''); setWarnings([]);
    // Validate everything first — with a vehicle being added inline standing
    // in by its typed label — so a form with other mistakes does not leave a
    // half-made vehicle behind.
    const problems = validateServiceIntake({
      customerId: customer?.id ?? '',
      vehicleId: addingVehicle ? (newVehicleLabel.trim() ? 'new' : '') : (selectedVehicle?.id ?? ''),
      vehicleLabel: addingVehicle ? newVehicleLabel : (selectedVehicle?.label ?? ''),
      concern, location, arrivedAt, technician,
    });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setBusy(true);
    try {
      let vehicle = selectedVehicle;
      if (addingVehicle) {
        try {
          vehicle = await addVehicleInline();
        } catch (e) {
          setFormError(`Could not add the vehicle: ${e instanceof Error ? e.message : 'unknown error'}. Nothing else was created.`);
          return;
        }
        if (!vehicle) return;
      }

      const result = await startServiceVisit({
        requestId: jobCardId.current,
        customerId: customer!.id,
        customerName: customer!.name,
        vehicleId: vehicle!.id,
        vehicleLabel: vehicle!.label,
        concern, location,
        arrivedAt: new Date(arrivedAt).toISOString(),
        technician,
        appointment: appointment ?? null,
        allowSeparateVisit,
      });

      if (result.kind === 'active_order_exists') {
        setActiveOrders(result.orders);
        setStep('active');
        return;
      }
      setCreated({ jobCardId: result.jobCardId, roNumber: result.roNumber, needsTechnician: result.needsTechnician });
      setWarnings(result.warnings);
      setStep('created');
    } catch (e) {
      // Nothing was created (the job card is the first write), so the form
      // stays as filled and the same request id is reused on retry.
      setFormError(
        `Could not open the visit: ${e instanceof Error ? e.message : 'unknown error'}. ` +
        'The customer and vehicle are saved — try again, or create a job card from Job Cards.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitParts() {
    if (busy) return;
    setFormError('');
    const fields = {
      customerId: customer?.id ?? '',
      customerName: customer?.name ?? '',
      vehicleLabel: partsVehicle?.label ?? '',
      partRequested, partNumber, quantity, fitment,
      contactPhone, contactEmail, referral, referredBy,
    };
    const problems = validatePartsInquiry(fields);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      const { estimate } = await createPartsInquiry({ ...fields, requestId: partsRequestId.current, currency });
      setPartsDone({ id: estimate.id });
      setStep('parts_done');
    } catch (e) {
      setFormError(
        `Could not save the parts request: ${e instanceof Error ? e.message : 'unknown error'}. ` +
        'The customer is saved — try again, or add it from Parts Quotations.',
      );
    } finally {
      setBusy(false);
    }
  }

  function openRepairOrder(roNumber: string) {
    requestOpenRepairOrder(roNumber);
    dispatch({ type: 'SET_MODULE', module: 'repair-orders' });
    onClose();
  }

  function goTo(module: string) {
    dispatch({ type: 'SET_MODULE', module });
    onClose();
  }

  const heading =
    step === 'choose' ? (context === 'vehicle' ? 'Vehicle saved — what happens next?' : 'What does this customer need?')
    : step === 'service' ? 'Vehicle here for service'
    : step === 'parts' ? 'Parts inquiry or order'
    : step === 'active' ? 'This vehicle already has an open repair order'
    : step === 'created' ? 'Visit opened'
    : 'Parts request saved';

  return (
    <div style={overlay} onClick={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{heading}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {customer && (
          <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>
            {customer.name}{props.vehicle ? ` · ${props.vehicle.label}` : ''}
          </p>
        )}

        {step === 'choose' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {INTAKE_CHOICES.map(c => (
              <button key={c.intent} type="button" onClick={() => pick(c.intent)} data-intent={c.intent}
                style={{ textAlign: 'left', padding: '14px 16px', minHeight: 56, borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: c.intent === 'service_now' ? 'var(--accent, #cc0000)' : 'var(--surface-soft)', color: c.intent === 'service_now' ? '#fff' : 'var(--text)' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {c.intent === 'record_only' && context === 'vehicle' ? 'Nothing now' : c.label}
                </div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                  {c.intent === 'record_only' && context === 'vehicle' ? 'Just keep the vehicle on file.' : c.hint}
                </div>
              </button>
            ))}
          </div>
        )}

        {(step === 'service' || step === 'parts') && !props.customer && (
          <div style={fieldStyle}>
            <label htmlFor="intake-customer" style={labelStyle}>Customer</label>
            <select id="intake-customer" style={inputStyle} value={customer?.id ?? ''}
              onChange={e => setCustomer((props.customerOptions ?? []).find(c => c.id === e.target.value) ?? null)}
              aria-invalid={errors.customer ? true : undefined}>
              <option value="">Choose the customer…</option>
              {(props.customerOptions ?? []).map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
            {errors.customer && <p style={errStyle}>{errors.customer}</p>}
          </div>
        )}

        {step === 'service' && (
          <form onSubmit={e => { e.preventDefault(); void submitService(); }} noValidate>
            <div style={fieldStyle}>
              <label htmlFor="intake-vehicle" style={labelStyle}>Vehicle</label>
              {!addingVehicle ? (
                <>
                  <select id="intake-vehicle" style={inputStyle} value={vehicleId} onChange={e => setVehicleId(e.target.value)}
                    disabled={vehiclesLoading} aria-invalid={errors.vehicle ? true : undefined}>
                    <option value="">{vehiclesLoading ? 'Loading vehicles…' : 'Choose the vehicle…'}</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}{v.plate ? ` · ${v.plate}` : ''}</option>)}
                  </select>
                  <button type="button" onClick={() => setAddingVehicle(true)} disabled={!customer}
                    style={{ justifySelf: 'start', background: 'none', border: 'none', color: 'var(--accent, #cc0000)', fontWeight: 700, cursor: 'pointer', padding: '4px 0', minHeight: 32 }}>
                    + Add a vehicle
                  </button>
                </>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <input id="intake-vehicle" style={inputStyle} value={newVehicleLabel} onChange={e => setNewVehicleLabel(e.target.value)}
                    placeholder="Year, make, model — e.g. 2019 Ford F-150" aria-invalid={errors.vehicle ? true : undefined} />
                  <input aria-label="Plate (optional)" style={inputStyle} value={newVehiclePlate} onChange={e => setNewVehiclePlate(e.target.value)} placeholder="Plate (optional)" />
                  <button type="button" onClick={() => setAddingVehicle(false)}
                    style={{ justifySelf: 'start', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px 0', minHeight: 32 }}>
                    Choose an existing vehicle instead
                  </button>
                </div>
              )}
              {errors.vehicle && <p style={errStyle}>{errors.vehicle}</p>}
            </div>

            <div style={fieldStyle}>
              <label htmlFor="intake-concern" style={labelStyle}>Concern</label>
              <textarea id="intake-concern" style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} value={concern}
                onChange={e => setConcern(e.target.value)} placeholder="Why is the vehicle here? e.g. A/C not cold, brake noise"
                aria-invalid={errors.concern ? true : undefined} />
              {errors.concern && <p style={errStyle}>{errors.concern}</p>}
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div style={fieldStyle}>
                <label htmlFor="intake-location" style={labelStyle}>Where is it?</label>
                <input id="intake-location" list="intake-location-options" style={inputStyle} value={location}
                  onChange={e => setLocation(e.target.value)} aria-invalid={errors.location ? true : undefined} />
                <datalist id="intake-location-options">{LOCATION_SUGGESTIONS.map(l => <option key={l} value={l} />)}</datalist>
                {errors.location && <p style={errStyle}>{errors.location}</p>}
              </div>
              <div style={fieldStyle}>
                <label htmlFor="intake-arrived" style={labelStyle}>Arrived</label>
                <input id="intake-arrived" type="datetime-local" style={inputStyle} value={arrivedAt}
                  onChange={e => setArrivedAt(e.target.value)} aria-invalid={errors.arrivedAt ? true : undefined} />
                {errors.arrivedAt && <p style={errStyle}>{errors.arrivedAt}</p>}
              </div>
            </div>

            <div style={fieldStyle}>
              <label htmlFor="intake-tech" style={labelStyle}>Technician (optional)</label>
              <select id="intake-tech" style={inputStyle} value={technician} onChange={e => setTechnician(e.target.value)}>
                <option value="">Assign later</option>
                {techNames.map(n => <option key={n} value={n}>{n}</option>)}
                {technician && !techNames.includes(technician) && <option value={technician}>{technician}</option>}
              </select>
            </div>

            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
              Opens at <strong>{currentShop?.name ?? 'the current shop'}</strong>. To open it at another location, switch shop in the sidebar first.
            </p>

            {formError && <p role="alert" style={{ ...errStyle, marginBottom: 12 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={busy} style={{ minHeight: 48, flex: '1 1 220px' }}>
                {busy ? 'Opening…' : 'Check in & open repair order'}
              </button>
              {props.initialIntent !== 'service_now' && (
                <button type="button" className="btn" disabled={busy} onClick={() => setStep('choose')} style={{ minHeight: 48 }}>Back</button>
              )}
            </div>
          </form>
        )}

        {step === 'active' && (
          <div>
            <p style={{ marginTop: 0, fontSize: 14 }}>
              {selectedVehicle?.label ?? 'This vehicle'} already has {activeOrders.length === 1 ? 'an active repair order' : `${activeOrders.length} active repair orders`}. Open it, or start a separate visit on purpose.
            </p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {activeOrders.map(o => (
                <button key={o.id} type="button" className="btn" onClick={() => openRepairOrder(o.roNumber)}
                  style={{ minHeight: 48, textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span><strong>{o.roNumber}</strong> · {o.status}{o.concern ? ` · ${o.concern.slice(0, 40)}` : ''}</span>
                  <span aria-hidden="true">Open →</span>
                </button>
              ))}
            </div>
            {formError && <p role="alert" style={{ ...errStyle, marginBottom: 12 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submitService(true)} style={{ minHeight: 48 }}>
                {busy ? 'Opening…' : 'Start a separate visit'}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setStep('service')} style={{ minHeight: 48 }}>Back</button>
            </div>
          </div>
        )}

        {step === 'created' && created && (
          <div role="status">
            <p style={{ marginTop: 0, fontSize: 15 }}>
              {created.roNumber
                ? <>Repair order <strong>{created.roNumber}</strong> is open, with job card <strong>{created.jobCardId}</strong>.</>
                : <>Job card <strong>{created.jobCardId}</strong> is saved, but the repair order was not created.</>}
            </p>
            {created.needsTechnician && created.roNumber && (
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>No technician yet — use <strong>Assign technician</strong> on the repair order.</p>
            )}
            {warnings.length > 0 && (
              <ul style={{ color: '#b45309', fontSize: 13, paddingLeft: 18 }}>
                {warnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              {created.roNumber && (
                <button type="button" className="btn btn-primary" onClick={() => openRepairOrder(created.roNumber!)} style={{ minHeight: 48, flex: '1 1 200px' }}>
                  {created.needsTechnician ? `Open ${created.roNumber} & assign technician` : `Open ${created.roNumber}`}
                </button>
              )}
              <button type="button" className="btn" onClick={() => goTo('job-cards')} style={{ minHeight: 48 }}>Open job cards</button>
              <button type="button" className="btn" onClick={onClose} style={{ minHeight: 48 }}>Done</button>
            </div>
          </div>
        )}

        {step === 'parts' && (
          <form onSubmit={e => { e.preventDefault(); void submitParts(); }} noValidate>
            <div style={fieldStyle}>
              <label htmlFor="intake-part" style={labelStyle}>Part requested</label>
              <input id="intake-part" style={inputStyle} value={partRequested} onChange={e => setPartRequested(e.target.value)}
                placeholder="e.g. Front brake pads" aria-invalid={errors.partRequested ? true : undefined} />
              {errors.partRequested && <p style={errStyle}>{errors.partRequested}</p>}
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div style={fieldStyle}>
                <label htmlFor="intake-partno" style={labelStyle}>Part number (optional)</label>
                <input id="intake-partno" style={inputStyle} value={partNumber} onChange={e => setPartNumber(e.target.value)} />
              </div>
              <div style={fieldStyle}>
                <label htmlFor="intake-qty" style={labelStyle}>Quantity</label>
                <input id="intake-qty" type="number" min={1} inputMode="numeric" style={inputStyle} value={quantity}
                  onChange={e => setQuantity(e.target.value)} aria-invalid={errors.quantity ? true : undefined} />
                {errors.quantity && <p style={errStyle}>{errors.quantity}</p>}
              </div>
            </div>
            <div style={fieldStyle}>
              <label htmlFor="intake-parts-vehicle" style={labelStyle}>Vehicle (optional — it does not need to be here)</label>
              <select id="intake-parts-vehicle" style={inputStyle} value={partsVehicleId} onChange={e => setPartsVehicleId(e.target.value)}>
                <option value="">No vehicle / not given</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}{v.plate ? ` · ${v.plate}` : ''}</option>)}
              </select>
            </div>
            <div style={fieldStyle}>
              <label htmlFor="intake-fitment" style={labelStyle}>Fitment details (optional)</label>
              <input id="intake-fitment" style={inputStyle} value={fitment} onChange={e => setFitment(e.target.value)}
                placeholder="Engine, trim, VIN, left/right…" />
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div style={fieldStyle}>
                <label htmlFor="intake-phone" style={labelStyle}>Contact phone</label>
                <input id="intake-phone" type="tel" style={inputStyle} value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
              <div style={fieldStyle}>
                <label htmlFor="intake-email" style={labelStyle}>Contact email</label>
                <input id="intake-email" type="email" style={inputStyle} value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
            </div>
            {errors.contact && <p style={{ ...errStyle, marginTop: -6, marginBottom: 12 }}>{errors.contact}</p>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <input id="intake-referral" type="checkbox" checked={referral} onChange={e => setReferral(e.target.checked)} style={{ width: 20, height: 20 }} />
              <label htmlFor="intake-referral" style={{ fontSize: 14 }}>This came through a referral</label>
            </div>
            {referral && (
              <div style={fieldStyle}>
                <label htmlFor="intake-referredby" style={labelStyle}>Referred by</label>
                <input id="intake-referredby" style={inputStyle} value={referredBy} onChange={e => setReferredBy(e.target.value)}
                  aria-invalid={errors.referredBy ? true : undefined} />
                {errors.referredBy && <p style={errStyle}>{errors.referredBy}</p>}
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
              Saved as a draft parts quotation. No repair order is opened and the vehicle is not marked as at the shop.
            </p>
            {formError && <p role="alert" style={{ ...errStyle, marginBottom: 12 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={busy} style={{ minHeight: 48, flex: '1 1 220px' }}>
                {busy ? 'Saving…' : 'Save parts request'}
              </button>
              {props.initialIntent !== 'parts' && (
                <button type="button" className="btn" disabled={busy} onClick={() => setStep('choose')} style={{ minHeight: 48 }}>Back</button>
              )}
            </div>
          </form>
        )}

        {step === 'parts_done' && partsDone && (
          <div role="status">
            <p style={{ marginTop: 0, fontSize: 15 }}>The request is saved as a draft parts quotation. Price it, then convert it to a parts order when the customer goes ahead.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => goTo('parts-estimates')} style={{ minHeight: 48, flex: '1 1 200px' }}>Open Parts Quotations</button>
              <button type="button" className="btn" onClick={onClose} style={{ minHeight: 48 }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
