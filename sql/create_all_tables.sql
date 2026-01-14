-- ============================================
-- ALLE TABELLEN VOOR FIRESTORE MIGRATIE
-- Voer dit uit in Supabase Dashboard > SQL Editor
-- https://supabase.com/dashboard/project/djcsihpnidopxxuxumvj/sql/new
-- ============================================

-- 1. LOGBOOK
CREATE TABLE IF NOT EXISTS logbook (
  id TEXT PRIMARY KEY,
  raw_input TEXT,
  status TEXT,
  date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  parsed_data JSONB,
  validation_message TEXT,
  original_logbook_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_logbook_date ON logbook(date);
CREATE INDEX IF NOT EXISTS idx_logbook_status ON logbook(status);

-- 2. PARCEL_HISTORY
CREATE TABLE IF NOT EXISTS parcel_history (
  id TEXT PRIMARY KEY,
  log_id TEXT,
  spuitschrift_id TEXT,
  parcel_id TEXT,
  parcel_name TEXT,
  crop TEXT,
  variety TEXT,
  product TEXT,
  dosage DECIMAL,
  unit TEXT,
  date TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_parcel_history_parcel_id ON parcel_history(parcel_id);
CREATE INDEX IF NOT EXISTS idx_parcel_history_date ON parcel_history(date);
CREATE INDEX IF NOT EXISTS idx_parcel_history_log_id ON parcel_history(log_id);

-- 3. PARCELS
CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  crop TEXT,
  variety TEXT,
  area DECIMAL,
  location JSONB,
  geometry JSONB,
  source TEXT,
  rvo_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_parcels_name ON parcels(name);
CREATE INDEX IF NOT EXISTS idx_parcels_crop ON parcels(crop);

-- 4. USER_PREFERENCES
CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  preferred TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_preferences_alias ON user_preferences(alias);

-- 5. INVENTORY_MOVEMENTS
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  quantity DECIMAL,
  unit TEXT,
  type TEXT,
  date TIMESTAMPTZ,
  description TEXT,
  reference_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_name);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON inventory_movements(date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(type);

-- 6. CTGB_PRODUCTS
CREATE TABLE IF NOT EXISTS ctgb_products (
  id TEXT PRIMARY KEY,
  toelatingsnummer TEXT UNIQUE,
  naam TEXT NOT NULL,
  status TEXT,
  vervaldatum TEXT,
  categorie TEXT,
  toelatingshouder TEXT,
  werkzame_stoffen TEXT[],
  samenstelling JSONB,
  gebruiksvoorschriften JSONB,
  etikettering JSONB,
  search_keywords TEXT[],
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ctgb_products_naam ON ctgb_products(naam);
CREATE INDEX IF NOT EXISTS idx_ctgb_products_toelatingsnummer ON ctgb_products(toelatingsnummer);
CREATE INDEX IF NOT EXISTS idx_ctgb_products_werkzame_stoffen ON ctgb_products USING GIN(werkzame_stoffen);
CREATE INDEX IF NOT EXISTS idx_ctgb_products_search_keywords ON ctgb_products USING GIN(search_keywords);

-- 7. SPUITSCHRIFT
CREATE TABLE IF NOT EXISTS spuitschrift (
  id TEXT PRIMARY KEY,
  spuitschrift_id TEXT,
  original_logbook_id TEXT,
  original_raw_input TEXT,
  date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  plots TEXT[],
  products JSONB,
  validation_message TEXT,
  status TEXT
);
CREATE INDEX IF NOT EXISTS idx_spuitschrift_date ON spuitschrift(date);
CREATE INDEX IF NOT EXISTS idx_spuitschrift_status ON spuitschrift(status);

-- 8. FERTILIZERS
CREATE TABLE IF NOT EXISTS fertilizers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  category TEXT,
  unit TEXT,
  composition JSONB,
  search_keywords TEXT[]
);
CREATE INDEX IF NOT EXISTS idx_fertilizers_name ON fertilizers(name);
CREATE INDEX IF NOT EXISTS idx_fertilizers_category ON fertilizers(category);
CREATE INDEX IF NOT EXISTS idx_fertilizers_search_keywords ON fertilizers USING GIN(search_keywords);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Publieke leestoegang voor alle tabellen
-- ============================================

ALTER TABLE logbook ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctgb_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE spuitschrift ENABLE ROW LEVEL SECURITY;
ALTER TABLE fertilizers ENABLE ROW LEVEL SECURITY;

-- Policies voor publieke toegang (lezen en schrijven)
CREATE POLICY "Allow all access" ON logbook FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON parcel_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON parcels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON user_preferences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON inventory_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON ctgb_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON spuitschrift FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON fertilizers FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- KLAAR! Voer nu het migratie script uit:
-- npx tsx scripts/migrate-all.ts --skip-create
-- ============================================
