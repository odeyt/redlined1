/**
 * M-PARTS2B controlled live proof.
 *
 * One vehicle, one OEM number, a hard budget, and a stop condition at every
 * step. The point is not to produce a green badge — it is to find out whether
 * the live contract matches the fixtures, and whether Redlined1 tells the
 * truth about what it learned.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2b-live-proof.ts
 *
 * Prints locally-recorded call counts before and after. Never prints the VIN,
 * the customer, the plate or the key.
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

const BUDGET = 10;
/** A Mercedes front brake pad set OEM. Public catalogue data, not a job. */
const OEM = process.env.AUTOPARTS_TEST_OEM?.trim() || 'A0044206920';

const line = (s = '') => console.log(s);
const shape = (v: unknown): string => {
  if (Array.isArray(v)) {
    return `array(${v.length})` + (v.length && typeof v[0] === 'object' && v[0] !== null
      ? ` of {${Object.keys(v[0] as object).slice(0, 14).join(',')}}` : '');
  }
  if (v && typeof v === 'object') return `object{${Object.keys(v).slice(0, 14).join(',')}}`;
  return typeof v;
};

async function externalCallsThisMonth(shopId: string): Promise<number> {
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from('parts_provider_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('cache_hit', false)
    .gte('created_at', start.toISOString());
  return count ?? 0;
}

async function main() {
  const { autoPartsApiRequest } = await import('../lib/parts/providers/autopartsapi/client');
  const { manufacturersPath, modelsPath, vehicleVariantsPath, vehicleApplicabilityPath } =
    await import('../lib/parts/providers/autopartsapi/endpoints');
  const { readManufacturers, readModels, readVariants } =
    await import('../lib/parts/vehicleResolution/resolver');
  const { matchManufacturer } = await import('../lib/parts/vehicleResolution/manufacturer');
  const { matchModel } = await import('../lib/parts/vehicleResolution/model');
  const { matchModification } = await import('../lib/parts/vehicleResolution/modification');
  const { normalizeApplicability } = await import('../lib/parts/vehicleResolution/applicability');
  const { decideFitment } = await import('../lib/parts/vehicleResolution/fitmentTruth');

  // ── The controlled vehicle ────────────────────────────────────────────────
  const { data: candidates } = await admin
    .from('vehicles')
    .select('id, shop_id, vin, year, make, model, trim, engine, transmission, fuel_type')
    .not('vin', 'is', null)
    .not('make', 'is', null).not('model', 'is', null).not('year', 'is', null)
    .limit(400);

  // `.not(engine, is, null)` is NOT enough: the column holds empty STRINGS,
  // not nulls, so a "has an engine" filter written that way returns vehicles
  // with no engine at all. Filtered in JS where the difference is visible.
  const withEngine = (candidates ?? []).filter(v => String(v.engine ?? '').trim().length > 0);
  const vehicle = withEngine.find(v => /mercedes/i.test(String(v.make)))
    ?? withEngine[0]
    ?? (candidates ?? [])[0];
  if (!vehicle) { console.error('No controlled vehicle with full identity data.'); process.exit(2); }

  const shopId = vehicle.shop_id as string;
  const before = await externalCallsThisMonth(shopId);

  line('');
  line('M-PARTS2B CONTROLLED LIVE PROOF');
  line('='.repeat(66));
  line(`REDLINED VEHICLE   ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
  line(`                   engine "${vehicle.engine}"  trim "${vehicle.trim ?? ''}"`);
  line(`                   VIN ****${String(vehicle.vin).slice(-4)}  (masked)`);
  line(`OEM UNDER TEST     ${OEM}`);
  line(`BUDGET             ${BUDGET} new external calls`);
  line(`Live calls before  ${before} (locally recorded, this month)`);
  line('='.repeat(66));

  const ctx = { shopId };
  let spent = 0;

  /**
   * Resume from ids already learned, standing in for a technician's choice.
   *
   * The first run legitimately resolved manufacturer 74 and narrowed 2009
   * S-Class to two series — the W221 saloon and the C216 coupé. Redlined1
   * records no body type, so the resolver correctly refuses to pick, and in
   * the product a technician would. Passing the ids here does the same thing
   * without spending two calls to re-derive facts already proven.
   */
  const resumeManufacturer = Number(process.env.PROOF_MANUFACTURER_ID ?? 0);
  const resumeModel = Number(process.env.PROOF_MODEL_ID ?? 0);
  const resuming = resumeManufacturer > 0 && resumeModel > 0;
  const stop = (why: string): never => {
    line('');
    line(`STOPPED: ${why}`);
    line(`External calls spent: ${spent}`);
    process.exit(1);
  };

  let manufacturerId: number;
  let modelId: number;

  if (resuming) {
    manufacturerId = resumeManufacturer;
    modelId = resumeModel;
    line('\n[1-2] RESUMED from ids proven in the previous run (0 calls)');
    line(`      manufacturerId ${manufacturerId}   modelId ${modelId}`);
    line('      Model was AMBIGUOUS live: W221 saloon vs C216 coupe for 2009.');
    line('      Redlined1 records no body type, so this stands in for the');
    line('      technician selection the product would require.');
  } else {
    ({ manufacturerId, modelId } = await walkChain());
  }

  async function walkChain(): Promise<{ manufacturerId: number; modelId: number }> {
  // ── 1. Manufacturer ───────────────────────────────────────────────────────
  line('\n[1] GET /manufacturers/list/type-id/1');
  const manuPayload = await autoPartsApiRequest<unknown>(
    manufacturersPath(), undefined, { ...ctx, category: 'manufacturers' });
  spent += 1;
  line(`    shape: ${shape(manuPayload)}`);
  const manufacturers = readManufacturers(manuPayload);
  line(`    parsed: ${manufacturers.length} manufacturers`);
  if (!manufacturers.length) stop('manufacturer list did not parse — live shape differs from fixtures');

  const manuMatch = matchManufacturer(vehicle.make, manufacturers);
  line(`    match: ${manuMatch.status} — ${manuMatch.detail}`);
  if (manuMatch.status !== 'matched') stop('manufacturer not deterministically resolved');
  const manufacturerId = manuMatch.manufacturer!.id;
  line(`    manufacturerId: ${manufacturerId} (${manuMatch.manufacturer!.name})`);
  void manufacturerId;

  // ── 2. Model ──────────────────────────────────────────────────────────────
  line(`\n[2] GET /models/list/.../manufacturer-id/${manufacturerId}/...`);
  const modelPayload = await autoPartsApiRequest<unknown>(
    modelsPath({ manufacturerId }), undefined, { ...ctx, category: 'models' });
  spent += 1;
  line(`    shape: ${shape(modelPayload)}`);
  const models = readModels(modelPayload);
  line(`    parsed: ${models.length} model series`);
  if (!models.length) stop('model list did not parse — live shape differs from fixtures');

  const modelMatch = matchModel(vehicle.model, Number(vehicle.year), models);
  line(`    match: ${modelMatch.status} — ${modelMatch.detail}`);
  if (modelMatch.status === 'ambiguous') {
    line(`    candidates: ${modelMatch.candidates!.map(m => `${m.id}:${m.name}`).slice(0, 6).join('  ')}`);
    stop('model ambiguous beyond deterministic logic — reporting rather than guessing');
  }
  if (modelMatch.status !== 'matched') stop('model not resolved');
  line(`    modelId: ${modelMatch.model!.id} (${modelMatch.model!.name})`);
  return { manufacturerId, modelId: modelMatch.model!.id };
  }

  // ── 3. Variants, with engine specs ────────────────────────────────────────
  line(`\n[3] GET /types/type-id/1/list-vehicles-types/${modelId}/...`);
  const variantPayload = await autoPartsApiRequest<unknown>(
    vehicleVariantsPath({ modelId }), undefined, { ...ctx, category: 'vehicle_variants' });
  spent += 1;
  line(`    shape: ${shape(variantPayload)}`);
  const variants = readVariants(variantPayload);
  line(`    parsed: ${variants.length} variants`);
  if (!variants.length) stop('variant list did not parse — live shape differs from fixtures');

  // Read from the payload rather than assumed: applicability rows name the
  // series, and the two must be compared on the same string.
  const modelNameForMatch = variants[0]?.modelName ?? '';
  line(`    series name (from row): "${modelNameForMatch}"`);

  line('    sample (sanitised):');
  for (const v of variants.slice(0, 4)) {
    line(`      id ${v.vehicleId}  "${v.description}"  `
      + `${v.displacementL ?? '?'}L  ${v.powerKw ?? '?'}kW  ${v.fuel ?? '?'}  `
      + `${v.engineCode ?? '-'}  ${v.yearFrom ?? '?'}–${v.yearTo ?? '?'}`);
  }

  const modMatch = matchModification({
    year: Number(vehicle.year),
    engine: String(vehicle.engine ?? ''),
    fuelType: String(vehicle.fuel_type ?? ''),
  }, variants);
  line(`\n    modification: ${modMatch.status} — ${modMatch.detail}`);

  let resolvedVehicleId: number | undefined;
  if (modMatch.status === 'matched') {
    resolvedVehicleId = modMatch.modification!.vehicleId;
    line(`    resolved vehicleId: ${resolvedVehicleId}`);
  } else {
    line(`    VEHICLE VARIANT AMBIGUOUS — ${modMatch.candidates?.length ?? 0} candidates for the technician`);
  }

  // ── 4. OEM applicability ──────────────────────────────────────────────────
  line(`\n[4] GET /articles-oem/selecting-a-list-of-cars-for-oem-part-number/...`);
  let applicabilityPayload: unknown = null;
  try {
    applicabilityPayload = await autoPartsApiRequest<unknown>(
      vehicleApplicabilityPath({ typeId: 1, manufacturerId, oem: OEM }),
      undefined, { ...ctx, category: 'oem_applicability' });
    spent += 1;
    line(`    shape: ${shape(applicabilityPayload)}`);
  } catch (e) {
    spent += 1;
    line(`    provider error: ${(e as { kind?: string }).kind ?? 'unknown'}`);
  }

  // The applicability endpoint returns no vehicle id, so the resolved variant
  // is identified by the tuple the provider actually publishes.
  const chosen = modMatch.status === 'matched' ? modMatch.modification : undefined;
  const applicability = normalizeApplicability(applicabilityPayload, chosen ? {
    vehicleId: resolvedVehicleId,
    modelName: modelNameForMatch,
    typeEngineName: chosen.description,
  } : undefined);
  line(`    listed: ${applicability.listed}`);
  line(`    answer: ${applicability.answer}`);
  line(`    ${applicability.detail}`);

  // ── 5. The verdict ────────────────────────────────────────────────────────
  const fit = decideFitment({
    partIdentity: 'verified_equivalent',   // assumed for the proof; identity is M-PARTS2A's job
    vehicleResolution: modMatch.status === 'matched' ? 'resolved'
      : modMatch.status === 'insufficient_data' ? 'insufficient_data' : 'ambiguous',
    applicability: applicability.answer,
  });

  line('');
  line('='.repeat(66));
  line('PART IDENTITY      VERIFIED EQUIVALENT (assumed for this proof)');
  line(`VEHICLE FITMENT    ${fit.status.toUpperCase()}`);
  line(`                   ${fit.reason}`);
  line('='.repeat(66));

  const after = await externalCallsThisMonth(shopId);
  line('');
  line(`External calls spent this run: ${spent}`);
  line(`Locally recorded, this month:  ${before} -> ${after}  (delta ${after - before})`);
  line(`Budget: ${BUDGET}. ${spent <= BUDGET ? 'WITHIN BUDGET' : 'OVER BUDGET'}`);
  line('');

  if (spent > BUDGET) process.exit(1);
}

main().catch(e => {
  console.error('unexpected: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
