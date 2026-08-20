# Lint baseline

Frozen 2026-08-20 at **180 errors, 168 warnings**.

## Why there is a baseline at all

`npm run lint` did not lint anything for some time. Two failures hid each
other: `next lint` was removed in Next 16 (it failed with *"Invalid project
directory provided, no such directory: REDLINE\lint"*, which reads like a path
typo), and the `FlatCompat` shim around `next/core-web-vitals` threw
*"Converting circular structure to JSON"* on ESLint 9, so running `eslint` by
hand did not work either.

With the gate repaired, the accumulated findings became visible all at once.
Clearing them is a change across roughly a hundred production UI files, which
is its own piece of work with its own risk. Suppressing them by disabling rules
would put the gate back to lying. So the count is frozen and enforced instead.

## Enforcement

```
npm run lint          # see everything
npm run lint:ratchet  # fails if the ERROR count exceeds the baseline
```

The ratchet compares errors only. Warnings are recorded but do not fail: the
largest warning category is unused variables, which is noisy mid-refactor and
never breaks anything at runtime.

After genuinely fixing some, re-freeze with
`node scripts/lint-ratchet.mjs --update` and say why in the commit.

**Not wired into CI yet.** No workflow currently runs lint, and adding a
blocking step to the pipeline is a deliberate decision rather than a side
effect of repairing the linter. `npm run lint:ratchet` is ready to drop into
`preview-validation.yml` when that call is made.

## Classification

### Already fixed — the category that actually crashes a page

| Rule | Was | Now |
|---|---|---|
| `react-hooks/rules-of-hooks` | 10 | **0** |

Eight of those were in `CommandCenterView`, which called seven `useCallback`s
and a `useEffect` below an early `return`. `role` resolves asynchronously, so
the hook count changed between renders and React threw "Rendered fewer hooks
than during the previous render" — a white screen, on the default landing page
for owners and managers. The other two were Playwright fixtures whose parameter
is named `use`, a false positive now scoped out.

### Correctness — worth fixing, in this order

| Count | Rule | Why it matters |
|---|---|---|
| 65 | `react-hooks/set-state-in-effect` | setState during an effect; can cause extra render passes and, in the wrong shape, loops |
| 21 | `react-hooks/immutability` | mutating props or state directly; React may not re-render |
| 8 | `@next/next/no-html-link-for-pages` | `<a>` instead of `<Link>` forces a full page reload and drops client state |
| 6 | `@typescript-eslint/no-explicit-any` | type holes |
| 4 | `react-hooks/refs` | reading or writing a ref during render |
| 2 | `react-hooks/purity` | side effects in render |
| 2 | `react-hooks/error-boundaries` | error boundary misuse |
| 2 | `@next/next/no-assign-module-variable` | assigning to `module` |
| 1 | `@typescript-eslint/no-unsafe-function-type` | bare `Function` type |

Most of these are the React Compiler ruleset, which is stricter than what this
code was written against. They are real signals, but each needs reading in
context — a blanket autofix across a hundred files is how working screens break.

### Cosmetic debt — no runtime effect

| Count | Rule |
|---|---|
| 63 | `react/no-unescaped-entities` (apostrophes in JSX text) |
| 5 | `@typescript-eslint/no-require-imports` |
| 1 | `prefer-const` |
| 137 (warn) | `@typescript-eslint/no-unused-vars` |
| 14 (warn) | `react-hooks/exhaustive-deps` |
| 8 (warn) | `@next/next/no-img-element` |

## Scope decisions

Nothing was downgraded to improve the number. Three exclusions, each because
the rule is wrong about the file rather than the file being wrong:

- `youtube-bot/**` — a separate npm package (`redlined1-youtube-bot`) with its
  own `package.json`, not imported by the app and not in the Next build.
  `next lint` never looked at it.
- `scripts/**/*.js`, `dev-server.js` — genuinely CommonJS, run with `node` and
  never bundled, so `no-require-imports` does not apply.
- `tests/**` — Playwright fixtures take a parameter named `use`; the rule reads
  it as React's `use` hook called outside a component.
