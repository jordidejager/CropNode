-- Migration: Disease Pressure Models
-- Adds disease model configuration, season progress tracking, and infection period caching.
-- First implementation: Apple Scab (Venturia inaequalis) based on A-scab/Mills model.

-- ============================================================================
-- Table: disease_model_config
-- Per-parcel, per-harvest-year disease model configuration.
-- Stores biofix date and inoculum pressure for each disease type.
-- ============================================================================

CREATE TABLE IF NOT EXISTS disease_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  harvest_year INTEGER NOT NULL,
  disease_type TEXT NOT NULL DEFAULT 'apple_scab',
  biofix_date DATE NOT NULL,
  inoculum_pressure TEXT NOT NULL DEFAULT 'medium',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, parcel_id, harvest_year, disease_type)
);

CREATE INDEX idx_disease_config_user
  ON disease_model_config(user_id);

CREATE INDEX idx_disease_config_parcel_year
  ON disease_model_config(parcel_id, harvest_year);

ALTER TABLE disease_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disease_model_config"
  ON disease_model_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own disease_model_config"
  ON disease_model_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own disease_model_config"
  ON disease_model_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own disease_model_config"
  ON disease_model_config FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER disease_model_config_updated_at
  BEFORE UPDATE ON disease_model_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Table: disease_season_progress
-- Daily snapshot of cumulative degree-days and PAM (proportion ascospores mature).
-- Used to render the season progression curve.
-- ============================================================================

CREATE TABLE IF NOT EXISTS disease_season_progress (
  id BIGSERIAL PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES disease_model_config(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  degree_days_cumulative DECIMAL(6,1) NOT NULL,
  pam DECIMAL(4,3) NOT NULL,
  is_forecast BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(config_id, date)
);

CREATE INDEX idx_disease_season_config_date
  ON disease_season_progress(config_id, date);

ALTER TABLE disease_season_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disease_season_progress"
  ON disease_season_progress FOR SELECT
  USING (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own disease_season_progress"
  ON disease_season_progress FOR INSERT
  WITH CHECK (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own disease_season_progress"
  ON disease_season_progress FOR UPDATE
  USING (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own disease_season_progress"
  ON disease_season_progress FOR DELETE
  USING (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- Table: disease_infection_periods
-- Cached infection event calculations from the Mills/A-scab model.
-- Each row represents one detected wet period and its infection assessment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS disease_infection_periods (
  id BIGSERIAL PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES disease_model_config(id) ON DELETE CASCADE,
  wet_period_start TIMESTAMPTZ NOT NULL,
  wet_period_end TIMESTAMPTZ NOT NULL,
  wet_duration_hours DECIMAL(5,1) NOT NULL,
  avg_temperature DECIMAL(4,1) NOT NULL,
  severity TEXT NOT NULL,
  rim_value INTEGER,
  pam_at_event DECIMAL(4,3),
  degree_days_cumulative DECIMAL(6,1),
  expected_symptom_date DATE,
  is_forecast BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(config_id, wet_period_start)
);

CREATE INDEX idx_disease_infection_config
  ON disease_infection_periods(config_id);

CREATE INDEX idx_disease_infection_config_start
  ON disease_infection_periods(config_id, wet_period_start);

ALTER TABLE disease_infection_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disease_infection_periods"
  ON disease_infection_periods FOR SELECT
  USING (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own disease_infection_periods"
  ON disease_infection_periods FOR INSERT
  WITH CHECK (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own disease_infection_periods"
  ON disease_infection_periods FOR UPDATE
  USING (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own disease_infection_periods"
  ON disease_infection_periods FOR DELETE
  USING (
    config_id IN (
      SELECT id FROM disease_model_config WHERE user_id = auth.uid()
    )
  );
