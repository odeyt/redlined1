/**
 * portalService.ts
 * Types for the public customer portal, and the customer's estimate actions.
 *
 * The portal's data is loaded server-side in app/portal/[token]/page.tsx and
 * mapped by lib/portal/portalMoney.ts. A second, browser-side copy of that
 * loader used to live here; nothing called it and it had drifted.
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

/** No VIN: the portal is reached by a shareable link, and VIN is shop-private. */
export interface PortalVehicle {
  id: string;
  year: string;
  make: string;
  model: string;
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
  currency: string;
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
  currency: string;
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
  currency: string;
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
  currency: string;
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
