# Performance Budgets

Playwright performance tests enforce maximum load times for key views.
Tests fail if a page exceeds its budget.

## Current budgets

| View / Endpoint   | Budget  |
|-------------------|---------|
| Dashboard         | 3,000ms |
| Customers list    | 3,000ms |
| Job Cards list    | 3,000ms |
| Estimates list    | 3,000ms |
| /api/health       | 2,000ms |

Budgets are measured from navigation start to `networkidle` state.

## Running

```bash
npx playwright test tests/performance/ --project=chromium
```

## Adjusting budgets

Edit `tests/performance/performance.spec.ts`:

```typescript
const BUDGET_MS = {
  dashboard: 3000, // increase only with justification
  customers: 3000,
  ...
};
```

Document the reason in a comment if a budget must be raised.

## Interpreting failures

A budget failure usually means:
1. A new API call was added without pagination
2. A large dataset is being loaded client-side
3. An N+1 query was introduced

Use the Playwright trace viewer to identify the slow network call:
```bash
npx playwright show-report tests/reports/html
```
