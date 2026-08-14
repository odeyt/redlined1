import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';

export interface Technician {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  specialty: string;
  certifications: string;
  payType: string;
  payRate: number;
  hireDate: string | null;
  status: string;
  notes: string;
  createdAt: string;
  /**
   * Shop this record belongs to. Each location keeps its own technician rows,
   * so with mirroring on the same person appears once per shop — callers need
   * this to show the record for the shop they are working in.
   */
  shopId: string;
  /**
   * The account this person signs in as, or '' when they have no login.
   * Job alerts are addressed through this: an unlinked technician gets none.
   */
  userId: string;
}

export interface TechPerformance {
  techName: string;
  roCount: number;
  completedROCount: number;
  totalLaborHours: number;
  totalLaborValue: number;
  totalPartsValue: number;
  totalValue: number;
  avgHoursPerRO: number;
  openROCount: number;
  jobCardCount: number;
}

export const TECH_ROLES = [
  'Master Technician', 'Senior Technician', 'Technician', 'Apprentice',
  'Service Advisor', 'Shop Foreman', 'Mobile Technician', 'Lube Technician',
  'Tire Technician', 'Alignment Specialist', 'Diagnostics Specialist',
];

export const PAY_TYPES = ['Hourly', 'Flat Rate', 'Commission', 'Salary'];

/**
 * One entry per person for technician pickers.
 *
 * Each shop keeps its own technician rows, so with mirroring enabled the same
 * person is returned once per location. Assignment is stored by NAME across the
 * app (job cards, repair orders, appointments), so duplicates render as two
 * boxes that tick together.
 *
 * The active shop's record wins, so the role shown is the one that applies
 * where the work is being booked — e.g. Wally is "Owner" in one location and
 * "Diagnostics Specialist" in the other.
 *
 * NOT for the Employees roster: those are real per-location records and must
 * stay individually editable. See TechniciansView, which scopes by shop instead.
 */
export function uniqueTechsByPerson(techs: Technician[], activeShopId: string = getShopId()): Technician[] {
  const byName = new Map<string, Technician>();
  for (const t of techs) {
    const key = t.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || (t.shopId === activeShopId && existing.shopId !== activeShopId)) {
      byName.set(key, t);
    }
  }
  return [...byName.values()];
}

export const SPECIALTIES = [
  'General Repair', 'Engine & Drivetrain', 'Electrical / Electronics',
  'Brakes & Suspension', 'Tires & Alignment', 'Diagnostics / Scan Tool',
  'Transmissions', 'AC & Heating', 'Exhaust', 'Bodywork', 'Mobile Service',
  'Fleet / Commercial', 'Performance / Tuning',
];

function mapRow(r: Record<string, unknown>): Technician {
  return {
    id:             r.id as string,
    name:           (r.name as string) || '',
    role:           (r.role as string) || 'Technician',
    phone:          (r.phone as string) || '',
    email:          (r.email as string) || '',
    specialty:      (r.specialty as string) || '',
    certifications: (r.certifications as string) || '',
    payType:        (r.pay_type as string) || 'Hourly',
    payRate:        Number(r.pay_rate ?? 25),
    hireDate:       (r.hire_date as string) || null,
    status:         (r.status as string) || 'Active',
    notes:          (r.notes as string) || '',
    createdAt:      (r.created_at as string) || '',
    shopId:         (r.shop_id as string) || '',
    userId:         (r.user_id as string) || '',
  };
}

export async function fetchTechnicians(activeOnly = false): Promise<Technician[]> {
  let q = supabase
    .from('technicians')
    .select('*')
    .in('shop_id', getShopIds())
    .order('name');
  if (activeOnly) q = q.neq('status', 'Inactive');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

// shopId is omitted: the row is always created in the caller's active shop,
// assigned below from getShopId() rather than passed in.
// userId is optional: a technician added inline from a job card or inspection
// has no login yet, and linking one is a separate deliberate act in Employees.
export async function createTechnician(
  t: Omit<Technician, 'id' | 'createdAt' | 'shopId' | 'userId'> & { userId?: string },
): Promise<Technician> {
  const { data, error } = await supabase
    .from('technicians')
    .insert({
      shop_id: getShopId(),
      name:           t.name,
      role:           t.role,
      phone:          t.phone,
      email:          t.email,
      specialty:      t.specialty,
      certifications: t.certifications,
      pay_type:       t.payType,
      pay_rate:       t.payRate,
      hire_date:      t.hireDate || null,
      status:         t.status,
      notes:          t.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateTechnician(id: string, updates: Partial<Technician>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name          !== undefined) payload.name           = updates.name;
  if (updates.role          !== undefined) payload.role           = updates.role;
  if (updates.phone         !== undefined) payload.phone          = updates.phone;
  if (updates.email         !== undefined) payload.email          = updates.email;
  if (updates.specialty     !== undefined) payload.specialty      = updates.specialty;
  if (updates.certifications!== undefined) payload.certifications = updates.certifications;
  if (updates.payType       !== undefined) payload.pay_type       = updates.payType;
  if (updates.payRate       !== undefined) payload.pay_rate       = updates.payRate;
  if (updates.hireDate      !== undefined) payload.hire_date      = updates.hireDate || null;
  if (updates.status        !== undefined) payload.status         = updates.status;
  if (updates.notes         !== undefined) payload.notes          = updates.notes;
  // Empty string means unlinked in the app; the column is nullable, so it
  // has to go back as NULL rather than an empty uuid.
  if (updates.userId        !== undefined) payload.user_id        = updates.userId || null;
  const { error } = await supabase.from('technicians').update(payload).eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function deleteTechnician(id: string): Promise<void> {
  const { error } = await supabase.from('technicians').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function fetchTechPerformance(): Promise<TechPerformance[]> {
  const shopId = getShopId();
  const [{ data: roData }, { data: jcData }] = await Promise.all([
    supabase.from('repair_orders').select('technician, status, labor_hours, labor_rate, parts_total').eq('shop_id', shopId),
    supabase.from('job_cards').select('technicians, status').eq('shop_id', shopId),
  ]);

  const ros = roData ?? [];
  const jcs = jcData ?? [];

  const nameSet = new Set<string>();
  ros.forEach(r => { if (r.technician) nameSet.add(r.technician); });
  jcs.forEach(j => {
    const techs: string[] = Array.isArray(j.technicians) ? j.technicians : [];
    techs.forEach(t => nameSet.add(t));
  });

  return [...nameSet].sort().map(name => {
    const techROs = ros.filter(r => r.technician === name);
    const techJCs = jcs.filter(j => {
      const techs: string[] = Array.isArray(j.technicians) ? j.technicians : [];
      return techs.includes(name);
    });
    const completedROs = techROs.filter(r => r.status === 'Complete' || r.status === 'Closed');
    const openROs      = techROs.filter(r => r.status !== 'Complete' && r.status !== 'Closed' && r.status !== 'Void');
    const totalHours   = techROs.reduce((s, r) => s + Number(r.labor_hours ?? 0), 0);
    const totalLabor   = techROs.reduce((s, r) => s + Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0), 0);
    const totalParts   = techROs.reduce((s, r) => s + Number(r.parts_total ?? 0), 0);

    return {
      techName:         name,
      roCount:          techROs.length,
      completedROCount: completedROs.length,
      totalLaborHours:  totalHours,
      totalLaborValue:  totalLabor,
      totalPartsValue:  totalParts,
      totalValue:       totalLabor + totalParts,
      avgHoursPerRO:    techROs.length > 0 ? totalHours / techROs.length : 0,
      openROCount:      openROs.length,
      jobCardCount:     techJCs.length,
    };
  });
}

export async function fetchTechOpenROs(techName: string) {
  const { data, error } = await supabase
    .from('repair_orders')
    .select('ro_number, customer_name, vehicle, status, labor_hours, labor_rate, parts_total, opened_date')
    .in('shop_id', getShopIds())
    .eq('technician', techName)
    .not('status', 'in', '("Closed","Void")')
    .order('opened_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    roNumber:     (r.ro_number as string) || '',
    customerName: (r.customer_name as string) || '',
    vehicle:      (r.vehicle as string) || '',
    status:       (r.status as string) || '',
    laborHours:   Number(r.labor_hours ?? 0),
    laborRate:    Number(r.labor_rate ?? 0),
    partsTotal:   Number(r.parts_total ?? 0),
    openedDate:   (r.opened_date as string) || '',
  }));
}
