/**
 * A new job card is worth nothing until somebody says otherwise.
 *
 * Every job card created anywhere in the app used to open holding 1.6 labour
 * hours and $96.50 of parts, picked from the service type and written to the
 * database. Nobody quoted them. Staff read them as a quote, and the revenue
 * engines that sum job_cards.parts_total read them as money — so a shop that
 * had booked fifty jobs and priced none of them still showed roughly $4,800 of
 * parts it had never sold.
 *
 * The rule these tests hold: a newly created job must never display or persist
 * a financial, labour or parts value unless a person entered it, or it comes
 * from shop configuration that is genuinely applicable to that field. Hours
 * and parts totals have no such configuration — they are measurements of work
 * nobody has done yet — so they start at zero. A labour *rate* does have one,
 * so it must be read from settings rather than guessed at.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { SHOP_PRICING_DEFAULTS } from '../../lib/shopPricingDefaults';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Every path that brings a job card into existence. Traced 2026-09-11:
 *  these are the only callers of createJobCard, plus the unreachable reducer
 *  the original figures came from and the direct insert in Communication. */
const JOB_CREATION_PATHS = [
  'services/jobCardService.ts',            // the insert itself
  'services/inspectionCompletionService.ts', // inspection completion (mobile)
  'features/triage/TriageView.tsx',        // intake → job card
  'features/job-cards/JobCardsView.tsx',   // manual create, desktop + mobile
  'features/communication/CommunicationView.tsx', // AI receptionist intake
  'lib/store.tsx',                         // unreachable reducer
];

describe('the fabricated figures are gone', () => {
  it('no job creation path mentions 96.5 or the 1.6/1.1 hour guess in code', () => {
    for (const path of JOB_CREATION_PATHS) {
      const code = read(path)
        // Comments explaining the removal are the point, not a relapse.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(`${path}: ${code}`).not.toMatch(/96\.5/);
      expect(`${path}: ${code}`).not.toMatch(/\?\s*1\.1\s*:\s*1\.6/);
    }
  });

  it('createJobCard writes zero hours and zero parts, not a service-type guess', () => {
    const src = read('services/jobCardService.ts');
    const insert = src.slice(src.indexOf('export async function createJobCard'));
    const body = insert.slice(0, insert.indexOf('\nexport '));

    expect(body).toMatch(/labor_hours:\s*0,/);
    expect(body).toMatch(/parts_total:\s*0,/);
    // No branch on service type is left to reintroduce a figure.
    expect(body).not.toMatch(/labor_hours:.*serviceType/);
    expect(body).not.toMatch(/parts_total:.*serviceType/);
  });

  it('offers no override for a caller to re-fabricate them through', () => {
    // The fix is not "pass 0 at each call site" — that leaves the fabrication
    // one forgotten argument away from coming back.
    const src = read('services/jobCardService.ts');
    const sig = src.slice(src.indexOf('export async function createJobCard'));
    const params = sig.slice(0, sig.indexOf('}): Promise<JobCardFull>'));
    expect(params).not.toMatch(/laborHours\?/);
    expect(params).not.toMatch(/partsTotal\?/);
  });

  it('leaves no caller passing labour or parts figures into creation', () => {
    for (const path of ['services/inspectionCompletionService.ts', 'features/triage/TriageView.tsx', 'features/job-cards/JobCardsView.tsx']) {
      const code = read(path);
      const call = code.indexOf('createJobCard({');
      if (call === -1) continue;
      const args = code.slice(call, code.indexOf('});', call));
      expect(`${path}: ${args}`).not.toMatch(/laborHours|partsTotal/);
    }
  });
});

describe('rates and currency come from shop configuration', () => {
  it('the follow-on records read the shop, not a literal', () => {
    const src = read('services/jobCardFollowOnService.ts');
    expect(src).toMatch(/fetchShopSettings/);
    expect(src).toMatch(/laborRate:\s+pricing\.laborRate/);
    expect(src).toMatch(/currency:\s+pricing\.currency/);
    // The two literals that used to sit at the top of this file.
    expect(src).not.toMatch(/const DEFAULT_LABOR_RATE\s*=/);
    expect(src).not.toMatch(/const DEFAULT_CURRENCY\s*=/);
  });

  it('falls back to the defined default rather than a third answer', () => {
    const src = read('services/jobCardFollowOnService.ts');
    expect(src).toMatch(/SHOP_PRICING_DEFAULTS\.laborRate/);
    expect(src).toMatch(/SHOP_PRICING_DEFAULTS\.currency/);
  });

  it('keeps exactly one definition of the shop pricing defaults', () => {
    // Eight copies of `?? 145` across services, views and API routes is how a
    // shop ends up being quoted two different hourly rates by two screens.
    const offenders: string[] = [];
    for (const path of [
      'services/shopSettingsService.ts', 'services/repairOrderService.ts',
      'services/jobCardService.ts', 'services/jobCardFollowOnService.ts',
      'features/repair-orders/RepairOrdersView.tsx', 'features/settings/SettingsView.tsx',
      'app/api/labor-guide/route.ts', 'app/api/labor-guide/seed/route.ts',
      'app/api/labor-guide/lookup/route.ts', 'app/api/labor-lookup/route.ts',
    ]) {
      const code = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/\?\?\s*145|:\s*145\b|useState\(145\)/.test(code)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it('states the defaults as numbers a shop could actually change', () => {
    expect(SHOP_PRICING_DEFAULTS.laborRate).toBeGreaterThan(0);
    expect(SHOP_PRICING_DEFAULTS.taxRate).toBeGreaterThanOrEqual(0);
    expect(SHOP_PRICING_DEFAULTS.currency).toBeTruthy();
  });
});

describe('the follow-on records still quote nothing', () => {
  it('opens the repair order with no hours and no parts total', () => {
    const src = read('services/jobCardFollowOnService.ts');
    expect(src).toMatch(/laborHours:\s+0,/);
    expect(src).toMatch(/partsTotal:\s+0,/);
  });

  it('opens the parts quotation empty — no lines, no deposit, no total', () => {
    const src = read('services/jobCardFollowOnService.ts');
    const call = src.slice(src.indexOf('await createPartsEstimate({'));
    const args = call.slice(0, call.indexOf('});'));
    expect(args).toMatch(/lineItems:\s+\[\],/);
    expect(args).toMatch(/quantity:\s+0,/);
    expect(args).toMatch(/unitCost:\s+0,/);
    expect(args).toMatch(/totalCost:\s+0,/);
    expect(args).toMatch(/coreCharge:\s+0,/);
    expect(args).toMatch(/deposit:\s+0,/);
    expect(args).toMatch(/status:\s+'Draft',/);
  });

  it('adds no tax or discount of its own to either record', () => {
    const src = read('services/jobCardFollowOnService.ts');
    expect(src).not.toMatch(/taxRate|discount|shopSupplies/);
  });
});
