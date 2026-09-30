/**
 * The internal_reminders flag is decided in two places: the app's evaluator
 * (which shows or hides the UI) and public.internal_reminders_enabled() in the
 * database (which lets reads and writes through or not). They must agree, or
 * where they cannot, the database must be the one saying no.
 *
 * Both are run against tests/db/reminders/flagScenarios.json: this test runs
 * the app's evaluateFlag(); tests/db/run-reminders-db-tests.mjs runs the SQL
 * function over the same rows.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateFlag } from '@/lib/featureFlags/featureFlagService';
import type { FeatureFlag } from '@/lib/featureFlags/types';

interface Row { scope: FeatureFlag['scope']; enabled: boolean; shop?: string; user?: string; role?: string; environment?: string }
interface Scenario { name: string; rows: Row[]; ts: boolean; sql: boolean }

const { scenarios } = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/db/reminders/flagScenarios.json'), 'utf8')) as { scenarios: Scenario[] };

const IDS: Record<string, string> = {
  SHOP: 'aaaaaaaa-0000-4000-8000-00000000000a',
  OTHER_SHOP: 'aaaaaaaa-0000-4000-8000-00000000000b',
  USER: 'bbbbbbbb-0000-4000-8000-000000000001',
  OTHER_USER: 'bbbbbbbb-0000-4000-8000-000000000002',
};

function toFlags(rows: Row[]): FeatureFlag[] {
  return rows.map((r, i) => ({
    id: String(i), flag_key: 'internal_reminders', display_name: '', description: '',
    enabled: r.enabled, scope: r.scope,
    shop_id: r.shop ? IDS[r.shop] : null,
    user_id: r.user ? IDS[r.user] : null,
    role: (r.role as FeatureFlag['role']) ?? null,
    environment: (r.environment as FeatureFlag['environment']) ?? null,
    created_at: '', updated_at: '',
  }));
}

const ctx = { userId: IDS.USER, shopId: IDS.SHOP, role: 'technician', environment: 'production' as const };

describe('internal_reminders flag — app evaluator over the shared scenarios', () => {
  it.each(scenarios.map(s => [s.name, s] as const))('%s', (_name, s) => {
    expect(evaluateFlag(toFlags(s.rows), 'internal_reminders', ctx)).toBe(s.ts);
  });
});

describe('the database only ever fails closed', () => {
  it('never ON where the app says OFF', () => {
    for (const s of scenarios) {
      if (s.sql) expect({ name: s.name, ts: s.ts }).toEqual({ name: s.name, ts: true });
    }
  });

  it('every disagreement is a named fail-closed case', () => {
    const disagreements = scenarios.filter(s => s.ts !== s.sql);
    for (const s of disagreements) expect(s.name).toMatch(/^FAIL CLOSED:/);
    expect(disagreements.length).toBeGreaterThan(0);
  });

  it('covers every scope the flag system has', () => {
    const scopes = new Set(scenarios.flatMap(s => s.rows.map(r => r.scope)));
    for (const scope of ['global', 'shop', 'role', 'user', 'environment']) expect(scopes).toContain(scope);
  });
});
