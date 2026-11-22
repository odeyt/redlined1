/**
 * One pass of the morning-brief job, against a stub database.
 *
 * What is pinned here: the access gate (plan qualifies, free does not),
 * the 05:00-local-hour decision end to end (an Austin shop at 05:15 CST
 * is due; at 07:00 it is not — and never sent late), the (shop, local
 * date) dedupe across runs, the canary audience, and the dry run writing
 * nothing.
 */
import { runMorningBrief, type MorningBriefDb } from '../runner';
import type { MorningBriefConfig } from '../config';
import type { MailTransport, OutboundEmail } from '@/lib/trialTips/runner';

const SHOP = '11111111-1111-1111-1111-111111111111';
const FREE_SHOP = '22222222-2222-2222-2222-222222222222';

type Tables = Record<string, Record<string, unknown>[]>;

function baseTables(): Tables {
  return {
    shops: [
      { id: SHOP, name: 'D1 Imports', archived_at: null },
      { id: FREE_SHOP, name: 'Free Shop', archived_at: null },
    ],
    feature_flags: [],
    shop_users: [
      { shop_id: SHOP, user_id: 'owner-1', role: 'owner' },
      { shop_id: FREE_SHOP, user_id: 'owner-2', role: 'owner' },
    ],
    profiles: [
      { id: 'owner-1', email: 'owner@example.com', plan: 'professional' },
      { id: 'owner-2', email: 'two@example.com', plan: 'free' },
    ],
    shop_settings: [
      { shop_id: SHOP, address: '1 Main St, Austin, TX 78701', timezone: null },
      { shop_id: FREE_SHOP, address: '2 Oak St, Austin, TX 78701', timezone: null },
    ],
    morning_brief_sends: [],
  };
}

/** A Supabase-shaped stub over plain arrays, with the sends table's
 *  unique (shop_id, local_date) enforced as a 23505, like Postgres. */
function stubDb(tables: Tables): MorningBriefDb {
  return {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: [string, unknown][] = [];
      const inFilters: [string, unknown[]][] = [];
      let insertRow: Record<string, unknown> | null = null;
      let updateFields: Record<string, unknown> | null = null;
      const matching = () => rows.filter(r =>
        filters.every(([c, v]) => r[c] === v) &&
        inFilters.every(([c, vs]) => vs.includes(r[c])));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return chain; },
        in: (c: string, vs: unknown[]) => { inFilters.push([c, vs]); return chain; },
        order: () => chain,
        limit: () => chain,
        insert: (row: Record<string, unknown>) => { insertRow = row; return chain; },
        update: (fields: Record<string, unknown>) => { updateFields = fields; return chain; },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (insertRow) {
            const conflict = table === 'morning_brief_sends' && rows.some(r =>
              r.shop_id === insertRow!.shop_id && r.local_date === insertRow!.local_date);
            if (conflict) {
              return resolve({ data: null, error: { message: 'duplicate key value', code: '23505' } });
            }
            rows.push({ ...insertRow });
            return resolve({ data: null, error: null });
          }
          if (updateFields) {
            for (const r of matching()) Object.assign(r, updateFields);
            return resolve({ data: null, error: null });
          }
          return resolve({ data: matching(), error: null });
        },
      };
      return chain;
    },
  };
}

function recordingTransport() {
  const sent: { message: OutboundEmail; key: string }[] = [];
  const transport: MailTransport = {
    async send(message, idempotencyKey) {
      sent.push({ message, key: idempotencyKey });
      return { ok: true, id: 'email-1' };
    },
  };
  return { transport, sent };
}

const LIVE: MorningBriefConfig = {
  live: true, audience: 'everyone', canaryRecipients: new Set(), blockers: [],
  fromAddress: 'brief@redlined1.com', appUrl: 'https://www.redlined1.com', resendApiKey: 're_test',
};
const DRY: MorningBriefConfig = { ...LIVE, live: false, blockers: ['MORNING_BRIEF_SENDING_ENABLED is not "true"'] };

const briefText = async () => 'Morning brief for 2026-11-23:\n  • 1 open job';
// 05:15 in Austin (CST) on 2026-11-23.
const FIVE_AM = new Date('2026-11-23T11:15:00Z');
// 07:00 in Austin — the brief's hour has passed.
const SEVEN_AM = new Date('2026-11-23T13:00:00Z');

describe('runMorningBrief — live', () => {
  it('sends the due shop its brief and skips the free-plan shop', async () => {
    const tables = baseTables();
    const { transport, sent } = recordingTransport();
    const report = await runMorningBrief({
      db: stubDb(tables), transport, config: LIVE, now: FIVE_AM, buildBrief: briefText,
    });

    expect(report.mode).toBe('live');
    expect(report.outcomes.sent).toBe(1);
    expect(report.outcomes.not_enabled).toBe(1); // Free Shop
    expect(sent).toHaveLength(1);
    expect(sent[0].message.to).toBe('owner@example.com');
    expect(sent[0].message.subject).toBe('Your morning brief — D1 Imports — 2026-11-23');
    expect(sent[0].key).toBe(`morning-brief/${SHOP}/2026-11-23`);
    expect(tables.morning_brief_sends).toEqual([
      expect.objectContaining({ shop_id: SHOP, local_date: '2026-11-23', status: 'sent', resend_email_id: 'email-1' }),
    ]);
    // The item records the timezone decision, not the address it went to.
    expect(report.items).toEqual([
      expect.objectContaining({ shopName: 'D1 Imports', timezone: 'America/Chicago', timezoneSource: 'state', outcome: 'sent' }),
    ]);
    expect(JSON.stringify(report)).not.toContain('owner@example.com');
  });

  it('a second run in the same hour sends nothing (dedupe)', async () => {
    const tables = baseTables();
    const { transport, sent } = recordingTransport();
    const db = stubDb(tables);
    await runMorningBrief({ db, transport, config: LIVE, now: FIVE_AM, buildBrief: briefText });
    const report = await runMorningBrief({ db, transport, config: LIVE, now: FIVE_AM, buildBrief: briefText });
    expect(report.outcomes.already_sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(tables.morning_brief_sends).toHaveLength(1);
  });

  it('never sends late: at 07:00 local the shop is not due', async () => {
    const tables = baseTables();
    const { transport, sent } = recordingTransport();
    const report = await runMorningBrief({
      db: stubDb(tables), transport, config: LIVE, now: SEVEN_AM, buildBrief: briefText,
    });
    expect(report.outcomes.not_due).toBe(1);
    expect(sent).toHaveLength(0);
    expect(tables.morning_brief_sends).toHaveLength(0);
  });

  it('canary mode skips owners not on the list, before claiming', async () => {
    const tables = baseTables();
    const { transport, sent } = recordingTransport();
    const config: MorningBriefConfig = { ...LIVE, audience: 'canary', canaryRecipients: new Set(['someone-else@example.com']) };
    const report = await runMorningBrief({
      db: stubDb(tables), transport, config, now: FIVE_AM, buildBrief: briefText,
    });
    expect(report.outcomes.not_canary).toBe(1);
    expect(sent).toHaveLength(0);
    expect(tables.morning_brief_sends).toHaveLength(0);
  });

  it('a definite rejection is marked failed and may be re-claimed in the hour', async () => {
    const tables = baseTables();
    const rejecting: MailTransport = {
      async send() { return { ok: false, certainty: 'rejected', message: '400: bad address' }; },
    };
    const db = stubDb(tables);
    const first = await runMorningBrief({ db, transport: rejecting, config: LIVE, now: FIVE_AM, buildBrief: briefText });
    expect(first.outcomes.failed).toBe(1);
    expect(tables.morning_brief_sends[0].status).toBe('failed');

    const { transport, sent } = recordingTransport();
    const second = await runMorningBrief({ db, transport, config: LIVE, now: FIVE_AM, buildBrief: briefText });
    expect(second.outcomes.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(tables.morning_brief_sends).toHaveLength(1);
    expect(tables.morning_brief_sends[0].status).toBe('sent');
  });

  it('an uncertain outcome is recorded and never retried', async () => {
    const tables = baseTables();
    const flaky: MailTransport = {
      async send() { return { ok: false, certainty: 'uncertain', message: 'network timeout' }; },
    };
    const db = stubDb(tables);
    const first = await runMorningBrief({ db, transport: flaky, config: LIVE, now: FIVE_AM, buildBrief: briefText });
    expect(first.outcomes.uncertain).toBe(1);

    const { transport, sent } = recordingTransport();
    const second = await runMorningBrief({ db, transport, config: LIVE, now: FIVE_AM, buildBrief: briefText });
    expect(second.outcomes.already_sent).toBe(1);
    expect(sent).toHaveLength(0);
  });
});

describe('runMorningBrief — dry run', () => {
  it('reports the next 05:00 brief per eligible shop and writes nothing', async () => {
    const tables = baseTables();
    const report = await runMorningBrief({
      db: stubDb(tables), transport: null, config: DRY, now: SEVEN_AM, buildBrief: briefText,
    });
    expect(report.mode).toBe('dry-run');
    expect(report.outcomes.would_send).toBe(1);
    expect(report.outcomes.not_enabled).toBe(1);
    expect(report.items).toEqual([
      expect.objectContaining({
        shopName: 'D1 Imports', timezone: 'America/Chicago',
        localDate: '2026-11-24', // 07:00 local — the next brief is tomorrow's
        outcome: 'would_send',
      }),
    ]);
    expect(tables.morning_brief_sends).toHaveLength(0);
  });

  it('inside the 05:00 hour the dry run names today\'s date', async () => {
    const tables = baseTables();
    const report = await runMorningBrief({
      db: stubDb(tables), transport: null, config: DRY, now: FIVE_AM, buildBrief: briefText,
    });
    expect(report.items[0]).toEqual(expect.objectContaining({ localDate: '2026-11-23', outcome: 'would_send' }));
  });
});
