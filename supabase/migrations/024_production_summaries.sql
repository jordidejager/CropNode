-- Production summaries for historical annual production data
-- Separate from harvest_registrations which tracks per-pick, per-day detail
-- This table allows quick entry of yearly totals going back to ~2020

CREATE TABLE production_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  harvest_year INTEGER NOT NULL,
  parcel_id TEXT REFERENCES parcels(id) ON DELETE SET NULL,
  sub_parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL,
  variety TEXT NOT NULL,
  total_kg DECIMAL(12,2) NOT NULL,
  total_crates INTEGER,
  weight_per_crate DECIMAL(6,2) DEFAULT 18,
  hectares DECIMAL(8,2),
  notes TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index that handles NULL sub_parcel_id via COALESCE
CREATE UNIQUE INDEX idx_production_summaries_unique
  ON production_summaries(user_id, harvest_year, COALESCE(sub_parcel_id, ''), variety);

ALTER TABLE production_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own production summaries"
  ON production_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own production summaries"
  ON production_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own production summaries"
  ON production_summaries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own production summaries"
  ON production_summaries FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_production_summaries_harvest_year ON production_summaries(harvest_year);
CREATE INDEX idx_production_summaries_user_id ON production_summaries(user_id);
