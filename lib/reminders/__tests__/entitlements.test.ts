/**
 * The reminder plan rules, and that the TypeScript copy says the same thing as
 * the database function that actually enforces them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  reminderTierForOwners, reminderEntitlements, parseReminderRefusal, reminderRefusalMessage,
  isUpgradeRefusal,
} from '../entitlements';
import { PLANS, FREE_FOREVER_REMINDERS } from '@/config/plans';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/2026-09-29_internal_reminders.sql'), 'utf8',
).replace(/\r\n/g, '\n');

interface TierScenario {
  name: string;
  owners: { plan?: string | null; trialDays?: number | null; profile?: false }[];
  tier: string;
}
const TIER_SCENARIOS: TierScenario[] = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/db/reminders/planTierScenarios.json'), 'utf8')).scenarios;

const daysFromNow = (d: number | null | undefined) =>
  (d === null || d === undefined ? null : new Date(Date.now() + d * 86_400_000).toISOString());

describe('reminderTierForOwners — the shared scenario table (the SQL runs the same rows)', () => {
  it.each(TIER_SCENARIOS.map(s => [s.name, s] as const))('%s', (_name, s) => {
    const owners = s.owners.map(o => (o.profile === false
      ? null
      : { plan: o.plan ?? null, trialEndsAt: daysFromNow(o.trialDays) }));
    expect(reminderTierForOwners(owners)).toBe(s.tier);
  });

  it('nothing that cannot be proven unlocks team or unlimited', () => {
    for (const s of TIER_SCENARIOS.filter(x => x.name.startsWith('FAIL CLOSED'))) {
      expect({ name: s.name, tier: s.tier }).toEqual({ name: s.name, tier: 'free' });
    }
    expect(reminderTierForOwners([])).toBe('free');
    expect(reminderTierForOwners([null])).toBe('free');
    expect(reminderTierForOwners([{ plan: null, trialEndsAt: null }])).toBe('free');
  });

  it('covers every plan in the registry', () => {
    const named = new Set(TIER_SCENARIOS.flatMap(s => s.owners.map(o => o.plan)));
    for (const id of Object.keys(PLANS)) expect(named).toContain(id);
  });
});

describe('no production shop is special-cased', () => {
  it('the reminder SQL names no shop id', () => {
    const executable = MIGRATION.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    expect(executable).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('reminderEntitlements', () => {
  it('free: 3 open, self only', () => {
    expect(reminderEntitlements('free')).toEqual({ tier: 'free', maxOpen: 3, canAssignToOthers: false });
  });
  it('solo: unlimited, self only', () => {
    expect(reminderEntitlements('solo')).toEqual({ tier: 'solo', maxOpen: null, canAssignToOthers: false });
  });
  it('team: unlimited, team assignment', () => {
    expect(reminderEntitlements('team')).toEqual({ tier: 'team', maxOpen: null, canAssignToOthers: true });
  });
});

describe('the database enforces the same rules', () => {
  const tierFn = /FUNCTION public\.reminder_plan_tier[\s\S]*?END \$fn\$;/.exec(MIGRATION)![0];

  it('names exactly the plans with team assignment in the registry (plus legacy pro)', () => {
    const sqlTeam = /v_owner\.plan IN \(([^)]+)\)/.exec(tierFn)![1]
      .split(',').map(s => s.trim().replace(/'/g, '')).sort();
    const tsTeam = [...Object.values(PLANS).filter(p => p.features.teamReminders).map(p => p.id), 'pro'].sort();
    expect(sqlTeam).toEqual(tsTeam);
  });

  it('treats Solo as the one paid plan without team assignment', () => {
    expect(tierFn).toMatch(/v_owner\.plan = 'solo' THEN\s+v_best := 'solo'/);
    expect(Object.values(PLANS).filter(p => !p.features.teamReminders).map(p => p.id)).toEqual(['solo']);
  });

  it('caps Free Forever at the registry\'s number', () => {
    expect(MIGRATION).toContain(`IF v_open_count >= ${FREE_FOREVER_REMINDERS.maxOpen} THEN`);
    expect(MIGRATION).toContain(`'REMINDER_LIMIT:${FREE_FOREVER_REMINDERS.maxOpen}'`);
  });

  it('takes a per-shop lock before counting, and only on the free path', () => {
    const guard = /FUNCTION public\.shop_reminders_guard[\s\S]*?END \$fn\$;/.exec(MIGRATION)![0];
    const lock = guard.indexOf('pg_advisory_xact_lock');
    const count = guard.indexOf('SELECT count(*) INTO v_open_count');
    expect(lock).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(lock);
    expect(guard.slice(0, lock)).toMatch(/reminder_plan_tier\(NEW\.shop_id\) = 'free'/);
  });

  it('reads no payment-provider state', () => {
    expect(MIGRATION).not.toMatch(/creem|stripe|subscriptions\b|provider_/i);
  });
});

describe('refusals', () => {
  const err = (message: string) => ({ message, code: 'P0001' });

  it('reads each trigger code', () => {
    expect(parseReminderRefusal(err('REMINDER_LIMIT:3'))).toEqual({ kind: 'limit', limit: 3 });
    expect(parseReminderRefusal(err('REMINDER_TEAM_PLAN'))).toEqual({ kind: 'team_plan' });
    expect(parseReminderRefusal(err('REMINDER_ASSIGN_FORBIDDEN'))).toEqual({ kind: 'assign_forbidden' });
    expect(parseReminderRefusal(err('REMINDER_ASSIGNEE_INVALID'))).toEqual({ kind: 'assignee_invalid' });
    expect(parseReminderRefusal(err('REMINDER_LINK_INVALID:job_card'))).toEqual({ kind: 'link_invalid', entity: 'job_card' });
    expect(parseReminderRefusal(err('REMINDER_IMMUTABLE'))).toEqual({ kind: 'immutable' });
    expect(parseReminderRefusal(err('REMINDER_NEW_MUST_BE_OPEN'))).toEqual({ kind: 'not_open' });
  });

  it('does not dress up an unrelated failure as a refusal', () => {
    expect(parseReminderRefusal(err('connection reset'))).toBeNull();
    expect(parseReminderRefusal(null)).toBeNull();
    expect(parseReminderRefusal({})).toBeNull();
  });

  it('offers an upgrade only for plan refusals', () => {
    expect(isUpgradeRefusal({ kind: 'limit', limit: 3 })).toBe(true);
    expect(isUpgradeRefusal({ kind: 'team_plan' })).toBe(true);
    expect(isUpgradeRefusal({ kind: 'assign_forbidden' })).toBe(false);
    expect(isUpgradeRefusal({ kind: 'link_invalid', entity: 'customer' })).toBe(false);
    expect(isUpgradeRefusal(null)).toBe(false);
  });

  it('every code the trigger can raise has a sentence', () => {
    const codes = [...MIGRATION.matchAll(/RAISE EXCEPTION '(REMINDERS?_[A-Z_]+)/g)].map(m => m[1]);
    expect(codes).toContain('REMINDERS_DISABLED');
    expect(codes.length).toBeGreaterThanOrEqual(7);
    for (const code of codes) {
      const sample = code === 'REMINDER_LINK_INVALID' ? `${code}:customer` : code === 'REMINDER_LIMIT' ? `${code}:3` : code;
      const refusal = parseReminderRefusal(err(sample));
      expect(refusal).not.toBeNull();
      expect(reminderRefusalMessage(refusal!).length).toBeGreaterThan(20);
    }
  });

  it('the limit message never claims anything was sent', () => {
    expect(reminderRefusalMessage({ kind: 'limit', limit: 3 })).not.toMatch(/sent|contacted|confirmed|automated/i);
  });
});
