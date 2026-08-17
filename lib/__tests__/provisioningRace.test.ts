/**
 * Two signups arriving together must produce one shop.
 *
 * getOrCreatePrimaryShop reads a user's memberships and creates a shop when
 * there are none — a read followed by a write, with nothing stopping a second
 * request slipping between them. An E2E run produced FIVE shops for one
 * account inside a single second because several pages opened at once, and a
 * real customer who opens two tabs during signup takes the same path.
 *
 * These are source assertions: the function talks to Supabase through an admin
 * client, and a faithful concurrency test would need a real database. What can
 * be pinned here is that the guard exists, that it is a primary key rather than
 * a second read, and that the failure modes go the safe way.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICE = readFileSync(
  join(process.cwd(), 'commercial/onboarding/ShopProvisioningService.ts'),
  'utf8',
);
const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/2026-08-17_m7_provisioning_claim.sql'),
  'utf8',
);
const CODE = SQL.replace(/^\s*--.*$/gm, '');

describe('the claim is what serialises provisioning', () => {
  it('is keyed on the user, so exactly one insert can win', () => {
    expect(CODE).toMatch(/user_id\s+UUID PRIMARY KEY/);
  });

  it('is claimed before the shop is created', () => {
    const claimAt = SERVICE.indexOf("from('shop_provisioning_claims')");
    const createAt = SERVICE.indexOf("from('shops')");
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(createAt);
  });

  it('treats a duplicate-key conflict as "someone else is doing it"', () => {
    // 23505 is the whole mechanism. Without this branch the loser would fall
    // through and create the second shop the claim exists to prevent.
    expect(SERVICE).toMatch(/claimErr\.code === '23505'/);
    expect(SERVICE).toMatch(/waitForProvisionedShop\(userId\)/);
  });

  it('waits on the MEMBERSHIP, not on the claim row', () => {
    // The membership is what the rest of the app reads to decide which shop
    // somebody is in; a claim with a shop_id set is not yet usable if the
    // membership insert has not landed.
    const waiter = SERVICE.slice(SERVICE.indexOf('async function waitForProvisionedShop'));
    expect(waiter).toMatch(/from\('shop_users'\)/);
  });
});

describe('the failure modes go the safe way', () => {
  it('creates a shop rather than leaving an account without one', () => {
    // A duplicate shop is recoverable by hand. An account with no shop cannot
    // use the product at all, and that is the failure this whole provisioning
    // path was written to stop.
    expect(SERVICE).toMatch(/a duplicate shop is recoverable, an account with no shop is not/i);
  });

  it('still provisions if the claim table is missing', () => {
    // The migration may not have landed yet. Signup must not depend on it.
    expect(SERVICE).toMatch(/claim unavailable, proceeding unguarded/);
  });

  it('does not fail a successful signup because the claim could not be updated', () => {
    const after = SERVICE.slice(SERVICE.indexOf('await ensureOwnerMembership(userId, shop.id)'));
    expect(after).toMatch(/Best-effort/);
  });

  it('bounds the wait, because a person is sitting in front of the form', () => {
    expect(SERVICE).toMatch(/timeoutMs = 3000/);
  });
});

describe('existing accounts are not re-provisioned', () => {
  it('back-fills a claim for every current member', () => {
    expect(CODE).toMatch(/INSERT INTO public\.shop_provisioning_claims \(user_id, shop_id, created_at\)/);
    expect(CODE).toMatch(/SELECT DISTINCT ON \(su\.user_id\)/);
  });

  it('takes their OLDEST membership as the shop they were given', () => {
    expect(CODE).toMatch(/ORDER BY su\.user_id, su\.created_at/);
  });
});

describe('the table is not reachable by users', () => {
  it('has RLS on and no policies, so it denies by default', () => {
    expect(CODE).toMatch(/ALTER TABLE public\.shop_provisioning_claims ENABLE ROW LEVEL SECURITY/);
    expect(CODE).not.toMatch(/CREATE POLICY[^;]*shop_provisioning_claims/);
  });

  it('revokes the app roles explicitly', () => {
    expect(CODE).toMatch(/REVOKE ALL ON public\.shop_provisioning_claims FROM authenticated, anon/);
  });
});

describe('the constraint that was NOT used', () => {
  it('does not make owning one shop per user a rule', () => {
    // D1 Imports already has two locations under one owner. A unique index on
    // shop_users(user_id) WHERE role='owner' would have broken that while
    // appearing to fix the race.
    expect(CODE).not.toMatch(/UNIQUE.*shop_users/i);
    expect(SQL).toMatch(/Owning more than one shop is legitimate/);
  });
});
