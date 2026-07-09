-- Shop Mirrors: allows one shop to see another shop's data (read mirroring)
-- Run this once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.shop_mirrors (
  shop_id        UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  mirror_shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (shop_id, mirror_shop_id),
  CHECK (shop_id <> mirror_shop_id)
);

-- Allow authenticated users to read their own shop's mirror config
ALTER TABLE public.shop_mirrors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_mirrors_read" ON public.shop_mirrors
  FOR SELECT TO authenticated
  USING (shop_id = ANY(public.my_shop_ids()));

CREATE POLICY "shop_mirrors_manage" ON public.shop_mirrors
  FOR ALL TO authenticated
  USING (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- TO LINK YOUR TWO SHOPS:
-- 1. Find your shop IDs by running:
--      SELECT id, name FROM public.shops;
--
-- 2. Then insert the mirror relationship (replace the UUIDs below):
--
--    INSERT INTO public.shop_mirrors (shop_id, mirror_shop_id)
--    VALUES
--      ('SHOP_1_UUID_HERE', 'SHOP_2_UUID_HERE'),
--      ('SHOP_2_UUID_HERE', 'SHOP_1_UUID_HERE')  -- bidirectional
--    ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
