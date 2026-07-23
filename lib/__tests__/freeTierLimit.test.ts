import { parseFreeTierLimitError, freeTierLimitMessage } from '../freeTierLimit';

describe('parseFreeTierLimitError', () => {
  it('parses the trigger error signal for each limited table', () => {
    expect(parseFreeTierLimitError({ message: 'FREE_TIER_LIMIT:customers:10' }))
      .toEqual({ resource: 'customers', limit: 10 });
    expect(parseFreeTierLimitError({ message: 'FREE_TIER_LIMIT:vehicles:10' }))
      .toEqual({ resource: 'vehicles', limit: 10 });
    expect(parseFreeTierLimitError({ message: 'FREE_TIER_LIMIT:job_cards:5' }))
      .toEqual({ resource: 'job_cards', limit: 5 });
  });

  it('returns null for unrelated errors', () => {
    expect(parseFreeTierLimitError({ message: 'duplicate key value violates unique constraint' })).toBeNull();
    expect(parseFreeTierLimitError(new Error('network error'))).toBeNull();
    expect(parseFreeTierLimitError(null)).toBeNull();
    expect(parseFreeTierLimitError(undefined)).toBeNull();
  });
});

describe('freeTierLimitMessage', () => {
  it('produces a friendly, actionable message per resource', () => {
    expect(freeTierLimitMessage({ resource: 'customers', limit: 10 }))
      .toBe('Free Forever is limited to 10 customers. Upgrade your plan in Settings → Subscriptions to add more.');
    expect(freeTierLimitMessage({ resource: 'job_cards', limit: 5 }))
      .toBe('Free Forever is limited to 5 jobs this month. Upgrade your plan in Settings → Subscriptions to add more.');
  });
});
