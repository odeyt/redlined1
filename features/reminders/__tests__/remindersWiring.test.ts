/**
 * How reminders are wired into the app, and what they must never do.
 *
 *   - Off by default: with the internal_reminders flag off there is no route,
 *     no navigation entry, no widget content and no "Add reminder" button.
 *   - Internal only: nothing in the feature can send a message. No mail, push,
 *     SMS or messaging module is imported, no send endpoint is called, and no
 *     state reads as "sent".
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { flagBlockedModules } from '@/lib/featureFlags/flaggedModules';
import { navItems } from '@/lib/mock-data';
import { WIDGET_REGISTRY, getWidgetsForRole } from '@/lib/dashboardWidgets/registry';
import { canAccess } from '@/lib/planGate';
import { getBlockedModules } from '@/lib/useShop';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const FEATURE_FILES = [
  ...readdirSync(join(root, 'features/reminders')).filter(f => /\.tsx?$/.test(f)).map(f => `features/reminders/${f}`),
  'lib/domain/reminders.ts',
  'lib/reminders/entitlements.ts',
  'lib/reminders/dueClassification.ts',
  'lib/reminders/schemas.ts',
  'services/reminderService.ts',
  'features/dashboard/widgets/catalog/RemindersDueWidget.tsx',
];

describe('feature flag: off means absent', () => {
  it('the route is blocked while the flag is off, and open when it is on', () => {
    expect(flagBlockedModules({ internalReminders: false })).toEqual(['reminders']);
    expect(flagBlockedModules({ internalReminders: true })).toEqual([]);
  });

  it('AppShell and Sidebar both apply the same rule', () => {
    expect(read('components/AppShell.tsx')).toMatch(/flagBlockedModules\(\{ internalReminders \}\)/);
    expect(read('components/AppShell.tsx')).toMatch(/\.\.\.flagBlocked\]/);
    expect(read('components/Sidebar.tsx')).toMatch(/flagBlockedModules\(\{ internalReminders \}\)/);
  });

  it('the widget is gated in the catalogue and in its own render', () => {
    expect(WIDGET_REGISTRY['reminders-due'].requiredFlag).toBe('internal_reminders');
    expect(getWidgetsForRole('owner', new Set()).map(w => w.id)).not.toContain('reminders-due');
    expect(getWidgetsForRole('technician', new Set(['internal_reminders'])).map(w => w.id)).toContain('reminders-due');
    expect(read('features/dashboard/widgets/catalog/RemindersDueWidget.tsx'))
      .toMatch(/useFeatureFlag\('internal_reminders'\)[\s\S]*if \(!enabled\)/);
  });

  it('"Add reminder" renders nothing while the flag is off', () => {
    expect(read('features/reminders/AddReminderButton.tsx'))
      .toMatch(/const enabled = useFeatureFlag\('internal_reminders'\);\s*if \(!enabled\) return null;/);
  });

  it('is seeded disabled by the migration', () => {
    expect(read('supabase/migrations/2026-09-29_internal_reminders.sql'))
      .toMatch(/\('internal_reminders', false,/);
  });
});

describe('navigation and plans', () => {
  it('has a navigation entry', () => {
    expect(navItems.map(([id]) => id)).toContain('reminders');
  });

  it('is available on Free Forever (capped in the database, not hidden)', () => {
    expect(canAccess('reminders', 'free')).toBe(true);
    expect(canAccess('reminders', 'trial')).toBe(true);
    expect(canAccess('reminders', 'pro')).toBe(true);
  });

  it('is open to every known role by default and closed to an unresolved one', () => {
    for (const role of ['owner', 'manager', 'advisor', 'technician']) {
      expect(getBlockedModules(role)).not.toContain('reminders');
    }
    expect(getBlockedModules('')).toContain('reminders');
  });
});

describe('internal only — nothing is sent', () => {
  it.each(FEATURE_FILES)('%s imports no messaging, mail or push module', file => {
    const src = read(file);
    expect(src).not.toMatch(/from ['"][^'"]*(mail|push|resend|web-push|send-?message|messaging|sapelee|autodee|sms|whatsapp)[^'"]*['"]/i);
  });

  it.each(FEATURE_FILES)('%s calls no send endpoint', file => {
    const src = read(file);
    expect(src).not.toMatch(/\/api\/(send-|send_|job-notify|push|inspection-email|signup-notify|sapelee)/);
  });

  it('never labels a reminder as sent, contacted, confirmed or automated', () => {
    for (const file of FEATURE_FILES.filter(f => f.endsWith('.tsx'))) {
      // Strings shown to people: JSX text and quoted literals.
      const visible = (read(file).match(/>[^<>{}]+<|'[^'\n]{3,}'|`[^`\n]{3,}`/g) ?? []).join('\n');
      expect(visible).not.toMatch(/\b(sent|contacted|confirmed|automated)\b/i);
    }
  });

  it('the schema has no outbound states or channels', () => {
    const sql = read('supabase/migrations/2026-09-29_internal_reminders.sql');
    const executable = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    expect(executable).not.toMatch(/\b(channel|sms|email|phone|whatsapp|webhook|net\.http|pg_net|sent_at)\b/i);
  });
});
