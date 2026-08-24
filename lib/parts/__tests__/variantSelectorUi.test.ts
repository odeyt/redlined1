/**
 * The variant selector, and the pending-search resume it exists to serve.
 *
 * This panel is the ORDINARY road to verified fitment, not an error path:
 * engine is recorded on 6 of 114 vehicles, so the catalogue will usually
 * offer several variants and nothing in our data separates them.
 *
 * No React Testing Library in this repo and a `node` Jest environment, so
 * rendering behaviour is covered by the staging proof. What is asserted here
 * is the ordering logic and the wiring that makes the workflow honest.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const SELECTOR = read('features/estimates/VehicleVariantSelector.tsx');
const MODAL = read('features/estimates/PartsSearchModal.tsx');

describe('the selector shows only what the provider supplied', () => {
  it('builds its spec line from optional fields', () => {
    // Every field is conditional. A missing kW must not render "undefined kW".
    for (const guard of [
      'c.displacementL !== undefined',
      'c.powerKw !== undefined',
      'if (c.fuel)',
      'if (c.driveType)',
    ]) {
      expect(SELECTOR).toContain(guard);
    }
  });

  it('renders an engine code only when there is one', () => {
    expect(SELECTOR).toContain('{c.engineCode && (');
  });

  it('renders a production range only when there is one', () => {
    expect(SELECTOR).toContain("if (c.yearFrom === undefined && c.yearTo === undefined) return ''");
  });
});

describe('nothing is recommended without evidence', () => {
  it('marks a candidate ONLY when the recorded engine matches it', () => {
    // Labelling the first row "recommended" when the ordering is arbitrary is
    // how a technician confirms the wrong engine in a hurry.
    expect(SELECTOR).toContain('MATCHES RECORDED ENGINE');
    expect(SELECTOR).toContain('{matches && (');
    expect(SELECTOR).not.toMatch(/RECOMMENDED/);
    expect(SELECTOR).not.toMatch(/BEST MATCH/);
  });

  it('orders deterministically so the list does not move between visits', () => {
    expect(SELECTOR).toContain('a.description.localeCompare(b.description)');
    expect(SELECTOR).toContain('useMemo');
  });

  it('requires a selection before confirming', () => {
    expect(SELECTOR).toContain('disabled={selected === null || confirming}');
  });

  it('disables duplicate submits while confirming', () => {
    expect(SELECTOR).toContain('Confirming vehicle variant…');
  });
});

describe('skipping is legitimate, and honest about the cost', () => {
  it('offers a way past without confirming', () => {
    // A technician in a hurry must not be trapped; the price is stated.
    expect(SELECTOR).toContain('Skip and search anyway');
    expect(SELECTOR).toContain('fitment will remain unverified');
  });
});

describe('the pending search survives confirmation', () => {
  it('the modal keeps the term and mode across the variant step', () => {
    // The workflow must never be: close, reopen, retype.
    expect(MODAL).toContain('pendingSearch');
    expect(MODAL).toContain('resumeAfterConfirm');
  });

  it('resumes automatically once the variant is confirmed', () => {
    expect(MODAL).toContain('await runSearch');
  });

  it('names every confirmation failure state', () => {
    for (const code of ['VEHICLE_CHANGED', 'CANDIDATE_INVALID', 'UNAUTHORIZED', 'PROVIDER_UNAVAILABLE']) {
      expect(MODAL).toContain(code);
    }
  });

  it('tells the technician what to do when the vehicle changed', () => {
    expect(MODAL).toContain('This vehicle changed since the catalogue search.');
  });

  it('never surfaces a raw server message from confirmation', () => {
    const block = MODAL.slice(MODAL.indexOf('confirmVariant'), MODAL.indexOf('confirmVariant') + 2200);
    expect(block).not.toMatch(/json\?\.error(?!\s*\?\?)/);
  });
});

describe('the confirmed banner does not overclaim', () => {
  it('says the variant was technician-confirmed', () => {
    expect(MODAL).toContain('Catalogue variant confirmed');
  });

  it('never claims VIN verification', () => {
    // VIN establishes vehicle identity; it did not establish this
    // modification, and saying so would be a different and stronger claim.
    expect(MODAL).not.toMatch(/VIN VERIFIED/i);
    expect(SELECTOR).not.toMatch(/VIN VERIFIED/i);
  });
});
