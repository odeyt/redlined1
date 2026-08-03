/**
 * The signup page must describe what a customer actually gets.
 *
 * Until 2026-08-03 it promised "Free forever with core features", which was
 * accurate then. New accounts now get a TRIAL_DAYS trial with every module
 * unlocked, lapsing to that same free tier — so the old wording undersold the
 * first week and said nothing about the trial the customer is starting.
 *
 * The number is quoted from TRIAL_DAYS rather than typed into the copy, so
 * changing the trial length cannot leave the page claiming the old figure.
 *
 * TRIAL_DAYS lives in planGate, not in ShopProvisioningService: this page is a
 * client component, and importing the provisioning service would pull
 * getAdminDb — and the service-role key — into the browser bundle.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { TRIAL_DAYS } from '../planGate';

const src = readFileSync(join(__dirname, '..', '..', 'app', 'signup', 'page.tsx'), 'utf8');

describe('signup copy', () => {
  it('mentions the trial', () => {
    expect(src).toMatch(/[Tt]rial/);
  });

  it('takes the length from TRIAL_DAYS rather than hardcoding it', () => {
    expect(src).toMatch(/\$\{TRIAL_DAYS\}/);
    // A literal "7-day" would go stale the moment TRIAL_DAYS changes.
    expect(src).not.toMatch(/7[- ]day/i);
  });

  it('still promises the free tier afterwards, which remains true', () => {
    expect(src).toMatch(/free forever/i);
  });

  it('still says no credit card is required, because none is', () => {
    expect(src).toMatch(/no credit card/i);
  });

  it('has a sane trial length to advertise', () => {
    expect(TRIAL_DAYS).toBeGreaterThan(0);
    expect(TRIAL_DAYS).toBeLessThanOrEqual(30);
  });
});

describe('client/server boundary', () => {
  it('the signup page imports TRIAL_DAYS from planGate, not the provisioning service', () => {
    expect(src).toMatch(/import \{ TRIAL_DAYS \} from '@\/lib\/planGate'/);
    expect(src).not.toMatch(/ShopProvisioningService/);
  });

  it('planGate stays free of server-only imports', () => {
    const planGate = readFileSync(join(__dirname, '..', 'planGate.ts'), 'utf8');
    // Import statements only. The file names getAdminDb in a comment
    // explaining why it must not import it, which a bare text match would
    // flag as the very problem it is documenting.
    const imports = planGate.match(/^\s*import .*$/gm) ?? [];
    expect(imports.join('\n')).not.toMatch(/supabaseServer|supabase-js/);
  });
});
