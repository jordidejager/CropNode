-- ============================================
-- 033: Unified Products Table
-- Single entry point voor productherkenning
-- Links naar ctgb_products en fertilizers voor details
-- ============================================

-- Enable pg_trgm if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Unified products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product_type TEXT,  -- fungicide, insecticide, herbicide, acaricide, groeiregulator, bladmeststof, strooimeststof, fertigatiemeststof, biostimulant, uitvloeier
  source TEXT NOT NULL CHECK (source IN ('ctgb', 'fertilizer', 'manual')),
  source_id TEXT,  -- toelatingsnummer voor ctgb, id voor fertilizers
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'withdrawn')),
  search_keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_search_keywords ON products USING GIN(search_keywords);
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);
CREATE INDEX IF NOT EXISTS idx_products_source_id ON products(source, source_id);
CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow authenticated write products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update products" ON products FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- ============================================
-- Populate from ctgb_products
-- ============================================
INSERT INTO products (name, product_type, source, source_id, status, search_keywords)
SELECT
  sub.naam,
  sub.product_type,
  'ctgb',
  sub.toelatingsnummer,
  sub.status,
  sub.search_keywords
FROM (
  SELECT DISTINCT ON (cp.toelatingsnummer)
    cp.naam,
    cp.toelatingsnummer,
    CASE
      WHEN 'Fungicide' = ANY(cp.product_types) THEN 'fungicide'
      WHEN 'Insecticide' = ANY(cp.product_types) THEN 'insecticide'
      WHEN 'Herbicide' = ANY(cp.product_types) THEN 'herbicide'
      WHEN 'Acaricide' = ANY(cp.product_types) THEN 'acaricide'
      WHEN 'Groeiregulator' = ANY(cp.product_types) THEN 'groeiregulator'
      WHEN 'Molluscicide' = ANY(cp.product_types) THEN 'molluscicide'
      WHEN 'Rodenticide' = ANY(cp.product_types) THEN 'rodenticide'
      WHEN 'Kiemremmingsmiddel' = ANY(cp.product_types) THEN 'kiemremmingsmiddel'
      ELSE 'gewasbescherming'
    END as product_type,
    CASE WHEN cp.status = 'Valid' THEN 'active' ELSE 'expired' END as status,
    cp.search_keywords
  FROM ctgb_products cp
  ORDER BY cp.toelatingsnummer, cp.naam
) sub
ON CONFLICT (source, source_id) DO UPDATE SET
  name = EXCLUDED.name,
  product_type = EXCLUDED.product_type,
  status = EXCLUDED.status,
  search_keywords = EXCLUDED.search_keywords,
  updated_at = NOW();

-- ============================================
-- Populate from fertilizers (use subquery to deduplicate)
-- ============================================
INSERT INTO products (name, product_type, source, source_id, status, search_keywords)
SELECT
  sub.name,
  sub.product_type,
  'fertilizer',
  sub.id,
  'active',
  sub.search_keywords
FROM (
  SELECT DISTINCT ON (f.id)
    f.id,
    f.name,
    CASE f.category
      WHEN 'Leaf' THEN 'bladmeststof'
      WHEN 'Soil' THEN 'strooimeststof'
      WHEN 'Fertigation' THEN 'fertigatiemeststof'
      ELSE 'meststof'
    END as product_type,
    f.search_keywords
  FROM fertilizers f
  ORDER BY f.id, f.name
) sub
ON CONFLICT (source, source_id) DO UPDATE SET
  name = EXCLUDED.name,
  product_type = EXCLUDED.product_type,
  search_keywords = EXCLUDED.search_keywords,
  updated_at = NOW();

-- ============================================
-- Useful views
-- ============================================

-- View: products with CTGB details
CREATE OR REPLACE VIEW v_products_ctgb AS
SELECT
  p.id as product_id,
  p.name,
  p.product_type,
  p.source,
  p.status as product_status,
  cp.toelatingsnummer,
  cp.toelatingshouder,
  cp.vervaldatum,
  cp.werkzame_stoffen,
  cp.product_types,
  cp.samenstelling,
  cp.gebruiksvoorschriften,
  cp.etikettering
FROM products p
JOIN ctgb_products cp ON p.source_id = cp.toelatingsnummer
WHERE p.source = 'ctgb';

-- View: products with fertilizer details
CREATE OR REPLACE VIEW v_products_fertilizer AS
SELECT
  p.id as product_id,
  p.name,
  p.product_type,
  p.source,
  p.status as product_status,
  f.manufacturer,
  f.category,
  f.unit,
  f.composition,
  f.description,
  f.formulation,
  f.density,
  f.dosage_fruit,
  f.application_timing
FROM products p
JOIN fertilizers f ON p.source_id = f.id
WHERE p.source = 'fertilizer';
