-- Migration: Fungicide Coverage Model (Ziektedruk Niveau 2)
-- Adds fungicide properties table and extends disease_infection_periods with coverage data.
-- Enables linking spray registrations (spuitschrift) to infection risk events.

-- ============================================================================
-- Table: fungicide_properties
-- Static reference table with wash-off and curative properties per active substance.
-- NOT user-owned — shared reference data. No RLS needed (read-only for all).
-- ============================================================================

CREATE TABLE IF NOT EXISTS fungicide_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active_substance TEXT NOT NULL,
  active_substance_nl TEXT,
  frac_group TEXT,
  mode_of_action TEXT NOT NULL DEFAULT 'preventief',  -- 'preventief' | 'curatief' | 'beide'
  rain_washoff_halflife_mm NUMERIC(5,1) NOT NULL,     -- mm rain for 50% wash-off
  min_residual_fraction NUMERIC(3,2) NOT NULL DEFAULT 0.10,  -- fraction that doesn't wash off
  curative_max_degree_hours INTEGER,                  -- max °C·h after infection start
  min_drying_hours NUMERIC(3,1) DEFAULT 2,            -- hours dry needed after application
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(active_substance)
);

-- No RLS — this is shared reference data, readable by all authenticated users
ALTER TABLE fungicide_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fungicide_properties"
  ON fungicide_properties FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER fungicide_properties_updated_at
  BEFORE UPDATE ON fungicide_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Extend disease_infection_periods with coverage data
-- ============================================================================

ALTER TABLE disease_infection_periods ADD COLUMN IF NOT EXISTS
  coverage_at_infection NUMERIC(4,1);         -- 0-100%

ALTER TABLE disease_infection_periods ADD COLUMN IF NOT EXISTS
  coverage_status TEXT;                        -- 'good' | 'moderate' | 'low' | 'none'

ALTER TABLE disease_infection_periods ADD COLUMN IF NOT EXISTS
  last_spray_product TEXT;                     -- Product name from spuitschrift

ALTER TABLE disease_infection_periods ADD COLUMN IF NOT EXISTS
  last_spray_date TIMESTAMPTZ;                 -- When the spray was applied

ALTER TABLE disease_infection_periods ADD COLUMN IF NOT EXISTS
  curative_window_open BOOLEAN DEFAULT false;  -- Can curative treatment still work?

ALTER TABLE disease_infection_periods ADD COLUMN IF NOT EXISTS
  curative_remaining_dh INTEGER;               -- Remaining degree-hours for curative window

-- ============================================================================
-- Seed data: fungicide properties for common Dutch fruit farming products
-- Based on published wash-off studies and RIMpro product documentation.
-- ============================================================================

INSERT INTO fungicide_properties (active_substance, active_substance_nl, frac_group, mode_of_action, rain_washoff_halflife_mm, min_residual_fraction, curative_max_degree_hours, min_drying_hours) VALUES
  -- CONTACT FUNGICIDES (preventief)
  ('captan',            'Captan',            'M4',  'preventief', 1.0,  0.15, NULL, 2),
  ('mancozeb',          'Mancozeb',          'M3',  'preventief', 2.0,  0.10, NULL, 2),
  ('dithianon',         'Dithianon',         'M9',  'preventief', 15.0, 0.20, NULL, 1),
  ('zwavel',            'Zwavel',            'M2',  'preventief', 3.0,  0.05, NULL, 2),
  ('koperhydroxide',    'Koperhydroxide',    'M1',  'preventief', 10.0, 0.20, NULL, 2),
  ('metiram',           'Metiram',           'M3',  'preventief', 2.5,  0.10, NULL, 2),
  ('folpet',            'Folpet',            'M4',  'preventief', 1.5,  0.15, NULL, 2),

  -- CURATIVE / BOTH
  ('dodine',            'Dodine',            'U12', 'beide',      5.0,  0.10, 300,  1),
  ('kaliumbicarbonaat', 'Kaliumbicarbonaat', 'NC',  'curatief',   0.5,  0.00, 300,  0),

  -- STROBILURINS (systemic, both)
  ('trifloxystrobin',   'Trifloxystrobin',   '11',  'beide',      50.0, 0.80, 200,  1),
  ('kresoxim-methyl',   'Kresoxim-methyl',   '11',  'beide',      50.0, 0.80, 200,  1),
  ('pyraclostrobin',    'Pyraclostrobin',    '11',  'beide',      40.0, 0.70, 200,  1),

  -- DMI's (triazoles, curative)
  ('difenoconazool',    'Difenoconazool',    '3',   'curatief',   20.0, 0.30, 500,  2),
  ('myclobutanil',      'Myclobutanil',      '3',   'curatief',   15.0, 0.25, 400,  2),
  ('penconazool',       'Penconazool',       '3',   'curatief',   15.0, 0.25, 400,  2),

  -- SDHI's
  ('fluopyram',         'Fluopyram',         '7',   'beide',      25.0, 0.30, 400,  2),
  ('fluxapyroxad',      'Fluxapyroxad',      '7',   'beide',      25.0, 0.30, 400,  2),

  -- AP fungicides
  ('cyprodinil',        'Cyprodinil',        '9',   'curatief',   10.0, 0.20, 500,  2),
  ('pyrimethanil',      'Pyrimethanil',      '9',   'curatief',   8.0,  0.15, 400,  2)

ON CONFLICT (active_substance) DO NOTHING;
