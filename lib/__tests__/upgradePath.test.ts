/**
 * Where the in-app "Upgrade" affordances lead.
 *
 * The sidebar's Free Plan banner linked to /signup, so a signed-in customer who
 * wanted to pay was shown a create-an-account form. The plan picker they needed
 * (SubscriptionsView, which calls /api/billing/checkout) already existed — the
 * banner simply never pointed at it. The Billing page's own "Upgrade Plan"
 * button was worse: an alert() placeholder saying the feature was unconfigured.
 *
 * Both shipped to production. Neither is a type error and neither throws, so
 * nothing but a human clicking the button would catch it — which is why this
 * asserts on the source.
 *
 * Anything rendered inside the app shell is behind authentication by
 * definition, so /signup is never the right destination from there.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('in-app upgrade affordances', () => {
  const sidebar = read('components/Sidebar.tsx');
  const billing = read('features/billing/BillingDashboard.tsx');

  it('the sidebar never sends a signed-in user to the signup page', () => {
    expect(sidebar).not.toMatch(/href=["']\/signup["']/);
  });

  it('the sidebar Upgrade control opens the plan picker', () => {
    expect(sidebar).toMatch(/module:\s*['"]subscriptions['"]/);
  });

  it('the Billing page Upgrade button does something real', () => {
    expect(billing).not.toMatch(/alert\(\s*['"]Upgrade flow/);
    expect(billing).toMatch(/module:\s*['"]subscriptions['"]/);
  });

  it('the plan picker still reaches checkout — the thing all of this exists for', () => {
    expect(read('features/subscriptions/SubscriptionsView.tsx'))
      .toMatch(/\/api\/billing\/checkout/);
  });
});
