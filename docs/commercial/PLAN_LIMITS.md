# Plan Limits

## Limits by Plan

| Limit | Starter | Professional | Business | Enterprise |
|-------|---------|-------------|----------|-----------|
| Users | 2 | 10 | 25 | Unlimited |
| Locations | 1 | 3 | 10 | Unlimited |
| Vehicles | 500 | 2,000 | Unlimited | Unlimited |
| Job Cards/mo | 200 | 1,000 | Unlimited | Unlimited |
| AI Credits/mo | 100 | 500 | 2,000 | Custom |
| Storage | 5 GB | 20 GB | 100 GB | Custom |
| Monthly Price | $49 | $99 | $199 | Contact sales |
| Annual Price | $490 | $990 | $1,990 | Contact sales |

## Enforcement

Limits are checked in `commercial/licensing/licenseService.ts`.

When `subscription_enforcement` feature flag is **false** (default):
- Limits are checked and logged to `license_checks` table
- No blocking occurs — advisory mode only

When `subscription_enforcement` is **true**:
- `allowed: false` results are returned to callers
- Callers must check and show appropriate UI (e.g. "Upgrade to add more users")

## Adding a New Limit Check

1. Add the check key to `LicenseCheckResult` in `commercial/shared/types.ts`
2. Add the function in `commercial/licensing/licenseService.ts`
3. Call `recordLicenseCheck()` after each check for audit trail
4. Call `checkLicense()` in the relevant API route or service
