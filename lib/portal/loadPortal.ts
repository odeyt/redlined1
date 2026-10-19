/**
 * Everything the customer portal page shows, loaded server-side.
 *
 * Moved out of app/portal/[token]/page.tsx unchanged in behaviour — except
 * the vehicles query — so the tests run this exact code against a client that
 * enforces production's real columns. That is the check that would have
 * caught #85's bug: it selected vehicles.license_plate and vehicles.color,
 * which do not exist (production has `plate`, and no colour column), so the
 * query failed with 42703 and every valid link showed "Portal Not Found".
 *
 * The scoping here IS the access control (the client is the service role):
 * the token resolves to exactly one customer and their shop, and every query
 * is filtered by the customer's id AND a shop in their portal scope. Any query
 * error fails closed to null.
 *
 * The portal scope is the customer's own shop plus, across the D1 merge, the
 * shop it was merged into or from (lib/portal/portalScope.ts). Documents,
 * vehicles and payments are read across that scope; the customer row, shop
 * name and branding stay the customer's own shop, as before.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePortalCustomer, logPortalLookupError } from './portalToken';
import { portalShopScope } from './portalScope';
import { portalInvoicesFrom, portalEstimatesFrom, portalRepairOrdersFrom } from './portalMoney';
import type {
  PortalData, PortalCustomer, PortalShop, PortalVehicle,
  PortalInvoice, PortalEstimate, PortalInspection, PortalRO,
  PortalInspectionItem,
} from '@/services/portalService';

/** Signs stored URLs for a viewer with no session (lib/storage/signServer). */
export type UrlSigner = (values: Array<string | null | undefined>) => Promise<Map<string, string>>;

/**
 * Vehicle columns the portal reads, by their production names. Kept explicit
 * (not '*') so a vehicle's VIN is never fetched for a shareable page.
 */
export const PORTAL_VEHICLE_COLUMNS = 'id, label, year, make, model, plate, mileage, status';

/** Any query error is an outage, not "no data": fail to the not-found page. */
function must<T>(res: { data: T | null; error: { code?: string; message: string } | null }, what: string): T {
  if (res.error) throw Object.assign(new Error(`${what}: ${res.error.message}`), { code: res.error.code });
  return (res.data ?? ([] as unknown as T));
}

/**
 * Null for a bad link and for any failure alike — the customer sees the same
 * page; the server log gets the reason (never the token).
 */
export async function loadPortal(sb: SupabaseClient, token: string, sign: UrlSigner): Promise<PortalData | null> {
  try {
    // 1. Token → one customer and their shop. Malformed and unknown tokens
    //    are indistinguishable from here on.
    let ref;
    try {
      ref = await resolvePortalCustomer(sb, token);
    } catch (e) {
      logPortalLookupError('portal page', e);
      return null;
    }
    if (!ref) return null;
    const { id: customerId, shopId } = ref;

    // 2. The shops this customer's records may live in since the merge.
    //    Fails closed to [shopId] on any error.
    const scope = await portalShopScope(sb, shopId);

    // 3. Everything else, scoped to this customer AND that scope.
    const [custRes, shopRes, settingsRes, vehiclesRes, invoicesRes, estimatesRes, inspectionsRes, roRes] =
      await Promise.all([
        sb.from('customers').select('name').eq('id', customerId).eq('shop_id', shopId).maybeSingle(),
        sb.from('shops').select('name').eq('id', shopId).maybeSingle(),
        sb.from('shop_settings').select('company_name, tagline, phone, email, address, logo_url').eq('shop_id', shopId).maybeSingle(),
        sb.from('vehicles').select(PORTAL_VEHICLE_COLUMNS).eq('customer_id', customerId).in('shop_id', scope).order('year', { ascending: false }),
        sb.from('invoices').select('*').eq('customer_id', customerId).in('shop_id', scope).order('created_at', { ascending: false }),
        sb.from('estimates').select('*').eq('customer_id', customerId).in('shop_id', scope).order('created_at', { ascending: false }),
        sb.from('inspections').select('*').eq('customer_id', customerId).in('shop_id', scope).order('created_at', { ascending: false }),
        sb.from('repair_orders').select('*').eq('customer_id', customerId).in('shop_id', scope).order('opened_date', { ascending: false }),
      ]);

    const custData = must(custRes, 'customer') as { name?: string } | null;
    const customer: PortalCustomer = { name: custData?.name ?? '' };
    const invoiceRows = must(invoicesRes, 'invoices') as Record<string, unknown>[];

    // Payments against this customer's invoices, in the same scope.
    // invoices.number is the primary key, but the filter does not rely on that.
    const invoiceNumbers = invoiceRows.map(r => r.number as string).filter(Boolean);
    const paymentsRes = invoiceNumbers.length > 0
      ? await sb.from('payments').select('*').in('invoice_number', invoiceNumbers).in('shop_id', scope)
      : { data: [], error: null };
    const paymentRows = must(paymentsRes, 'payments') as Record<string, unknown>[];

    const sd = settingsRes.data;
    const shop: PortalShop = {
      name:    sd?.company_name || shopRes.data?.name || 'Auto Shop',
      tagline: sd?.tagline      ?? '',
      phone:   sd?.phone        ?? '',
      email:   sd?.email        ?? '',
      address: sd?.address      ?? '',
      logoUrl: sd?.logo_url     ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Supabase rows, as before
    const vehicles: PortalVehicle[] = (must(vehiclesRes, 'vehicles') as Record<string, any>[]).map(r => ({
      id:           r.id,
      // Staff name vehicles in `label`; year/make/model are optional and
      // often blank (2026-10-14: a vehicle showed only its plate).
      label:        r.label  ?? '',
      year:         r.year   ?? '',
      make:         r.make   ?? '',
      model:        r.model  ?? '',
      licensePlate: r.plate  ?? '',
      // vehicles has no colour column; the field stays for the client's type.
      color:        '',
      mileage:      Number(r.mileage ?? 0),
      status:       r.status ?? 'Active',
    }));

    const invoices: PortalInvoice[] = portalInvoicesFrom(invoiceRows, paymentRows);
    const estimates: PortalEstimate[] = portalEstimatesFrom(must(estimatesRes, 'estimates') as Record<string, unknown>[]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Supabase rows, as before
    const inspections: PortalInspection[] = (must(inspectionsRes, 'inspections') as Record<string, any>[]).map(r => {
      const items: PortalInspectionItem[] = (Array.isArray(r.items) ? r.items : []).map(
        (it: Record<string, unknown>) => ({
          category: String(it.category ?? ''),
          name:     String(it.name     ?? ''),
          status:   String(it.status   ?? ''),
          notes:    String(it.notes    ?? ''),
          photoUrl: String(it.photo_url ?? it.photoUrl ?? ''),
        })
      );
      return {
        id: r.id, inspectionNumber: r.inspection_number ?? '', date: r.created_at ?? '',
        vehicle: r.vehicle ?? '', status: r.status ?? '', technicianName: r.technician_name ?? '',
        passCount:      items.filter(i => i.status === 'Pass').length,
        attentionCount: items.filter(i => i.status === 'Attention').length,
        failCount:      items.filter(i => i.status === 'Fail').length,
        notes: r.notes ?? '', items,
      };
    });

    const repairOrders: PortalRO[] = portalRepairOrdersFrom(must(roRes, 'repair_orders') as Record<string, unknown>[]);

    // The customer viewing this portal has no session, so the server signs
    // every storage URL on their behalf — the logo plus any inspection photo.
    // One batched call for the whole page. Anything that fails to sign keeps
    // its stored URL rather than disappearing from the report.
    const signed = await sign([
      shop.logoUrl,
      ...inspections.flatMap(i => i.items.map(it => it.photoUrl)),
    ]);
    const signedShop: PortalShop = {
      ...shop,
      logoUrl: shop.logoUrl ? (signed.get(shop.logoUrl) ?? shop.logoUrl) : null,
    };
    const signedInspections: PortalInspection[] = inspections.map(i => ({
      ...i,
      items: i.items.map(it =>
        it.photoUrl ? { ...it, photoUrl: signed.get(it.photoUrl) ?? it.photoUrl } : it,
      ),
    }));

    return {
      customer, shop: signedShop, vehicles, invoices, estimates,
      inspections: signedInspections, repairOrders,
    };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    console.error('[portal page] load failed', { code: err.code, message: err.message });
    return null;
  }
}
