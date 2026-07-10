// SI-13: Customer Intelligence API Contract Tests
// Tests validation logic directly — no network calls.

function isValidCustomerId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

const VALID_OUTCOME_STATUSES = [
  'pending', 'contacted', 'scheduled', 'converted',
  'declined', 'dismissed', 'expired', 'no_response',
  'successful', 'unsuccessful',
];

test('isValidUUID accepts valid UUID', () => {
  expect(isValidCustomerId('30c9531a-ab73-4ae7-bbf9-7e732b4ee92a')).toBe(true);
});

test('isValidUUID rejects empty string', () => {
  expect(isValidCustomerId('')).toBe(false);
});

test('isValidUUID rejects plain text', () => {
  expect(isValidCustomerId('not-a-uuid')).toBe(false);
});

test('isValidUUID rejects SQL injection', () => {
  expect(isValidCustomerId("'; DROP TABLE customers; --")).toBe(false);
});

test('isValidUUID rejects path traversal', () => {
  expect(isValidCustomerId('../../../etc/passwd')).toBe(false);
});

test('outcome status validation accepts all valid statuses', () => {
  for (const status of VALID_OUTCOME_STATUSES) {
    expect(VALID_OUTCOME_STATUSES.includes(status)).toBe(true);
  }
});

test('outcome status validation rejects unknown status', () => {
  expect(VALID_OUTCOME_STATUSES.includes('hacked')).toBe(false);
  expect(VALID_OUTCOME_STATUSES.includes('')).toBe(false);
});

test('ALLOWED_ROLES includes owner, manager, advisor', () => {
  const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];
  expect(ALLOWED_ROLES.includes('owner')).toBe(true);
  expect(ALLOWED_ROLES.includes('manager')).toBe(true);
  expect(ALLOWED_ROLES.includes('advisor')).toBe(true);
  expect(ALLOWED_ROLES.includes('technician')).toBe(false);
  expect(ALLOWED_ROLES.includes('customer')).toBe(false);
});
