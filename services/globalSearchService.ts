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

function isVinLike(q: string): boolean {
  return q.length >= 5 && /^[A-Z0-9]+$/i.test(q.replace(/\s/g, ''));
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const shopId = getShopId();
  const upper = q.toUpperCase();
  const results: SearchResult[] = [];

  // ── Vehicles (VIN, plate, label, make, model, assigned_tech) ─────────
  const vehicleFilters = [
    `vin.ilike.%${q}%`,
    `plate.ilike.%${q}%`,
    `label.ilike.%${q}%`,
    `make.ilike.%${q}%`,
    `model.ilike.%${q}%`,
    `assigned_tech.ilike.%${q}%`,
  ];
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, label, vin, plate, make, model, year, status, assigned_tech')
    .eq('shop_id', shopId)
    .or(vehicleFilters.join(','))
    .limit(6);

  (vehicles ?? []).forEach(v => {
    const vinMatch = v.vin && v.vin.toUpperCase().includes(upper);
    results.push({
      type: 'vehicle',
      id: v.id,
      title: v.label || [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle',
      subtitle: [
        v.vin ? `VIN: ${v.vin}` : null,
        v.plate ? `Plate: ${v.plate}` : null,
        v.assigned_tech ? `Tech: ${v.assigned_tech}` : null,
      ].filter(Boolean).join(' · '),
      badge: v.status || undefined,
      module: 'vehicles',
    });
    // Boost VIN matches to top by duplicating them with a priority flag
    if (vinMatch) results[results.length - 1].badge = v.status || 'VIN Match';
  });

  // ── Customers ─────────────────────────────────────────────────────────
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, email')
    .eq('shop_id', shopId)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(4);

  (customers ?? []).forEach(c => {
    results.push({
      type: 'customer',
      id: c.id,
      title: c.name,
      subtitle: [c.phone, c.email].filter(Boolean).join(' · '),
      module: 'customers',
    });
  });

  // ── Job Cards ─────────────────────────────────────────────────────────
  const { data: jobCards } = await supabase
    .from('job_cards')
    .select('id, job_number, customer_name, vehicle, status')
    .eq('shop_id', shopId)
    .or(`job_number.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle.ilike.%${q}%`)
    .limit(4);

  (jobCards ?? []).forEach(j => {
    results.push({
      type: 'job_card',
      id: j.id,
      title: j.job_number || j.id,
      subtitle: [j.customer_name, j.vehicle].filter(Boolean).join(' · '),
      badge: j.status,
      module: 'job-cards',
    });
  });

  // ── Repair Orders ─────────────────────────────────────────────────────
  const { data: ros } = await supabase
    .from('repair_orders')
    .select('id, ro_number, customer_name, vehicle, status, vin')
    .eq('shop_id', shopId)
    .or(`ro_number.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle.ilike.%${q}%,vin.ilike.%${q}%`)
    .limit(4);

  (ros ?? []).forEach(r => {
    results.push({
      type: 'repair_order',
      id: r.id,
      title: r.ro_number || r.id,
      subtitle: [r.customer_name, r.vehicle, r.vin ? `VIN: ${r.vin}` : null].filter(Boolean).join(' · '),
      badge: r.status,
      module: 'repair-orders',
    });
  });

  // ── Invoices ──────────────────────────────────────────────────────────
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, customer_name, vehicle, status')
    .eq('shop_id', shopId)
    .or(`invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle.ilike.%${q}%`)
    .limit(3);

  (invoices ?? []).forEach(i => {
    results.push({
      type: 'invoice',
      id: i.id,
      title: i.invoice_number || i.id,
      subtitle: [i.customer_name, i.vehicle].filter(Boolean).join(' · '),
      badge: i.status,
      module: 'invoices',
    });
  });

  // VIN-like queries: sort vehicle VIN matches to top
  if (isVinLike(q)) {
    results.sort((a, b) => {
      const aVin = a.type === 'vehicle' && a.subtitle.includes('VIN:') ? 0 : 1;
      const bVin = b.type === 'vehicle' && b.subtitle.includes('VIN:') ? 0 : 1;
      return aVin - bVin;
    });
  }

  return results;
}
