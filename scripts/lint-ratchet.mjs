/**
 * Lint debt must not grow.
 *
 * The gate was broken for some time (`next lint` was removed in Next 16, and
 * the FlatCompat shim threw on ESLint 9), so 180 errors and 168 warnings
 * accumulated unseen. Fixing them all is a hundred-file change; pretending
 * they are not there by disabling rules would be worse. This does the third
 * thing: freezes the number and fails when it rises.
 *
 * It compares ERROR count only. Warnings are tracked for information but do
 * not fail, because the largest warning category is unused variables, which is
 * noisy during refactors and never breaks anything at runtime.
 *
 * Usage:
 *   node scripts/lint-ratchet.mjs           # fail if errors exceed the baseline
 *   node scripts/lint-ratchet.mjs --update  # re-freeze after genuinely fixing some
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ESLint } from 'eslint';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, 'lint-baseline.json');

// ESLint's own API rather than spawning `npx eslint`. Shelling out needed
// shell:true on Windows to reach npx.cmd, which Node now warns about as
// unescaped-argument injection, and spawning the .cmd directly fails EINVAL on
// Node 26. Calling the linter in-process sidesteps both and is faster.
const results = await new ESLint({ cwd: join(HERE, '..') }).lintFiles(['.']);
let errors = 0, warnings = 0;
const byRule = {};
for (const file of results) {
  for (const m of file.messages) {
    if (m.severity === 2) errors++; else warnings++;
    const key = (m.severity === 2 ? 'error' : 'warn') + ':' + (m.ruleId ?? 'unknown');
    byRule[key] = (byRule[key] ?? 0) + 1;
  }
}

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, JSON.stringify({ errors, warnings, byRule }, null, 2) + '\n');
  console.log('baseline updated: ' + errors + ' errors, ' + warnings + ' warnings');
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
console.log('errors   ' + errors + '  (baseline ' + baseline.errors + ')');
console.log('warnings ' + warnings + '  (baseline ' + baseline.warnings + ')');

if (errors > baseline.errors) {
  console.error('\nLint errors increased by ' + (errors - baseline.errors) + '.');
  // Name the rules that grew, so the failure points somewhere.
  for (const [rule, count] of Object.entries(byRule)) {
    const was = baseline.byRule[rule] ?? 0;
    if (rule.startsWith('error:') && count > was) {
      console.error('  ' + rule.slice(6) + ': ' + was + ' -> ' + count);
    }
  }
  console.error('\nFix them, or if the increase is genuinely unavoidable, re-freeze with --update and say why in the commit.');
  process.exit(1);
}

if (errors < baseline.errors) {
  console.log('\n' + (baseline.errors - errors) + ' fewer errors than the baseline. Re-freeze with --update.');
}
