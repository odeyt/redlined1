# Writing Tests

## Conventions

### File location
Each module gets its own spec file: `tests/<module>/<module>.spec.ts`

### Test IDs
Use descriptive names — no numeric IDs. Bad: `test('TC-042')`. Good: `test('creates customer with valid phone')`.

### Tagging
- `@smoke` — must pass before any deployment
- `@visual` — screenshot comparison
- `@cross-browser` — run on firefox + webkit
- `@mobile` — mobile viewport

Add tags to test title: `test('dashboard loads @smoke', ...)`

### Test data
Always prefix with `[TEST]`:
```typescript
import { fixtures } from '../fixtures';
await nameInput.fill(fixtures.customer.name); // "[TEST] Auto Test Customer"
```

Never use real shop data (customer names, phone numbers, VINs, invoice amounts).

### Selectors
Prefer in order:
1. `page.getByRole('button', { name: /add customer/i })` — semantic
2. `page.locator('#email')` — stable ID
3. `page.locator('[data-testid="submit"]')` — explicit test hook
4. Text content — acceptable for nav
5. CSS class — last resort

### Assertions
Always assert the important outcome, not implementation details:
```typescript
// Good
await expect(page.locator(`text=${fixtures.customer.name}`)).toBeVisible();

// Bad
await expect(page.locator('.customer-list-item:nth-child(1)')).toBeVisible();
```

### Timeouts
Use `{ timeout: 10_000 }` for async UI operations (data loads, network).
Default Playwright timeout is set to 10s in `playwright.config.ts`.

### Skip gracefully
When a feature is behind a feature flag:
```typescript
const btn = page.locator('button', { hasText: /some feature/i });
if (!(await btn.isVisible({ timeout: 3_000 }).catch(() => false))) {
  test.skip();
  return;
}
```

## Example test

```typescript
test('creates a job card with complaint text', async ({ page }) => {
  await page.goto('/');
  await navigateTo(page, 'Job');

  await page.click('text=+ Create Job Card');

  const complaint = page.locator('textarea[name*="complaint" i]').first();
  await expect(complaint).toBeVisible({ timeout: 8_000 });
  await complaint.fill('[TEST] Brake noise on deceleration');

  await page.click('button:has-text("Save")');

  await expect(page.locator('text=[TEST] Brake noise')).toBeVisible({ timeout: 10_000 });
});
```
