# Meta limitations affecting WhatsApp Business App coexistence

Read from Meta's developer documentation on 2026-10-19. Meta revises these pages often, so recheck them before onboarding.

## On the WhatsApp Business App (shop phone) after connecting

| Area | Effect |
|---|---|
| Broadcast lists | Existing lists become **read-only**; new ones cannot be created |
| Disappearing messages, view-once, live location (1:1) | **Turned off** |
| Linked devices | **All companion devices are unlinked once** at onboarding. Up to 4 can be re-linked. **WhatsApp for Windows and WearOS are not supported**. Messages sent from them are not mirrored to the API (error 131060). |
| Editing / revoking messages | Now supported |
| Chats, contacts, 1:1 messages | Keep working; 1:1 messages are mirrored between the app and the API |
| Primary phone inactivity | Meta disconnects the API side after about **14 days** without the app being opened on the primary phone (`PRIMARY_INACTIVITY`); companions after about 30 days |

## What the Cloud API side cannot do (stays in the app only)

Group chats, voice/video calls, catalog/orders/status, marketing messages, quick replies, labels and similar tools, business profile editing, Channels.

## Messaging rules

- **Business-initiated messages must be approved templates.** RedlineD1 only sends three UTILITY templates (estimate ready, invoice ready, repair update), each in English and Lao. Templates are reviewed per WhatsApp Business Account and can be paused or rejected for quality.
- **Customer service window:** it opens only when the customer messages the business *after* onboarding. Messages typed in the Business App neither open nor extend the API window. RedlineD1 does not rely on the window, because it always sends templates.
- **Throughput** is fixed at **20 messages/second** for coexistence numbers.
- **Messaging limits** (unique customers per 24 h) start low for new or unverified businesses and rise with quality and volume. Business verification raises them.
- **Quality rating**: blocks and reports from customers lower it, and a low rating can restrict sending. Settings shows the current rating on Verify.

## Onboarding constraints

- Coexistence is available **only through Embedded Signup run by a Tech Provider or Solution Partner**. D1/RedlineD1's Meta app must have that status (App Review for Advanced Access), or a BSP that supports coexistence must be used instead.
- **Embedded Signup v2 and v3 were deprecated on 2026-10-15**; only v4 is used.
- WhatsApp Business App **2.24.17+** is required.
- **Countries:** Meta does not publish an exclusion list. Partner documentation reports Nigeria and South Africa as excluded; Laos (+856) is not reported. The Embedded Signup screen is the final authority.
- **History and contact sync:** optional, one time only, within **24 hours** of onboarding. History covers 1:1 chats only (no groups) and media only from the most recent 14 days. RedlineD1 **does not import chat history or contacts**. Conversations stay in the app.
- A **payment method** must be added in WhatsApp Manager.
- `/deregister` is not allowed while the number is in coexistence. Offboarding is done in the app (Settings → Account → Business Platform → Disconnect).
- A business that previously used another partner's credit line may see an error when switching partners.

## Pricing

- Messages typed in the WhatsApp Business App stay **free**.
- Template messages sent by RedlineD1 through the Cloud API are **charged by Meta** at Cloud API rates (per message, by category and country), billed to the WhatsApp Business Account's payment method, not through RedlineD1 billing.
- RedlineD1's own entitlement is prepared but **not live**. It would be included in Professional/Business/Enterprise, with a paid add-on for Solo/Starter (`config/whatsappEntitlements.ts`). It is not purchasable while `NEXT_PUBLIC_BILLING_ENABLED=false`. D1 Imports is internal and always entitled.

## Known RedlineD1 limitation found while building this

**Portal visibility across the merge.** The customer portal lists a customer's documents only in the customer's *own* shop (`lib/portal/loadPortal.ts`). Since the merge, a returning D1 customer's record is in the archived D1 shop, but their *new* invoices and estimates are created in the active merged shop. The portal link would not show those documents, so RedlineD1 **refuses** to send them by WhatsApp (`portal_link_unavailable`) instead of sending a misleading link. Historical D1 documents and documents for customers created after the merge are not affected. Fixing the portal to read the merged scope is a separate change. Repair-update messages (job cards) have no link and are not affected.
