-- ============================================
-- 049: Structured Knowledge Tables (Laag 1)
--
-- Three tables that extract structured relationships from the 1970
-- knowledge articles. These enable DIRECT lookups (no vector search needed)
-- for the most common query patterns:
--   "Welk middel tegen schurft?" → knowledge_product_advice
--   "Vertel over perenbladvlo" → knowledge_disease_profile
--   "Alternatieven voor Captan?" → knowledge_product_relations
-- ============================================

-- ============================================
-- Table 1: knowledge_product_advice
-- Per-row: one product × one disease/topic × one crop combination
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_product_advice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Product
  product_name TEXT NOT NULL,                    -- Commercial name: Captan, Scala, Movento
  active_substance TEXT,                         -- werkzame stof: captan, pyrimethanil
  resistance_group TEXT,                         -- FRAC/IRAC code: "9", "M4", "23"

  -- Target
  target_name TEXT NOT NULL,                     -- schurft, perenbladvlo, fruitmot, etc.
  target_type TEXT NOT NULL,                     -- ziekte | plaag | abiotisch | dunning | groeiregulatie

  -- Application
  crop TEXT NOT NULL,                            -- appel | peer | kers | pruim | blauwe_bes | beide
  dosage TEXT,                                   -- "1,8 kg/ha", "0,75 l/ha"
  application_type TEXT,                         -- preventief | curatief | beide | correctie
  timing TEXT,                                   -- "voor de regen", "binnen 48 uur na infectie"
  phenological_phases TEXT[] DEFAULT '{}',        -- {bloei, vruchtzetting}
  relevant_months INT[] DEFAULT '{}',            -- {4, 5, 6}

  -- Curative specifics
  curative_window_hours INT,                     -- max uren na infectie (48, 72, etc.)

  -- Extra context
  max_applications_per_year INT,
  safety_interval_days INT,                      -- veiligheidstermijn (VGT) in dagen
  notes TEXT,                                    -- combinatie-advies, resistentie-info, etc.
  country_restrictions TEXT,                     -- "niet tijdens bloei in NL", "alleen BE"

  -- Quality
  confidence TEXT DEFAULT 'hoog',
  source_article_count INT DEFAULT 1,            -- uit hoeveel artikelen geëxtraheerd

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Dedupe: one row per (product, target, crop, application_type)
  UNIQUE (product_name, target_name, crop, application_type)
);

CREATE INDEX IF NOT EXISTS idx_kpa_product ON knowledge_product_advice(product_name);
CREATE INDEX IF NOT EXISTS idx_kpa_target ON knowledge_product_advice(target_name);
CREATE INDEX IF NOT EXISTS idx_kpa_crop ON knowledge_product_advice(crop);
CREATE INDEX IF NOT EXISTS idx_kpa_type ON knowledge_product_advice(application_type);
CREATE INDEX IF NOT EXISTS idx_kpa_active ON knowledge_product_advice(active_substance);
CREATE INDEX IF NOT EXISTS idx_kpa_phases ON knowledge_product_advice USING GIN(phenological_phases);
CREATE INDEX IF NOT EXISTS idx_kpa_months ON knowledge_product_advice USING GIN(relevant_months);

ALTER TABLE knowledge_product_advice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read kpa" ON knowledge_product_advice;
CREATE POLICY "Public read kpa" ON knowledge_product_advice FOR SELECT USING (true);

-- ============================================
-- Table 2: knowledge_disease_profile
-- One row per disease/pest — the "dossier" with summary, lifecycle, key facts
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_disease_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL UNIQUE,                     -- schurft, perenbladvlo, fruitmot
  latin_name TEXT,                               -- Venturia inaequalis
  profile_type TEXT NOT NULL,                    -- ziekte | plaag | abiotisch

  -- Affected crops
  crops TEXT[] DEFAULT '{}',                     -- {appel, peer}

  -- Summary
  description TEXT,                              -- 2-3 zinnen wat het is
  symptoms TEXT,                                 -- hoe herkennen
  damage_impact TEXT,                            -- wat is de schade

  -- Lifecycle & timing
  peak_phases TEXT[] DEFAULT '{}',               -- {groen-puntje, muizenoor, bloei}
  peak_months INT[] DEFAULT '{}',                -- {3, 4, 5}
  lifecycle_notes TEXT,                          -- overwinteringsstrategie, generaties per jaar

  -- Strategy
  prevention_strategy TEXT,                      -- samenvatting preventieve aanpak
  curative_strategy TEXT,                        -- samenvatting curatieve aanpak
  biological_options TEXT,                       -- biologische alternatieven
  resistance_management TEXT,                    -- resistentie-afwisseling advies
  monitoring_advice TEXT,                        -- hoe waarnemen/monitoren

  -- Key products (top 5 per type)
  key_preventive_products TEXT[] DEFAULT '{}',
  key_curative_products TEXT[] DEFAULT '{}',

  -- Varieties
  susceptible_varieties TEXT[] DEFAULT '{}',     -- rassen die extra gevoelig zijn
  resistant_varieties TEXT[] DEFAULT '{}',        -- resistente rassen

  -- Quality
  source_article_count INT DEFAULT 0,
  confidence TEXT DEFAULT 'hoog',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kdp_type ON knowledge_disease_profile(profile_type);
CREATE INDEX IF NOT EXISTS idx_kdp_crops ON knowledge_disease_profile USING GIN(crops);

ALTER TABLE knowledge_disease_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read kdp" ON knowledge_disease_profile;
CREATE POLICY "Public read kdp" ON knowledge_disease_profile FOR SELECT USING (true);

-- ============================================
-- Table 3: knowledge_product_relations
-- Relationships between products: same substance, alternatives, resistance groups
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_product_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_a TEXT NOT NULL,
  product_b TEXT NOT NULL,

  relation_type TEXT NOT NULL,                   -- is_alias_van | zelfde_resistentiegroep | combineer_met | alternatief_voor | niet_combineren
  context TEXT,                                  -- bij welke ziekte/situatie geldt dit
  notes TEXT,                                    -- toelichting

  created_at TIMESTAMPTZ DEFAULT now(),

  -- One relation per pair per type
  UNIQUE (product_a, product_b, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_kpr_a ON knowledge_product_relations(product_a);
CREATE INDEX IF NOT EXISTS idx_kpr_b ON knowledge_product_relations(product_b);
CREATE INDEX IF NOT EXISTS idx_kpr_type ON knowledge_product_relations(relation_type);

ALTER TABLE knowledge_product_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read kpr" ON knowledge_product_relations;
CREATE POLICY "Public read kpr" ON knowledge_product_relations FOR SELECT USING (true);

-- ============================================
-- RPC: lookup_product_advice
-- Direct structured lookup for the RAG agent
-- ============================================

CREATE OR REPLACE FUNCTION lookup_product_advice(
  filter_target TEXT DEFAULT NULL,
  filter_product TEXT DEFAULT NULL,
  filter_crop TEXT DEFAULT NULL,
  filter_type TEXT DEFAULT NULL,
  filter_phase TEXT DEFAULT NULL,
  result_limit INT DEFAULT 20
)
RETURNS TABLE (
  product_name TEXT,
  active_substance TEXT,
  target_name TEXT,
  crop TEXT,
  dosage TEXT,
  application_type TEXT,
  timing TEXT,
  curative_window_hours INT,
  max_applications_per_year INT,
  safety_interval_days INT,
  notes TEXT,
  country_restrictions TEXT,
  resistance_group TEXT,
  source_article_count INT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.product_name, a.active_substance, a.target_name, a.crop,
    a.dosage, a.application_type, a.timing, a.curative_window_hours,
    a.max_applications_per_year, a.safety_interval_days, a.notes,
    a.country_restrictions, a.resistance_group, a.source_article_count
  FROM knowledge_product_advice a
  WHERE
    (filter_target IS NULL OR a.target_name ILIKE '%' || filter_target || '%')
    AND (filter_product IS NULL OR a.product_name ILIKE '%' || filter_product || '%')
    AND (filter_crop IS NULL OR a.crop = filter_crop OR a.crop = 'beide')
    AND (filter_type IS NULL OR a.application_type = filter_type)
    AND (filter_phase IS NULL OR filter_phase = ANY(a.phenological_phases))
  ORDER BY a.source_article_count DESC, a.product_name
  LIMIT result_limit;
END;
$$;

-- ============================================
-- RPC: get_disease_profile
-- ============================================

CREATE OR REPLACE FUNCTION get_disease_profile(disease_name TEXT)
RETURNS TABLE (
  name TEXT,
  latin_name TEXT,
  profile_type TEXT,
  crops TEXT[],
  description TEXT,
  symptoms TEXT,
  prevention_strategy TEXT,
  curative_strategy TEXT,
  biological_options TEXT,
  resistance_management TEXT,
  monitoring_advice TEXT,
  key_preventive_products TEXT[],
  key_curative_products TEXT[],
  susceptible_varieties TEXT[],
  resistant_varieties TEXT[],
  peak_phases TEXT[],
  peak_months INT[],
  source_article_count INT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.name, d.latin_name, d.profile_type, d.crops,
    d.description, d.symptoms,
    d.prevention_strategy, d.curative_strategy,
    d.biological_options, d.resistance_management, d.monitoring_advice,
    d.key_preventive_products, d.key_curative_products,
    d.susceptible_varieties, d.resistant_varieties,
    d.peak_phases, d.peak_months, d.source_article_count
  FROM knowledge_disease_profile d
  WHERE d.name ILIKE '%' || disease_name || '%'
  LIMIT 1;
END;
$$;

-- ============================================
-- RPC: get_product_relations
-- ============================================

CREATE OR REPLACE FUNCTION get_product_relations(product TEXT)
RETURNS TABLE (
  related_product TEXT,
  relation_type TEXT,
  context TEXT,
  notes TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT r.product_b, r.relation_type, r.context, r.notes
  FROM knowledge_product_relations r
  WHERE r.product_a ILIKE '%' || product || '%'
  UNION
  SELECT r.product_a, r.relation_type, r.context, r.notes
  FROM knowledge_product_relations r
  WHERE r.product_b ILIKE '%' || product || '%';
END;
$$;
