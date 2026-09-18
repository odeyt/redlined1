/**
 * Bounds and allowlists for /api/admin/accounts query params.
 * These run before any query is built, so a malicious or malformed
 * page/pageSize/search/sortKey/status never reaches Supabase.
 */
import {
  clampPage, clampPageSize, sanitizeSearch, sanitizeSortKey, sanitizeSortDir, sanitizeStatusFilter,
} from '../accountsData';

describe('clampPage', () => {
  it('defaults to 1 for missing, zero, negative, or non-numeric input', () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage('not-a-number')).toBe(1);
  });

  it('floors fractional pages', () => {
    expect(clampPage('3.7')).toBe(3);
  });
});

describe('clampPageSize', () => {
  it('defaults to 25 for missing or invalid input', () => {
    expect(clampPageSize(undefined)).toBe(25);
    expect(clampPageSize('nonsense')).toBe(25);
    expect(clampPageSize(0)).toBe(25);
  });

  it('caps at 100 regardless of what the client requests', () => {
    expect(clampPageSize(100000)).toBe(100);
    expect(clampPageSize('999999')).toBe(100);
  });
});

describe('sanitizeSearch', () => {
  it('truncates to 100 characters', () => {
    const long = 'a'.repeat(500);
    expect(sanitizeSearch(long).length).toBe(100);
  });

  it('rejects non-string input rather than coercing it', () => {
    expect(sanitizeSearch(12345)).toBe('');
    expect(sanitizeSearch({ $ne: null })).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeSearch('   owner@example.com   ')).toBe('owner@example.com');
  });
});

describe('sanitizeSortKey', () => {
  it('allowlists known sort keys', () => {
    expect(sanitizeSortKey('name')).toBe('name');
    expect(sanitizeSortKey('email')).toBe('email');
  });

  it('falls back to created_at for anything not on the allowlist', () => {
    expect(sanitizeSortKey('plan; DROP TABLE profiles;--')).toBe('created_at');
    expect(sanitizeSortKey(undefined)).toBe('created_at');
    expect(sanitizeSortKey('billing_status')).toBe('created_at');
  });
});

describe('sanitizeSortDir', () => {
  it('only ever returns asc or desc', () => {
    expect(sanitizeSortDir('asc')).toBe('asc');
    expect(sanitizeSortDir('DESC')).toBe('desc');
    expect(sanitizeSortDir('garbage')).toBe('desc');
    expect(sanitizeSortDir(undefined)).toBe('desc');
  });
});

describe('sanitizeStatusFilter', () => {
  it('allowlists known status filters', () => {
    expect(sanitizeStatusFilter('past_due')).toBe('past_due');
    expect(sanitizeStatusFilter('billing_mismatch')).toBe('billing_mismatch');
  });

  it('falls back to all for anything unrecognized', () => {
    expect(sanitizeStatusFilter('admin')).toBe('all');
    expect(sanitizeStatusFilter(undefined)).toBe('all');
  });
});
