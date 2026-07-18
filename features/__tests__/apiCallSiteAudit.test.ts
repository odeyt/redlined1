/**
 * Static call-site audit: proves the actual website request code — not
 * just the API routes themselves — supplies a Supabase bearer token to
 * every protected endpoint, and that the one intentionally public endpoint
 * (GET /api/job-status by token) is NOT gated behind auth. This is a
 * regression guard for exactly the class of bug found in this security
 * review: a UI call site quietly missing the Authorization header.
 *
 * Reads the real source files rather than rendering the components — this
 * repo's jest config runs under testEnvironment 'node' with no
 * jsdom/React Testing Library set up, so this is the realistic option that
 * doesn't require standing up a whole new component-test harness.
 */
import fs from 'fs';
import path from 'path';

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

const PROTECTED_ENDPOINTS = ['/api/invite', '/api/members', '/api/job-status', '/api/job-notify'];

function linesCallingEndpoint(src: string, endpoint: string): string[] {
  // Case-insensitive so this catches both `fetch(` and `authedFetch(`.
  return src.split('\n').filter((line) => line.toLowerCase().includes('fetch(') && line.includes(endpoint));
}

describe('call-site audit — protected endpoints must be called via authedFetch', () => {
  it('AccessView.tsx imports authedFetch/AuthSessionError from lib/apiClient', () => {
    const src = readSource('features/access/AccessView.tsx');
    expect(src).toMatch(/import\s*\{[^}]*authedFetch[^}]*\}\s*from\s*'@\/lib\/apiClient'/);
  });

  it('AccessView.tsx routes every /api/invite and /api/members call through authedFetch', () => {
    const src = readSource('features/access/AccessView.tsx');
    for (const endpoint of ['/api/invite', '/api/members']) {
      const lines = linesCallingEndpoint(src, endpoint);
      expect(lines.length).toBeGreaterThan(0); // sanity: the call site still exists
      for (const line of lines) {
        expect(line).toContain('authedFetch(');
      }
    }
  });

  it('JobCardsView.tsx imports authedFetch/AuthSessionError from lib/apiClient', () => {
    const src = readSource('features/job-cards/JobCardsView.tsx');
    expect(src).toMatch(/import\s*\{[^}]*authedFetch[^}]*\}\s*from\s*'@\/lib\/apiClient'/);
  });

  it('JobCardsView.tsx routes every /api/job-status and /api/job-notify call through authedFetch', () => {
    const src = readSource('features/job-cards/JobCardsView.tsx');
    for (const endpoint of ['/api/job-status', '/api/job-notify']) {
      const lines = linesCallingEndpoint(src, endpoint);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toContain('authedFetch(');
      }
    }
  });

  it('InspectionsView.tsx (predates lib/apiClient.ts) still attaches a Bearer header to its /api/members call', () => {
    const src = readSource('features/inspections/InspectionsView.tsx');
    const lines = linesCallingEndpoint(src, '/api/members');
    expect(lines.length).toBeGreaterThan(0);
    expect(src).toMatch(/Authorization:\s*`Bearer \$\{token\}`/);
  });

  it('the public repair-status tracker page calls GET /api/job-status WITHOUT any Authorization header — it must stay usable by anonymous customers', () => {
    const src = readSource('app/status/[token]/page.tsx');
    const lines = linesCallingEndpoint(src, '/api/job-status');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain('authedFetch(');
    }
    expect(src).not.toMatch(/Authorization/);
  });

  it('sanity check: the detection itself has teeth — a raw fetch() call would fail this assertion', () => {
    const syntheticBadSource = `
      async function handleInvite() {
        const res = await fetch('/api/invite', { method: 'POST' });
      }
    `;
    const lines = linesCallingEndpoint(syntheticBadSource, '/api/invite');
    expect(lines.length).toBeGreaterThan(0);
    expect(() => {
      for (const line of lines) expect(line).toContain('authedFetch(');
    }).toThrow();
  });
});
