-- 080_knowledge_product_profile.sql
--
-- Per-middel encyclopedie-dossiers, complementair aan knowledge_disease_profile.
--
-- Bevat alles wat een teler over één middel wil weten:
--   - werkzame stof, type (fungicide/insecticide/groeiregulator/...)
--   - doelorganismen (waar werkt 't tegen)
--   - nevenwerking (bonus-effect op andere ziektes/plagen)
--   - resistentiegroep (FRAC/IRAC) + afwisseling
--   - optimale spuitomstandigheden (temp, RH, wind, deltaT, tijd-van-dag)
--   - watervolume + watergevoeligheid
--   - tankmix-compatibel/incompatibel
--   - BBCH-range + gevoelige rassen
--
-- Plus voegt image_urls toe aan zowel disease- als product-profile zodat de
-- encyclopedie-detailpagina foto's kan tonen.
--
-- Idempotent — safe to re-run.

-- ============================================
-- 1. knowledge_product_profile
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_product_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificatie
  product_name TEXT NOT NULL UNIQUE,             -- "Scala", "Movento", "GA4/7"
  active_substance TEXT,                         -- "pyrimethanil"
  product_type TEXT,                             -- fungicide | insecticide | acaricide | groeiregulator | bladmeststof | bioagens
  resistance_group TEXT,                         -- FRAC of IRAC code: "M4", "9", "23"
  aliases TEXT[] NOT NULL DEFAULT '{}',          -- ["Pyrus"] — synoniemen voor lookup

  -- Toepassingsgebied
  crops TEXT[] NOT NULL DEFAULT '{}',            -- {appel, peer}
  target_organisms TEXT[] NOT NULL DEFAULT '{}', -- {schurft, vruchtboomkanker} — primair doel
  side_effects TEXT[] NOT NULL DEFAULT '{}',     -- {meeldauw, monilia} — nevenwerking
  bbch_min INT,                                  -- vroegste BBCH-stadium
  bbch_max INT,                                  -- laatste BBCH-stadium
  sensitive_varieties TEXT[] NOT NULL DEFAULT '{}', -- rassen die fytotoxisch reageren

  -- Spuitomstandigheden (optimaal — alle nullable, alleen invullen als bekend)
  optimal_temp_min NUMERIC(4, 1),                -- °C
  optimal_temp_max NUMERIC(4, 1),
  optimal_humidity_min INT,                      -- %
  optimal_humidity_max INT,
  wind_speed_max_ms NUMERIC(3, 1),               -- m/s — drift-limit
  delta_t_min NUMERIC(3, 1),                     -- min (te koud = trage opname)
  delta_t_max NUMERIC(3, 1),                     -- max (te droog = verdamping)
  preferred_time_of_day TEXT,                    -- "ochtend" | "avond" | "ochtend/avond" | "niet midden op de dag"
  rain_fastness_hours INT,                       -- minimaal regenvrij na bespuiting

  -- Water + applicatie
  water_volume_l_per_ha INT,                     -- aanbevolen watervolume
  water_volume_notes TEXT,                       -- "minimaal 500 L bij volwas gewas", etc.
  water_sensitivity TEXT,                        -- "gevoelig" | "neutraal" | "tolerant" — voor verdunning/penetratie
  ph_range TEXT,                                 -- "pH 5-7 in spuittank"

  -- Tankmix
  tank_mix_compatible TEXT[] NOT NULL DEFAULT '{}',   -- combineerbaar met
  tank_mix_incompatible TEXT[] NOT NULL DEFAULT '{}', -- mag NIET samen
  tank_mix_notes TEXT,                           -- "vooral nooit met koper", etc.

  -- Strategie / advies
  strategy_summary TEXT,                         -- kort 2-3 zinnen "wat is dit middel"
  application_advice TEXT,                       -- praktisch advies voor toepassing
  resistance_management TEXT,                    -- afwissel-advies, max per seizoen
  alternatives TEXT[] NOT NULL DEFAULT '{}',     -- product-namen van alternatieven

  -- Veiligheid + restricties
  safety_interval_days INT,                      -- VGT in dagen
  max_applications_per_year INT,
  beneficials_impact TEXT,                       -- effect op natuurlijke vijanden
  bee_safety TEXT,                               -- "veilig" | "niet tijdens bloei" | "gevaarlijk"

  -- Foto's (voor encyclopedie display)
  image_urls TEXT[] NOT NULL DEFAULT '{}',

  -- Kwaliteit / herkomst
  source_article_count INT NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'gemiddeld', -- hoog | gemiddeld | laag
  notes TEXT,                                    -- vrij veld voor edge cases

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpp_type ON knowledge_product_profile(product_type);
CREATE INDEX IF NOT EXISTS idx_kpp_crops ON knowledge_product_profile USING GIN(crops);
CREATE INDEX IF NOT EXISTS idx_kpp_target ON knowledge_product_profile USING GIN(target_organisms);
CREATE INDEX IF NOT EXISTS idx_kpp_side ON knowledge_product_profile USING GIN(side_effects);
CREATE INDEX IF NOT EXISTS idx_kpp_aliases ON knowledge_product_profile USING GIN(aliases);

-- ============================================
-- 2. Add image_urls to knowledge_disease_profile
-- ============================================
-- Voor de encyclopedie-detailpagina van een ziekte/plaag. Wordt
-- backfilled vanuit knowledge_articles.image_urls van gelinkte artikelen
-- (zie scripts/backfill-profile-images.ts).

ALTER TABLE knowledge_disease_profile
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

-- ============================================
-- 3. Helper-functie: merge aliases zonder duplicaten
-- ============================================
-- Hergebruik van helper uit migratie 079, maar voor productprofile.
-- We droppen de oude functie niet — maken een naam-specifieke variant
-- zodat de twee onafhankelijk kunnen evolueren.

CREATE OR REPLACE FUNCTION kpp_merge_aliases(existing TEXT[], additions TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY(
    SELECT DISTINCT unnest(COALESCE(existing, ARRAY[]::TEXT[]) || COALESCE(additions, ARRAY[]::TEXT[]))
  );
$$;

-- ============================================
-- 4. updated_at trigger op product_profile
-- ============================================

CREATE OR REPLACE FUNCTION kpp_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kpp_updated_at_trigger ON knowledge_product_profile;
CREATE TRIGGER kpp_updated_at_trigger
  BEFORE UPDATE ON knowledge_product_profile
  FOR EACH ROW EXECUTE FUNCTION kpp_touch_updated_at();

-- ============================================
-- 5. RLS: read-public, write service-role
-- ============================================

ALTER TABLE knowledge_product_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpp_read_published ON knowledge_product_profile;
CREATE POLICY kpp_read_published ON knowledge_product_profile
  FOR SELECT TO authenticated USING (true);
