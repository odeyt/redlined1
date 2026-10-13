/**
 * Customer Portal — Server Component, reached signed out by the customer.
 *
 * Data is fetched server-side with the service role (bypasses RLS), so the
 * scoping below IS the access control: the token resolves to exactly one
 * customer and that customer's shop, and every query is filtered by both.
 * A record carrying this customer's id under another shop is not shown.
 *
 * The token itself is not sent back to the browser in the page data; the
 * client reads it from its own URL when it needs it.
 */
import type { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase-server';
import { signStoredUrls } from '@/lib/storage/signServer';
import { resolvePortalCustomer, logPortalLookupError } from '@/lib/portal/portalToken';
import { PortalClient } from './PortalClient';
import { portalInvoicesFrom, portalEstimatesFrom, portalRepairOrdersFrom } from '@/lib/portal/portalMoney';
import type {
  PortalData, PortalCustomer, PortalShop, PortalVehicle,
  PortalInvoice, PortalEstimate, PortalInspection, PortalRO,
  PortalInspectionItem,
} from '@/services/portalService';

// Per-customer and token-bearing: never cached, never indexed.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ token: string }>;
}

/** Any query error is an outage, not "no data": fail to the not-found page. */
function must<T>(res: { data: T | null; error: { code?: string; message: string } | null }, what: string): T {
  if (res.error) throw Object.assign(new Error(`${what}: ${res.error.message}`), { code: res.error.code });
  return (res.data ?? ([] as unknown as T));
}

export default async function CustomerPortalPage({ params }: Props) {
  const { token } = await params;
  const data = await loadPortal(token);
  return data ? <PortalClient data={data} /> : <NotFound />;
}

/**
 * Everything the page shows, or null. Null for a bad link and for any failure
 * alike — the customer sees the same page; the server log gets the reason
 * (never the token).
 */
async function loadPortal(token: string): Promise<PortalData | null> {
  try {
    const sb = createServerSupabase();

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

    // 2. Everything else, scoped to this customer AND this shop.
    const [custRes, shopRes, settingsRes, vehiclesRes, invoicesRes, estimatesRes, inspectionsRes, roRes] =
      await Promise.all([
        sb.from('customers').select('name').eq('id', customerId).eq('shop_id', shopId).maybeSingle(),
        sb.from('shops').select('name').eq('id', shopId).maybeSingle(),
        sb.from('shop_settings').select('company_name, tagline, phone, email, address, logo_url').eq('shop_id', shopId).maybeSingle(),
        sb.from('vehicles').select('id, year, make, model, license_plate, color, mileage, status').eq('customer_id', customerId).eq('shop_id', shopId).order('year', { ascending: false }),
        sb.from('invoices').select('*').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }),
        sb.from('estimates').select('*').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }),
        sb.from('inspections').select('*').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }),
        sb.from('repair_orders').select('*').eq('customer_id', customerId).eq('shop_id', shopId).order('opened_date', { ascending: false }),
      ]);

    const custData = must(custRes, 'customer') as { name?: string } | null;
    const customer: PortalCustomer = { name: custData?.name ?? '' };
    const invoiceRows = must(invoicesRes, 'invoices') as Record<string, unknown>[];

    // Payments against this customer's invoices, in this shop. invoices.number
    // is the primary key, but the filter does not rely on that.
    const invoiceNumbers = invoiceRows.map(r => r.number as string).filter(Boolean);
    const paymentsRes = invoiceNumbers.length > 0
      ? await sb.from('payments').select('*').in('invoice_number', invoiceNumbers).eq('shop_id', shopId)
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
      year:         r.year          ?? '',
      make:         r.make          ?? '',
      model:        r.model         ?? '',
      licensePlate: r.license_plate ?? '',
      color:        r.color         ?? '',
      mileage:      Number(r.mileage ?? 0),
      status:       r.status        ?? 'Active',
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
    const signed = await signStoredUrls([
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

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, margin: 0 }}>Portal Not Found</h1>
        <p style={{ color: '#666', lineHeight: 1.6, marginTop: 12 }}>
          This link is invalid or has expired. Please contact your shop for a new portal link.
        </p>
      </div>
    </div>
  );
}
