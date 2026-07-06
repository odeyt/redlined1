# CI Integration

## Recommended workflow

Run smoke tests on every PR, full suite on merge to staging branch.

### GitHub Actions example

```yaml
name: E2E Tests

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

jobs:
  smoke:
    name: Smoke tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:smoke
        env:
          TEST_BASE_URL:         ${{ secrets.STAGING_URL }}
          TEST_OWNER_EMAIL:      ${{ secrets.TEST_OWNER_EMAIL }}
          TEST_OWNER_PASSWORD:   ${{ secrets.TEST_OWNER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: smoke-report
          path: tests/reports/

  full-regression:
    name: Full E2E suite
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/staging'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:ci
        env:
          TEST_BASE_URL:         ${{ secrets.STAGING_URL }}
          TEST_OWNER_EMAIL:      ${{ secrets.TEST_OWNER_EMAIL }}
          TEST_OWNER_PASSWORD:   ${{ secrets.TEST_OWNER_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/reports/
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-screenshots
          path: tests/screenshots/
```

## Secrets to configure

| Secret               | Value                              |
|----------------------|------------------------------------|
| STAGING_URL          | https://your-app.vercel.app        |
| TEST_OWNER_EMAIL     | staging owner account email        |
| TEST_OWNER_PASSWORD  | staging owner account password     |

Never use production credentials in CI.
