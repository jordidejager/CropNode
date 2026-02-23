-- Migration: Harvest Registrations System
-- Tracks total harvested crates and links to cold storage via cell_sub_parcels

-- ============================================================================
-- Table: harvest_registrations
-- Stores total crates harvested per sub-parcel/date/pick combination
-- ============================================================================

CREATE TABLE IF NOT EXISTS harvest_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Parcel reference (sub_parcel provides best traceability)
  parcel_id TEXT REFERENCES parcels(id) ON DELETE SET NULL,
  sub_parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL,

  -- Harvest details
  variety TEXT NOT NULL,
  harvest_date DATE NOT NULL DEFAULT CURRENT_DATE,
  pick_number INTEGER NOT NULL DEFAULT 1 CHECK (pick_number >= 1 AND pick_number <= 5),
  total_crates INTEGER NOT NULL CHECK (total_crates > 0),

  -- Optional metadata
  quality_class TEXT CHECK (quality_class IN ('Klasse I', 'Klasse II', 'Industrie')),
  weight_per_crate DECIMAL(5,2),
  season TEXT NOT NULL,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate entries for same harvest moment
  CONSTRAINT unique_harvest_per_day UNIQUE (user_id, sub_parcel_id, harvest_date, pick_number)
);

-- RLS
ALTER TABLE harvest_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own harvest_registrations"
  ON harvest_registrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own harvest_registrations"
  ON harvest_registrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own harvest_registrations"
  ON harvest_registrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own harvest_registrations"
  ON harvest_registrations FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_harvest_registrations_user ON harvest_registrations(user_id);
CREATE INDEX idx_harvest_registrations_date ON harvest_registrations(harvest_date);
CREATE INDEX idx_harvest_registrations_season ON harvest_registrations(season);
CREATE INDEX idx_harvest_registrations_sub_parcel ON harvest_registrations(sub_parcel_id);

-- Updated_at trigger
CREATE TRIGGER harvest_registrations_updated_at
  BEFORE UPDATE ON harvest_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Alter: cell_sub_parcels
-- Add foreign key to harvest_registrations for linking stored crates
-- ============================================================================

ALTER TABLE cell_sub_parcels
ADD COLUMN IF NOT EXISTS harvest_registration_id UUID REFERENCES harvest_registrations(id) ON DELETE SET NULL;

-- Index for joining
CREATE INDEX IF NOT EXISTS idx_cell_sub_parcels_harvest ON cell_sub_parcels(harvest_registration_id);


-- ============================================================================
-- View: v_harvest_registration_totals
-- Calculates stored/remaining crates by summing linked cell_sub_parcels
-- ============================================================================

CREATE OR REPLACE VIEW v_harvest_registration_totals AS
SELECT
  hr.id,
  hr.user_id,
  hr.parcel_id,
  hr.sub_parcel_id,
  hr.variety,
  hr.harvest_date,
  hr.pick_number,
  hr.total_crates,
  hr.quality_class,
  hr.weight_per_crate,
  hr.season,
  hr.notes,
  hr.created_at,
  hr.updated_at,
  -- Parcel names for display
  p.name as parcel_name,
  sp.name as sub_parcel_name,
  -- Calculate stored crates (sum of stack_count from linked cell_sub_parcels)
  COALESCE(stored.stored_crates, 0)::integer as stored_crates,
  -- Calculate remaining crates
  (hr.total_crates - COALESCE(stored.stored_crates, 0))::integer as remaining_crates,
  -- Storage status
  CASE
    WHEN COALESCE(stored.stored_crates, 0) = 0 THEN 'not_stored'
    WHEN COALESCE(stored.stored_crates, 0) >= hr.total_crates THEN 'fully_stored'
    ELSE 'partially_stored'
  END as storage_status,
  -- List of cells where this harvest is stored
  stored.cell_names
FROM harvest_registrations hr
LEFT JOIN parcels p ON p.id = hr.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = hr.sub_parcel_id
LEFT JOIN LATERAL (
  SELECT
    SUM(spc.stack_count)::integer as stored_crates,
    STRING_AGG(DISTINCT sc.name, ', ') as cell_names
  FROM cell_sub_parcels csp
  JOIN storage_position_contents spc ON spc.cell_sub_parcel_id = csp.id
  JOIN storage_cells sc ON sc.id = csp.cell_id
  WHERE csp.harvest_registration_id = hr.id
) stored ON true;


-- ============================================================================
-- Update: v_cell_sub_parcel_totals
-- Add harvest_registration_id to existing view
-- Must DROP first because column structure changes
-- ============================================================================

DROP VIEW IF EXISTS v_cell_sub_parcel_totals;

CREATE VIEW v_cell_sub_parcel_totals AS
SELECT
  csp.id,
  csp.cell_id,
  csp.user_id,
  csp.parcel_id,
  csp.sub_parcel_id,
  csp.variety,
  csp.color,
  csp.pick_date,
  csp.pick_number,
  csp.notes,
  csp.harvest_registration_id,
  csp.created_at,
  csp.updated_at,
  COALESCE(SUM(spc.stack_count), 0)::integer as total_crates,
  COUNT(DISTINCT (spc.row_index, spc.col_index))::integer as positions_used,
  -- Join parcel names for display
  p.name as parcel_name,
  sp.name as sub_parcel_name
FROM cell_sub_parcels csp
LEFT JOIN storage_position_contents spc ON spc.cell_sub_parcel_id = csp.id
LEFT JOIN parcels p ON p.id = csp.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = csp.sub_parcel_id
GROUP BY
  csp.id, csp.cell_id, csp.user_id, csp.parcel_id, csp.sub_parcel_id,
  csp.variety, csp.color, csp.pick_date, csp.pick_number, csp.notes,
  csp.harvest_registration_id, csp.created_at, csp.updated_at, p.name, sp.name;
