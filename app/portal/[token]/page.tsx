/**
 * Customer Portal — Server Component
 * Data is fetched server-side using the service_role key (bypasses RLS).
 * The token is never exposed to the browser beyond what the user already knows.
 */
import { createServerSupabase } from '@/lib/supabase-server';
import { signStoredUrls } from '@/lib/storage/signServer';
import { PortalClient } from './PortalClient';
import type {
  PortalData, PortalCustomer, PortalShop, PortalVehicle,
  PortalInvoice, PortalEstimate, PortalInspection, PortalRO,
  PortalLineItem, PortalInspectionItem,
} from '@/services/portalService';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function CustomerPortalPage({ params }: Props) {
  const { token } = await params;

  if (!token) {
    return <NotFound />;
  }

  try {
    const sb = createServerSupabase();

    // 1. Resolve customer by portal_token
    const { data: custData } = await sb
      .from('customers')
      .select('*')
      .eq('portal_token', token)
      .maybeSingle();

    if (!custData) return <NotFound />;

    const customer: PortalCustomer = {
      id:          custData.id,
      name:        custData.name        ?? '',
      phone:       custData.phone       ?? '',
      email:       custData.email       ?? '',
      address:     custData.address     ?? '',
      portalToken: custData.portal_token,
    };

    // 2. Fetch everything in parallel
    const [shopRes, vehiclesRes, invoicesRes, estimatesRes, inspectionsRes, roRes] =
      await Promise.all([
        sb.from('shop_settings').select('*').eq('id', 1).single(),
        sb.from('vehicles').select('*').eq('customer_id', customer.id).order('year', { ascending: false }),
        sb.from('invoices').select('*').eq('customer_id', customer.id).order('date', { ascending: false }),
        sb.from('estimates').select('*').eq('customer_id', customer.id).order('date', { ascending: false }),
        sb.from('inspections').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
        sb.from('repair_orders').select('*').eq('customer_id', customer.id).order('opened_date', { ascending: false }),
      ]);

    const sd = shopRes.data;
    const shop: PortalShop = {
      name:    sd?.company_name ?? 'Auto Shop',
      tagline: sd?.tagline      ?? '',
      phone:   sd?.phone        ?? '',
      email:   sd?.email        ?? '',
      address: sd?.address      ?? '',
      logoUrl: sd?.logo_url     ?? null,
    };

    const vehicles: PortalVehicle[] = (vehiclesRes.data ?? []).map(r => ({
      id:           r.id,
      year:         r.year          ?? '',
      make:         r.make          ?? '',
      model:        r.model         ?? '',
      vin:          r.vin           ?? '',
      licensePlate: r.license_plate ?? '',
      color:        r.color         ?? '',
      mileage:      Number(r.mileage ?? 0),
      status:       r.status        ?? 'Active',
    }));

    const invoices: PortalInvoice[] = (invoicesRes.data ?? []).map(r => {
      const subtotal     = Number(r.subtotal      ?? 0);
      const tax          = Number(r.tax           ?? 0);
      const discount     = Number(r.discount      ?? 0);
      const shopSupplies = Number(r.shop_supplies ?? 0);
      const total        = subtotal + tax - discount + shopSupplies;
      const amountPaid   = Number(r.amount_paid   ?? 0);
      return {
        id: r.id, invoiceNumber: r.invoice_number ?? '', date: r.date ?? '',
        dueDate: r.due_date ?? '', status: r.status ?? '', vehicle: r.vehicle ?? '',
        subtotal, tax, discount, shopSupplies, total, amountPaid,
        balance: Math.max(0, total - amountPaid), notes: r.notes ?? '',
      };
    });

    const estimates: PortalEstimate[] = (estimatesRes.data ?? []).map(r => {
      const lines: PortalLineItem[] = (Array.isArray(r.line_items) ? r.line_items : []).map(
        (li: Record<string, unknown>) => ({
          description: String(li.description ?? li.name ?? ''),
          qty:         Number(li.qty ?? li.quantity ?? 1),
          unitPrice:   Number(li.unit_price ?? li.unitPrice ?? 0),
          total:       Number(li.total ?? 0),
        })
      );
      return {
        id: r.id, estimateNumber: r.estimate_number ?? '', date: r.date ?? '',
        status: r.status ?? '', vehicle: r.vehicle ?? '',
        subtotal: Number(r.subtotal ?? 0), tax: Number(r.tax ?? 0),
        total: Number(r.total ?? 0), notes: r.notes ?? '', lineItems: lines,
      };
    });

    const inspections: PortalInspection[] = (inspectionsRes.data ?? []).map(r => {
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

    const repairOrders: PortalRO[] = (roRes.data ?? []).map(r => ({
      roNumber: r.ro_number ?? '', date: r.opened_date ?? '', status: r.status ?? '',
      vehicle: r.vehicle ?? '', concern: r.concern ?? '', cause: r.cause ?? '',
      correction: r.correction ?? '',
      laborTotal: Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0),
      partsTotal: Number(r.parts_total ?? 0),
      total: Number(r.labor_hours ?? 0) * Number(r.labor_rate ?? 0) + Number(r.parts_total ?? 0),
    }));

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

    const data: PortalData = {
      customer, shop: signedShop, vehicles, invoices, estimates,
      inspections: signedInspections, repairOrders,
    };

    return <PortalClient data={data} />;

  } catch {
    return <NotFound />;
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
