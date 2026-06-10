import { supabase } from '@/lib/supabase';

export interface Technician {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  specialty: string;
  certifications: string;
  payType: string;   // Hourly | Flat Rate | Commission
  payRate: number;
  hireDate: string | null;
  status: string;
  notes: string;
  createdAt: string;
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
  };
}

export async function fetchTechnicians(): Promise<Technician[]> {
  const { data, error } = await supabase
    .from('technicians')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createTechnician(t: Omit<Technician, 'id' | 'createdAt'>): Promise<Technician> {
  const { data, error } = await supabase
    .from('technicians')
    .insert({
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
  const { error } = await supabase.from('technicians').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteTechnician(id: string): Promise<void> {
  const { error } = await supabase.from('technicians').delete().eq('id', id);
  if (error) throw error;
}

// Pull performance data by joining repair_orders and job_cards
export async function fetchTechPerformance(): Promise<TechPerformance[]> {
  const [{ data: roData }, { data: jcData }] = await Promise.all([
    supabase.from('repair_orders').select('technician, status, labor_hours, labor_rate, parts_total'),
    supabase.from('job_cards').select('technicians, status'),
  ]);

  const ros = roData ?? [];
  const jcs = jcData ?? [];

  // Gather all tech names
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

// Fetch open ROs assigned to a specific technician
export async function fetchTechOpenROs(techName: string) {
  const { data, error } = await supabase
    .from('repair_orders')
    .select('ro_number, customer_name, vehicle, status, labor_hours, labor_rate, parts_total, opened_date')
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
