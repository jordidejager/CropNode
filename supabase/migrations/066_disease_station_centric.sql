-- Migration: Disease model refactor — station-centric instead of parcel-centric
--
-- Rationale: a weather station typically serves 1-2 locations but multiple
-- parcels. Since disease pressure is 100% weather-driven (at least the
-- simulation part), it's more efficient to key configs by weather_station_id
-- than by parcel_id. Users with 10 parcels on 2 stations now see 2 simulations
-- instead of 10.
--
-- Backward compat: parcel_id is kept for reference but no longer primary key.
-- The API resolves parcel_id → station_id for lookups.

-- Add station_id column
ALTER TABLE disease_model_config
  ADD COLUMN IF NOT EXISTS weather_station_id UUID REFERENCES weather_stations(id) ON DELETE CASCADE;

-- Backfill station_id from parcel → parcel_weather_stations
UPDATE disease_model_config dmc
SET weather_station_id = pws.station_id
FROM parcel_weather_stations pws
WHERE dmc.parcel_id = pws.parcel_id
  AND dmc.weather_station_id IS NULL;

-- Drop old unique constraint
ALTER TABLE disease_model_config
  DROP CONSTRAINT IF EXISTS disease_model_config_user_id_parcel_id_harvest_year_diseas_key;

-- New unique constraint: one config per station/disease/year per user
-- parcel_id is now optional metadata only
CREATE UNIQUE INDEX IF NOT EXISTS disease_model_config_user_station_year_type_unique
  ON disease_model_config (user_id, weather_station_id, harvest_year, disease_type)
  WHERE weather_station_id IS NOT NULL;

-- Index for fast station lookups
CREATE INDEX IF NOT EXISTS idx_disease_model_config_station
  ON disease_model_config (weather_station_id, harvest_year, disease_type);
