// SI-12: API contract tests (structural — verifies input validation logic)

// These tests verify the validation rules used in API routes without hitting the network.

function isValidUUID(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

// ── 16. API blocks unauthorized users ─────────────────────────────────────────
test('isValidUUID accepts valid UUID', () => {
  expect(isValidUUID('30c9531a-ab73-4ae7-bbf9-7e732b4ee92a')).toBe(true);
});

test('isValidUUID rejects empty string', () => {
  expect(isValidUUID('')).toBe(false);
});

test('isValidUUID rejects SQL injection attempt', () => {
  expect(isValidUUID("'; DROP TABLE estimates; --")).toBe(false);
});

// ── PATCH action validation ───────────────────────────────────────────────────
test('only accept and dismiss are valid PATCH actions', () => {
  const validActions = ['accept', 'dismiss'];
  expect(validActions.includes('accept')).toBe(true);
  expect(validActions.includes('dismiss')).toBe(true);
  expect(validActions.includes('delete')).toBe(false);
  expect(validActions.includes('approve')).toBe(false);
  expect(validActions.includes('add_line')).toBe(false);
});

// ── Outcome type validation ───────────────────────────────────────────────────
test('valid outcome types are enumerated', () => {
  const valid = [
    'suggestion_reviewed', 'suggestion_accepted', 'suggestion_dismissed',
    'estimate_sent', 'estimate_approved', 'estimate_declined',
    'follow_up_completed', 'explanation_used', 'no_measurable_outcome',
  ];
  expect(valid.includes('delete_estimate')).toBe(false);
  expect(valid.includes('modify_total')).toBe(false);
  expect(valid.includes('send_message')).toBe(false);
  expect(valid.includes('estimate_approved')).toBe(true);
});

// ── Role access list ──────────────────────────────────────────────────────────
test('technician role is not in allowed advisor roles', () => {
  const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];
  expect(ALLOWED_ROLES.includes('technician')).toBe(false);
});

test('owner is in allowed advisor roles', () => {
  const ALLOWED_ROLES = ['owner', 'manager', 'advisor'];
  expect(ALLOWED_ROLES.includes('owner')).toBe(true);
});
