/**
 * One pass of the morning-brief job: for every shop with Redline AI
 * access, decide — in the shop's own timezone — whether its 05:00 brief
 * is due, and send it.
 *
 * Run by .github/workflows/morning-brief.yml (the single scheduler)
 * through scripts/run-morning-brief.ts. The workflow runs HOURLY; this
 * pass is what turns "hourly" into "05:00 wherever the shop is": a shop
 * is only emailed while its local time is inside the 05:00 hour, and
 * never late — a brief that missed its hour waits for tomorrow's.
 *
 * For each shop, in order:
 *
 *   1. access     Redline AI enabled for the shop — the redline_ai flag
 *                 OR a Professional/Business/Enterprise plan on the
 *                 owner's profile (lib/redline-ai/access). The same
 *                 decision the app makes; a shop the panel is closed to
 *                 gets no email.
 *   2. recipient  the shop owner's profile email. No owner email, no
 *                 brief — there is nobody to send it to.
 *   3. audience   canary mode (the default) skips anyone not on the
 *                 canary list, before anything is claimed.
 *   4. timezone   stored → state from address → America/New_York
 *                 (lib/morningBrief/timezone).
 *   5. dedupe     a morning_brief_sends row for (shop, local date) in a
 *                 blocking status (claimed/sent/uncertain) means today's
 *                 brief is done or in flight — skip.
 *   6. claim      INSERT the sends row; the unique (shop, local_date)
 *                 key means two overlapping runs cannot both win. A
 *                 'failed' row (a definite rejection earlier in the same
 *                 hour) may be re-claimed.
 *   7. build      the DETERMINISTIC brief (lib/redline-ai queries +
 *                 buildMorningBriefAnswer) for the shop's local date.
 *                 No LLM anywhere in this path.
 *   8. send       via Resend with idempotency key
 *                 morning-brief/<shop>/<local date>.
 *   9. record     sent | failed (definitely not sent) | uncertain (may
 *                 have been sent — never retried; see the migration).
 *
 * Unless every launch gate passes (readMorningBriefConfig) this is a DRY
 * RUN: it claims, sends and records nothing, and reports every eligible
 * shop with the local date of its next 05:00 brief.
 *
 * Nothing personal is logged: reports carry shop names, timezones, counts
 * and shortened ids — never an email address. Business data is read only;
 * the sends ledger is the only write.
 */
import {
  buildMorningBriefAnswer,
} from '@/lib/redline-ai/answers';
import {
  fetchAwaitingEstimates,
  fetchOpenJobs,
  fetchOwed,
  fetchShopName,
  scopeFor,
  type RedlineDb,
} from '@/lib/redline-ai/queries';
import { evaluateRedlineAiForShop } from '@/lib/redline-ai/access';
import type { FeatureFlag } from '@/lib/featureFlags/types';
import type { MailTransport, OutboundEmail, SendResult } from '@/lib/trialTips/runner';
import { MORNING_BRIEF_REPLY_TO, recipientAllowed, type MorningBriefConfig } from './config';
import { renderMorningBriefEmail } from './email';
import {
  localParts,
  nextBriefLocalDate,
  resolveShopTimezone,
  shouldSendMorningBrief,
  type TimezoneSource,
} from './timezone';

/** The query surface this job needs, so tests can supply a stub. */
export interface MorningBriefDb {
  from(table: string): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChain = any;

interface Rows {
  data: Record<string, unknown>[] | null;
  error: { message?: string; code?: string } | null;
}

function t(db: MorningBriefDb, name: string): AnyChain {
  return db.from(name) as AnyChain;
}

async function rows(q: unknown): Promise<Record<string, unknown>[]> {
  const res = (await (q as PromiseLike<Rows>)) ?? { data: null, error: null };
  if (res.error) throw new Error(res.error.message ?? 'query failed');
  return res.data ?? [];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export type MorningBriefOutcome =
  | 'sent' | 'failed' | 'uncertain' | 'record_failed'
  | 'would_send' | 'already_sent' | 'not_due'
  | 'not_enabled' | 'no_email' | 'not_canary';

export interface MorningBriefItem {
  /** Shortened shop id — enough to find the row, not the full uuid. */
  shop: string;
  shopName: string;
  timezone: string;
  timezoneSource: TimezoneSource;
  /** The local date the brief is (or would be) for. */
  localDate: string;
  outcome: MorningBriefOutcome;
}

export interface MorningBriefReport {
  mode: 'live' | 'dry-run';
  audience: 'canary' | 'everyone';
  blockers: string[];
  shopsConsidered: number;
  outcomes: Record<MorningBriefOutcome, number>;
  items: MorningBriefItem[];
}

/** Builds the deterministic brief text for one shop and local date. */
export type BriefBuilder = (db: MorningBriefDb, shopId: string, localDate: string) => Promise<string>;

export const defaultBriefBuilder: BriefBuilder = async (db, shopId, localDate) => {
  const scope = await scopeFor(db as RedlineDb, shopId);
  const [openJobs, awaitingEstimates, owedGroups] = await Promise.all([
    fetchOpenJobs(db as RedlineDb, scope, localDate),
    fetchAwaitingEstimates(db as RedlineDb, scope, localDate),
    fetchOwed(db as RedlineDb, scope, localDate),
  ]);
  return buildMorningBriefAnswer({ openJobs, awaitingEstimates, owedGroups }, localDate);
};

export function idempotencyKey(shopId: string, localDate: string): string {
  return `morning-brief/${shopId}/${localDate}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** Provider errors can echo the recipient; keep the message but strip addresses. */
function scrub(message: string): string {
  return message.replace(/[^\s@<>"'()]+@[^\s@<>"'()]+/g, '[address]').slice(0, 300);
}

/** Send-ledger statuses that mean "today's brief is done or in flight". */
const BLOCKING_STATUSES = new Set(['claimed', 'sent', 'uncertain']);

export async function runMorningBrief(opts: {
  db: MorningBriefDb;
  transport: MailTransport | null;
  config: MorningBriefConfig;
  now?: Date;
  buildBrief?: BriefBuilder;
  /** Upper bound per run, so a backlog cannot turn into a burst. */
  maxSends?: number;
}): Promise<MorningBriefReport> {
  const { db, config } = opts;
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const maxSends = opts.maxSends ?? 200;
  const buildBrief = opts.buildBrief ?? defaultBriefBuilder;
  const live = config.live && !!opts.transport;

  const report: MorningBriefReport = {
    mode: live ? 'live' : 'dry-run',
    audience: config.audience,
    blockers: live ? [] : (config.blockers.length ? config.blockers : ['no mail transport configured']),
    shopsConsidered: 0,
    outcomes: {
      sent: 0, failed: 0, uncertain: 0, record_failed: 0, would_send: 0,
      already_sent: 0, not_due: 0, not_enabled: 0, no_email: 0, not_canary: 0,
    },
    items: [],
  };
  const record = (item: MorningBriefItem | null, outcome: MorningBriefOutcome) => {
    report.outcomes[outcome] += 1;
    if (item) report.items.push(item);
  };

  // ── Load the world (service role; reads only) ──────────────────────────
  const [shopRows, flagRows] = await Promise.all([
    rows(t(db, 'shops').select('id, name, archived_at')),
    rows(t(db, 'feature_flags').select('*')) as Promise<Record<string, unknown>[]>,
  ]);
  const flags = flagRows as unknown as FeatureFlag[];
  const shops = shopRows.filter(s => !s.archived_at);
  report.shopsConsidered = shops.length;
  const shopIds = shops.map(s => str(s.id)).filter(Boolean);
  if (!shopIds.length) return report;

  const ownerRows = await rows(t(db, 'shop_users').select('shop_id, user_id').eq('role', 'owner'));
  const ownerByShop = new Map<string, string>();
  for (const r of ownerRows) {
    const shopId = str(r.shop_id);
    if (shopId && !ownerByShop.has(shopId)) ownerByShop.set(shopId, str(r.user_id));
  }
  const ownerIds = [...new Set(ownerByShop.values())].filter(Boolean);

  const [profileRows, settingRows, sendRows] = await Promise.all([
    ownerIds.length
      ? rows(t(db, 'profiles').select('id, email, plan').in('id', ownerIds))
      : Promise.resolve([] as Record<string, unknown>[]),
    rows(t(db, 'shop_settings').select('shop_id, address, timezone').in('shop_id', shopIds)),
    rows(t(db, 'morning_brief_sends').select('shop_id, local_date, status').in('shop_id', shopIds)),
  ]);
  const profileById = new Map(profileRows.map(p => [str(p.id), p]));
  const settingsByShop = new Map(settingRows.map(s => [str(s.shop_id), s]));
  const blocking = new Set(
    sendRows
      .filter(r => BLOCKING_STATUSES.has(str(r.status)))
      .map(r => `${str(r.shop_id)}|${str(r.local_date)}`),
  );

  // ── Per shop ───────────────────────────────────────────────────────────
  let sends = 0;
  for (const shop of shops) {
    const shopId = str(shop.id);
    const shopName = str(shop.name);
    const ownerId = ownerByShop.get(shopId);
    const profile = ownerId ? profileById.get(ownerId) : undefined;
    const plan = str(profile?.plan) || null;

    // 1. Access — the same decision the app makes.
    if (!evaluateRedlineAiForShop(flags, shopId, plan)) { record(null, 'not_enabled'); continue; }

    // 2. Recipient.
    const email = str(profile?.email);
    if (!email) { record(null, 'no_email'); continue; }

    // 3. Audience — before anything is claimed.
    if (!recipientAllowed(config, email)) { record(null, 'not_canary'); continue; }

    // 4–5. Timezone + dedupe decision.
    const settings = settingsByShop.get(shopId);
    const tz = resolveShopTimezone({
      storedTimezone: str(settings?.timezone) || null,
      address: str(settings?.address) || null,
    });
    const { localDate } = localParts(now, tz.timezone);
    const alreadySent = blocking.has(`${shopId}|${localDate}`);
    const decision = shouldSendMorningBrief({ now, timezone: tz.timezone, alreadySentForLocalDate: alreadySent });

    const baseItem = {
      shop: shortId(shopId),
      shopName,
      timezone: tz.timezone,
      timezoneSource: tz.source,
    };

    if (!live) {
      // Dry run: report the shop's next 05:00 brief, claimed or not.
      if (decision.alreadySent) {
        record({ ...baseItem, localDate: decision.localDate, outcome: 'already_sent' }, 'already_sent');
      } else {
        record({
          ...baseItem,
          localDate: decision.due ? decision.localDate : nextBriefLocalDate(now, tz.timezone),
          outcome: 'would_send',
        }, 'would_send');
      }
      continue;
    }

    if (decision.alreadySent) {
      record({ ...baseItem, localDate: decision.localDate, outcome: 'already_sent' }, 'already_sent');
      continue;
    }
    if (!decision.due) { record(null, 'not_due'); continue; }
    if (sends >= maxSends) { record(null, 'not_due'); continue; }

    // 6. Claim — the unique (shop, local_date) key arbitrates.
    const claim = (await t(db, 'morning_brief_sends').insert({
      shop_id: shopId,
      local_date: decision.localDate,
      timezone: tz.timezone,
      status: 'claimed',
      claimed_at: nowIso,
    })) as Rows;
    if (claim.error) {
      if (claim.error.code === '23505') {
        // A row exists. Only a definite failure may be re-claimed, and
        // only inside this same 05:00 hour (we are in it — decision.due).
        const existing = await rows(
          t(db, 'morning_brief_sends').select('status')
            .eq('shop_id', shopId).eq('local_date', decision.localDate).limit(1),
        );
        if (str(existing[0]?.status) !== 'failed') {
          record({ ...baseItem, localDate: decision.localDate, outcome: 'already_sent' }, 'already_sent');
          continue;
        }
        const reclaimed = (await t(db, 'morning_brief_sends')
          .update({ status: 'claimed', claimed_at: nowIso, last_error: null })
          .eq('shop_id', shopId).eq('local_date', decision.localDate)) as Rows;
        if (reclaimed.error) throw new Error(`morning brief re-claim failed: ${reclaimed.error.message}`);
      } else {
        throw new Error(`morning brief claim failed: ${claim.error.message}`);
      }
    }
    sends += 1;

    const mark = async (fields: Record<string, unknown>): Promise<boolean> => {
      const res = (await t(db, 'morning_brief_sends')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('shop_id', shopId).eq('local_date', decision.localDate)) as Rows;
      return !res.error;
    };

    // 7. Build — deterministic only. A build failure is a definite
    // non-send: mark failed so the next hourly run inside the hour can
    // retry, and move on.
    let briefText: string;
    try {
      briefText = await buildBrief(db, shopId, decision.localDate);
    } catch (e) {
      await mark({ status: 'failed', last_error: scrub(String((e as Error)?.message ?? e)) });
      record({ ...baseItem, localDate: decision.localDate, outcome: 'failed' }, 'failed');
      continue;
    }

    const displayName = shopName || (await fetchShopName(db as RedlineDb, shopId)) || 'Your shop';
    const rendered = renderMorningBriefEmail({
      shopName: displayName,
      localDate: decision.localDate,
      briefText,
      appUrl: config.appUrl!,
    });
    const message: OutboundEmail = {
      from: `RedlineD1 <${config.fromAddress}>`,
      to: email,
      replyTo: MORNING_BRIEF_REPLY_TO,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {},
      tags: [{ name: 'campaign', value: 'morning_brief' }],
    };

    // 8. Send.
    let result: SendResult;
    try {
      result = await opts.transport!.send(message, idempotencyKey(shopId, decision.localDate));
    } catch (e) {
      result = { ok: false, certainty: 'uncertain', message: String((e as Error)?.message ?? e) };
    }

    // 9. Record.
    if (!result.ok) {
      const status = result.certainty === 'rejected' ? 'failed' : 'uncertain';
      await mark({ status, last_error: scrub(result.message) });
      record(
        { ...baseItem, localDate: decision.localDate, outcome: status },
        status,
      );
      continue;
    }
    const marked = await mark({ status: 'sent', resend_email_id: result.id, sent_at: nowIso });
    record(
      { ...baseItem, localDate: decision.localDate, outcome: marked ? 'sent' : 'record_failed' },
      marked ? 'sent' : 'record_failed',
    );
  }

  return report;
}
