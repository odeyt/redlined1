/**
 * API v1 bot smoke test: the brief's Part 4 checklist, adapted to the real API
 * and automated (docs/api/PLAN.md phase 7, docs/api/ROLLOUT.md).
 *
 *   BASE=https://<preview-host>/api/v1 KEY=rl_live_… npx tsx scripts/api-smoke.ts
 *
 * Default is READ ONLY: it never creates, edits or converts anything, so it is
 * safe with Wally Bot's read-only key against the shared production database.
 *
 *   --write --customer <uuid> [--vehicle <uuid>]
 *       Also creates ONE draft estimate for that customer, replays it, edits
 *       it, and checks the refusals. Needs a key with estimates:write. The
 *       draft is real (previews share the production database) and uses up an
 *       estimate number; the script prints its number so you can delete it.
 *   --convert <estimate uuid>
 *       Converts an estimate you APPROVED in the app to a draft invoice. This
 *       uses up an invoice number from the global sequence.
 *   --rate-limit
 *       Sends 125 requests to /me and expects some 429s (limit: 120/min).
 *
 * Nothing here sends, approves, records a payment, voids or deletes: the API
 * has no such endpoint, and the script checks that too.
 *
 * The secret is read from the environment, never printed, and sent only to
 * BASE.
 */
import { randomUUID } from 'crypto';

export type SmokeResult = { name: string; ok: boolean; detail: string };

export interface SmokeOptions {
  base: string;
  key: string;
  write?: boolean;
  customer?: string | null;
  vehicle?: string | null;
  convert?: string | null;
  rateLimit?: boolean;
  log?: (line: string) => void;
}

// Set by runSmoke for the duration of one run.
let BASE = '';
let KEY = '';
let log: (line: string) => void = line => console.log(line);
let results: SmokeResult[] = [];

function record(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

async function call(method: string, path: string, opts: { key?: string | null; body?: unknown; idem?: string } = {}) {
  const headers: Record<string, string> = {};
  const key = opts.key === undefined ? KEY : opts.key;
  if (key) headers.authorization = 'Bearer ' + key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.idem) headers['idempotency-key'] = opts.idem;
  const res = await fetch(BASE + path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const type = res.headers.get('content-type') ?? '';
  const raw = Buffer.from(await res.arrayBuffer());
  let json: Record<string, unknown> | null = null;
  if (type.includes('json')) { try { json = JSON.parse(raw.toString('utf8')); } catch { /* not json */ } }
  return { status: res.status, headers: res.headers, json, raw };
}

const code = (r: { json: Record<string, unknown> | null }) =>
  ((r.json?.error as Record<string, unknown> | undefined)?.code as string | undefined) ?? '';
const detailCode = (r: { json: Record<string, unknown> | null }) =>
  (((r.json?.error as Record<string, unknown> | undefined)?.details as Record<string, unknown> | undefined)?.code as string | undefined) ?? '';
const data = (r: { json: Record<string, unknown> | null }) => (r.json?.data ?? null) as Record<string, unknown> | Record<string, unknown>[] | null;

async function readOnly(scopes: string[]) {
  const noKey = await call('GET', '/customers', { key: null });
  record('No key → 401 AUTH_REQUIRED', noKey.status === 401 && code(noKey) === 'AUTH_REQUIRED', `${noKey.status} ${code(noKey)}`);

  const badKey = await call('GET', '/customers', { key: 'rl_live_' + '0'.repeat(48) });
  record('Bad key → 401 INVALID_API_KEY', badKey.status === 401 && code(badKey) === 'INVALID_API_KEY', `${badKey.status} ${code(badKey)}`);

  if (scopes.includes('customers:read')) {
    const c = await call('GET', '/customers?page_size=5');
    record('List customers', c.status === 200 && Array.isArray(data(c)), `${c.status}`);
  }

  if (scopes.includes('estimates:read')) {
    const e = await call('GET', '/estimates?page_size=5');
    const rows = (data(e) ?? []) as Record<string, unknown>[];
    record('List estimates', e.status === 200 && Array.isArray(rows), `${e.status}, ${rows.length} shown`);
    record('Estimates never show line cost or markup', !/"cost"|"markup"/.test(e.raw.toString('utf8')));

    const bad = await call('GET', '/estimates?status=paid');
    record('Bad status filter → 422', bad.status === 422, `${bad.status} ${code(bad)}`);
    const since = await call('GET', '/estimates?updated_since=2026-01-01');
    record('updated_since → 422 (not supported)', since.status === 422, `${since.status}`);

    if (rows[0]) {
      const one = await call('GET', `/estimates/${rows[0].id}`);
      record('Get one estimate', one.status === 200, `${one.status} ${(data(one) as Record<string, unknown> | null)?.number ?? ''}`);
      if (scopes.includes('pdf:read')) {
        const pdf = await call('GET', `/estimates/${rows[0].id}/pdf`);
        record('Estimate PDF', pdf.status === 200 && pdf.raw.subarray(0, 5).toString() === '%PDF-',
          `${pdf.status} ${pdf.headers.get('content-disposition') ?? ''}`);
      }
    }
    const missing = await call('GET', `/estimates/${randomUUID()}`);
    record('Unknown estimate → 404', missing.status === 404, `${missing.status}`);
  }

  if (scopes.includes('invoices:read')) {
    const i = await call('GET', '/invoices?page_size=5');
    const rows = (data(i) ?? []) as Record<string, unknown>[];
    record('List invoices (with amount_paid / balance_due)',
      i.status === 200 && rows.every(r => 'amount_paid' in r && 'balance_due' in r), `${i.status}, ${rows.length} shown`);
  }

  if (!scopes.includes('estimates:write')) {
    // Refused at the scope check, before any work: nothing is created.
    const w = await call('POST', '/estimates', { body: { customer_id: randomUUID(), lines: [{ description: 'x', qty: 1, rate: 1 }] }, idem: randomUUID() });
    record('Read-only key cannot write → 403 SCOPE_REQUIRED', w.status === 403 && code(w) === 'SCOPE_REQUIRED', `${w.status} ${code(w)}`);
  }

  // Endpoints that must not exist (approve/send/pay/void/delete).
  for (const [method, path] of [
    ['POST', `/estimates/${randomUUID()}/approve`],
    ['POST', `/estimates/${randomUUID()}/send`],
    ['POST', '/invoices/INV-0000/pay'],
    ['POST', '/invoices/INV-0000/finalize'],
    ['DELETE', `/estimates/${randomUUID()}`],
  ] as const) {
    const r = await call(method, path, { body: {}, idem: randomUUID() });
    record(`No such endpoint: ${method} ${path.replace(/[0-9a-f-]{36}/, '{id}')}`, r.status === 404 || r.status === 405, `${r.status}`);
  }
}

async function writes(customerId: string, vehicleId: string | null) {
  const body = {
    customer_id: customerId,
    ...(vehicleId ? { vehicle_id: vehicleId } : {}),
    lines: [{ description: 'API smoke test (delete me)', qty: 1, rate: 1 }],
    notes: 'Created by scripts/api-smoke.ts. Safe to delete.',
  };

  const sneaky = await call('POST', '/estimates', { body: { ...body, status: 'Sent' }, idem: randomUUID() });
  record('Setting a status is refused (422), nothing created', sneaky.status === 422, `${sneaky.status}`);

  const noIdem = await call('POST', '/estimates', { body });
  record('POST without Idempotency-Key → 422', noIdem.status === 422, `${noIdem.status}`);

  const idem = randomUUID();
  const made = await call('POST', '/estimates', { body, idem });
  const est = data(made) as Record<string, unknown> | null;
  record('Create draft estimate', made.status === 201 && est?.status === 'draft' && est?.created_via === 'api',
    `${made.status} ${est?.number ?? code(made)}`);
  if (!est) return;
  log(`      → created ${est.number} (id ${est.id}); delete it in the app when done.`);

  const replay = await call('POST', '/estimates', { body, idem });
  record('Same Idempotency-Key replays (no second estimate)',
    (data(replay) as Record<string, unknown> | null)?.id === est.id && (replay.json?.meta as Record<string, unknown>)?.idempotent_replay === true,
    `${replay.status}`);

  const conflict = await call('POST', '/estimates', { body: { ...body, notes: 'different' }, idem });
  record('Same key, different body → 409 IDEMPOTENCY_CONFLICT', conflict.status === 409 && code(conflict) === 'IDEMPOTENCY_CONFLICT', `${conflict.status}`);

  const edit = await call('PATCH', `/estimates/${est.id}`, { body: { notes: 'Edited by scripts/api-smoke.ts.' } });
  record('Edit the draft', edit.status === 200, `${edit.status}`);

  const conv = await call('POST', `/estimates/${est.id}/convert-to-invoice`, { idem: randomUUID() });
  record('Convert an unapproved draft → 409 NOT_APPROVED', conv.status === 409 && detailCode(conv) === 'NOT_APPROVED', `${conv.status} ${detailCode(conv)}`);

  const pdf = await call('GET', `/estimates/${est.id}/pdf`);
  if (pdf.status !== 403) {
    record('Draft PDF is stamped DRAFT', pdf.status === 200 && /-DRAFT\.pdf/.test(pdf.headers.get('content-disposition') ?? ''),
      `${pdf.status} ${pdf.headers.get('content-disposition') ?? ''}`);
  }
}

async function convert(estimateId: string) {
  const r = await call('POST', `/estimates/${estimateId}/convert-to-invoice`, { idem: randomUUID() });
  const inv = (data(r) as Record<string, unknown> | null)?.invoice as Record<string, unknown> | undefined;
  record('Convert approved estimate → draft invoice', r.status === 201 && inv?.status === 'draft', `${r.status} ${inv?.number ?? detailCode(r)}`);
  const again = await call('POST', `/estimates/${estimateId}/convert-to-invoice`, { idem: randomUUID() });
  record('Converting again → 409 ALREADY_CONVERTED', again.status === 409 && detailCode(again) === 'ALREADY_CONVERTED', `${again.status}`);
}

async function rateLimit() {
  let limited = 0;
  for (let i = 0; i < 125; i++) if ((await call('GET', '/me')).status === 429) limited++;
  record('Rate limit (120/min) answers 429', limited > 0, `${limited} of 125 limited`);
}

/** Runs the checks and returns every result. Exported so a test can run it against the real handlers. */
export async function runSmoke(opts: SmokeOptions): Promise<SmokeResult[]> {
  BASE = opts.base.replace(/\/+$/, '');
  KEY = opts.key;
  log = opts.log ?? (line => console.log(line));
  results = [];

  const me = await call('GET', '/me');
  const d = data(me) as Record<string, unknown> | null;
  if (me.status === 404) {
    record('GET /me', false, '404: api_v1_documents is off for this deployment, or this is not the right host');
    return results;
  }
  record('GET /me', me.status === 200, `${me.status} key "${(d?.key as Record<string, unknown> | undefined)?.name ?? '?'}"`);
  if (me.status !== 200 || !d) return results;

  const scopes = (d.scopes as string[]) ?? [];
  log(`      shops: ${((d.shops as { name: string }[]) ?? []).map(s => s.name).join(', ')}; scopes: ${scopes.join(', ')}`);
  await readOnly(scopes);

  if (opts.write) {
    if (!opts.customer) record('Write checks', false, '--write needs --customer <uuid>');
    else if (!scopes.includes('estimates:write')) record('Write checks', false, 'this key has no estimates:write');
    else await writes(opts.customer, opts.vehicle ?? null);
  }
  if (opts.convert) await convert(opts.convert);
  if (opts.rateLimit) await rateLimit();
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name: string) => { const i = argv.indexOf('--' + name); return i === -1 ? null : argv[i + 1] ?? null; };
  const base = (process.env.BASE ?? '').replace(/\/+$/, '');
  const key = process.env.KEY ?? '';

  if (!/^https?:\/\/.+\/api\/v1$/.test(base)) {
    console.error('Set BASE to the deployment\'s API root, e.g. BASE=https://<host>/api/v1');
    process.exit(2);
  }
  if (!key.startsWith('rl_live_')) {
    console.error('Set KEY to a test API key (rl_live_…). It is read from the environment and never printed.');
    process.exit(2);
  }

  const out = await runSmoke({
    base, key,
    write: argv.includes('--write'), customer: arg('customer'), vehicle: arg('vehicle'),
    convert: arg('convert'), rateLimit: argv.includes('--rate-limit'),
  });
  const failed = out.filter(r => !r.ok);
  console.log(`\n${out.length - failed.length}/${out.length} passed.`);
  console.log('Still to check by hand: nothing was emailed or paid; the audit log in Settings → API Keys;');
  console.log('a second shop\'s key gets 404 on this shop\'s ids; revoke the test key and /me returns 401.');
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}

