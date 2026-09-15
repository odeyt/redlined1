/**
 * The marketing capture records production. These tests keep it from running by
 * accident, and keep its migration honest.
 *
 * They read the real files rather than asserting on remembered strings, and each
 * property is checked the way it would actually fail: a Playwright project whose
 * pattern would match a capture file, a migration body that differs from the
 * reviewed one by more than the single intended line.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r/g, '');

const CAPTURE_FILES = [
  'tests/marketing-capture/first-workflow.capture.ts',
  'tests/marketing-capture/demo-session.prepare.ts',
  'tests/marketing-capture/gate-facts.ts',
];

describe('the default Playwright run can never pick up the capture', () => {
  const mainConfig = read('playwright.config.ts');

  it('the capture files exist where these tests expect them', () => {
    for (const f of CAPTURE_FILES) expect(existsSync(join(root, f))).toBe(true);
  });

  it('playwright.config.ts does not reference the marketing config or its folder', () => {
    expect(mainConfig).not.toMatch(/marketing\.config|marketing-capture/);
  });

  it('no testMatch regex in playwright.config.ts matches a capture file, with either slash', () => {
    // Greedy to the LAST slash on the line: patterns such as /tests[/\\]smoke[/\\].*\.spec\.ts/
    // contain slashes inside character classes.
    const patterns = [...mainConfig.matchAll(/testMatch:\s*\/(.*)\/[a-z]*,\s*$/gm)].map(m => new RegExp(m[1]));
    expect(patterns.length).toBeGreaterThan(3); // setup, smoke, local, audit, marketing...
    for (const f of CAPTURE_FILES) {
      for (const path of [f, f.replace(/\//g, '\\')]) {
        for (const re of patterns) expect({ path, pattern: re.source, matches: re.test(path) }).toMatchObject({ matches: false });
      }
    }
  });

  it('projects without a testMatch use the default spec/test pattern, which capture files avoid', () => {
    for (const f of CAPTURE_FILES) expect(f).not.toMatch(/\.(spec|test)\.[cm]?[jt]sx?$/);
  });

  it('no capture file is named auth.setup.ts, which the setup project matches anywhere', () => {
    for (const f of CAPTURE_FILES) expect(f).not.toMatch(/auth\.setup\.ts/);
  });
});

describe('the marketing config is locked down', () => {
  const cfg = read('playwright.marketing.config.ts');

  it('fixes the production URL rather than reading it from the environment', () => {
    expect(cfg).toContain("export const MARKETING_BASE_URL = 'https://www.redlined1.com';");
    expect(cfg).toContain('baseURL: MARKETING_BASE_URL');
    expect(cfg).not.toMatch(/process\.env\.(PLAYWRIGHT_BASE_URL|TEST_BASE_URL|VERCEL_PREVIEW_URL)/);
  });

  it('never loads .env.e2e.local, whose PLAYWRIGHT_BASE_URL would steer it', () => {
    const code = cfg.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toContain('.env.e2e.local');
  });

  it('one worker, no retries, and refuses CI', () => {
    expect(cfg).toMatch(/workers:\s*1,/);
    expect(cfg).toMatch(/retries:\s*0,/);
    expect(cfg).toMatch(/if \(process\.env\.CI\)\s*\{\s*throw/);
  });

  it('the capture project does not depend on the login step', () => {
    const capture = cfg.slice(cfg.indexOf("name: 'marketing-capture'"));
    expect(capture).not.toMatch(/dependencies/);
  });
});

describe('secrets and output stay out of git', () => {
  it('marketing-output/ is gitignored', () => {
    expect(read('.gitignore')).toMatch(/^marketing-output\/$/m);
  });
  it('the saved session lives under tests/.auth, whose .gitignore excludes *.json', () => {
    expect(read('tests/marketing-capture/gate-facts.ts')).toContain("'tests/.auth/marketing-demo.json'");
    expect(read('tests/.auth/.gitignore')).toMatch(/^\*\.json$/m);
  });
  it('the credential file is outside the repository', () => {
    const p = read('scripts/marketing/credential-path.ts');
    expect(p).toContain('homedir()');
    expect(p).not.toMatch(/__dirname|process\.cwd\(\)/);
  });
  it('the seed never prints the password', () => {
    const code = read('scripts/marketing/seed-demo-tenant.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const line of code.split('\n').filter(l => /console\.(log|error|warn|info)/.test(l))) {
      expect(line).not.toMatch(/password/i);
    }
  });
});

describe('the capture and seed stay inside their lane', () => {
  const capture = read('tests/marketing-capture/first-workflow.capture.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const seed = read('scripts/marketing/seed-demo-tenant.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

  it('every click in the walkthrough goes through press(), which refuses forbidden controls', () => {
    const clicks = [...capture.matchAll(/\.click\(/g)].length;
    // Exactly one: inside press() itself.
    expect(clicks).toBe(1);
    expect(capture).toMatch(/async function press[\s\S]*?isForbiddenControl[\s\S]*?\.click\(\)/);
  });

  it('never targets Close, Void or Send Back by name', () => {
    expect(capture).not.toMatch(/name:\s*['"`/](Close|Close Job|Void|Send Back)\b/);
  });

  it('the seed never deletes or upserts', () => {
    expect(seed).not.toMatch(/\.delete\(|\.upsert\(/);
  });

  describe('the seed reads the shop back as synthetic before writing into it', () => {
    const body = (fn: string) => {
      const start = seed.indexOf(`async function ${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const next = seed.indexOf('\nasync function ', start + 1);
      return seed.slice(start, next === -1 ? undefined : next);
    };

    it('the check is judged by syntheticShopReadBackFailure from a fresh database read, and fails closed', () => {
      const confirm = body('confirmSyntheticShop');
      expect(confirm).toMatch(/from\('shops'\)\.select\('id, name, is_synthetic'\)\.eq\('id', shopId\)\.maybeSingle\(\)/);
      expect(confirm).toMatch(/syntheticShopReadBackFailure\(readBack, shopId\)/);
      expect(confirm).toMatch(/if \(failure\) fail\(/);
    });

    it('CREATE: right after the shop insert, before the owner membership or any record', () => {
      const create = body('create');
      const shopInsert = create.indexOf("from('shops')");
      const confirm = create.indexOf('await confirmSyntheticShop(client, shopId)');
      expect(shopInsert).toBeGreaterThan(-1);
      expect(confirm).toBeGreaterThan(shopInsert);
      expect(confirm).toBeLessThan(create.indexOf("from('shop_users')"));
      expect(confirm).toBeLessThan(create.indexOf("from('profiles')"));
      expect(confirm).toBeLessThan(create.indexOf('ensureRecords('));
    });

    it('REPAIR: before ensureRecords', () => {
      const repair = body('repair');
      expect(repair.indexOf('await confirmSyntheticShop(client, shopId)')).toBeGreaterThan(-1);
      expect(repair.indexOf('await confirmSyntheticShop(client, shopId)')).toBeLessThan(repair.indexOf('ensureRecords('));
    });

    it('ensureRecords re-checks before its first write, so no caller can skip it', () => {
      const ensure = body('ensureRecords');
      const confirm = ensure.indexOf('await confirmSyntheticShop(client, shopId)');
      expect(confirm).toBeGreaterThan(-1);
      for (const write of ['.update(', '.insert(', 'insertOne(']) {
        const at = ensure.indexOf(write);
        if (at !== -1) expect(confirm).toBeLessThan(at);
      }
    });
  });

  it('seed output interpolates nothing sensitive', () => {
    // Every console line and every refusal message. Literal names such as
    // 'SUPABASE_SERVICE_ROLE_KEY is not set' are fine; interpolated VALUES are not.
    const lines = seed.split('\n').filter(l => /console\.(log|error|warn|info)\(|\bfail\(/.test(l));
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      for (const [, expr] of line.matchAll(/\$\{([^}]*)\}/g)) {
        expect({ line: line.trim(), expr }).toMatchObject({
          expr: expect.not.stringMatching(/password|secret|token|session|key|phone|email|credential/i),
        });
      }
    }
  });

  it('every seed UPDATE is scoped to one demo row', () => {
    // Each statement runs from `.update(` to its terminating semicolon; object
    // literals in this file contain no semicolons.
    const statements = seed.split('.update(').slice(1).map(s => s.slice(0, s.indexOf(';')));
    expect(statements.length).toBe(3); // profile, shop settings, invoice link
    for (const s of statements) expect(s).toMatch(/\.eq\('(id|shop_id)'/);
  });
});

describe('the migration replaces exactly the reviewed functions, plus one line each', () => {
  const sql = read('supabase/migrations/2026-09-15_shops_is_synthetic.sql');
  const fingerprint = (body: string) =>
    createHash('md5').update(body.replace(/\r/g, '').replace(/^[ \n\t]+|[ \n\t]+$/g, '')).digest('hex');

  function bodyOf(fn: string): string {
    const start = sql.indexOf(`create or replace function ${fn}()`);
    expect(start).toBeGreaterThan(-1);
    const a = sql.indexOf('as $$', start) + 5;
    return sql.slice(a, sql.indexOf('$$;', a));
  }

  it.each([
    ['growth_subscription_summary_v1', 'e5d1716fae635eb98df3e34b5bbfdb40', '    where not s.is_synthetic\n'],
    ['growth_shop_activation_v1', 'cb25d39008ec9503bdfac1cfe202ce8c', '  where not s.is_synthetic\n'],
  ])('%s = reviewed body (md5 %s) + the synthetic filter, nothing else', (fn, reviewed, line) => {
    const body = bodyOf(fn);
    expect(body.split(line).length).toBe(2);          // the line appears exactly once
    expect(fingerprint(body.replace(line, ''))).toBe(reviewed);
    // The same fingerprint is what the preflight displays and what the guard enforces.
    expect(sql.split(reviewed).length - 1).toBe(2);
  });

  it('does not DROP any growth function, so existing EXECUTE grants survive', () => {
    expect(sql.replace(/^--.*$/gm, '')).not.toMatch(/drop function[^;]*growth_/i);
  });

  it('does not touch growth_funnel_summary_v1, which inherits the exclusion', () => {
    expect(sql.replace(/^--.*$/gm, '')).not.toMatch(/function growth_funnel_summary_v1/);
  });

  it('the guard runs before any schema change', () => {
    const guard = sql.indexOf('DO $guard$');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(sql.indexOf('ALTER TABLE public.shops'));
  });

  it('the probe runs in its own transaction and ends in ROLLBACK', () => {
    const probe = sql.slice(sql.indexOf('DO $probe$'));
    expect(sql.lastIndexOf('COMMIT;')).toBeLessThan(sql.indexOf('DO $probe$'));
    expect(probe).toMatch(/\$probe\$;\s*ROLLBACK;/);
  });

  it('the tenant guard is not SECURITY DEFINER, so current_user is the caller', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.shops_guard_is_synthetic()'), sql.indexOf('$fn$;'));
    expect(fn).not.toMatch(/SECURITY DEFINER/i);
    expect(fn).toMatch(/current_user IN \('postgres', 'service_role', 'supabase_admin'\)/);
  });
});
