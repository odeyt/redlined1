/**
 * What actually changed.
 *
 * Saving a form without editing anything used to write the row and record an
 * audit event — twice in a row during testing, both rows showing the same
 * name before and after. Neither is wrong exactly, but a log full of no-op
 * updates is harder to read than one that only carries real changes, and the
 * whole value of the audit trail is that somebody can scan it later and see
 * what happened.
 *
 * So: compare first, write only the difference, and skip the write entirely
 * when there is none.
 */

/**
 * Value equality that copes with the shapes these records hold.
 *
 * Arrays and objects (customer tags, invoice line items) need comparing by
 * content, not identity — a re-parsed jsonb column is never the same object as
 * the one it came from. Null and empty string are treated as the same, because
 * the database stores an untouched optional field as NULL while a form hands
 * back '', and calling that a change would defeat the point.
 */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) {
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * The subset of `next` that differs from `current`.
 *
 * Keys absent from `next` are left alone — a partial update says nothing about
 * the fields it omits, which is different from saying they should be cleared.
 */
export function changedFields<T extends Record<string, unknown>>(
  current: T | null | undefined,
  next: Partial<T>,
): Partial<T> {
  if (!current) return next;   // nothing to compare against: treat as changed
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(next) as [keyof T, T[keyof T]][]) {
    if (value === undefined) continue;
    if (!isSameValue(current[key], value)) out[key] = value;
  }
  return out;
}

/** True when a partial update would change nothing. */
export function isNoOp<T extends Record<string, unknown>>(
  current: T | null | undefined,
  next: Partial<T>,
): boolean {
  if (!current) return false;
  return Object.keys(changedFields(current, next)).length === 0;
}
