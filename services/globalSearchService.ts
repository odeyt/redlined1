import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export type SearchResultType = 'vehicle' | 'customer' | 'job_card' | 'repair_order' | 'invoice';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  module: string;
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const shopId = getShopId();
  const results: SearchResult[] = [];

  await Promise.allSettled([

    // ── Vehicles: VIN, plate, label, make, model, assigned_tech ────────────
    supabase
      .from('vehicles')
      .select('id, label, vin, plate, make, model, year, status, assigned_tech, issues')
      .eq('shop_id', shopId)
      .or([
        `vin.ilike.%${q}%`,
        `plate.ilike.%${q}%`,
        `label.ilike.%${q}%`,
        `make.ilike.%${q}%`,
        `model.ilike.%${q}%`,
        `assigned_tech.ilike.%${q}%`,
        `issues.ilike.%${q}%`,
      ].join(','))
      .limit(8)
      .then(({ data }) => {
        (data ?? []).forEach(v => {
          const vinMatch = v.vin && v.vin.toUpperCase().includes(q.toUpperCase());
          const plateMatch = v.plate && v.plate.toUpperCase().includes(q.toUpperCase());
          results.push({
            type: 'vehicle',
            id: v.id,
            title: v.label || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle',
            subtitle: [
              v.vin   ? `VIN: ${v.vin}` : null,
              v.plate ? `Plate: ${v.plate}` : null,
              v.assigned_tech ? `Tech: ${v.assigned_tech}` : null,
            ].filter(Boolean).join(' · '),
            badge: v.status || undefined,
            module: 'vehicles',
          });
        });
      }),

    // ── Customers: name, phone, email ────────────────────────────────────
    supabase
      .from('customers')
      .select('id, name, phone, email')
      .eq('shop_id', shopId)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(4)
      .then(({ data }) => {
        (data ?? []).forEach(c => {
          results.push({
            type: 'customer',
            id: c.id,
            title: c.name,
            subtitle: [c.phone, c.email].filter(Boolean).join(' · '),
            module: 'customers',
          });
        });
      }),

    // ── Job Cards: customer, vehicle, service_type ───────────────────────
    // Real columns: id, customer, vehicle, service_type, status
    supabase
      .from('job_cards')
      .select('id, customer, vehicle, service_type, status')
      .eq('shop_id', shopId)
      .or(`id.ilike.%${q}%,customer.ilike.%${q}%,vehicle.ilike.%${q}%,service_type.ilike.%${q}%`)
      .limit(4)
      .then(({ data }) => {
        (data ?? []).forEach(j => {
          results.push({
            type: 'job_card',
            id: j.id,
            title: j.id,
            subtitle: [j.customer, j.vehicle].filter(Boolean).join(' · '),
            badge: j.status,
            module: 'job-cards',
          });
        });
      }),

    // ── Repair Orders: ro_number, customer_name, vehicle ────────────────
    supabase
      .from('repair_orders')
      .select('id, ro_number, customer_name, vehicle, status')
      .eq('shop_id', shopId)
      .or(`ro_number.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle.ilike.%${q}%`)
      .limit(4)
      .then(({ data }) => {
        (data ?? []).forEach(r => {
          results.push({
            type: 'repair_order',
            id: r.id,
            title: r.ro_number || r.id,
            subtitle: [r.customer_name, r.vehicle].filter(Boolean).join(' · '),
            badge: r.status,
            module: 'repair-orders',
          });
        });
      }),

    // ── Invoices: number (PK), customer, vehicle ─────────────────────────
    supabase
      .from('invoices')
      .select('number, customer, vehicle, status')
      .eq('shop_id', shopId)
      .or(`number.ilike.%${q}%,customer.ilike.%${q}%,vehicle.ilike.%${q}%`)
      .limit(3)
      .then(({ data }) => {
        (data ?? []).forEach(i => {
          results.push({
            type: 'invoice',
            id: i.number,
            title: i.number,
            subtitle: [i.customer, i.vehicle].filter(Boolean).join(' · '),
            badge: i.status,
            module: 'invoices',
          });
        });
      }),

  ]);

  // Sort: VIN / plate vehicle matches first, then by type order
  const typeOrder: Record<SearchResultType, number> = {
    vehicle: 0, customer: 1, job_card: 2, repair_order: 3, invoice: 4,
  };

  results.sort((a, b) => {
    const aVinPlate = a.type === 'vehicle' && (
      a.subtitle.includes('VIN:') || a.subtitle.includes('Plate:')
    ) ? 0 : 1;
    const bVinPlate = b.type === 'vehicle' && (
      b.subtitle.includes('VIN:') || b.subtitle.includes('Plate:')
    ) ? 0 : 1;
    if (aVinPlate !== bVinPlate) return aVinPlate - bVinPlate;
    return typeOrder[a.type] - typeOrder[b.type];
  });

  return results;
}
