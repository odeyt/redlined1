# Commercial Launch Plan — RedlineD1

## Overview
RedlineD1 is transitioning from internal D1 Imports tool to a worldwide commercial SaaS product.

## Architecture Principle
Creem is the first billing provider, but is fully abstracted behind `billingService.ts`.
No Creem-specific code exists outside `commercial/providers/creemProvider.ts`.

## Plans
| Plan | Monthly | Annual | Target |
|------|---------|--------|--------|
| Starter | $49 | $490 | Solo mechanics |
| Professional | $99 | $990 | Growing shops |
| Business | $199 | $1,990 | Multi-bay operations |
| Enterprise | Custom | Custom | Chains / dealer groups |

## Timeline (Recommended)
1. **Week 1**: Run DB migration, configure Creem in staging
2. **Week 2**: Test checkout + webhook end-to-end in staging
3. **Week 3**: Enable billing on production (disabled enforcement)
4. **Week 4**: Monitor first real payments
5. **Month 2**: Enable subscription enforcement after validation

## Risk Level: LOW
- All billing features are behind `NEXT_PUBLIC_BILLING_ENABLED=false`
- D1 internal shop workflows are completely unaffected
- Emergency rollback is a single env var change + redeploy
