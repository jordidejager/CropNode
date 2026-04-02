-- ============================================
-- 036: Unified Alias System
-- Merge product_aliases, fertilizer_aliases, and hardcoded aliases
-- into one product_aliases_unified table
-- ============================================

CREATE TABLE IF NOT EXISTS product_aliases_unified (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_type TEXT DEFAULT 'name' CHECK (alias_type IN ('name', 'werkzame_stof', 'typo', 'abbreviation', 'merknaam')),
  source TEXT DEFAULT 'system' CHECK (source IN ('system', 'manual', 'user_correction', 'migrated')),
  confidence NUMERIC DEFAULT 1.0,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive unique constraint on alias
CREATE UNIQUE INDEX IF NOT EXISTS idx_pau_alias_unique ON product_aliases_unified (lower(alias));
CREATE INDEX IF NOT EXISTS idx_pau_product_id ON product_aliases_unified(product_id);
CREATE INDEX IF NOT EXISTS idx_pau_alias_trgm ON product_aliases_unified USING GIN(alias gin_trgm_ops);

-- RLS
ALTER TABLE product_aliases_unified ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read pau" ON product_aliases_unified FOR SELECT USING (true);
CREATE POLICY "Allow authenticated write pau" ON product_aliases_unified FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update pau" ON product_aliases_unified FOR UPDATE USING (true);

-- ============================================
-- Migrate from product_aliases (CTGB aliases)
-- ============================================
INSERT INTO product_aliases_unified (product_id, alias, alias_type, source, confidence)
SELECT
  p.id,
  pa.alias,
  CASE
    WHEN pa.alias = ANY(cp.werkzame_stoffen) THEN 'werkzame_stof'
    ELSE 'name'
  END,
  'migrated',
  pa.confidence
FROM product_aliases pa
JOIN ctgb_products cp ON cp.naam = pa.official_name
JOIN products p ON p.source = 'ctgb' AND p.source_id = cp.toelatingsnummer
ON CONFLICT (lower(alias)) DO NOTHING;

-- ============================================
-- Migrate from fertilizer_aliases
-- ============================================
INSERT INTO product_aliases_unified (product_id, alias, alias_type, source, confidence)
SELECT
  p.id,
  fa.alias,
  'name',
  'migrated',
  fa.confidence
FROM fertilizer_aliases fa
JOIN fertilizers f ON f.name = fa.official_name
JOIN products p ON p.source = 'fertilizer' AND p.source_id = f.id
ON CONFLICT (lower(alias)) DO NOTHING;

-- ============================================
-- Migrate hardcoded PRODUCT_ALIASES from product-aliases.ts
-- These are the ~170 static mappings (werkzame stof → merknaam, typos, etc.)
-- ============================================

-- Fungicides - werkzame stoffen
INSERT INTO product_aliases_unified (product_id, alias, alias_type, source)
SELECT p.id, vals.alias, vals.alias_type, 'system'
FROM (VALUES
  -- Werkzame stof → product mappings
  ('captan', 'Merpan Spuitkorrel', 'werkzame_stof'),
  ('merpan', 'Merpan Spuitkorrel', 'name'),
  ('dithianon', 'Delan Pro', 'werkzame_stof'),
  ('delan', 'Delan Pro', 'name'),
  ('difenoconazool', 'Score 250 EC', 'werkzame_stof'),
  ('score', 'Score 250 EC', 'name'),
  ('boscalid', 'Bellis', 'werkzame_stof'),
  ('bellis', 'Bellis', 'name'),
  ('pyraclostrobin', 'Bellis', 'werkzame_stof'),
  ('pyrimethanil', 'Scala', 'werkzame_stof'),
  ('scala', 'Scala', 'name'),
  ('fludioxonil', 'Geoxe', 'werkzame_stof'),
  ('geoxe', 'Geoxe', 'name'),
  ('cyprodinil', 'Chorus', 'werkzame_stof'),
  ('chorus', 'Chorus', 'name'),
  ('trifloxystrobin', 'Flint', 'werkzame_stof'),
  ('flint', 'Flint', 'name'),
  ('fluopyram', 'Luna Sensation', 'werkzame_stof'),
  ('luna sensation', 'Luna Sensation', 'name'),
  ('luna', 'Luna Sensation', 'name'),
  ('fenhexamid', 'Teldor', 'werkzame_stof'),
  ('teldor', 'Teldor', 'name'),
  ('tebuconazool', 'Folicur', 'werkzame_stof'),
  ('folicur', 'Folicur', 'name'),
  ('thiophanaat-methyl', 'Topsin M', 'werkzame_stof'),
  ('topsin', 'Topsin M', 'name'),
  ('topsin m', 'Topsin M', 'name'),
  ('dodine', 'Syllit', 'werkzame_stof'),
  ('syllit', 'Syllit', 'name'),
  ('penconazool', 'Topaz 100 EC', 'werkzame_stof'),
  ('topaz', 'Topaz 100 EC', 'name'),
  ('mefentrifluconazool', 'Belanty FL', 'werkzame_stof'),
  ('belanty', 'Belanty FL', 'name'),
  ('zwavel', 'Kumulus S', 'werkzame_stof'),
  ('kumulus', 'Kumulus S', 'name'),
  ('kresoxim-methyl', 'Stroby WG', 'werkzame_stof'),
  ('stroby', 'Stroby WG', 'name'),
  -- Insecticiden
  ('spinosad', 'Tracer', 'werkzame_stof'),
  ('tracer', 'Tracer', 'name'),
  ('pirimicarb', 'Pirimor', 'werkzame_stof'),
  ('pirimor', 'Pirimor', 'name'),
  ('lambda-cyhalothrin', 'Karate Zeon', 'werkzame_stof'),
  ('karate', 'Karate Zeon', 'name'),
  ('karate zeon', 'Karate Zeon', 'name'),
  ('deltamethrin', 'Decis', 'werkzame_stof'),
  ('decis', 'Decis', 'name'),
  ('spirotetramat', 'Movento', 'werkzame_stof'),
  ('movento', 'Movento', 'name'),
  ('indoxacarb', 'Steward', 'werkzame_stof'),
  ('steward', 'Steward', 'name'),
  ('chlorantraniliprole', 'Coragen', 'werkzame_stof'),
  ('coragen', 'Coragen', 'name'),
  ('flonicamid', 'Teppeki', 'werkzame_stof'),
  ('teppeki', 'Teppeki', 'name'),
  ('acetamiprid', 'Gazelle', 'werkzame_stof'),
  ('gazelle', 'Gazelle', 'name'),
  ('abamectine', 'Vertimec', 'werkzame_stof'),
  ('vertimec', 'Vertimec', 'name'),
  ('methoxyfenozide', 'Runner', 'werkzame_stof'),
  ('runner', 'Runner', 'name'),
  -- Acariciden
  ('spirodiclofen', 'Envidor', 'werkzame_stof'),
  ('envidor', 'Envidor', 'name'),
  ('hexythiazox', 'Nissorun', 'werkzame_stof'),
  ('nissorun', 'Nissorun', 'name'),
  -- Veelgemaakte spelfouten
  ('scoor', 'Score 250 EC', 'typo'),
  ('merspan', 'Merpan Spuitkorrel', 'typo'),
  ('kapatn', 'Merpan Spuitkorrel', 'typo'),
  ('belles', 'Bellis', 'typo'),
  ('tepeki', 'Teppeki', 'typo'),
  ('tepekki', 'Teppeki', 'typo'),
  ('delaan', 'Delan Pro', 'typo')
) AS vals(alias, product_name, alias_type)
JOIN ctgb_products cp ON cp.naam = vals.product_name
JOIN products p ON p.source = 'ctgb' AND p.source_id = cp.toelatingsnummer
ON CONFLICT (lower(alias)) DO NOTHING;

-- ============================================
-- Migrate hardcoded fertilizer cache aliases
-- ============================================
INSERT INTO product_aliases_unified (product_id, alias, alias_type, source)
SELECT p.id, vals.alias, 'name', 'system'
FROM (VALUES
  ('omnical', 'Chelal Omnical'),
  ('chelal calcium', 'Chelal Omnical'),
  ('chelal az', 'Chelal AZ'),
  ('chelal sporenelementen', 'Chelal AZ'),
  ('chelal borium', 'Chelal B'),
  ('borium', 'Chelal B'),
  ('boor', 'Chelal B'),
  ('chelal boor zink', 'Chelal BZn'),
  ('chelal ijzer', 'Chelal Fe'),
  ('chelal mangaan', 'Chelal Mn'),
  ('chelal magnesium', 'Chelal Mg'),
  ('chelal koper', 'Chelal Cu'),
  ('kappa', 'Kappa V'),
  ('bitterzout', 'Bittersalz'),
  ('magnesiumsulfaat', 'Bittersalz'),
  ('mkp', 'Monokalifosfaat'),
  ('mono kali fosfaat', 'Monokalifosfaat'),
  ('zink sulfaat', 'Zinksulfaat'),
  ('ureumbladvoeding', 'Ureum'),
  ('calcimax', 'CalciMax'),
  ('calin', 'Calin W'),
  ('stimuplant', 'Stimuplant Vitaal'),
  ('selectyc', 'Selectyc X'),
  ('alsupre', 'Alsupre S'),
  ('fosanit', 'Fosanit Cu'),
  ('map', 'Monoammoniumfosfaat'),
  ('toptrace', 'TopTrace Alimento'),
  ('kas', 'Kalkammonsalpeter (KAS)'),
  ('kalkammonsalpeter', 'Kalkammonsalpeter (KAS)'),
  ('kali 60', 'Kalizout 60'),
  ('kalizout', 'Kalizout 60'),
  ('patentkali', 'Patentkali'),
  ('tsp', 'Tripel Superfosfaat'),
  ('tripel super', 'Tripel Superfosfaat'),
  ('kalksalpeter', 'Kalksalpeter'),
  ('kieseriet', 'Kieseriet'),
  ('dolokal', 'Dolokal'),
  ('epso combitop', 'EPSO Combitop'),
  ('epso top', 'EPSO Top'),
  ('wuxal calcium', 'Wuxal Calcium'),
  ('wuxal top k', 'Wuxal Top K'),
  ('wuxal borium', 'Wuxal Borium')
) AS vals(alias, product_name)
JOIN fertilizers f ON f.name = vals.product_name
JOIN products p ON p.source = 'fertilizer' AND p.source_id = f.id
ON CONFLICT (lower(alias)) DO NOTHING;
