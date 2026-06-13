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
  const { error } = await supabase.from('inspections').update(payload).eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function deleteInspection(id: string): Promise<void> {
  const { error } = await supabase.from('inspections').delete().eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function nextInspectionNumber(): Promise<string> {
  const { count } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', getShopId());
  return `DVI-${String((count ?? 0) + 1).padStart(4, '0')}`;
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
