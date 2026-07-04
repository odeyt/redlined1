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

// Deduplicate vehicle results by id
function dedupe(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.id as string)) return false;
    seen.add(r.id as string);
    return true;
  });
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const shopId = getShopId();
  const results: SearchResult[] = [];

  const baseVehicleCols = 'id, label, vin, plate, make, model, year, status, assigned_tech';

  // ── Vehicles: run separate ilike queries per field, merge & dedupe ──────
  // This avoids the .or() + ilike combo which can fail silently under RLS
  const vehicleSearches = await Promise.allSettled([
    supabase.from('vehicles').select(baseVehicleCols).eq('shop_id', shopId).ilike('plate', `%${q}%`).limit(8),
    supabase.from('vehicles').select(baseVehicleCols).eq('shop_id', shopId).ilike('vin', `%${q}%`).limit(6),
    supabase.from('vehicles').select(baseVehicleCols).eq('shop_id', shopId).ilike('label', `%${q}%`).limit(6),
    supabase.from('vehicles').select(baseVehicleCols).eq('shop_id', shopId).ilike('make', `%${q}%`).limit(4),
    supabase.from('vehicles').select(baseVehicleCols).eq('shop_id', shopId).ilike('model', `%${q}%`).limit(4),
    supabase.from('vehicles').select(baseVehicleCols).eq('shop_id', shopId).ilike('assigned_tech', `%${q}%`).limit(4),
  ]);

  const allVehicleRows: Record<string, unknown>[] = [];
  vehicleSearches.forEach(r => {
    if (r.status === 'fulfilled' && r.value.data) {
      allVehicleRows.push(...(r.value.data as Record<string, unknown>[]));
    }
  });

  // Sort: plate matches first, then VIN, then others
  const deduped = dedupe(allVehicleRows);
  deduped.sort((a, b) => {
    const aPlate = String(a.plate ?? '').toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    const bPlate = String(b.plate ?? '').toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    if (aPlate !== bPlate) return aPlate - bPlate;
    const aVin = String(a.vin ?? '').toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    const bVin = String(b.vin ?? '').toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
    return aVin - bVin;
  });

  deduped.slice(0, 8).forEach(v => {
    results.push({
      type: 'vehicle',
      id: v.id as string,
      title: (v.label as string) || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle',
      subtitle: [
        v.plate ? `Plate: ${v.plate}` : null,
        v.vin   ? `VIN: ${v.vin}`     : null,
        v.assigned_tech ? `Tech: ${v.assigned_tech}` : null,
      ].filter(Boolean).join(' · '),
      badge: (v.status as string) || undefined,
      module: 'vehicles',
    });
  });

  // ── Customers ────────────────────────────────────────────────────────
  await Promise.allSettled([
    supabase.from('customers').select('id, name, phone, email').eq('shop_id', shopId)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`).limit(4)
      .then(({ data }) => {
        (data ?? []).forEach((c: Record<string, unknown>) => results.push({
          type: 'customer',
          id: c.id as string,
          title: c.name as string,
          subtitle: [c.phone, c.email].filter(Boolean).join(' · '),
          module: 'customers',
        }));
      }),

    // ── Job Cards ─────────────────────────────────────────────────────
    supabase.from('job_cards').select('id, customer, vehicle, service_type, status')
      .eq('shop_id', shopId)
      .or(`id.ilike.%${q}%,customer.ilike.%${q}%,vehicle.ilike.%${q}%`)
      .limit(4)
      .then(({ data }) => {
        (data ?? []).forEach((j: Record<string, unknown>) => results.push({
          type: 'job_card',
          id: j.id as string,
          title: j.id as string,
          subtitle: [j.customer, j.vehicle].filter(Boolean).join(' · '),
          badge: j.status as string,
          module: 'job-cards',
        }));
      }),

    // ── Repair Orders ─────────────────────────────────────────────────
    supabase.from('repair_orders').select('id, ro_number, customer_name, vehicle, status')
      .eq('shop_id', shopId)
      .or(`ro_number.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle.ilike.%${q}%`)
      .limit(4)
      .then(({ data }) => {
        (data ?? []).forEach((r: Record<string, unknown>) => results.push({
          type: 'repair_order',
          id: r.id as string,
          title: (r.ro_number as string) || (r.id as string),
          subtitle: [r.customer_name, r.vehicle].filter(Boolean).join(' · '),
          badge: r.status as string,
          module: 'repair-orders',
        }));
      }),

    // ── Invoices ──────────────────────────────────────────────────────
    supabase.from('invoices').select('number, customer, vehicle, status')
      .eq('shop_id', shopId)
      .or(`number.ilike.%${q}%,customer.ilike.%${q}%,vehicle.ilike.%${q}%`)
      .limit(3)
      .then(({ data }) => {
        (data ?? []).forEach((i: Record<string, unknown>) => results.push({
          type: 'invoice',
          id: i.number as string,
          title: i.number as string,
          subtitle: [i.customer, i.vehicle].filter(Boolean).join(' · '),
          badge: i.status as string,
          module: 'invoices',
        }));
      }),
  ]);

  return results;
}
