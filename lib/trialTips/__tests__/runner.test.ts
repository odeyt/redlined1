/**
 * The scheduled job with mocked delivery and a stateful fake database that
 * behaves like the SQL (first claim wins; sent is final; a definite failure
 * may be retried; the final check can withdraw). The real SQL — including the
 * 23-hour idempotency limit — is exercised by tests/db/run-trial-tips-db-tests.mjs.
 */
import {
  runTrialTips, idempotencyKey, secretFingerprint,
  type MailTransport, type OutboundEmail, type SendResult, type TrialTipsDb,
} from '../runner';
import { readTrialTipsConfig } from '../config';

const SECRET = 'x'.repeat(40);
const BASE = {
  TRIAL_TIPS_SENDING_ENABLED: 'true',
  TRIAL_TIPS_FROM_ADDRESS: 'tips@redlined1.com',
  TRIAL_TIPS_POSTAL_ADDRESS: 'PO Box 123, Example City, ST 00000',
  TRIAL_TIPS_UNSUBSCRIBE_SECRET: SECRET,
  NEXT_PUBLIC_SITE_URL: 'https://redlined1.com',
  RESEND_API_KEY: 're_test',
};
const EVERYONE = readTrialTipsConfig({ ...BASE, TRIAL_TIPS_AUDIENCE: 'everyone' });
const CANARY = readTrialTipsConfig({ ...BASE, TRIAL_TIPS_CANARY_RECIPIENTS: ' A@Test.Local , not-an-address ' });
const CANARY_EMPTY = readTrialTipsConfig(BASE);
const OFF = readTrialTipsConfig({});

const A = '10000000-0000-4000-8000-00000000000a';
const B = '10000000-0000-4000-8000-00000000000b';

type Row = { status: 'claimed' | 'sent' | 'failed' | 'uncertain' | 'withdrawn'; attempts: number; emailId?: string; error?: string };
type Due = { user_id: string; step: string; email: string | null; shop_name: string | null };

function fakeDb(due: Due[], opts: { confirm?: (user: string) => boolean; review?: Due[] } = {}) {
  const ledger = new Map<string, Row>();
  const calls: string[] = [];
  let failMarkSent = false;
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  const db: TrialTipsDb = {
    rpc(fn, args) {
      calls.push(fn);
      const key = `${args.p_user}/${args.p_step}`;
      const row = ledger.get(key);
      switch (fn) {
        case 'trial_tips_due':
          return ok(due.filter(d => {
            const r = ledger.get(`${d.user_id}/${d.step}`);
            return !r || (['failed', 'withdrawn', 'uncertain'].includes(r.status) && r.attempts < 3);
          }));
        case 'trial_tips_claim':
          if (!row) { ledger.set(key, { status: 'claimed', attempts: 1 }); return ok(true); }
          if (['failed', 'withdrawn', 'uncertain'].includes(row.status) && row.attempts < 3) {
            row.status = 'claimed'; row.attempts += 1; return ok(true);
          }
          return ok(false);
        case 'trial_tips_confirm':
          return ok(row?.status === 'claimed' && (opts.confirm?.(args.p_user as string) ?? true));
        case 'trial_tips_withdraw': row!.status = 'withdrawn'; return ok(null);
        case 'trial_tips_mark_sent':
          if (failMarkSent) return Promise.resolve({ data: null, error: { message: 'connection reset' } });
          row!.status = 'sent'; row!.emailId = args.p_email_id as string; return ok(null);
        case 'trial_tips_mark_failed': row!.status = 'failed'; row!.error = args.p_error as string; return ok(null);
        case 'trial_tips_mark_uncertain': row!.status = 'uncertain'; row!.error = args.p_error as string; return ok(null);
        case 'trial_tips_needs_review': return ok(opts.review ?? []);
        default: throw new Error('unexpected rpc ' + fn);
      }
    },
  };
  return { db, ledger, calls, setFailMarkSent: (v: boolean) => { failMarkSent = v; } };
}

function mockTransport(result?: (m: OutboundEmail, attempt: number) => SendResult) {
  const sent: { message: OutboundEmail; key: string }[] = [];
  let attempt = 0;
  const transport: MailTransport = {
    async send(message, key) {
      attempt += 1;
      const r = result?.(message, attempt) ?? { ok: true, id: `em_${attempt}` };
      if (r.ok) sent.push({ message, key });
      return r;
    },
  };
  return { transport, sent, attempts: () => attempt };
}

const due: Due[] = [
  { user_id: A, step: 'first_job', email: 'a@test.local', shop_name: 'Shop A' },
  { user_id: B, step: 'status_board', email: 'b@test.local', shop_name: 'Shop B' },
];

describe('off by default', () => {
  it('without every gate it is a dry run: nothing is claimed or sent', async () => {
    const { db, calls } = fakeDb(due);
    const { transport, sent } = mockTransport();
    const report = await runTrialTips({ db, transport, config: { ...OFF, audience: 'everyone' } });
    expect(report.mode).toBe('dry-run');
    expect(report.outcomes.would_send).toBe(2);
    expect(sent).toHaveLength(0);
    expect(calls).toEqual(['trial_tips_due', 'trial_tips_needs_review']);
  });

  it('the audience defaults to canary, and an empty canary list reaches NOBODY — even with sending enabled', async () => {
    expect(CANARY_EMPTY.live).toBe(true);
    expect(CANARY_EMPTY.audience).toBe('canary');
    const { db, calls } = fakeDb(due);
    const { transport, sent } = mockTransport();
    const report = await runTrialTips({ db, transport, config: CANARY_EMPTY });
    expect(report.outcomes.not_canary).toBe(2);
    expect(sent).toHaveLength(0);
    expect(calls).not.toContain('trial_tips_claim');
  });

  it('any audience value other than exactly "everyone" is canary', () => {
    for (const v of ['Everyone', 'all', 'everyone ', '*', '']) {
      expect(readTrialTipsConfig({ ...BASE, TRIAL_TIPS_AUDIENCE: v }).audience).toBe('canary');
    }
  });
});

describe('canary', () => {
  it('sends only to the listed address (case-insensitive); everyone else is not even claimed', async () => {
    const { db, ledger } = fakeDb(due);
    const { transport, sent } = mockTransport();
    const report = await runTrialTips({ db, transport, config: CANARY });
    expect(sent.map(s => s.message.to)).toEqual(['a@test.local']);
    expect(report.outcomes).toMatchObject({ sent: 1, not_canary: 1 });
    expect(ledger.has(`${B}/status_board`)).toBe(false);
  });

  it('a retry is gated too: a failed canary send is not retried once its address leaves the list', async () => {
    const { db } = fakeDb([due[0]]);
    const first = mockTransport(() => ({ ok: false, certainty: 'rejected', message: 'rate limited' }));
    await runTrialTips({ db, transport: first.transport, config: CANARY });
    const second = mockTransport();
    const report = await runTrialTips({ db, transport: second.transport, config: CANARY_EMPTY });
    expect(report.outcomes.not_canary).toBe(1);
    expect(second.attempts()).toBe(0);
  });

  it('"everyone" sends to all eligible people', async () => {
    const { db } = fakeDb(due);
    const { transport, sent } = mockTransport();
    await runTrialTips({ db, transport, config: EVERYONE });
    expect(sent).toHaveLength(2);
  });
});

describe('live', () => {
  it('sends each due person exactly one email: the step they are due for', async () => {
    const { db, ledger } = fakeDb(due);
    const { transport, sent } = mockTransport();
    const report = await runTrialTips({ db, transport, config: EVERYONE });
    expect(report.outcomes.sent).toBe(2);
    expect(sent.map(s => s.key)).toEqual([idempotencyKey(A, 'first_job'), idempotencyKey(B, 'status_board')]);
    expect(ledger.get(`${A}/first_job`)).toMatchObject({ status: 'sent', emailId: 'em_1' });
  });

  it('from the verified sender, Reply-To admin, with one-click unsubscribe headers', async () => {
    const { db } = fakeDb([due[0]]);
    const { transport, sent } = mockTransport();
    await runTrialTips({ db, transport, config: EVERYONE });
    const m = sent[0].message;
    expect(m.from).toBe('RedlineD1 <tips@redlined1.com>');
    expect(m.replyTo).toBe('admin@redlined1.com');
    expect(m.headers['List-Unsubscribe']).toMatch(/^<https:\/\/redlined1\.com\/api\/trial-tips\/unsubscribe\?u=.+&t=.+>$/);
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.text).toContain('PO Box 123');
  });

  it('the final check runs after the claim and before the provider; if it says no, nothing is sent', async () => {
    const { db, ledger, calls } = fakeDb([due[0]], { confirm: () => false });
    const { transport, attempts } = mockTransport();
    const report = await runTrialTips({ db, transport, config: EVERYONE });
    expect(report.outcomes.withdrawn).toBe(1);
    expect(attempts()).toBe(0);
    expect(ledger.get(`${A}/first_job`)!.status).toBe('withdrawn');
    expect(calls.indexOf('trial_tips_confirm')).toBeGreaterThan(calls.indexOf('trial_tips_claim'));
  });

  it('a second run sends nothing more; two racing runs send each email once', async () => {
    const { db } = fakeDb(due);
    const { transport, sent } = mockTransport();
    await Promise.all([runTrialTips({ db, transport, config: EVERYONE }), runTrialTips({ db, transport, config: EVERYONE })]);
    const again = await runTrialTips({ db, transport, config: EVERYONE });
    expect(sent).toHaveLength(2);
    expect(again.due).toBe(0);
  });

  it('a definite rejection is recorded as failed (address scrubbed) and retried next run', async () => {
    const { db, ledger } = fakeDb([due[0]]);
    const t = mockTransport((_, n) => n === 1
      ? { ok: false, certainty: 'rejected', message: 'rate_limit_exceeded (429): too many requests for a@test.local' }
      : { ok: true, id: 'em_retry' });
    expect((await runTrialTips({ db, transport: t.transport, config: EVERYONE })).outcomes.failed).toBe(1);
    expect(ledger.get(`${A}/first_job`)!.error).toBe('rate_limit_exceeded (429): too many requests for [address]');
    expect((await runTrialTips({ db, transport: t.transport, config: EVERYONE })).outcomes.sent).toBe(1);
  });

  it('an uncertain outcome is recorded as uncertain, and a retry reuses the same idempotency key', async () => {
    const keys: string[] = [];
    const { db, ledger } = fakeDb([due[0]]);
    const transport: MailTransport = {
      async send(_m, key) {
        keys.push(key);
        return keys.length === 1
          ? { ok: false, certainty: 'uncertain', message: 'application_error (no status): Unable to fetch data' }
          : { ok: true, id: 'em_original' };
      },
    };
    expect((await runTrialTips({ db, transport, config: EVERYONE })).outcomes.uncertain).toBe(1);
    expect(ledger.get(`${A}/first_job`)!.status).toBe('uncertain');
    await runTrialTips({ db, transport, config: EVERYONE });
    expect(keys).toEqual([idempotencyKey(A, 'first_job'), idempotencyKey(A, 'first_job')]);
  });

  it('a transport that throws is treated as uncertain, never as "not sent"', async () => {
    const { db } = fakeDb([due[0]]);
    const transport: MailTransport = { send: async () => { throw new Error('socket hang up'); } };
    expect((await runTrialTips({ db, transport, config: EVERYONE })).outcomes.uncertain).toBe(1);
  });

  it('sent but not recorded is reported as record_failed', async () => {
    const { db, setFailMarkSent } = fakeDb([due[0]]);
    const { transport } = mockTransport();
    setFailMarkSent(true);
    expect((await runTrialTips({ db, transport, config: EVERYONE })).outcomes.record_failed).toBe(1);
  });

  it('reports rows needing review, without addresses', async () => {
    const { db } = fakeDb([], { review: [{ user_id: A, step: 'first_job', email: null, shop_name: null, status: 'uncertain' } as never] });
    const report = await runTrialTips({ db, transport: mockTransport().transport, config: EVERYONE });
    expect(report.needsReview).toEqual([{ user: A.slice(0, 8), step: 'first_job', status: 'uncertain' }]);
  });

  it('caps a backlog', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...due[0], user_id: `10000000-0000-4000-8000-00000000000${i}` }));
    const { db } = fakeDb(many);
    const { transport, sent } = mockTransport();
    await runTrialTips({ db, transport, config: EVERYONE, maxSends: 3 });
    expect(sent).toHaveLength(3);
  });

  it('the report contains no address and no secret — only a fingerprint of the unsubscribe secret', async () => {
    const { db } = fakeDb(due);
    const report = await runTrialTips({ db, transport: mockTransport().transport, config: EVERYONE });
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/@/);
    expect(json).not.toContain(SECRET);
    expect(report.unsubscribeSecretFingerprint).toBe(secretFingerprint(SECRET));
    expect(report.unsubscribeSecretFingerprint).toMatch(/^[0-9a-f]{12}$/);
  });
});
