/**
 * The back-office widgets, and who they are offered to.
 *
 * The risk with a widget catalogue is not that a widget crashes — it is that
 * one is offered to somebody whose permissions cannot load its data. They add
 * it, it shows an error, and the dashboard looks broken rather than the
 * permission looking deliberate.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { WIDGET_REGISTRY, getWidgetsForRole } from '../registry';
import { DEFAULT_CAPABILITIES } from '@/lib/auth/capabilities';

const CATALOG = join(__dirname, '..', '..', '..', 'features/dashboard/widgets/catalog');
const BACK_OFFICE = ['money-owed', 'spending', 'who-is-in', 'till'];

describe('the back-office widgets exist', () => {
  it.each(BACK_OFFICE)('%s is registered', id => {
    expect(WIDGET_REGISTRY[id]).toBeDefined();
    expect(WIDGET_REGISTRY[id].component).toBeDefined();
  });

  it('gives each one a minimum size it can actually render in', () => {
    for (const id of BACK_OFFICE) {
      const w = WIDGET_REGISTRY[id];
      expect(w.minSize.w).toBeGreaterThanOrEqual(3);
      expect(w.minSize.h).toBeGreaterThanOrEqual(2);
      expect(w.defaultSize.w).toBeGreaterThanOrEqual(w.minSize.w);
      expect(w.defaultSize.h).toBeGreaterThanOrEqual(w.minSize.h);
    }
  });
});

describe('nobody is offered a widget their permissions cannot fill', () => {
  it('keeps Money Owed to the owner', () => {
    // It reads invoices and payments. A manager has neither capability, so
    // offering it to them would produce an error where a number should be.
    expect(WIDGET_REGISTRY['money-owed'].allowedRoles).toEqual(['owner']);
    expect(DEFAULT_CAPABILITIES.manager).not.toContain('invoices.read');
    expect(DEFAULT_CAPABILITIES.manager).not.toContain('payments.read');
  });

  it('offers Spending to the manager, who can read expenses', () => {
    expect(WIDGET_REGISTRY['spending'].allowedRoles).toContain('manager');
    expect(DEFAULT_CAPABILITIES.manager).toContain('expenses.read');
  });

  it('offers Who Is In to the manager, who runs attendance', () => {
    expect(WIDGET_REGISTRY['who-is-in'].allowedRoles).toContain('manager');
    expect(DEFAULT_CAPABILITIES.manager).toContain('attendance.read');
  });

  it('offers The Till to the manager, who closes the day', () => {
    expect(WIDGET_REGISTRY['till'].allowedRoles).toContain('manager');
    expect(DEFAULT_CAPABILITIES.manager).toContain('reconciliation.manage');
  });

  it('offers none of them to a technician', () => {
    const ids = getWidgetsForRole('technician', new Set()).map(w => w.id);
    for (const id of BACK_OFFICE) expect(ids).not.toContain(id);
  });
});

describe('a widget that cannot load must not take the dashboard with it', () => {
  // Every one of these fetches from a table that may not exist yet in a given
  // deployment, or that the caller may not be allowed to read. An unhandled
  // rejection in one widget blanks the whole grid.
  it.each([
    'MoneyOwedWidget.tsx', 'SpendingWidget.tsx', 'WhoIsInWidget.tsx', 'TillWidget.tsx',
  ])('%s catches its own load failure', file => {
    const source = readFileSync(join(CATALOG, file), 'utf8');
    expect(source).toMatch(/\.catch\(/);
    expect(source).toMatch(/setFailed\(true\)/);
  });

  it('renders nothing rather than a spinner while loading', () => {
    // A grid of spinners is worse than a grid that fills in. Each returns null
    // until it has data.
    for (const file of ['MoneyOwedWidget.tsx', 'SpendingWidget.tsx', 'WhoIsInWidget.tsx', 'TillWidget.tsx']) {
      expect(readFileSync(join(CATALOG, file), 'utf8')).toMatch(/return null/);
    }
  });
});

describe('the catalogue and the files agree', () => {
  it('every registered component has a file', () => {
    const files = new Set(readdirSync(CATALOG));
    for (const id of BACK_OFFICE) {
      const name = WIDGET_REGISTRY[id].component.name;
      expect(files.has(name + '.tsx')).toBe(true);
    }
  });
});
