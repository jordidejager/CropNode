-- ============================================
-- COMPLETE SETUP SCRIPT - Run this in Supabase SQL Editor
-- No dependencies, no foreign keys, safe to run multiple times
-- ============================================

-- Step 1: Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- Table 1: Active Substances
-- ============================================

CREATE TABLE IF NOT EXISTS active_substances (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  cas_number TEXT,
  max_kg_per_year DECIMAL(10,4),
  max_applications_per_year INTEGER,
  max_kg_per_application DECIMAL(10,4),
  category TEXT,
  mode_of_action TEXT,
  resistance_group TEXT,
  status TEXT DEFAULT 'active',
  restriction_notes TEXT,
  source TEXT DEFAULT 'CTGB',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_substances_name ON active_substances(name);
CREATE INDEX IF NOT EXISTS idx_active_substances_cas ON active_substances(cas_number);
CREATE INDEX IF NOT EXISTS idx_active_substances_category ON active_substances(category);
CREATE INDEX IF NOT EXISTS idx_active_substances_status ON active_substances(status);

-- ============================================
-- Table 2: Product Substances (Junction Table)
-- NO foreign keys to avoid dependency issues
-- ============================================

CREATE TABLE IF NOT EXISTS product_substances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  substance_code TEXT NOT NULL,
  concentration DECIMAL(10,4),
  concentration_unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, substance_code)
);

CREATE INDEX IF NOT EXISTS idx_product_substances_product ON product_substances(product_id);
CREATE INDEX IF NOT EXISTS idx_product_substances_substance ON product_substances(substance_code);

-- ============================================
-- Table 3: Product Aliases
-- NO foreign keys to avoid dependency issues
-- ============================================

CREATE TABLE IF NOT EXISTS product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL UNIQUE,
  official_name TEXT NOT NULL,
  product_id TEXT,
  source TEXT DEFAULT 'manual',
  usage_count INTEGER DEFAULT 0,
  confidence DECIMAL(3,2) DEFAULT 1.0,
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_official ON product_aliases(official_name);
CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases(product_id);

-- ============================================
-- Row Level Security - Enable for all tables
-- ============================================

ALTER TABLE active_substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_aliases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe to run multiple times)
DROP POLICY IF EXISTS "Allow public read active_substances" ON active_substances;
DROP POLICY IF EXISTS "Allow authenticated insert active_substances" ON active_substances;
DROP POLICY IF EXISTS "Allow authenticated update active_substances" ON active_substances;
DROP POLICY IF EXISTS "Allow public read product_substances" ON product_substances;
DROP POLICY IF EXISTS "Allow authenticated insert product_substances" ON product_substances;
DROP POLICY IF EXISTS "Allow public read product_aliases" ON product_aliases;
DROP POLICY IF EXISTS "Allow authenticated insert product_aliases" ON product_aliases;
DROP POLICY IF EXISTS "Allow authenticated update product_aliases" ON product_aliases;

-- Create policies
CREATE POLICY "Allow public read active_substances" ON active_substances FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert active_substances" ON active_substances FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update active_substances" ON active_substances FOR UPDATE USING (true);

CREATE POLICY "Allow public read product_substances" ON product_substances FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert product_substances" ON product_substances FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read product_aliases" ON product_aliases FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert product_aliases" ON product_aliases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update product_aliases" ON product_aliases FOR UPDATE USING (true);

-- ============================================
-- Trigger for updated_at on product_aliases
-- ============================================

CREATE OR REPLACE FUNCTION update_product_aliases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_product_aliases_updated_at ON product_aliases;
CREATE TRIGGER update_product_aliases_updated_at
  BEFORE UPDATE ON product_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_product_aliases_updated_at();

-- ============================================
-- Seed Data: Active Substances
-- ============================================

INSERT INTO active_substances (code, name, name_en, category, max_applications_per_year) VALUES
  ('captan', 'Captan', 'Captan', 'Fungicide', 8),
  ('cyprodinil', 'Cyprodinil', 'Cyprodinil', 'Fungicide', 3),
  ('fludioxonil', 'Fludioxonil', 'Fludioxonil', 'Fungicide', 3),
  ('dithianon', 'Dithianon', 'Dithianon', 'Fungicide', 8),
  ('pyrimethanil', 'Pyrimethanil', 'Pyrimethanil', 'Fungicide', 4),
  ('boscalid', 'Boscalid', 'Boscalid', 'Fungicide', 3),
  ('pyraclostrobin', 'Pyraclostrobin', 'Pyraclostrobin', 'Fungicide', 3),
  ('trifloxystrobin', 'Trifloxystrobin', 'Trifloxystrobin', 'Fungicide', 3),
  ('difenoconazool', 'Difenoconazool', 'Difenoconazole', 'Fungicide', 3),
  ('tebuconazool', 'Tebuconazool', 'Tebuconazole', 'Fungicide', 3),
  ('fluopyram', 'Fluopyram', 'Fluopyram', 'Fungicide', 2),
  ('fenhexamid', 'Fenhexamid', 'Fenhexamid', 'Fungicide', 3),
  ('thiophanaat-methyl', 'Thiophanaat-methyl', 'Thiophanate-methyl', 'Fungicide', 2),
  ('spinosad', 'Spinosad', 'Spinosad', 'Insecticide', 3),
  ('pirimicarb', 'Pirimicarb', 'Pirimicarb', 'Insecticide', 2),
  ('lambda-cyhalothrin', 'Lambda-cyhalothrin', 'Lambda-cyhalothrin', 'Insecticide', 2),
  ('deltamethrin', 'Deltamethrin', 'Deltamethrin', 'Insecticide', 2),
  ('spirotetramat', 'Spirotetramat', 'Spirotetramat', 'Insecticide', 2),
  ('spirodiclofen', 'Spirodiclofen', 'Spirodiclofen', 'Acaricide', 1),
  ('hexythiazox', 'Hexythiazox', 'Hexythiazox', 'Acaricide', 1),
  ('indoxacarb', 'Indoxacarb', 'Indoxacarb', 'Insecticide', 3),
  ('chlorantraniliprole', 'Chlorantraniliprole', 'Chlorantraniliprole', 'Insecticide', 2)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  category = EXCLUDED.category,
  max_applications_per_year = EXCLUDED.max_applications_per_year,
  last_updated = NOW();

-- ============================================
-- Seed Data: Product Aliases
-- ============================================

INSERT INTO product_aliases (alias, official_name, source, confidence) VALUES
  -- Werkzame stof als alias
  ('captan', 'Merpan spuitkorrel', 'manual', 1.0),
  ('captaan', 'Merpan spuitkorrel', 'manual', 1.0),
  ('dithianon', 'Delan WG', 'manual', 1.0),
  ('pyrimethanil', 'Scala', 'manual', 1.0),
  ('boscalid', 'Bellis', 'manual', 1.0),
  ('trifloxystrobin', 'Flint', 'manual', 1.0),
  ('cyprodinil', 'Chorus', 'manual', 1.0),
  ('fluopyram', 'Luna Sensation', 'manual', 1.0),
  ('fenhexamid', 'Teldor', 'manual', 1.0),
  ('spirotetramat', 'Movento 150 OD', 'manual', 1.0),
  ('pirimicarb', 'Pirimor', 'manual', 1.0),
  ('lambda-cyhalothrin', 'Karate Zeon', 'manual', 1.0),
  ('deltamethrin', 'Decis EC', 'manual', 1.0),
  ('spinosad', 'Tracer', 'manual', 1.0),
  ('indoxacarb', 'Steward', 'manual', 1.0),
  ('spirodiclofen', 'Envidor', 'manual', 1.0),
  ('hexythiazox', 'Nissorun', 'manual', 1.0),
  ('clofentezine', 'Apollo 50 SC', 'manual', 1.0),
  ('bifenazaat', 'Floramite 240 SC', 'manual', 1.0),
  -- Korte namen
  ('merpan', 'Merpan spuitkorrel', 'manual', 1.0),
  ('delan', 'Delan WG', 'manual', 1.0),
  ('scala', 'Scala', 'manual', 1.0),
  ('bellis', 'Bellis', 'manual', 1.0),
  ('flint', 'Flint', 'manual', 1.0),
  ('chorus', 'Chorus', 'manual', 1.0),
  ('topsin', 'Topsin M', 'manual', 1.0),
  ('teldor', 'Teldor', 'manual', 1.0),
  ('switch', 'Switch', 'manual', 1.0),
  ('luna', 'Luna Sensation', 'manual', 1.0),
  ('calypso', 'Calypso', 'manual', 1.0),
  ('movento', 'Movento 150 OD', 'manual', 1.0),
  ('pirimor', 'Pirimor', 'manual', 1.0),
  ('karate', 'Karate Zeon', 'manual', 1.0),
  ('decis', 'Decis EC', 'manual', 1.0),
  ('tracer', 'Tracer', 'manual', 1.0),
  ('steward', 'Steward', 'manual', 1.0),
  ('runner', 'Runner', 'manual', 1.0),
  ('envidor', 'Envidor', 'manual', 1.0),
  ('nissorun', 'Nissorun', 'manual', 1.0),
  ('apollo', 'Apollo 50 SC', 'manual', 1.0),
  ('floramite', 'Floramite 240 SC', 'manual', 1.0),
  ('score', 'Score 250 EC', 'manual', 1.0),
  ('coragen', 'CORAGEN', 'manual', 1.0),
  ('surround', 'Surround WP', 'manual', 1.0),
  -- Typos
  ('korate', 'Karate Zeon', 'manual', 0.8),
  ('pirmor', 'Pirimor', 'manual', 0.8),
  ('pirrimor', 'Pirimor', 'manual', 0.8),
  ('kaptan', 'Merpan spuitkorrel', 'manual', 0.8),
  ('corus', 'Chorus', 'manual', 0.8),
  ('koragen', 'CORAGEN', 'manual', 0.8)
ON CONFLICT (alias) DO UPDATE SET
  official_name = EXCLUDED.official_name,
  confidence = EXCLUDED.confidence,
  updated_at = NOW();

-- ============================================
-- Helper Functions
-- ============================================

-- Function: Resolve alias to official name
CREATE OR REPLACE FUNCTION resolve_product_alias(search_alias TEXT)
RETURNS TABLE (
  official_name TEXT,
  confidence DECIMAL(3,2),
  source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pa.official_name,
    pa.confidence,
    pa.source
  FROM product_aliases pa
  WHERE pa.alias = LOWER(TRIM(search_alias))
  ORDER BY pa.confidence DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Record alias usage (for learning)
CREATE OR REPLACE FUNCTION record_alias_usage(
  used_alias TEXT,
  resolved_name TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE product_aliases
  SET
    usage_count = usage_count + 1,
    last_used = NOW()
  WHERE alias = LOWER(TRIM(used_alias));

  IF NOT FOUND THEN
    INSERT INTO product_aliases (alias, official_name, source, confidence)
    VALUES (LOWER(TRIM(used_alias)), resolved_name, 'auto_learned', 0.5)
    ON CONFLICT (alias) DO UPDATE SET
      usage_count = product_aliases.usage_count + 1,
      last_used = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- View: Substances Summary (no dependencies)
-- ============================================

CREATE OR REPLACE VIEW v_substances_summary AS
SELECT
  s.code,
  s.name,
  s.category,
  s.max_applications_per_year,
  s.max_kg_per_year,
  COUNT(DISTINCT ps.product_id) as product_count
FROM active_substances s
LEFT JOIN product_substances ps ON s.code = ps.substance_code
GROUP BY s.code, s.name, s.category, s.max_applications_per_year, s.max_kg_per_year
ORDER BY product_count DESC;

-- ============================================
-- DONE! Verify with these queries:
-- ============================================

-- SELECT COUNT(*) FROM active_substances;  -- Should be 22
-- SELECT COUNT(*) FROM product_aliases;    -- Should be ~50
-- SELECT * FROM v_substances_summary LIMIT 5;
-- SELECT * FROM resolve_product_alias('captan');
