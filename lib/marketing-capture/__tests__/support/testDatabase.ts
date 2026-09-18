/**
 * A throwaway PostgreSQL for EXECUTING the owner SQL files.
 *
 * Two backends, in this order:
 *
 *   1. MARKETING_SQL_TEST_DATABASE_URL - a server you point it at. Each test
 *      gets its own database, created and dropped. Use a local/disposable
 *      server only: the fixture creates roles and schemas.
 *   2. PGlite (PostgreSQL compiled to WebAssembly), in memory. Resolved
 *      normally, or from MARKETING_SQL_TEST_PGLITE if you installed it outside
 *      this repository:
 *        npm install --prefix <dir> @electric-sql/pglite
 *        MARKETING_SQL_TEST_PGLITE=<dir>/node_modules/@electric-sql/pglite
 *
 * Nothing is skipped when neither is available: createTestDb throws, so
 * `npm run test:sql` fails loudly rather than passing having run
 * nothing.
 */
import { Client } from 'pg';

export interface QueryResult { rows: Record<string, unknown>[]; fields?: { name: string }[] }

export interface TestDb {
  /** One statement, with optional $1 parameters. */
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  /** A whole script; one result per statement, in order. */
  exec(text: string): Promise<QueryResult[]>;
  close(): Promise<void>;
}

const URL_ENV = 'MARKETING_SQL_TEST_DATABASE_URL';
const PGLITE_ENV = 'MARKETING_SQL_TEST_PGLITE';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPglite(): any {
  const fromEnv = process.env[PGLITE_ENV];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = (id: string) => require(id);
  try {
    return load(fromEnv || '@electric-sql/pglite');
  } catch (error) {
    throw new Error(
      `[owner-sql tests] no PostgreSQL to execute against. Set ${URL_ENV} to a disposable server, `
      + `or install PGlite and set ${PGLITE_ENV}. (${(error as Error).message})`,
    );
  }
}

export function backendDescription(): string {
  return process.env[URL_ENV] ? `server at ${URL_ENV}` : 'PGlite (in-memory PostgreSQL)';
}

let counter = 0;

/** A fresh, empty database. The caller applies the fixture. */
export async function createTestDb(): Promise<TestDb> {
  const url = process.env[URL_ENV];
  if (url) {
    counter += 1;
    const name = `rl1_owner_sql_${process.pid}_${counter}`;
    const admin = new Client({ connectionString: url });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
    const db = new Client({ connectionString: url.replace(/\/[^/?]*(\?|$)/, `/${name}$1`) });
    await db.connect();
    return {
      async query(text, params) { return db.query(text, params as unknown[]) as unknown as QueryResult; },
      async exec(text) {
        const r = await db.query(text) as unknown as QueryResult | QueryResult[];
        return Array.isArray(r) ? r : [r];
      },
      async close() {
        await db.end();
        const cleanup = new Client({ connectionString: url });
        await cleanup.connect();
        await cleanup.query(`DROP DATABASE IF EXISTS ${name}`);
        await cleanup.end();
      },
    };
  }

  const { PGlite } = loadPglite();
  const pg = new PGlite();
  await pg.query('SELECT 1');
  return {
    async query(text, params) { return pg.query(text, params) as Promise<QueryResult>; },
    async exec(text) { return pg.exec(text) as Promise<QueryResult[]>; },
    async close() { await pg.close(); },
  };
}
