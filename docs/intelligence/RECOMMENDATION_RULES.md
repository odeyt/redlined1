# Recommendation Rules

All rules are deterministic. No AI. No external calls. Each rule evaluates a `RecommendationContext` (containing signals) and returns a `RecommendationRuleResult` or `null` if the rule doesn't apply.

## Registered Rules

| # | Key | Category | Trigger | Priority |
|---|---|---|---|---|
| 1 | `unpaid_invoices` | unpaid_invoices | unpaid_invoice_count > 0 | high if > 3, else medium |
| 2 | `stale_estimates` | estimates | stale_estimate_count > 0 (> 3 days open) | medium |
| 3 | `approved_estimate_not_scheduled` | operations | open estimates > 0 AND open jobs = 0 | medium |
| 4 | `completed_job_not_invoiced` | revenue | completed_not_invoiced_count > 0 | high |
| 5 | `low_inventory` | inventory | low_inventory_count > 0 | high if > 5, else medium |
| 6 | `stuck_repair_order` | operations | stuck_job_count > 0 (> 2 days same stage) | high if > 2, else medium |
| 7 | `declined_estimate_winback` | customer_followup | declined_estimate_count > 0 | low |
| 8 | `inactive_customers` | customer_followup | inactive_customer_count > 0 | low |
| 9 | `repair_intelligence_missing` | repair_intelligence | completed jobs today, no repair cases | low |
| 10 | `revenue_dip` | revenue | today < yesterday by > 30% | high if > 50%, else medium |

## Adding a New Rule

1. Create a `RecommendationRule` object in `intelligence/rules/RuleRegistry.ts`
2. Add it to `ALL_RULES`
3. Add the needed signal to `SignalExtractor.ts` if not already present
4. Document it in this file

## Rule Contract

```typescript
interface RecommendationRule {
  key: string;
  evaluate(ctx: RecommendationContext): RecommendationRuleResult | null;
}
```

Return `null` if the rule should not fire. The engine handles `null` gracefully — it simply skips that rule.

## Privacy Rules

Rules must NEVER include:
- Customer name, phone, email, address
- VIN numbers
- Invoice amounts with PII attached
- Any data that identifies an individual
