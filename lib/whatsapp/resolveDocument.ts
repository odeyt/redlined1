/**
 * Resolves the document a WhatsApp message is about — and its recipient —
 * entirely server-side, inside the merged D1 Imports scope.
 *
 * The caller sends only (resourceType, resourceId). Everything in the message
 * comes from the database: recipient phone, customer name, vehicle, number and
 * the TOTAL (computed with the same pure functions the staff screens use,
 * lib/domain/invoiceMath.ts and estimateMath.ts). Unlike /api/send-message,
 * nothing customer-facing is caller-supplied.
 *
 * Scope: `scope` is mergedShopScope(connectionShop) — the active merged shop
 * plus the archived D1 Imports shop folded into it. Every query is filtered by
 * it, so a historical D1 invoice resolves exactly like a new one, and a
 * document of any other shop is "not found".
 *
 * Column names are production's (lib/portal/__tests__/fixtures/
 * productionSchema.ts, plus job_cards columns read by the live job-status
 * route). The tests run this against a fake that rejects any other column.
 */
import { getEffectiveTotal, mapInvoiceRow } from '@/lib/domain/invoiceMath';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { formatMoney } from '@/lib/currencies';

export type ResourceType = 'estimate' | 'invoice' | 'job';

export interface ResolvedDocument {
  resourceType: ResourceType;
  resourceId: string;
  resourceShopId: string;
  number: string;
  vehicle: string;
  customerId: string | null;
  customerShopId: string | null;
  customerName: string;
  phoneRaw: string | null;
  /** Estimate/invoice only. */
  totalText: string | null;
  /** Job only. */
  repairStage: string | null;
  /** Content fingerprint for duplicate prevention: changes when what the customer would see changes. */
  fingerprint: string;
}

export type ResolveResult =
  | { ok: true; doc: ResolvedDocument }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'db_error'; error: unknown };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from(table: string): any };

const ESTIMATE_COLUMNS = 'id, estimate_number, customer_id, customer_name, currency, lines, discount, tax_rate, status, vehicle, shop_id';
const INVOICE_COLUMNS = 'number, customer, customer_id, currency, lines, discount, shop_supplies, tax_rate, status, vehicle, shop_id, due_date, notes, paid_date, created_at, job_card, repair_order_id';
const JOB_COLUMNS = 'id, customer, vehicle, customer_phone, repair_stage, status, shop_id';

function money(amount: number, currency: string): string {
  return formatMoney(Math.round(amount * 100) / 100, currency || 'USD');
}

async function customerIn(db: Db, scope: readonly string[], customerId: string | null) {
  if (!customerId) return { ok: true as const, row: null };
  const { data, error } = await db.from('customers').select('id, name, phone, shop_id').eq('id', customerId).in('shop_id', scope as string[]).maybeSingle();
  if (error) return { ok: false as const, error };
  return { ok: true as const, row: data as { id: string; name: string | null; phone: string | null; shop_id: string } | null };
}

export async function resolveDocument(db: Db, scope: readonly string[], resourceType: ResourceType, resourceId: string): Promise<ResolveResult> {
  if (!scope.length || !resourceId) return { ok: false, reason: 'not_found' };

  if (resourceType === 'estimate') {
    const { data: e, error } = await db.from('estimates').select(ESTIMATE_COLUMNS).eq('id', resourceId).in('shop_id', scope as string[]).maybeSingle();
    if (error) return { ok: false, reason: 'db_error', error };
    if (!e) return { ok: false, reason: 'not_found' };
    const cust = await customerIn(db, scope, e.customer_id ?? null);
    if (!cust.ok) return { ok: false, reason: 'db_error', error: cust.error };
    const lines = Array.isArray(e.lines) ? e.lines : [];
    const totals = calculateEstimateTotals({
      currency: e.currency || 'USD',
      lines: lines.map((l: any) => ({ qty: Number(l?.qty ?? 0), rate: Number(l?.rate ?? 0), currency: l?.currency })),
      discount: Number(e.discount ?? 0),
      taxRate: Number(e.tax_rate ?? 0),
    });
    const totalText = money(totals.total, e.currency || 'USD');
    return {
      ok: true,
      doc: {
        resourceType, resourceId, resourceShopId: e.shop_id,
        number: e.estimate_number || e.id,
        vehicle: e.vehicle || '',
        customerId: cust.row?.id ?? null,
        customerShopId: cust.row?.shop_id ?? null,
        customerName: cust.row?.name || e.customer_name || '',
        phoneRaw: cust.row?.phone ?? null,
        totalText,
        repairStage: null,
        fingerprint: `${e.status}|${totalText}`,
      },
    };
  }

  if (resourceType === 'invoice') {
    const { data: r, error } = await db.from('invoices').select(INVOICE_COLUMNS).eq('number', resourceId).in('shop_id', scope as string[]).maybeSingle();
    if (error) return { ok: false, reason: 'db_error', error };
    if (!r) return { ok: false, reason: 'not_found' };
    const cust = await customerIn(db, scope, r.customer_id ?? null);
    if (!cust.ok) return { ok: false, reason: 'db_error', error: cust.error };
    const inv = mapInvoiceRow(r);
    const eff = getEffectiveTotal(inv);
    const totalText = money(eff.amount, eff.currency);
    return {
      ok: true,
      doc: {
        resourceType, resourceId, resourceShopId: r.shop_id,
        number: inv.invoiceNumber,
        vehicle: inv.vehicle,
        customerId: cust.row?.id ?? null,
        customerShopId: cust.row?.shop_id ?? null,
        customerName: cust.row?.name || inv.customerName || '',
        phoneRaw: cust.row?.phone ?? null,
        totalText,
        repairStage: null,
        fingerprint: `${inv.status}|${totalText}`,
      },
    };
  }

  // Job card. job_cards has no customer_id column; the linked repair order
  // carries it. A customer record's phone wins over the phone typed on the
  // job card, matching how estimates and invoices resolve.
  const { data: j, error } = await db.from('job_cards').select(JOB_COLUMNS).eq('id', resourceId).in('shop_id', scope as string[]).maybeSingle();
  if (error) return { ok: false, reason: 'db_error', error };
  if (!j) return { ok: false, reason: 'not_found' };
  const { data: ros, error: roErr } = await db.from('repair_orders').select('customer_id').eq('job_card_id', resourceId).in('shop_id', scope as string[]).limit(1);
  if (roErr) return { ok: false, reason: 'db_error', error: roErr };
  const customerId = (Array.isArray(ros) && ros[0]?.customer_id) || null;
  const cust = await customerIn(db, scope, customerId);
  if (!cust.ok) return { ok: false, reason: 'db_error', error: cust.error };
  const stage = j.repair_stage || 'checked_in';
  return {
    ok: true,
    doc: {
      resourceType, resourceId, resourceShopId: j.shop_id,
      number: j.id,
      vehicle: j.vehicle || '',
      customerId: cust.row?.id ?? null,
      customerShopId: cust.row?.shop_id ?? null,
      customerName: cust.row?.name || j.customer || '',
      phoneRaw: cust.row?.phone || j.customer_phone || null,
      totalText: null,
      repairStage: stage,
      fingerprint: `stage:${stage}`,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
