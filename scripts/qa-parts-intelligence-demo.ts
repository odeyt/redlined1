/**
 * Demonstrates the Parts Intelligence pipeline end to end on FIXTURE data.
 *
 * Runs the real modules — normalise, landed cost, fitment, ranking, snapshot —
 * so the output is what the product would actually produce. The eBay payload
 * is a fixture, because no credentials exist in this environment.
 *
 *   npx tsx scripts/qa-parts-intelligence-demo.ts
 */
import { normalizeEbayResponse, type EbayItemSummary } from '../lib/parts/normalize';
import { rankParts, LABEL_TEXT } from '../lib/parts/recommendation';
import { buildEstimateLineFromPart } from '../lib/parts/snapshot';
import { calculateEstimateTotals, type EstimateFull } from '../services/estimateService';
import { FITMENT_LABEL, FITMENT_WARNING, needsFitmentWarning } from '../lib/parts/fitment';
import type { PartsSearchInput } from '../lib/parts/types';

const BANNER = '*** TEST FIXTURE — NOT LIVE MARKET PRICE ***';

const VEHICLE: PartsSearchInput = {
  query: 'front brake pads',
  year: 2019, make: 'Toyota', model: 'Tacoma', engine: '3.5L',
  vin: 'JTEBU5JR0K5123456',
  currency: 'USD',
};

/** Shaped exactly like an eBay Browse itemSummary response. */
const FIXTURE: { itemSummaries: EbayItemSummary[] } = {
  itemSummaries: [
    {
      itemId: 'v1|1101|0',
      title: 'Akebono ProACT ACT976 Ceramic Front Brake Pad Set',
      brand: 'Akebono', mpn: 'ACT976',
      image: { imageUrl: 'https://i.ebayimg.com/images/g/aaa/s-l500.jpg' },
      itemWebUrl: 'https://www.ebay.com/itm/1101',
      price: { value: '64.95', currency: 'USD' },
      shippingOptions: [{
        shippingCost: { value: '8.00', currency: 'USD' },
        minEstimatedDeliveryDate: '2026-09-02T00:00:00.000Z',
        maxEstimatedDeliveryDate: '2026-09-05T00:00:00.000Z',
      }],
      condition: 'New',
      seller: { username: 'brakedepot', feedbackPercentage: '99.2' },
      compatibilityMatch: 'COMPATIBLE',
      localizedAspects: [{ name: 'Warranty', value: '2 Years' }],
    },
    {
      itemId: 'v1|1102|0',
      title: 'Premium Ceramic Front Brake Pads - Fits Many Trucks',
      brand: 'GenericBrake', mpn: 'GB-4471',
      itemWebUrl: 'https://www.ebay.com/itm/1102',
      price: { value: '28.50', currency: 'USD' },
      shippingOptions: [{
        shippingCost: { value: '19.99', currency: 'USD' },
        maxEstimatedDeliveryDate: '2026-09-20T00:00:00.000Z',
      }],
      condition: 'New',
      seller: { username: 'valueparts', feedbackPercentage: '93.1' },
      compatibilityMatch: 'UNDETERMINED', // keyword match only
    },
    {
      itemId: 'v1|1103|0',
      title: 'Bosch QuietCast BC976 Front Brake Pads',
      brand: 'Bosch', mpn: 'BC976',
      image: { imageUrl: 'https://i.ebayimg.com/images/g/ccc/s-l500.jpg' },
      itemWebUrl: 'https://www.ebay.com/itm/1103',
      price: { value: '71.00', currency: 'USD' },
      shippingOptions: [{
        shippingCost: { value: '0', currency: 'USD' },
        maxEstimatedDeliveryDate: '2026-09-03T00:00:00.000Z',
      }],
      condition: 'New',
      seller: { username: 'boschdirect', feedbackPercentage: '99.8' },
      compatibilityMatch: 'COMPATIBLE',
    },
    {
      itemId: 'v1|1104|0',
      title: 'Rear Brake Pad Set - Hilux',
      brand: 'Aisin', mpn: 'AI-2210',
      itemWebUrl: 'https://www.ebay.com/itm/1104',
      price: { value: '41.00', currency: 'USD' },
      shippingOptions: [{ shippingCost: { value: '6.00', currency: 'USD' } }],
      condition: 'New',
      seller: { username: 'jdmparts', feedbackPercentage: '97.0' },
      compatibilityMatch: 'NOT_COMPATIBLE',
    },
  ],
};

const money = (v: number | null | undefined, cur = 'USD') =>
  v === null || v === undefined ? '—' : `${cur} ${v.toFixed(2)}`;

function main() {
  console.log('\n' + BANNER);
  console.log('='.repeat(64));
  console.log(`Vehicle: ${VEHICLE.year} ${VEHICLE.make} ${VEHICLE.model} ${VEHICLE.engine}`);
  console.log(`VIN:     ${'*'.repeat(13)}${VEHICLE.vin!.slice(-4)}   (masked, as it is in logs)`);
  console.log(`Search:  "${VEHICLE.query}"`);
  console.log(`Provider: eBay  [FIXTURE — adapter is real, credentials are absent]`);
  console.log('='.repeat(64));

  const normalized = normalizeEbayResponse(FIXTURE, VEHICLE, {
    checkedAt: new Date().toISOString(),
    defaultCurrency: 'USD',
  });

  const ranked = rankParts(normalized).sort(
    (a, b) => b.recommendation.score - a.recommendation.score);

  for (const { part, recommendation } of ranked) {
    console.log('');
    if (recommendation.label) console.log(`  🏆 ${LABEL_TEXT[recommendation.label]}`);
    console.log(`  ${part.title}`);
    console.log(`     fitment    ${FITMENT_LABEL[part.fitmentStatus]}`);
    if (needsFitmentWarning(part.fitmentStatus)) console.log(`                ⚠ ${FITMENT_WARNING}`);
    console.log(`     brand      ${part.brand ?? '—'}   part# ${part.manufacturerPartNumber ?? '—'}`);
    console.log(`     item       ${money(part.itemPrice, part.currency)}`);
    console.log(`     shipping   ${part.shippingCost === undefined ? 'not stated' : money(part.shippingCost, part.currency)}`);
    console.log(`     LANDED     ${money(part.landedCost, part.currency)}  (${part.landedCostCompleteness})`);
    console.log(`     score      ${recommendation.score}/100`);
    for (const r of recommendation.reasons) console.log(`       • ${r}`);
  }

  // The technician picks the recommended part, 1 off, 35% markup.
  const chosen = ranked.find(r => r.recommendation.label === 'best_overall')!;
  const line = buildEstimateLineFromPart({
    part: chosen.part, qty: 1, markupType: 'percentage', markupValue: 35, currency: 'USD',
  });

  console.log('\n' + '='.repeat(64));
  console.log('SELECTED — technician chose the part, qty and markup');
  console.log('='.repeat(64));
  console.log(`  part        ${chosen.part.title}`);
  console.log(`  landed cost ${money(line.cost)}`);
  console.log(`  markup      ${line.markup}%`);
  console.log(`  sell price  ${money(line.rate)}   <- what the customer is quoted`);
  console.log(`  qty         ${line.qty}`);

  console.log('\nFROZEN SNAPSHOT stored in estimates.lines JSONB (no migration):');
  const s = line.partsSource!;
  console.log(`  provider ${s.sourceProvider}  listing ${s.sourceListingId}`);
  console.log(`  item ${money(s.sourceItemPrice)}  shipping ${money(s.sourceShippingCost)}  landed ${money(s.landedCost)}`);
  console.log(`  tax ${s.sourceTax === null ? 'unknown (not invented)' : s.sourceTax}  duty ${s.sourceImportDuty === null ? 'unknown (not invented)' : s.sourceImportDuty}`);
  console.log(`  fitment ${s.fitmentStatus}  checkedAt ${s.sourceCheckedAt}`);
  console.log(`  sellUnitPrice ${money(s.sellUnitPrice)}`);

  const estimate = {
    currency: 'USD', discount: 0, shopSupplies: 0, taxRate: 0,
    lines: [{ note: line.note, description: line.description, qty: line.qty, rate: line.rate }],
  } as unknown as EstimateFull;
  const totals = calculateEstimateTotals(estimate);

  console.log('\nESTIMATE LINE via the CANONICAL money model (qty x rate):');
  console.log(`  ${line.qty} x ${money(line.rate)} = ${money(totals.subtotal)}`);
  console.log(`  total ${money(totals.total)}`);
  console.log('\n' + BANNER + '\n');
}

main();
