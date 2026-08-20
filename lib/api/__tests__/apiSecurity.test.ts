/**
 * The security properties of API v1 that can be proven without a database.
 *
 * The live HTTP matrix needs the M13 tables, which are not applied yet. What is
 * pinned here is the part that no amount of integration testing would catch
 * reliably: that the code cannot be *changed* into an insecure shape without a
 * test going red.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { API_SCOPES, capabilitiesForScopes, isApiScope } from '../scopes';
import { API_KEY_PREFIX, hashApiKey, secureEquals, bearerFrom } from '../principal';
import { hashRequest } from '../idempotency';
import { API_ERRORS } from '../errors';

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

function routeFiles(dir: string): string[] {
  const abs = join(process.cwd(), dir);
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const full = join(abs, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(join(dir, entry)));
    else if (entry === 'route.ts') out.push(join(dir, entry));
  }
  return out;
}

describe('scopes are deny-by-default', () => {
  it('grants nothing for no scopes', () => {
    expect(capabilitiesForScopes([])).toEqual([]);
  });

  it('ignores a scope that is not in the catalogue', () => {
    // A typo, or a scope invented by an attacker editing a JWT-like payload,
    // must not silently unlock anything.
    expect(capabilitiesForScopes(['customers:*', 'admin', 'customers:delete'])).toEqual([]);
  });

  it('does not let read imply write', () => {
    expect(capabilitiesForScopes(['customers:read'])).not.toContain('customers.manage');
  });

  it('does not let write imply archive', () => {
    // Archiving removes a customer from every screen. A contact-sync
    // integration should not be able to do it.
    expect(capabilitiesForScopes(['customers:write'])).not.toContain('customers.archive');
  });

  it('only recognises catalogued scopes', () => {
    for (const s of API_SCOPES) expect(isApiScope(s)).toBe(true);
    expect(isApiScope('customers:admin')).toBe(false);
  });
});

describe('credentials', () => {
  it('hashes to a stable sha256 hex digest', () => {
    const h = hashApiKey(API_KEY_PREFIX + 'abc');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(API_KEY_PREFIX + 'abc')).toBe(h);
    expect(hashApiKey(API_KEY_PREFIX + 'abd')).not.toBe(h);
  });

  it('compares without leaking length mismatches as a throw', () => {
    expect(secureEquals('a', 'a')).toBe(true);
    expect(secureEquals('a', 'b')).toBe(false);
    expect(secureEquals('a', 'ab')).toBe(false);
  });

  it.each([
    ['Bearer rl_live_x', 'rl_live_x'],
    ['bearer rl_live_x', 'rl_live_x'],
    ['Bearer   rl_live_x', 'rl_live_x'],
  ])('extracts a bearer from %s', (header, expected) => {
    expect(bearerFrom(header)).toBe(expected);
  });

  it.each([null, '', 'rl_live_x', 'Basic abc', 'Bearer', 'Bearer a b'])('rejects %s', header => {
    expect(bearerFrom(header)).toBeNull();
  });
});

describe('idempotency hashing', () => {
  it('is insensitive to key order', () => {
    // A caller whose JSON serialiser reorders fields must not see a spurious
    // conflict on a legitimate retry.
    expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }));
  });

  it('changes when a value changes', () => {
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
  });

  it('distinguishes nested differences', () => {
    expect(hashRequest({ a: { b: 1 } })).not.toBe(hashRequest({ a: { b: 2 } }));
  });
});

describe('the error catalogue is a contract', () => {
  const REQUIRED = [
    'AUTH_REQUIRED', 'INVALID_API_KEY', 'API_KEY_REVOKED', 'FORBIDDEN', 'SCOPE_REQUIRED',
    'SHOP_NOT_ACCESSIBLE', 'VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT',
    'IDEMPOTENCY_CONFLICT', 'RATE_LIMITED', 'ENTITLEMENT_DENIED', 'INTERNAL_ERROR',
  ];

  it.each(REQUIRED)('defines %s', code => {
    expect(API_ERRORS).toHaveProperty(code);
  });

  it('never puts a database detail in a caller-facing message', () => {
    for (const [code, e] of Object.entries(API_ERRORS)) {
      expect(e.message).not.toMatch(/supabase|postgres|rls|policy|relation|column|sql/i);
      expect(e.status).toBeGreaterThanOrEqual(400);
      expect(code).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('every v1 route goes through the handler', () => {
  const ROUTES = routeFiles(join('app', 'api', 'v1'));

  it('finds the customer routes', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(2);
  });

  it.each(ROUTES)('%s declares scopes and uses withApi', file => {
    const source = read(file);
    expect(source).toContain('withApi(');
    expect(source).toMatch(/scopes:\s*\[\s*'/);
  });

  it.each(ROUTES)('%s never touches a Supabase client directly', file => {
    const source = read(file);
    // The route receives ctx.db from the handler, which has already resolved
    // the principal. Importing a client here would let a route skip that.
    expect(source).not.toContain('getAdminDb');
    expect(source).not.toContain('createClient');
    expect(source).not.toContain('SERVICE_ROLE');
  });

  it.each(ROUTES)('%s never reads a tenant from caller input', file => {
    const source = read(file);
    // The key is the tenant. A route reading either of these from the body or
    // query would let a caller choose someone else's data.
    expect(source).not.toMatch(/body\.(shop_id|organization_id)/);
    expect(source).not.toMatch(/searchParams\.get\(['"](shop_id|organization_id)/);
    expect(source).not.toMatch(/parsed\.data\.(shop_id|organization_id)/);
  });
});

describe('the handler enforces the order that matters', () => {
  const HANDLER = read('lib', 'api', 'handler.ts');

  it('authenticates before rate limiting', () => {
    // Rate limiting first would let an unauthenticated flood consume a real
    // tenant's budget, or require an IP fallback that punishes shared hosting.
    expect(HANDLER.indexOf('resolvePrincipal')).toBeLessThan(HANDLER.indexOf('api_rate_limit_hit'));
  });

  it('checks scopes before running the handler', () => {
    expect(HANDLER.indexOf('requireScope')).toBeLessThan(HANDLER.indexOf('await handler('));
  });

  it('builds the domain context from the principal, never from input', () => {
    const block = HANDLER.slice(HANDLER.indexOf('createDomainContext('), HANDLER.indexOf('await handler('));
    expect(block).toContain('principal.organizationId');
    expect(block).toContain('principal.shopIds');
    expect(block).not.toMatch(/request\.|body|searchParams/);
  });

  it('marks the actor as an api principal, not a user', () => {
    expect(HANDLER).toMatch(/type:\s*'api'/);
    expect(HANDLER).toMatch(/userId:\s*null/);
  });

  it('refuses a write when the key spans several shops', () => {
    expect(HANDLER).toContain('requiresWriteShop');
    expect(HANDLER).toContain('SHOP_NOT_ACCESSIBLE');
  });

  it('returns a request id on both success and failure', () => {
    expect(HANDLER).toContain("'x-request-id'");
    expect(HANDLER).toContain('request_id: requestId');
  });

  it('never returns a raw thrown error to the caller', () => {
    const block = HANDLER.slice(HANDLER.indexOf('} catch (err)'));
    expect(block).toContain("apiFailure('INTERNAL_ERROR'");
    expect(block).not.toMatch(/message:\s*err/);
  });
});

describe('the principal is the tenant', () => {
  const PRINCIPAL = read('lib', 'api', 'principal.ts');

  it('reads permitted shops from the organization, not the request', () => {
    expect(PRINCIPAL).toContain("eq('organization_id', key.organization_id)");
  });

  it('verifies a shop-scoped key still belongs to its organization', () => {
    expect(PRINCIPAL).toContain('orgShopIds.includes(key.shop_id)');
    expect(PRINCIPAL).toContain('SHOP_NOT_ACCESSIBLE');
  });

  it('refuses a revoked key', () => {
    expect(PRINCIPAL).toContain('API_KEY_REVOKED');
    expect(PRINCIPAL.indexOf('revoked_at')).toBeGreaterThan(-1);
  });

  it('looks a key up by hash, never by the secret', () => {
    expect(PRINCIPAL).toContain("eq('key_hash', hashApiKey(secret))");
    expect(PRINCIPAL).not.toMatch(/eq\('secret'|eq\('key',/);
  });
});
