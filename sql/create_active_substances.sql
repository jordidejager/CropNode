-- ============================================
-- Active Substances Table for Supabase
-- Werkzame stoffen met wettelijke limieten
-- ============================================

-- Drop table if exists (alleen voor development!)
-- DROP TABLE IF EXISTS active_substances CASCADE;

CREATE TABLE IF NOT EXISTS active_substances (
  -- Primary key: unieke code voor de werkzame stof
  code TEXT PRIMARY KEY,

  -- Basis identificatie
  name TEXT NOT NULL,                    -- Nederlandse naam (bijv. "Captan")
  name_en TEXT,                          -- Engelse naam
  cas_number TEXT,                       -- CAS nummer (bijv. "133-06-2")

  -- Wettelijke limieten
  max_kg_per_year DECIMAL(10,4),         -- Maximum kg werkzame stof per hectare per jaar
  max_applications_per_year INTEGER,      -- Maximum aantal toepassingen per jaar
  max_kg_per_application DECIMAL(10,4),   -- Maximum kg per enkele toepassing

  -- Categorisatie
  category TEXT,                          -- Fungicide, Insecticide, Herbicide, etc.
  mode_of_action TEXT,                    -- Werkingsmechanisme
  resistance_group TEXT,                  -- FRAC/IRAC groep

  -- Status
  status TEXT DEFAULT 'active',           -- active, restricted, banned
  restriction_notes TEXT,                 -- Bijzondere beperkingen

  -- Metadata
  source TEXT DEFAULT 'CTGB',             -- Bron van de data
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_active_substances_name ON active_substances(name);
CREATE INDEX IF NOT EXISTS idx_active_substances_cas ON active_substances(cas_number);
CREATE INDEX IF NOT EXISTS idx_active_substances_category ON active_substances(category);
CREATE INDEX IF NOT EXISTS idx_active_substances_status ON active_substances(status);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_active_substances_name_trgm ON active_substances USING GIN(name gin_trgm_ops);

-- ============================================
-- Junction Table: Product <-> Active Substance (Many-to-Many)
-- ============================================

CREATE TABLE IF NOT EXISTS product_substances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,  -- toelatingsnummer van het product
  substance_code TEXT NOT NULL REFERENCES active_substances(code) ON DELETE CASCADE,

  -- Concentratie in dit product
  concentration DECIMAL(10,4),            -- Percentage of g/L
  concentration_unit TEXT,                -- %, g/L, g/kg

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(product_id, substance_code)
);

CREATE INDEX IF NOT EXISTS idx_product_substances_product ON product_substances(product_id);
CREATE INDEX IF NOT EXISTS idx_product_substances_substance ON product_substances(substance_code);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE active_substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_substances ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Allow public read active_substances" ON active_substances
  FOR SELECT USING (true);

CREATE POLICY "Allow public read product_substances" ON product_substances
  FOR SELECT USING (true);

-- Authenticated write access
CREATE POLICY "Allow authenticated insert active_substances" ON active_substances
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update active_substances" ON active_substances
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated insert product_substances" ON product_substances
  FOR INSERT WITH CHECK (true);

-- ============================================
-- Seed Data: Common Active Substances
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
-- Useful Views
-- ============================================

-- View: Products with their active substances
CREATE OR REPLACE VIEW v_products_with_substances AS
SELECT
  p.toelatingsnummer,
  p.naam as product_name,
  p.status as product_status,
  p.categorie,
  s.code as substance_code,
  s.name as substance_name,
  s.category as substance_category,
  s.max_applications_per_year,
  s.max_kg_per_year,
  ps.concentration,
  ps.concentration_unit
FROM ctgb_products p
LEFT JOIN product_substances ps ON p.toelatingsnummer = ps.product_id
LEFT JOIN active_substances s ON ps.substance_code = s.code
ORDER BY p.naam, s.name;

-- View: Substances with product count
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
-- Example Queries
-- ============================================

-- Find all products containing Captan
-- SELECT * FROM v_products_with_substances WHERE substance_code = 'captan';

-- Get substances with their product counts
-- SELECT * FROM v_substances_summary;

-- Check how many times a substance has been applied this season
-- SELECT
--   s.name as substance,
--   COUNT(*) as applications,
--   s.max_applications_per_year as max_allowed
-- FROM parcel_history ph
-- JOIN ctgb_products p ON ph.product = p.naam
-- JOIN product_substances ps ON p.toelatingsnummer = ps.product_id
-- JOIN active_substances s ON ps.substance_code = s.code
-- WHERE ph.date >= DATE_TRUNC('year', CURRENT_DATE)
-- GROUP BY s.code, s.name, s.max_applications_per_year;
