/**
 * Customisable dashboard shortcuts.
 *
 * The six defaults are per role, but which six matter is a judgement the
 * person holding the phone makes, not one we can make for every shop. These
 * cover the storage and validation; the interaction lives in the component.
 *
 * Stored per device on purpose — a technician's phone and the front-desk
 * computer want different shortcuts, and it needs no migration. The rules
 * below exist because a saved preference must never become a trap: a
 * shortcut to a module the user has since lost access to would bounce them
 * straight back to the dashboard.
 */
import {
  MAX_QUICK_ACTIONS, DEFAULT_QUICK_ACTIONS, availableModules,
  loadQuickActions, saveQuickActions, resetQuickActions, reorder,
} from '../quickActions';
import { getBlockedModules } from '../useShop';

// The suite runs in Node and jest-environment-jsdom is not installed. A
// dependency for one storage stub is not worth it — this is the whole surface
// the module touches, and keeping it explicit makes that dependency obvious.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  },
};

beforeEach(() => store.clear());

describe('defaults', () => {
  it.each(['owner', 'manager', 'advisor', 'technician'])(
    'the %s default contains nothing that role is blocked from', role => {
      const blocked = new Set(getBlockedModules(role));
      expect(DEFAULT_QUICK_ACTIONS[role].filter(id => blocked.has(id))).toEqual([]);
    });

  it('offers nothing at all for an unrecognised role', () => {
    // getBlockedModules blocks everything for an unknown or still-loading
    // role, so the safe result is an empty row rather than a guessed one.
    // The component renders nothing until the role is known, so this is never
    // seen — but the rule belongs here, where the filtering happens.
    expect(loadQuickActions('')).toEqual([]);
  });

  it('never returns more than the slot count', () => {
    for (const role of Object.keys(DEFAULT_QUICK_ACTIONS)) {
      expect(loadQuickActions(role).length).toBeLessThanOrEqual(MAX_QUICK_ACTIONS);
    }
  });
});

describe('saving and loading', () => {
  it('round-trips a custom layout', () => {
    saveQuickActions('manager', ['inspections', 'parts']);
    expect(loadQuickActions('manager')).toEqual(['inspections', 'parts']);
  });

  it('keeps layouts separate per role', () => {
    // A shared shop tablet must not hand one person the other's shortcuts.
    saveQuickActions('manager', ['parts']);
    expect(loadQuickActions('technician')).not.toEqual(['parts']);
  });

  it('caps what it stores at the slot count', () => {
    saveQuickActions('owner', ['job-cards', 'invoices', 'estimates', 'customers', 'reports', 'vehicles', 'parts']);
    expect(loadQuickActions('owner')).toHaveLength(MAX_QUICK_ACTIONS);
  });

  it('reset returns the role default', () => {
    saveQuickActions('technician', ['parts']);
    resetQuickActions('technician');
    expect(loadQuickActions('technician')).toEqual(
      DEFAULT_QUICK_ACTIONS.technician.slice(0, MAX_QUICK_ACTIONS),
    );
  });
});

describe('a saved layout can never become a trap', () => {
  it('drops shortcuts the role may no longer open', () => {
    // Permissions change. A technician holding a saved shortcut to invoices
    // would otherwise tap it and be bounced back here.
    saveQuickActions('technician', ['job-cards', 'invoices']);
    expect(loadQuickActions('technician')).toEqual(['job-cards']);
  });

  it('falls back when filtering empties the layout entirely', () => {
    // Otherwise the strip renders blank with no way to fix it.
    saveQuickActions('technician', ['invoices', 'payments']);
    expect(loadQuickActions('technician').length).toBeGreaterThan(0);
  });

  it('drops duplicates', () => {
    saveQuickActions('manager', ['parts', 'parts', 'inspections']);
    expect(loadQuickActions('manager')).toEqual(['parts', 'inspections']);
  });

  it('survives corrupt storage rather than throwing', () => {
    (globalThis as any).window.localStorage.setItem('rd1_quick_actions_manager', 'not json');
    expect(() => loadQuickActions('manager')).not.toThrow();
    expect(loadQuickActions('manager').length).toBeGreaterThan(0);
  });

  it('ignores a stored value that is not a list', () => {
    (globalThis as any).window.localStorage.setItem('rd1_quick_actions_manager', '{"job-cards":true}');
    expect(loadQuickActions('manager').length).toBeGreaterThan(0);
  });

  it('ignores non-string entries', () => {
    (globalThis as any).window.localStorage.setItem('rd1_quick_actions_manager', '[42, "parts", null]');
    expect(loadQuickActions('manager')).toEqual(['parts']);
  });
});

describe('availableModules', () => {
  it('offers nothing the role is blocked from', () => {
    const blocked = new Set(getBlockedModules('technician'));
    expect(availableModules('technician').filter(([id]) => blocked.has(id))).toEqual([]);
  });

  it('does not offer the dashboard itself', () => {
    expect(availableModules('owner').map(([id]) => id)).not.toContain('dashboard');
  });
});

describe('reorder', () => {
  it('moves an item forward', () => {
    expect(reorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item backward', () => {
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op for the same position', () => {
    const input = ['a', 'b', 'c'];
    expect(reorder(input, 1, 1)).toBe(input);
  });

  it('ignores out-of-range indexes rather than corrupting the row', () => {
    const input = ['a', 'b'];
    expect(reorder(input, 0, 5)).toBe(input);
    expect(reorder(input, -1, 1)).toBe(input);
  });

  it('does not mutate its input', () => {
    const input = ['a', 'b', 'c'];
    reorder(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
