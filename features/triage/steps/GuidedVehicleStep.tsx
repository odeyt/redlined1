'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { TriageVehicle } from '@/lib/triage/QuestionTypes';
import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import { isCameraAvailable, scanVinFromFile, startVinVideoScan } from '@/lib/vin/scanVin';

/**
 * Guided vehicle intake — one question at a time.
 *
 * The form asks for eight things at once. At a counter, with a customer
 * waiting, that reads as a wall and gets half-filled: production intake records
 * routinely carry a make and model and nothing else.
 *
 * Asking one thing at a time, with an explicit Skip, changes what an unanswered
 * field means. On the form, blank is ambiguous — not asked, or not known? Here
 * every field is put to the advisor and a skip is a decision, which is why the
 * review screen can honestly separate "missing" from "skipped".
 *
 * Built for a phone first. Advisors do this standing next to the car.
 */

const FUEL_TYPES    = ['Gasoline', 'Diesel', 'Hybrid', 'PHEV', 'Electric', 'E85', 'CNG', 'Unknown'];
const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT', 'DCT', 'Unknown'];

interface CustomerOption { id: string; name: string; phone?: string | null }
interface VehicleOption {
  id: string; label: string; make: string; model: string; year: string;
  engine: string; mileage: string; fuelType: string; transmission: string; vin: string; plate: string;
}

type Question = {
  key: keyof TriageVehicle;
  prompt: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  inputMode?: 'text' | 'numeric';
  /** The VIN question decodes rather than simply storing what is typed. */
  kind?: 'vin';
  /** iOS shows this on the return key. */
  enterKeyHint?: 'next' | 'done';
};

const QUESTIONS: Question[] = [
  { key: 'vin',          prompt: 'Do you have the VIN?',        hint: '17 characters — dashboard, door jamb, or the registration. Decoding it fills in the rest.', placeholder: 'e.g. 1HGBH41JXMN109186', kind: 'vin' },
  { key: 'make',         prompt: 'What make is the vehicle?',   hint: 'Toyota, Ford, BMW…',        placeholder: 'e.g. Toyota', required: true },
  { key: 'model',        prompt: 'And the model?',              hint: 'Hilux, Ranger, X5…',        placeholder: 'e.g. Hilux',  required: true },
  { key: 'year',         prompt: 'What year?',                  hint: 'Four digits',               placeholder: 'e.g. 2021',   required: true, inputMode: 'numeric' },
  { key: 'mileage',      prompt: 'Current mileage?',            hint: 'Odometer reading — skip if the dash is out', placeholder: 'e.g. 87500', inputMode: 'numeric' },
  { key: 'engine',       prompt: 'Which engine?',               hint: 'From the badge or under the bonnet', placeholder: 'e.g. 2.5L 4-cyl' },
  { key: 'fuelType',     prompt: 'What does it run on?',        options: FUEL_TYPES },
  { key: 'transmission', prompt: 'Transmission?',               options: TRANSMISSIONS },
];

interface Props {
  vehicle: TriageVehicle;
  onChange: (vehicle: TriageVehicle) => void;
  onNext: () => void;
  onUseForm: () => void;
}

export function GuidedVehicleStep({ vehicle, onChange, onNext, onUseForm }: Props) {
  // -1 is the customer question, which behaves differently enough to sit
  // outside the QUESTIONS list. QUESTIONS.length is the review screen.
  const [idx, setIdx] = useState(-1);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');

  // Fields the VIN answered. They are stepped over rather than asked, because
  // re-typing what the VIN already established is the friction decoding exists
  // to remove — and a typed answer that disagrees with the VIN is a worse
  // record than the VIN alone.
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState('');
  const [decodedNote, setDecodedNote] = useState('');

  /**
   * What the VIN decoded to, held for confirmation rather than applied.
   *
   * NHTSA answers a malformed VIN with real-looking data: "123456789AAAAAAA4"
   * returns Make "SHERMAN + REILLY", Year 2010, and a Honda CRX was filed under
   * that. Its error codes cannot be used to reject it — genuine VINs in this
   * fleet return errors too (Ford "1", Lexus "3,14", Toyota "1,11,14,400"), so
   * filtering on them would throw away almost every real decode.
   *
   * The operator can tell at a glance what the machine cannot, so they confirm.
   */
  const [pendingDecode, setPendingDecode] = useState<{
    vin: string; patch: Partial<TriageVehicle>; filled: Set<string>; summary: string; fields: [string, string][];
  } | null>(null);

  const [scanning, setScanning] = useState(false);
  // Scanning itself works in every browser now — ZXing covers what the native
  // API does not. Only the live camera is conditional, and on hardware rather
  // than on the browser. Resolved after mount: reading a browser capability
  // during render would differ between the server and the client.
  const [canUseCamera, setCanUseCamera] = useState<boolean | null>(null);
  useEffect(() => { setCanUseCamera(isCameraAvailable()); }, []);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopDecodeRef = useRef<(() => void) | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  // Adding a customer without leaving intake. Sending an advisor to the
  // Customers module mid-intake loses the vehicle details already entered.
  const [showNew, setShowNew] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '' });
  const [savingCust, setSavingCust] = useState(false);
  const [custError, setCustError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const q = idx >= 0 && idx < QUESTIONS.length ? QUESTIONS[idx] : null;
  const onReview = idx >= QUESTIONS.length;

  useEffect(() => {
    (async () => {
      const shopId = await getShopId();
      if (!shopId) return;
      const { data } = await supabase.from('customers').select('id, name, phone')
        .eq('shop_id', shopId).order('name').limit(500);
      setCustomers(data ?? []);
    })();
  }, []);

  // Load the answer already held for this question, so going Back shows what
  // was entered rather than an empty box.
  useEffect(() => {
    setDraft(q ? String(vehicle[q.key] ?? '') : '');
    // Autofocus is deliberate on a text question and avoided on a choice one,
    // where it would pop the keyboard over the options.
    if (q && !q.options) setTimeout(() => inputRef.current?.focus(), 60);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return customers.slice(0, 6);
    return customers.filter(c => c.name.toLowerCase().includes(t) || (c.phone ?? '').includes(t)).slice(0, 8);
  }, [query, customers]);

  async function selectCustomer(c: CustomerOption) {
    onChange({ ...vehicle, customerId: c.id, customerName: c.name });
    setQuery(c.name);
    setLoadingVehicles(true);
    const shopId = await getShopId();
    const { data } = await supabase.from('vehicles')
      .select('id, label, make, model, year, engine, mileage, fuel_type, transmission, plate, vin')
      .eq('shop_id', shopId).eq('customer_id', c.id).order('label').limit(500);
    setVehicles((data ?? []).map(v => ({
      id: v.id,
      label: [`${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim(), v.plate ? `#${v.plate}` : ''].filter(Boolean).join(' ') || 'Unnamed vehicle',
      make: v.make ?? '', model: v.model ?? '', year: String(v.year ?? ''),
      engine: v.engine ?? '', mileage: v.mileage ? String(v.mileage) : '',
      fuelType: v.fuel_type ?? '', transmission: v.transmission ?? '',
      vin: v.vin ?? '', plate: v.plate ?? '',
    })));
    setLoadingVehicles(false);
  }

  async function saveNewCustomer() {
    const name = newCust.name.trim();
    if (!name) { setCustError('A name is required.'); return; }
    setSavingCust(true);
    setCustError('');
    try {
      // saveCustomer, not a direct insert: it is the path that publishes
      // customer.created, so a customer added here is not invisible to
      // everything downstream of that event.
      const { saveCustomer } = await import('@/services/customerService');
      const created = await saveCustomer({
        name,
        type: 'Retail',
        phone: newCust.phone.trim(),
        email: newCust.email.trim(),
        address: '', tags: [], followUp: '', portalToken: null,
      });
      const option: CustomerOption = { id: created.id, name: created.name, phone: created.phone };
      setCustomers(prev => [...prev, option].sort((a, b) => a.name.localeCompare(b.name)));
      setShowNew(false);
      setNewCust({ name: '', phone: '', email: '' });
      await selectCustomer(option);
    } catch (e) {
      // Surfaced, not swallowed — a customer that silently fails to save is
      // how intake ends up linked to nothing.
      setCustError(e instanceof Error ? e.message : 'Could not save the customer.');
    } finally {
      setSavingCust(false);
    }
  }

  function selectVehicle(v: VehicleOption) {
    // Everything is known — jump straight to review rather than re-asking
    // seven questions the record already answers.
    onChange({
      ...vehicle, vehicleId: v.id, vin: v.vin, plate: v.plate,
      make: v.make, model: v.model, year: v.year, engine: v.engine,
      mileage: v.mileage, fuelType: v.fuelType, transmission: v.transmission,
    });
    setSkipped(new Set());
    setIdx(QUESTIONS.length);
  }

  /** Next question the advisor still has to answer, or the review screen. */
  function nextIndex(from: number, filled: Set<string> = autoFilled) {
    let i = from + 1;
    while (i < QUESTIONS.length && filled.has(QUESTIONS[i].key as string)) i++;
    return i;
  }

  /** Back steps over decoded fields too, so Back never lands on a dead screen. */
  function prevIndex(from: number) {
    let i = from - 1;
    while (i >= 0 && autoFilled.has(QUESTIONS[i].key as string)) i--;
    return i;
  }

  function commit(value: string) {
    if (!q) return;
    onChange({ ...vehicle, [q.key]: value });
    setSkipped(prev => { const n = new Set(prev); n.delete(q.key as string); return n; });
    setIdx(nextIndex(idx));
  }

  function skip() {
    if (!q) return;
    setSkipped(prev => new Set(prev).add(q.key as string));
    setIdx(nextIndex(idx));
  }

  function acceptDecode() {
    if (!pendingDecode) return;
    const { patch, filled, summary } = pendingDecode;
    onChange({ ...vehicle, ...patch });
    setAutoFilled(filled);
    setSkipped(prev => {
      const n = new Set(prev);
      filled.forEach(k => n.delete(k));
      return n;
    });
    setDecodedNote(summary);
    setPendingDecode(null);
    setIdx(nextIndex(0, filled));
  }

  function rejectDecode() {
    if (!pendingDecode) return;
    // Keep the VIN — it is what the operator typed or scanned, and is correct
    // even when the lookup against it is not. Everything else gets asked.
    onChange({ ...vehicle, vin: pendingDecode.vin });
    setAutoFilled(new Set(['vin']));
    setPendingDecode(null);
    setIdx(nextIndex(0, new Set(['vin'])));
  }

  function stopScan() {
    // Stop the decoder before the tracks: a ZXing loop reading from a video
    // whose stream just ended throws on the next frame.
    stopDecodeRef.current?.();
    stopDecodeRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  // The camera must be released if the advisor navigates away mid-scan;
  // leaving it live drains the battery and holds the torch on some phones.
  useEffect(() => () => stopScan(), []);

  async function startScan() {
    setDecodeError('');
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const video = await waitForVideo();
      if (!video) { stopScan(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      // Native where available, ZXing everywhere else. The component does not
      // need to know which answered.
      stopDecodeRef.current = await startVinVideoScan(video, vin => {
        stopScan();
        setDraft(vin);
        onChange({ ...vehicle, vin });
        void decodeVin(vin);
      });
    } catch {
      // Denied permission, or no camera. Falling back to the photo picker keeps
      // a path open instead of dead-ending on a blank viewfinder.
      setScanning(false);
      setDecodeError('Could not open the camera. Upload a photo of the barcode instead, or type the VIN.');
    }
  }

  /** The overlay mounts in the same commit that starts the scan, so the ref
   *  is not populated yet on the first tick. */
  function waitForVideo(): Promise<HTMLVideoElement | null> {
    return new Promise(resolve => {
      let tries = 0;
      const check = () => {
        if (videoRef.current) return resolve(videoRef.current);
        if (++tries > 30) return resolve(null);
        setTimeout(check, 20);
      };
      check();
    });
  }

  async function handleVinPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so re-picking the same photo fires change again
    if (!file) return;
    setDecodeError('');
    try {
      const vin = await scanVinFromFile(file);
      if (!vin) {
        setDecodeError('No VIN barcode found in that photo. Get closer to the barcode on the door jamb sticker, or type it.');
        return;
      }
      setDraft(vin);
      onChange({ ...vehicle, vin });
      await decodeVin(vin);
    } catch {
      setDecodeError('Could not read that photo.');
    }
  }

  async function decodeVin(override?: string) {
    // A scan passes the VIN directly: setDraft is async, so reading draft here
    // would decode the previous value.
    const raw = (override ?? draft).trim().toUpperCase();
    setDecodeError('');
    if (raw.length !== 17) { setDecodeError('A VIN is exactly 17 characters. Skip if you do not have it.'); return; }
    setDecoding(true);
    try {
      const { decodeVinAPI } = await import('@/services/vinDecoderService');
      const d = await decodeVinAPI(raw);

      // NHTSA answers for most of the world's vehicles but not all of them —
      // plenty of models sold in Laos return a make and nothing else. Only the
      // fields that actually came back are treated as answered; the rest are
      // still asked, rather than left silently blank.
      const engine = [d.engineDisplacement && `${d.engineDisplacement}L`, d.engineCylinders && `${d.engineCylinders}-cyl`]
        .filter(Boolean).join(' ');
      const patch: Partial<TriageVehicle> = { vin: raw };
      const filled = new Set<string>(['vin']);
      const take = (key: keyof TriageVehicle, value: string) => {
        if (!value) return;
        (patch as Record<string, string>)[key as string] = value;
        filled.add(key as string);
      };
      take('make', d.make);
      take('model', d.model);
      take('year', d.year);
      take('engine', engine);
      take('fuelType', d.fuelType);
      take('transmission', d.transmission);

      if (filled.size === 1) {
        // Valid format, nothing known. Saying so beats "decoded" over a blank.
        setDecodeError('That VIN did not return any vehicle details. It is saved — carry on and enter the rest.');
        onChange({ ...vehicle, vin: raw });
        setAutoFilled(new Set(['vin']));
        setDecoding(false);
        return;
      }

      // Held, not applied. See pendingDecode above for why nothing about the
      // response can be trusted to decide this automatically.
      const labels: Record<string, string> = {
        make: 'Make', model: 'Model', year: 'Year',
        engine: 'Engine', fuelType: 'Fuel', transmission: 'Transmission',
      };
      setPendingDecode({
        vin: raw,
        patch,
        filled,
        summary: [d.year, d.make, d.model].filter(Boolean).join(' ') || 'Vehicle details found',
        fields: Object.keys(labels)
          .filter(k => filled.has(k))
          .map(k => [labels[k], String((patch as Record<string, unknown>)[k] ?? '')] as [string, string]),
      });
    } catch (e) {
      setDecodeError(e instanceof Error ? e.message : 'Could not decode that VIN.');
    } finally {
      setDecoding(false);
    }
  }

  const answered = QUESTIONS.filter(x => String(vehicle[x.key] ?? '').trim()).length;
  const missingRequired = QUESTIONS.filter(x => x.required && !String(vehicle[x.key] ?? '').trim());
  // Decoded questions are never shown, so counting them would make the
  // progress bar promise steps that never arrive.
  const total = QUESTIONS.length + 1 - autoFilled.size;
  const position = idx + 1 - QUESTIONS.slice(0, Math.max(idx, 0)).filter(x => autoFilled.has(x.key as string)).length;
  const pct = Math.round((Math.min(position, total) / total) * 100);

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--gi-card-edge)', borderRadius: 18,
    padding: 'clamp(18px, 5vw, 30px)', boxShadow: 'var(--shadow)',
    maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box',
  };
  // 16px minimum: anything smaller makes iOS Safari zoom the page on focus.
  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '14px 16px',
    borderRadius: 12, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)',
    color: 'var(--text)', minHeight: 52, outline: 'none',
  };
  const primary: React.CSSProperties = {
    minHeight: 52, padding: '14px 26px', borderRadius: 12, border: 'none',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
    color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', flex: '1 1 160px',
  };
  const ghost: React.CSSProperties = {
    minHeight: 52, padding: '14px 22px', borderRadius: 12,
    border: '1px solid var(--btn-border)', background: 'var(--btn-bg)',
    color: 'var(--muted)', fontWeight: 700, fontSize: 15, cursor: 'pointer', flex: '0 1 auto',
  };

  return (
    <div className="gi-scope" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
      <style>{`
        /* The global tokens sit too close together for a form: in light mode
           the card (#fff), the fields (#f7f7f7) and the page (#f0f0f0) are
           within a few values of each other, and in dark mode --line (#1e1e2a)
           is all but invisible against the card. These are the same palette,
           pushed apart far enough that a field reads as a field. Default is
           dark, matching :root. */
        .gi-scope {
          --gi-field: #191922;
          --gi-edge: #66668c;
          --gi-card-edge: #3a3a52;
          --gi-focus: rgba(224, 48, 48, 0.35);
        }
        [data-theme="light"] .gi-scope {
          --gi-field: #f1f2f6;
          --gi-edge: #8b92a6;
          --gi-card-edge: #c3c7d3;
          --gi-focus: rgba(204, 0, 0, 0.22);
        }
        .gi-fade { animation: gi-in .28s cubic-bezier(.2,.7,.3,1) both; }
        @keyframes gi-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .gi-fade { animation: none; } }
        .gi-chip { transition: border-color .15s, background .15s, box-shadow .15s; }
        .gi-chip:hover { border-color: var(--accent); }
        /* Focus has to be visible on its own, not only as a colour change —
           a keyboard user and a colour-blind user need the same cue. */
        .gi-scope input:focus-visible,
        .gi-scope button:focus-visible {
          outline: none;
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px var(--gi-focus);
        }
        .gi-row { display: flex; gap: 10px; flex-wrap: wrap; }
        @media (max-width: 420px) { .gi-row > button { flex: 1 1 100%; } }
      `}</style>

      {/* Progress */}
      <div style={{ maxWidth: 640, margin: '0 auto 14px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 7 }}>
          <span>{onReview ? 'Review' : `Question ${Math.min(position + 1, total)} of ${total}`}</span>
          <button onClick={onUseForm} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em', padding: 0 }}>
            Use full form
          </button>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: 'var(--gi-field)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))', transition: 'width .3s ease' }} />
        </div>
      </div>

      <div style={card} className="gi-fade" key={idx}>
        {/* ── Customer ── */}
        {idx === -1 && (
          <>
            <h2 style={{ fontSize: 'clamp(19px, 4.5vw, 24px)', fontWeight: 800, margin: '0 0 6px', color: 'var(--text)' }}>
              Who is this for?
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 18px' }}>
              Search an existing customer to load their vehicle, or skip for a walk-in.
            </p>
            <input
              ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or phone…" style={input}
              autoComplete="off" enterKeyHint="search"
            />
            {matches.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {matches.map(c => (
                  <button key={c.id} className="gi-chip" onClick={() => selectCustomer(c)}
                    style={{ textAlign: 'left', minHeight: 52, padding: '12px 16px', borderRadius: 12, border: `1px solid ${vehicle.customerId === c.id ? 'var(--accent)' : 'var(--gi-edge)'}`, background: 'var(--gi-field)', color: 'var(--text)', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                    {c.name}
                    {c.phone && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* No match, or none exact — offer to create rather than dead-ending.
                A search that returns nothing and gives no next step is what
                sends advisors to another module and loses this intake. */}
            {!showNew && !vehicle.customerId && (
              <button
                onClick={() => { setShowNew(true); setNewCust({ name: query.trim(), phone: '', email: '' }); setCustError(''); }}
                className="gi-chip"
                style={{ marginTop: 12, width: '100%', minHeight: 52, padding: '13px 16px', borderRadius: 12, border: '1px dashed var(--btn-border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 15, fontWeight: 700, textAlign: 'left' }}>
                + Add {query.trim() ? `“${query.trim()}”` : 'a new customer'}
              </button>
            )}

            {showNew && (
              <div style={{ marginTop: 14, padding: 16, borderRadius: 14, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)', display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                  New customer
                </div>
                <input
                  value={newCust.name} onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))}
                  placeholder="Full name *" style={input} autoCapitalize="words" enterKeyHint="next" autoFocus
                />
                <input
                  value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))}
                  placeholder="Phone (optional)" style={input} inputMode="tel" autoComplete="tel" enterKeyHint="next"
                />
                <input
                  value={newCust.email} onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && newCust.name.trim() && !savingCust) void saveNewCustomer(); }}
                  placeholder="Email (optional)" style={input} inputMode="email" autoComplete="email"
                  autoCapitalize="off" autoCorrect="off" enterKeyHint="done"
                />
                {custError && (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)', background: 'rgba(224,48,48,0.1)', border: '1px solid rgba(224,48,48,0.35)', borderRadius: 10, padding: '10px 12px' }}>
                    {custError}
                  </p>
                )}
                <div className="gi-row">
                  <button onClick={() => void saveNewCustomer()} disabled={savingCust || !newCust.name.trim()}
                    style={{ ...primary, opacity: savingCust || !newCust.name.trim() ? 0.45 : 1, cursor: savingCust || !newCust.name.trim() ? 'not-allowed' : 'pointer' }}>
                    {savingCust ? 'Saving…' : 'Save customer'}
                  </button>
                  <button onClick={() => { setShowNew(false); setCustError(''); }} disabled={savingCust} style={ghost}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loadingVehicles && <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>Loading their vehicles…</p>}
            {!loadingVehicles && vehicle.customerId && vehicles.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Their vehicles — tap to fill everything
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {vehicles.map(v => (
                    <button key={v.id} className="gi-chip" onClick={() => selectVehicle(v)}
                      style={{ textAlign: 'left', minHeight: 52, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)', color: 'var(--text)', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                      🚗 {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!loadingVehicles && vehicle.customerId && vehicles.length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>
                No vehicles on file for {vehicle.customerName} — we&apos;ll capture this one.
              </p>
            )}

            <div className="gi-row" style={{ marginTop: 22 }}>
              <button onClick={() => setIdx(0)} style={primary}>Continue</button>
              <button onClick={() => { onChange({ ...vehicle, customerId: '', customerName: '' }); setIdx(0); }} style={ghost}>
                Skip — walk-in
              </button>
            </div>
          </>
        )}

        {/* ── One question ── */}
        {q && (
          <>
            <h2 style={{ fontSize: 'clamp(19px, 4.5vw, 24px)', fontWeight: 800, margin: '0 0 6px', color: 'var(--text)' }}>
              {q.prompt}
              {q.required && <span style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 16 }}>*</span>}
            </h2>
            {q.hint && <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 18px' }}>{q.hint}</p>}

            {q.options ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {q.options.map(opt => (
                  <button key={opt} className="gi-chip" onClick={() => commit(opt)}
                    style={{ minHeight: 52, padding: '13px 14px', borderRadius: 12, border: `1px solid ${draft === opt ? 'var(--accent)' : 'var(--gi-edge)'}`, background: 'var(--gi-field)', color: 'var(--text)', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                ref={inputRef} value={draft}
                onChange={e => {
                  setDraft(q.kind === 'vin' ? e.target.value.toUpperCase() : e.target.value);
                  // Editing the VIN invalidates a decode of the old one.
                  if (q.kind === 'vin') { setDecodeError(''); setPendingDecode(null); }
                }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  if (q.kind === 'vin') { if (!decoding) void decodeVin(); return; }
                  if (draft.trim() || !q.required) commit(draft.trim());
                }}
                placeholder={q.placeholder}
                inputMode={q.inputMode ?? 'text'} enterKeyHint={q.kind === 'vin' ? 'done' : 'next'}
                maxLength={q.kind === 'vin' ? 17 : undefined}
                autoComplete="off" autoCorrect="off"
                // A VIN is never a proper noun and must not be autocapitalised
                // word-by-word or spell-corrected on a phone.
                autoCapitalize={q.kind === 'vin' ? 'characters' : 'words'}
                spellCheck={q.kind === 'vin' ? false : undefined}
                style={q.kind === 'vin' ? { ...input, letterSpacing: '.08em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } : input}
              />
            )}

            {q.kind === 'vin' && (
              <>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{draft.trim().length}/17</span>
                  {vehicle.customerName && <span>for {vehicle.customerName}</span>}
                </div>

                {/* Both paths use BarcodeDetector, which Chrome ships only on
                    Android, ChromeOS and macOS — not on Windows or Linux, and
                    not in Safari. Offering buttons that cannot work and failing
                    on click is worse than not offering them: the advisor blames
                    their photo, or the feature. */}
                <div className="gi-row" style={{ marginTop: 12 }}>
                  {/* Only shown where a camera exists. A desktop with no webcam
                      still gets Upload, which is the useful path there. */}
                  {canUseCamera && (
                    <button onClick={() => void startScan()} className="gi-chip"
                      style={{ flex: '1 1 160px', minHeight: 52, padding: '13px 16px', borderRadius: 12, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)', color: 'var(--text)', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
                      📷 Scan barcode
                    </button>
                  )}
                  <button onClick={() => fileRef.current?.click()} className="gi-chip"
                    style={{ flex: '1 1 160px', minHeight: 52, padding: '13px 16px', borderRadius: 12, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)', color: 'var(--text)', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
                    🖼 Upload photo
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Point at the barcode on the door jamb sticker — the etched dash VIN cannot be scanned.
                </p>
                <input ref={fileRef} type="file" accept="image/*" capture="environment"
                  onChange={handleVinPhoto} style={{ display: 'none' }} />
              </>
            )}

            {scanning && (
              <div role="dialog" aria-label="Scanning for a VIN barcode"
                style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                <video ref={videoRef} playsInline muted
                  style={{ width: '100%', maxWidth: 520, borderRadius: 16, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} />
                <div style={{ width: '100%', maxWidth: 520, marginTop: 14, color: '#fff', fontSize: 14, textAlign: 'center', opacity: 0.85 }}>
                  Hold steady over the barcode…
                </div>
                <button onClick={stopScan}
                  style={{ marginTop: 16, minHeight: 52, padding: '14px 30px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Confirm before anything is applied. A malformed VIN comes back
                looking like a real answer, and only a person can tell. */}
            {q.kind === 'vin' && pendingDecode && (
              <div style={{ marginTop: 14, padding: 16, borderRadius: 14, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  This VIN decoded as
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
                  {pendingDecode.summary}
                </div>
                <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
                  {pendingDecode.fields.map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                      <span style={{ color: 'var(--muted)' }}>{label}</span>
                      <span style={{ color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
                  Does that match the vehicle in front of you?
                </p>
                <div className="gi-row">
                  <button onClick={acceptDecode} style={primary}>Yes — use these</button>
                  <button onClick={rejectDecode} style={ghost}>No — I&apos;ll enter it</button>
                </div>
              </div>
            )}

            {q.kind === 'vin' && decodeError && (
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: 'var(--warn)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '11px 14px' }}>
                {decodeError}
              </p>
            )}

            <div className="gi-row" style={{ marginTop: 22 }}>
              {q.kind === 'vin' ? (
                <button onClick={() => void decodeVin()} disabled={decoding || draft.trim().length !== 17}
                  style={{ ...primary, opacity: decoding || draft.trim().length !== 17 ? 0.45 : 1, cursor: decoding || draft.trim().length !== 17 ? 'not-allowed' : 'pointer' }}>
                  {decoding ? 'Decoding…' : 'Decode VIN'}
                </button>
              ) : !q.options && (
                <button onClick={() => commit(draft.trim())} disabled={q.required && !draft.trim()}
                  style={{ ...primary, opacity: q.required && !draft.trim() ? 0.45 : 1, cursor: q.required && !draft.trim() ? 'not-allowed' : 'pointer' }}>
                  Continue
                </button>
              )}
              <button onClick={skip} disabled={decoding} style={ghost}>
                {q.kind === 'vin' ? "Don't have it" : q.required ? 'Not known yet' : 'Skip'}
              </button>
              <button onClick={() => setIdx(prevIndex(idx))} style={{ ...ghost, flex: '0 0 auto' }}>← Back</button>
            </div>
          </>
        )}

        {/* ── Review ── */}
        {onReview && (
          <>
            <h2 style={{ fontSize: 'clamp(19px, 4.5vw, 24px)', fontWeight: 800, margin: '0 0 6px', color: 'var(--text)' }}>
              Check this over
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 18px' }}>
              {answered} of {QUESTIONS.length} captured. Tap anything to change it.
            </p>

            {decodedNote && (
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 10, padding: '11px 14px' }}>
                ✓ Decoded from VIN — {decodedNote}. Those fields were not asked.
              </p>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
              {vehicle.customerName && (
                <button className="gi-chip" onClick={() => setIdx(-1)}
                  style={{ textAlign: 'left', minHeight: 52, padding: '11px 15px', borderRadius: 12, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)', color: 'var(--text)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>Customer</span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{vehicle.customerName}</span>
                </button>
              )}
              {QUESTIONS.map((x, i) => {
                const val = String(vehicle[x.key] ?? '').trim();
                const wasSkipped = skipped.has(x.key as string);
                return (
                  <button key={x.key} className="gi-chip" onClick={() => setIdx(i)}
                    style={{ textAlign: 'left', minHeight: 52, padding: '11px 15px', borderRadius: 12, border: `1px solid ${!val && x.required ? 'var(--accent)' : 'var(--gi-edge)'}`, background: 'var(--gi-field)', color: 'var(--text)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                      {String(x.key).replace(/([A-Z])/g, ' $1')}
                      {x.required && <span style={{ color: 'var(--accent)' }}> *</span>}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: val ? 'var(--text)' : 'var(--muted)', fontStyle: val ? 'normal' : 'italic', textAlign: 'right' }}>
                      {val || (wasSkipped ? 'Skipped' : 'Not captured')}
                      {val && autoFilled.has(x.key as string) && (
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                          from VIN
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {missingRequired.length > 0 && (
              <p style={{ marginTop: 16, fontSize: 13, color: 'var(--warn)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '11px 14px' }}>
                Still needed before the next step: {missingRequired.map(x => String(x.key)).join(', ')}. Tap it above to fill it in.
              </p>
            )}

            <div className="gi-row" style={{ marginTop: 22 }}>
              <button onClick={onNext} disabled={missingRequired.length > 0}
                style={{ ...primary, opacity: missingRequired.length > 0 ? 0.45 : 1, cursor: missingRequired.length > 0 ? 'not-allowed' : 'pointer' }}>
                Continue to symptoms →
              </button>
              <button onClick={() => setIdx(prevIndex(QUESTIONS.length))} style={ghost}>← Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
