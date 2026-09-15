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

  describe('the seed checks the live schema, and writes only through the tested builders', () => {
    const fnBody = (fn: string) => {
      const start = seed.indexOf(`async function ${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const next = seed.indexOf('\nasync function ', start + 1);
      return seed.slice(start, next === -1 ? undefined : next);
    };

    it('preflight refuses on any schema failure, and runs before either mode writes anything', () => {
      expect(fnBody('preflight')).toMatch(/schemaWriteFailures\(await readLiveSchema\(\)\)/);
      expect(fnBody('preflight')).toMatch(/if \(schemaFailures\.length\) fail\(/);
      const main = fnBody('main');
      const pre = main.indexOf('await preflight(client)');
      expect(pre).toBeGreaterThan(-1);
      expect(pre).toBeLessThan(main.indexOf('repair(client'));
      expect(pre).toBeLessThan(main.indexOf('create(client)'));
    });

    it('reading the schema is a GET and nothing else', () => {
      const read = fnBody('readLiveSchema');
      expect(read).toMatch(/method: 'GET'/);
      expect(read).not.toMatch(/method: '(POST|PUT|PATCH|DELETE)'/);
    });

    it('the invoice goes through invoiceRow (object lines, explicit owner_id) and is read back and judged', () => {
      const ensure = fnBody('ensureRecords');
      expect(ensure).toMatch(/insertOne\('invoices', invoiceRow\(\{ customerId: String\(customer\.id\), jobCardId: String\(jobCard\.id\), ownerId \}\)\)/);
      expect(ensure).toMatch(/seededInvoiceFailure\(stored\.error \? null : stored\.data\)/);
      expect(ensure).toMatch(/if \(invoiceFailure\) fail\(invoiceFailure\)/);
      // No inline row literals left for the tables the builders own.
      expect(seed).not.toMatch(/lines:\s*\[\s*\[/);
      expect(seed).not.toMatch(/insertOne\('(technicians|customers|vehicles|job_cards|invoices|repair_orders)', \{/);
    });

    it('the invoice owner is the demo shop\'s sole owner, resolved before any record insert', () => {
      const ensure = fnBody('ensureRecords');
      const owner = ensure.indexOf(".eq('role', 'owner')");
      expect(owner).toBeGreaterThan(-1);
      expect(ensure).toMatch(/owners\.data\?\.length !== 1\) fail\(/);
      expect(owner).toBeLessThan(ensure.indexOf("insertOne('technicians'"));
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

  describe('owner-reviewed blocks are pinned byte-for-byte; STEP 3b is appended after them', () => {
    const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
    const block = (start: string, end: string, from = 0) => {
      const a = sql.indexOf(start, from);
      expect(a).toBeGreaterThan(-1);
      const b = sql.indexOf(end, a);
      expect(b).toBeGreaterThan(a);
      return sql.slice(a, b + end.length);
    };
    const step2 = () => block('BEGIN;\n\nDO $guard$', 'COMMIT;\n');
    const step3 = () => block('BEGIN;\n\nDO $probe$', '$probe$;\n\nROLLBACK;\n');
    const step4 = () => block('SELECT\n  (SELECT count(*) FROM public.shops)', "LIKE 'growth\\_%\\_v1';\n");
    const step3b = () => block('BEGIN;\n\nDO $probe_roles$', '$probe_roles$;\n\nROLLBACK;\n');
    const postCheck = () => block('BEGIN TRANSACTION READ ONLY;\n\nWITH\nchecks', 'ORDER BY ord;\n\nROLLBACK;');
    const step1 = () => block('SELECT p.proname::text AS check_name,', "       'false';\n");
    const postCheckLines = () => block('BEGIN TRANSACTION READ ONLY;\n\nWITH\nchecks', 'ORDER BY ord;\n\nROLLBACK;\n');
    const preCheck = () => block('BEGIN TRANSACTION READ ONLY;\n\nWITH\nrel (table_name, rel) AS (VALUES', 'ORDER BY ord;\n\nROLLBACK;\n');
    const code = (t: string) => t.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");

    it.each([
      ['STEP 1', step1, '085469fb0f6c681ccd3c2d3554c697c300673840ccd0554676a85dab9ca94a03'],
      ['POST-ROLLBACK CHECK', postCheckLines, '75d5e492c72e03edf76b5f4f80fa76bf327e4067373e5be41f226c0732f1a631'],
      ['PRE-CHECK', preCheck, '1d81977d7fe2496ccf103f2ec232ff1f3569c1bb332d3250d95d33b291a82f95'],
      ['STEP 2', step2, '474f8473ebe9109882487df5846469f31178792d13b2224f92ccef2823385429'],
      ['STEP 3', step3, '33de41473a02d5c14e56ff301e903899e1e02007029cecef7044f74981fb31e0'],
      ['STEP 4', step4, '865ad24b110e4b363755e4ea2659c7b78c616bd25b7d681a5c7cc9bd9db8a9f1'],
      ['STEP 3b', step3b, 'e6362bdf0754de0cab12c79915b94e001c738ba825b519ee9766a5dae7875bde'],
    ])('%s still hashes to the owner-reviewed value', (_name, get, expected) => {
      expect(sha(get())).toBe(expected);
    });

    it('STEP 3b and the post-rollback check sit after STEP 4 and the rollback notes', () => {
      const afterReviewed = Math.max(sql.indexOf(step4()) + step4().length, sql.indexOf('-- Rollback'));
      expect(sql.indexOf(step3b())).toBeGreaterThan(afterReviewed);
      expect(sql.indexOf(postCheck())).toBeGreaterThan(sql.indexOf(step3b()));
      expect(sql.split('DO $probe_roles$').length - 1).toBe(1);
    });

    it('STEP 3b is one rolled-back transaction with no commit', () => {
      const probe = step3b();
      expect(probe.startsWith('BEGIN;')).toBe(true);
      expect(probe.trimEnd().endsWith('ROLLBACK;')).toBe(true);
      expect(code(probe)).not.toMatch(/\bcommit\b/i);
    });

    it('STEP 3b switches only to service_role, authenticated and anon, and checks the role is restored', () => {
      const roles = [...code(step3b()).matchAll(/SET LOCAL ROLE (\w+);/g)].map(m => m[1]);
      expect(roles).toEqual(['service_role', 'authenticated', 'anon']);
      expect(code(step3b())).toMatch(/RESET ROLE;/);
      expect(step3b().split("IF current_user <> 'postgres' THEN RAISE EXCEPTION").length - 1).toBe(2);
    });

    it('STEP 3b writes only probe rows in public.shops, and nothing that could notify, bill or call out', () => {
      const body = code(step3b());
      expect([...body.matchAll(/\bINSERT INTO (\S+)/g)].map(m => m[1])).toEqual(['public.shops', 'public.shops', 'public.shops']);
      expect([...body.matchAll(/\bUPDATE (\S+) SET/g)].map(m => m[1])).toEqual(['public.shops']);
      expect(body).not.toMatch(/\b(delete|truncate|alter|create|drop|grant|revoke|nextval|setval|http_post|alert_events|shop_users|profiles|invoices|payments|sapelee|auth\.)\b/i);
      const names = [...step3b().matchAll(/VALUES \('([^']+)'/g)].map(m => m[1]);
      expect(names).toEqual(['__probe_service__', '__probe_authenticated__', '__probe_anon__']);
      for (const n of names) expect(n.startsWith('__probe_')).toBe(true); // what the post-rollback check counts
    });

    it("STEP 3b's refusal checks match the guard's own message and SQLSTATE exactly", () => {
      const guard = sql.slice(sql.indexOf('FUNCTION public.shops_guard_is_synthetic()'), sql.indexOf('$fn$;'));
      const raised = [...guard.matchAll(/RAISE EXCEPTION '([^']+)' USING ERRCODE = '42501'/g)].map(m => m[1]);
      expect(raised).toEqual(['shops.is_synthetic is platform-managed', 'shops.is_synthetic is platform-managed']);
      // 42501 is the SQLSTATE PL/pgSQL names insufficient_privilege.
      expect(step3b().split('EXCEPTION WHEN insufficient_privilege THEN').length - 1).toBe(2);
      expect(step3b().split(`IF msg <> '${raised[0]}' THEN`).length - 1).toBe(2);
      expect(step3b().split('GUARD FAILURE:').length - 1).toBe(2);
    });

    describe('the committed PRE-CHECK', () => {
      it('is appended last, after the post-rollback check, and appears once', () => {
        expect(sql.indexOf(preCheck())).toBeGreaterThan(sql.indexOf(postCheckLines()) + postCheckLines().length - 1);
        expect(sql.split('rel (table_name, rel) AS (VALUES').length - 1).toBe(1);
        expect(sql.trimEnd().endsWith(preCheck().trimEnd())).toBe(true);
      });

      it('begins with BEGIN TRANSACTION READ ONLY and ends with ROLLBACK', () => {
        expect(preCheck().startsWith('BEGIN TRANSACTION READ ONLY;')).toBe(true);
        expect(preCheck().trimEnd().endsWith('ROLLBACK;')).toBe(true);
      });

      it('contains no write, MERGE, DDL, role switch, HTTP call or writable function call', () => {
        const body = code(preCheck());
        expect(body).not.toMatch(/\b(insert|update|delete|merge|upsert|truncate|copy|alter|create|drop|grant|revoke|comment|security|vacuum|analyze|reindex|cluster|refresh|lock|commit|savepoint|do|execute|perform|call|listen|notify)\b/i);
        expect(body).not.toMatch(/\b(set|reset)\b/i);
        expect(body).not.toMatch(/set_config|nextval|setval|currval|pg_advisory|pg_terminate|pg_cancel|dblink/i);
        expect(body).not.toMatch(/\bnet\s*\.|http_(get|post|put|delete|head|patch)|\bhttp\s*\(/i);
        // Every function it calls is a read-only catalog, privilege or aggregate function.
        const sqlWords = new Set(['values', 'as', 'in', 'exists', 'rel', 'checks']);
        const calls = [...new Set([...body.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)].map(m => m[1].toLowerCase()))]
          .filter(c => !sqlWords.has(c)).sort();
        expect(calls).toEqual([
          'array_position', 'coalesce', 'count', 'has_table_privilege', 'pg_get_expr', 'pg_get_userbyid',
          'pg_has_role', 'string_agg', 'to_regclass', 'to_regprocedure', 'unnest',
        ]);
      });

      it('reports exactly the reviewed checks, in order, with the reviewed expectations', () => {
        const rows = [...preCheck().matchAll(/SELECT (\d+), '([^']*)',\s*'([^']*)'/g)].map(m => [Number(m[1]), m[2], m[3]]);
        expect(rows).toEqual([
          [10, 'user triggers on shops', 'shops_create_settings (O), shops_guard_is_synthetic (O)'],
          [11, 'user triggers on shop_settings', '(none)'],
          [12, 'rewrite rules on shops / shop_settings', '(none)'],
          [13, 'create_shop_settings_for_new_shop writes only shop_settings', 'yes'],
          [14, 'shops columns NOT NULL without default (probe writes name, slug, is_synthetic)', 'subset of: name, slug'],
          [15, 'shop_settings columns NOT NULL without default (trigger writes shop_id, company_name, address, phone)', 'subset of: address, company_name, phone, shop_id'],
          [16, 'sequence-backed defaults (nextval is NOT undone by ROLLBACK)', '(informational)'],
          [17, 'baseline: shops total', '14'],
          [18, 'baseline: synthetic shops', '0'],
          [19, 'baseline: probe shops', '0'],
          [20, 'baseline: shop_settings rows', '(record)'],
          [21, 'baseline: shop_settings_id_seq last_value', '(record)'],
          [30, 'Step 3b prerequisite: postgres may SET ROLE to authenticated, anon, service_role', 'true, true, true'],
          [31, 'Step 3b prerequisite: BYPASSRLS for authenticated, anon, service_role', 'false, false, true'],
          [32, 'Step 3b prerequisite: INSERT privilege on shops for authenticated, anon; INSERT, UPDATE for service_role', 'true, true, true, true'],
          [33, 'policies on shops (ordinary-role UPDATE is also blocked by RLS unless a policy allows it)', '(informational)'],
        ]);
      });

      it('inspects the reviewed triggers, rules, required columns, sequences, baselines, roles, privileges and policies', () => {
        const q = preCheck();
        for (const fragment of [
          // both tables the probes write
          "('shops', to_regclass('public.shops'))",
          "('shop_settings', to_regclass('public.shop_settings'))",
          // user triggers only
          'JOIN pg_trigger t ON t.tgrelid = r.rel AND NOT t.tgisinternal',
          // rewrite rules
          "JOIN pg_rewrite w ON w.ev_class = r.rel",
          "WHERE w.rulename <> '_RETURN'",
          // NOT NULL columns with no default, identity or generation
          "WHERE a.attnotnull AND d.adbin IS NULL AND a.attidentity = '' AND a.attgenerated = ''",
          // sequence-backed defaults
          "WHERE a.attidentity <> '' OR pg_get_expr(d.adbin, d.adrelid) ILIKE '%nextval%'",
          "FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'shop_settings_id_seq'",
          // the settings trigger function, and what it must not touch
          "to_regprocedure('public.create_shop_settings_for_new_shop()')",
          "prosrc ILIKE '%insert into public.shop_settings%'",
          // baselines
          "(SELECT count(*)::text FROM public.shops)",
          "(SELECT count(*)::text FROM public.shops WHERE is_synthetic)",
          "(SELECT count(*)::text FROM public.shop_settings)",
          // role capabilities
          "pg_has_role('postgres', 'authenticated', 'SET')",
          "pg_has_role('postgres', 'anon', 'SET')",
          "pg_has_role('postgres', 'service_role', 'SET')",
          "FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'service_role')",
          // privileges
          "has_table_privilege('authenticated', 'public.shops', 'INSERT')",
          "has_table_privilege('anon', 'public.shops', 'INSERT')",
          "has_table_privilege('service_role', 'public.shops', 'INSERT')",
          "has_table_privilege('service_role', 'public.shops', 'UPDATE')",
          // policies
          "FROM pg_policy p WHERE p.polrelid = to_regclass('public.shops')",
        ]) {
          expect({ fragment, present: q.includes(fragment) }).toEqual({ fragment, present: true });
        }
        for (const forbidden of ['alert_events', 'net.', 'http', 'auth.', 'shop_users', 'profiles', 'invoice', 'payment', 'sapelee', 'outbox', 'update ', 'delete ']) {
          expect(q).toContain(`prosrc NOT ILIKE '%${forbidden}%'`);
        }
      });

      it('agrees with the rest of the migration: the triggers it expects, and the probe-name pattern', () => {
        expect(sql).toContain('CREATE TRIGGER shops_guard_is_synthetic');
        const probePattern = "name LIKE '\\_\\_probe\\_%'";
        expect(preCheck()).toContain(probePattern);
        expect(postCheck()).toContain(probePattern);
        for (const name of [...step3().matchAll(/VALUES \('([^']+)'/g), ...step3b().matchAll(/VALUES \('([^']+)'/g)].map(m => m[1])) {
          expect(name.startsWith('__probe_')).toBe(true);
        }
      });
    });

    it('the post-rollback check is read-only', () => {
      const check = postCheck();
      expect(check.startsWith('BEGIN TRANSACTION READ ONLY;')).toBe(true);
      expect(check.trimEnd().endsWith('ROLLBACK;')).toBe(true);
      expect(code(check)).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|commit|nextval|setval)\b/i);
    });
  });

  it('the tenant guard is not SECURITY DEFINER, so current_user is the caller', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.shops_guard_is_synthetic()'), sql.indexOf('$fn$;'));
    expect(fn).not.toMatch(/SECURITY DEFINER/i);
    expect(fn).toMatch(/current_user IN \('postgres', 'service_role', 'supabase_admin'\)/);
  });
});
