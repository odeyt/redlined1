/**
 * The billing checkout route, exercised as a route: the real POST handler, real request and response, the real
 * plan catalogue and the real eligibility rule. Only Supabase, the payment provider, shop provisioning and the
 * internal-shop list are replaced. Nothing here calls Creem or Supabase, and every id and value is synthetic.
 *
 * What these tests are for: the route used to read the buyer's membership with `.maybeSingle()`, which resolves
 * to { data: null, error: PGRST116 } for a user with more than one shop_users row. Reading only `data` made a
 * multi-shop buyer look shop-less, so the technician refusal was skipped and so was the internal-shop exemption.
 * The role is now judged against the shop the checkout will actually bill, using the SAME allowlist the webhook
 * applies after payment — so no buyer can pass here only to have the payment held as `buyer_not_eligible`.
 */
import { NextRequest } from 'next/server';
import { BILLING_ELIGIBLE_ROLES } from '../billing/creemEvent';
import { selectBillingShop } from '../billing/checkoutEligibility';

const SHOP_A = 'a1000000-0000-4000-8000-0000000000a1';
const SHOP_B = 'a2000000-0000-4000-8000-0000000000a2';
const SHOP_INTERNAL = 'a3000000-0000-4000-8000-0000000000a3';
const USER = 'c1000000-0000-4000-8000-0000000000c1';

type Row = { shop_id: string | null; role: string | null };

let mockUser: { id: string; email: string; user_metadata?: Record<string, unknown> } | null;
let mockRows: Row[];
let mockRowsError: { message: string } | null;
let mockInternalShops: Set<string>;
let provisioned: string;
let provisionCalls: number;
let checkoutCalls: Array<Record<string, unknown>>;

jest.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));

jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: () => {
      // The route's chain is .select().eq().order(). `.maybeSingle()` is offered too, with the REAL PostgREST
      // semantics (see @supabase/postgrest-js PostgrestBuilder: more than one row yields data: null and a
      // PGRST116 error), so that these tests run against the previous implementation of this route and fail on
      // its behaviour rather than on a missing mock method.
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = async () =>
        mockRowsError ? { data: null, error: mockRowsError } : { data: mockRows, error: null };
      q.maybeSingle = async () => {
        if (mockRowsError) return { data: null, error: mockRowsError };
        if (mockRows.length > 1) {
          return {
            data: null,
            error: {
              code: 'PGRST116',
              message: 'JSON object requested, multiple (or no) rows returned',
              details: `Results contain ${mockRows.length} rows, application/vnd.pgrst.object+json requires 1 row`,
              hint: null,
            },
          };
        }
        return { data: mockRows[0] ?? null, error: null };
      };
      return q;
    },
  }),
}));

jest.mock('@/lib/adminAuth', () => ({ getInternalShopIds: () => mockInternalShops }));

jest.mock('@/commercial/onboarding/ShopProvisioningService', () => ({
  getOrCreatePrimaryShop: async () => { provisionCalls += 1; return { shopId: provisioned, created: true }; },
}));

jest.mock('@/lib/payments/payment-service', () => ({
  getPaymentProvider: () => ({
    createCheckoutSession: async (input: Record<string, unknown>) => {
      checkoutCalls.push(input);
      return { checkoutUrl: 'https://test-checkout.example/session', sessionId: 'sess_test_1' };
    },
  }),
}));

import { POST } from '../../app/api/billing/checkout/route';

beforeEach(() => {
  mockUser = { id: USER, email: 'buyer@example-customer.test', user_metadata: {} };
  mockRows = [];
  mockRowsError = null;
  mockInternalShops = new Set<string>();
  provisioned = SHOP_B;
  provisionCalls = 0;
  checkoutCalls = [];
  process.env.CREEM_API_KEY = 'creem_test_key_for_unit_tests';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_test_key';
  delete process.env.PLATFORM_OWNER_EMAIL;
  delete process.env.NEXT_PUBLIC_PLATFORM_OWNER_EMAIL;
  delete process.env.BILLING_EXEMPT_DOMAINS;
});

async function checkout(body: Record<string, unknown> = { planId: 'solo', billingInterval: 'monthly' }) {
  const req = new NextRequest('https://app.example.test/api/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

/** The shop id the route actually sent to the provider. */
const billedShop = () => (checkoutCalls[0]?.metadata as Record<string, string>)?.shop_id;

// ── the allowlist is shared, not restated ────────────────────────────────────────────────────────────────────
describe('the checkout and the webhook judge the buyer by one rule', () => {
  it('checkout eligibility is decided by the webhook own BILLING_ELIGIBLE_ROLES', () => {
    expect([...BILLING_ELIGIBLE_ROLES].sort()).toEqual(['manager', 'owner']);
  });

  it('every role the product uses that is not owner or manager is refused', () => {
    for (const role of ['technician', 'advisor', 'admin', '', 'Owner', 'superuser']) {
      expect(selectBillingShop([{ shop_id: SHOP_A, role }]).kind).toBe('not_eligible');
    }
  });
});

// ── single membership ────────────────────────────────────────────────────────────────────────────────────────
describe('a buyer with one membership', () => {
  it.each(['owner', 'manager'])('an eligible %s reaches checkout, billing their own shop', async (role) => {
    mockRows = [{ shop_id: SHOP_A, role }];
    const { status, body } = await checkout();
    expect(status).toBe(200);
    expect(body.url).toBe('https://test-checkout.example/session');
    expect(billedShop()).toBe(SHOP_A);
    expect(provisionCalls).toBe(0);
  });

  it('a technician is refused before any Creem session is created', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'technician' }];
    const { status, body } = await checkout();
    expect(status).toBe(403);
    expect(body.error).toBe('Only a shop owner or manager can start a subscription.');
    expect(body.roles).toEqual(['technician']);
    expect(checkoutCalls).toHaveLength(0);
  });

  it('an advisor is refused too, and is told who can buy', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'advisor' }];
    const { status, body } = await checkout();
    expect(status).toBe(403);
    expect(body.roles).toEqual(['advisor']);
    expect(String(body.detail)).toContain('owner and manager');
    expect(checkoutCalls).toHaveLength(0);
  });
});

// ── several memberships: the bug this change fixes ───────────────────────────────────────────────────────────
describe('a buyer with SEVERAL memberships', () => {
  it('REGRESSION: a technician in two shops is refused, where .maybeSingle() used to let them through', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'technician' }, { shop_id: SHOP_B, role: 'technician' }];
    const { status, body } = await checkout();
    expect(status).toBe(403);
    expect(body.roles).toEqual(['technician']);
    expect(checkoutCalls).toHaveLength(0);
    // The old code saw no row, so it also provisioned a brand-new shop and billed it.
    expect(provisionCalls).toBe(0);
  });

  it('an advisor in two shops is refused, and both roles are named', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'advisor' }, { shop_id: SHOP_B, role: 'technician' }];
    const { status, body } = await checkout();
    expect(status).toBe(403);
    expect(body.roles).toEqual(['advisor', 'technician']);
    expect(checkoutCalls).toHaveLength(0);
  });

  it('the role is judged in the shop that is billed: a technician in one shop may still buy for the shop they own', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'technician' }, { shop_id: SHOP_B, role: 'owner' }];
    const { status } = await checkout();
    expect(status).toBe(200);
    expect(billedShop()).toBe(SHOP_B);
  });

  it('an owner of two shops is billed for the owned shop, deterministically', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'manager' }, { shop_id: SHOP_B, role: 'owner' }];
    const { status } = await checkout();
    expect(status).toBe(200);
    expect(billedShop()).toBe(SHOP_B);
  });

  it('a manager of two shops is billed for the first by shop id, and repeat requests agree', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'manager' }, { shop_id: SHOP_B, role: 'manager' }];
    const first = await checkout();
    expect(first.status).toBe(200);
    expect(billedShop()).toBe(SHOP_A);
    checkoutCalls = [];
    await checkout();
    expect(billedShop()).toBe(SHOP_A);
  });

  it('a stray technician row beside an owner row for the SAME shop disqualifies that shop, as it does in the webhook', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'owner' }, { shop_id: SHOP_A, role: 'technician' }];
    const { status, body } = await checkout();
    expect(status).toBe(403);
    expect(body.roles).toEqual(['owner', 'technician']);
    expect(checkoutCalls).toHaveLength(0);
  });

  it('that same buyer may still buy for a different shop they cleanly own', async () => {
    mockRows = [
      { shop_id: SHOP_A, role: 'owner' }, { shop_id: SHOP_A, role: 'technician' },
      { shop_id: SHOP_B, role: 'owner' },
    ];
    const { status } = await checkout();
    expect(status).toBe(200);
    expect(billedShop()).toBe(SHOP_B);
  });
});

// ── gates that also depended on knowing the shop ─────────────────────────────────────────────────────────────
describe('the other gates that a multi-shop buyer used to slip past', () => {
  it('REGRESSION: an internal shop is exempt even when the buyer belongs to both mirrored shops', async () => {
    mockInternalShops = new Set([SHOP_INTERNAL, SHOP_B]);
    mockRows = [{ shop_id: SHOP_INTERNAL, role: 'owner' }, { shop_id: SHOP_B, role: 'owner' }];
    const { status, body } = await checkout();
    expect(status).toBe(403);
    expect(body.error).toBe('Internal accounts are not subject to billing');
    expect(checkoutCalls).toHaveLength(0);
  });

  it('an exempt email is still refused before checkout', async () => {
    process.env.PLATFORM_OWNER_EMAIL = 'owner@redlined1.test';
    mockUser = { id: USER, email: 'Owner@Redlined1.test' };
    mockRows = [{ shop_id: SHOP_A, role: 'owner' }];
    const { status, body } = await checkout();
    expect(status).toBe(403);
    expect(body.error).toBe('This account is not subject to billing');
  });
});

// ── no membership, and failure ───────────────────────────────────────────────────────────────────────────────
describe('a buyer with no membership, and a failing lookup', () => {
  it('a brand-new buyer still gets a shop provisioned and billed', async () => {
    mockRows = [];
    const { status } = await checkout();
    expect(status).toBe(200);
    expect(provisionCalls).toBe(1);
    expect(billedShop()).toBe(SHOP_B);
  });

  it('a membership lookup that FAILS does not fall through to provisioning a new shop', async () => {
    mockRowsError = { message: 'connection reset' };
    const { status } = await checkout();
    expect(status).toBe(500);
    expect(provisionCalls).toBe(0);
    expect(checkoutCalls).toHaveLength(0);
  });

  it('an unauthenticated request is refused', async () => {
    mockUser = null;
    const { status, body } = await checkout();
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('an ineligible buyer is refused before the plan is even validated', async () => {
    mockRows = [{ shop_id: SHOP_A, role: 'technician' }];
    const { status, body } = await checkout({ planId: 'not-a-plan', billingInterval: 'monthly' });
    expect(status).toBe(403);
    expect(body.error).toBe('Only a shop owner or manager can start a subscription.');
  });
});
