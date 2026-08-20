/**
 * What a role may DO, as opposed to what it may SEE.
 *
 * Today authorization is `shop_settings.role_permissions`: a per-shop allowlist
 * of module NAMES, evaluated in the browser by `getBlockedModules`. That is a
 * navigation filter. It can say "managers do not see the Payments screen"; it
 * cannot say "a technician may read their own salary but not anyone else's",
 * because a module name has no notion of a row, a verb, or a subject.
 *
 * The moment an employees table has a pay rate on it, that distinction stops
 * being academic. This module is the seam that makes it expressible, and it is
 * deliberately introduced BEFORE any HR data exists rather than after.
 *
 * ## What this milestone does and does not change
 *
 * It does NOT change what anybody can see or do. The default grants below were
 * derived mechanically from the existing blocked-module lists in
 * `lib/useShop.ts`, and a test asserts they still agree — so this ships as a
 * new vocabulary for the same access, not a re-permissioning of the app.
 *
 * Module visibility remains `role_permissions` / `getBlockedModules`, untouched.
 * Capabilities govern ACTIONS. Unifying the two is a later milestone; doing
 * both at once would mean changing what people see and what they may do in the
 * same release, with no way to tell which broke.
 */

export type ShopRole = 'owner' | 'manager' | 'advisor' | 'technician';

export const SHOP_ROLES: readonly ShopRole[] = ['owner', 'manager', 'advisor', 'technician'];

/**
 * Whether anything actually checks this capability yet.
 *
 * Same reasoning as the alerts catalogue, which learned it the hard way: a
 * switch for something nothing enforces looks like it works and does nothing,
 * which is worse than an absent feature. `planned` capabilities are declared
 * so the vocabulary is stable and the HR milestones have something to target —
 * but they grant nothing, because nothing reads them.
 */
export type CapabilityStatus = 'enforced' | 'planned';

export interface Capability {
  id: string;
  /** Written from the actor's side: what the person may do. */
  label: string;
  /** The module this belongs to, for grouping in settings. */
  group: string;
  status: CapabilityStatus;
}

/**
 * READ is separated from WRITE everywhere, and money-moving verbs are separated
 * from ordinary writes. `payments.record` and `payments.reverse` are distinct
 * because reversing is the one that rewrites history — a shop may reasonably
 * let an advisor take a payment but not cancel one.
 */
export const CAPABILITIES: readonly Capability[] = [
  { id: 'customers.read',      label: 'See customers',                group: 'Customers',    status: 'enforced' },
  { id: 'customers.manage',    label: 'Add and edit customers',       group: 'Customers',    status: 'enforced' },
  { id: 'customers.archive',   label: 'Archive customers',            group: 'Customers',    status: 'enforced' },
  { id: 'vehicles.read',       label: 'See vehicles',                 group: 'Vehicles',     status: 'enforced' },
  { id: 'vehicles.manage',     label: 'Add and edit vehicles',        group: 'Vehicles',     status: 'enforced' },
  { id: 'jobs.read',           label: 'See job cards',                group: 'Jobs',         status: 'enforced' },
  { id: 'jobs.manage',         label: 'Create and edit job cards',    group: 'Jobs',         status: 'enforced' },
  { id: 'repair_orders.read',  label: 'See repair orders',            group: 'Repair orders',status: 'enforced' },
  { id: 'repair_orders.manage',label: 'Create and edit repair orders',group: 'Repair orders',status: 'enforced' },
  { id: 'inspections.read',    label: 'See inspections',              group: 'Inspections',  status: 'enforced' },
  { id: 'inspections.manage',  label: 'Carry out inspections',        group: 'Inspections',  status: 'enforced' },
  { id: 'estimates.read',      label: 'See estimates',                group: 'Estimates',    status: 'enforced' },
  { id: 'estimates.manage',    label: 'Create and edit estimates',    group: 'Estimates',    status: 'enforced' },
  { id: 'parts.read',          label: 'See parts',                    group: 'Parts',        status: 'enforced' },
  { id: 'parts.manage',        label: 'Edit parts and orders',        group: 'Parts',        status: 'enforced' },
  { id: 'appointments.read',   label: 'See the schedule',             group: 'Scheduling',   status: 'enforced' },
  { id: 'appointments.manage', label: 'Book and change appointments', group: 'Scheduling',   status: 'enforced' },

  { id: 'invoices.read',       label: 'See invoices',                 group: 'Invoicing',    status: 'enforced' },
  { id: 'invoices.manage',     label: 'Raise and edit invoices',      group: 'Invoicing',    status: 'enforced' },
  { id: 'payments.read',       label: 'See payments',                 group: 'Payments',     status: 'enforced' },
  { id: 'payments.record',     label: 'Record a payment',             group: 'Payments',     status: 'enforced' },
  { id: 'payments.reverse',    label: 'Reverse or correct a payment', group: 'Payments',     status: 'enforced' },

  { id: 'reports.read',        label: 'See reports',                  group: 'Reporting',    status: 'enforced' },
  { id: 'audit.read',          label: 'See the audit trail',          group: 'Administration', status: 'enforced' },
  { id: 'members.manage',      label: 'Invite and manage staff logins', group: 'Administration', status: 'enforced' },
  { id: 'settings.manage',     label: 'Change shop settings',         group: 'Administration', status: 'enforced' },
  { id: 'billing.manage',      label: 'Manage the subscription',      group: 'Administration', status: 'enforced' },

  // Declared, not enforced. The HR milestones target these; nothing reads them
  // yet, and the settings screen must label them as such.
  { id: 'employees.read',         label: 'See employee records',        group: 'People',   status: 'enforced' },
  { id: 'employees.manage',       label: 'Add and edit employees',      group: 'People',   status: 'enforced' },
  { id: 'attendance.read',        label: 'See attendance',              group: 'People',   status: 'enforced' },
  { id: 'attendance.manage',      label: 'Record and correct attendance', group: 'People', status: 'enforced' },
  { id: 'leave.read',             label: 'See leave requests',          group: 'People',   status: 'enforced' },
  // Requesting is separate from approving on purpose: everyone needs the
  // first, and nobody should get the second by being given the first.
  { id: 'leave.request',          label: 'Request leave',               group: 'People',   status: 'enforced' },
  { id: 'leave.approve',          label: 'Approve or reject leave',     group: 'People',   status: 'enforced' },
  { id: 'salary.read_own',        label: 'See their own pay',           group: 'Pay',      status: 'enforced' },
  { id: 'salary.read_all',        label: "See everyone's pay",          group: 'Pay',      status: 'enforced' },
  { id: 'salary.manage',          label: 'Set pay rates',               group: 'Pay',      status: 'enforced' },
  { id: 'salary_advances.request',label: 'Request an advance',          group: 'Pay',      status: 'enforced' },
  { id: 'salary_advances.approve',label: 'Approve an advance',          group: 'Pay',      status: 'enforced' },
  // Owner only, both of them. A payroll run holds everyone's pay, so a
  // manager who can read one has been handed salary.read_all by another route.
  { id: 'payroll.read',           label: 'See payroll runs',            group: 'Pay',      status: 'enforced' },
  { id: 'payroll.manage',         label: 'Run payroll',                 group: 'Pay',      status: 'enforced' },
  { id: 'expenses.read',          label: 'See expenses',                group: 'Money',    status: 'enforced' },
  // Everyone can submit: a technician who bought fuel out of pocket has to
  // be able to say so. Approving is the owner's, because it is the moment a
  // cost is accepted and somebody gets paid back.
  { id: 'expenses.create',        label: 'Submit an expense',           group: 'Money',    status: 'enforced' },
  { id: 'expenses.approve',       label: 'Approve an expense',          group: 'Money',    status: 'enforced' },
  { id: 'receivables.read',       label: 'See what customers owe',      group: 'Money',    status: 'planned' },
  { id: 'reconciliation.manage',  label: 'Close the day',               group: 'Money',    status: 'planned' },
  { id: 'api_keys.manage',        label: 'Manage API keys',             group: 'Integrations', status: 'planned' },
  { id: 'integrations.manage',    label: 'Manage integrations',         group: 'Integrations', status: 'planned' },
];

const CAPABILITY_IDS = new Set(CAPABILITIES.map(c => c.id));

/**
 * Default grants per role.
 *
 * Derived from the blocked-module lists in `lib/useShop.ts` so that nobody's
 * effective access changes when this ships. `capabilityDefaultsMatchModules`
 * in the tests re-derives them from those lists and fails if the two drift.
 *
 * Owner is deliberately NOT `everything` as a wildcard: an owner who cannot be
 * denied anything is impossible to reason about later, and the planned
 * capabilities must not silently become active for them the day something
 * starts enforcing them.
 */
const OWNER: readonly string[] = CAPABILITIES.filter(c => c.status === 'enforced').map(c => c.id);

const MANAGER: readonly string[] = [
  'customers.read', 'customers.manage', 'customers.archive',
  'vehicles.read', 'vehicles.manage',
  'jobs.read', 'jobs.manage',
  'repair_orders.read', 'repair_orders.manage',
  'inspections.read', 'inspections.manage',
  'estimates.read', 'estimates.manage',
  'parts.read', 'parts.manage',
  'appointments.read', 'appointments.manage',
  // Read only. An employee record is about a person's employment and is where
  // pay will live; narrowing before there is anything sensitive on it is
  // cheaper than narrowing after.
  'employees.read',
  // Attendance and leave are what a shop manager actually does day to day —
  // who turned up, who is off next week. Pay itself stays with the owner.
  'attendance.read', 'attendance.manage',
  'leave.read', 'leave.request', 'leave.approve',
  // Nothing from Pay, deliberately. A manager runs the shop day to day and
  // now holds attendance and leave; what each person earns is needed for
  // none of that. They may still ask for an advance for themselves.
  'salary.read_own', 'salary_advances.request',
  'expenses.read', 'expenses.create',
];

const ADVISOR: readonly string[] = [
  'customers.read', 'customers.manage', 'customers.archive',
  'vehicles.read', 'vehicles.manage',
  'jobs.read', 'jobs.manage',
  'inspections.read', 'inspections.manage',
  'estimates.read', 'estimates.manage',
  'parts.read',
  'appointments.read', 'appointments.manage',
  // Their own time off, their own pay, not anyone else's.
  'leave.request',
  'salary.read_own', 'salary_advances.request',
  'expenses.create',
];

const TECHNICIAN: readonly string[] = [
  'jobs.read', 'jobs.manage',
  'repair_orders.read', 'repair_orders.manage',
  'inspections.read', 'inspections.manage',
  'parts.read', 'parts.manage',
  'leave.request',
  'salary.read_own', 'salary_advances.request',
  'expenses.create',
];

export const DEFAULT_CAPABILITIES: Readonly<Record<ShopRole, readonly string[]>> = {
  owner: OWNER,
  manager: MANAGER,
  advisor: ADVISOR,
  technician: TECHNICIAN,
};

/**
 * Per-shop adjustments, stored in `shop_settings.capability_overrides`.
 *
 * Grants and denies are held separately rather than as one resolved list. The
 * reason is the same one that made the alerts catalogue store DISABLED ids: a
 * capability added in a later release is absent from both lists, so it falls
 * back to the role default instead of being accidentally granted or
 * accidentally withheld from every shop that ever saved its settings.
 */
export interface CapabilityOverrides {
  grant?: Partial<Record<ShopRole, string[]>>;
  deny?: Partial<Record<ShopRole, string[]>>;
}

/**
 * The capabilities a role actually has in a given shop.
 *
 * Deny beats grant. A shop that has explicitly taken something away should not
 * have it handed back by a default, or by a grant added later for a different
 * reason.
 */
export function capabilitiesFor(
  role: string | null | undefined,
  overrides: CapabilityOverrides | null | undefined,
): string[] {
  if (!role || !SHOP_ROLES.includes(role as ShopRole)) return [];
  const shopRole = role as ShopRole;

  const granted = new Set<string>(DEFAULT_CAPABILITIES[shopRole]);
  for (const id of overrides?.grant?.[shopRole] ?? []) {
    // Unknown ids are ignored rather than trusted: a typo in stored settings
    // must not become a permission nobody can find in the catalogue.
    if (CAPABILITY_IDS.has(id)) granted.add(id);
  }
  for (const id of overrides?.deny?.[shopRole] ?? []) granted.delete(id);

  // A planned capability grants nothing, whatever the stored settings say.
  // Otherwise the day something starts enforcing it, access changes silently
  // for every shop that had ticked it.
  return [...granted].filter(id => {
    const capability = CAPABILITIES.find(c => c.id === id);
    return capability?.status === 'enforced';
  });
}

/** Whether a resolved capability list allows something. */
export function allows(capabilities: readonly string[], capability: string): boolean {
  return capabilities.includes(capability);
}
