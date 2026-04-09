-- ============================================
-- Phenology Reference — bloom dates per year per reference crop
-- ============================================
-- Historically the Python scraper hardcoded bloom dates in phenology.py.
-- We move them to the database so:
--   1. We can update them without a code deploy
--   2. An auto-detect service can refine the estimate based on recent scraped articles
--   3. Multiple reference crops (Conference peer, Jonagold apple, etc.) can coexist
--
-- Source: Typh articles tagged "Vruchtgroei Conference" from FruitConsult historical data
-- ============================================

CREATE TABLE IF NOT EXISTS phenology_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  reference_crop TEXT NOT NULL DEFAULT 'conference_peer',
  year INT NOT NULL,

  -- Bloom stages (F2 = volle bloei / full bloom)
  bloom_date_f2 DATE NOT NULL,

  -- Optional other stages for future extension
  bloom_date_start DATE,                          -- F1 eerste bloem
  bloom_date_end DATE,                            -- G bloembladval

  -- Source of this reference
  source TEXT DEFAULT 'manual',                   -- manual | auto_detected | imported
  confidence TEXT DEFAULT 'hoog',                 -- hoog | gemiddeld | laag
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- One row per (reference_crop, year)
  UNIQUE (reference_crop, year)
);

CREATE INDEX IF NOT EXISTS idx_phenology_reference_year
  ON phenology_reference(year DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_phenology_reference_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_phenology_reference_updated_at ON phenology_reference;
CREATE TRIGGER trg_phenology_reference_updated_at
  BEFORE UPDATE ON phenology_reference
  FOR EACH ROW
  EXECUTE FUNCTION update_phenology_reference_updated_at();

-- RLS: public read for authenticated users
ALTER TABLE phenology_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read phenology_reference" ON phenology_reference;
CREATE POLICY "Public read phenology_reference"
  ON phenology_reference FOR SELECT
  USING (true);

-- Service role can write (no public write policy)

-- ============================================
-- Seed historical Conference peer F2 bloom dates
-- Source: Typh "Vruchtgroei Conference" articles from the FruitConsult backfill
-- ============================================

INSERT INTO phenology_reference (reference_crop, year, bloom_date_f2, source, confidence, notes)
VALUES
  ('conference_peer', 2021, '2021-04-26', 'imported', 'hoog', 'Uit typh-961 "Vruchtgroei Conference"'),
  ('conference_peer', 2022, '2022-04-12', 'imported', 'hoog', 'Uit typh-1916 "Vruchtgroei Conference"'),
  ('conference_peer', 2023, '2023-04-24', 'imported', 'hoog', 'Uit typh-2870 "Vruchtgroei Conference"'),
  ('conference_peer', 2024, '2024-04-03', 'imported', 'hoog', 'Uit typh-4759 "Vruchtgroei Conference"'),
  ('conference_peer', 2025, '2025-04-11', 'imported', 'hoog', 'Uit typh-5627 "Vruchtgroei Conference"'),
  ('conference_peer', 2026, '2026-04-08', 'manual',   'gemiddeld', 'Geschat op basis van teeltactualiteiten 6 april 2026 — volle bloei BE vroeg, NL rond 8 april. Auto-detect kan dit later verfijnen.')
ON CONFLICT (reference_crop, year) DO NOTHING;
