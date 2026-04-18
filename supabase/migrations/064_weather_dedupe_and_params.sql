-- ============================================================================
-- Migration 064: Fix weather data duplicates + add daily parameters
-- ============================================================================
-- Fix 1: Remove is_forecast from unique key on weather_data_hourly + weather_data_daily
--        This was causing 94% row duplication (old forecast + new observation
--        for the same timestamp coexisting).
-- Fix 5: Add new daily aggregation columns needed for expanded Open-Meteo params.
-- ============================================================================

-- === weather_data_hourly dedupe ===

-- Keep only the most recently inserted row per (station_id, timestamp, model_name).
-- This matters because newer rows tend to have is_forecast=false (observed) —
-- which is what we actually want to keep.
DELETE FROM weather_data_hourly t1
USING weather_data_hourly t2
WHERE t1.station_id = t2.station_id
  AND t1.timestamp = t2.timestamp
  AND t1.model_name = t2.model_name
  AND t1.created_at < t2.created_at;

-- Drop old constraint and add the natural one (without is_forecast).
ALTER TABLE weather_data_hourly
  DROP CONSTRAINT IF EXISTS weather_data_hourly_station_id_timestamp_model_name_is_f_key;
ALTER TABLE weather_data_hourly
  DROP CONSTRAINT IF EXISTS weather_data_hourly_station_id_timestamp_model_name_is_forecast_key;
ALTER TABLE weather_data_hourly
  DROP CONSTRAINT IF EXISTS weather_data_hourly_natural_key;

ALTER TABLE weather_data_hourly
  ADD CONSTRAINT weather_data_hourly_natural_key
  UNIQUE (station_id, timestamp, model_name);

-- === weather_data_daily dedupe ===

DELETE FROM weather_data_daily t1
USING weather_data_daily t2
WHERE t1.station_id = t2.station_id
  AND t1.date = t2.date
  AND t1.created_at < t2.created_at;

ALTER TABLE weather_data_daily
  DROP CONSTRAINT IF EXISTS weather_data_daily_station_id_date_is_forecast_key;
ALTER TABLE weather_data_daily
  DROP CONSTRAINT IF EXISTS weather_data_daily_natural_key;

ALTER TABLE weather_data_daily
  ADD CONSTRAINT weather_data_daily_natural_key
  UNIQUE (station_id, date);

-- === Expand weather_data_daily with new columns ===
-- These come from the expanded Open-Meteo DAILY_PARAMS.

ALTER TABLE weather_data_daily
  ADD COLUMN IF NOT EXISTS rain_sum_mm NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS precipitation_hours NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS wind_gusts_max_ms NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS uv_index_max NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS daylight_duration_s INTEGER,
  ADD COLUMN IF NOT EXISTS sunshine_duration_s INTEGER;

COMMENT ON COLUMN weather_data_daily.rain_sum_mm IS 'Daily rainfall (excludes snowfall), mm';
COMMENT ON COLUMN weather_data_daily.precipitation_hours IS 'Number of hours with precipitation > 0.1 mm';
COMMENT ON COLUMN weather_data_daily.wind_gusts_max_ms IS 'Daily max 10-min wind gust, m/s';
COMMENT ON COLUMN weather_data_daily.uv_index_max IS 'Daily max UV index (clear sky)';
COMMENT ON COLUMN weather_data_daily.daylight_duration_s IS 'Daylight duration, seconds';
COMMENT ON COLUMN weather_data_daily.sunshine_duration_s IS 'Sunshine duration (actual), seconds';
