/**
 * The rule that makes the domain layer worth having.
 *
 * If a domain module can reach the browser Supabase singleton or the mutable
 * shop store, then it only works inside a signed-in tab — and every other
 * caller (API, MCP, WhatsApp webhook, scheduled job, AI tool) has to
 * reimplement the business rule instead. That is the failure this whole
 * milestone exists to prevent, and it would reappear one convenient import at
 * a time, so it is checked mechanically rather than left to review.
 *
 * The browser adapter is the single, deliberate exception: translating browser
 * state into an explicit context is its entire job.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DOMAIN_DIR = join(__dirname, '..');
const ADAPTER = 'browserAdapter.ts';

function domainModules(): string[] {
  return readdirSync(DOMAIN_DIR).filter(f => f.endsWith('.ts') && f !== ADAPTER);
}

function source(file: string): string {
  const raw = readFileSync(join(DOMAIN_DIR, file), 'utf8');
  // Comments discuss these very imports at length. Asserting against a file
  // with its comments intact would let a module pass or fail on its own prose.
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('domain modules cannot depend on browser state', () => {
  it('finds the modules it is supposed to be checking', () => {
    // A guard that silently checks nothing is worse than no guard.
    const modules = domainModules();
    expect(modules).toEqual(expect.arrayContaining(['customers.ts', 'invoices.ts', 'payments.ts']));
  });

  it.each(domainModules())('%s does not import the browser Supabase client', file => {
    const code = source(file);
    expect(code).not.toMatch(/from\s+['"]@\/lib\/supabase['"]/);
    expect(code).not.toMatch(/from\s+['"]\.\.\/supabase['"]/);
  });

  it.each(domainModules())('%s does not import the service-role client', file => {
    // A domain module that reaches for the service role decides its own
    // privileges. That choice belongs to the caller, which is the only party
    // that knows whether its situation deserves them.
    const code = source(file);
    expect(code).not.toMatch(/supabase-server|supabaseServer|SERVICE_ROLE/);
  });

  it.each(domainModules())('%s does not read the mutable shop store', file => {
    const code = source(file);
    expect(code).not.toMatch(/shopStore|getShopIds|getShopId\b/);
  });

  it.each(domainModules())('%s does not touch browser globals', file => {
    const code = source(file);
    expect(code).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bwindow\./);
  });

  it('the browser adapter is the one place that reads the shop store', () => {
    // Stated as a positive assertion so that deleting the adapter's job, or
    // moving it somewhere less visible, fails here.
    const adapter = readFileSync(join(DOMAIN_DIR, ADAPTER), 'utf8');
    expect(adapter).toMatch(/getShopIds/);
    expect(adapter).toMatch(/createDomainContext/);
  });
});
