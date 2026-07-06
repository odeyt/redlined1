import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export interface InspectionItem {
  id: string;
  category: string;
  name: string;
  status: 'Pass' | 'Attention' | 'Fail' | 'N/A';
  notes: string;
  photoUrl: string;
}

export interface CustomerApproval {
  approvedBy: string;
  approvedAt: string;
  decision: 'approved' | 'partial' | 'declined';
  approvedItems: string[];
  declinedItems: string[];
  customerMessage: string;
}

export interface Inspection {
  id: string;
  inspectionNumber: string;
  jobCardId: string;
  customerName: string;
  customerId: string;
  vehicle: string;
  vin: string;
  mileage: number;
  technician: string;
  status: string;
  items: InspectionItem[];
  notes: string;
  customerEmail: string;
  customerPhone: string;
  createdAt: string;
  completedAt: string | null;
  customerApproval?: CustomerApproval | null;
}

export const INSPECTION_TEMPLATE: Omit<InspectionItem, 'id'>[] = [
  { category: 'Brakes', name: 'Front brake pads', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Brakes', name: 'Rear brake pads', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Brakes', name: 'Front rotors', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Brakes', name: 'Rear rotors', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Brakes', name: 'Brake fluid', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Tires', name: 'Front left tire', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Tires', name: 'Front right tire', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Tires', name: 'Rear left tire', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Tires', name: 'Rear right tire', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Tires', name: 'Tire pressure', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Fluids', name: 'Engine oil', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Fluids', name: 'Coolant', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Fluids', name: 'Transmission fluid', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Fluids', name: 'Power steering fluid', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Fluids', name: 'Windshield washer', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Lights', name: 'Headlights', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Lights', name: 'Tail lights', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Lights', name: 'Brake lights', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Lights', name: 'Turn signals', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Under Hood', name: 'Battery', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Under Hood', name: 'Air filter', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Under Hood', name: 'Belts & hoses', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Under Hood', name: 'Wiper blades', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Suspension', name: 'Shocks / struts', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Suspension', name: 'Tie rods', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Suspension', name: 'Ball joints', status: 'N/A', notes: '', photoUrl: '' },

];

// Intake & outtake items are always appended on top of any template
// (including custom shop templates) so they can never be overridden away.
export const INTAKE_OUTTAKE_ITEMS: Omit<InspectionItem, 'id'>[] = [
  // ── VEHICLE INTAKE ────────────────────────────────────────────────────────
  { category: 'Intake — Exterior', name: 'Body panels & paint (note scratches, dents, chips — photo all 4 sides)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Exterior', name: 'Windshield & glass (rock chips, cracks, stars on all windows)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Exterior', name: 'Wheels & rims (curb rash, scuffs, missing center caps / lug nuts)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Exterior', name: 'Underside / bumpers (low-hanging trim, cracked bumpers, scrape marks)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Exterior', name: 'Lights & lenses (cracked or foggy headlight, taillight, turn signal lenses)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Exterior', name: 'Wiper blades & arms (torn blades, bent or loose arms)', status: 'N/A', notes: '', photoUrl: '' },

  { category: 'Intake — Interior', name: 'Seats & upholstery (tears, burns, major stains — especially driver seat)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Interior', name: 'Dashboard & trim (cracks in dash, loose trim pieces, broken air vents)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Interior', name: 'Floor mats & carpets (missing, heavily soiled, or wet)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Interior', name: 'Odors (smoke, mold, pet, fuel — document any pre-existing smells)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Interior', name: 'Valuables / loose items (note high-value items or ask customer to remove)', status: 'N/A', notes: '', photoUrl: '' },

  { category: 'Intake — Functional', name: 'Mileage & fuel level (record exact odometer reading and fuel gauge)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'Warning lights on dash (Check Engine, ABS, Airbag, TPMS — before touching)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'Windows & mirrors (power windows roll up/down, mirrors adjust)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'Infotainment & radio (screen and sound work, note volume level)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'AC & heater (blower motor works, correct temperature)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'Brake feel & noises (squealing, grinding, or spongy pedal)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'Steering wheel alignment (crooked when straight, pulls left/right)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'Suspension noises (clunks, thumps, or rattles over small bumps)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Intake — Functional', name: 'Key fob & locks (physical key/fob locks and unlocks properly)', status: 'N/A', notes: '', photoUrl: '' },

  // ── VEHICLE OUTTAKE ───────────────────────────────────────────────────────
  { category: 'Outtake — QA Checklist', name: 'Engine bay clear (no forgotten tools in cowl, radiator shroud, battery tray)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Interior / footwells clear (no tools or hardware on floorboards or under seats)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'All fasteners accounted for (no extra bolts or clips left on workbench)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Old parts in trunk (replaced parts placed securely for customer inspection)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Fluid levels topped off (engine oil, coolant, brake fluid, power steering)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Caps secured (oil cap, dipstick, coolant overflow cap tightly closed)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Lug nut torque verified (if wheels were removed — double-check all wheels)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Tire pressure adjusted (all four tires at recommended PSI)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Protection removed (steering wheel cover, seat covers, floor mats used in repair)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'Wipe down complete (no greasy fingerprints on steering wheel, door handles, hood)', status: 'N/A', notes: '', photoUrl: '' },
  { category: 'Outtake — QA Checklist', name: 'All panels closed and latched (hood, trunk, and all doors fully closed)', status: 'N/A', notes: '', photoUrl: '' },
];

function mapRow(r: Record<string, unknown>): Inspection {
  let items: InspectionItem[] = [];
  try {
    const raw = r.items as InspectionItem[];
    items = Array.isArray(raw) ? raw : JSON.parse(raw as unknown as string ?? '[]');
  } catch { items = []; }
  return {
    id: r.id as string,
    inspectionNumber: (r.inspection_number as string) || '',
    jobCardId: (r.job_card_id as string) || '',
    customerName: (r.customer_name as string) || '',
    customerId: (r.customer_id as string) || '',
    vehicle: (r.vehicle as string) || '',
    vin: (r.vin as string) || '',
    mileage: Number(r.mileage ?? 0),
    technician: (r.technician as string) || '',
    status: (r.status as string) || 'In Progress',
    items,
    notes: (r.notes as string) || '',
    customerEmail: (r.customer_email as string) || '',
    customerPhone: (r.customer_phone as string) || '',
    createdAt: (r.created_at as string) || '',
    completedAt: (r.completed_at as string) || null,
    customerApproval: (r.customer_approval as CustomerApproval) || null,
  };
}

export async function fetchInspections(): Promise<Inspection[]> {
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('shop_id', getShopId())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createInspection(ins: Omit<Inspection, 'id' | 'createdAt'>): Promise<Inspection> {
  const { data, error } = await supabase
    .from('inspections')
    .insert({
      shop_id: getShopId(),
      inspection_number: ins.inspectionNumber,
      job_card_id: ins.jobCardId || null,
      customer_name: ins.customerName,
      customer_id: ins.customerId || null,
      vehicle: ins.vehicle,
      vin: ins.vin,
      mileage: ins.mileage,
      technician: ins.technician,
      status: ins.status,
      items: ins.items,
      notes: ins.notes,
      customer_email: ins.customerEmail,
      customer_phone: ins.customerPhone,
      completed_at: ins.completedAt || null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateInspection(id: string, updates: Partial<Inspection>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.items !== undefined) payload.items = updates.items;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.technician !== undefined) payload.technician = updates.technician;
  if (updates.mileage !== undefined) payload.mileage = updates.mileage;
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;
  if (updates.customerEmail !== undefined) payload.customer_email = updates.customerEmail;
  if (updates.customerPhone !== undefined) payload.customer_phone = updates.customerPhone;
  if (updates.vehicle !== undefined) payload.vehicle = updates.vehicle;
  if (updates.vin !== undefined) payload.vin = updates.vin;
  if (updates.customerName !== undefined) payload.customer_name = updates.customerName;
  if (updates.customerId !== undefined) payload.customer_id = updates.customerId || null;
  if (updates.jobCardId !== undefined) payload.job_card_id = updates.jobCardId || null;
  const { error } = await supabase.from('inspections').update(payload).eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function deleteInspection(id: string): Promise<void> {
  const { error } = await supabase.from('inspections').delete().eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export function createInspectionFromTriage(
  session: {
    vehicle: { year: string; make: string; model: string; mileage: string; customerName?: string; customerId?: string };
    categoryId: string | null;
    complaintSummary: string;
    inspectionSuggestions: string[];
    techNotes: { additionalObservations?: string };
  },
  inspectionNumber: string,
): Omit<Inspection, 'id' | 'createdAt'> {
  const categoryLabel = (session.categoryId ?? 'general')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  // Triage-specific items pinned at the top
  const triageItems: InspectionItem[] = session.inspectionSuggestions.map((suggestion, i) => ({
    id: `triage-${i}`,
    category: `${categoryLabel} — Triage Checks`,
    name: suggestion,
    status: 'N/A',
    notes: '',
    photoUrl: '',
  }));

  const templateItems: InspectionItem[] = [
    ...INSPECTION_TEMPLATE,
    ...INTAKE_OUTTAKE_ITEMS,
  ].map((item, i) => ({ ...item, id: `tmpl-${i}` }));

  const vehicle = `${session.vehicle.year} ${session.vehicle.make} ${session.vehicle.model}`.trim();

  return {
    inspectionNumber,
    jobCardId: '',
    customerName: session.vehicle.customerName ?? '',
    customerId: session.vehicle.customerId ?? '',
    vehicle,
    vin: '',
    mileage: Number(session.vehicle.mileage) || 0,
    technician: '',
    status: 'In Progress',
    items: [...triageItems, ...templateItems],
    notes: session.complaintSummary + (session.techNotes.additionalObservations ? `\n\nTech: ${session.techNotes.additionalObservations}` : ''),
    customerEmail: '',
    customerPhone: '',
    completedAt: null,
    customerApproval: null,
  };
}

export async function nextInspectionNumber(): Promise<string> {
  const { data } = await supabase
    .from('inspections')
    .select('inspection_number')
    .order('created_at', { ascending: false })
    .limit(500);
  const nums = (data ?? []).map(r => Number(String(r.inspection_number ?? '').replace('DVI-', '')) || 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `DVI-${String(max + 1).padStart(4, '0')}`;
}

export async function uploadInspectionPhoto(inspectionId: string, itemId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `inspections/${inspectionId}/${itemId}.${ext}`;
  const { error } = await supabase.storage.from('shop-assets').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('shop-assets').getPublicUrl(path);
  return data.publicUrl + '?t=' + Date.now();
}

export const INSPECTION_STATUSES = ['In Progress', 'Completed', 'Needs Approval', 'Void'];
