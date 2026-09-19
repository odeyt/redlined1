import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ACTIVATION_DEFINITION, FREE_TIER_LIMITS, activationStage, approachingFreeLimit, isActivatedShop,
  returnedAfterFirstSession, type ShopMilestones,
} from '../activationRules';

const none: ShopMilestones = {
  onboardingStarted: false, hasCustomer: false, hasVehicle: false, hasJobOrRepairOrder: false,
  hasEstimate: false, hasInvoice: false, hasTechnician: false,
};
const m = (o: Partial<ShopMilestones>): ShopMilestones => ({ ...none, ...o });

describe('the documented definition of an activated shop', () => {
  it('states the definition in one place', () => {
    expect(ACTIVATION_DEFINITION).toMatch(/customer and a vehicle/);
    expect(ACTIVATION_DEFINITION).toMatch(/repair order\/job or estimate/);
  });

  it('customer + vehicle + a job/repair order is activated', () => {
    expect(isActivatedShop(m({ hasCustomer: true, hasVehicle: true, hasJobOrRepairOrder: true }))).toBe(true);
  });

  it('customer + vehicle + an estimate is activated', () => {
    expect(isActivatedShop(m({ hasCustomer: true, hasVehicle: true, hasEstimate: true }))).toBe(true);
  });

  it('missing any one part is not activated', () => {
    expect(isActivatedShop(m({ hasVehicle: true, hasJobOrRepairOrder: true }))).toBe(false); // no customer
    expect(isActivatedShop(m({ hasCustomer: true, hasJobOrRepairOrder: true }))).toBe(false); // no vehicle
    expect(isActivatedShop(m({ hasCustomer: true, hasVehicle: true }))).toBe(false); // no workflow
  });

  it('an invoice, a technician or a filled-in profile alone do not activate a shop', () => {
    expect(isActivatedShop(m({ hasInvoice: true, hasTechnician: true, onboardingStarted: true }))).toBe(false);
  });

  it('an unreadable table makes the answer unknown, not "no" — unless another part is known missing', () => {
    expect(isActivatedShop(m({ hasCustomer: true, hasVehicle: true, hasJobOrRepairOrder: null, hasEstimate: null }))).toBeNull();
    expect(isActivatedShop(m({ hasCustomer: null, hasVehicle: true, hasJobOrRepairOrder: true }))).toBeNull();
    expect(isActivatedShop(m({ hasCustomer: null, hasVehicle: false, hasJobOrRepairOrder: true }))).toBe(false);
    expect(isActivatedShop(m({ hasCustomer: true, hasVehicle: true, hasJobOrRepairOrder: null, hasEstimate: true }))).toBe(true);
  });
});

describe('activation stage — exclusive and ordered', () => {
  it('signed_up_only: every milestone was read and none is present', () => {
    expect(activationStage(none, false)).toBe('signed_up_only');
  });

  it('onboarding_started: the shop profile is filled in but nothing operational exists', () => {
    expect(activationStage(m({ onboardingStarted: true }), false)).toBe('onboarding_started');
  });

  it('operational_data: some operational record exists but the shop is not activated', () => {
    expect(activationStage(m({ hasCustomer: true }), false)).toBe('operational_data');
    expect(activationStage(m({ hasInvoice: true }), false)).toBe('operational_data');
    expect(activationStage(m({ hasTechnician: true, onboardingStarted: true }), false)).toBe('operational_data');
  });

  it('activated: meets the definition', () => {
    expect(activationStage(m({ hasCustomer: true, hasVehicle: true, hasEstimate: true }), false)).toBe('activated');
  });

  it('paid wins over everything, including a shop with no operational data', () => {
    expect(activationStage(none, true)).toBe('paid');
    expect(activationStage(m({ hasCustomer: true, hasVehicle: true, hasEstimate: true }), true)).toBe('paid');
  });

  it('unknown: when nothing is present and something could not be read, say so rather than "signed up only"', () => {
    expect(activationStage(m({ hasInvoice: null }), false)).toBe('unknown');
    expect(activationStage(m({ onboardingStarted: null }), false)).toBe('unknown');
  });

  it('a known present record still stages the shop even if another table could not be read', () => {
    expect(activationStage(m({ hasCustomer: true, hasInvoice: null }), false)).toBe('operational_data');
  });
});

describe('approaching a Free Forever limit', () => {
  it('mirrors the enforced database limits', () => {
    const sql = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', 'free_tier_usage_limits.sql'), 'utf8');
    const limits = [...sql.matchAll(/v_limit := (\d+);/g)].map(x => Number(x[1]));
    expect(limits).toEqual([FREE_TIER_LIMITS.customers, FREE_TIER_LIMITS.vehicles, FREE_TIER_LIMITS.jobsPerMonth]);
  });

  it('is true at 80% of any limit and false below it', () => {
    expect(approachingFreeLimit({ customers: 8, vehicles: 0, jobsThisMonth: 0 })).toBe(true);
    expect(approachingFreeLimit({ customers: 7, vehicles: 7, jobsThisMonth: 3 })).toBe(false);
    expect(approachingFreeLimit({ customers: 0, vehicles: 9, jobsThisMonth: 0 })).toBe(true);
    expect(approachingFreeLimit({ customers: 0, vehicles: 0, jobsThisMonth: 4 })).toBe(true);
    expect(approachingFreeLimit({ customers: 0, vehicles: 0, jobsThisMonth: 0 })).toBe(false);
  });

  it('is true at and beyond the limit', () => {
    expect(approachingFreeLimit({ customers: 10, vehicles: 0, jobsThisMonth: 0 })).toBe(true);
    expect(approachingFreeLimit({ customers: 0, vehicles: 0, jobsThisMonth: 9 })).toBe(true);
  });
});

describe('returned after the first session', () => {
  const created = '2026-09-01T10:00:00Z';
  it('needs a sign-in at least a day after account creation', () => {
    expect(returnedAfterFirstSession(created, '2026-09-02T10:00:00Z')).toBe(true);
    expect(returnedAfterFirstSession(created, '2026-09-01T12:00:00Z')).toBe(false);
    expect(returnedAfterFirstSession(created, null)).toBe(false);
  });

  it('is unknown without a creation date or with garbage', () => {
    expect(returnedAfterFirstSession(undefined, '2026-09-02T10:00:00Z')).toBeNull();
    expect(returnedAfterFirstSession(created, 'not a date')).toBeNull();
  });
});
