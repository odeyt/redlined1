import { accountFingerprint } from '../fingerprint';

const ID = 'j0000001-0000-4000-8000-000000000000';
const OTHER = 'j0000002-0000-4000-8000-000000000000';

describe('accountFingerprint', () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  });

  it('has a fixed, opaque shape', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-a';
    expect(accountFingerprint(ID)).toMatch(/^ref-[0-9a-f]{10}$/);
  });

  it('is not a prefix or any other slice of the id', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-a';
    const digits = accountFingerprint(ID).slice(4);
    expect(ID.replace(/-/g, '')).not.toContain(digits);
    expect(ID.startsWith(digits.slice(0, 8))).toBe(false);
  });

  it('is deterministic for one id and distinct across ids', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-a';
    expect(accountFingerprint(ID)).toBe(accountFingerprint(ID));
    expect(accountFingerprint(ID)).not.toBe(accountFingerprint(OTHER));
  });

  it('depends on the server secret, so it cannot be recomputed from an id alone', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-a';
    const a = accountFingerprint(ID);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-b';
    expect(accountFingerprint(ID)).not.toBe(a);
  });

  it('never contains the secret', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-a';
    expect(accountFingerprint(ID)).not.toContain('test-key');
  });
});
