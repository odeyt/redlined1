/**
 * What the Billing module is called, once a shop is paying.
 *
 * "Billing & Subscription" reads as something still to be arranged. Once a
 * shop is subscribed the screen manages what they already have — plan, payment
 * method, invoices — so it is their account.
 *
 * The sidebar and the page header both name this screen, so both go through
 * one function. Two independent conditionals is how a nav item and the page it
 * opens end up calling the same thing different names.
 *
 * Billing had no moduleTitles entry at all, so its page header fell through to
 * the "Dashboard" default. Routing it through billingTitle() fixes that in
 * both states, not only the paid one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { billingLabel, billingTitle } from '../mock-data';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('a paying shop sees Account', () => {
  it('renames the nav entry on a paid plan', () => {
    expect(billingLabel('pro')).toBe('Account');
  });

  it('leaves it as billing on trial and free', () => {
    // Both still have a purchase ahead of them.
    expect(billingLabel('trial')).toBe('Billing & Subscription');
    expect(billingLabel('free')).toBe('Billing & Subscription');
  });

  it('an unrecognised status keeps the unpaid wording', () => {
    // Defaulting to "Account" would tell a non-paying shop it has one.
    expect(billingLabel('')).toBe('Billing & Subscription');
    expect(billingLabel('something-new')).toBe('Billing & Subscription');
  });

  it('the page title and subtitle follow', () => {
    const [title, subtitle] = billingTitle('pro');
    expect(title).toBe('Account');
    expect(subtitle).toMatch(/payment method/);
    expect(subtitle).not.toMatch(/choose a plan/i);
  });

  it('the unpaid title still describes choosing a plan', () => {
    const [title, subtitle] = billingTitle('free');
    expect(title).toBe('Billing & Subscription');
    expect(subtitle).toMatch(/Choose a plan/);
  });
});

describe('the billing page no longer says "Dashboard"', () => {
  it('billing has no moduleTitles entry to fall back on', () => {
    // The reason the header defaulted. If one is added later this test fails,
    // which is the moment to decide which source wins.
    const data = read('lib/mock-data.ts');
    const titles = data.slice(data.indexOf('export const moduleTitles'));
    expect(titles).not.toMatch(/^\s*billing:/m);
  });

  it('so the header resolves it explicitly', () => {
    const header = read('components/Header.tsx');
    expect(header).toMatch(/activeModule === 'billing'\s*\n?\s*\? billingTitle\(planStatus\)/);
  });

  it('and both states have a real title', () => {
    expect(billingTitle('pro')[0]).not.toBe('Dashboard');
    expect(billingTitle('free')[0]).not.toBe('Dashboard');
  });
});

describe('the nav and the page cannot disagree', () => {
  it('the sidebar uses the shared function', () => {
    const sidebar = read('components/Sidebar.tsx');
    expect(sidebar).toMatch(/id === 'billing' \? billingLabel\(planStatus\) : rawLabel/);
  });

  it('neither hardcodes the paid wording separately', () => {
    expect(read('components/Sidebar.tsx')).not.toMatch(/'Account'/);
    expect(read('components/Header.tsx')).not.toMatch(/'Account'/);
  });

  it('the tooltip follows the renamed label, not the raw one', () => {
    // The collapsed sidebar shows only this tooltip, so a stale one would be
    // the only name a paying customer ever sees.
    const sidebar = read('components/Sidebar.tsx');
    expect(sidebar).toMatch(/const tipLabel = locked \? `\$\{label\} — Upgrade to unlock` : label;/);
    expect(sidebar).toMatch(/const label = id === 'billing'/);
  });
});

describe('the Subscriptions module is left alone', () => {
  it('keeps its own name in both states', () => {
    // It is the plan-and-gates screen, not the account screen; renaming both
    // would have left a paying shop with two entries called Account.
    const data = read('lib/mock-data.ts');
    expect(data).toMatch(/'subscriptions', 'shield',     'Plans & Gates'/);
    expect(data).not.toMatch(/subscriptionsLabel/);
  });
});

describe('the upgrade prompts were already correct', () => {
  // Checked while confirming the report; recorded so a future change to these
  // banners has to keep the property rather than rediscover it.
  const sidebar = read('components/Sidebar.tsx');

  it('the trial banner shows only during a trial', () => {
    expect(sidebar).toMatch(/planStatus === 'trial' && daysLeft !== null &&/);
  });

  it('the free banner shows only on the free plan', () => {
    expect(sidebar).toMatch(/planStatus === 'free' &&/);
  });
});
