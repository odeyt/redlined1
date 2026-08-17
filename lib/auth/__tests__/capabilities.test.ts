/**
 * Capabilities replace a module-name allowlist with something that can express
 * a verb and a subject. The risk in that swap is silent re-permissioning, so
 * the first group of tests exists to prove nobody's access changed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CAPABILITIES, DEFAULT_CAPABILITIES, SHOP_ROLES,
  capabilitiesFor, allows, type CapabilityOverrides,
} from '../capabilities';
import { MANAGER_BLOCKED, TECHNICIAN_BLOCKED, ADVISOR_BLOCKED } from '@/lib/useShop';

/** The module each capability group corresponds to in the old allowlist. */
const CAPABILITY_MODULE: Record<string, string> = {
  'customers.read': 'customers', 'customers.manage': 'customers', 'customers.archive': 'customers',
  'vehicles.read': 'vehicles', 'vehicles.manage': 'vehicles',
  'appointments.read': 'appointments', 'appointments.manage': 'appointments',
  'repair_orders.read': 'repair-orders', 'repair_orders.manage': 'repair-orders',
  'estimates.read': 'estimates', 'estimates.manage': 'estimates',
  'invoices.read': 'invoices', 'invoices.manage': 'invoices',
  'payments.read': 'payments', 'payments.record': 'payments', 'payments.reverse': 'payments',
  'reports.read': 'reports',
  'settings.manage': 'settings', 'billing.manage': 'billing', 'members.manage': 'access',
};

describe('nobody gains access they did not already have', () => {
  const blocked: Record<string, string[]> = {
    manager: MANAGER_BLOCKED,
    technician: TECHNICIAN_BLOCKED,
    advisor: ADVISOR_BLOCKED,
  };

  it.each(['manager', 'advisor', 'technician'])(
    'grants %s nothing whose module they were blocked from',
    role => {
      // The whole risk of this milestone is a quiet re-permissioning. This
      // re-derives the answer from lib/useShop.ts rather than restating it, so
      // the two cannot drift apart unnoticed.
      for (const capability of DEFAULT_CAPABILITIES[role as 'manager']) {
        const module = CAPABILITY_MODULE[capability];
        if (!module) continue;
        expect(blocked[role]).not.toContain(module);
      }
    },
  );

  it('gives the owner every enforced capability', () => {
    const enforced = CAPABILITIES.filter(c => c.status === 'enforced').map(c => c.id);
    expect([...DEFAULT_CAPABILITIES.owner].sort()).toEqual([...enforced].sort());
  });

  it('gives nobody but the owner the financial or admin ones', () => {
    // These are exactly the modules MANAGER_BLOCKED lists, so the mapping is a
    // restatement of today's rule rather than a new decision.
    for (const capability of ['invoices.manage', 'payments.record', 'payments.reverse', 'reports.read', 'settings.manage', 'members.manage', 'billing.manage', 'audit.read']) {
      for (const role of ['manager', 'advisor', 'technician'] as const) {
        expect(DEFAULT_CAPABILITIES[role]).not.toContain(capability);
      }
      expect(DEFAULT_CAPABILITIES.owner).toContain(capability);
    }
  });

  it('keeps technicians off customer records, as the module list did', () => {
    expect(DEFAULT_CAPABILITIES.technician).not.toContain('customers.read');
    expect(TECHNICIAN_BLOCKED).toContain('customers');
  });
});

describe('the catalogue', () => {
  it('has no duplicate ids', () => {
    const ids = CAPABILITIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('separates reading from writing everywhere it matters', () => {
    for (const group of ['customers', 'vehicles', 'jobs', 'invoices', 'payments']) {
      expect(CAPABILITIES.some(c => c.id.startsWith(`${group}.`) && c.id.endsWith('.read'))).toBe(true);
    }
  });

  it('separates reversing a payment from recording one', () => {
    // Taking money is a daily task; cancelling a recorded payment rewrites the
    // books. A shop should be able to allow one without the other.
    expect(CAPABILITIES.map(c => c.id)).toEqual(expect.arrayContaining(['payments.record', 'payments.reverse']));
  });

  it('marks the HR and money capabilities as planned, not enforced', () => {
    // Same lesson as the alerts catalogue: a switch for something nothing
    // enforces looks like it works and does nothing.
    for (const id of ['payroll.read', 'salary.read_all', 'expenses.approve', 'receivables.read']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('planned');
    }
  });
});

describe('resolving what a role may do', () => {
  it('returns nothing for an unknown role', () => {
    // Loading, or a role this app does not enforce, must not fall through to
    // some default set.
    expect(capabilitiesFor(null, null)).toEqual([]);
    expect(capabilitiesFor('', null)).toEqual([]);
    expect(capabilitiesFor('superuser', null)).toEqual([]);
  });

  it('adds a granted capability', () => {
    const overrides: CapabilityOverrides = { grant: { advisor: ['invoices.read'] } };
    expect(allows(capabilitiesFor('advisor', overrides), 'invoices.read')).toBe(true);
  });

  it('removes a denied one', () => {
    const overrides: CapabilityOverrides = { deny: { manager: ['customers.archive'] } };
    expect(allows(capabilitiesFor('manager', overrides), 'customers.archive')).toBe(false);
  });

  it('lets deny beat grant', () => {
    // A shop that has explicitly taken something away should not have it
    // handed back by a grant added later for a different reason.
    const overrides: CapabilityOverrides = {
      grant: { advisor: ['invoices.manage'] },
      deny: { advisor: ['invoices.manage'] },
    };
    expect(allows(capabilitiesFor('advisor', overrides), 'invoices.manage')).toBe(false);
  });

  it('ignores an unknown id in stored settings', () => {
    // A typo must not become a permission nobody can find in the catalogue.
    const overrides: CapabilityOverrides = { grant: { advisor: ['invoices.destroy'] } };
    expect(capabilitiesFor('advisor', overrides)).not.toContain('invoices.destroy');
  });

  it('refuses to grant a planned capability even if settings say so', () => {
    // Otherwise the day something starts enforcing it, access changes silently
    // for every shop that had ticked it.
    const overrides: CapabilityOverrides = { grant: { owner: ['payroll.manage'] } };
    expect(capabilitiesFor('owner', overrides)).not.toContain('payroll.manage');
  });

  it('does not leak one role\'s override into another', () => {
    const overrides: CapabilityOverrides = { grant: { advisor: ['invoices.read'] } };
    expect(capabilitiesFor('technician', overrides)).not.toContain('invoices.read');
  });

  it('is unaffected by an empty or absent override object', () => {
    for (const role of SHOP_ROLES) {
      expect(capabilitiesFor(role, {})).toEqual(capabilitiesFor(role, null));
    }
  });
});

describe('the database agrees with the application', () => {
  const SQL = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m4_capabilities.sql'),
    'utf8',
  );

  /** The capability list the SQL function hands a given role. */
  function sqlDefaultsFor(role: string): string[] {
    const start = SQL.indexOf(`WHEN '${role}' THEN ARRAY[`);
    expect(start).toBeGreaterThan(-1);
    const body = SQL.slice(start, SQL.indexOf(']', start));
    return [...body.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map(m => m[1]);
  }

  it.each([...SHOP_ROLES])('gives %s the same capabilities in SQL as in TypeScript', role => {
    // The defaults are deliberately duplicated — a policy cannot call
    // TypeScript, and routing every policy through the app would make RLS
    // decorative. This test is the price of that duplication.
    expect(sqlDefaultsFor(role).sort()).toEqual([...DEFAULT_CAPABILITIES[role]].sort());
  });

  it('applies deny before grant, as the application does', () => {
    const denyAt = SQL.indexOf("-> 'deny'");
    const grantAt = SQL.indexOf("-> 'grant'");
    expect(denyAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(denyAt);
  });

  it('refuses a caller who is not a member of the shop', () => {
    expect(SQL).toMatch(/IF v_role IS NULL THEN\s*\n\s*RETURN FALSE/);
  });

  it('is revoked from PUBLIC before being granted', () => {
    // Postgres grants EXECUTE to PUBLIC by default.
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.has_capability\(UUID, TEXT\) FROM PUBLIC/);
  });

  it('replaces the hardcoded role list on audit_events with the capability', () => {
    expect(SQL).toMatch(/DROP POLICY IF EXISTS audit_events_select_managers/);
    expect(SQL).toMatch(/has_capability\(audit_events\.shop_id, 'audit\.read'\)/);
  });

  it('says the app can ship before or after it', () => {
    // The app reads capability_overrides inside a guard, so a missing column
    // falls back to role defaults rather than failing.
    expect(SQL).toMatch(/Safe in either order relative to the application/i);
  });
});
