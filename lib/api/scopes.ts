/**
 * API v1 scopes, and what they permit inside the domain layer.
 *
 * Deny by default: a key holds exactly the scopes it was issued and nothing is
 * implied. `customers:write` does not imply `customers:read`; an endpoint that
 * needs both says both.
 *
 * The second map is the part that matters. A scope is an API concept; the
 * domain layer speaks capabilities, and `requireCapability` is what actually
 * refuses an operation. Translating here — once, in a table — means an API
 * principal cannot end up with a capability nobody granted it, which is what
 * happens when a route builds a context with a convenient capability list.
 */
export const API_SCOPES = [
  'customers:read',
  'customers:write',
  'vehicles:read',
  'vehicles:write',
  'appointments:read',
  'appointments:write',
  // Bot document access (docs/api/PLAN.md), only behind api_v1_documents.
  // Write means DRAFTS: create, edit a draft, convert an Approved estimate.
  // No scope here sends, approves, records a payment, voids or deletes.
  'estimates:read',
  'estimates:write',
  'invoices:read',
  'invoices:write',
  // Download a document as PDF. Needed IN ADDITION to estimates:read or
  // invoices:read, so a key can be allowed the data but not the printable
  // document a customer could be handed.
  'pdf:read',
] as const;

export type ApiScope = typeof API_SCOPES[number];

/**
 * Scope → the domain capabilities it unlocks.
 *
 * Adding a resource to the API means adding its row here, deliberately, rather
 * than widening a wildcard.
 *
 * `customers.archive` is NOT granted by `customers:write`. Archiving is how a
 * customer disappears from every screen in the app, and an integration that
 * merely syncs contact details should not be able to do it by accident.
 */
const SCOPE_CAPABILITIES: Record<ApiScope, readonly string[]> = {
  'customers:read':  ['customers.read'],
  'customers:write': ['customers.read', 'customers.manage'],

  // Writing a vehicle needs to READ a customer, to verify the one supplied
  // belongs to this tenant before attaching a vehicle to it. That check is the
  // whole defence against a foreign customer_id, so the capability is not
  // optional — but it is customers.read only, never customers.manage.
  'vehicles:read':   ['vehicles.read'],
  'vehicles:write':  ['vehicles.read', 'vehicles.manage', 'customers.read'],

  // Appointments hold customer, vehicle and technician as free TEXT, not
  // references, so writing one needs no read capability on anything else.
  // There is nothing to look up.
  'appointments:read':  ['appointments.read'],
  'appointments:write': ['appointments.read', 'appointments.manage'],

  'estimates:read': ['estimates.read'],
  // An invoice's amount_paid and balance_due are the net of its payments, so
  // reading an invoice properly needs payments.read. That unlocks no payment
  // endpoint (none exists) and never payments.record or payments.reverse:
  // the API cannot move money.
  'invoices:read':  ['invoices.read', 'payments.read'],

  // A draft names a customer and optionally a vehicle by id; both are checked
  // to belong to this tenant before anything is written, which needs read
  // (never manage) on each, as vehicles:write does for customers.
  'estimates:write': ['estimates.read', 'estimates.manage', 'customers.read', 'vehicles.read'],
  'invoices:write':  ['invoices.read', 'invoices.manage', 'payments.read', 'customers.read', 'vehicles.read'],

  // No capability of its own: the document read is granted by estimates:read
  // or invoices:read, which the PDF routes also require.
  'pdf:read': [],
};

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/** Every capability the given scopes unlock, de-duplicated. */
export function capabilitiesForScopes(scopes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const scope of scopes) {
    if (!isApiScope(scope)) continue;
    for (const capability of SCOPE_CAPABILITIES[scope]) out.add(capability);
  }
  return [...out];
}
