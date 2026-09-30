/**
 * Launch gates: nothing sends unless everything is configured, and the
 * TypeScript rules match the SQL that enforces them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  readTrialTipsConfig, STEP_START_DAYS, TRIAL_DAYS, TRIAL_TIP_STEPS,
  TRIAL_TIPS_CONSENT_VERSION, KNOWN_CONSENT_VERSIONS, TRIAL_TIPS_REPLY_TO,
} from '../config';
import { PLANS } from '@/config/plans';

const FULL = {
  TRIAL_TIPS_SENDING_ENABLED: 'true',
  TRIAL_TIPS_FROM_ADDRESS: 'tips@redlined1.com',
  TRIAL_TIPS_POSTAL_ADDRESS: 'PO Box 123, Example City, ST 00000',
  TRIAL_TIPS_UNSUBSCRIBE_SECRET: 'x'.repeat(40),
  NEXT_PUBLIC_SITE_URL: 'https://redlined1.com',
  RESEND_API_KEY: 're_test_key',
};

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/2026-09-30_trial_tips_email.sql'), 'utf8');

describe('readTrialTipsConfig', () => {
  it('is live only when every gate passes', () => {
    const c = readTrialTipsConfig(FULL);
    expect(c.live).toBe(true);
    expect(c.blockers).toEqual([]);
  });

  it('is OFF by default — an empty environment sends nothing', () => {
    const c = readTrialTipsConfig({});
    expect(c.live).toBe(false);
    expect(c.blockers.length).toBeGreaterThanOrEqual(6);
  });

  it.each([
    ['TRIAL_TIPS_SENDING_ENABLED', 'false'],
    ['TRIAL_TIPS_SENDING_ENABLED', 'TRUE'],
    ['TRIAL_TIPS_POSTAL_ADDRESS', ''],
    ['TRIAL_TIPS_POSTAL_ADDRESS', '   '],
    ['TRIAL_TIPS_FROM_ADDRESS', ''],
    ['TRIAL_TIPS_FROM_ADDRESS', 'onboarding@resend.dev'],
    ['TRIAL_TIPS_FROM_ADDRESS', 'tips@example.com'],
    ['TRIAL_TIPS_FROM_ADDRESS', 'tips@redlined1.com.evil.test'],
    ['TRIAL_TIPS_UNSUBSCRIBE_SECRET', 'too-short'],
    ['NEXT_PUBLIC_SITE_URL', 'http://redlined1.com'],
    ['NEXT_PUBLIC_SITE_URL', 'not a url'],
    ['RESEND_API_KEY', ''],
  ])('%s = %j blocks live sending', (key, value) => {
    const c = readTrialTipsConfig({ ...FULL, [key]: value });
    expect(c.live).toBe(false);
    expect(c.blockers.length).toBe(1);
  });

  it('never falls back to the sandbox sender, even with MAIL_FROM_ADDRESS unset', () => {
    const c = readTrialTipsConfig({ ...FULL, TRIAL_TIPS_FROM_ADDRESS: undefined, MAIL_FROM_ADDRESS: '' });
    expect(c.fromAddress).toBeNull();
    expect(c.live).toBe(false);
  });

  it('names the missing postal address as the blocker', () => {
    const c = readTrialTipsConfig({ ...FULL, TRIAL_TIPS_POSTAL_ADDRESS: undefined });
    expect(c.blockers[0]).toMatch(/POSTAL_ADDRESS/);
  });

  it('replies go to admin@redlined1.com', () => {
    expect(TRIAL_TIPS_REPLY_TO).toBe('admin@redlined1.com');
  });
});

describe('the SQL enforces the same rules', () => {
  it('the trial length matches', () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(SQL).toContain(`v_ends - INTERVAL '${TRIAL_DAYS} days'`);
  });

  it('the step windows match: First Job 0, Setup Help 2, Status Board 4, Feedback 6', () => {
    expect(STEP_START_DAYS).toEqual({ first_job: 0, setup_help: 2, status_board: 4, feedback: 6 });
    expect(SQL).toContain(`WHEN v_elapsed < INTERVAL '${STEP_START_DAYS.setup_help} days' THEN 'first_job'`);
    expect(SQL).toContain(`WHEN v_elapsed < INTERVAL '${STEP_START_DAYS.status_board} days' THEN 'setup_help'`);
    expect(SQL).toContain(`WHEN v_elapsed < INTERVAL '${STEP_START_DAYS.feedback} days' THEN 'status_board'`);
    for (const step of TRIAL_TIP_STEPS) expect(SQL).toContain(`'${step}'`);
  });

  it('every paid plan in the registry stops the emails', () => {
    const paid = /v_plan IN \(([^)]+)\)/.exec(SQL)![1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    expect(paid).toEqual([...Object.keys(PLANS), 'pro'].sort());
  });

  it('the consent version in use is one the server accepts', () => {
    expect(KNOWN_CONSENT_VERSIONS.has(TRIAL_TIPS_CONSENT_VERSION)).toBe(true);
  });
});
