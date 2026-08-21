/**
 * A manager at D1 Imports signed off RO-00003 and got a red banner:
 *
 *   "RO-00003 is signed off and Complete, but the draft invoice could not be
 *    created: you do not have permission to raise invoices."
 *
 * The sign-off worked. Nothing was wrong except what the screen offered and
 * what it then said about it.
 *
 * Three separate faults, all visible in that one screenshot:
 *
 *   1. Sign-off tried to raise a draft invoice regardless of permission, so a
 *      manager saw a failure for an action they never asked to take.
 *   2. The Create Invoice / Create Estimate / "raise invoice" buttons were
 *      gated on `!isTech`, so every non-technician saw them.
 *   3. The owner had removed the Invoices and Estimates MODULES from managers
 *      in Role Permissions — and capabilities never hear about that, because
 *      role_permissions and capabilities are deliberately separate systems.
 *      `estimates.manage` is granted to managers by default, so a
 *      capability-only check would still have shown Create Estimate.
 */
import { capabilitiesFor } from '../capabilities';

describe('what a manager may actually do', () => {
  it('has no invoice capability at all by default', () => {
    const caps = capabilitiesFor('manager', null);
    // Not a withheld grant — there is no invoice entry in the manager defaults.
    // This is why the server refused, correctly.
    expect(caps).not.toContain('invoices.manage');
    expect(caps).not.toContain('invoices.read');
  });

  it('DOES hold estimates.manage by default', () => {
    // The half that makes the module check necessary. A capability-only gate
    // would have kept offering Create Estimate to this manager.
    expect(capabilitiesFor('manager', null)).toContain('estimates.manage');
  });

  it('keeps the owner able to invoice', () => {
    expect(capabilitiesFor('owner', null)).toContain('invoices.manage');
    expect(capabilitiesFor('owner', null)).toContain('estimates.manage');
  });

  it('lets a shop grant invoicing to managers explicitly', () => {
    // The escape hatch: a shop that wants this can say so, and it is recorded
    // where the resolver reads it rather than in the module allowlist.
    const caps = capabilitiesFor('manager', { grant: { manager: ['invoices.manage'] } });
    expect(caps).toContain('invoices.manage');
  });

  it('lets a shop withhold estimates from managers explicitly', () => {
    const caps = capabilitiesFor('manager', { deny: { manager: ['estimates.manage'] } });
    expect(caps).not.toContain('estimates.manage');
  });
});

describe('the Repair Orders screen asks both questions', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const VIEW = fs.readFileSync(
    path.join(process.cwd(), 'features', 'repair-orders', 'RepairOrdersView.tsx'), 'utf8');

  it('gates the invoice buttons on capability AND module access', () => {
    expect(VIEW).toContain("can('invoices.manage') && canUseModule('invoices')");
  });

  it('gates the estimate button on capability AND module access', () => {
    expect(VIEW).toContain("can('estimates.manage') && canUseModule('estimates')");
  });

  it('no longer gates invoicing on role alone', () => {
    // `!isTech` on an invoice control is the original bug. It reads as a
    // permission check and is not one.
    expect(VIEW).not.toMatch(/\{!isTech && selected\.status !== 'Closed'/);
    expect(VIEW).not.toMatch(/\{!isTech && \(selected\.status === 'Complete'/);
  });

  it('does not attempt the draft invoice without the permission', () => {
    expect(VIEW).toContain('if (!invNumber && (canInvoice || capsLoading))');
  });

  it('reports a withheld invoice as information, not as an error', () => {
    // setError paints the red banner. A sign-off that worked must not use it.
    expect(VIEW).toContain('Invoicing is not enabled for your role');
    const branch = VIEW.slice(VIEW.indexOf('} else if (!invNumber && !canInvoice) {'));
    expect(branch.slice(0, 600)).not.toContain('setError');
  });
});

describe('unresolved permissions defer to the server', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const HOOK = fs.readFileSync(
    path.join(process.cwd(), 'lib', 'auth', 'useCapabilities.ts'), 'utf8');

  it('treats a failed capability read as permitted, not denied', () => {
    // Hiding controls on a network blip is the billing-lockout mistake in a
    // smaller costume: a real permission holder locked out by an infra hiccup.
    expect(HOOK).toContain('capabilities === null ? true');
  });

  it('treats unconfigured module permissions as permitted', () => {
    expect(HOOK).toContain('if (allowedModules === null) return true;');
  });

  it('never filters the owner', () => {
    expect(HOOK).toContain("if (role === 'owner') return true;");
  });
});
