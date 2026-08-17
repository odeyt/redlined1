/**
 * Clone the production SCHEMA into a second Supabase project.
 *
 * Replaces the earlier bash version, which needed psql and Git Bash. This
 * machine has neither: `psql` is not installed, and `bash` resolves to the WSL
 * launcher, which would run in a Linux VM with different paths and a different
 * Node install. Nothing here needs anything beyond Node and the Supabase CLI.
 *
 * Schema only. No customer rows, no vehicles, no invoices, no auth users. The
 * point of the second project is a place where the test suite can create and
 * destroy data freely; copying real records into it would just be production
 * with a different URL.
 *
 * What this does NOT carry across, because a schema dump does not contain it:
 *
 *   * auth.users        — sign up on staging instead; that exercises the real
 *                         provisioning path, which is worth testing anyway
 *   * storage buckets   — rows in storage.buckets; run seed-staging-buckets.sql
 *   * secrets / vault   — never copy these; staging gets its own
 *   * edge functions    — deployed per project, not stored in the database
 *
 * Usage (PowerShell):
 *
 *   $env:PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
 *   $env:STAGING_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
 *   node scripts/clone-schema-to-staging.mjs
 *
 * Both URLs contain passwords. This script never prints either one — only the
 * project refs it parsed out of them, and object counts.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import pg from 'pg';

const PRODUCTION_REF = 'ldjrlvjkmzrcdqhetqoh';
const DUMP_FILE = process.env.DUMP_FILE ?? 'supabase/schema-snapshot.sql';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/**
 * Connection strings come from the environment, or from a gitignored
 * `.clone-env` file beside the repo root.
 *
 * The file exists because $env: variables live only as long as one PowerShell
 * window, and losing them between opening a terminal and running this is the
 * single most common way this script has failed to start. It holds two
 * database passwords: keep it only as long as the clone takes, then delete it.
 */
function loadCloneEnv() {
  if (!existsSync('.clone-env')) return;
  for (const line of readFileSync('.clone-env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(PROD_DB_URL|STAGING_DB_URL)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    // Quotes are stripped: pasted straight from the dashboard they are usually
    // absent, and pasted from these docs they are usually present.
    process.env[name] ??= rawValue.replace(/^['"]|['"]$/g, '');
  }
  console.log('Read connection strings from .clone-env\n');
}

loadCloneEnv();

const PROD_DB_URL = process.env.PROD_DB_URL ?? '';
const STAGING_DB_URL = process.env.STAGING_DB_URL ?? '';

if (!PROD_DB_URL) fail('PROD_DB_URL is not set.');
if (!STAGING_DB_URL) fail('STAGING_DB_URL is not set.');

/** Parsed only to compare. Neither URL is ever printed. */
function refOf(url) {
  return url.match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9]{16,})[:.]/)?.[1] ?? '';
}

const prodRef = refOf(PROD_DB_URL);
const stagingRef = refOf(STAGING_DB_URL);

if (prodRef !== PRODUCTION_REF) {
  fail(
    'PROD_DB_URL does not point at the known production project.\n' +
    '  Expected the pooler URI form: postgresql://postgres.<ref>:<password>@<host>:5432/postgres\n' +
    '  Supabase dashboard → Settings → Database → Connection string → URI',
  );
}

// The entire safety of this script is this one comparison. A dump applied to
// the source instead of the target is the shape of accident that ends a
// business.
if (stagingRef === PRODUCTION_REF) fail(`STAGING_DB_URL points at PRODUCTION (${PRODUCTION_REF}). Refusing.`);
if (!stagingRef) fail('Could not read a project ref out of STAGING_DB_URL. Expected postgresql://postgres.<ref>:...');

console.log(`Source: ${prodRef} (production, read-only)`);
console.log(`Target: ${stagingRef}`);
console.log('');

// ── 1. Dump ─────────────────────────────────────────────────────────────────
// --schema-only is doing the work. Without it this becomes a copy of every
// customer record the shop has. The URL is passed as an argv element, never
// interpolated into a shell string, so it cannot leak through a shell trace.
console.log('Dumping production schema (no data)…');
const dump = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['supabase', 'db', 'dump', '--db-url', PROD_DB_URL, '--schema-only', '-f', DUMP_FILE],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);

if (dump.status !== 0) fail(`supabase db dump exited with ${dump.status}.`);
if (!existsSync(DUMP_FILE)) fail(`${DUMP_FILE} was not created.`);

let sql = readFileSync(DUMP_FILE, 'utf8');

// \restrict and \unrestrict are psql meta-commands that recent pg_dump builds
// emit at the top of a dump. psql understands them; a plain Postgres client
// does not, and would fail on line one with a syntax error that says nothing
// about why.
const metaCommands = sql.match(/^\\(un)?restrict.*$/gm) ?? [];
if (metaCommands.length > 0) {
  sql = sql.replace(/^\\(un)?restrict.*$/gm, '');
  writeFileSync(DUMP_FILE, sql);
  console.log(`  stripped ${metaCommands.length} psql meta-command(s) a plain client cannot read`);
}

const count = (pattern) => (sql.match(pattern) ?? []).length;
const tables = count(/CREATE TABLE/g);
const policies = count(/CREATE POLICY/g);
const functions = count(/CREATE (OR REPLACE )?FUNCTION/g);

console.log(`  ${tables} tables, ${policies} policies, ${functions} functions`);

// A clone missing its policies is a database with no tenancy boundary, and it
// would look perfectly healthy right up until two shops saw each other.
if (tables === 0) fail('The dump contains no tables. Stopping before applying it.');
if (policies === 0) fail('The dump contains no RLS policies. Something is wrong — stopping before applying it.');

// ── 2. Apply ────────────────────────────────────────────────────────────────
console.log('');
console.log(`Applying to ${stagingRef}…`);

const client = new pg.Client({
  connectionString: STAGING_DB_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  // Deliberately not wrapped in a transaction: the dump contains statements
  // that cannot run inside one, and a half-applied schema on an empty staging
  // project is recoverable by re-running. Failing loudly mid-way is better
  // than a transaction that succeeds by skipping things.
  await client.query(sql);
  console.log('Applied.');
} catch (error) {
  console.error('');
  console.error(`Apply failed: ${error.message}`);
  if (error.position) console.error(`  at character ${error.position} of the dump`);
  console.error('');
  console.error('The target may now hold a partial schema. It is an empty project —');
  console.error('the fix is to resolve the error and run this again, not to patch around it.');
  process.exit(1);
} finally {
  await client.end();
}

console.log('');
console.log('Verify parity before trusting it — a dump that applied is not a dump that matched:');
console.log('  node scripts/run-sql.mjs scripts/verify-schema-parity.sql prod');
console.log('  node scripts/run-sql.mjs scripts/verify-schema-parity.sql staging');
console.log('');
console.log('Then seed the storage buckets, which a schema dump does not carry:');
console.log('  node scripts/run-sql.mjs scripts/seed-staging-buckets.sql staging');
