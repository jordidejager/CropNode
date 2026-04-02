-- ============================================
-- 034: CTGB Enhancements
-- Add FRAC/IRAC codes to active_substances
-- Fill cas_number and resistance_group
-- ============================================

-- ============================================
-- Update active_substances with FRAC/IRAC codes and CAS numbers
-- ============================================

UPDATE active_substances SET
  resistance_group = vals.resistance_group,
  cas_number = vals.cas_number,
  mode_of_action = vals.mode_of_action
FROM (VALUES
  -- Fungiciden
  ('captan',           'M4',   '133-06-2',   'Multi-site contact activity'),
  ('dithianon',        'M09',  '3347-22-6',  'Multi-site contact activity'),
  ('cyprodinil',       '9',    '121552-61-2', 'Anilinopyrimidine'),
  ('fludioxonil',      '12',   '131341-86-1', 'Phenylpyrrole'),
  ('pyrimethanil',     '9',    '53112-28-0',  'Anilinopyrimidine'),
  ('boscalid',         '7',    '188425-85-6', 'SDHI'),
  ('pyraclostrobin',   '11',   '175013-18-0', 'QoI strobilurin'),
  ('trifloxystrobin',  '11',   '141517-21-7', 'QoI strobilurin'),
  ('difenoconazool',   '3',    '119446-68-3', 'DMI triazool'),
  ('tebuconazool',     '3',    '107534-96-3', 'DMI triazool'),
  ('fluopyram',        '7',    '658066-35-4', 'SDHI'),
  ('fenhexamid',       '17',   '126833-17-8', 'Hydroxyanilide'),
  ('thiophanaat-methyl', '1',  '23564-05-8',  'MBC benzimidazool'),
  -- Insecticiden
  ('spinosad',         '5',    '168316-95-8', 'Spinosyn'),
  ('pirimicarb',       '1A',   '23103-98-2',  'Carbamate'),
  ('lambda-cyhalothrin','3A',  '91465-08-6',  'Pyrethroïde'),
  ('deltamethrin',     '3A',   '52918-63-5',  'Pyrethroïde'),
  ('spirotetramat',    '23',   '203313-25-1', 'Tetramic acid'),
  ('indoxacarb',       '22A',  '144171-61-9', 'Oxadiazine'),
  ('chlorantraniliprole', '28', '500008-45-7', 'Diamide'),
  -- Acariciden
  ('spirodiclofen',    '23',   '148477-71-8', 'Tetronic acid'),
  ('hexythiazox',      '10A',  '78587-05-0',  'Clofentezine groep')
) AS vals(code, resistance_group, cas_number, mode_of_action)
WHERE active_substances.code = vals.code;

-- ============================================
-- Add extra common fruit farming substances
-- ============================================

INSERT INTO active_substances (code, name, name_en, category, resistance_group, cas_number, mode_of_action, max_applications_per_year) VALUES
  ('mefentrifluconazool', 'Mefentrifluconazool', 'Mefentrifluconazole', 'Fungicide', '3', '1417782-03-6', 'DMI triazool (isopropanol-azool)', 3),
  ('fluxapyroxad', 'Fluxapyroxad', 'Fluxapyroxad', 'Fungicide', '7', '907204-31-3', 'SDHI', 3),
  ('dodine', 'Dodine', 'Dodine', 'Fungicide', 'U12', '2439-10-3', 'Guanidine', 4),
  ('penconazool', 'Penconazool', 'Penconazole', 'Fungicide', '3', '66246-88-6', 'DMI triazool', 3),
  ('kaliumfosfonaten', 'Kaliumfosfonaten', 'Potassium phosphonates', 'Fungicide', '33', '13492-26-7', 'Fosfonaat', 6),
  ('kresoxim-methyl', 'Kresoxim-methyl', 'Kresoxim-methyl', 'Fungicide', '11', '143390-89-0', 'QoI strobilurin', 3),
  ('flonicamid', 'Flonicamid', 'Flonicamid', 'Insecticide', '29', '158062-67-0', 'Chordotonal organ modulator', 2),
  ('acetamiprid', 'Acetamiprid', 'Acetamiprid', 'Insecticide', '4A', '135410-20-7', 'Neonicotinoïde', 2),
  ('abamectine', 'Abamectine', 'Abamectin', 'Insecticide/Acaricide', '6', '71751-41-2', 'Avermectine', 2),
  ('methoxyfenozide', 'Methoxyfenozide', 'Methoxyfenozide', 'Insecticide', '18', '161050-58-4', 'Diacylhydrazine', 2),
  ('zwavel', 'Zwavel', 'Sulphur', 'Fungicide/Acaricide', 'M2', '7704-34-9', 'Multi-site contact activity', 10)
ON CONFLICT (code) DO UPDATE SET
  resistance_group = EXCLUDED.resistance_group,
  cas_number = EXCLUDED.cas_number,
  mode_of_action = EXCLUDED.mode_of_action,
  last_updated = NOW();

-- ============================================
-- Populate product_substances junction table
-- Match active substances from ctgb_products.werkzame_stoffen
-- to active_substances.name (case-insensitive)
-- ============================================

INSERT INTO product_substances (product_id, substance_code, concentration_unit)
SELECT DISTINCT
  cp.toelatingsnummer,
  asub.code,
  -- Store the concentration as text in concentration_unit (it contains "500 G/L" style values)
  (SELECT s->>'concentratie'
   FROM jsonb_array_elements(cp.samenstelling->'stoffen') s
   WHERE lower(s->>'naam') = lower(asub.name)
   LIMIT 1
  ) as concentration_unit
FROM ctgb_products cp
CROSS JOIN LATERAL unnest(cp.werkzame_stoffen) ws(stof)
JOIN active_substances asub ON lower(ws.stof) = lower(asub.name)
ON CONFLICT (product_id, substance_code) DO NOTHING;

-- ============================================
-- Create restriction categories table for GV opmerkingen
-- ============================================

CREATE TABLE IF NOT EXISTS ctgb_usage_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_toelatingsnummer TEXT NOT NULL,
  gv_index INTEGER NOT NULL,  -- index in de gebruiksvoorschriften array
  gewas TEXT,  -- gewas uit het gebruiksvoorschrift
  restriction_type TEXT NOT NULL CHECK (restriction_type IN (
    'bbch_stadiums',      -- BBCH groeistadiumbeperkingen
    'grondwater',         -- Grondwaterbeschermingsgebied restricties
    'concentratie',       -- Concentratie/spuitvolume beperkingen
    'resistentie',        -- Resistentiemanagement instructies
    'drift',              -- Driftreductie-eisen
    'bufferzone',         -- Bufferzone/teeltvrije zone
    'groeistadium',       -- Niet-BBCH groeistadium beperkingen
    'dosering_opmerking', -- Extra dosering-opmerkingen
    'algemeen'            -- Overige opmerkingen
  )),
  value TEXT,              -- Geëxtraheerde kernwaarde (bijv. "BBCH 51-59 en BBCH 70-85")
  raw_text TEXT,           -- Originele opmerkingstekst
  parameters JSONB,        -- Gestructureerde parameters (voor grondwater etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_restrictions_product ON ctgb_usage_restrictions(product_toelatingsnummer);
CREATE INDEX IF NOT EXISTS idx_usage_restrictions_type ON ctgb_usage_restrictions(restriction_type);
CREATE INDEX IF NOT EXISTS idx_usage_restrictions_gewas ON ctgb_usage_restrictions(gewas);

-- RLS
ALTER TABLE ctgb_usage_restrictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read restrictions" ON ctgb_usage_restrictions;
CREATE POLICY "Allow public read restrictions" ON ctgb_usage_restrictions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow authenticated write restrictions" ON ctgb_usage_restrictions;
CREATE POLICY "Allow authenticated write restrictions" ON ctgb_usage_restrictions FOR INSERT WITH CHECK (true);
