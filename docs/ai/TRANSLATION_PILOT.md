# AI pilot — English ⇄ Lao line translation (Grok)

Owner-approved 2026-11-27 (RedlineD1 AI Proposal → "Decisions made"). This is the first
AI feature in product code. It is behind `ai_translation`, **off by default**.

| Decision | How it is enforced |
| --- | --- |
| D1's own shops only, not paying customers | `INTERNAL_SHOP_IDS` check in `lib/ai/requestGate.ts` **and** the flag. A flag switched on globally still cannot reach another tenant. |
| Grok now; Hermes or Anthropic later | `lib/ai/text/` — features call `getTextProvider()`; the vendor is one env var + one adapter file. |
| $20/month cap + usage meter | Every call is logged in `ai_usage_events` with xAI's reported cost. The month's total is checked before each call; at the cap AI pauses. Settings → **AI usage** shows spend, cap and call count. |
| No Lao reviewer | Staff see the translation in the line before saving and can edit it, as today. |
| Data sent: part/service text only | Only the line description is sent. Text that looks like a phone number or email is refused, VIN-shaped tokens are stripped, max 200 characters. No names, prices or vehicle data. |

## What staff see

The existing 🌐 button on estimate and invoice lines:

- **Flag off (every shop today):** unchanged. English → Lao through MyMemory.
- **Flag on (D1 shops):** English → Lao, or Lao → English when only the Lao box is filled, through
  Grok. If the AI gives nothing (cap reached, provider down, key missing), it falls back to
  MyMemory, so the button always does something.

Parts quotations' bulk translation still uses MyMemory (not part of this pilot).

## Setup (owner)

1. **Database:** run `supabase/migrations/2026-11-27_ai_translation_pilot.sql` in the Supabase SQL
   editor. The last query should say `ok` three times.
2. **Vercel env vars** (Production; never in source):
   - `XAI_API_KEY` — from console.x.ai. Set a spending limit there too, as a second safety net.
   - Optional: `XAI_MODEL` (default `grok-4.20-0309-non-reasoning`), `AI_MONTHLY_BUDGET_USD`
     (default `20`), `AI_TEXT_PROVIDER=off` (turns AI off; needs a redeploy — the flag is faster).
3. **Redeploy** so the env vars take effect.
4. **Turn on** `ai_translation` in Settings → Feature Flags. (Safe to use the global switch:
   the code still limits it to D1's shops.)
5. **Check:** open an estimate, type "Brake pads", press 🌐 → Lao appears. Settings → **AI usage**
   shows one call and a cost of a fraction of a cent.

Off switch: the flag. Rollback SQL removes the flag rows and the table (it refuses if the table
holds usage rows).

## Cost

`grok-4.20-0309-non-reasoning` lists at $1.25 / $2.50 per million input/output tokens
(docs.x.ai, 2026-11-27). One translation is ~100 tokens in, ~10 out — about $0.00015.
$20 is roughly 100,000 translations.

## Files

- `lib/ai/text/types.ts`, `providerFactory.ts`, `xaiProvider.ts` — provider layer + Grok adapter (Responses API)
- `lib/ai/translation.ts` — what may be sent, the prompt, cleaning the reply, direction
- `lib/ai/budget.ts` — cap, cost, month usage
- `lib/ai/requestGate.ts` — sign-in, internal shop, flag
- `app/api/ai/translate/route.ts`, `app/api/ai/usage/route.ts`
- `lib/ai/translateLine.ts` — the 🌐 button logic (browser)
- `features/settings/AiUsagePanel.tsx` — the meter
