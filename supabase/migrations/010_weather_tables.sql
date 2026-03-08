-- Migration: Weather Hub - Core Infrastructure
-- Adds weather stations, hourly/daily weather data, fetch logging, and parcel-station coupling.
-- NOTE: weather_data_hourly may need partitioning by timestamp (monthly/yearly) at scale.

-- ============================================================================
-- Table: weather_stations
-- Links a parcel location to its weather data point.
-- Multiple parcels within ~1km share one station (coordinates rounded to 2 decimals).
-- ============================================================================

CREATE TABLE IF NOT EXISTS weather_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  latitude DECIMAL(8,5) NOT NULL,
  longitude DECIMAL(8,5) NOT NULL,
  elevation_m INTEGER,
  timezone TEXT DEFAULT 'Europe/Amsterdam',
  knmi_station_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique per user + rounded location (prevents duplicate stations for same area)
CREATE UNIQUE INDEX idx_weather_stations_user_location
  ON weather_stations(user_id, latitude, longitude);

ALTER TABLE weather_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weather_stations"
  ON weather_stations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weather_stations"
  ON weather_stations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weather_stations"
  ON weather_stations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own weather_stations"
  ON weather_stations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER weather_stations_updated_at
  BEFORE UPDATE ON weather_stations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Table: weather_data_hourly
-- Hourly weather measurements - the core data layer.
-- NOTE: At scale, consider partitioning by timestamp (monthly or yearly).
-- ============================================================================

CREATE TABLE IF NOT EXISTS weather_data_hourly (
  id BIGSERIAL PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  model_name TEXT NOT NULL DEFAULT 'best_match',
  temperature_c DECIMAL(4,1),
  humidity_pct DECIMAL(4,1),
  precipitation_mm DECIMAL(5,1),
  wind_speed_ms DECIMAL(4,1),
  wind_direction INTEGER,
  wind_gusts_ms DECIMAL(4,1),
  leaf_wetness_pct DECIMAL(4,1),
  soil_temp_6cm DECIMAL(4,1),
  solar_radiation DECIMAL(6,1),
  et0_mm DECIMAL(4,2),
  cloud_cover_pct INTEGER,
  dew_point_c DECIMAL(4,1),
  is_forecast BOOLEAN DEFAULT false,
  data_source TEXT DEFAULT 'open-meteo',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prevents duplicate entries for the same station/time/model/forecast combo
CREATE UNIQUE INDEX idx_weather_hourly_unique
  ON weather_data_hourly(station_id, timestamp, model_name, is_forecast);

-- Fast range queries per station + model
CREATE INDEX idx_weather_hourly_station_time_model
  ON weather_data_hourly(station_id, timestamp, model_name);

-- Global time queries
CREATE INDEX idx_weather_hourly_timestamp
  ON weather_data_hourly(timestamp);

ALTER TABLE weather_data_hourly ENABLE ROW LEVEL SECURITY;

-- RLS via station ownership
CREATE POLICY "Users can view own weather_data_hourly"
  ON weather_data_hourly FOR SELECT
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own weather_data_hourly"
  ON weather_data_hourly FOR INSERT
  WITH CHECK (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own weather_data_hourly"
  ON weather_data_hourly FOR UPDATE
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own weather_data_hourly"
  ON weather_data_hourly FOR DELETE
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- Table: weather_data_daily
-- Daily aggregations computed from hourly data.
-- Used for season comparisons and charts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS weather_data_daily (
  id BIGSERIAL PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  temp_min_c DECIMAL(4,1),
  temp_max_c DECIMAL(4,1),
  temp_avg_c DECIMAL(4,1),
  precipitation_sum DECIMAL(5,1),
  humidity_avg_pct DECIMAL(4,1),
  wind_speed_max_ms DECIMAL(4,1),
  wind_speed_avg_ms DECIMAL(4,1),
  leaf_wetness_hrs DECIMAL(4,1),
  et0_sum_mm DECIMAL(5,2),
  solar_radiation_sum DECIMAL(8,1),
  gdd_base5 DECIMAL(5,1),
  gdd_base10 DECIMAL(5,1),
  frost_hours INTEGER,
  is_forecast BOOLEAN DEFAULT false,
  data_source TEXT DEFAULT 'open-meteo',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_weather_daily_unique
  ON weather_data_daily(station_id, date, is_forecast);

CREATE INDEX idx_weather_daily_station_date
  ON weather_data_daily(station_id, date);

ALTER TABLE weather_data_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weather_data_daily"
  ON weather_data_daily FOR SELECT
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own weather_data_daily"
  ON weather_data_daily FOR INSERT
  WITH CHECK (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own weather_data_daily"
  ON weather_data_daily FOR UPDATE
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own weather_data_daily"
  ON weather_data_daily FOR DELETE
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- Table: weather_ensemble_hourly
-- Ensemble/pluim data per model per member.
-- Only 4 variables to limit data volume (51 members x ~360 hrs = ~18k rows/refresh).
-- ============================================================================

CREATE TABLE IF NOT EXISTS weather_ensemble_hourly (
  id BIGSERIAL PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  model_name TEXT NOT NULL,       -- 'ecmwf_ifs' or 'gfs'
  member INTEGER NOT NULL,        -- ensemble member number (0-50 ECMWF, 0-30 GFS)
  temperature_c DECIMAL(4,1),
  precipitation_mm DECIMAL(5,1),
  wind_speed_ms DECIMAL(4,1),
  humidity_pct DECIMAL(4,1),
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_ensemble_hourly UNIQUE (station_id, timestamp, model_name, member)
);

CREATE INDEX idx_ensemble_station_time_model
  ON weather_ensemble_hourly(station_id, timestamp, model_name);

CREATE INDEX idx_ensemble_station_time
  ON weather_ensemble_hourly(station_id, timestamp);

ALTER TABLE weather_ensemble_hourly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weather_ensemble_hourly"
  ON weather_ensemble_hourly FOR SELECT
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own weather_ensemble_hourly"
  ON weather_ensemble_hourly FOR INSERT
  WITH CHECK (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own weather_ensemble_hourly"
  ON weather_ensemble_hourly FOR UPDATE
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own weather_ensemble_hourly"
  ON weather_ensemble_hourly FOR DELETE
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- Table: weather_fetch_log
-- Tracks when data was last fetched per station to prevent unnecessary API calls.
-- fetch_type values: 'forecast', 'historical', 'current',
--   'forecast_multimodel', 'forecast_ensemble'
-- ============================================================================

CREATE TABLE IF NOT EXISTS weather_fetch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  fetch_type TEXT NOT NULL,  -- 'forecast', 'historical', 'current'
  date_range_start DATE,
  date_range_end DATE,
  status TEXT DEFAULT 'success',  -- 'success', 'error', 'partial'
  error_message TEXT,
  records_fetched INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_weather_fetch_log_station_type
  ON weather_fetch_log(station_id, fetch_type, fetched_at DESC);

ALTER TABLE weather_fetch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weather_fetch_log"
  ON weather_fetch_log FOR SELECT
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own weather_fetch_log"
  ON weather_fetch_log FOR INSERT
  WITH CHECK (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- Table: parcel_weather_stations
-- Links parcels to weather stations (many parcels to one station).
-- Uses TEXT PK to match parcels.id type.
-- ============================================================================

CREATE TABLE IF NOT EXISTS parcel_weather_stations (
  parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  PRIMARY KEY (parcel_id)
);

CREATE INDEX idx_parcel_weather_stations_station
  ON parcel_weather_stations(station_id);

ALTER TABLE parcel_weather_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own parcel_weather_stations"
  ON parcel_weather_stations FOR SELECT
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own parcel_weather_stations"
  ON parcel_weather_stations FOR INSERT
  WITH CHECK (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own parcel_weather_stations"
  ON parcel_weather_stations FOR DELETE
  USING (
    station_id IN (
      SELECT id FROM weather_stations WHERE user_id = auth.uid()
    )
  );


-- ============================================================================
-- Function: get_or_create_weather_station
-- Rounds coordinates to 2 decimals (~1km). Reuses existing station if nearby.
-- ============================================================================

-- ============================================================================
-- Function: get_ensemble_stats
-- Computes percentile statistics per timestamp for ensemble data.
-- Uses PERCENTILE_CONT (not available via PostgREST directly).
-- ============================================================================

CREATE OR REPLACE FUNCTION get_ensemble_stats(
  p_station_id UUID,
  p_model_name TEXT,
  p_column_name TEXT
)
RETURNS TABLE (
  "timestamp" TIMESTAMPTZ,
  "min" DECIMAL,
  p10 DECIMAL,
  p25 DECIMAL,
  "median" DECIMAL,
  p75 DECIMAL,
  p90 DECIMAL,
  "max" DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_column_name NOT IN ('temperature_c', 'precipitation_mm', 'wind_speed_ms', 'humidity_pct') THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column_name;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT
       e."timestamp",
       MIN(e.%I)::DECIMAL AS "min",
       (PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY e.%I))::DECIMAL AS p10,
       (PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY e.%I))::DECIMAL AS p25,
       (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY e.%I))::DECIMAL AS "median",
       (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY e.%I))::DECIMAL AS p75,
       (PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY e.%I))::DECIMAL AS p90,
       MAX(e.%I)::DECIMAL AS "max"
     FROM weather_ensemble_hourly e
     WHERE e.station_id = $1
       AND e.model_name = $2
     GROUP BY e."timestamp"
     ORDER BY e."timestamp"',
    p_column_name, p_column_name, p_column_name, p_column_name,
    p_column_name, p_column_name, p_column_name
  )
  USING p_station_id, p_model_name;
END;
$$;


-- ============================================================================
-- Function: get_or_create_weather_station
-- Rounds coordinates to 2 decimals (~1km). Reuses existing station if nearby.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_weather_station(
  p_user_id UUID,
  p_lat DECIMAL,
  p_lng DECIMAL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rounded_lat DECIMAL(8,5);
  rounded_lng DECIMAL(8,5);
  station_id UUID;
BEGIN
  rounded_lat := ROUND(p_lat::numeric, 2);
  rounded_lng := ROUND(p_lng::numeric, 2);

  -- Try to find existing station at rounded coordinates
  SELECT id INTO station_id
  FROM weather_stations
  WHERE user_id = p_user_id
    AND latitude = rounded_lat
    AND longitude = rounded_lng;

  -- Create new station if not found
  IF station_id IS NULL THEN
    INSERT INTO weather_stations (user_id, latitude, longitude)
    VALUES (p_user_id, rounded_lat, rounded_lng)
    RETURNING id INTO station_id;
  END IF;

  RETURN station_id;
END;
$$;
