/**
 * Capabilities replace a module-name allowlist with something that can express
 * a verb and a subject. The risk in that swap is silent re-permissioning, so
 * the first group of tests exists to prove nobody's access changed.
 */
import { readFileSync, readdirSync } from 'fs';
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

  it('marks the capabilities nothing enforces yet as planned', () => {
    // Same lesson as the alerts catalogue: a switch for something nothing
    // enforces looks like it works and does nothing.
    //
    // salary.read_all left this list in M7, when RLS policies and a domain
    // layer began enforcing it. Moving an id out of here is deliberate and
    // belongs in the same commit as the thing that enforces it — never on its
    // own to make a test pass.
    // payroll.read and payroll.manage left this list in M8, when policies and
    // a domain layer began enforcing them.
    for (const id of ['expenses.approve', 'expenses.read', 'receivables.read',
                      'reconciliation.manage', 'api_keys.manage']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('planned');
    }
  });

  it('enforces every capability the pay screens rely on', () => {
    // The other half of the same guard: something that IS enforced must not
    // sit in the catalogue marked planned, because capabilitiesFor() refuses
    // to grant a planned id and the screen would silently do nothing.
    for (const id of ['salary.read_own', 'salary.read_all', 'salary.manage',
                      'salary_advances.request', 'salary_advances.approve']) {
      expect(CAPABILITIES.find(c => c.id === id)?.status).toBe('enforced');
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
    // The example has to be a capability that is still planned. It was
    // payroll.manage until M8 started enforcing it — at which point this test
    // was asserting that an enforced capability could not be granted, which is
    // not what it is for.
    const stillPlanned = CAPABILITIES.find(c => c.status === 'planned');
    expect(stillPlanned).toBeDefined();
    const overrides: CapabilityOverrides = { grant: { owner: [stillPlanned!.id] } };
    expect(capabilitiesFor('owner', overrides)).not.toContain(stillPlanned!.id);
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
  /**
   * The LATEST migration that redefines has_capability, not a fixed filename.
   *
   * A later milestone that adds a capability has to redefine the function, and
   * pinning this to the file that first created it would quietly start
   * comparing against a superseded definition — a guard that passes while the
   * thing it guards has moved on.
   */
  const SQL = (() => {
    const dir = join(__dirname, '..', '..', '..', 'supabase/migrations');
    const definers = readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .filter(f => readFileSync(join(dir, f), 'utf8')
        .includes('CREATE OR REPLACE FUNCTION public.has_capability'))
      .sort();
    expect(definers.length).toBeGreaterThan(0);
    return readFileSync(join(dir, definers[definers.length - 1]), 'utf8');
  })();

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

  it('was revoked from PUBLIC before being granted', () => {
    // Postgres grants EXECUTE to PUBLIC by default. This lives in the
    // migration that CREATED the function; later ones redefine the body only,
    // and a redefinition does not reset grants.
    const m4 = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m4_capabilities.sql'),
      'utf8',
    );
    expect(m4).toMatch(/REVOKE ALL ON FUNCTION public\.has_capability\(UUID, TEXT\) FROM PUBLIC/);
  });

  it('replaced the hardcoded role list on audit_events with the capability', () => {
    const m4 = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m4_capabilities.sql'),
      'utf8',
    );
    expect(m4).toMatch(/DROP POLICY IF EXISTS audit_events_select_managers/);
    expect(m4).toMatch(/has_capability\(audit_events\.shop_id, 'audit\.read'\)/);
  });

  it('could ship before or after the app that introduced it', () => {
    // M4 specifically: the app reads capability_overrides inside a guard, so a
    // missing column falls back to role defaults rather than failing. Later
    // migrations state their own ordering, which is not always this one — M5
    // adds a table the app reads, so it must run first.
    const m4 = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m4_capabilities.sql'),
      'utf8',
    );
    expect(m4).toMatch(/Safe in either order relative to the application/i);
  });
});
