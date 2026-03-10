-- ============================================================================
-- Migration 014: KNMI Observation Data
-- Adds tables for KNMI measured weather data (ground truth observations).
-- Public data shared across all users — no RLS needed.
-- ============================================================================

-- Table: knmi_stations
-- Static registry of KNMI automated weather stations.
CREATE TABLE IF NOT EXISTS knmi_stations (
  code INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DECIMAL(8,5) NOT NULL,
  longitude DECIMAL(8,5) NOT NULL,
  elevation_m DECIMAL(5,1),
  region TEXT,
  is_fruit_region BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: knmi_observations_hourly
-- Hourly measured data from KNMI stations.
CREATE TABLE IF NOT EXISTS knmi_observations_hourly (
  id BIGSERIAL PRIMARY KEY,
  station_code INTEGER NOT NULL REFERENCES knmi_stations(code),
  timestamp TIMESTAMPTZ NOT NULL,
  temperature_c DECIMAL(4,1),
  temperature_min_c DECIMAL(4,1),
  humidity_pct DECIMAL(4,1),
  precipitation_mm DECIMAL(5,1),
  precipitation_duration_hrs DECIMAL(3,1),
  wind_speed_ms DECIMAL(4,1),
  wind_direction INTEGER,
  wind_gust_ms DECIMAL(4,1),
  solar_radiation_jcm2 INTEGER,
  sunshine_hours DECIMAL(3,1),
  pressure_hpa DECIMAL(6,1),
  cloud_cover_octets INTEGER,
  dew_point_c DECIMAL(4,1),
  visibility_m INTEGER,
  data_source TEXT DEFAULT 'knmi_bulk',
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_knmi_hourly UNIQUE (station_code, timestamp)
);

CREATE INDEX idx_knmi_hourly_station_time
  ON knmi_observations_hourly(station_code, timestamp);

CREATE INDEX idx_knmi_hourly_timestamp
  ON knmi_observations_hourly(timestamp);

-- Table: knmi_observations_daily
-- Daily aggregations from hourly observations, pre-computed for fast chart rendering.
CREATE TABLE IF NOT EXISTS knmi_observations_daily (
  id BIGSERIAL PRIMARY KEY,
  station_code INTEGER NOT NULL REFERENCES knmi_stations(code),
  date DATE NOT NULL,
  temp_min_c DECIMAL(4,1),
  temp_max_c DECIMAL(4,1),
  temp_avg_c DECIMAL(4,1),
  precipitation_sum DECIMAL(5,1),
  humidity_avg_pct DECIMAL(4,1),
  wind_speed_max_ms DECIMAL(4,1),
  wind_speed_avg_ms DECIMAL(4,1),
  sunshine_hours DECIMAL(4,1),
  solar_radiation_sum INTEGER,
  et0_estimate_mm DECIMAL(5,2),
  pressure_avg_hpa DECIMAL(6,1),
  gdd_base5 DECIMAL(5,1),
  gdd_base10 DECIMAL(5,1),
  frost_hours INTEGER,
  leaf_wetness_hrs DECIMAL(4,1),
  data_source TEXT DEFAULT 'knmi_bulk',
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_knmi_daily UNIQUE (station_code, date)
);

CREATE INDEX idx_knmi_daily_station_date
  ON knmi_observations_daily(station_code, date);

-- Table: knmi_fetch_log
-- Tracks import status per station.
CREATE TABLE IF NOT EXISTS knmi_fetch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_code INTEGER NOT NULL REFERENCES knmi_stations(code),
  fetch_type TEXT NOT NULL,
  date_range_start DATE,
  date_range_end DATE,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  records_fetched INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_knmi_fetch_log_station
  ON knmi_fetch_log(station_code, fetch_type, fetched_at DESC);

-- Seed KNMI stations (fruit regions + reference stations)
INSERT INTO knmi_stations (code, name, latitude, longitude, elevation_m, region, is_fruit_region)
VALUES
  (210, 'Valkenburg',      52.171, 4.419, 0.0,   'Zuid-Holland',   false),
  (240, 'Schiphol',        52.301, 4.790, -3.3,  'Noord-Holland',  false),
  (260, 'De Bilt',         52.101, 5.180, 1.9,   'Utrecht',        true),
  (269, 'Lelystad',        52.458, 5.527, -3.4,  'Flevoland',      false),
  (270, 'Leeuwarden',      53.224, 5.752, -0.4,  'Friesland',      false),
  (275, 'Deelen',          52.060, 5.873, 48.0,  'Gelderland',     false),
  (280, 'Eelde',           53.124, 6.585, 5.2,   'Groningen',      false),
  (290, 'Twenthe',         52.274, 6.891, 34.8,  'Overijssel',     false),
  (310, 'Vlissingen',      51.442, 3.596, 8.0,   'Zeeland',        false),
  (323, 'Wilhelminadorp',  51.527, 3.884, 1.4,   'Zeeland',        true),
  (344, 'Rotterdam',       51.962, 4.447, -4.4,  'Zuid-Holland',    false),
  (348, 'Cabauw',          51.971, 4.927, -0.7,  'Zuid-Holland',    true),
  (350, 'Gilze-Rijen',     51.566, 4.936, 11.0,  'Noord-Brabant',  true),
  (356, 'Herwijnen',       51.858, 5.147, 0.7,   'Betuwe',         true),
  (370, 'Eindhoven',       51.451, 5.377, 22.6,  'Noord-Brabant',  true),
  (375, 'Volkel',          51.659, 5.707, 20.0,  'Noord-Brabant',  true),
  (377, 'Ell',             51.198, 5.764, 30.0,  'Limburg',        false),
  (380, 'Maastricht',      50.906, 5.762, 114.0, 'Limburg',        true),
  (391, 'Arcen',           51.498, 6.197, 19.0,  'Limburg',        true)
ON CONFLICT (code) DO NOTHING;

-- Function: find nearest KNMI station for given coordinates
CREATE OR REPLACE FUNCTION find_nearest_knmi_station(
  p_lat DECIMAL,
  p_lng DECIMAL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  nearest_code INTEGER;
BEGIN
  SELECT code INTO nearest_code
  FROM knmi_stations
  WHERE active = true
  ORDER BY
    -- Simplified distance using Pythagorean theorem (fine for NL-scale)
    SQRT(POWER((latitude - p_lat) * 111.0, 2) + POWER((longitude - p_lng) * 111.0 * COS(RADIANS(p_lat)), 2))
  LIMIT 1;

  RETURN nearest_code;
END;
$$;
