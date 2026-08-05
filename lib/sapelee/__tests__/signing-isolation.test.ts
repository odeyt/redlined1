import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Structural test mirroring Sapelee's own
 * tests/unit/service-role-isolation.test.ts: lib/sapelee/signing.ts holds
 * the raw HMAC secret and must never be imported from client-reachable
 * code (services/, components/, features/, app/**\/page.tsx) — only from
 * the specific server-side execution contexts it was built for.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const ALLOWED_IMPORTERS = new Set([
  path.join('lib', 'sapelee', 'flush.ts'),
  path.join('scripts', 'flush-sapelee-outbox.ts'),
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (['node_modules', '.next', '.git', 'coverage'].includes(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('sapelee signing isolation', () => {
  it('lib/sapelee/signing.ts is imported only from flush.ts and the flush script', () => {
    const searchRoots = ['app', 'lib', 'components', 'features', 'services', 'scripts'].map((d) =>
      path.join(REPO_ROOT, d)
    );
    const offenders: string[] = [];

    for (const root of searchRoots) {
      for (const file of walk(root)) {
        const relPath = path.relative(REPO_ROOT, file);
        if (relPath.endsWith(path.join('lib', 'sapelee', 'signing.ts'))) continue;
        const source = readFileSync(file, 'utf-8');
        if (/from ['"].*sapelee\/signing['"]/.test(source)) {
          if (!ALLOWED_IMPORTERS.has(relPath)) offenders.push(relPath);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('lib/sapelee/publish.ts (the client-callable entrypoint) never imports signing.ts', () => {
    const source = readFileSync(path.resolve(REPO_ROOT, 'lib/sapelee/publish.ts'), 'utf-8');
    expect(source).not.toMatch(/sapelee\/signing/);
  });
});
