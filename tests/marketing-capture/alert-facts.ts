/**
 * Collects the facts the alert and push gates judge. READ-ONLY.
 *
 * Every query is a SELECT (or a HEAD count) through the service-role client.
 * Judgement lives in lib/marketing-capture/alertStartGates.ts and
 * alertFinishGates.ts. Any query error becomes null, which every gate treats as
 * a failure.
 *
 * pg_net's queue, responses and sequences are not reachable through this
 * client; OWNER START SQL and OWNER FINISH SQL cover them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { functionBody, roAlertModelFromSource, PINNED_FUNCTIONS } from '@/lib/marketing-capture/alertExpectation';
import type { AlertRow, AlertFinishFacts, AlertProgressFacts, StatusEventRow } from '@/lib/marketing-capture/alertFinishGates';
import type { AlertStartFacts, InvoiceSnapshot, JobCardSnapshot } from '@/lib/marketing-capture/alertStartGates';
import { DEMO } from '@/lib/marketing-capture/gates';
import { PRODUCTION_REF } from '../helpers/db-target';

const SUPABASE_URL = `https://${PRODUCTION_REF}.supabase.co`;
const CONTACT_COLUMN = /(^|_)(phone|mobile|email|whatsapp|line_id|telegram)(_|$)/i;

function admin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('[marketing-capture] SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** The RO alert model from the repository's own trigger source. */
export function sourceModel() {
  const root = join(__dirname, '..', '..');
  const file = (name: string) => PINNED_FUNCTIONS.find(f => f.name === name)!.file;
  const sc = functionBody(readFileSync(join(root, file('alert_ro_status_changed')), 'utf8'), 'alert_ro_status_changed');
  const pa = functionBody(readFileSync(join(root, file('alert_ro_pending_approval')), 'utf8'), 'alert_ro_pending_approval');
  return sc && pa ? roAlertModelFromSource(sc, pa) : null;
}

/**
 * Every live table with a shop_id and a text contact-like column, from the
 * OpenAPI description (a GET), then a count of non-empty values in the demo
 * shop for each. null if the schema or any count cannot be read.
 */
async function scanContacts(db: SupabaseClient, shopId: string): Promise<AlertStartFacts['contactValues']> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) return null;
  const spec = await res.json() as { definitions?: Record<string, { properties?: Record<string, { format?: string }> }> };
  const out: { table: string; column: string; count: number }[] = [];
  for (const [table, def] of Object.entries(spec.definitions ?? {})) {
    const props = def.properties ?? {};
    if (!('shop_id' in props)) continue;
    for (const [column, p] of Object.entries(props)) {
      if (!CONTACT_COLUMN.test(column) || !/^(text|character varying)$/.test(p.format ?? '')) continue;
      const r = await db.from(table).select('shop_id', { count: 'exact', head: true })
        .eq('shop_id', shopId).not(column, 'is', null).neq(column, '');
      if (r.error || r.count === null) return null;
      out.push({ table, column, count: r.count });
    }
  }
  return out;
}

export async function collectAlertStartFacts(shopId: string, sessionUserId: string | null, ledgerSelfTest: string[] | null): Promise<AlertStartFacts> {
  const db = admin();
  const f: AlertStartFacts = {
    demoShopId: shopId, sessionUserId, repairOrderId: null, demoAlertIds: null, allShopAlertCount: null,
    demoStatusEventIds: null, jobCardAuditRows: null, laborGuide: null, demoInvoiceCount: null, invoice: null,
    jobCard: null, linkedTechnicians: null, contactValues: null, sourceModel: sourceModel(), ledgerSelfTest,
  };

  const ro = await db.from('repair_orders').select('id').eq('shop_id', shopId).eq('ro_number', DEMO.roNumber).maybeSingle();
  if (!ro.error && ro.data) f.repairOrderId = String(ro.data.id);

  const all = await db.from('alert_events').select('id', { count: 'exact', head: true });
  if (!all.error) f.allShopAlertCount = all.count;
  const alerts = await db.from('alert_events').select('id').eq('shop_id', shopId);
  if (!alerts.error) f.demoAlertIds = (alerts.data ?? []).map(r => String(r.id));
  const status = await db.from('ro_status_events').select('id').eq('shop_id', shopId);
  if (!status.error) f.demoStatusEventIds = (status.data ?? []).map(r => String(r.id));

  f.jobCard = await readJobCard(db, shopId);
  if (f.jobCard) f.jobCardAuditRows = await countJobCardAudit(db, shopId, f.jobCard.id);
  f.laborGuide = await readLaborGuide(db, shopId);
  f.invoice = await readInvoice(db, shopId);
  f.demoInvoiceCount = await countInvoices(db, shopId);

  const linked = await db.from('technicians').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).not('user_id', 'is', null);
  if (!linked.error) f.linkedTechnicians = linked.count;

  f.contactValues = await scanContacts(db, shopId);
  return f;
}

async function readJobCard(db: SupabaseClient, shopId: string): Promise<JobCardSnapshot | null> {
  const jc = await db.from('job_cards').select('id, status, technicians, service_type, notes, labor_hours, parts_total')
    .eq('shop_id', shopId).eq('customer', DEMO.customer).eq('vehicle', DEMO.vehicleLabel).maybeSingle();
  if (jc.error || !jc.data) return null;
  const d = jc.data;
  return {
    id: String(d.id), status: d.status, technicians: Array.isArray(d.technicians) ? d.technicians : [],
    serviceType: d.service_type ?? null, notes: d.notes ?? null,
    laborHours: d.labor_hours === null ? null : Number(d.labor_hours), partsTotal: d.parts_total === null ? null : Number(d.parts_total),
  };
}

async function countJobCardAudit(db: SupabaseClient, shopId: string, jobCardId: string): Promise<number | null> {
  const r = await db.from('audit_events').select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId).eq('entity_type', 'job_card').eq('entity_id', jobCardId);
  return r.error ? null : r.count;
}

async function readLaborGuide(db: SupabaseClient, shopId: string) {
  const r = await db.from('standard_labor_guides').select('times_performed').eq('shop_id', shopId);
  if (r.error) return null;
  const rows = r.data ?? [];
  return { rows: rows.length, timesPerformed: rows.reduce((s, x) => s + Number(x.times_performed ?? 0), 0) };
}

async function readInvoice(db: SupabaseClient, shopId: string): Promise<InvoiceSnapshot | null> {
  const r = await db.from('invoices').select('number, status, lines').eq('shop_id', shopId).eq('number', DEMO.invoiceNumber).maybeSingle();
  if (r.error || !r.data) return null;
  return { number: r.data.number, status: r.data.status, linesJson: JSON.stringify(r.data.lines ?? null) };
}

async function countInvoices(db: SupabaseClient, shopId: string) {
  const r = await db.from('invoices').select('number', { count: 'exact', head: true }).eq('shop_id', shopId);
  return r.error ? null : r.count;
}

/** Read order matters: the all-shop count FIRST (see AlertProgressFacts). */
export async function collectAlertProgress(start: AlertStartFacts): Promise<AlertProgressFacts> {
  const db = admin();
  const shopId = start.demoShopId;
  const p: AlertProgressFacts = { allShopAlertCount: null, newAlerts: null, newStatusEvents: null, pushSubscriptions: null, sapeleeOutboxRows: null };

  const all = await db.from('alert_events').select('id', { count: 'exact', head: true });
  if (!all.error) p.allShopAlertCount = all.count;

  const known = new Set(start.demoAlertIds ?? []);
  const alerts = await db.from('alert_events')
    .select('id, shop_id, event_type, target_user_id, target_role, title, entity_type, entity_id, created_by, created_at')
    .eq('shop_id', shopId).order('created_at', { ascending: true }).order('id', { ascending: true });
  if (!alerts.error && start.demoAlertIds) {
    p.newAlerts = (alerts.data ?? []).filter(r => !known.has(String(r.id))).map((r): AlertRow => ({
      id: String(r.id), shopId: r.shop_id, eventType: r.event_type, targetUserId: r.target_user_id, targetRole: r.target_role,
      title: r.title, entityType: r.entity_type, entityId: r.entity_id, createdBy: r.created_by,
    }));
  }

  const knownStatus = new Set(start.demoStatusEventIds ?? []);
  const status = await db.from('ro_status_events')
    .select('id, shop_id, repair_order_id, old_status, new_status, changed_by, created_at')
    .eq('shop_id', shopId).order('created_at', { ascending: true }).order('id', { ascending: true });
  if (!status.error && start.demoStatusEventIds) {
    p.newStatusEvents = (status.data ?? []).filter(r => !knownStatus.has(String(r.id))).map((r): StatusEventRow => ({
      id: String(r.id), shopId: r.shop_id, repairOrderId: String(r.repair_order_id),
      oldStatus: r.old_status, newStatus: r.new_status, changedBy: r.changed_by,
    }));
  }

  if (start.sessionUserId) {
    const byUser = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', start.sessionUserId);
    const byShop = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
    if (!byUser.error && !byShop.error && byUser.count !== null && byShop.count !== null) p.pushSubscriptions = byUser.count + byShop.count;
  }

  const outbox = await db.from('sapelee_event_outbox').select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
  if (!outbox.error) p.sapeleeOutboxRows = outbox.count;
  return p;
}

export async function collectAlertFinish(start: AlertStartFacts): Promise<AlertFinishFacts> {
  const db = admin();
  const shopId = start.demoShopId;
  const progress = await collectAlertProgress(start);
  const ro = await db.from('repair_orders').select('status, invoice_number').eq('shop_id', shopId).eq('ro_number', DEMO.roNumber).maybeSingle();
  const members = await db.from('shop_users').select('user_id', { count: 'exact', head: true }).eq('shop_id', shopId);
  const jobCard = await readJobCard(db, shopId);
  return {
    ...progress,
    jobCard,
    repairOrder: !ro.error && ro.data ? { status: ro.data.status, invoiceNumber: ro.data.invoice_number ?? null } : null,
    invoice: await readInvoice(db, shopId),
    demoInvoiceCount: await countInvoices(db, shopId),
    jobCardAuditRows: jobCard ? await countJobCardAudit(db, shopId, jobCard.id) : null,
    laborGuide: await readLaborGuide(db, shopId),
    shopMembers: members.error ? null : members.count,
  };
}
