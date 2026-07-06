# Visual Regression Testing

Playwright compares screenshots against stored baselines. Any pixel difference above
the configured threshold (2%) fails the test.

## First run — create baselines

```bash
npm run test:visual
```

On first run, no snapshots exist — Playwright creates them. Commit the snapshots:

```bash
git add tests/visual.spec.ts-snapshots/
git commit -m "chore: add visual regression baselines"
```

## Updating baselines (after intentional UI changes)

```bash
npx playwright test --project=visual --update-snapshots
```

Then review the diff, commit the new snapshots.

## Snapshot storage

Snapshots are stored at:
```
tests/visual/visual.spec.ts-snapshots/
```

Organized by OS and browser automatically by Playwright.

## Thresholds

| View            | maxDiffPixelRatio |
|-----------------|-------------------|
| Dashboard       | 2%                |
| Customers       | 2%                |
| Job Cards       | 2%                |
| System Health   | 3% (live data)    |
| Settings        | 2%                |

Increase thresholds only for views with live/dynamic data (timestamps, counters).
