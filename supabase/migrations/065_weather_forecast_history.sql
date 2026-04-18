-- ============================================================================
-- Migration 065: Weather forecast history (snapshot table)
-- ============================================================================
-- Captures what the forecast SAID at a specific point in time, for a specific
-- future valid_at. Lets us answer: "5 days ago, what was the forecast for today?"
-- and compute real forecast accuracy metrics.
--
-- Keyed by (station_id, model_name, forecast_made_at, valid_at) — one snapshot
-- per model run per hour. Pruned after 60 days.
-- ============================================================================

CREATE TABLE IF NOT EXISTS weather_forecast_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,           -- best_match, knmi_seamless, ecmwf_ifs, etc.
  forecast_made_at TIMESTAMPTZ NOT NULL, -- when the model run was fetched
  valid_at TIMESTAMPTZ NOT NULL,      -- the hour this forecast is predicting

  -- Forecast values (same shape as weather_data_hourly, subset)
  temperature_c NUMERIC(5,2),
  precipitation_mm NUMERIC(5,2),
  wind_speed_ms NUMERIC(5,2),
  wind_gusts_ms NUMERIC(5,2),
  humidity_pct NUMERIC(5,2),

  -- How far ahead this forecast was made (derived, for fast filtering)
  lead_time_hours INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (valid_at - forecast_made_at)) / 3600
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT weather_forecast_history_natural_key
    UNIQUE (station_id, model_name, forecast_made_at, valid_at)
);

CREATE INDEX IF NOT EXISTS idx_wfh_station_valid
  ON weather_forecast_history (station_id, valid_at);

CREATE INDEX IF NOT EXISTS idx_wfh_station_lead
  ON weather_forecast_history (station_id, lead_time_hours)
  WHERE lead_time_hours BETWEEN 1 AND 240;

CREATE INDEX IF NOT EXISTS idx_wfh_made_at
  ON weather_forecast_history (forecast_made_at);

-- RLS — users see forecasts for their own stations
ALTER TABLE weather_forecast_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own station forecast history" ON weather_forecast_history;
CREATE POLICY "Users read own station forecast history"
  ON weather_forecast_history FOR SELECT
  USING (
    station_id IN (SELECT id FROM weather_stations WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access on forecast history" ON weather_forecast_history;
CREATE POLICY "Service role full access on forecast history"
  ON weather_forecast_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE weather_forecast_history IS
  'Snapshot of each forecast run. Use with weather_data_hourly (is_forecast=false) to compute real forecast accuracy.';
