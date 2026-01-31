-- ============================================
-- Product Aliases Table for Supabase
-- Mapping van spreektaal naar officiële CTGB namen
-- ============================================

-- Drop table if exists (alleen voor development!)
-- DROP TABLE IF EXISTS product_aliases CASCADE;

CREATE TABLE IF NOT EXISTS product_aliases (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alias mapping
  alias TEXT NOT NULL,                    -- De informele naam (bijv. "roundup", "captan")
  official_name TEXT NOT NULL,            -- De officiële CTGB naam (bijv. "Roundup Evolution")
  product_id TEXT,                        -- Optionele referentie naar toelatingsnummer

  -- Metadata
  source TEXT DEFAULT 'manual',           -- manual, user_correction, auto_learned
  usage_count INTEGER DEFAULT 0,          -- Hoe vaak deze alias is gebruikt
  confidence DECIMAL(3,2) DEFAULT 1.0,    -- 0.00 - 1.00 confidence score
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: een alias mag maar naar één product wijzen
  UNIQUE(alias)
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_official ON product_aliases(official_name);
CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases(product_id);

-- Trigram index for fuzzy search
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias_trgm ON product_aliases USING GIN(alias gin_trgm_ops);

-- ============================================
-- Trigger for updated_at
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
-- Row Level Security
-- ============================================

ALTER TABLE product_aliases ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Allow public read product_aliases" ON product_aliases
  FOR SELECT USING (true);

-- Authenticated write access
CREATE POLICY "Allow authenticated insert product_aliases" ON product_aliases
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update product_aliases" ON product_aliases
  FOR UPDATE USING (true);

-- ============================================
-- Seed Data: Common Aliases
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

  -- Veelvoorkomende typos/variaties
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
-- Functions
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

  -- If alias doesn't exist, create it with low confidence
  IF NOT FOUND THEN
    INSERT INTO product_aliases (alias, official_name, source, confidence)
    VALUES (LOWER(TRIM(used_alias)), resolved_name, 'auto_learned', 0.5)
    ON CONFLICT (alias) DO UPDATE SET
      usage_count = product_aliases.usage_count + 1,
      last_used = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Fuzzy search aliases
CREATE OR REPLACE FUNCTION search_aliases(search_term TEXT, limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
  alias TEXT,
  official_name TEXT,
  similarity REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pa.alias,
    pa.official_name,
    similarity(pa.alias, LOWER(search_term)) as sim
  FROM product_aliases pa
  WHERE pa.alias % LOWER(search_term)
  ORDER BY sim DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Example Queries
-- ============================================

-- Resolve an alias
-- SELECT * FROM resolve_product_alias('captan');

-- Record usage of an alias
-- SELECT record_alias_usage('merpan', 'Merpan spuitkorrel');

-- Fuzzy search aliases
-- SELECT * FROM search_aliases('kaptaan');

-- Get most used aliases
-- SELECT alias, official_name, usage_count
-- FROM product_aliases
-- ORDER BY usage_count DESC
-- LIMIT 20;
