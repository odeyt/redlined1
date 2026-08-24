/**
 * The provider key must not be anywhere except `process.env`.
 *
 * This runs in CI rather than being a one-off scan, because the risk is not
 * that the key is committed today — it is that someone pastes it into a
 * fixture six weeks from now to make a test pass, and nobody notices.
 *
 * The operator's key was shown in a provider dashboard screenshot. It never
 * reached this session, is not in this repository, and should be **rotated**
 * if that screenshot was of the live production key.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SCAN_DIRS = ['lib', 'app', 'features', 'services', 'scripts', 'docs', 'tests', 'config'];
const SCAN_EXT = /\.(ts|tsx|js|mjs|md|json|sql|ya?ml)$/;
const SKIP_DIR = /node_modules|\.next|coverage|\.git|test-results|playwright-report/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    if (SKIP_DIR.test(full)) continue;
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(full)) out.push(full);
  }
  return out;
}

const read = (f: string) => readFileSync(f, 'utf8');
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');

// This scanner names the very patterns it forbids, so it excludes itself.
// Nothing else is exempt.
/** A literal that says out loud it is not a real secret. */
const SAFE_LITERAL = /not-a-real-secret|test-key|example|placeholder|dummy|xxxx/i;

const SELF = 'lib/parts/__tests__/secretHygiene.test.ts';
const FILES = SCAN_DIRS.flatMap(d => walk(join(ROOT, d))).filter(f => rel(f) !== SELF);

describe('the AutoPartsAPI key never leaves the environment', () => {
  it('is only ever read through process.env', () => {
    const offenders: string[] = [];
    // Code only. Documentation naming the variable — to say where it lives, or
    // to forbid a NEXT_PUBLIC form — is the docs doing their job, and the
    // "plausible key" scan below still covers prose.
    for (const f of FILES.filter(x => /\.(ts|tsx|js|mjs)$/.test(x))) {
      const src = read(f);
      if (!src.includes('AUTOPARTS_API_KEY')) continue;
      for (const line of src.split(/\r?\n/)) {
        if (!line.includes('AUTOPARTS_API_KEY')) continue;
        const viaEnv = /process\.env\.AUTOPARTS_API_KEY/.test(line);
        // A bare mention in prose, a status label, or an env-file example.
        const isMention = /^[\s*/#|-]/.test(line) || /['"`]AUTOPARTS_API_KEY['"`]/.test(line)
          || /AUTOPARTS_API_KEY[:=]\s*$/.test(line.trim())
          || /AUTOPARTS_API_KEY\s*$/.test(line.trim());
        // An assignment to a literal is the thing we are hunting — unless the
        // literal announces itself as fake. A test needs SOME value, and a
        // real-looking one still fails here.
        const literal = line.match(/AUTOPARTS_API_KEY\s*=\s*['"`]([^'"`\s]{8,})['"`]/)?.[1];
        const assignsLiteral = Boolean(literal) && !SAFE_LITERAL.test(literal!);
        if (assignsLiteral || (!viaEnv && !isMention)) offenders.push(`${rel(f)}: ${line.trim().slice(0, 100)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no NEXT_PUBLIC variant anywhere', () => {
    // A NEXT_PUBLIC_ variable is inlined into the browser bundle. There is no
    // safe way to put a provider secret in one.
    const offenders = FILES
      .filter(f => /NEXT_PUBLIC_AUTOPARTS/.test(read(f)))
      // The docs may name it in order to forbid it.
      .filter(f => !/^docs\//.test(rel(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('the client sends it as a header, never in a URL', () => {
    const src = read(join(ROOT, 'lib/parts/providers/autopartsapi/client.ts'));
    expect(src).toContain("'x-apiprofile-key': key");
    // No template that puts the key into a path or query string.
    expect(src).not.toMatch(/[?&][A-Za-z_]+=\$\{key\}/);
    expect(src).not.toMatch(/\$\{key\}[^`]*\/\//);
  });

  it('constructs the auth header in exactly one place', () => {
    // Duplicated header construction is how one call site forgets the
    // timeout, or sends the key somewhere it should not go.
    const builders = FILES.filter(f => /['"]x-apiprofile-key['"]\s*:/.test(read(f)))
      .map(rel)
      .filter(f => !f.includes('__tests__'));
    expect(builders).toEqual(['lib/parts/providers/autopartsapi/client.ts']);
  });

  it('no fixture, test or doc carries a plausible provider key', () => {
    // A long opaque token sitting next to an apiprofile reference.
    const suspicious: string[] = [];
    for (const f of FILES) {
      const src = read(f);
      if (!/apiprofile|autoparts/i.test(src)) continue;
      for (const line of src.split(/\r?\n/)) {
        const m = line.match(/['"`]([A-Za-z0-9_\-]{28,})['"`]/);
        if (!m) continue;
        // Known-safe: the obviously-fake key used by the unit tests.
        if (SAFE_LITERAL.test(m[1])) continue;
        suspicious.push(`${rel(f)}: ${m[1].slice(0, 12)}…`);
      }
    }
    expect(suspicious).toEqual([]);
  });
});

describe('provider secrets stay server-side', () => {
  it('every provider module is server-only', () => {
    // `import "server-only"` turns a client import into a BUILD error rather
    // than a runtime leak.
    const modules = [
      'lib/parts/providers/ebay.ts',
      'lib/parts/providers/amazon.ts',
      'lib/parts/providers/autopartsapi/client.ts',
      'lib/parts/providers/autopartsapi/provider.ts',
      'lib/parts/providerRegistry.ts',
      'lib/parts/partsService.ts',
      'lib/parts/cache.ts',
    ];
    for (const m of modules) {
      expect(read(join(ROOT, m)).startsWith("import 'server-only'")).toBe(true);
    }
  });

  it('no client component imports a provider module', () => {
    const clientFiles = FILES.filter(f => /\.tsx$/.test(f) && /^['"]use client['"]/.test(read(f).trim()));
    const offenders = clientFiles
      .filter(f => /from '@\/lib\/parts\/(providers|providerRegistry|partsService|cache)/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
