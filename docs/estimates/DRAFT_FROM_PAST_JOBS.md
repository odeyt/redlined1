# Draft estimates from past jobs

Owner decision (2026-11-27): estimate drafting starts from the shop's own history, **no AI**.
Available to any shop, behind `estimate_drafting` (**off by default**).

## What staff see

On the estimate form, next to **Search Parts**: **📋 Draft from past jobs**. It opens a list of
lines from this shop's past estimates for the same make and model with similar work:

- price, quantity and currency as last charged, with the Lao description if it had one
- "In N past estimates: EST-…", so staff can see why each line is there
- lines seen in more than one past estimate are pre-ticked

Staff tick what applies and press **Add**. The lines go in like any other line and can be edited
or deleted. Nothing is saved until the estimate is saved.

## How it matches

`lib/estimates/draftFromHistory.ts` (pure, unit-tested):

1. **Vehicle:** make/model words from the label (year, plate, VIN ignored). A past estimate must
   contain at least 60% of them, so "Toyota Hilux" needs both words; a Fortuner is not a Hilux.
2. **Work:** words from the linked job card's service type and notes (the triage complaint
   summary), minus filler. A past estimate must share at least one with its line descriptions.
   No job card linked → matches on vehicle alone.
3. **Weighting:** approved/converted > sent > draft > declined; the last 12 months count more.
   Voided estimates and the estimate being edited are never used.
4. **Lines:** the top 8 matched estimates' lines, grouped by description; blank and unpriced
   lines skipped; most common first; priced from the most recent estimate that had it. Max 12.

Reads up to the 1,500 most recent estimates of the shop plus any location merged into it.

## Turn on

1. Run `supabase/migrations/2026-11-27_estimate_drafting.sql` (seeds the flag OFF).
2. Settings → Feature Flags → `estimate_drafting` ON. The global switch turns it on for every
   shop; for one shop only, add a `scope='shop'` row for that shop id instead.

## Later: AI on top

If Grok is added later, the owner has approved sending the complaint/notes, make/model/year and
past line prices — never customer names, phones or VINs. Not built.
