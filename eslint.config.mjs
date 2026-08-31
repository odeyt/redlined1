/**
 * Flat config, called through eslint directly.
 *
 * Two things were broken at once, and each hid the other:
 *
 *   - `next lint` was removed in Next 16. `npm run lint` failed with
 *     "Invalid project directory provided, no such directory: REDLINE\lint",
 *     which reads like a path problem rather than a removed command.
 *   - The FlatCompat shim around the old `next/core-web-vitals` string threw
 *     "Converting circular structure to JSON" on ESLint 9, so even running
 *     eslint by hand did not work either.
 *
 * eslint-config-next 15+ ships real flat configs, so the compat layer is gone.
 *
 * Nothing here downgrades a rule to make the output look better. What is
 * excluded below is excluded because it is not this app's code, or because the
 * rule is wrong about the file rather than the file being wrong.
 */
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    // Defaults from eslint-config-next, which must be restated when overriding.
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',

    // Generated or downloaded output, never authored.
    'coverage/**',
    'playwright-report/**',
    'test-results/**',

    /**
     * Agent scratch: git worktrees created by coding sessions.
     *
     * `.next/**` above matches only the ROOT build. A worktree here holds its
     * own checkout, and once anything runs a build inside one it also holds
     * its own `.next` — which the linter then walks.
     *
     * The effect on the ratchet was not subtle: 180 errors became 4123 and
     * 168 warnings became 36283, with the growth in rules that only ever fire
     * on bundled code — no-this-alias 715, no-require-imports 1425,
     * no-empty-object-type 214. It read as a catastrophic regression in
     * hand-written source and was neither: no file changed since the
     * production baseline reports a single finding.
     *
     * A quality gate that can be broken by a parallel session building in a
     * sibling directory is not measuring this project.
     */
    '.claude/**',

    // A SEPARATE npm project (`redlined1-youtube-bot`) that happens to live in
    // this folder: its own package.json, its own dependencies, not imported by
    // the app and not part of the Next build. `next lint` never looked at it,
    // and bare `eslint` walking into it is a change in scope, not a finding.
    'youtube-bot/**',
  ]),

  {
    // Playwright fixtures take a parameter named `use` and call it. That is
    // not React's `use` hook, but the rule matches on the name and reports
    // every fixture as a hook called outside a component.
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  {
    // One-off Node generators and the dev server. These really are CommonJS —
    // they are run with `node`, not bundled — so no-require-imports is wrong
    // about the file rather than the file being wrong about modules.
    files: ['scripts/**/*.js', 'dev-server.js', '*.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
