/**
 * Dedicated schema-level tests for the JobIdSchema fix: job_cards.id is a
 * `text primary key` populated as `JC-${Date.now()}` (services/jobCardService.ts
 * createJobCard), NOT a UUID. The schema previously required `.uuid()`
 * format, which rejected every real job id with a 400 in production. These
 * tests pin down the corrected boundary directly, independent of any
 * specific route.
 */
import { JobIdSchema } from '../schemas';

function accepts(value: string): boolean {
  return JobIdSchema.safeParse(value).success;
}

describe('JobIdSchema', () => {
  describe('accepts real job_cards.id values', () => {
    it('accepts the actual production id format: JC-<epoch-ms>', () => {
      expect(accepts('JC-1737158234567')).toBe(true);
    });

    it('accepts other alphanumeric/dash/underscore id shapes', () => {
      expect(accepts('JC-1')).toBe(true);
      expect(accepts('job_card_001')).toBe(true);
      expect(accepts('ABC123')).toBe(true);
      expect(accepts('a')).toBe(true);
    });

    it('still accepts a UUID (format is a subset of the allowed charset)', () => {
      expect(accepts('11111111-1111-4111-8111-111111111111')).toBe(true);
    });

    it('trims surrounding whitespace before validating', () => {
      const result = JobIdSchema.safeParse('  JC-1737158234567  ');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe('JC-1737158234567');
    });
  });

  describe('rejects invalid input', () => {
    it('rejects an empty string', () => {
      expect(accepts('')).toBe(false);
    });

    it('rejects a whitespace-only string', () => {
      expect(accepts('   ')).toBe(false);
      expect(accepts('\t\n')).toBe(false);
    });

    it('rejects an oversized value (over 200 chars)', () => {
      expect(accepts('JC-' + '1'.repeat(200))).toBe(false);
    });

    it('accepts exactly at the 200-char boundary', () => {
      expect(accepts('A'.repeat(200))).toBe(true);
    });

    it('rejects path-like values (directory traversal shape)', () => {
      expect(accepts('../../etc/passwd')).toBe(false);
      expect(accepts('JC-1/../../secret')).toBe(false);
      expect(accepts('a/b/c')).toBe(false);
      expect(accepts('/JC-1')).toBe(false);
    });

    it('rejects punctuation-injection-shaped values', () => {
      expect(accepts("JC-1'; DROP TABLE job_cards; --")).toBe(false);
      expect(accepts('<script>alert(1)</script>')).toBe(false);
      expect(accepts('JC-1"><img src=x>')).toBe(false);
      expect(accepts('JC-1;shopId=other')).toBe(false);
      expect(accepts('JC-1&admin=true')).toBe(false);
      expect(accepts('JC-1?')).toBe(false);
      expect(accepts('JC 1')).toBe(false); // embedded space
    });

    it('rejects other malformed values', () => {
      // A *trailing* newline is indistinguishable from trailing whitespace
      // once `.trim()` runs (matches the intentional "trims surrounding
      // whitespace" behavior tested above) — the real control-character
      // check is an *embedded* one, which trim cannot remove.
      expect(accepts('JC\n-1')).toBe(false); // embedded newline
      expect(accepts('JC\0-1')).toBe(false); // embedded null byte
      expect(accepts('☃')).toBe(false); // non-ASCII
      expect(accepts('JC-1 OR 1=1')).toBe(false);
    });

    it('rejects non-string input shapes', () => {
      expect(JobIdSchema.safeParse(12345).success).toBe(false);
      expect(JobIdSchema.safeParse(null).success).toBe(false);
      expect(JobIdSchema.safeParse(undefined).success).toBe(false);
      expect(JobIdSchema.safeParse(['JC-1']).success).toBe(false);
      expect(JobIdSchema.safeParse({ id: 'JC-1' }).success).toBe(false);
    });
  });
});
