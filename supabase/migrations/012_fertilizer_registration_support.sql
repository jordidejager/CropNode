-- ============================================
-- MESTSTOFFEN REGISTRATIE ONDERSTEUNING
-- ============================================
-- Voegt registration_type toe aan spuitschrift en logbook,
-- en source markering aan product entries.
-- Maakt meststoffen doorzoekbaar vanuit de smart input pipeline.

-- 1a. registration_type toevoegen aan spuitschrift
ALTER TABLE spuitschrift
ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'spraying'
CHECK (registration_type IN ('spraying', 'spreading'));

-- 1a. registration_type toevoegen aan logbook
ALTER TABLE logbook
ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'spraying'
CHECK (registration_type IN ('spraying', 'spreading'));

-- 1a. registration_type toevoegen aan parcel_history
ALTER TABLE parcel_history
ADD COLUMN IF NOT EXISTS registration_type TEXT NOT NULL DEFAULT 'spraying'
CHECK (registration_type IN ('spraying', 'spreading'));

-- 1b. source markering per product zit in de JSONB products kolom
-- ProductEntry wordt uitgebreid met { source: 'ctgb' | 'fertilizer' }
-- Bestaande data heeft impliciet source='ctgb' (backward compatible)

-- 1c. Maak meststoffen doorzoekbaar: voeg search-vriendelijke index toe
-- GIN index op search_keywords bestaat al, voeg trigram index toe op naam
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_fertilizers_name_trgm
ON fertilizers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fertilizers_name_lower
ON fertilizers USING btree (lower(name));

-- Index op registration_type voor filtering
CREATE INDEX IF NOT EXISTS idx_spuitschrift_registration_type
ON spuitschrift (registration_type);

CREATE INDEX IF NOT EXISTS idx_logbook_registration_type
ON logbook (registration_type);

CREATE INDEX IF NOT EXISTS idx_parcel_history_registration_type
ON parcel_history (registration_type);

-- Meststof aliassen tabel voor fuzzy matching (parallel aan product_aliases)
CREATE TABLE IF NOT EXISTS fertilizer_aliases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE,
  official_name TEXT NOT NULL,
  fertilizer_id TEXT REFERENCES fertilizers(id),
  usage_count INTEGER DEFAULT 0,
  confidence DECIMAL(3,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS voor fertilizer_aliases
ALTER TABLE fertilizer_aliases ENABLE ROW LEVEL SECURITY;

-- Iedereen mag aliassen lezen (ze zijn generiek, niet user-specifiek)
CREATE POLICY "fertilizer_aliases_select" ON fertilizer_aliases
  FOR SELECT USING (true);

-- Seed de meest voorkomende meststof aliassen
INSERT INTO fertilizer_aliases (alias, official_name) VALUES
  ('omnical', 'Chelal Omnical'),
  ('chelal calcium', 'Chelal Omnical'),
  ('chelal az', 'Chelal AZ'),
  ('chelal sporenelementen', 'Chelal AZ'),
  ('chelal borium', 'Chelal B'),
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
  ('calin', 'Calin W'),
  ('stimuplant', 'Stimuplant Vitaal'),
  ('hortispoor', 'Hortispoor Mix'),
  ('selectyc', 'Selectyc X'),
  ('alsupre', 'Alsupre S'),
  ('fosanit', 'Fosanit Cu'),
  ('map', 'Monoammoniumfosfaat'),
  ('toptrace', 'TopTrace Alimento'),
  ('mag 500', 'Mag500'),
  ('mn 500', 'Mangaan 500'),
  ('mn500', 'Mangaan 500'),
  ('fertigofol', 'Fertigofol Ultra'),
  ('kas', 'Kalkammonsalpeter'),
  ('kas 27', 'Kalkammonsalpeter'),
  ('kalizout', 'Kalizout 60'),
  ('kali 60', 'Kalizout 60'),
  ('patent kali', 'Patentkali'),
  ('kalium sulfaat', 'Kaliumsulfaat'),
  ('zwavelzure kali', 'Kaliumsulfaat'),
  ('perlka', 'Kalkstikstof'),
  ('tripel super', 'Tripel Superfosfaat'),
  ('tsp', 'Tripel Superfosfaat'),
  ('mas', 'Magnesammonsalpeter'),
  ('mas 21', 'Magnesammonsalpeter'),
  ('zza', 'Zwavelzure ammoniak'),
  ('za', 'Zwavelzure ammoniak'),
  ('ipreum', 'IPreum'),
  ('ureum korrel', 'IPreum'),
  ('multi k', 'Multi Kmg'),
  ('multi kmg', 'Multi Kmg'),
  ('12-10-18', 'Mengmest 12-10-18'),
  ('npk 12-10-18', 'Mengmest 12-10-18'),
  ('haifa', 'Haifa Multi-K'),
  ('multi-k', 'Haifa Multi-K'),
  ('kaliumnitraat', 'Haifa Multi-K'),
  ('calciumnitraat', 'Kalksalpeter')
ON CONFLICT (alias) DO NOTHING;
