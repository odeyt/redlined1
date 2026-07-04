'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchVehicles, saveVehicle, updateVehicle, updateVehicleServiceRecord, deleteVehicle, transferVehicle } from '@/services/vehicleService';
import { useShop } from '@/lib/useShop';
import type { VehicleRecord } from '@/services/vehicleService';
import { fetchCustomers, saveCustomer } from '@/services/customerService';
import type { Customer } from '@/lib/types';
import { fetchVehicleImages, uploadVehicleImage, deleteVehicleImage } from '@/services/vehicleImageService';
import { PhotoGalleryModal } from '@/components/PhotoGalleryModal';
import { useAppDispatch } from '@/lib/store';
import { fetchShopSettings } from '@/services/shopSettingsService';
import { fetchTechnicians, type Technician } from '@/services/technicianService';
import { getTechColor as _getTechColor } from '@/lib/techColors';
import { createInvoice, nextInvoiceNumber } from '@/services/invoiceService';
import { FilterPills } from '@/components/FilterPills';

type ViewMode = 'grid' | 'list' | 'service' | 'kanban';

const CAR_MODELS: Record<string, string[]> = {
  'Toyota':        ['Camry','Corolla','RAV4','Hilux','Land Cruiser','Prius','Yaris','4Runner','Tacoma','Tundra','Vios','Fortuner','Innova','Alphard','Vellfire'],
  'Honda':         ['Civic','Accord','CR-V','HR-V','Pilot','Jazz','City','Odyssey','Fit','Ridgeline','Passport'],
  'Ford':          ['F-150','F-250','Mustang','Explorer','Escape','Edge','Expedition','Ranger','Bronco','Focus','Fusion'],
  'BMW':           ['3 Series','5 Series','7 Series','X1','X3','X5','X6','X7','M3','M5','1 Series','2 Series','4 Series','6 Series','8 Series','i3','i4','iX'],
  'Mercedes-Benz': ['C-Class','E-Class','S-Class','GLC','GLE','GLS','A-Class','B-Class','CLA','GLA','GLB','AMG GT','G-Class','EQC','EQS'],
  'Audi':          ['A3','A4','A5','A6','A7','A8','Q3','Q5','Q7','Q8','TT','R8','e-tron'],
  'Volkswagen':    ['Golf','Jetta','Passat','Tiguan','Touareg','Polo','Arteon','ID.4','Atlas'],
  'Nissan':        ['Altima','Sentra','Maxima','Rogue','Murano','Pathfinder','Frontier','Titan','Leaf','370Z','GT-R','Navara'],
  'Hyundai':       ['Elantra','Sonata','Tucson','Santa Fe','Palisade','Kona','Ioniq','Veloster','Accent'],
  'Kia':           ['Optima','Sorento','Sportage','Telluride','Stinger','Soul','Forte','Carnival','EV6'],
  'Chevrolet':     ['Silverado','Colorado','Tahoe','Suburban','Traverse','Equinox','Blazer','Camaro','Corvette','Malibu','Spark'],
  'Jeep':          ['Wrangler','Cherokee','Grand Cherokee','Compass','Renegade','Gladiator'],
  'Subaru':        ['Outback','Forester','Crosstrek','Impreza','Legacy','Ascent','WRX','BRZ'],
  'Mazda':         ['Mazda3','Mazda6','CX-3','CX-5','CX-9','MX-5 Miata','CX-30','CX-50'],
  'Land Rover':    ['Defender','Discovery','Range Rover','Range Rover Sport','Range Rover Evoque','Range Rover Velar','Freelander'],
  'Porsche':       ['911','Cayenne','Macan','Panamera','Taycan','718 Boxster','718 Cayman'],
  'Lexus':         ['ES','IS','GS','LS','RX','NX','GX','LX','LC','UX','RC'],
  'Tesla':         ['Model 3','Model S','Model X','Model Y','Cybertruck'],
  'Mitsubishi':    ['Outlander','Eclipse Cross','ASX','Pajero','L200','Lancer','Galant'],
  'Suzuki':        ['Swift','Vitara','Jimny','Celerio','Baleno','S-Cross','Ignis'],
  'Isuzu':         ['D-Max','MU-X','Trooper'],
  'Volvo':         ['XC40','XC60','XC90','S60','S90','V60','V90','C40'],
  'Peugeot':       ['208','308','508','2008','3008','5008','407','207'],
  'Renault':       ['Clio','Megane','Kadjar','Duster','Koleos','Captur','Zoe'],
  'Fiat':          ['500','Panda','Tipo','500X','Doblo'],
};

type StatusFilter = 'All' | 'In Progress' | 'Completed' | 'Pending' | 'Pending Approval' | 'Archived' | 'Pending Parts' | 'Returned Job' | 'Active' | 'No open jobs';

const EMPTY_FORM = {
  customerId: '', vin: '', label: '', trim: '',
  engine: '', transmission: '', mileage: '', plate: '', status: 'Active', recommendation: '',
};

function techColor(name: string) {
  const c = _getTechColor(name);
  return { bg: c.bg, color: c.text, border: c.border };
}

function statusColor(status: string) {
  if (status === 'Completed') return { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' };
  if (status === 'In Progress') return { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' };
  if (status === 'Pending') return { bg: '#fef9c3', color: '#854d0e', border: '#fef08a' };
  if (status === 'Pending Approval') return { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' };
  if (status === 'Archived') return { bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' };
  if (status === 'Pending Parts') return { bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' };
  if (status === 'Returned Job') return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
  if (status === 'Active') return { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
  if (status === 'No open jobs') return { bg: '#f8fafc', color: '#64748b', border: '#cbd5e1' };
  return { bg: 'var(--surface-soft)', color: 'var(--muted)', border: 'var(--line)' };
}

function StatusPill({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
      {status || 'Unknown'}
    </span>
  );
}

// â”€â”€ View Toggle Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ViewBtn({ mode, current, icon, label, onClick }: { mode: ViewMode; current: ViewMode; icon: string; label: string; onClick: () => void }) {
  const active = mode === current;
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
        background: active ? 'var(--accent, #cc0000)' : 'var(--surface-soft)',
        color: active ? '#fff' : 'var(--muted)',
        border: `1px solid ${active ? 'var(--accent, #cc0000)' : 'var(--line)'}`,
        borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
        transition: 'all .15s',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span> {label}
    </button>
  );
}


// â”€â”€ Service Record Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ServiceRecordCard({ v, thumbUrl, onPhotos, enablePhotos }: {
  v: VehicleRecord; thumbUrl?: string; onPhotos: () => void; enablePhotos: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const techList = v.assignedTech ? v.assignedTech.split(';').map(t => t.trim()).filter(Boolean) : [];

  return (
    <article style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top photo strip */}
      {enablePhotos && (
        <div onClick={onPhotos} style={{ height: 120, cursor: 'pointer', background: thumbUrl ? '#000' : 'var(--surface-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: '1px solid var(--line)', position: 'relative' }}>
          {thumbUrl
            ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--muted)' }}><span style={{ fontSize: 28 }}>ðŸš—</span><span style={{ fontSize: 11 }}>Add photos</span></div>
          }
          <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 5 }}>ðŸ“· Photos</div>
        </div>
      )}

      <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.35, marginBottom: 3 }}>{v.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'â€”'}
              {v.fuelType ? ` Â· ${v.fuelType}` : ''}
            </div>
          </div>
          <StatusPill status={v.status} />
        </div>

        {/* Key facts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 12 }}>
          <div style={{ color: 'var(--muted)' }}>Plate</div>
          <div style={{ fontWeight: 600 }}>{v.plate || 'â€”'}</div>
          <div style={{ color: 'var(--muted)' }}>VIN</div>
          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{v.vin || 'â€”'}</div>
          {v.dateReceived && <>
            <div style={{ color: 'var(--muted)' }}>Received</div>
            <div style={{ fontWeight: 600 }}>{new Date(v.dateReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </>}
        </div>

        {/* Assigned techs */}
        {techList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {techList.map(t => {
              const c = techColor(t);
              return <span key={t} style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}>{t}</span>;
            })}
          </div>
        )}

        {/* Issues */}
        {v.issues && (
          <div style={{ background: '#fff8f0', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#92400e', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues</div>
            <div style={{ color: '#78350f', lineHeight: 1.5 }}>{v.issues}</div>
          </div>
        )}

        {/* Expand for more details */}
        {(v.damageIntake || v.partsNeeded || v.partsExchanged || v.issuesResolved) && (
          <>
            <button onClick={() => setExpanded(x => !x)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #cc0000)', fontSize: 12, fontWeight: 600, textAlign: 'left', padding: 0 }}>
              {expanded ? 'â–² Hide details' : 'â–¼ More details'}
            </button>
            {expanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                {v.damageIntake && (
                  <div style={{ background: '#fff0f0', border: '1px solid #fcc', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: '#991b1b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Damage on Intake</div>
                    <div style={{ color: '#7f1d1d' }}>{v.damageIntake}</div>
                  </div>
                )}
                {v.partsNeeded && (
                  <div style={{ fontSize: 12 }}><span style={{ fontWeight: 700, color: 'var(--muted)' }}>Parts Needed: </span>{v.partsNeeded}</div>
                )}
                {v.partsExchanged && (
                  <div style={{ fontSize: 12 }}><span style={{ fontWeight: 700, color: 'var(--muted)' }}>Parts Exchanged: </span>{v.partsExchanged}</div>
                )}
                {v.issuesResolved && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: '#166534', fontWeight: 700 }}>âœ“ Issues Resolved</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

// â”€â”€ Vehicle Edit Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUSES = ['In Progress', 'Pending Parts', 'Pending Approval', 'Completed', 'Returned Job', 'Active', 'No open jobs', 'Archived'];

const KANBAN_COLUMNS = [
  { status: 'Pending Approval', label: 'Pending Customer Approval', icon: 'â³', color: '#7e22ce', bg: '#fdf4ff', border: '#e9d5ff', headerBg: '#ede9fe', extraStatuses: [] as string[] },
  { status: 'In Progress',      label: 'Work In Progress',          icon: 'ðŸ”§', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe', headerBg: '#dbeafe', extraStatuses: [] as string[] },
  { status: 'Pending Parts',    label: 'Pending Parts',             icon: 'ðŸ“¦', color: '#9a3412', bg: '#ffedd5', border: '#fed7aa', headerBg: '#ffedd5', extraStatuses: [] as string[] },
  { status: 'Completed',        label: 'Completed',                 icon: 'âœ…', color: '#166534', bg: '#dcfce7', border: '#bbf7d0', headerBg: '#dcfce7', extraStatuses: [] as string[] },
  { status: 'Returned Job',     label: 'Returned Job',              icon: 'â†©',  color: '#b45309', bg: '#fef9c3', border: '#fde68a', headerBg: '#fef9c3', extraStatuses: [] as string[] },
  { status: 'Active',           label: 'Active / No Open Jobs',     icon: 'ðŸŸ¢', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', headerBg: '#f0fdf4', extraStatuses: ['No open jobs', 'Pending'] },
  { status: 'Archived',         label: 'Archived',                  icon: 'ðŸ—„', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db', headerBg: '#f3f4f6', extraStatuses: [] as string[] },
];

function VehicleDrawer({ vehicle, customers, allVehicles, technicians, onClose, onSaved, onDelete, onPhotos, onJobCard, onReturnJob, onCreateInvoice, onSwitchVehicle, onGoToCustomer, onCustomerCreated }: {
  vehicle: VehicleRecord;
  customers: Customer[];
  allVehicles: VehicleRecord[];
  technicians: Technician[];
  onClose: () => void;
  onSaved: (v: VehicleRecord) => void;
  onDelete: () => void;
  onPhotos: () => void;
  onJobCard: () => void;
  onReturnJob: () => void;
  onCreateInvoice: () => void;
  onSwitchVehicle: (v: VehicleRecord) => void;
  onGoToCustomer: (customerId: string) => void;
  onCustomerCreated: (c: Customer) => void;
}) {
  const [f, setF] = useState({ ...vehicle });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [showAddForCust, setShowAddForCust] = useState(false);
  const custInputRef = useRef<HTMLInputElement>(null);
  const [showInlineNewCust, setShowInlineNewCust] = useState(false);
  const [inlineNewCust, setInlineNewCust] = useState({ name: '', phone: '', email: '' });
  const [savingNewCust, setSavingNewCust] = useState(false);
  const [techDropdownOpen, setTechDropdownOpen] = useState(false);
  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinDecodeMsg, setVinDecodeMsg] = useState('');
  const [showVinScan, setShowVinScan] = useState(false);
  const vinScanVideoRef = useRef<HTMLVideoElement>(null);
  const vinScanStreamRef = useRef<MediaStream | null>(null);
  const vinScanRafRef = useRef<number>(0);
  const vinFileRef = useRef<HTMLInputElement>(null);

  // Vehicles belonging to the currently-selected customer (excluding this one)
  const custVehicles = f.customerId ? allVehicles.filter(v => v.customerId === f.customerId && v.id !== vehicle.id) : [];

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  function set(key: keyof VehicleRecord, val: unknown) { setF(prev => ({ ...prev, [key]: val })); }

  async function decodeVin(vin: string) {
    if (vin.length !== 17) return;
    setVinDecoding(true); setVinDecodeMsg('');
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
      const json = await res.json();
      const get = (var_: string) => (json.Results as {Variable: string; Value: string | null}[])
        .find(r => r.Variable === var_)?.Value || '';
      const year  = get('Model Year');
      const make  = get('Make');
      const model = get('Model');
      const fuel  = get('Fuel Type - Primary');
      if (!year && !make && !model) { setVinDecodeMsg('VIN not found in NHTSA database.'); return; }
      const fuelMapped = fuel.includes('Diesel') ? 'Diesel'
        : fuel.includes('Electric') && fuel.includes('Gas') ? 'Hybrid'
        : fuel.includes('Electric') ? 'EV'
        : fuel.includes('Gasoline') || fuel.includes('Petrol') ? 'Petrol'
        : fuel || '';
      setF(prev => ({
        ...prev,
        year:     year  || prev.year,
        make:     make  ? make.charAt(0) + make.slice(1).toLowerCase() : prev.make,
        model:    model || prev.model,
        fuelType: fuelMapped || prev.fuelType,
      }));
      setVinDecodeMsg(`âœ“ Decoded: ${year} ${make} ${model}`);
    } catch { setVinDecodeMsg('Decode failed â€” check connection.'); }
    finally { setVinDecoding(false); }
  }

  function stopVinScan() {
    vinScanStreamRef.current?.getTracks().forEach(t => t.stop());
    vinScanStreamRef.current = null;
    cancelAnimationFrame(vinScanRafRef.current);
    setShowVinScan(false);
  }

  async function startVinScan() {
    setShowVinScan(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      vinScanStreamRef.current = stream;
      setTimeout(() => {
        if (vinScanVideoRef.current) {
          vinScanVideoRef.current.srcObject = stream;
          vinScanVideoRef.current.play();
          scanFrames();
        }
      }, 100);
    } catch { setShowVinScan(false); vinFileRef.current?.click(); }
  }

  function scanFrames() {
    if (!vinScanVideoRef.current || !vinScanStreamRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector;
    if (!BD) { stopVinScan(); vinFileRef.current?.click(); return; }
    const detector = new BD({ formats: ['code_39', 'code_128', 'qr_code', 'pdf417', 'data_matrix'] });
    const tick = async () => {
      if (!vinScanVideoRef.current || !vinScanStreamRef.current) return;
      try {
        const barcodes = await detector.detect(vinScanVideoRef.current);
        for (const bc of barcodes) {
          const raw = bc.rawValue?.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 17);
          if (raw && raw.length === 17) {
            stopVinScan();
            setF(prev => ({ ...prev, vin: raw }));
            setVinDecodeMsg('');
            decodeVin(raw);
            return;
          }
        }
      } catch { /* keep scanning */ }
      vinScanRafRef.current = requestAnimationFrame(tick);
    };
    vinScanRafRef.current = requestAnimationFrame(tick);
  }

  async function handleVinFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD2 = (window as any).BarcodeDetector;
    if (!BD2) { setVinDecodeMsg('Barcode scanning not supported on this browser.'); return; }
    const detector = new BD2({ formats: ['code_39', 'code_128', 'qr_code', 'pdf417', 'data_matrix'] });
    const bitmap = await createImageBitmap(file);
    try {
      const barcodes = await detector.detect(bitmap);
      for (const bc of barcodes) {
        const raw = bc.rawValue?.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 17);
        if (raw && raw.length === 17) {
          setF(prev => ({ ...prev, vin: raw }));
          setVinDecodeMsg('');
          decodeVin(raw);
          return;
        }
      }
      setVinDecodeMsg('No VIN barcode found in photo. Try again closer to the barcode.');
    } catch { setVinDecodeMsg('Could not read barcode from photo.'); }
    e.target.value = '';
  }

  async function quickStatus(newStatus: string) {
    setSaving(true); setErr('');
    try {
      await updateVehicle(vehicle.id, {
        customerId: f.customerId, vin: f.vin, label: f.label, trim: f.trim,
        engine: f.engine, transmission: f.transmission, mileage: f.mileage,
        plate: f.plate, status: newStatus, recommendation: f.recommendation,
      });
      const updated = { ...f, status: newStatus } as VehicleRecord;
      setF(updated);
      onSaved(updated);
      notify(`Status â†’ ${newStatus}`);
    } catch (e: unknown) {
      setErr('Update failed: ' + (e instanceof Error ? e.message : (e as {message?: string})?.message ?? String(e)));
    } finally { setSaving(false); }
  }

  function handleCustSelect(customerId: string) {
    set('customerId', customerId);
    setCustSearch('');
    setShowAddForCust(false);
  }

  async function handleSave() {
    // If user typed in the customer search but never selected/created one, warn them
    if (custSearch.trim() && !f.customerId) {
      setErr('Please select a customer from the list or click "Create & Assign" to add the new customer first.');
      return;
    }
    setSaving(true); setErr('');
    try {
      // Save basic vehicle fields
      await updateVehicle(vehicle.id, {
        customerId: f.customerId, vin: f.vin, label: f.label, trim: f.trim,
        engine: f.engine, transmission: f.transmission, mileage: f.mileage,
        plate: f.plate, status: f.status, recommendation: f.recommendation,
      });
      // Save service record fields
      await updateVehicleServiceRecord(vehicle.id, {
        make: f.make, model: f.model, year: f.year, fuelType: f.fuelType,
        issues: f.issues, damageIntake: f.damageIntake, issuesResolved: f.issuesResolved,
        partsExchanged: f.partsExchanged, partsNeeded: f.partsNeeded,
        flatRateLak: f.flatRateLak, assignedTech: f.assignedTech,
        dateReceived: f.dateReceived, techPayEntries: f.techPayEntries,
      });
      notify('Saved!');
      onSaved(f as VehicleRecord);
    } catch (e: unknown) {
      setErr('Save failed: ' + (e instanceof Error ? e.message : (e as {message?: string})?.message ?? String(e)));
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
  function row(l: string, el: React.ReactNode) {
    return (
      <div style={{ marginBottom: 12 }}>
        <span style={label}>{l}</span>
        {el}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100 }} />
      {/* Full-screen modal */}
      <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1101, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 1100, boxShadow: '0 24px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {toast && <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#16a34a', color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>{toast}</div>}

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{f.label || 'Vehicle'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{f.plate || 'No plate'} Â· {f.vin || 'No VIN'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-soft)', border: 'none', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>âœ•</button>
        </div>

        {/* Status badge in header area */}
        {f.status && (
          <div style={{ padding: '6px 20px', background: statusColor(f.status).bg, borderBottom: '1px solid ' + statusColor(f.status).border, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: statusColor(f.status).color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>â— {f.status}</span>
            {f.status === 'Pending Approval' && <span style={{ fontSize: 11, color: '#7e22ce' }}>â€” Awaiting customer decision on repair</span>}
            {f.status === 'Archived' && <span style={{ fontSize: 11, color: '#6b7280' }}>â€” Vehicle archived for future reference</span>}
          </div>
        )}

        {/* Owner card */}
        {(() => {
          const owner = customers.find(c => c.id === f.customerId);
          if (owner) {
            return (
              <button
                onClick={() => { onClose(); onGoToCustomer(owner.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  margin: '10px 20px 0', padding: '10px 14px',
                  background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)',
                  borderRadius: 10, cursor: 'pointer', width: 'calc(100% - 40px)',
                  textAlign: 'left', transition: 'background .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.06)')}
                title="Go to customer record"
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>
                  {owner.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Owner</div>
                  <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>{owner.name}</div>
                  {owner.phone && <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 1 }}>ðŸ“ž {owner.phone}</div>}
                  {owner.email && !owner.phone && <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 1 }}>âœ‰ {owner.email}</div>}
                </div>
                <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, flexShrink: 0 }}>View â†’</div>
              </button>
            );
          }
          return (
            <button
              onClick={() => { custInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => custInputRef.current?.focus(), 200); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                margin: '10px 20px 0', padding: '10px 14px',
                background: 'rgba(251,191,36,0.06)', border: '1px dashed rgba(251,191,36,0.5)',
                borderRadius: 10, width: 'calc(100% - 40px)', cursor: 'pointer', textAlign: 'left',
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(251,191,36,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(251,191,36,0.06)')}
              title="Assign a customer to this vehicle"
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                ðŸ‘¤
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Owner</div>
                <div style={{ fontSize: 12, color: '#92400e' }}>No customer assigned â€” tap to assign</div>
              </div>
              <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600, flexShrink: 0 }}>+ Add â†’</div>
            </button>
          );
        })()}

        {/* Action buttons row 1 */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={onJobCard} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--accent,#cc0000)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>ï¼‹ Job Card</button>
          <button onClick={onReturnJob} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>â†© Return Job</button>
          <button onClick={onCreateInvoice} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #22c55e', background: 'rgba(34,197,94,0.08)', color: '#16a34a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>ðŸ§¾ Create Invoice</button>
          <button onClick={onPhotos}  style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>ðŸ“· Photos</button>
          <button onClick={onDelete}  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff0f0', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>ðŸ—‘ Delete</button>
        </div>

        {/* Action buttons row 2 â€” status shortcuts */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 10px', borderBottom: '1px solid var(--line)', flexShrink: 0, flexWrap: 'wrap' }}>
          {f.status !== 'Pending Approval' && f.status !== 'Archived' && (
            <button disabled={saving} onClick={() => quickStatus('Pending Approval')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '2px solid #a855f7', background: 'rgba(168,85,247,0.08)', color: '#7e22ce', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              â³ Pending Approval
            </button>
          )}
          {f.status === 'Pending Approval' && (
            <button disabled={saving} onClick={() => quickStatus('In Progress')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #2196f3', background: 'rgba(33,150,243,0.08)', color: '#1e40af', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              âœ“ Approved â€” Resume Work
            </button>
          )}
          {f.status !== 'Pending Parts' && f.status !== 'Archived' && (
            <button disabled={saving} onClick={() => quickStatus('Pending Parts')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #fed7aa', background: 'rgba(249,115,22,0.07)', color: '#9a3412', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              ðŸ“¦ Pending Parts
            </button>
          )}
          {f.status === 'Pending Parts' && (
            <button disabled={saving} onClick={() => quickStatus('In Progress')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #2196f3', background: 'rgba(33,150,243,0.08)', color: '#1e40af', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              ðŸ”§ Parts In â€” Resume Work
            </button>
          )}
          {f.status !== 'Archived' ? (
            <button disabled={saving} onClick={() => quickStatus('Archived')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', background: 'rgba(107,114,128,0.07)', color: '#6b7280', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              ðŸ—„ Archive Vehicle
            </button>
          ) : (
            <button disabled={saving} onClick={() => quickStatus('Active')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #22c55e', background: 'rgba(34,197,94,0.08)', color: '#166534', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              â™» Restore from Archive
            </button>
          )}
        </div>

        {/* Form body */}
        <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
          {err && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 7, color: '#dc2626', fontSize: 12 }}>{err}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>{/* â”€â”€ LEFT: Basic Info â”€â”€ */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent,#cc0000)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Basic Info</div>

          {/* Status-reason callout â€” shown for statuses that need an explanation */}
          {['Pending', 'Pending Approval', 'Pending Parts', 'Returned Job'].includes(f.status) && (() => {
            const sc = statusColor(f.status);
            const statusLabels: Record<string, string> = {
              'Pending': 'Reason vehicle is Pending',
              'Pending Approval': 'Reason awaiting customer approval',
              'Pending Parts': 'Parts needed / reason parts are pending',
              'Returned Job': 'Reason for return / what went wrong',
            };
            return (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: sc.bg, border: `1.5px solid ${sc.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: sc.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>ðŸ“</span> {statusLabels[f.status] ?? 'Status Note'}
                </div>
                <textarea
                  value={f.recommendation}
                  onChange={e => set('recommendation', e.target.value)}
                  placeholder={`Enter reason or notes for "${f.status}" statusâ€¦`}
                  rows={3}
                  style={{ ...inp, resize: 'vertical', minHeight: 64, borderColor: sc.border, background: 'var(--surface)' }}
                />
                <div style={{ fontSize: 10, color: sc.color, marginTop: 4, opacity: 0.8 }}>This note is visible to all staff and saved with the vehicle record.</div>
              </div>
            );
          })()}

          {row('Vehicle Label', <input style={inp} value={f.label} onChange={e => set('label', e.target.value)} placeholder="2023 Ford F-150" />)}

          {/* â”€â”€ Customer picker â”€â”€ */}
          <div style={{ marginBottom: 12 }}>
            <span style={label}>Customer</span>
            <div style={{ position: 'relative' }}>
              <input
                ref={custInputRef}
                value={custSearch !== '' ? custSearch : (customers.find(c => c.id === f.customerId)?.name ?? '')}
                onChange={e => { setCustSearch(e.target.value); if (!e.target.value) set('customerId', ''); }}
                onFocus={e => { setCustSearch(''); e.target.select(); }}
                placeholder="Search customersâ€¦"
                style={{ ...inp, borderColor: f.customerId ? '#22c55e' : 'var(--line)' }}
              />
              {custSearch && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', maxHeight: 320, overflowY: 'auto', marginTop: 2 }}>
                  {customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).length === 0
                    ? <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>No customers found</div>
                    : customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).map(c => {
                        const n = allVehicles.filter(v => v.customerId === c.id).length;
                        return (
                          <div key={c.id} onClick={() => { handleCustSelect(c.id); setShowInlineNewCust(false); }}
                            style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)') as unknown as void}
                            onMouseLeave={e => (e.currentTarget.style.background = '') as unknown as void}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{c.name}</div>
                              {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</div>}
                            </div>
                            {n > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: 10, padding: '2px 7px', flexShrink: 0 }}>{n} vehicle{n !== 1 ? 's' : ''}</span>}
                          </div>
                        );
                      })
                  }
                  {/* â”€â”€ Add new customer inline â”€â”€ */}
                  {!showInlineNewCust ? (
                    <button
                      type="button"
                      onClick={() => { setShowInlineNewCust(true); setInlineNewCust({ name: custSearch, phone: '', email: '' }); }}
                      style={{ width: '100%', padding: '10px 12px', background: 'rgba(37,99,235,0.04)', border: 'none', borderTop: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.1)') as unknown as void}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.04)') as unknown as void}
                    >
                      <span style={{ fontSize: 16 }}>ï¼‹</span> Add &ldquo;{custSearch}&rdquo; as new customer
                    </button>
                  ) : (
                    <div style={{ padding: '12px', borderTop: '1px solid var(--line)', background: 'rgba(37,99,235,0.03)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>New Customer</div>
                      <input
                        autoFocus
                        placeholder="Full name *"
                        value={inlineNewCust.name}
                        onChange={e => setInlineNewCust(p => ({ ...p, name: e.target.value }))}
                        style={{ ...inp, marginBottom: 6 }}
                      />
                      <input
                        placeholder="Phone"
                        value={inlineNewCust.phone}
                        onChange={e => setInlineNewCust(p => ({ ...p, phone: e.target.value }))}
                        style={{ ...inp, marginBottom: 6 }}
                      />
                      <input
                        placeholder="Email"
                        value={inlineNewCust.email}
                        onChange={e => setInlineNewCust(p => ({ ...p, email: e.target.value }))}
                        style={{ ...inp, marginBottom: 10 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          disabled={!inlineNewCust.name.trim() || savingNewCust}
                          onClick={async () => {
                            if (!inlineNewCust.name.trim()) return;
                            setSavingNewCust(true);
                            try {
                              const created = await saveCustomer({ name: inlineNewCust.name.trim(), phone: inlineNewCust.phone, email: inlineNewCust.email, type: 'Individual', address: '', tags: [], followUp: '', portalToken: null });
                              onCustomerCreated(created);
                              handleCustSelect(created.id);
                              setCustSearch('');
                              setShowInlineNewCust(false);
                              setInlineNewCust({ name: '', phone: '', email: '' });
                            } catch (e: unknown) {
                              setErr('Failed to create customer: ' + ((e as {message?: string})?.message ?? String(e)));
                            } finally {
                              setSavingNewCust(false);
                            }
                          }}
                          style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !inlineNewCust.name.trim() || savingNewCust ? 0.5 : 1 }}
                        >
                          {savingNewCust ? 'Savingâ€¦' : 'Create & Assign'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowInlineNewCust(false)}
                          style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* â”€â”€ Other vehicles for this customer â”€â”€ */}
          {custVehicles.length > 0 && (
            <div style={{ marginBottom: 14, background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#2196f3', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(33,150,243,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>ðŸš— {customers.find(c => c.id === f.customerId)?.name}&apos;s Other Vehicles ({custVehicles.length})</span>
                <button type="button" onClick={() => setShowAddForCust(v => !v)}
                  style={{ fontSize: 11, fontWeight: 700, color: showAddForCust ? '#888' : '#2196f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showAddForCust ? 'âœ• cancel' : '+ New vehicle'}
                </button>
              </div>
              {custVehicles.map(v => (
                <div key={v.id} onClick={() => onSwitchVehicle(v)}
                  style={{ padding: '9px 12px', borderBottom: '1px solid rgba(33,150,243,0.1)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(33,150,243,0.07)') as unknown as void}
                  onMouseLeave={e => (e.currentTarget.style.background = '') as unknown as void}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{v.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.plate || 'â€”'} Â· {v.vin || 'No VIN'}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#2196f3', fontWeight: 700, flexShrink: 0 }}>Open â†’</span>
                </div>
              ))}
              {showAddForCust && (
                <div style={{ padding: '10px 12px', background: 'rgba(33,150,243,0.04)', borderTop: '1px solid rgba(33,150,243,0.15)', fontSize: 12, color: 'var(--muted)' }}>
                  Save this record first, then use <strong>+ Add Vehicle</strong> from the list and select this customer â€” their info will auto-fill.
                </div>
              )}
            </div>
          )}

          {/* If no other vehicles, offer to add one */}
          {custVehicles.length === 0 && f.customerId && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)', padding: '6px 10px', background: 'var(--surface-soft)', borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Only vehicle on file for this customer</span>
              <button type="button" onClick={() => setShowAddForCust(v => !v)}
                style={{ color: '#2196f3', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>+ Add another</button>
            </div>
          )}
          {showAddForCust && custVehicles.length === 0 && (
            <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
              Close this drawer, then click <strong>+ Add Vehicle</strong> â€” the customer will be pre-selected and their info auto-filled.
            </div>
          )}
          {/* VIN with scan â€” placed first so decode populates fields below */}
          <div style={{ marginBottom: 12 }}>
            <span style={{ ...label, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>VIN</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: f.vin?.length === 17 ? '#22c55e' : f.vin?.length > 0 ? '#f59e0b' : 'var(--muted)' }}>{f.vin?.length ?? 0}/17</span>
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...inp, flex: 1, fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                value={f.vin} maxLength={17}
                onChange={e => {
                  const v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 17);
                  set('vin', v);
                  if (v.length === 17) { setVinDecodeMsg(''); decodeVin(v); }
                }}
                placeholder="1FTFW1E85PFA24680" />
              <button type="button" title="Scan VIN barcode with camera"
                onClick={startVinScan}
                style={{ padding: '0 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>
                ðŸ“·
              </button>
            </div>
            {vinDecoding && <div style={{ marginTop: 4, fontSize: 11, color: '#3b82f6' }}>â³ Decoding VINâ€¦</div>}
            {vinDecodeMsg && <div style={{ marginTop: 4, fontSize: 11, color: vinDecodeMsg.startsWith('âœ“') ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{vinDecodeMsg}</div>}
            {/* hidden file input for photo fallback */}
            <input ref={vinFileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleVinFileUpload} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <span style={label}>Year</span>
              <select style={inp} value={f.year ?? ''} onChange={e => set('year', e.target.value)}>
                <option value="">â€” Select â€”</option>
                {Array.from({ length: new Date().getFullYear() - 1949 + 1 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={label}>Make</span>
              <input list="vd-makes" style={inp} value={f.make ?? ''} onChange={e => set('make', e.target.value)} placeholder="e.g. Toyota" />
              <datalist id="vd-makes">
                {['Acura','Alfa Romeo','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','Cadillac','Chevrolet','Chrysler','CitroÃ«n','Dacia','Dodge','Ferrari','Fiat','Ford','Genesis','GMC','Honda','Hyundai','Infiniti','Jaguar','Jeep','Kia','Lamborghini','Land Rover','Lexus','Lincoln','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','Mini','Mitsubishi','Nissan','Peugeot','Porsche','RAM','Renault','Rolls-Royce','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo'].map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <span style={label}>Model</span>
              <input list="vd-models" style={inp} value={f.model ?? ''} onChange={e => set('model', e.target.value)} placeholder="e.g. Camry" />
              <datalist id="vd-models">
                {(CAR_MODELS[f.make ?? ''] ?? []).map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <span style={label}>Fuel Type</span>
              <select style={inp} value={f.fuelType ?? ''} onChange={e => set('fuelType', e.target.value)}>
                <option value="">â€” Select â€”</option>
                {['Petrol','Diesel','Hybrid','EV','CNG','LPG'].map(ft => <option key={ft} value={ft}>{ft}</option>)}
              </select>
            </div>
            <div><span style={label}>Plate</span><input style={inp} value={f.plate} onChange={e => set('plate', e.target.value)} /></div>
            <div><span style={label}>Mileage</span><input style={inp} value={f.mileage} onChange={e => set('mileage', e.target.value)} /></div>
          </div>

          {/* VIN camera scan modal */}
          {showVinScan && (
            <div onClick={e => { if (e.target === e.currentTarget) stopVinScan(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Point camera at VIN barcode</div>
              <video ref={vinScanVideoRef} playsInline muted style={{ width: '90vw', maxWidth: 480, borderRadius: 12, border: '2px solid #22c55e' }} />
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Scanning automaticallyâ€¦</div>
              <button onClick={stopVinScan} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
          {row('Engine', <input style={inp} value={f.engine} onChange={e => set('engine', e.target.value)} />)}
          {row('Transmission', <input style={inp} value={f.transmission} onChange={e => set('transmission', e.target.value)} />)}
          {row('Status', (
            <select style={{ ...inp }} value={f.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
          {row('Date Received', <input type="date" style={inp} value={f.dateReceived ?? ''} onChange={e => set('dateReceived', e.target.value || null)} />)}

          </div>{/* end left column */}
          <div>{/* â”€â”€ RIGHT: Service Record â”€â”€ */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent,#cc0000)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Service Record</div>

          {/* Assigned Tech multi-select dropdown */}
          <div style={{ marginBottom: 12 }}>
            <span style={label}>Assigned Tech(s)</span>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setTechDropdownOpen(o => !o)}
                style={{ ...inp, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 }}
              >
                <span style={{ color: f.assignedTech ? 'var(--text)' : 'var(--muted)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {f.assignedTech || 'Select techniciansâ€¦'}
                </span>
                <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0, marginLeft: 6 }}>{techDropdownOpen ? 'â–²' : 'â–¼'}</span>
              </button>
              {techDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
                  {technicians.length === 0 && (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>No technicians found â€” add them in the Employees module.</div>
                  )}
                  {technicians.map(tech => {
                    const selected = (f.assignedTech ?? '').split(';').map(s => s.trim()).filter(Boolean).includes(tech.name);
                    const c = techColor(tech.name);
                    return (
                      <div
                        key={tech.id}
                        onClick={() => {
                          const current = (f.assignedTech ?? '').split(';').map(s => s.trim()).filter(Boolean);
                          const next = selected ? current.filter(n => n !== tech.name) : [...current, tech.name];
                          set('assignedTech', next.join('; '));
                        }}
                        style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)', background: selected ? c.bg : 'transparent', transition: 'background .1s' }}
                        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--surface-soft)'; }}
                        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selected ? c.color : 'var(--line)'}`, background: selected ? c.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: '#fff', fontWeight: 800 }}>
                          {selected ? 'âœ“' : ''}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: selected ? c.color : 'var(--text)' }}>{tech.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tech.role}</div>
                        </div>
                        {selected && <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>Selected</span>}
                      </div>
                    );
                  })}
                  {f.assignedTech && (
                    <div
                      onClick={() => { set('assignedTech', ''); setTechDropdownOpen(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#dc2626', fontWeight: 600, textAlign: 'center', borderTop: '1px solid var(--line)' }}>
                      âœ• Clear selection
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Selected tech chips */}
            {f.assignedTech && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {f.assignedTech.split(';').map(t => t.trim()).filter(Boolean).map(t => {
                  const c = techColor(t);
                  return (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                      {t}
                      <button onClick={() => { const next = f.assignedTech.split(';').map(s => s.trim()).filter(s => s && s !== t); set('assignedTech', next.join('; ')); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color, fontSize: 12, padding: 0, lineHeight: 1, fontWeight: 800 }}>Ã—</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          {row('Issues / Work Needed', <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.issues} onChange={e => set('issues', e.target.value)} />)}
          {row('Damage at Intake', <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.damageIntake} onChange={e => set('damageIntake', e.target.value)} />)}
          {row('Parts Needed', <textarea style={{ ...inp, minHeight: 55, resize: 'vertical' }} value={f.partsNeeded} onChange={e => set('partsNeeded', e.target.value)} />)}
          {row('Parts Exchanged', <textarea style={{ ...inp, minHeight: 55, resize: 'vertical' }} value={f.partsExchanged} onChange={e => set('partsExchanged', e.target.value)} />)}
          {row('Flat Rate (LAK)', <input type="number" style={inp} value={f.flatRateLak ?? ''} onChange={e => set('flatRateLak', e.target.value ? Number(e.target.value) : null)} />)}
          {row('Tech Pay Notes', <input style={inp} value={f.techPayEntries} onChange={e => set('techPayEntries', e.target.value)} />)}
          {/* Hide when status-reason callout above is already editing recommendation */}
          {!['Pending', 'Pending Approval', 'Pending Parts', 'Returned Job'].includes(f.status) &&
            row('Recommended Service / Notes', <input style={inp} value={f.recommendation} onChange={e => set('recommendation', e.target.value)} placeholder="e.g. Oil change due at 50k" />)
          }

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" id="issues-resolved" checked={f.issuesResolved} onChange={e => set('issuesResolved', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="issues-resolved" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Issues Resolved</label>
          </div>
          </div>{/* end right column */}
          </div>{/* end two-column grid */}
        </div>

        {/* Save footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', flexShrink: 0, display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent,#cc0000)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Savingâ€¦' : 'âœ“ Save Changes'}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

// â”€â”€ Main View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function VehiclesView() {
  const dispatch = useAppDispatch();
  const { shops, currentShop, role } = useShop();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '', type: 'Individual' });
  const [custSearch, setCustSearch] = useState('');
  const [savingCust, setSavingCust] = useState(false);
  const [custVehicles, setCustVehicles] = useState<VehicleRecord[]>([]); // vehicles for selected customer in add form
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [vinError, setVinError] = useState('');
  const [toast, setToast] = useState('');
  const [galleryVehicle, setGalleryVehicle] = useState<VehicleRecord | null>(null);
  const [drawerVehicle, setDrawerVehicle] = useState<VehicleRecord | null>(null);
  const [transferTarget, setTransferTarget] = useState<VehicleRecord | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enableVehiclePhotos, setEnableVehiclePhotos] = useState(true);
  const [enableVehicleEdit, setEnableVehicleEdit] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [search, setSearch] = useState('');
  const [kanbanDragId, setKanbanDragId] = useState<string | null>(null);
  const [kanbanDragOver, setKanbanDragOver] = useState<string | null>(null);

  useEffect(() => {
    fetchShopSettings().then(s => {
      setEnableVehiclePhotos(s.enableVehiclePhotos ?? true);
      setEnableVehicleEdit(s.enableVehicleEdit ?? true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    // Fetch technicians independently so a failure there never blocks vehicles/customers
    fetchTechnicians().then(t => setTechnicians(t.filter(x => x.status !== 'Inactive'))).catch(() => {});

    Promise.all([fetchVehicles(), fetchCustomers()])
      .then(([v, c]) => {
        setVehicles(v as VehicleRecord[]);
        setCustomers(c);
        v.forEach(vehicle => {
          fetchVehicleImages(vehicle.id).then(imgs => {
            // Apply saved photo order so list thumbnail matches carousel first photo
            if (vehicle.imageIds?.length) {
              const order = vehicle.imageIds;
              imgs.sort((a, b) => {
                const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1; if (bi === -1) return -1;
                return ai - bi;
              });
            }
            const urls = imgs.slice(0, 5).map(i => i.url);
            if (urls.length > 0) setThumbs(prev => ({ ...prev, [vehicle.id]: urls }));
          }).catch(() => {});
        });
      })
      .catch(err => setError('Load error: ' + (err?.message || '')))
      .finally(() => setLoading(false));
  }, []);

  // Deep-link: open a specific vehicle drawer from global search or other modules
  useEffect(() => {
    function handleOpenVehicle(e: Event) {
      const { vehicleId } = (e as CustomEvent).detail ?? {};
      if (!vehicleId) return;
      setVehicles(current => {
        const found = current.find(v => v.id === vehicleId);
        if (found) setDrawerVehicle(found);
        return current;
      });
    }
    window.addEventListener('open-vehicle', handleOpenVehicle);
    return () => window.removeEventListener('open-vehicle', handleOpenVehicle);
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleKanbanMove(vehicleId: string, newStatus: string) {
    const v = vehicles.find(x => x.id === vehicleId);
    if (!v || v.status === newStatus) return;
    try {
      await updateVehicle(v.id, {
        customerId: v.customerId, vin: v.vin, label: v.label, trim: v.trim,
        engine: v.engine, transmission: v.transmission, mileage: v.mileage,
        plate: v.plate, status: newStatus, recommendation: v.recommendation,
      });
      setVehicles(prev => prev.map(x => x.id === vehicleId ? { ...x, status: newStatus } : x));
      notify(`${v.label} â†’ ${newStatus}`);
    } catch { notify('Status update failed'); }
  }

  async function handleDeleteVehicle(v: VehicleRecord) {
    if (!confirm(`Delete ${v.label}? This cannot be undone.`)) return;
    try {
      await deleteVehicle(v.id);
      setVehicles(prev => prev.filter(x => x.id !== v.id));
      notify(`${v.label} deleted.`);
    } catch (err) { setError('Delete failed: ' + (err instanceof Error ? err.message : (err as {message?: string})?.message ?? String(err))); }
  }

  async function handleTransfer(toShopId: string) {
    if (!transferTarget) return;
    setTransferring(true);
    try {
      await transferVehicle(transferTarget.id, toShopId);
      setVehicles(prev => prev.filter(x => x.id !== transferTarget.id));
      const toName = shops.find(s => s.id === toShopId)?.name ?? 'other location';
      notify(`${transferTarget.label} transferred to ${toName}.`);
      setTransferTarget(null);
    } catch (err) { setError('Transfer failed: ' + (err instanceof Error ? err.message : (err as {message?: string})?.message ?? String(err))); }
    finally { setTransferring(false); }
  }

  function handleCustomerSelect(customerId: string) {
    setCustSearch('');
    setShowAddCustomer(false);
    if (!customerId) { setForm(f => ({ ...f, customerId: '' })); setCustVehicles([]); return; }
    const cvs = vehicles.filter(v => v.customerId === customerId)
      .sort((a, b) => (b.dateReceived ?? '').localeCompare(a.dateReceived ?? ''));
    setCustVehicles(cvs);
    if (cvs.length === 1) {
      // Only one car â€” auto-fill immediately
      applyVehicleTemplate(customerId, cvs[0]);
    } else {
      // Multiple cars â€” set customer only, let user pick which car to pre-fill from
      setForm(f => ({ ...f, customerId, label: '', vin: '', trim: '', engine: '', transmission: '', plate: '' }));
    }
  }

  function applyVehicleTemplate(customerId: string, v: VehicleRecord) {
    setForm(f => ({
      ...f,
      customerId,
      label:        v.label,
      vin:          v.vin,
      trim:         v.trim,
      engine:       v.engine,
      transmission: v.transmission,
      plate:        v.plate,
    }));
  }

  async function handleAddCustomer() {
    if (!newCust.name.trim()) return;
    setSavingCust(true);
    try {
      const created = await saveCustomer({ name: newCust.name.trim(), phone: newCust.phone, email: newCust.email, type: newCust.type, address: '', tags: [], followUp: '', portalToken: null });
      setCustomers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      handleCustomerSelect(created.id);
      setShowAddCustomer(false);
      setNewCust({ name: '', phone: '', email: '', type: 'Individual' });
      notify(`Customer "${created.name}" created and selected.`);
    } catch (err) { notify('Failed to create customer: ' + (err instanceof Error ? err.message : (err as {message?: string})?.message ?? String(err))); }
    finally { setSavingCust(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.vin.trim()) {
      const vin = form.vin.trim().toUpperCase();
      if (vin.length !== 17) { setVinError(`VIN must be exactly 17 characters (you entered ${vin.length}).`); setSaving(false); return; }
      if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) { setVinError('VIN can only contain letters and numbers (I, O, Q are not valid).'); setSaving(false); return; }
    }
    setVinError('');
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateVehicle(editingId, form);
        setVehicles(prev => prev.map(v => v.id === editingId ? { ...v, ...updated } : v));
        notify(`${updated.label} updated.`);
      } else {
        const newVehicle = await saveVehicle(form);
        setVehicles(prev => [{ ...newVehicle } as VehicleRecord, ...prev]);
        notify(`${newVehicle.label} saved.`);
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
    } catch (err: unknown) {
      notify('Save failed: ' + (err instanceof Error ? err.message : (err as {message?: string})?.message ?? String(err)));
    } finally { setSaving(false); }
  }

  function field(key: keyof typeof EMPTY_FORM, label: string, placeholder = '') {
    return (
      <div className="login-field">
        <label>{label}</label>
        <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} />
      </div>
    );
  }

  // Filtered + searched list
  const STATUS_FILTERS: StatusFilter[] = ['All', 'In Progress', 'Pending Approval', 'Pending Parts', 'Completed', 'Returned Job', 'Pending', 'Active', 'No open jobs', 'Archived'];
  const filtered = vehicles.filter(v => {
    // Archived vehicles hidden from "All" â€” must use Archived filter to see them
    if (statusFilter === 'All' && v.status === 'Archived') return false;
    const matchStatus = statusFilter === 'All' || v.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || [v.label, v.make, v.model, v.vin, v.plate, v.assignedTech, v.issues].some(f => f?.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  // Status counts for filter chips (All excludes archived)
  const counts: Record<string, number> = { All: vehicles.filter(v => v.status !== 'Archived').length };
  vehicles.forEach(v => { counts[v.status] = (counts[v.status] ?? 0) + 1; });

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}

      {/* â”€â”€ Transfer Modal â”€â”€ */}
      {transferTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setTransferTarget(null); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>â‡„ Transfer Vehicle</h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{transferTarget.label} Â· {transferTarget.plate}</p>
            </div>

            <div style={{ background: 'var(--surface-soft)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--muted)' }}>
              Currently at: <strong style={{ color: 'var(--text)' }}>{currentShop?.name ?? 'â€”'}</strong>
            </div>

            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Move to:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shops.filter(s => s.id !== currentShop?.id).map(s => (
                <button
                  key={s.id}
                  disabled={transferring}
                  onClick={() => handleTransfer(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderRadius: 10, border: '1px solid var(--line)',
                    background: 'var(--surface)', cursor: transferring ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 600, color: 'var(--text)', textAlign: 'left',
                    transition: 'background .15s, border-color .15s',
                    opacity: transferring ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.07)'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--line)'; }}
                >
                  <span>ðŸ¢ {s.name}</span>
                  <span style={{ fontSize: 18, color: '#2563eb' }}>â†’</span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setTransferTarget(null)} disabled={transferring}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {galleryVehicle && (
        <PhotoGalleryModal
          title={galleryVehicle.label}
          subtitle={`${galleryVehicle.plate} Â· ${galleryVehicle.vin}`}
          fetchImages={() => fetchVehicleImages(galleryVehicle.id)}
          uploadImage={(file, label) => uploadVehicleImage(galleryVehicle.id, file, label)}
          deleteImage={(id, url) => deleteVehicleImage(id, url)}
          saveOrder={async (ids) => { await updateVehicleServiceRecord(galleryVehicle.id, { imageIds: ids }); }}
          initialOrder={galleryVehicle.imageIds}
          onClose={() => setGalleryVehicle(null)}
        />
      )}
      {drawerVehicle && (
        <VehicleDrawer
          vehicle={drawerVehicle}
          customers={customers}
          allVehicles={vehicles}
          technicians={technicians}
          onClose={() => setDrawerVehicle(null)}
          onSwitchVehicle={v => setDrawerVehicle(v)}
          onSaved={updated => {
            setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
            setDrawerVehicle(updated);
            notify(`${updated.label} updated.`);
          }}
          onDelete={() => { handleDeleteVehicle(drawerVehicle); setDrawerVehicle(null); }}
          onPhotos={() => { setGalleryVehicle(drawerVehicle); setDrawerVehicle(null); }}
          onJobCard={() => {
            const owner = customers.find(c => c.id === drawerVehicle.customerId);
            dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: drawerVehicle.customerId, vehicle: drawerVehicle.label } });
            setDrawerVehicle(null);
          }}
          onReturnJob={() => {
            const owner = customers.find(c => c.id === drawerVehicle.customerId);
            dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: drawerVehicle.customerId, vehicle: drawerVehicle.label, notes: `â†© RETURN JOB â€” Vehicle: ${drawerVehicle.label}` } });
            setDrawerVehicle(null);
          }}
          onCreateInvoice={async () => {
            const v = drawerVehicle;
            const owner = customers.find(c => c.id === v.customerId);
            try {
              const invNum = await nextInvoiceNumber();
              const inv = await createInvoice({
                invoiceNumber: invNum,
                customerName: owner?.name ?? '',
                customerId: owner?.id ?? '',
                vehicle: v.label,
                jobCardId: '',
                status: 'Draft',
                lines: [{ note: '', description: `Service â€” ${v.label}`, qty: 1, rate: 0 }],
                discount: 0, shopSupplies: 0, taxRate: 0,
                notes: `Vehicle: ${v.label}${v.issues ? `\nIssues: ${v.issues}` : ''}`,
                dueDate: '', paidDate: null, currency: 'USD',
              });
              setDrawerVehicle(null);
              notify(`âœ“ Invoice ${inv.invoiceNumber} created`);
              dispatch({ type: 'SET_MODULE', module: 'invoices' });
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-invoice', { detail: { invoiceNumber: inv.invoiceNumber } })), 100);
            } catch { notify('Failed to create invoice'); }
          }}
          onGoToCustomer={(customerId) => {
            setDrawerVehicle(null);
            dispatch({ type: 'SET_MODULE', module: 'customers' });
            setTimeout(() => window.dispatchEvent(new CustomEvent('open-customer', { detail: { customerId } })), 50);
          }}
          onCustomerCreated={(newCust) => {
            setCustomers(prev => [...prev, newCust].sort((a, b) => a.name.localeCompare(b.name)));
          }}
        />
      )}

      {/* â”€â”€ Toolbar â”€â”€ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          <ViewBtn mode="grid"    current={viewMode} icon="âŠž" label="Grid"           onClick={() => setViewMode('grid')} />
          <ViewBtn mode="list"    current={viewMode} icon="â˜°" label="List"           onClick={() => setViewMode('list')} />
          <ViewBtn mode="service" current={viewMode} icon="ðŸ“‹" label="Service Records" onClick={() => setViewMode('service')} />
          <ViewBtn mode="kanban"  current={viewMode} icon="ðŸ—‚" label="Kanban"         onClick={() => setViewMode('kanban')} />
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setVinError(''); setForm(EMPTY_FORM); setEditingId(null); setShowAddCustomer(false); setCustSearch(''); setCustVehicles([]); }}>
          {showForm ? 'Cancel' : '+ Add Vehicle'}
        </button>
      </div>

      {/* â”€â”€ Search + Status filters (list & service views) â”€â”€ */}
      {(viewMode === 'list' || viewMode === 'service') && (
        <div style={{ marginBottom: 14 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vehicles, VIN, plate, tech, issuesâ€¦"
            style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', marginBottom: 10 }}
          />
          <FilterPills statuses={STATUS_FILTERS} active={statusFilter} counts={counts} onChange={v => setStatusFilter(v as typeof statusFilter)} />
        </div>
      )}

      {/* â”€â”€ Add / Edit Form â”€â”€ */}
      {showForm && (
        <form onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 20, marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{editingId ? 'âœ Edit Vehicle' : '+ Add Vehicle'}</div>
          {/* â”€â”€ Customer picker with search + quick-add â”€â”€ */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer *</label>
              <button type="button" onClick={() => { setShowAddCustomer(v => !v); setNewCust({ name: custSearch, phone: '', email: '', type: 'Individual' }); }}
                style={{ fontSize: 12, fontWeight: 700, color: '#2196f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showAddCustomer ? 'âœ• Cancel' : '+ New Customer'}
              </button>
            </div>

            {/* Search + dropdown */}
            {!showAddCustomer && (
              <div style={{ position: 'relative' }}>
                <input
                  value={custSearch || (form.customerId ? (customers.find(c => c.id === form.customerId)?.name ?? '') : '')}
                  onChange={e => { setCustSearch(e.target.value); if (!e.target.value) setForm(f => ({ ...f, customerId: '' })); }}
                  onFocus={e => { setCustSearch(''); e.target.select(); }}
                  placeholder="Search customersâ€¦"
                  required={!form.customerId}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${form.customerId ? '#22c55e' : 'var(--line)'}`, background: 'var(--surface-soft)', color: 'var(--text)', boxSizing: 'border-box', fontSize: 14 }}
                />
                {custSearch && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
                    {customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).length === 0 ? (
                      <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 13 }}>
                        No match â€” <button type="button" onClick={() => { setShowAddCustomer(true); setNewCust({ name: custSearch, phone: '', email: '', type: 'Individual' }); setCustSearch(''); }}
                          style={{ color: '#2196f3', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Create "{custSearch}" as new customer â†’</button>
                      </div>
                    ) : customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).map(c => {
                      const custVehicles = vehicles.filter(v => v.customerId === c.id);
                      return (
                        <div key={c.id} onClick={() => handleCustomerSelect(c.id)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)') as unknown as void}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent') as unknown as void}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                            {(c.phone || c.email) && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}{c.phone && c.email ? ' Â· ' : ''}{c.email}</div>}
                          </div>
                          {custVehicles.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: 10, padding: '2px 8px', flexShrink: 0 }}>{custVehicles.length} vehicle{custVehicles.length !== 1 ? 's' : ''}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {form.customerId && !custSearch && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>âœ“ Customer selected</div>
                )}
              </div>
            )}

            {/* Inline new-customer mini-form */}
            {showAddCustomer && (
              <div style={{ background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.25)', borderRadius: 10, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#2196f3', marginBottom: 2 }}>âž• New Customer</div>
                <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Name *</label>
                  <input value={newCust.name} onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))} placeholder="Company or person name" autoFocus />
                </div>
                <div className="login-field">
                  <label>Phone</label>
                  <input value={newCust.phone} onChange={e => setNewCust(n => ({ ...n, phone: e.target.value }))} placeholder="+66 81 234 5678" />
                </div>
                <div className="login-field">
                  <label>Email</label>
                  <input value={newCust.email} onChange={e => setNewCust(n => ({ ...n, email: e.target.value }))} placeholder="email@example.com" type="email" />
                </div>
                <div className="login-field">
                  <label>Type</label>
                  <select value={newCust.type} onChange={e => setNewCust(n => ({ ...n, type: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', background: 'var(--surface-soft)', color: 'var(--text)' }}>
                    <option>Individual</option><option>Business</option><option>Fleet</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setShowAddCustomer(false)}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={savingCust || !newCust.name.trim()} onClick={handleAddCustomer}>{savingCust ? 'Savingâ€¦' : 'Create & Select'}</button>
                </div>
              </div>
            )}
          </div>
          {/* â”€â”€ Existing vehicle picker (shown when customer has multiple cars) â”€â”€ */}
          {custVehicles.length > 0 && form.customerId && (
            <div style={{ gridColumn: '1 / -1', background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.25)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: 'rgba(33,150,243,0.08)', borderBottom: '1px solid rgba(33,150,243,0.15)', fontSize: 11, fontWeight: 800, color: '#2196f3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ðŸš— {customers.find(c => c.id === form.customerId)?.name} has {custVehicles.length} vehicle{custVehicles.length !== 1 ? 's' : ''} on file â€” select to pre-fill, or fill in manually below
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, background: 'rgba(33,150,243,0.1)' }}>
                {custVehicles.map(v => {
                  const isSelected = form.label === v.label && form.vin === v.vin;
                  return (
                    <div key={v.id} onClick={() => applyVehicleTemplate(form.customerId, v)}
                      style={{ padding: '10px 14px', cursor: 'pointer', background: isSelected ? 'rgba(33,150,243,0.12)' : 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 3, borderLeft: isSelected ? '3px solid #2196f3' : '3px solid transparent', transition: 'all .12s' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(33,150,243,0.06)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)'; }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#2196f3' : 'var(--text)' }}>{v.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                        {v.plate && <span>ðŸ”¢ {v.plate}</span>}
                        {v.vin && <span style={{ fontFamily: 'monospace' }}>{v.vin.slice(0, 8)}â€¦</span>}
                      </div>
                      {v.status && <span style={{ fontSize: 10, fontWeight: 700, color: '#2196f3', alignSelf: 'flex-start', marginTop: 2 }}>{isSelected ? 'âœ“ Selected' : 'Click to pre-fill â†’'}</span>}
                    </div>
                  );
                })}
                <div onClick={() => setForm(f => ({ ...f, label: '', vin: '', trim: '', engine: '', transmission: '', plate: '' }))}
                  style={{ padding: '10px 14px', cursor: 'pointer', background: (!form.label && !form.vin) ? 'rgba(76,175,80,0.08)' : 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', borderLeft: (!form.label && !form.vin) ? '3px solid #4caf50' : '3px solid transparent', transition: 'all .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(76,175,80,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = (!form.label && !form.vin) ? 'rgba(76,175,80,0.08)' : 'var(--surface)'}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#4caf50' }}>ï¼‹ New vehicle</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fill in the fields below manually</div>
                </div>
              </div>
            </div>
          )}

          {field('label', 'Vehicle (Year Make Model) *', '2023 Ford F-150')}
          <div className="login-field">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>VIN</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: form.vin.length === 17 ? '#22c55e' : form.vin.length > 0 ? '#f59e0b' : 'var(--muted)' }}>{form.vin.length}/17</span>
            </label>
            <input value={form.vin} onChange={e => { const v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 17); setForm(f => ({ ...f, vin: v })); if (vinError) setVinError(''); }} placeholder="1FTFW1E85PFA24680" maxLength={17} style={{ borderColor: vinError ? '#ef4444' : form.vin.length === 17 ? '#22c55e' : undefined, fontFamily: 'monospace', letterSpacing: '0.08em' }} />
            {vinError && <div style={{ marginTop: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>âš  {vinError}</div>}
            {!vinError && form.vin.length > 0 && form.vin.length < 17 && <div style={{ marginTop: 4, fontSize: 11, color: '#f59e0b' }}>{17 - form.vin.length} more needed</div>}
            {!vinError && form.vin.length === 17 && <div style={{ marginTop: 4, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>âœ“ Valid length</div>}
          </div>
          {field('trim', 'Trim', 'XL SuperCrew 4WD')}
          {field('engine', 'Engine', '3.5L EcoBoost')}
          {field('transmission', 'Transmission', '10-speed automatic')}
          {field('mileage', 'Mileage', '48,000')}
          {field('plate', 'Plate', 'ABC-1234')}
          <div className="login-field" style={{ gridColumn: '1 / -1' }}>
            <label>Recommended Service</label>
            <input value={form.recommendation} onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))} placeholder="e.g. Oil change due at 50k" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setShowAddCustomer(false); setCustSearch(''); setCustVehicles([]); }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Savingâ€¦' : editingId ? 'Update Vehicle' : 'Save Vehicle'}</button>
          </div>
        </form>
      )}

      {loading && <p style={{ color: 'var(--muted)', padding: 16 }}>Loading vehiclesâ€¦</p>}
      {error && <p style={{ color: 'var(--danger)', padding: 16 }}>{error}</p>}
      {!loading && vehicles.length === 0 && <p style={{ color: 'var(--muted)', padding: 16 }}>No vehicles yet. Add your first one above.</p>}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* GRID VIEW                                         */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {viewMode === 'grid' && vehicles.length > 0 && (
        <>
          <div className="grid cols-3">
            {vehicles.map(v => (
              <article key={v.id} className="card vehicle-card" style={{ overflow: 'hidden', padding: 0 }}>
                {enableVehiclePhotos && (() => {
                  const photos = thumbs[v.id] ?? [];
                  const count = photos.length;
                  return (
                    <div onClick={() => setGalleryVehicle(v)} style={{ height: 160, cursor: 'pointer', position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)', display: 'flex', background: '#000' }}>
                      {count === 0 && <div style={{ flex: 1, background: 'var(--surface-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)' }}><span style={{ fontSize: 32 }}>ðŸš—</span><span style={{ fontSize: 12 }}>Add photos</span></div>}
                      {count === 1 && <img src={photos[0]} alt="" style={{ flex: 1, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      {count === 2 && (<><img src={photos[0]} alt="" style={{ flex: 1, height: '100%', objectFit: 'cover', display: 'block', borderRight: '2px solid #000' }} /><img src={photos[1]} alt="" style={{ flex: 1, height: '100%', objectFit: 'cover', display: 'block' }} /></>)}
                      {count >= 3 && (<>
                        <img src={photos[0]} alt="" style={{ width: '62%', height: '100%', objectFit: 'cover', display: 'block', flexShrink: 0, borderRight: '2px solid #000' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {photos.slice(1, 5).map((url, i, arr) => (
                            <div key={i} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              {i === arr.length - 1 && count > 5 && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>+{count - 4} more</div>}
                            </div>
                          ))}
                        </div>
                      </>)}
                      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 6, pointerEvents: 'none' }}>ðŸ“· {count > 0 ? `${count} photo${count !== 1 ? 's' : ''}` : 'Photos'}</div>
                    </div>
                  );
                })()}
                <div style={{ padding: 14 }}>
                  <div className="vehicle-title">
                    <div><strong>{v.label}</strong><span className="meta">{v.trim}</span></div>
                    <Badge text={v.status || 'No open jobs'} />
                  </div>
                  <div className="kv" style={{ marginTop: 10 }}>
                    <div><span>VIN</span><strong style={{ fontSize: 11 }}>{v.vin || 'â€”'}</strong></div>
                    <div><span>Mileage</span><strong>{v.mileage || 'â€”'}</strong></div>
                    <div><span>Engine</span><strong>{v.engine || 'â€”'}</strong></div>
                    <div><span>Plate</span><strong>{v.plate || 'â€”'}</strong></div>
                  </div>
                  {v.recommendation && <div className="empty-note" style={{ marginTop: 10 }}>Recommended: {v.recommendation}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }} onClick={() => {
                      const owner = customers.find(c => c.id === v.customerId);
                      dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: v.customerId, vehicle: v.label } });
                    }}>ï¼‹ Job Card</button>
                    {enableVehiclePhotos && <button className="btn" style={{ fontSize: 13 }} onClick={() => setGalleryVehicle(v)}>ðŸ“· Photos</button>}
                    {enableVehicleEdit && <button className="btn" style={{ fontSize: 13 }} onClick={() => {
                      setEditingId(v.id);
                      setForm({ customerId: v.customerId, vin: v.vin, label: v.label, trim: v.trim, engine: v.engine, transmission: v.transmission, mileage: v.mileage, plate: v.plate, status: v.status || 'Active', recommendation: v.recommendation });
                      setVinError('');
                      setShowForm(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>âœ Edit</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <Panel title="Vehicle Service History" hint="Ownership, job cards, repair orders, diagnostics, and recommendations">
            <table>
              <thead>
                <tr><th>Vehicle</th><th>Transmission</th><th>Status</th><th>Recommendation</th><th>Action</th></tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {enableVehiclePhotos && ((thumbs[v.id]?.[0])
                          ? <img src={thumbs[v.id][0]} alt="" style={{ width: 40, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => setGalleryVehicle(v)} />
                          : <div style={{ width: 40, height: 32, borderRadius: 6, background: 'var(--surface-soft)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 16, cursor: 'pointer' }} onClick={() => setGalleryVehicle(v)}>ðŸš—</div>
                        )}
                        <div><strong>{v.label}</strong><div className="meta">{v.plate}</div></div>
                      </div>
                    </td>
                    <td>{v.transmission}</td>
                    <td><Badge text={v.status || 'No open jobs'} /></td>
                    <td>{v.recommendation}</td>
                    <td>
                      <div className="row-actions">
                        {enableVehiclePhotos && <button className="mini-btn" onClick={() => setGalleryVehicle(v)}>ðŸ“· Photos</button>}
                        {role === 'owner' && shops.length > 1 && (
                          <button className="mini-btn" style={{ color: '#2563eb', borderColor: '#93c5fd' }} onClick={() => setTransferTarget(v)}>â‡„ Transfer</button>
                        )}
                        <button className="mini-btn" style={{ color: '#ef4444' }} onClick={() => handleDeleteVehicle(v)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* LIST VIEW                                         */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {viewMode === 'list' && filtered.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {filtered.length} vehicle{filtered.length !== 1 ? 's' : ''} {statusFilter !== 'All' ? `Â· ${statusFilter}` : ''}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)', background: 'var(--surface-soft)' }}>
                {['Vehicle', 'Customer', 'Year Â· Make Â· Model', 'VIN', 'Plate', 'Fuel', 'Status', 'Assigned Tech', 'Received', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} onClick={() => setDrawerVehicle(v)} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {enableVehiclePhotos && (
                        thumbs[v.id]?.[0]
                          ? <img src={thumbs[v.id][0]} alt="" style={{ width: 36, height: 28, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--line)', cursor: 'pointer', flexShrink: 0 }} onClick={e => { e.stopPropagation(); setGalleryVehicle(v); }} />
                          : <div style={{ width: 36, height: 28, borderRadius: 5, background: 'var(--surface-soft)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 14, cursor: 'pointer', flexShrink: 0 }} onClick={e => { e.stopPropagation(); setGalleryVehicle(v); }}>ðŸš—</div>
                      )}
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{v.label}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {(() => { const c = customers.find(cu => cu.id === v.customerId); return c ? <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>â€”</span>; })()}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'â€”'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11 }}>{v.vin || 'â€”'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{v.plate || 'â€”'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>{v.fuelType || 'â€”'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusPill status={v.status} />
                    {['Pending', 'Pending Approval', 'Pending Parts', 'Returned Job'].includes(v.status) && v.recommendation && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.recommendation}>
                        ðŸ“ {v.recommendation}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>
                    {v.assignedTech
                      ? v.assignedTech.split(';').map(t => t.trim()).filter(Boolean).map(t => {
                          const c = techColor(t);
                          return <span key={t} style={{ display: 'inline-block', background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 600, marginRight: 3, marginBottom: 2 }}>{t}</span>;
                        })
                      : <span style={{ color: 'var(--muted)' }}>â€”</span>
                    }
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {v.dateReceived ? new Date(v.dateReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'â€”'}
                  </td>
                  <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {enableVehiclePhotos && <button className="mini-btn" onClick={() => setGalleryVehicle(v)}>ðŸ“·</button>}
                      {role === 'owner' && shops.length > 1 && (
                        <button className="mini-btn" style={{ color: '#2563eb', borderColor: '#93c5fd' }} onClick={() => setTransferTarget(v)}>â‡„ Transfer</button>
                      )}
                      <button className="mini-btn" style={{ color: '#ef4444' }} onClick={() => handleDeleteVehicle(v)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewMode === 'list' && filtered.length === 0 && !loading && (
        <p style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>No vehicles match your filters.</p>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* KANBAN VIEW                                        */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {viewMode === 'kanban' && (
        <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 'max-content', alignItems: 'flex-start' }}>
            {KANBAN_COLUMNS.map(col => {
              const colVehicles = vehicles.filter(v => v.status === col.status || col.extraStatuses.includes(v.status));
              const isDropTarget = kanbanDragOver === col.status;
              return (
                <div
                  key={col.status}
                  onDragOver={e => { e.preventDefault(); setKanbanDragOver(col.status); }}
                  onDragLeave={() => setKanbanDragOver(null)}
                  onDrop={e => {
                    e.preventDefault();
                    if (kanbanDragId) handleKanbanMove(kanbanDragId, col.status);
                    setKanbanDragId(null); setKanbanDragOver(null);
                  }}
                  style={{
                    width: 240, minHeight: 200, borderRadius: 12, overflow: 'hidden',
                    border: isDropTarget ? `2px solid ${col.color}` : `2px solid ${col.border}`,
                    background: isDropTarget ? col.bg : 'var(--surface)',
                    transition: 'border-color .15s, background .15s',
                    boxShadow: isDropTarget ? `0 0 0 3px ${col.border}` : 'none',
                    flexShrink: 0,
                  }}
                >
                  {/* Column header */}
                  <div style={{ background: col.headerBg, borderBottom: `1px solid ${col.border}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{col.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 12, color: col.color, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{col.label}</div>
                    </div>
                    <span style={{ background: col.color, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{colVehicles.length}</span>
                  </div>

                  {/* Cards */}
                  <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colVehicles.length === 0 && (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                        {isDropTarget ? 'ðŸ“¥ Drop here' : 'No vehicles'}
                      </div>
                    )}
                    {colVehicles.map(v => {
                      const owner = customers.find(c => c.id === v.customerId);
                      const thumb = thumbs[v.id]?.[0];
                      return (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={() => setKanbanDragId(v.id)}
                          onDragEnd={() => { setKanbanDragId(null); setKanbanDragOver(null); }}
                          style={{
                            background: kanbanDragId === v.id ? 'rgba(0,0,0,0.04)' : 'var(--surface)',
                            border: `1px solid ${col.border}`,
                            borderRadius: 10, overflow: 'hidden', cursor: 'grab',
                            opacity: kanbanDragId === v.id ? 0.4 : 1,
                            transition: 'opacity .15s, box-shadow .15s',
                            boxShadow: kanbanDragId !== v.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                          }}
                        >
                          {/* Thumbnail */}
                          {enableVehiclePhotos && (
                            <div
                              onClick={() => setGalleryVehicle(v)}
                              style={{ height: 80, background: thumb ? '#000' : col.bg, cursor: 'pointer', overflow: 'hidden', borderBottom: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                            >
                              {thumb
                                ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: 26, opacity: 0.4 }}>ðŸš—</span>
                              }
                              <div style={{ position: 'absolute', bottom: 4, right: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 5 }}>ðŸ“·</div>
                            </div>
                          )}

                          {/* Card body */}
                          <div style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2, lineHeight: 1.3 }}>{v.label}</div>
                            {owner && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>ðŸ‘¤ {owner.name}</div>}
                            {v.plate && <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>ðŸ”¢ {v.plate}</div>}
                            {v.assignedTech && (
                              <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {v.assignedTech.split(';').map(t => t.trim()).filter(Boolean).map(t => {
                                  const c = techColor(t);
                                  return <span key={t} style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{t}</span>;
                                })}
                              </div>
                            )}

                            {/* Linked feature actions */}
                            <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => setDrawerVehicle(v)}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${col.border}`, background: col.bg, color: col.color, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Open â†’
                              </button>
                              <button
                                onClick={() => {
                                  dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: v.customerId, vehicle: v.label } });
                                }}
                                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--accent,#cc0000)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                + Job
                              </button>
                            </div>

                            {/* Move to column dropdown */}
                            <select
                              value=""
                              onChange={e => { if (e.target.value) handleKanbanMove(v.id, e.target.value); }}
                              onClick={e => e.stopPropagation()}
                              style={{ marginTop: 6, width: '100%', padding: '4px 6px', borderRadius: 6, border: `1px solid ${col.border}`, background: 'var(--surface-soft)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
                            >
                              <option value="">Move toâ€¦</option>
                              {KANBAN_COLUMNS.filter(c => c.status !== col.status).map(c => (
                                <option key={c.status} value={c.status}>{c.icon} {c.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}

                    {/* Drop hint when dragging */}
                    {kanbanDragId && kanbanDragOver !== col.status && (
                      <div style={{ border: `2px dashed ${col.border}`, borderRadius: 8, padding: '14px 0', textAlign: 'center', fontSize: 11, color: col.color, opacity: 0.6 }}>
                        Drop here to move
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Drag cards between columns to change status Â· or use the "Move toâ€¦" dropdown on each card</p>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* SERVICE RECORDS VIEW                              */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {viewMode === 'service' && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['In Progress', 'Pending', 'Pending Approval', 'Pending Parts', 'Active', 'Completed', 'Returned Job', 'No open jobs', 'Archived'] as StatusFilter[]).filter(s => counts[s]).map(s => {
              const c = statusColor(s);
              return (
                <div key={s} onClick={() => { setStatusFilter(s); setViewMode('list'); }} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 18px', minWidth: 110, cursor: 'pointer', transition: 'opacity .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{counts[s] ?? 0}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: c.color, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s}</div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && !loading && (
            <p style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>No records match your filters.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtered.map(v => (
              <ServiceRecordCard
                key={v.id}
                v={v}
                thumbUrl={thumbs[v.id]?.[0]}
                onPhotos={() => setGalleryVehicle(v)}
                enablePhotos={enableVehiclePhotos}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
