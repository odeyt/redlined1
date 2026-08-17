/**
 * Run a .sql file against production or staging and print the results.
 *
 * A stand-in for `psql -f`, which is not installed on the machine this project
 * is developed on. Handles the two things that matter for the scripts in this
 * directory: multiple result sets from one file, and the `\echo` meta-commands
 * psql understands but a plain client does not.
 *
 * Usage (PowerShell):
 *
 *   $env:PROD_DB_URL='...'
 *   $env:STAGING_DB_URL='...'
 *   node scripts/run-sql.mjs scripts/verify-schema-parity.sql prod
 *   node scripts/run-sql.mjs scripts/verify-schema-parity.sql staging
 *
 * The target is named explicitly rather than defaulted. A script that picks a
 * database for you is one that eventually picks the wrong one.
 */

import { readFileSync } from 'node:fs';
import pg from 'pg';

const PRODUCTION_REF = 'ldjrlvjkmzrcdqhetqoh';
const [file, target] = process.argv.slice(2);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!file || !target) {
  fail('Usage: node scripts/run-sql.mjs <file.sql> <prod|staging>');
}
if (target !== 'prod' && target !== 'staging') {
  fail(`Unknown target "${target}". Use "prod" or "staging".`);
}

const url = target === 'prod' ? process.env.PROD_DB_URL : process.env.STAGING_DB_URL;
if (!url) fail(`${target === 'prod' ? 'PROD_DB_URL' : 'STAGING_DB_URL'} is not set.`);

const ref = url.match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9]{16,})[:.]/)?.[1] ?? '';
if (!ref) fail('Could not read a project ref out of the connection string.');

// Says which database this is about to touch, every time, before it runs. The
// whole reason for a second project is that "which database am I on" stopped
// being a question anyone had to hold in their head.
const label = ref === PRODUCTION_REF ? `${ref} (PRODUCTION)` : `${ref}`;
console.log(`Running ${file} against ${label}\n`);

let sql = readFileSync(file, 'utf8');

// \echo lines are psql's, not Postgres's. Their text is worth keeping — it
// labels the output — so they are printed rather than silently dropped.
const echoes = [];
sql = sql.replace(/^\\echo\s*(.*)$/gm, (_match, text) => {
  echoes.push(text.replace(/^'|'$/g, ''));
  return '';
});
sql = sql.replace(/^\\.*$/gm, '');

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const result = await client.query(sql);
  const resultSets = Array.isArray(result) ? result : [result];

  for (const set of resultSets) {
    if (!set.rows || set.rows.length === 0) continue;
    console.table(set.rows);
  }

  if (echoes.length > 0) {
    console.log(`\nSection labels from the file: ${echoes.filter(Boolean).join(' | ')}`);
  }
} catch (error) {
  fail(error.message);
} finally {
  await client.end();
}
