#!/usr/bin/env node
/**
 * Real-schema concurrency + application-role check for the Free Forever cap.
 * STAGING ONLY. Run by a person with their own connection string:
 *
 *   # PowerShell
 *   $env:STAGING_DATABASE_URL = "<session-pooler or direct connection string>"
 *   node tests/db/staging/free-tier-concurrency-staging.mjs
 *   node tests/db/staging/free-tier-concurrency-staging.mjs --cleanup   # remove leftovers only
 *
 * Safety:
 *   - Refuses to run unless the connection string targets the staging project
 *     ref kfwxmfvlfdurvjruadtc, and refuses if it mentions the production ref
 *     ldjrlvjkmzrcdqhetqoh. The password is never printed.
 *   - Use the DIRECT or SESSION-pooler string (port 5432). The transaction
 *     pooler (6543) is not suitable for a concurrency test.
 *   - Touches only rows it creates (emails/names/ids prefixed "zz-captest-conc"),
 *     committed so that separate sessions can see them, and deletes exactly
 *     those in a finally block. --cleanup removes leftovers from a crashed run.
 *     The two pre-existing staging accounts and all other data are never read
 *     or modified.
 *   - Signing up throwaway auth.users fires only the profile-creating signup
 *     triggers (reviewed: no outbound calls).
 *
 * What it proves (customers table; the function is shared by all three tables):
 *   1. The cap function and 3 cap triggers are installed.
 *   2. 14 simultaneous sessions, each a separate connection acting as the
 *      `authenticated` role for the shop owner, insert one customer into a
 *      FREE shop and hold their transaction open before committing: exactly 10
 *      commit, the rest fail with FREE_TIER_LIMIT:customers:10, and exactly 10
 *      rows exist. Proves the lock works on the real schema and that the
 *      application role can still insert (the cap function needs no EXECUTE).
 *   3. The same 14 against a PROFESSIONAL shop all commit (no cap, no wait).
 * If row-level security refuses the application-role insert for a reason
 * unrelated to the cap, the run reports INCONCLUSIVE rather than passing.
 */
import pg from 'pg';

const STAGING_REF = 'kfwxmfvlfdurvjruadtc';
const PROD_REF = 'ldjrlvjkmzrcdqhetqoh';
const SESSIONS = 14;
const HOLD_SECONDS = 3;
const PREFIX = 'zz-captest-conc';

const url = process.env.STAGING_DATABASE_URL;
if (!url) fail('Set STAGING_DATABASE_URL (session pooler or direct string for the STAGING project).');
if (url.includes(PROD_REF)) fail('Refusing: the connection string mentions the PRODUCTION project ref.');
if (!url.includes(STAGING_REF)) fail(`Refusing: the connection string does not mention the staging ref ${STAGING_REF}.`);
if (/:6543\b/.test(url)) fail('Refusing: port 6543 is the transaction pooler. Use the direct or session pooler string (5432).');

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}
const connect = async () => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};
const uuid = () => crypto.randomUUID();

async function cleanup(admin) {
  // Everything carries the prefix; nothing else is ever deleted.
  await admin.query(`DELETE FROM public.customers WHERE id LIKE $1`, [`${PREFIX}%`]);
  await admin.query(`DELETE FROM public.shop_users WHERE shop_id IN (SELECT id FROM public.shops WHERE name LIKE $1)`, [`${PREFIX}%`]);
  await admin.query(`DELETE FROM public.shops WHERE name LIKE $1`, [`${PREFIX}%`]);
  await admin.query(`DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE $1)`, [`${PREFIX}%`]);
  await admin.query(`DELETE FROM auth.users WHERE email LIKE $1`, [`${PREFIX}%`]);
}
async function leftovers(admin) {
  const r = await admin.query(
    `SELECT (SELECT count(*) FROM auth.users WHERE email LIKE $1)
          + (SELECT count(*) FROM public.shops WHERE name LIKE $1)
          + (SELECT count(*) FROM public.customers WHERE id LIKE $1) AS n`, [`${PREFIX}%`]);
  return Number(r.rows[0].n);
}

async function makeTenant(admin, label, plan) {
  const userId = uuid();
  const shopId = uuid();
  await admin.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [userId, `${PREFIX}-${label}@example.invalid`]);
  await admin.query(`UPDATE public.profiles SET plan = $2, trial_ends_at = NULL WHERE id = $1`, [userId, plan]);
  await admin.query(`INSERT INTO public.shops (id, name) VALUES ($1, $2)`, [shopId, `${PREFIX} ${label}`]);
  await admin.query(`INSERT INTO public.shop_users (shop_id, user_id, role) VALUES ($1, $2, 'owner')`, [shopId, userId]);
  const p = await admin.query(`SELECT plan FROM public.profiles WHERE id = $1`, [userId]);
  if (p.rows[0]?.plan !== plan) throw new Error(`fixture ${label}: expected plan ${plan}, got ${p.rows[0]?.plan}`);
  return { userId, shopId };
}

/** One separate session: authenticated role, JWT subject = owner, hold, commit. */
async function session(t, n) {
  const c = await connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true),
                          set_config('request.jwt.claims', $2, true)`,
      [t.userId, JSON.stringify({ sub: t.userId, role: 'authenticated' })]);
    await c.query(`INSERT INTO public.customers (id, shop_id, name) VALUES ($1, $2, $3)`,
      [`${PREFIX}-${t.shopId.slice(0, 8)}-${n}`, t.shopId, `${PREFIX} ${n}`]);
    await c.query(`SELECT pg_sleep($1)`, [HOLD_SECONDS]);
    await c.query('COMMIT');
    return { ok: true };
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* ignore */ }
    return { ok: false, message: String(e.message ?? e) };
  } finally {
    await c.end();
  }
}

async function race(admin, t) {
  const results = await Promise.all(Array.from({ length: SESSIONS }, (_, i) => session(t, i + 1)));
  const rows = Number((await admin.query(`SELECT count(*) AS n FROM public.customers WHERE shop_id = $1`, [t.shopId])).rows[0].n);
  const committed = results.filter(r => r.ok).length;
  const capRefused = results.filter(r => !r.ok && /FREE_TIER_LIMIT:customers:10/.test(r.message)).length;
  const other = results.filter(r => !r.ok && !/FREE_TIER_LIMIT/.test(r.message)).map(r => r.message);
  return { committed, capRefused, other, rows };
}

async function main() {
  const admin = await connect();
  try {
    if (process.argv.includes('--cleanup')) {
      await cleanup(admin);
      console.log(`✓ cleanup done; leftovers = ${await leftovers(admin)}`);
      return;
    }
    const who = (await admin.query(`SELECT current_database() AS db, current_user AS usr`)).rows[0];
    console.log(`Connected to database "${who.db}" as "${who.usr}" (staging ref checked; credentials not shown).`);

    const inst = (await admin.query(`SELECT
        (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'enforce_free_tier_count_limit') AS fn,
        (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_free_tier_limit' AND NOT tgisinternal AND tgenabled = 'O') AS trg`)).rows[0];
    if (Number(inst.fn) !== 1 || Number(inst.trg) !== 3) {
      fail(`cap not installed here (function=${inst.fn}, enabled triggers=${inst.trg}); expected 1 and 3. Nothing was changed.`);
    }
    console.log('✓ cap function and 3 enabled cap triggers are installed');

    if ((await leftovers(admin)) !== 0) fail(`fixtures from an earlier run exist; run with --cleanup first.`);

    let verdict = 'PASS';
    try {
      const free = await makeTenant(admin, 'free', 'free');
      const paid = await makeTenant(admin, 'pro', 'professional');
      console.log('✓ created 2 synthetic tenants (free, professional); plans confirmed');

      const f = await race(admin, free);
      console.log(`  FREE shop:         ${f.committed}/${SESSIONS} committed, ${f.capRefused} refused by the cap, ${f.rows} rows`);
      if (f.other.length) {
        console.log(`  other (non-cap) errors: ${[...new Set(f.other)].join(' | ')}`);
        verdict = 'INCONCLUSIVE';
      } else if (f.rows !== 10 || f.committed !== 10 || f.capRefused !== SESSIONS - 10) {
        console.log('✗ free shop did not stop at exactly 10');
        verdict = 'FAIL';
      }

      const p = await race(admin, paid);
      console.log(`  PROFESSIONAL shop: ${p.committed}/${SESSIONS} committed, ${p.capRefused} refused by the cap, ${p.rows} rows`);
      if (p.other.length) {
        console.log(`  other (non-cap) errors: ${[...new Set(p.other)].join(' | ')}`);
        verdict = verdict === 'FAIL' ? 'FAIL' : 'INCONCLUSIVE';
      } else if (p.rows !== SESSIONS || p.capRefused !== 0) {
        console.log('✗ a professional shop was capped');
        verdict = 'FAIL';
      }
    } finally {
      await cleanup(admin);
      const left = await leftovers(admin);
      console.log(`✓ fixtures removed; leftovers = ${left}`);
      if (left !== 0) verdict = 'FAIL (leftovers remain: run with --cleanup)';
    }

    if (verdict === 'PASS') {
      console.log('\nPASS: concurrent authenticated inserts stop at exactly 10 for a free shop; a professional shop is unaffected.');
    } else {
      console.log(`\n${verdict}: see the lines above. INCONCLUSIVE means RLS or another constraint blocked the insert for a non-cap reason.`);
      process.exitCode = 1;
    }
  } finally {
    await admin.end();
  }
}

main().catch(e => { console.error('✗ ' + (e.message ?? e)); process.exit(1); });
