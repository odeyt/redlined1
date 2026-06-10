/**
 * portalService.ts
 * All data fetching for the public customer portal (no auth required — uses portal_token).
 */
import { supabase } from '@/lib/supabase';

export interface PortalCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  portalToken: string;
}

export interface PortalVehicle {
  id: string;
  year: string;
  make: string;
  model: string;
  vin: string;
  licensePlate: string;
  color: string;
  mileage: number;
  status: string;
}

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  status: string;
  vehicle: string;
  subtotal: number;
  tax: number;
  discount: number;
  shopSupplies: number;
  total: number;
  amountPaid: number;
  balance: number;
  notes: string;
}

export interface PortalEstimate {
  id: string;
  estimateNumber: string;
  date: string;
  status: string;
  vehicle: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  lineItems: PortalLineItem[];
}

export interface PortalLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface PortalInspection {
  id: string;
  inspectionNumber: string;
  date: string;
  vehicle: string;
  status: string;
  technicianName: string;
  passCount: number;
  attentionCount: number;
  failCount: number;
  notes: string;
  items: PortalInspectionItem[];
}

export interface PortalInspectionItem {
  category: string;
  name: string;
  status: string;
  notes: string;
  photoUrl: string;
}

export interface PortalRO {
  roNumber: string;
  date: string;
  status: string;
  vehicle: string;
  concern: string;
  cause: string;
  correction: string;
  laborTotal: number;
  partsTotal: number;
  total: number;
}

export interface PortalShop {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  logoUrl: string | null;
}

export interface PortalData {
  customer: PortalCustomer;
  shop: PortalShop;
  vehicles: PortalVehicle[];
  invoices: PortalInvoice[];
  estimates: PortalEstimate[];
  inspections: PortalInspection[];
  repairOrders: PortalRO[];
}

/* ─── Fetch all portal data by token ─── */
export async function fetchPortalData(token: string): Promise<PortalData | null> {
  // 1. Look up customer by portal_token
  const { data: custData, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .eq('portal_token', token)
    .maybeSingle();

  if (custErr || !custData) return null;

  const customer: PortalCustomer = {
    id:          custData.id,
    name:        custData.name ?? '',
    phone:       custData.phone ?? '',
    email:       custData.email ?? '',
    address:     custData.address ?? '',
    portalToken: custData.portal_token,
  };

  // 2. Fetch everything in parallel
  const [
    shopRes, vehiclesRes, invoicesRes, estimatesRes, inspectionsRes, roRes,
  ] = await Promise.all([
    supabase.from('shop_settings').select('*').eq('id', 1).single(),
    supabase.from('vehicles').select('*').eq('customer_id', customer.id).order('year', { ascending: false }),
    supabase.from('invoices').select('*').eq('customer_id', customer.id).order('date', { ascending: false }),
    supabase.from('estimates').select('*').eq('customer_id', customer.id).order('date', { ascending: false }),
    supabase.from('inspections').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
    supabase.from('repair_orders').select('*').eq('customer_id', customer.id).order('opened_date', { ascending: false }),
  ]);

  // 3. Map shop settings
  const sd = shopRes.data;
  const shop: PortalShop = {
    name:    sd?.company_name ?? 'Auto Shop',
    tagline: sd?.tagline      ?? '',
    phone:   sd?.phone        ?? '',
    email:   sd?.email        ?? '',
    address: sd?.address      ?? '',
    logoUrl: sd?.logo_url     ?? null,
  };

  // 4. Map vehicles
  const vehicles: PortalVehicle[] = (vehiclesRes.data ?? []).map(r => ({
    id:           r.id,
    year:         r.year ?? '',
    make:         r.make ?? '',
    model:        r.model ?? '',
    vin:          r.vin  ?? '',
    licensePlate: r.license_plate ?? '',
    color:        r.color ?? '',
    mileage:      Number(r.mileage ?? 0),
    status:       r.status ?? 'Active',
  }));

  // 5. Map invoices
  const invoices: PortalInvoice[] = (invoicesRes.data ?? []).map(r => {
    const subtotal     = Number(r.subtotal      ?? 0);
    const tax          = Number(r.tax           ?? 0);
    const discount     = Number(r.discount      ?? 0);
    const shopSupplies = Number(r.shop_supplies ?? 0);
    const total        = subtotal + tax - discount + shopSupplies;
    const amountPaid   = Number(r.amount_paid   ?? 0);
    return {
      id:            r.id,
      invoiceNumber: r.invoice_number ?? '',
      date:          r.date           ?? '',
      dueDate:       r.due_date       ?? '',
      status:        r.status         ?? '',
      vehicle:       r.vehicle        ?? '',
      subtotal, tax, discount, shopSupplies, total,
      amountPaid,
      balance: Math.max(0, total - amountPaid),
      notes:   r.notes ?? '',
    };
  });

  // 6. Map estimates (include line items)
  const estimates: PortalEstimate[] = (estimatesRes.data ?? []).map(r => {
    const lines: PortalLineItem[] = (Array.isArray(r.line_items) ? r.line_items : []).map((li: Record<string, unknown>) => ({
      description: String(li.description ?? li.name ?? ''),
      qty:         Number(li.qty ?? li.quantity ?? 1),
      unitPrice:   Number(li.unit_price ?? li.unitPrice ?? 0),
      total:       Number(li.total ?? 0),
    }));
    return {
      id:             r.id,
      estimateNumber: r.estimate_number ?? '',
      date:           r.date  ?? '',
      status:         r.status ?? '',
      vehicle:        r.vehicle ?? '',
      subtotal:       Number(r.subtotal ?? 0),
      tax:            Number(r.tax      ?? 0),
      total:          Number(r.total    ?? 0),
      notes:          r.notes ?? '',
      lineItems:      lines,
    };
  });

  // 7. Map inspections (include checklist items)
  const inspections: PortalInspection[] = (inspectionsRes.data ?? []).map(r => {
    const items: PortalInspectionItem[] = (Array.isArray(r.items) ? r.items : []).map((it: Record<string, unknown>) => ({
      category: String(it.category ?? ''),
      name:     String(it.name     ?? ''),
      status:   String(it.status   ?? ''),
      notes:    String(it.notes    ?? ''),
      photoUrl: String(it.photo_url ?? it.photoUrl ?? ''),
    }));
    const passCount      = items.filter(i => i.status === 'Pass').length;
    const attentionCount = items.filter(i => i.status === 'Attention').length;
    const failCount      = items.filter(i => i.status === 'Fail').length;
    return {
      id:               r.id,
      inspectionNumber: r.inspection_number ?? '',
      date:             r.created_at        ?? '',
      vehicle:          r.vehicle           ?? '',
      status:           r.status            ?? '',
      technicianName:   r.technician_name   ?? '',
      passCount, attentionCount, failCount,
      notes:            r.notes ?? '',
      items,
    };
  });

  // 8. Map repair orders
  const repairOrders: PortalRO[] = (roRes.data ?? []).map(r => ({
    roNumber:   r.ro_number    ?? '',
    date:       r.opened_date  ?? '',
    status:     r.status       ?? '',
    vehicle:    r.vehicle      ?? '',
    concern:    r.concern      ?? '',
    cause:      r.cause        ?? '',
    correction: r.correction   ?? '',
    laborTotal: Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0),
    partsTotal: Number(r.parts_total ?? 0),
    total:      Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0) + Number(r.parts_total ?? 0),
  }));

  return { customer, shop, vehicles, invoices, estimates, inspections, repairOrders };
}

/* ─── Estimate approval / decline (customer action) ─── */
export async function customerApproveEstimate(estimateId: string): Promise<void> {
  const { error } = await supabase
    .from('estimates')
    .update({ status: 'Approved' })
    .eq('id', estimateId);
  if (error) throw error;
}

export async function customerDeclineEstimate(estimateId: string): Promise<void> {
  const { error } = await supabase
    .from('estimates')
    .update({ status: 'Declined' })
    .eq('id', estimateId);
  if (error) throw error;
}
