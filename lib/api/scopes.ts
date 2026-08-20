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
