# Acquisition conversion tracking

Configured 27 October 2026 for the existing RedlineD1 GA4 property 541423077, stream G-9QY4K8MZ1X.

## Events

| Event | Trigger | Fixed parameters |
| --- | --- | --- |
| sign_up | Successful email signup response containing a user identity | method=email, signup_stage=account_created |
| generate_lead | Accepted contact-sales request | page=contact_sales, lead_type=sales_inquiry |
| generate_lead | Accepted shop-audit request | page=shop_audit, lead_type=workflow_audit |
| generate_lead | Accepted walkthrough request (existing) | page=shop_owner_demo, lead_type=walkthrough |

The signup event measures account creation before email confirmation. It does not measure activation, a paid subscription, or a verified email address. Empty/missing identities are excluded because Supabase can return an obfuscated user for an existing account. The page counts signup at most once per mount. Analytics is best-effort browser measurement, not an authoritative count of unique accounts; blockers and repeated unconfirmed signup attempts can affect totals.

GA4 sign_up and generate_lead are marked as key events. No default monetary value is assigned. Existing purchase/qualified-lead settings are preserved. Clicks, form starts, rejected submissions and network failures do not trigger the new completion events.

No names, emails, shop names, passwords, account IDs or free-text messages are passed to these event calls. The existing Analytics helper queues events before the Google tag loads and absorbs failures so measurement cannot interrupt signup or lead submission.

## Verification

Component tests render the actual forms with mocked auth and HTTP responses. They check successful completion, failure, missing/empty identities, event timing and exact non-identifying parameters. The Analytics helper tests cover queuing and failure handling. No live test accounts or fake production leads are needed for those tests.

After release, use a legitimate signup or inquiry to check the event in GA4 Realtime/DebugView and normal reports. Creating a key event definition alone does not prove a real signup was collected. Key-event settings apply to future matching events; historical visits do not become signup conversions.

References:
- https://developers.google.com/analytics/devguides/collection/ga4/reference/events#sign_up
- https://supabase.com/docs/reference/javascript/auth-signup
