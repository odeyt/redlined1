-- Minimal stand-ins for the tables the Free Forever cap touches.
-- ONLY for the throwaway container used by tests/db/run-free-tier-db-tests.mjs.
-- Does not prove compatibility with the full production schema.
--
-- Deliberately contains NO cap function and NO cap triggers: production and
-- staging had neither, and the migration under test must install them itself.
-- The only triggers here are UNRELATED audit triggers, to prove the migration
-- leaves other triggers alone.
CREATE TABLE public.shops (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL);
CREATE TABLE public.shop_users (
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (shop_id, user_id)
);
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT,
  trial_ends_at TIMESTAMPTZ
);
CREATE TABLE public.customers (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, shop_id UUID REFERENCES public.shops(id), name TEXT);
CREATE TABLE public.vehicles  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), shop_id UUID REFERENCES public.shops(id), label TEXT);
CREATE TABLE public.job_cards (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, shop_id UUID REFERENCES public.shops(id),
                               check_in_date TIMESTAMPTZ NOT NULL DEFAULT now());

-- Application role inserts, exactly as PostgREST would present it.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customers, public.vehicles, public.job_cards TO authenticated;

-- Unrelated triggers that must survive the migration untouched.
CREATE TABLE public.audit_log (tbl TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE FUNCTION public.audit_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_log (tbl) VALUES (TG_TABLE_NAME);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit AFTER INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.audit_insert();
CREATE TRIGGER trg_audit AFTER INSERT ON public.vehicles  FOR EACH ROW EXECUTE FUNCTION public.audit_insert();
CREATE TRIGGER trg_audit AFTER INSERT ON public.job_cards FOR EACH ROW EXECUTE FUNCTION public.audit_insert();
