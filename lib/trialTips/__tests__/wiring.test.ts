/**
 * How the trial-tips pieces are wired into the app, read from source: the
 * things a refactor could quietly undo.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('signup', () => {
  const page = read('app/signup/page.tsx');

  it('the trial-tips box starts unticked', () => {
    expect(page).toMatch(/const \[trialTips, setTrialTips\] = useState\(false\)/);
  });

  it('is its own checkbox, not part of the Terms consent', () => {
    expect(page).toMatch(/checked=\{trialTips\}/);
    expect(page).toMatch(/checked=\{consented\}/);
    // The Terms box gates submission; the tips box must not.
    expect(page).toMatch(/disabled=\{loading \|\| !consented\}/);
    expect(page).not.toMatch(/!trialTips/);
  });

  it('only sends the request when ticked, on the trial path, with the consent version', () => {
    expect(page).toMatch(/trialTips && selectedPlan === 'free'[\s\S]{0,80}trial_tips_opt_in: true, trial_tips_consent_version: TRIAL_TIPS_CONSENT_VERSION/);
  });
});

describe('verification callback', () => {
  const cb = read('app/auth/callback/route.ts');

  it('records signup consent after the code exchange succeeds', () => {
    expect(cb.indexOf('recordSignupConsent(')).toBeGreaterThan(cb.indexOf('exchangeCodeForSession'));
  });

  it('never lets a consent failure block sign-in', () => {
    expect(cb).toMatch(/try \{\s*await recordSignupConsent\([\s\S]*?\} catch \(consentError\)/);
  });
});

describe('public paths', () => {
  const proxy = read('proxy.ts');
  it('unsubscribe and the webhook are reachable signed out (they authenticate themselves)', () => {
    expect(proxy).toContain("'/api/trial-tips/unsubscribe'");
    expect(proxy).toContain("'/api/webhooks/resend'");
  });
  it('the preference route is NOT public', () => {
    expect(proxy).not.toContain('/api/trial-tips/preference');
    expect(proxy).not.toMatch(/'\/api\/trial-tips'[,\]]/);
  });
});

describe('scheduling: one owner, off by default', () => {
  const wf = read('.github/workflows/trial-tips.yml');

  it('the scheduled job only runs when the repository variable is set', () => {
    expect(wf).toMatch(/if: github\.event_name == 'workflow_dispatch' \|\| vars\.TRIAL_TIPS_SCHEDULE_ENABLED == 'true'/);
  });

  it('sending is a separate gate, read from configuration', () => {
    expect(wf).toContain('TRIAL_TIPS_SENDING_ENABLED: ${{ vars.TRIAL_TIPS_SENDING_ENABLED }}');
  });

  it('secrets come from secrets, not variables', () => {
    expect(wf).toContain('RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}');
    expect(wf).toContain('TRIAL_TIPS_UNSUBSCRIBE_SECRET: ${{ secrets.TRIAL_TIPS_UNSUBSCRIBE_SECRET }}');
  });

  it('the canary list is a masked secret and the audience defaults to canary', () => {
    expect(wf).toContain('TRIAL_TIPS_CANARY_RECIPIENTS: ${{ secrets.TRIAL_TIPS_CANARY_RECIPIENTS }}');
    expect(wf).toContain('TRIAL_TIPS_AUDIENCE: ${{ vars.TRIAL_TIPS_AUDIENCE }}');
  });

  it('no other workflow or app code sends trial tips', () => {
    const workflows = readdirSync(join(root, '.github/workflows')).filter(f => f !== 'trial-tips.yml');
    for (const f of workflows) expect(read(`.github/workflows/${f}`)).not.toMatch(/trial-tips/);
  });
});

describe('secrets stay server-side', () => {
  function files(dir: string): string[] {
    return readdirSync(join(root, dir)).flatMap(name => {
      const rel = `${dir}/${name}`;
      if (name === 'node_modules' || name === '__tests__') return [];
      return statSync(join(root, rel)).isDirectory() ? files(rel) : /\.(ts|tsx)$/.test(name) ? [rel] : [];
    });
  }

  it('no client component imports the Resend transport or the runner', () => {
    const client = [...files('features'), ...files('components'), ...files('app')]
      .filter(f => read(f).startsWith("'use client'"));
    for (const f of client) {
      expect({ f, hit: /trialTips\/(resendTransport|runner|webhook)/.test(read(f)) }).toEqual({ f, hit: false });
    }
  });

  it('the only importer of the transport is the scheduled script', () => {
    const importers = [...files('app'), ...files('lib'), ...files('features'), ...files('scripts'), ...files('services')]
      .filter(f => /trialTips\/resendTransport/.test(read(f)));
    expect(importers).toEqual(['scripts/run-trial-tips.ts']);
  });
});
