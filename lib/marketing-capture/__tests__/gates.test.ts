/**
 * The capture's safety gates, each proven to stop the run on its own.
 *
 * `safeFacts()` is the one state in which recording is allowed. Every test below
 * breaks exactly one condition and asserts the run is refused — so a gate that
 * was accidentally deleted, or that treats "unreadable" as fine, fails here
 * rather than in production with a camera running.
 */
import {
  APPROVED_BASE_URL, DEMO, evaluateFinishGates, evaluateStartGates,
  isForbiddenControl, syntheticShopReadBackFailure, type GateFacts, type ShopReadBack,
} from '../gates';

const SHOP = '0b0e7a52-4f7e-4a1c-9d2e-2f6c8a1b3c4d';
const OTHER_SHOP = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const USER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function safeFacts(): GateFacts {
  return {
    env: { captureEnabled: 'true', demoShopId: SHOP, baseUrl: APPROVED_BASE_URL },
    shop: { id: SHOP, name: DEMO.shopName, isSynthetic: true },
    sessionUserId: USER,
    sessionMemberships: [{ shopId: SHOP, role: 'owner' }],
    shopMembers: [{ userId: USER, role: 'owner' }],
    pushSubscriptions: 0,
    alertsAllOff: true,
    mirrorRows: 0,
    customersNamed: [{ shopId: SHOP, phone: null, email: null }],
    vehiclesWithPlate: [{ shopId: SHOP }],
    techniciansNamed: [{ shopId: SHOP, phone: null, email: null, userId: null }],
    jobCard: { status: 'Booked', technicians: [] },
    repairOrder: { roNumber: DEMO.roNumber, invoiceNumber: DEMO.invoiceNumber, status: 'Open' },
    sapeleeOutboxRows: 0,
  };
}

/** Apply one change and return the result, so each case reads as a single sentence. */
const startWith = (mutate: (f: GateFacts) => void) => {
  const f = safeFacts();
  mutate(f);
  return evaluateStartGates(f);
};

describe('the only state in which recording may start', () => {
  it('passes with every condition met', () => {
    expect(evaluateStartGates(safeFacts())).toEqual({ ok: true, failures: [] });
  });
});

describe('environment gates', () => {
  it.each([undefined, '', 'TRUE', '1', 'yes'])('refuses when the enable flag is %p', v => {
    expect(startWith(f => { f.env.captureEnabled = v; }).ok).toBe(false);
  });

  it.each([
    undefined,
    'https://redlined1.com',
    'https://www.redlined1.com/',
    'https://staging.redlined1.com',
    'http://localhost:3000',
    'https://redlined1-pi.vercel.app',
  ])('refuses base URL %p', v => {
    expect(startWith(f => { f.env.baseUrl = v; }).ok).toBe(false);
  });

  it.each([undefined, '', 'Redlined1 Demo Workshop', 'not-a-uuid'])('refuses shop id %p', v => {
    const r = startWith(f => { f.env.demoShopId = v; });
    expect(r.ok).toBe(false);
    // Stops immediately: nothing else can be judged without the shop.
    expect(r.failures).toHaveLength(1);
  });
});

describe('tenant gates', () => {
  it('refuses when the shop cannot be read', () => {
    expect(startWith(f => { f.shop = null; }).ok).toBe(false);
  });
  it('refuses a shop that is not marked synthetic', () => {
    expect(startWith(f => { f.shop!.isSynthetic = false; }).ok).toBe(false);
  });
  it('refuses when the shop read back is a different shop', () => {
    expect(startWith(f => { f.shop!.id = OTHER_SHOP; }).ok).toBe(false);
  });
  it('refuses a shop with a different name', () => {
    expect(startWith(f => { f.shop!.name = 'D1 Imports'; }).ok).toBe(false);
  });
  it('refuses when the session user is unknown', () => {
    expect(startWith(f => { f.sessionUserId = null; }).ok).toBe(false);
  });
  it('refuses a session user who also belongs to a real shop', () => {
    expect(startWith(f => { f.sessionMemberships!.push({ shopId: OTHER_SHOP, role: 'owner' }); }).ok).toBe(false);
  });
  it('refuses a session user who is not the owner', () => {
    expect(startWith(f => { f.sessionMemberships![0].role = 'technician'; }).ok).toBe(false);
  });
  it('refuses a second member — their phone would receive demo alerts', () => {
    expect(startWith(f => { f.shopMembers!.push({ userId: 'someone-else', role: 'manager' }); }).ok).toBe(false);
  });
  it('refuses when the sole member is not the session user', () => {
    expect(startWith(f => { f.shopMembers![0].userId = 'someone-else'; }).ok).toBe(false);
  });
  it('refuses when a shop is mirrored to the demo shop', () => {
    expect(startWith(f => { f.mirrorRows = 1; }).ok).toBe(false);
  });
});

describe('delivery gates', () => {
  it.each([1, null])('refuses push subscriptions = %p', v => {
    expect(startWith(f => { f.pushSubscriptions = v; }).ok).toBe(false);
  });
  it.each([false, null])('refuses alertsAllOff = %p', v => {
    expect(startWith(f => { f.alertsAllOff = v; }).ok).toBe(false);
  });
  it.each([1, null])('refuses Sapelee outbox rows = %p', v => {
    expect(startWith(f => { f.sapeleeOutboxRows = v; }).ok).toBe(false);
  });
});

describe('record gates', () => {
  it.each([
    ['customer', (f: GateFacts) => { f.customersNamed = null; }],
    ['customer', (f: GateFacts) => { f.customersNamed = []; }],
    ['customer', (f: GateFacts) => { f.customersNamed!.push({ shopId: OTHER_SHOP }); }],
    ['customer', (f: GateFacts) => { f.customersNamed![0].shopId = OTHER_SHOP; }],
    ['customer', (f: GateFacts) => { f.customersNamed![0].phone = '+856 20 5555 0000'; }],
    ['customer', (f: GateFacts) => { f.customersNamed![0].email = 'jordan@example.com'; }],
    ['vehicle', (f: GateFacts) => { f.vehiclesWithPlate = null; }],
    ['vehicle', (f: GateFacts) => { f.vehiclesWithPlate!.push({ shopId: OTHER_SHOP }); }],
    ['technician', (f: GateFacts) => { f.techniciansNamed![0].userId = USER; }],
    ['technician', (f: GateFacts) => { f.techniciansNamed![0].email = 'alex@example.com'; }],
  ])('refuses a %s that is missing, duplicated, elsewhere, or contactable', (_label, mutate) => {
    expect(startWith(mutate).ok).toBe(false);
  });

  it('treats whitespace contact details as empty rather than as contact details', () => {
    expect(startWith(f => { f.customersNamed![0].phone = '   '; }).ok).toBe(true);
  });

  it('refuses when the repair order is missing', () => {
    expect(startWith(f => { f.repairOrder = null; }).ok).toBe(false);
  });

  it.each([null, 'INV-0081'])('refuses repair order invoice %p — sign-off would draw on the shared sequence', v => {
    expect(startWith(f => { f.repairOrder!.invoiceNumber = v; }).ok).toBe(false);
  });
});

describe('starting-state gates: every take records the same walkthrough', () => {
  it('refuses when the job card is missing', () => {
    expect(startWith(f => { f.jobCard = null; }).ok).toBe(false);
  });
  it.each(['Approved', 'Closed', ''])('refuses a job card starting as %p', s => {
    expect(startWith(f => { f.jobCard!.status = s; }).ok).toBe(false);
  });
  it('refuses a job card that already has a technician', () => {
    expect(startWith(f => { f.jobCard!.technicians = [DEMO.technician]; }).ok).toBe(false);
  });
  it.each(['In Progress', 'Pending Approval', 'Complete'])('refuses a repair order starting as %p', s => {
    expect(startWith(f => { f.repairOrder!.status = s; }).ok).toBe(false);
  });
});

describe('finish gates', () => {
  it('passes when only the demo records changed and nothing left the platform', () => {
    expect(evaluateFinishGates(safeFacts(), safeFacts())).toEqual({ ok: true, failures: [] });
  });
  it('fails if the run queued a Sapelee event', () => {
    const after = safeFacts(); after.sapeleeOutboxRows = 1;
    expect(evaluateFinishGates(safeFacts(), after).ok).toBe(false);
  });
  it('fails if the run created a duplicate record', () => {
    const after = safeFacts(); after.customersNamed!.push({ shopId: SHOP });
    expect(evaluateFinishGates(safeFacts(), after).ok).toBe(false);
  });
  it('fails if the repair order gained a shared-sequence invoice number', () => {
    const after = safeFacts(); after.repairOrder!.invoiceNumber = 'INV-0082';
    expect(evaluateFinishGates(safeFacts(), after).ok).toBe(false);
  });
  it('fails if a record cannot be re-read', () => {
    const after = safeFacts(); after.techniciansNamed = null;
    expect(evaluateFinishGates(safeFacts(), after).ok).toBe(false);
  });
});

describe('seed read-back: demo records are written only into a shop proven synthetic', () => {
  const ok = (): ShopReadBack => ({ error: null, data: { id: SHOP, name: DEMO.shopName, is_synthetic: true } });

  it('passes when the row is the demo shop and is_synthetic is exactly true', () => {
    expect(syntheticShopReadBackFailure(ok(), SHOP)).toBeNull();
  });

  it.each<[string, ShopReadBack]>([
    ['false', { error: null, data: { id: SHOP, name: DEMO.shopName, is_synthetic: false } }],
    ['null', { error: null, data: { id: SHOP, name: DEMO.shopName, is_synthetic: null } }],
    ['missing from the row', { error: null, data: { id: SHOP, name: DEMO.shopName } }],
    ['undefined', { error: null, data: { id: SHOP, name: DEMO.shopName, is_synthetic: undefined } }],
    ['the string "true"', { error: null, data: { id: SHOP, name: DEMO.shopName, is_synthetic: 'true' } }],
    ['the number 1', { error: null, data: { id: SHOP, name: DEMO.shopName, is_synthetic: 1 } }],
  ])('refuses when is_synthetic is %s', (_label, readBack) => {
    expect(syntheticShopReadBackFailure(readBack, SHOP)).not.toBeNull();
  });

  it('refuses when the read-back errors, even if a row came with it', () => {
    const readBack = { ...ok(), error: { message: 'column shops.is_synthetic does not exist' } };
    expect(syntheticShopReadBackFailure(readBack, SHOP)).toBe('demo shop could not be read back');
  });

  it('refuses when no row is found', () => {
    expect(syntheticShopReadBackFailure({ error: null, data: null }, SHOP)).toBe('demo shop was not found on read-back');
  });

  it('refuses when the row is a different shop', () => {
    const readBack = ok(); readBack.data!.id = OTHER_SHOP;
    expect(syntheticShopReadBackFailure(readBack, SHOP)).toBe('read-back returned a different shop');
  });

  it('refuses a synthetic shop that is not the demo shop by name', () => {
    const readBack = ok(); readBack.data!.name = 'D1 Imports';
    expect(syntheticShopReadBackFailure(readBack, SHOP)).not.toBeNull();
  });

  it.each(['', 'not-a-uuid', DEMO.shopName])('refuses expected shop id %p before looking at the row', id => {
    expect(syntheticShopReadBackFailure(ok(), id)).toBe('demo shop id is not a UUID');
  });

  it('never echoes row contents other than the flag state', () => {
    const readBack = { error: null, data: { id: OTHER_SHOP, name: 'Jordan Blake +856 20 5555 0000', is_synthetic: true } };
    const message = syntheticShopReadBackFailure(readBack, SHOP) ?? '';
    expect(message).not.toContain(OTHER_SHOP);
    expect(message).not.toContain('5555');
  });
});

describe('forbidden controls', () => {
  it.each(['Close', 'Close Job', 'Void', 'Send Back', 'Delete', 'close job', ' Close '])('forbids %p', n => {
    expect(isForbiddenControl(n)).toBe(true);
  });
  it.each(['Approve', 'Edit', 'Save', '🔍 QA Sign-Off', '✓ Approve — Mark Complete', 'Closed jobs'])('allows %p', n => {
    expect(isForbiddenControl(n)).toBe(false);
  });
});
