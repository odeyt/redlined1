/**
 * Profile diagnostics against an in-memory database. Synthetic ids/emails only.
 */
import { classifyProfile, getProfileDiagnostics, listProfileDiagnostics, PROFILE_NOT_DERIVABLE } from '../profileDiagnostics';
import { createFakeAdminDb, type Row } from './fakeAdminDb';

const fake = createFakeAdminDb();
const P = (n: number) => `h${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;
const SHOP = 'i0000001-0000-4000-8000-000000000000';

const profile = (n: number, o: Partial<Row> = {}): Row => ({
  id: P(n), email: `person${n}@example-test.invalid`, shop_id: null, role: null, plan: 'free', trial_ends_at: null, shop_name: null, billing_status: null, ...o,
});

function reset() {
  fake.state.failTables.clear();
  fake.state.missingColumns = {};
  fake.state.failAuth = false;
  fake.state.selects.length = 0;
  fake.state.authUsers = {
    [P(1)]: { created_at: '2026-08-01T10:00:00Z', last_sign_in_at: null, email_confirmed_at: null },                 // unverified
    [P(2)]: { created_at: '2026-08-02T10:00:00Z', last_sign_in_at: '2026-08-03T10:00:00Z', email_confirmed_at: '2026-08-02T10:05:00Z' }, // verified, no claim
    [P(3)]: { created_at: '2026-08-03T10:00:00Z', last_sign_in_at: '2026-08-04T10:00:00Z', email_confirmed_at: '2026-08-03T10:05:00Z' }, // claim, no shop
    [P(4)]: { created_at: '2026-08-04T10:00:00Z', last_sign_in_at: '2026-08-05T10:00:00Z', email_confirmed_at: '2026-08-04T10:05:00Z' }, // claim -> shop, no membership
    // P(5) has a profile but NO auth user
    [P(6)]: { created_at: '2026-08-06T10:00:00Z', last_sign_in_at: '2026-08-07T10:00:00Z', email_confirmed_at: '2026-08-06T10:05:00Z' }, // linked: not diagnosed
    [P(7)]: { created_at: '2026-08-07T10:00:00Z', last_sign_in_at: null, email_confirmed_at: null },                 // unverified, shares email with P(1)
  };
  fake.state.tables = {
    profiles: [
      profile(1), profile(2, { shop_id: SHOP }), profile(3), profile(4), profile(5), profile(6),
      profile(7, { email: 'PERSON1@example-test.invalid' }),
    ],
    shop_users: [{ shop_id: SHOP, user_id: P(6), role: 'owner' }],
    shop_provisioning_claims: [{ user_id: P(3), shop_id: null }, { user_id: P(4), shop_id: SHOP }],
  };
}

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake.db }));

beforeEach(reset);

describe('classifyProfile — a cause only when a record establishes it', () => {
  it.each([
    [{ authFound: false, emailVerified: null, claim: 'none' }, 'no_auth_user'],
    [{ authFound: true, emailVerified: true, claim: 'without_shop' }, 'provisioning_claim_without_shop'],
    [{ authFound: true, emailVerified: true, claim: 'with_shop' }, 'claim_shop_without_membership'],
    [{ authFound: true, emailVerified: false, claim: 'none' }, 'email_unverified'],
    [{ authFound: true, emailVerified: true, claim: 'none' }, 'verified_no_provisioning_evidence'],
    [{ authFound: true, emailVerified: true, claim: 'unknown' }, 'unknown'],
    [{ authFound: null, emailVerified: null, claim: 'none' }, 'unknown'],
  ] as const)('%j → %s', (facts, cause) => {
    expect(classifyProfile(facts as never)).toBe(cause);
  });

  it('a claim outranks an unverified email: an attempt happened', () => {
    expect(classifyProfile({ authFound: true, emailVerified: false, claim: 'without_shop' })).toBe('provisioning_claim_without_shop');
  });
});

describe('getProfileDiagnostics', () => {
  it('diagnoses only profiles with no shop_users membership — a legacy shop_id pointer does not link a profile', async () => {
    const { summary, items } = await getProfileDiagnostics();
    expect(summary.profilesWithoutMembership).toBe(6); // 1,2,3,4,5,7 (6 has a membership)
    expect(items).toHaveLength(6);
    const p2 = items.find(i => i.legacyShopPointer);
    expect(p2?.cause).toBe('verified_no_provisioning_evidence');
  });

  it('assigns each profile exactly one cause from the evidence', async () => {
    const { summary } = await getProfileDiagnostics();
    expect(summary.byCause).toEqual({
      email_unverified: 2,                    // 1 and 7
      provisioning_claim_without_shop: 1,     // 3
      claim_shop_without_membership: 1,       // 4
      no_auth_user: 1,                        // 5
      verified_no_provisioning_evidence: 1,   // 2
      unknown: 0,
    });
    expect(Object.values(summary.byCause).reduce((a, b) => a + b, 0)).toBe(summary.profilesWithoutMembership);
  });

  it('reports a shared email as a fact, without changing the cause', async () => {
    const { summary, items } = await getProfileDiagnostics();
    expect(summary.duplicateEmailProfiles).toBe(2); // 1 and 7 share an email (case-insensitive)
    expect(items.filter(i => i.duplicateEmail)).toHaveLength(2);
    expect(items.filter(i => i.duplicateEmail).every(i => i.cause === 'email_unverified')).toBe(true);
  });

  it('when the claim table cannot be read the cause is unknown, not "no shop-creation record"', async () => {
    fake.state.failTables.add('shop_provisioning_claims');
    const { summary } = await getProfileDiagnostics();
    expect(summary.byCause.verified_no_provisioning_evidence).toBe(0);
    expect(summary.byCause.unknown).toBeGreaterThan(0);
    // A claim would outrank an unverified email, so with claims unreadable nothing but "no sign-in account" is established.
    expect(summary.byCause.email_unverified).toBe(0);
    expect(summary.byCause.no_auth_user).toBe(1);
    expect(summary.byCause.unknown).toBe(5);
  });

  it('a failed auth lookup leaves the cause unknown, except where a claim record establishes one', async () => {
    fake.state.failAuth = true;
    const { summary } = await getProfileDiagnostics();
    expect(summary.byCause.provisioning_claim_without_shop).toBe(1);
    expect(summary.byCause.claim_shop_without_membership).toBe(1);
    expect(summary.byCause.unknown).toBe(4);
  });

  it('never invents causes it cannot derive, and says so', async () => {
    const { summary } = await getProfileDiagnostics();
    expect(summary.notDerivable).toEqual(PROFILE_NOT_DERIVABLE);
    expect(summary.notDerivable.join(' ')).toMatch(/invited team member pending/);
  });

  it('returns masked rows only: no email, no name, no full identifier, day-level dates', async () => {
    const { items } = await getProfileDiagnostics();
    const json = JSON.stringify(items);
    expect(json).not.toMatch(/example-test\.invalid/);
    expect(json).not.toMatch(/h000000\d-0000-4000/);
    for (const i of items) {
      expect(i.profileRef).toMatch(/^ref-[0-9a-f]{10}$/);
      expect(Object.keys(i).sort()).toEqual(['accountCreatedDay', 'cause', 'duplicateEmail', 'emailVerified', 'lastSignInDay', 'legacyShopPointer', 'profileRef', 'provisioningClaim']);
      if (i.accountCreatedDay) expect(i.accountCreatedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('is read-only and never selects more than the columns it needs', async () => {
    await getProfileDiagnostics();
    const cols = new Set(fake.state.selects.flatMap(s => s.columns));
    expect([...cols].sort()).toEqual(['email', 'id', 'shop_id', 'user_id']);
    for (const m of ['insert', 'update', 'upsert', 'delete', 'rpc']) expect(fake.db.from('profiles')).not.toHaveProperty(m);
  });

  it('degrades to "unavailable" instead of throwing when profiles cannot be read', async () => {
    fake.state.failTables.add('profiles');
    const { summary, items } = await getProfileDiagnostics();
    expect(summary.available).toBe(false);
    expect(items).toEqual([]);
  });

  it('refuses to diagnose (rather than guess) when there are too many rows', async () => {
    fake.state.tables.profiles = Array.from({ length: 2001 }, (_, i) => profile(1000 + i));
    const { summary } = await getProfileDiagnostics();
    expect(summary.available).toBe(false);
    expect(summary.reason).toMatch(/too many/i);
  });

  it('references are stable per profile and distinct across profiles', async () => {
    const a = await getProfileDiagnostics();
    const b = await getProfileDiagnostics();
    expect(a.items.map(i => i.profileRef)).toEqual(b.items.map(i => i.profileRef));
    expect(new Set(a.items.map(i => i.profileRef)).size).toBe(a.items.length);
  });
});

describe('listProfileDiagnostics — bounded and paginated', () => {
  it('clamps page size and paginates without repeats', async () => {
    const big = await listProfileDiagnostics({ pageSize: 100000 });
    expect(big.pageSize).toBeLessThanOrEqual(50);
    const p1 = await listProfileDiagnostics({ page: 1, pageSize: 4 });
    const p2 = await listProfileDiagnostics({ page: 2, pageSize: 4 });
    expect(p1.items).toHaveLength(4);
    expect(p2.items).toHaveLength(2);
    expect(new Set([...p1.items, ...p2.items].map(i => i.profileRef)).size).toBe(6);
    expect((await listProfileDiagnostics({ page: 99, pageSize: 4 })).items).toEqual([]);
    expect(p1.total).toBe(6);
  });

  it('treats bad paging input as defaults', async () => {
    const r = await listProfileDiagnostics({ page: 'x', pageSize: -3 });
    expect(r.page).toBe(1);
    expect(r.pageSize).toBeGreaterThan(0);
  });
});
