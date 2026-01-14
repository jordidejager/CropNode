-- ============================================
-- CTGB Products Table for Supabase
-- Migratie van Firestore ctgb_products collectie
-- ============================================

-- Drop table if exists (alleen voor development!)
-- DROP TABLE IF EXISTS ctgb_products;

CREATE TABLE IF NOT EXISTS ctgb_products (
  -- Primary key: toelatingsnummer is uniek per product
  toelatingsnummer TEXT PRIMARY KEY,

  -- Basis identificatie
  id TEXT NOT NULL,                    -- MST API ID
  naam TEXT NOT NULL,                  -- Productnaam

  -- Status informatie
  status TEXT NOT NULL DEFAULT 'Valid',
  vervaldatum TEXT,                    -- ISO date string
  categorie TEXT,                      -- Product categorie

  -- Bedrijf
  toelatingshouder TEXT,               -- Bedrijfsnaam van de toelatingshouder

  -- Werkzame stoffen (array van strings)
  werkzame_stoffen TEXT[] DEFAULT '{}',

  -- Samenstelling (JSONB voor flexibele nested data)
  -- Structuur: { formuleringstype?: string, stoffen: [{ naam, concentratie?, casNummer? }] }
  samenstelling JSONB,

  -- Gebruiksvoorschriften (array van objecten)
  -- Structuur: [{ gewas, doelorganisme?, locatie?, toepassingsmethode?, dosering?, maxToepassingen?, veiligheidstermijn?, interval?, opmerkingen?, wCodes? }]
  gebruiksvoorschriften JSONB DEFAULT '[]',

  -- Etikettering (JSONB voor nested data)
  -- Structuur: { ghsSymbolen?: string[], hZinnen?: [{code, tekst}], pZinnen?: [{code, tekst}], signaalwoord?: string }
  etikettering JSONB,

  -- Zoekfunctionaliteit
  search_keywords TEXT[] DEFAULT '{}',

  -- Metadata
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes voor snelle queries
-- ============================================

-- Index op naam voor zoeken en sorteren
CREATE INDEX IF NOT EXISTS idx_ctgb_products_naam ON ctgb_products(naam);

-- GIN index voor array search op werkzame stoffen
CREATE INDEX IF NOT EXISTS idx_ctgb_products_werkzame_stoffen ON ctgb_products USING GIN(werkzame_stoffen);

-- GIN index voor search keywords (voor partial text search)
CREATE INDEX IF NOT EXISTS idx_ctgb_products_search_keywords ON ctgb_products USING GIN(search_keywords);

-- Index op status voor filtering
CREATE INDEX IF NOT EXISTS idx_ctgb_products_status ON ctgb_products(status);

-- Full-text search index op naam
CREATE INDEX IF NOT EXISTS idx_ctgb_products_naam_trgm ON ctgb_products USING GIN(naam gin_trgm_ops);

-- ============================================
-- Trigger voor updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ctgb_products_updated_at ON ctgb_products;
CREATE TRIGGER update_ctgb_products_updated_at
  BEFORE UPDATE ON ctgb_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE ctgb_products ENABLE ROW LEVEL SECURITY;

-- Policy: Iedereen kan lezen (publieke data)
CREATE POLICY "Allow public read access" ON ctgb_products
  FOR SELECT
  USING (true);

-- Policy: Alleen authenticated users kunnen schrijven (voor sync scripts)
-- Pas dit aan naar je eigen auth setup indien nodig
CREATE POLICY "Allow authenticated insert" ON ctgb_products
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON ctgb_products
  FOR UPDATE
  USING (true);

-- ============================================
-- Voorbeeld queries
-- ============================================

-- Zoek producten op naam (partial match)
-- SELECT * FROM ctgb_products WHERE naam ILIKE '%captan%';

-- Zoek producten met specifieke werkzame stof
-- SELECT * FROM ctgb_products WHERE 'captan' = ANY(werkzame_stoffen);

-- Zoek met search keywords (zoals Firestore array-contains)
-- SELECT * FROM ctgb_products WHERE 'merpan' = ANY(search_keywords);

-- Haal alle actieve producten op gesorteerd op naam
-- SELECT * FROM ctgb_products WHERE status = 'Valid' ORDER BY naam;
