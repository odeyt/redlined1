/**
 * What the Subscriptions module is called, once a shop is paying.
 *
 * "Plans & Gates" describes what the screen does to a free or trial account:
 * shows what is locked and how to unlock it. To a customer who has already
 * bought, that same entry reads as a sales page — the screen they actually want
 * there manages what they already pay for.
 *
 * The sidebar and the page header both name this screen, so both go through one
 * function. Two independent conditionals is how a nav item and the page it
 * opens end up calling the same thing different names.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { subscriptionsLabel, subscriptionsTitle } from '../mock-data';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('a paying shop sees Account', () => {
  it('renames the nav entry on a paid plan', () => {
    expect(subscriptionsLabel('pro')).toBe('Account');
  });

  it('leaves it as the plan picker on trial and free', () => {
    // Both still need the upgrade path this screen provides.
    expect(subscriptionsLabel('trial')).toBe('Plans & Gates');
    expect(subscriptionsLabel('free')).toBe('Plans & Gates');
  });

  it('an unrecognised status keeps the unpaid wording', () => {
    // Defaulting to "Account" would tell a non-paying shop it has one.
    expect(subscriptionsLabel('')).toBe('Plans & Gates');
    expect(subscriptionsLabel('something-new')).toBe('Plans & Gates');
  });

  it('the page title and subtitle follow', () => {
    const [title, subtitle] = subscriptionsTitle('pro');
    expect(title).toBe('Account');
    expect(subtitle).not.toMatch(/upgrade/i);
  });

  it('the unpaid title still explains the upgrade path', () => {
    const [title, subtitle] = subscriptionsTitle('free');
    expect(title).toBe('Subscriptions and Feature Gates');
    expect(subtitle).toMatch(/upgrade path/);
  });
});

describe('the nav and the page cannot disagree', () => {
  it('the sidebar uses the shared function', () => {
    const sidebar = read('components/Sidebar.tsx');
    expect(sidebar).toMatch(/subscriptionsLabel\(planStatus\)/);
    expect(sidebar).toMatch(/id === 'subscriptions' \? subscriptionsLabel/);
  });

  it('the header uses the shared function', () => {
    const header = read('components/Header.tsx');
    expect(header).toMatch(/activeModule === 'subscriptions'\s*\n?\s*\? subscriptionsTitle\(planStatus\)/);
  });

  it('neither hardcodes the paid wording separately', () => {
    const sidebar = read('components/Sidebar.tsx');
    const header  = read('components/Header.tsx');
    expect(sidebar).not.toMatch(/'Account'/);
    expect(header).not.toMatch(/'Account'/);
  });

  it('the tooltip follows the renamed label, not the raw one', () => {
    // The collapsed sidebar shows only this tooltip, so a stale one would be
    // the only name a paying customer ever sees.
    const sidebar = read('components/Sidebar.tsx');
    expect(sidebar).toMatch(/const tipLabel = locked \? `\$\{label\} — Upgrade to unlock` : label;/);
    expect(sidebar).toMatch(/const label = id === 'subscriptions'/);
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
