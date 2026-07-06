# Running Tests

## Prerequisites

1. Browser binaries installed:
   ```bash
   npx playwright install --with-deps chromium
   ```

2. App running locally or staging URL set:
   ```bash
   export TEST_BASE_URL=https://your-staging.vercel.app
   ```

3. Test credentials set:
   ```bash
   export TEST_OWNER_EMAIL=owner@shop.com
   export TEST_OWNER_PASSWORD=password123
   ```

## Commands

| Command                  | What it runs                              |
|--------------------------|-------------------------------------------|
| `npm run test:e2e`       | Full suite, chromium, headless            |
| `npm run test:smoke`     | @smoke tagged tests only                  |
| `npm run test:visual`    | Screenshot baseline tests                 |
| `npm run test:headed`    | Full suite, browser visible               |
| `npm run test:ci`        | Full suite + JUnit reporter for CI        |

## Viewing results

After a run:
```bash
npx playwright show-report tests/reports/html
```

Or visit the Testing Dashboard in the app (owner only) after:
```bash
npm run test:e2e
```

## CI integration

Add to your CI pipeline:
```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run test:ci
  env:
    TEST_BASE_URL: ${{ secrets.STAGING_URL }}
    TEST_OWNER_EMAIL: ${{ secrets.TEST_OWNER_EMAIL }}
    TEST_OWNER_PASSWORD: ${{ secrets.TEST_OWNER_PASSWORD }}
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: tests/reports/
```
