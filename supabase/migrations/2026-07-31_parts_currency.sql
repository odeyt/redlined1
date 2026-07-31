-- ============================================================================
-- Parts inventory: per-part currency
--
-- Until now every amount in the parts module was formatted as USD in the UI
-- regardless of what the number meant, so LAK prices rendered as
-- "$89,470,168.00". This stores the currency each price was entered in.
--
-- Existing rows default to USD, which is exactly what the old hardcoded
-- formatting already assumed — so nothing changes visually until a part is
-- explicitly given a different currency.
--
-- Safe to rerun.
-- ============================================================================

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

-- Guard against typos / unsupported values reaching the UI, where an invalid
-- ISO 4217 code would make Intl.NumberFormat throw mid-render.
ALTER TABLE public.parts
  DROP CONSTRAINT IF EXISTS parts_currency_format;

ALTER TABLE public.parts
  ADD CONSTRAINT parts_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

-- Verify
SELECT currency, count(*) AS parts
FROM public.parts
GROUP BY currency
ORDER BY parts DESC;
