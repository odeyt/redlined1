/**
 * M-PARTS2C.4 end-to-end proof on a TEMPORARY QA fixture.
 *
 * Spends ZERO AutoPartsAPI calls. Every catalogue fact comes from the
 * persistent reference cache populated in M-PARTS2C.3.
 *
 * The fixture is a vehicle that does not belong to any customer: no VIN, no
 * plate, no customer link, and a label that says what it is. It and every row
 * it causes are deleted at the end, and the residual count is proven to be 0.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2c4-fixture-proof.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/ldjrlvjkmzrcdqhetqoh/.test(url)) {
  console.error('Refusing to run: expected the Redlined1 project.');
  process.exit(2);
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** Every fixture row carries this, so cleanup can find them all. */
const QA_LABEL = 'QA FIXTURE M-PARTS2C4 — TEMPORARY, SAFE TO DELETE';
const MODEL_ID = 5455;
const PROVIDER_VEHICLE_ID = 3977;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ' -> ' + JSON.stringify(detail)}`);
  if (!ok) failures += 1;
}

async function externalCalls(): Promise<number> {
  const { count } = await admin.from('parts_provider_usage_events')
    .select('*', { count: 'exact', head: true }).eq('outcome', 'external');
  return count ?? 0;
}

async function main() {
  const { analyzeVehicleQuality } = await import('../lib/vehicles/quality');
  const { compareVehicleWithCatalog } = await import('../lib/vehicles/catalogComparison');
  const { planEnrichment, decideFingerprint, applyEnrichment } = await import('../lib/vehicles/enrichment');
  const { vehicleFingerprint } = await import('../lib/parts/vehicleResolution/fingerprint');
  const { loadCanonicalVehicle } = await import('../lib/parts/vehicleResolution/loadVehicle');

  console.log('\nM-PARTS2C.4 — QA FIXTURE PROOF');
  console.log('='.repeat(60));

  const callsBefore = await externalCalls();
  const { data: shop } = await admin.from('shops').select('id').limit(1).maybeSingle();
  const shopId = String(shop!.id);

  // ── Fixture ──────────────────────────────────────────────────────────────
  // No VIN, no plate, no customer. Core identity only, so the analyzer has
  // something to call INCOMPLETE and the catalogue has something to add.
  const { data: created, error: insErr } = await admin.from('vehicles').insert({
    shop_id: shopId,
    label: QA_LABEL,
    year: 2009,
    make: 'MERCEDES-BENZ',
    model: 'S-Class',
  }).select('id').single();
  if (insErr) { console.error('fixture insert failed:', insErr.message); process.exit(1); }
  const vehicleId = String(created!.id);
  console.log(`fixture vehicle created: ${vehicleId.slice(0, 8)}…\n`);

  try {
    const v0 = (await loadCanonicalVehicle(shopId, vehicleId))!;
    const fingerprintA = vehicleFingerprint(v0);

    // A mapping bound to fingerprint A, pointing at a variant that really is
    // in the cached payload. No provider call is made to create it.
    await admin.from('parts_provider_vehicle_mappings').insert({
      shop_id: shopId,
      vehicle_id: vehicleId,
      provider: 'autopartsapi',
      provider_type_id: 1,
      provider_manufacturer_id: 74,
      provider_model_id: MODEL_ID,
      provider_vehicle_id: PROVIDER_VEHICLE_ID,
      provider_manufacturer_name: 'MERCEDES-BENZ',
      provider_model_name: 'S-CLASS (W221, V221)',
      provider_modification_desc: 'S 400 Hybrid (221.095, 221.195)',
      resolution_status: 'resolved',
      vehicle_fingerprint: fingerprintA,
      resolution_evidence: [{ step: 'cache', outcome: 'reused', detail: 'QA fixture' }],
    });

    // ── 1. Quality ─────────────────────────────────────────────────────────
    console.log('1. QUALITY PANEL');
    const q = analyzeVehicleQuality({ ...v0, label: QA_LABEL });
    check('status is INCOMPLETE', q.status === 'INCOMPLETE', q.status);
    check('still resolvable (core identity present)', q.resolvable === true);
    check('names the missing fitment fields',
      q.missingFields.some(m => m.field === 'engineCode'),
      q.missingFields.map(m => m.field));

    // ── 2. Catalogue comparison ────────────────────────────────────────────
    console.log('\n2. CATALOG COMPARISON (from cache)');
    const cmp = await compareVehicleWithCatalog(shopId, { ...v0 }, fingerprintA);
    check('available', cmp.available === true, cmp.unavailableReason);
    const byField = Object.fromEntries(cmp.suggestions.map(s => [s.field, s]));
    check('engine code offered from cache',
      byField.engineCode?.suggestedValue === 'M 272.974', byField.engineCode?.suggestedValue);
    check('displacement offered from cache',
      byField.displacementL?.suggestedValue === '3.5', byField.displacementL?.suggestedValue);
    check('cylinders offered from cache',
      byField.cylinders?.suggestedValue === '6', byField.cylinders?.suggestedValue);
    check('missing locally, not a conflict',
      byField.engineCode?.comparison === 'MISSING_LOCAL', byField.engineCode?.comparison);
    check('make agrees', byField.make?.comparison === 'MATCH', byField.make?.comparison);
    check('provenance carried', byField.engineCode?.providerVehicleId === PROVIDER_VEHICLE_ID);

    // ── 3. Nothing happens without an explicit choice ──────────────────────
    console.log('\n3. EXPLICIT CONFIRMATION');
    const empty = planEnrichment([], cmp);
    check('selecting nothing plans nothing', empty.entries.length === 0);
    const forged = planEnrichment(['vin', 'make', 'shop_id'], cmp);
    check('forbidden fields refused', forged.entries.length === 0
      && forged.refused.every(r => r.reason === 'not_enrichable'));

    // ── 4. Apply ───────────────────────────────────────────────────────────
    console.log('\n4. APPLY SELECTED UPDATES');
    const plan = planEnrichment(['engineCode', 'displacementL', 'cylinders'], cmp);
    check('three fields planned', plan.entries.length === 3, plan.entries.map(e => e.field));
    check('values came from the server comparison',
      plan.entries.every(e => cmp.suggestions.some(s => s.field === e.field && s.suggestedValue === e.after)));

    const decision = decideFingerprint({ ...v0 }, plan, true);
    check('fingerprint changes A -> B', decision.changed === true);
    check('mapping is REBOUND, not invalidated', decision.mapping === 'rebound', decision.mapping);

    await applyEnrichment({
      shopId, vehicle: { ...v0 }, plan, decision, comparison: cmp,
      actorUserId: '00000000-0000-0000-0000-000000000000',
    });

    // ── 5. Verify the write ────────────────────────────────────────────────
    console.log('\n5. VEHICLE UPDATED');
    const v1 = (await loadCanonicalVehicle(shopId, vehicleId))!;
    check('engine_code written', v1.engineCode === 'M 272.974', v1.engineCode);
    check('displacement_l written', Number(v1.displacementL) === 3.5, v1.displacementL);
    check('cylinders written', Number(v1.cylinders) === 6, v1.cylinders);

    const fingerprintB = vehicleFingerprint(v1);
    check('fingerprint B differs from A', fingerprintA !== fingerprintB);
    check('B matches what the decision predicted', fingerprintB === decision.after);

    console.log('\n6. MAPPING REBOUND');
    const { data: map1 } = await admin.from('parts_provider_vehicle_mappings')
      .select('vehicle_fingerprint, provider_vehicle_id')
      .eq('vehicle_id', vehicleId).maybeSingle();
    check('mapping still exists', Boolean(map1));
    check('rebound to fingerprint B', map1?.vehicle_fingerprint === fingerprintB);
    check('same providerVehicleId', Number(map1?.provider_vehicle_id) === PROVIDER_VEHICLE_ID);

    console.log('\n7. AUDIT');
    const { data: audits } = await admin.from('audit_events')
      .select('action, before_data, after_data, metadata')
      .eq('entity_id', vehicleId);
    const audit = (audits ?? [])[0] as Record<string, unknown> | undefined;
    check('an audit row was written', Boolean(audit), (audits ?? []).length);
    check('records before and after',
      Boolean(audit && JSON.stringify(audit.after_data).includes('M 272.974')));
    check('records provenance',
      Boolean(audit && JSON.stringify(audit.metadata).includes('autopartsapi')));
    check('records the mapping outcome',
      Boolean(audit && JSON.stringify(audit.metadata).includes('rebound')));

    // ── 8. Conflict path ───────────────────────────────────────────────────
    console.log('\n8. CONFLICT PATH (current X vs catalog Y)');
    await admin.from('vehicles').update({ engine_code: 'M 999.999' })
      .eq('id', vehicleId).eq('shop_id', shopId);
    const v2 = (await loadCanonicalVehicle(shopId, vehicleId))!;
    const fingerprintC = vehicleFingerprint(v2);
    check('a hand edit makes the mapping stale', fingerprintC !== fingerprintB);

    const staleCmp = await compareVehicleWithCatalog(shopId, v2, fingerprintC);
    check('stale mapping refuses to present evidence',
      staleCmp.available === false && staleCmp.unavailableReason === 'fingerprint_stale',
      staleCmp.unavailableReason);

    // Rebind so the conflict itself can be examined.
    await admin.from('parts_provider_vehicle_mappings')
      .update({ vehicle_fingerprint: fingerprintC }).eq('vehicle_id', vehicleId);
    const conflictCmp = await compareVehicleWithCatalog(shopId, v2, fingerprintC);
    const conflict = conflictCmp.suggestions.find(s => s.field === 'engineCode');
    check('reported as CONFLICT', conflict?.comparison === 'CONFLICT', conflict?.comparison);
    check('current value shown', conflict?.currentValue === 'M 999.999');
    check('catalog value shown', conflict?.suggestedValue === 'M 272.974');

    // Cancel = select nothing.
    const cancelled = planEnrichment([], conflictCmp);
    check('cancelling plans no write', cancelled.entries.length === 0);
    const v3 = (await loadCanonicalVehicle(shopId, vehicleId))!;
    check('value unchanged after cancel', v3.engineCode === 'M 999.999', v3.engineCode);

    // Accepting it explicitly INVALIDATES, because the record disagreed.
    const conflictPlan = planEnrichment(['engineCode'], conflictCmp);
    const conflictDecision = decideFingerprint(v3, conflictPlan, true);
    check('explicit conflict replacement invalidates the mapping',
      conflictDecision.mapping === 'invalidated', conflictDecision.mapping);

    // ── 9. Provider calls ──────────────────────────────────────────────────
    console.log('\n9. PROVIDER CALLS');
    const callsAfter = await externalCalls();
    check('zero AutoPartsAPI calls spent', callsAfter === callsBefore,
      { before: callsBefore, after: callsAfter });
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    console.log('\n10. CLEANUP');
    /**
     * audit_events is APPEND-ONLY by design (M1). Even service_role is
     * refused with 42501. That is correct and is not worked around here: an
     * audit trail that can be deleted to tidy up is not an audit trail. The
     * QA row is left in place, and it holds no PII — a deleted vehicle's id,
     * three fitment columns, and provenance.
     */
    const aDel = 0;
    const { count: mDel } = await admin.from('parts_provider_vehicle_mappings')
      .delete({ count: 'exact' }).eq('vehicle_id', vehicleId);
    const { count: vDel } = await admin.from('vehicles')
      .delete({ count: 'exact' }).eq('id', vehicleId);
    console.log(`  deleted mappings: ${mDel ?? 0}, vehicles: ${vDel ?? 0}`);
    console.log(`  audit rows deleted: ${aDel} — the table is append-only by design`);

    const { count: rv } = await admin.from('vehicles')
      .select('*', { count: 'exact', head: true }).ilike('label', '%QA FIXTURE M-PARTS2C4%');
    const { count: rm } = await admin.from('parts_provider_vehicle_mappings')
      .select('*', { count: 'exact', head: true }).eq('vehicle_id', vehicleId);
    const { count: ra } = await admin.from('audit_events')
      .select('*', { count: 'exact', head: true }).eq('entity_id', vehicleId);
    const { count: rf } = await admin.from('vehicles').select('*', { count: 'exact', head: true })
      .or('engine_code.not.is.null,displacement_l.not.is.null,cylinders.not.is.null');

    console.log('\nRESIDUAL FIXTURE ROWS');
    check('temporary vehicles = 0', (rv ?? 0) === 0, rv);
    check('temporary mappings = 0', (rm ?? 0) === 0, rm);
    /**
     * NOT asserted as 0.
     *
     * `audit_events` refuses DELETE even to service_role (42501). That is the
     * append-only guarantee from M1, and it is the right answer: an audit
     * trail that can be tidied away is not an audit trail. The row is
     * reported instead, and it carries no PII — the id of a vehicle that no
     * longer exists, three fitment columns, and provenance.
     */
    console.log(`  audit rows referencing the fixture (immutable): ${ra ?? 0}`);
    check('no vehicle left holding fitment values = 0', (rf ?? 0) === 0, rf);
  }

  console.log('\n' + '='.repeat(60));
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  if (failures) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
