-- ============================================================================
-- Migration 080: Soil + leaf sensor support for physical_weather_stations
-- ============================================================================
-- Adds the data columns produced by Dragino SE01-LS (soil moisture + EC + temp)
-- and LMS01-LS (leaf wetness + temp) to weather_measurements.
--
-- These two sensors are separate LoRaWAN devices (each its own DevEUI), so
-- they live as their own row in physical_weather_stations, but they share
-- the same time-series table. NULL columns when a particular row comes from
-- a different sensor type.
--
-- device_kind on physical_weather_stations lets the decoder + UI route on
-- model. Keeps hardware_model as the friendly label for display.
-- ============================================================================

ALTER TABLE physical_weather_stations
  ADD COLUMN IF NOT EXISTS device_kind TEXT;

-- Backfill: existing WSC2 stations get 'weather'. New SE01 / LMS01 rows will
-- be inserted with explicit values by the registration endpoint.
UPDATE physical_weather_stations
SET device_kind = 'weather'
WHERE device_kind IS NULL;

-- Constrain to known values (extendable later)
ALTER TABLE physical_weather_stations
  DROP CONSTRAINT IF EXISTS physical_weather_stations_device_kind_check;
ALTER TABLE physical_weather_stations
  ADD CONSTRAINT physical_weather_stations_device_kind_check
  CHECK (device_kind IN ('weather', 'soil', 'leaf', 'temp_probe'));

COMMENT ON COLUMN physical_weather_stations.device_kind IS
  'Sensor family: weather (WSC2 full station), soil (SE01-LS VWC+EC+temp), '
  'leaf (LMS01-LS wetness+temp), temp_probe (TS01 / DS18B20 extension).';

-- ---- weather_measurements: soil + leaf columns ----

ALTER TABLE weather_measurements
  -- SE01-LS (soil)
  ADD COLUMN IF NOT EXISTS soil_moisture_pct NUMERIC(5,2),       -- volumetric water content, %
  ADD COLUMN IF NOT EXISTS soil_temp_c NUMERIC(5,2),             -- soil temperature, °C
  ADD COLUMN IF NOT EXISTS soil_conductivity_us_cm INTEGER,      -- EC, µS/cm
  -- LMS01-LS (leaf)
  ADD COLUMN IF NOT EXISTS leaf_wetness_pct_measured NUMERIC(5,2), -- measured wetness, %
  ADD COLUMN IF NOT EXISTS leaf_temp_c NUMERIC(5,2);             -- leaf surface temperature, °C

COMMENT ON COLUMN weather_measurements.soil_moisture_pct IS
  'Volumetric water content from SE01-LS, percentage (0-100).';
COMMENT ON COLUMN weather_measurements.soil_conductivity_us_cm IS
  'Soil bulk electrical conductivity from SE01-LS, µS/cm.';
COMMENT ON COLUMN weather_measurements.leaf_wetness_pct_measured IS
  'Directly-measured leaf wetness from LMS01-LS (separate from the existing '
  'leaf_wetness_pct which is estimated from RV+dewpoint on WSC2 data).';
COMMENT ON COLUMN weather_measurements.leaf_temp_c IS
  'Leaf surface temperature from LMS01-LS, °C — relevant for dew point '
  'comparison + frost-on-leaf detection.';

-- Useful index for the disease model: fetch leaf wetness time-series quickly
CREATE INDEX IF NOT EXISTS idx_wm_leaf_wetness_time
  ON weather_measurements (station_id, measured_at DESC)
  WHERE leaf_wetness_pct_measured IS NOT NULL;
