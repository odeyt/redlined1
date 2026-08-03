/**
 * Daily AI request limits, per shop.
 *
 * AI_DAILY_LIMIT_FREE / _PRO / _PRO_PLUS have existed as environment variables
 * since the commercial work began, and nothing read them. The AI route called
 * Anthropic and then wrote a usage row to `ai_usage_logs` — a table that does
 * not exist — so the write failed silently and no limit was ever enforced.
 * Every request billed the platform's Anthropic key with no ceiling, for any
 * account, at any plan.
 *
 * Metering now uses `usage_records`, which does exist and already carries an
 * `ai_requests` key and a per-shop, per-period shape.
 *
 * The limit is daily rather than monthly deliberately: a monthly cap can be
 * exhausted in an afternoon by a runaway client, and the damage is done before
 * anyone looks. A daily cap bounds the worst day.
 */

import { getAdminDb } from '@/lib/supabaseServer';
import { getPlanStatus, type PlanStatus } from '@/lib/planGate';

/** Falls back to conservative defaults when the env vars are unset. */
function limitFor(status: PlanStatus): number {
  const raw =
    status === 'pro'   ? process.env.AI_DAILY_LIMIT_PRO
    : status === 'trial' ? process.env.AI_DAILY_LIMIT_PRO
    : process.env.AI_DAILY_LIMIT_FREE;

  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;

  // Defaults chosen to be usable but not open-ended, since exceeding them
  // costs real money on the platform's own API key.
  return status === 'free' ? 10 : 200;
}

export interface QuotaVerdict {
  allowed:   boolean;
  used:      number;
  limit:     number;
  remaining: number;
  status:    PlanStatus;
}

/** Start of the current day in UTC — the window a daily limit applies to. */
function startOfDayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Whether this shop may make another AI request today.
 *
 * Fails OPEN on an infrastructure error — a metering outage must not stop
 * customers working. It fails CLOSED on a shop we cannot identify, since an
 * unattributable request cannot be counted against anyone and is exactly the
 * shape an abusive one would take.
 */
export async function checkAiQuota(shopId: string): Promise<QuotaVerdict> {
  const db = getAdminDb();

  if (!shopId) {
    return { allowed: false, used: 0, limit: 0, remaining: 0, status: 'free' };
  }

  // Plan is read from the shop's owner profile: usage is billed to the shop,
  // and every shop has exactly one owner row.
  let status: PlanStatus = 'free';
  try {
    const { data: owner } = await db
      .from('shop_users')
      .select('user_id')
      .eq('shop_id', shopId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();

    if (owner?.user_id) {
      const { data: profile } = await db
        .from('profiles')
        .select('plan, trial_ends_at')
        .eq('id', owner.user_id)
        .maybeSingle();
      status = getPlanStatus(profile?.plan ?? null, profile?.trial_ends_at ?? null);
    }
  } catch {
    // Leave status as 'free' — the tightest limit, not the loosest.
  }

  const limit = limitFor(status);

  try {
    const { data, error } = await db
      .from('usage_records')
      .select('quantity')
      .eq('shop_id', shopId)
      .eq('usage_key', 'ai_requests')
      .gte('created_at', startOfDayUtc().toISOString());

    if (error) throw new Error(error.message);

    const used = (data ?? []).reduce((sum, r: { quantity: number | null }) => sum + (r.quantity ?? 0), 0);
    return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used), status };
  } catch {
    // Metering is unavailable. Let the request through rather than break the
    // product over a counting problem, and report it so it is not permanent.
    console.error('[aiQuota] could not read usage — allowing the request unmetered', JSON.stringify({ shopId }));
    return { allowed: true, used: 0, limit, remaining: limit, status };
  }
}
