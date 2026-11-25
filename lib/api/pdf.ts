/**
 * API v1 estimate and invoice PDFs (docs/api/PLAN.md phase 5).
 *
 * The same layout the email route attaches (lib/documents/pdf.ts), with three
 * rules of the API's own:
 *
 *   - A Draft carries a large DRAFT stamp and "not issued" line, so a draft a
 *     bot forwards cannot pass for an issued document.
 *   - Totals come from estimateMath / invoiceMath, the screens' arithmetic,
 *     so the PDF agrees with the API's JSON. A line in another currency is
 *     listed in its own currency and left out of the subtotal, as on screen.
 *   - Like the email route, no PDF without the shop's own identity on it
 *     (409 SHOP_IDENTITY_INCOMPLETE), and the trial "REDLINED1" watermark on
 *     the same shops the app puts it on.
 *
 * Nothing here sends anything. The bytes go back to the caller only.
 */
import { NextResponse } from 'next/server';
import { buildPdf } from '@/lib/documents/pdf';
import { loadShopIdentity } from '@/lib/shops/shopIdentityServer';
import { SHOP_IDENTITY_INCOMPLETE } from '@/lib/shops/shopIdentity';
import { getPlanStatus, needsWatermark } from '@/lib/planGate';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { calculateTotals } from '@/lib/domain/invoiceMath';
import type { EstimateRecord } from '@/lib/domain/estimates';
import type { InvoiceRecord } from '@/lib/domain/invoices';
import { ApiError } from './errors';
import { THB_DEFAULT_SHOP_IDS } from './writes';
import type { ApiContext } from './handler';

type PdfInput = Parameters<typeof buildPdf>[0];

function localDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function pdfLines(lines: ReadonlyArray<{ description: string; qty: number; rate: number; currency?: string; note?: string }>, currency: string) {
  return lines.map(l => ({
    description: l.description || '',
    qty: Number(l.qty) || 0,
    rate: Number(l.rate) || 0,
    currency: l.currency || currency,
    note: l.note || '',
  }));
}

/** The layout input for an estimate. Pure. */
export function estimatePdfInput(e: EstimateRecord, shop: ShopHeader, isWatermarked: boolean): PdfInput {
  const currency = e.currency || 'USD';
  const t = calculateEstimateTotals({ currency, lines: e.lines, discount: e.discount, taxRate: e.taxRate });
  return {
    type: 'estimate',
    number: e.estimateNumber,
    customerName: e.customerName || '',
    vehicle: e.vehicle || '',
    date: localDate(e.createdAt),
    lines: pdfLines(e.lines, currency),
    subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
    currency,
    notes: e.notes || '',
    validUntil: localDate(e.validUntil),
    ...shop,
    isWatermarked,
    draftWatermark: e.status === 'Draft',
  };
}

/** The layout input for an invoice. Pure. */
export function invoicePdfInput(inv: InvoiceRecord, shop: ShopHeader, isWatermarked: boolean): PdfInput {
  const currency = inv.currency || 'USD';
  const t = calculateTotals(inv);
  return {
    type: 'invoice',
    number: inv.invoiceNumber,
    customerName: inv.customerName || '',
    vehicle: inv.vehicle || '',
    date: localDate(inv.createdAt),
    lines: pdfLines(inv.lines, currency),
    // Shop supplies are part of an invoice total (calculateTotals); the
    // layout has no row for them, so they sit inside the subtotal shown.
    subtotal: t.subtotal + t.shopSupplies, discount: t.discount, tax: t.tax, total: t.total,
    currency,
    notes: inv.notes || '',
    ...shop,
    isWatermarked,
    draftWatermark: inv.status === 'Draft',
  };
}

export interface ShopHeader {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopEmail: string;
}

/**
 * The shop's name and contact line, refusing as the email route does when
 * the profile is incomplete: a document headed "RedlineD1" must never exist.
 */
export async function shopHeader(ctx: ApiContext, shopId: string): Promise<ShopHeader> {
  const identity = await loadShopIdentity(shopId);
  if (!identity.ready) {
    throw new ApiError('CONFLICT', {
      code: SHOP_IDENTITY_INCOMPLETE,
      reason: 'The shop profile (name, address, phone) is incomplete, so no document can be produced. Complete it in Settings.',
      missing_fields: identity.missingFields,
    });
  }
  const { data: shop } = await ctx.db.from('shops').select('name').eq('id', shopId).maybeSingle();
  const { data: settings } = await ctx.db
    .from('shop_settings').select('address, phone, email').eq('shop_id', shopId).maybeSingle();
  return {
    shopName: (shop?.name as string | undefined) ?? 'My Shop',
    shopAddress: (settings?.address as string | undefined) ?? '',
    shopPhone: (settings?.phone as string | undefined) ?? '',
    shopEmail: (settings?.email as string | undefined) ?? '',
  };
}

/**
 * The trial watermark, decided as the web app decides it (usePlan +
 * needsWatermark): never for the D1 shops; otherwise from the shop owner's
 * plan and trial date. A failed read watermarks, as the app's default
 * status does.
 */
export async function trialWatermark(ctx: ApiContext, shopId: string): Promise<boolean> {
  if (THB_DEFAULT_SHOP_IDS.has(shopId)) return false;
  try {
    const { data: owner } = await ctx.db
      .from('shop_users').select('user_id').eq('shop_id', shopId).eq('role', 'owner').limit(1).maybeSingle();
    if (!owner?.user_id) return true;
    const { data: profile } = await ctx.db
      .from('profiles').select('plan, trial_ends_at').eq('id', owner.user_id).maybeSingle();
    if (!profile) return true;
    return needsWatermark(getPlanStatus(profile.plan ?? null, profile.trial_ends_at ?? null));
  } catch {
    return true;
  }
}

/** A filename that says DRAFT when it is one. Letters, digits and dashes only. */
export function pdfFilename(number: string, isDraft: boolean): string {
  const safe = (number || 'document').replace(/[^A-Za-z0-9-]/g, '');
  return `${safe}${isDraft ? '-DRAFT' : ''}.pdf`;
}

export function pdfResponse(bytes: Uint8Array, filename: string, requestId: string): NextResponse {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}
