/**
 * Summit Auto & Fleet Service — demo data for the marketing Command Center.
 *
 *   npx tsx scripts/demo/seed-summit-demo.ts plan              read-only (default)
 *   npx tsx scripts/demo/seed-summit-demo.ts apply             insert today's records
 *   npx tsx scripts/demo/seed-summit-demo.ts cleanup           remove earlier days' open records
 *   npx tsx scripts/demo/seed-summit-demo.ts cleanup --all     remove everything this seed created
 *
 * Read docs/demo-seed.md before running anything but `plan`.
 *
 * ## Refuses unless
 *
 *   - DEMO_SHOP_ID names the shop, AND the database reads it back with
 *     shops.is_synthetic = true (lib/demo-seed/guards.ts has every gate);
 *   - it is not a D1 internal shop, is not in shop_mirrors, and has exactly one
 *     member, its owner, whose plan is not 'free';
 *   - ALLOW_DEMO_SEED=true for any write, and ALLOW_PRODUCTION_DEMO_SEED=true
 *     as well when the target is the production project;
 *   - the live schema accepts every column it will write.
 *
 * ## What it never does
 *
 *   - Write outside DEMO_SHOP_ID. Every read and write carries .eq('shop_id', …).
 *   - UPDATE a job card, repair order, estimate or invoice: those UPDATEs fire
 *     alert triggers and pg_net push requests; INSERTs do not.
 *   - Delete a payment. The ledger is append-only; `cleanup --all` appends
 *     reversals, which is how the app itself cancels a payment.
 *   - Draw an invoice number from the shared sequence (numbers are SAF-INV-…).
 *   - Send email, SMS or push, or queue Sapelee events (service-role writes
 *     publish nothing).
 *   - Change the owner's plan, the shops row, or any grant or policy. (`apply`
 *     does set the demo shop's own shop_settings: its name, and USD.)
 */
import { join } from 'path';
import { config as loadDotenv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildSummitDataset, demoShopSettings, expectedTotals, SUMMIT, type SummitDataset } from '../../lib/demo-seed/summitDataset';
import { demoTargetFailures, type SeedMode } from '../../lib/demo-seed/guards';
import {
  TABLE_SPECS, columnsWritten, generationOf, isStaleGeneration, planInserts, plannedRowCount, schemaFailures,
  staticKeys, type OpenApiSchema,
} from '../../lib/demo-seed/plan';

loadDotenv({ path: process.env.DOTENV_PATH ?? join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\./)?.[1] ?? '';

function fail(message: string): never {
  console.error(`\n[demo-seed] REFUSED: ${message}\nNothing further was written.`);
  process.exit(1);
}

function client(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see DOTENV_PATH)');
  return createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── Facts (read-only) ──────────────────────────────────────────────────────

async function readShop(db: SupabaseClient, shopId: string) {
  const withFlag = await db.from('shops').select('id, name, is_synthetic').eq('id', shopId).maybeSingle();
  if (!withFlag.error) {
    return withFlag.data
      ? { id: String(withFlag.data.id), name: String(withFlag.data.name), isSynthetic: withFlag.data.is_synthetic === true }
      : null;
  }
  // The column may not exist yet; report that precisely instead of "no shop".
  const plain = await db.from('shops').select('id, name').eq('id', shopId).maybeSingle();
  return plain.data ? { id: String(plain.data.id), name: String(plain.data.name), isSynthetic: null } : null;
}

async function collectFacts(db: SupabaseClient, mode: SeedMode, now: Date, dataset: SummitDataset) {
  const shopId = process.env.DEMO_SHOP_ID?.trim() ?? '';
  const valid = /^[0-9a-f-]{36}$/i.test(shopId);
  const shop = valid ? await readShop(db, shopId) : null;

  const [mirrorA, mirrorB, members] = valid ? await Promise.all([
    db.from('shop_mirrors').select('mirror_shop_id', { count: 'exact', head: true }).eq('shop_id', shopId),
    db.from('shop_mirrors').select('shop_id', { count: 'exact', head: true }).eq('mirror_shop_id', shopId),
    db.from('shop_users').select('user_id, role').eq('shop_id', shopId),
  ]) : [null, null, null];

  const mirrorLinks = mirrorA && mirrorB && !mirrorA.error && !mirrorB.error && mirrorA.count !== null && mirrorB.count !== null
    ? mirrorA.count + mirrorB.count : null;
  const memberRows = members && !members.error
    ? (members.data ?? []).map(m => ({ userId: String(m.user_id), role: String(m.role) })) : null;

  const owner = memberRows?.filter(m => m.role === 'owner');
  let ownerPlan: string | null | undefined;
  if (owner && owner.length === 1) {
    const p = await db.from('profiles').select('plan').eq('id', owner[0].userId).maybeSingle();
    ownerPlan = p.error || !p.data ? undefined : (p.data.plan as string | null);
  }

  return {
    ownerId: owner?.length === 1 ? owner[0].userId : null,
    facts: {
      mode,
      env: {
        shopId: process.env.DEMO_SHOP_ID,
        allowWrite: process.env.ALLOW_DEMO_SEED,
        allowProduction: process.env.ALLOW_PRODUCTION_DEMO_SEED,
        projectRef: PROJECT_REF,
      },
      shop, mirrorLinks, members: memberRows, ownerPlan,
      todayWindowUsable: dataset.window.usable,
    },
  };
}

/** PostgREST's OpenAPI description of the live schema. GET only. */
async function readLiveSchema(): Promise<OpenApiSchema | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
    });
    return res.ok ? ((await res.json()) as OpenApiSchema) : null;
  } catch {
    return null;
  }
}

/** Tables whose live schema carries owner_id: its default is auth.uid(), NULL under the service role. */
function ownerTables(schema: OpenApiSchema): Set<string> {
  return new Set(TABLE_SPECS.map(s => s.table).filter(t => !!schema.definitions?.[t]?.properties?.owner_id));
}

/** Seed keys already present in the demo shop, per table — current and earlier days. */
async function existingSeedKeys(db: SupabaseClient, shopId: string, d: SummitDataset) {
  const out: Record<string, Set<string>> = {};
  for (const spec of TABLE_SPECS) {
    const q = db.from(spec.table).select(spec.key).eq('shop_id', shopId);
    const r = spec.dated
      ? await q.like(spec.key, `${SUMMIT.docPrefix}-%`)
      : await q.in(spec.key, staticKeys(d, spec.table));
    if (r.error) fail(`could not read ${spec.table}: ${r.error.message}`);
    out[spec.table] = new Set((r.data ?? []).map(row => String((row as unknown as Record<string, unknown>)[spec.key])));
  }
  return out;
}

// ── Intelligence refresh ────────────────────────────────────────────────────

/**
 * Recomputes the demo shop's metrics and recommendations with the app's own
 * engine, so the Command Center shows the seeded state immediately instead of
 * a metrics row cached earlier today. Writes only derived rows for this shop:
 * shop_intelligence_metrics (upsert) and recommendations (upsert; open ones
 * whose rule no longer fires are marked expired, exactly as they would age out).
 */
async function refreshIntelligence(db: SupabaseClient, shopId: string) {
  const { calculateShopMetrics, saveShopMetrics } = await import('../../intelligence/metrics/MetricsBuilder');
  const { saveRecommendations } = await import('../../intelligence/recommendations/RecommendationEngine');
  const { extractSignalsFromMetrics } = await import('../../intelligence/signals/SignalExtractor');
  const { ALL_RULES } = await import('../../intelligence/rules/RuleRegistry');

  const { metrics, warnings } = await calculateShopMetrics(shopId);
  if (warnings.length) console.warn('[demo-seed] metric warnings:', warnings);
  await saveShopMetrics(metrics);

  const signals = extractSignalsFromMetrics(metrics);
  const fired = ALL_RULES.map(r => r.evaluate({ shopId, now: new Date(), signals, rawData: { source: 'demo-seed' } }))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await saveRecommendations(shopId, fired);
  const keys = fired.map(r => r.recommendationKey);
  let expire = db.from('recommendations').update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('shop_id', shopId).eq('status', 'open');
  if (keys.length) expire = expire.not('recommendation_key', 'in', `(${keys.map(k => `"${k}"`).join(',')})`);
  const expired = await expire;
  if (expired.error) console.warn(`[demo-seed] could not expire stale recommendations: ${expired.error.message}`);

  console.log('[demo-seed] Command Center now reads:', {
    healthScore: metrics.shopHealthScore, openJobs: metrics.openJobCount, paymentsToday: metrics.paymentsToday,
    paymentsTodayTotal: metrics.revenueToday, overdueInvoices: metrics.overdueInvoiceCount,
    staleEstimates: metrics.staleEstimateCount, completedNotInvoiced: metrics.completedNotInvoicedCount,
    lowInventory: metrics.lowInventoryCount, repairCasesToday: metrics.repairCasesToday, stuckJobs: metrics.stuckJobCount,
    recommendations: fired.map(r => `${r.priority}: ${r.title}`),
  });
}

// ── Modes ───────────────────────────────────────────────────────────────────

async function apply(db: SupabaseClient, shopId: string, ownerId: string, d: SummitDataset, owners: Set<string>, existing: Record<string, Set<string>>) {
  const stale = TABLE_SPECS.flatMap(s => [...existing[s.table]].filter(k => isStaleGeneration(k, d.generation) && s.table !== 'payments' && s.table !== 'invoices'));
  if (stale.length) fail(`${stale.length} record(s) from an earlier day are still open (e.g. ${stale[0]}). Run "cleanup" first so today's counts are not inflated.`);

  const plan = planInserts(d, existing);
  for (const step of plan) {
    if (!step.rows.length) continue;
    const rows = step.rows.map(r => ({ shop_id: shopId, ...(owners.has(step.table) ? { owner_id: ownerId } : {}), ...r }));
    const res = await db.from(step.table).insert(rows).select(step.key);
    if (res.error) fail(`${step.table} insert failed after earlier tables were written: ${res.error.message}. Re-run "apply" once fixed; it resumes from the missing rows.`);
    console.log(`[demo-seed] inserted ${res.data?.length ?? 0} ${step.table}`);
  }
}

async function cleanup(db: SupabaseClient, shopId: string, d: SummitDataset, all: boolean, existing: Record<string, Set<string>>) {
  const pick = (table: string) => [...existing[table]].filter(k => all ? generationOf(k) !== null : isStaleGeneration(k, d.generation));

  // Payments: never deleted. --all appends one reversal per live seeded payment.
  if (all) {
    const pays = await db.from('payments').select('id, reference_number, amount, currency, method, status, invoice_number, customer_name, customer_id, entry_type')
      .eq('shop_id', shopId).like('reference_number', `${SUMMIT.docPrefix}-PAY-%`);
    if (pays.error) fail(`could not read payments: ${pays.error.message}`);
    const reversed = await db.from('payments').select('reverses_payment_id').eq('shop_id', shopId).eq('entry_type', 'reversal');
    if (reversed.error) fail(`could not read reversals: ${reversed.error.message}`);
    const done = new Set((reversed.data ?? []).map(r => String(r.reverses_payment_id)));
    const toReverse = (pays.data ?? []).filter(p => p.entry_type === 'payment' && !done.has(String(p.id)));
    if (toReverse.length) {
      const rows = toReverse.map(p => ({
        shop_id: shopId, invoice_number: p.invoice_number, customer_name: p.customer_name, customer_id: p.customer_id,
        amount: -Number(p.amount), method: p.method, status: p.status, currency: p.currency,
        reference_number: `${p.reference_number}-REV`, payment_date: new Date().toISOString(),
        entry_type: 'reversal', reverses_payment_id: p.id, reason: 'Demo seed cleanup: fictional record.', notes: SUMMIT.note,
      }));
      const res = await db.from('payments').insert(rows);
      if (res.error) fail(`payment reversal failed: ${res.error.message}`);
      console.log(`[demo-seed] reversed ${rows.length} payments (the ledger keeps both entries)`);
    }
  }

  // Invoices referenced by a payment cannot be deleted (FK ON DELETE RESTRICT); they are history.
  const paidRefs = await db.from('payments').select('invoice_number').eq('shop_id', shopId).like('invoice_number', `${SUMMIT.docPrefix}-INV-%`);
  if (paidRefs.error) fail(`could not read payment references: ${paidRefs.error.message}`);
  const keepInvoices = new Set((paidRefs.data ?? []).map(r => String(r.invoice_number)));

  const del = async (table: string, key: string, keys: string[]) => {
    if (!keys.length) return;
    const res = await db.from(table).delete().eq('shop_id', shopId).in(key, keys).select(key);
    if (res.error) fail(`${table} delete failed: ${res.error.message}`);
    console.log(`[demo-seed] deleted ${res.data?.length ?? 0} ${table}`);
  };
  // Children first.
  await del('repair_cases', 'ro_number', pick('repair_cases'));
  await del('repair_orders', 'ro_number', pick('repair_orders'));
  await del('estimates', 'estimate_number', pick('estimates'));
  await del('closed_jobs', 'id', pick('closed_jobs'));
  await del('job_cards', 'id', pick('job_cards'));
  await del('invoices', 'number', pick('invoices').filter(k => !keepInvoices.has(k)));

  if (all) {
    await del('vehicles', 'plate', [...existing.vehicles]);
    await del('parts', 'part_number', [...existing.parts]);
    // Technicians are matched by name AND the seed's own note, so a real person
    // who happens to share a name is never removed.
    const techs = await db.from('technicians').delete().eq('shop_id', shopId).eq('notes', SUMMIT.note).in('name', [...existing.technicians]).select('name');
    if (techs.error) fail(`technicians delete failed: ${techs.error.message}`);
    console.log(`[demo-seed] deleted ${techs.data?.length ?? 0} technicians`);
    // Customers still referenced by kept invoices or payments stay, and are reported.
    const custs = await db.from('customers').delete().eq('shop_id', shopId).contains('tags', [SUMMIT.tag]).in('id', [...existing.customers]).select('id');
    if (custs.error) console.warn(`[demo-seed] some customers remain (referenced by ledger history): ${custs.error.message}`);
    else console.log(`[demo-seed] deleted ${custs.data?.length ?? 0} customers`);
    if (keepInvoices.size) console.log(`[demo-seed] kept ${keepInvoices.size} paid invoice(s): payments reference them and the ledger is append-only`);
  }
}

async function main() {
  const arg = process.argv[2] ?? 'plan';
  if (!['plan', 'apply', 'cleanup'].includes(arg)) fail(`unknown mode "${arg}" (plan | apply | cleanup [--all])`);
  const mode = arg as SeedMode;
  const all = process.argv.includes('--all');

  // The intelligence refresh runs MetricsBuilder here, and MetricsBuilder's
  // "today" is the host's local midnight. Production runs in UTC; a refresh
  // from a UTC+7 laptop would cache a metrics row counting the wrong day,
  // which the Command Center would then serve until the next refresh.
  if (mode !== 'plan' && new Date(0).getTimezoneOffset() !== 0) {
    fail('run with TZ=UTC so the refreshed metrics match the UTC server (npm run demo:seed -- … sets it)');
  }

  const now = new Date();
  const dataset = buildSummitDataset(now);
  const db = client();

  console.log(`[demo-seed] mode=${mode}${all ? ' --all' : ''}  target=${PROJECT_REF || 'unknown'}  generation=${dataset.generation}`);
  const { facts, ownerId } = await collectFacts(db, mode, now, dataset);
  const failures = demoTargetFailures(facts);
  if (failures.length) fail(`\n  - ${failures.join('\n  - ')}`);
  const shopId = facts.shop!.id;
  console.log(`[demo-seed] verified synthetic demo shop: ${facts.shop!.name} (${shopId})`);

  const schema = await readLiveSchema();
  const owners = schema ? ownerTables(schema) : new Set<string>();
  const written = columnsWritten(dataset);
  for (const t of owners) written[t] = [...written[t], 'owner_id'];
  const schemaProblems = schemaFailures(schema, written);
  // The settings UPDATE: columns must exist (no insert, so no required-column check).
  const settingsCols = new Set(Object.keys(schema?.definitions?.shop_settings?.properties ?? {}));
  for (const c of Object.keys(demoShopSettings())) {
    if (!settingsCols.has(c)) schemaProblems.push(`shop_settings.${c}: column does not exist`);
  }
  if (schemaProblems.length) fail(`the live schema does not accept the seed's writes:\n  - ${schemaProblems.join('\n  - ')}`);

  const current = await db.from('shop_settings').select('company_name, default_currency').eq('shop_id', shopId).maybeSingle();
  if (current.error) fail(`could not read the demo shop's settings: ${current.error.message}`);
  if (!current.data) fail('the demo shop has no shop_settings row (shops_create_settings should have made one)');
  console.log(`[demo-seed] demo shop settings now: name=${String(current.data.company_name)} currency=${String(current.data.default_currency)}`
    + (current.data.default_currency === SUMMIT.currency ? '' : ` → apply sets ${SUMMIT.currency}`));

  const existing = await existingSeedKeys(db, shopId, dataset);
  const plan = planInserts(dataset, existing);
  const staleKeys = TABLE_SPECS.flatMap(s => [...existing[s.table]].filter(k => isStaleGeneration(k, dataset.generation)));

  console.log('[demo-seed] would insert:', Object.fromEntries(plan.map(p => [p.table, p.rows.length])));
  console.log(`[demo-seed] earlier-day seed records present: ${staleKeys.length}`);
  console.log('[demo-seed] the dataset reconciles to:', expectedTotals(dataset));

  if (mode === 'plan') { console.log('[demo-seed] plan only — nothing written.'); return; }
  if (!ownerId) fail('no owner id');

  if (mode === 'apply') {
    // USD only, for this one verified demo shop. shop_settings has no alert
    // trigger, so this UPDATE is safe; it must touch exactly one row.
    const settings = await db.from('shop_settings').update(demoShopSettings()).eq('shop_id', shopId).select('shop_id, default_currency');
    if (settings.error || settings.data?.length !== 1) {
      fail(`demo shop settings update did not apply to exactly one row: ${settings.error?.message ?? settings.data?.length}`);
    }
    console.log(`[demo-seed] demo shop is ${SUMMIT.shopName}, currency ${settings.data[0].default_currency}`);
    if (plannedRowCount(plan) === 0) console.log('[demo-seed] every record already exists — nothing to insert.');
    else await apply(db, shopId, ownerId, dataset, owners, existing);
  } else {
    await cleanup(db, shopId, dataset, all, existing);
  }
  await refreshIntelligence(db, shopId);
}

if (require.main === module) {
  main().catch(err => fail(err instanceof Error ? err.message : String(err)));
}
