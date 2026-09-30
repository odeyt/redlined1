/**
 * Resend webhooks: signature verified before anything is trusted; bounces,
 * complaints and suppressions stop future sends; retries are idempotent.
 *
 * Signatures are produced exactly as Resend (Svix / Standard Webhooks) makes
 * them: base64 HMAC-SHA256 of "<id>.<timestamp>.<body>" with the decoded
 * whsec_ secret.
 */
import { createHmac } from 'crypto';
import { handleResendWebhook } from '../webhook';
import type { TrialTipsDb } from '../runner';

const SECRET = 'whsec_' + Buffer.from('a-test-signing-secret-32-bytes-long!').toString('base64');

function sign(id: string, timestamp: number, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

function headers(h: Record<string, string>) {
  return { get: (n: string) => h[n] ?? null };
}

function request(event: object, opts: { id?: string; ts?: number; secret?: string } = {}) {
  const body = JSON.stringify(event);
  const id = opts.id ?? 'msg_1';
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return { rawBody: body, headers: headers({ 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': sign(id, ts, body, opts.secret) }) };
}

function fakeDb(opts: { suppressError?: boolean } = {}) {
  const seen = new Set<string>();
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db: TrialTipsDb = {
    rpc(fn, args) {
      calls.push({ fn, args });
      if (fn === 'resend_webhook_claim') {
        const id = args.p_webhook_id as string;
        if (seen.has(id)) return Promise.resolve({ data: false, error: null });
        seen.add(id);
        return Promise.resolve({ data: true, error: null });
      }
      if (fn === 'resend_webhook_release') { seen.delete(args.p_webhook_id as string); return Promise.resolve({ data: null, error: null }); }
      if (fn === 'trial_tips_suppress') {
        if (opts.suppressError) return Promise.resolve({ data: null, error: { message: 'db down' } });
        return Promise.resolve({ data: 1, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { db, calls };
}

const bounce = { type: 'email.bounced', created_at: '2026-10-01T00:00:00Z',
  data: { email_id: 'em_1', to: ['a@test.local'], from: 'tips@redlined1.com', subject: 's', created_at: '', bounce: { type: 'Permanent', subType: 'General', message: '' } } };

describe('signature', () => {
  it('rejects a request with no signature headers', async () => {
    const { db, calls } = fakeDb();
    const r = await handleResendWebhook({ rawBody: '{}', headers: headers({}), secret: SECRET, db });
    expect(r).toEqual({ status: 401, outcome: 'bad_signature' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a body signed with another secret', async () => {
    const { db, calls } = fakeDb();
    const other = 'whsec_' + Buffer.from('another-secret-another-secret-00').toString('base64');
    const r = await handleResendWebhook({ ...request(bounce, { secret: other }), secret: SECRET, db });
    expect(r.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('rejects a body altered after signing', async () => {
    const { db } = fakeDb();
    const req = request(bounce);
    const r = await handleResendWebhook({ ...req, rawBody: req.rawBody.replace('em_1', 'em_2'), secret: SECRET, db });
    expect(r.status).toBe(401);
  });

  it('rejects an old (replayed) timestamp', async () => {
    const { db } = fakeDb();
    const r = await handleResendWebhook({ ...request(bounce, { ts: Math.floor(Date.now() / 1000) - 3600 }), secret: SECRET, db });
    expect(r.status).toBe(401);
  });

  it('refuses to run without a configured secret', async () => {
    const { db, calls } = fakeDb();
    const r = await handleResendWebhook({ ...request(bounce), secret: undefined, db });
    expect(r).toEqual({ status: 503, outcome: 'unconfigured' });
    expect(calls).toHaveLength(0);
  });
});

describe('suppression', () => {
  it.each([
    ['email.bounced', 'bounce'],
    ['email.complained', 'complaint'],
    ['email.suppressed', 'provider_suppressed'],
  ])('%s suppresses the person (%s)', async (type, reason) => {
    const { db, calls } = fakeDb();
    const r = await handleResendWebhook({ ...request({ ...bounce, type }), secret: SECRET, db });
    expect(r).toEqual({ status: 200, outcome: 'suppressed' });
    expect(calls.find(c => c.fn === 'trial_tips_suppress')!.args).toEqual({ p_email_id: 'em_1', p_recipient: 'a@test.local', p_reason: reason });
  });

  it('suppression.added (address in data.email, no email id) suppresses by address', async () => {
    const { db, calls } = fakeDb();
    const event = { type: 'suppression.added', created_at: '2026-10-01T00:00:00Z',
      data: { id: 'sup_1', email: 'a@test.local', origin: 'bounce', source_id: 'x', created_at: '' } };
    const r = await handleResendWebhook({ ...request(event), secret: SECRET, db });
    expect(r).toEqual({ status: 200, outcome: 'suppressed' });
    expect(calls.find(c => c.fn === 'trial_tips_suppress')!.args).toEqual({ p_email_id: null, p_recipient: 'a@test.local', p_reason: 'provider_suppressed' });
  });

  it('a transient delivery delay does NOT suppress', async () => {
    const { db, calls } = fakeDb();
    const r = await handleResendWebhook({ ...request({ ...bounce, type: 'email.delivery_delayed' }), secret: SECRET, db });
    expect(r.outcome).toBe('ignored');
    expect(calls.some(c => c.fn === 'trial_tips_suppress')).toBe(false);
  });

  it('other events are acknowledged and ignored', async () => {
    const { db, calls } = fakeDb();
    const r = await handleResendWebhook({ ...request({ ...bounce, type: 'email.delivered' }), secret: SECRET, db });
    expect(r).toEqual({ status: 200, outcome: 'ignored' });
    expect(calls.some(c => c.fn === 'trial_tips_suppress')).toBe(false);
  });

  it('a retried delivery is acknowledged without being applied twice', async () => {
    const { db, calls } = fakeDb();
    const req = request(bounce, { id: 'msg_dup' });
    await handleResendWebhook({ ...req, secret: SECRET, db });
    const again = await handleResendWebhook({ ...req, secret: SECRET, db });
    expect(again).toEqual({ status: 200, outcome: 'duplicate' });
    expect(calls.filter(c => c.fn === 'trial_tips_suppress')).toHaveLength(1);
  });

  it('a database failure answers 500 and releases the delivery so the retry is processed', async () => {
    const failing = fakeDb({ suppressError: true });
    const req = request(bounce, { id: 'msg_fail' });
    const r = await handleResendWebhook({ ...req, secret: SECRET, db: failing.db });
    expect(r).toEqual({ status: 500, outcome: 'error' });
    expect(failing.calls.some(c => c.fn === 'resend_webhook_release')).toBe(true);
  });
});
