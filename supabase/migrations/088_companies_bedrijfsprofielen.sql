-- Bedrijfsprofielen: meerdere bedrijven per teler (bijv. maatschap + B.V.).
-- Gedeelde afspraak met StoreNode (zelfde Supabase-project): namen niet wijzigen.
--
--   public.companies            — bedrijven per teler, precies één is_default per user_id
--   public.parcels.company_id   — NULL = standaardbedrijf van de teler (geen migratie van percelen nodig)
--   sub_parcels                 — geen eigen kolom: volgen altijd het hoofdperceel
--   public.default_company_id(user_id)  — id van het standaardbedrijf
--   public.v_parcel_companies   — per hoofdperceel het effectieve bedrijf
--   public.v_sprayable_parcels  — kreeg kolom company_id (effectief, via hoofdperceel)
-- Alleen toevoegen; idempotent.

-- 1. Tabel ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'NL',
  ggn TEXT DEFAULT '',
  gln TEXT DEFAULT '',
  grower_number TEXT DEFAULT '',
  kvk TEXT DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_one_default_per_user ON public.companies(user_id) WHERE is_default;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can insert own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can update own companies" ON public.companies;
DROP POLICY IF EXISTS "Users can delete own companies" ON public.companies;
CREATE POLICY "Users can view own companies" ON public.companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own companies" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own companies" ON public.companies FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own companies" ON public.companies FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

-- 2. Koppeling perceel → bedrijf --------------------------------------------
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_parcels_company_id ON public.parcels(company_id);

-- 3. Standaardbedrijf voor elke bestaande teler -----------------------------
INSERT INTO public.companies (user_id, name, is_default)
SELECT u.id, COALESCE(NULLIF(btrim(pr.company_name), ''), 'Mijn bedrijf'), true
FROM auth.users u
LEFT JOIN public.profiles pr ON pr.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id = u.id AND c.is_default);

-- 4. Nieuwe accounts krijgen automatisch een standaardbedrijf ----------------
CREATE OR REPLACE FUNCTION public.create_default_company_for_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.companies (user_id, name, is_default)
  SELECT NEW.id, 'Mijn bedrijf', true
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id = NEW.id AND c.is_default);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_default_company ON auth.users;
CREATE TRIGGER trg_create_default_company AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_company_for_user();

-- Bij aanmaken van het profiel (registratie) de naam van het standaardbedrijf
-- overnemen, zolang de teler die nog niet zelf heeft aangepast.
CREATE OR REPLACE FUNCTION public.sync_default_company_name_from_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NULLIF(btrim(NEW.company_name), '') IS NOT NULL THEN
    UPDATE public.companies SET name = btrim(NEW.company_name)
    WHERE user_id = NEW.user_id AND is_default AND name = 'Mijn bedrijf';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_default_company_name ON public.profiles;
CREATE TRIGGER trg_sync_default_company_name AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_default_company_name_from_profile();

-- 5. Helpers voor CropNode én StoreNode --------------------------------------
CREATE OR REPLACE FUNCTION public.default_company_id(p_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM public.companies WHERE user_id = p_user_id AND is_default LIMIT 1
$$;

CREATE OR REPLACE VIEW public.v_parcel_companies WITH (security_invoker = on) AS
SELECT p.id AS parcel_id,
       p.user_id,
       p.company_id,                                   -- zoals opgeslagen (NULL = standaard)
       COALESCE(p.company_id, dc.id) AS effective_company_id,
       c.name AS company_name
FROM public.parcels p
LEFT JOIN public.companies dc ON dc.user_id = p.user_id AND dc.is_default
LEFT JOIN public.companies c ON c.id = COALESCE(p.company_id, dc.id);

GRANT SELECT ON public.v_parcel_companies TO authenticated, service_role;

-- v_sprayable_parcels: zelfde definitie + company_id (effectief) als laatste kolom.
CREATE OR REPLACE VIEW public.v_sprayable_parcels WITH (security_invoker = on) AS
 SELECT sp.id,
        CASE
            WHEN p.name IS NOT NULL AND sp.name IS NOT NULL AND sp.name <> ''::text THEN concat(p.name, ' ', sp.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'::text), ')')
            WHEN p.name IS NOT NULL THEN concat(p.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'::text), ')')
            WHEN sp.name IS NOT NULL AND sp.name <> ''::text THEN concat(sp.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'::text), ')')
            ELSE concat(COALESCE(sp.crop, 'Perceel'::text), ' ', COALESCE(sp.variety, ''::text), ' - ', "left"(sp.id, 8))
        END AS name,
    sp.area,
    sp.crop,
    sp.variety,
    p.id AS parcel_id,
    p.name AS parcel_name,
    p.location,
    p.geometry,
    p.source,
    p.rvo_id,
    sp.synonyms,
    sp.created_at,
    sp.updated_at,
    sp.user_id,
    COALESCE(p.company_id, dc.id) AS company_id
   FROM sub_parcels sp
     LEFT JOIN parcels p ON sp.parcel_id = p.id
     LEFT JOIN public.companies dc ON dc.user_id = COALESCE(p.user_id, sp.user_id) AND dc.is_default
  ORDER BY (COALESCE(p.name, sp.name, sp.crop)), sp.name;
