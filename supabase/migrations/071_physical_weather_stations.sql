-- ============================================================================
-- Migration 071: Physical weather stations + measurements (TTN / LoRaWAN)
-- ============================================================================
-- Separate from the existing weather_stations table, which represents
-- Open-Meteo API virtual stations (forecast + historical, lat/lng based).
--
-- Physical stations are real hardware (Dragino WSC2 etc.) that push
-- observations via The Things Network webhooks. They can be linked to a
-- parcel and coexist with the virtual API station for the same location.
-- ============================================================================

-- ---- Physical stations (one per deployed device) ----
CREATE TABLE IF NOT EXISTS physical_weather_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- TTN identifiers
  device_id TEXT UNIQUE NOT NULL,           -- e.g. 'wsc2-kapelle1'
  dev_eui TEXT UNIQUE NOT NULL,             -- e.g. 'A840416C95611BAD'
  application_id TEXT NOT NULL,             -- e.g. 'cropnode-weerstation'

  -- Metadata / provenance
  label TEXT,                               -- friendly name, e.g. 'Kapelle perceel 1'
  hardware_model TEXT DEFAULT 'WSC2-Compact-LS',
  firmware_version TEXT,

  -- Location + parcel linkage (parcel is optional — station can exist before linking)
  parcel_id UUID REFERENCES parcels(id) ON DELETE SET NULL,
  latitude NUMERIC(8,5),
  longitude NUMERIC(8,5),
  elevation_m INTEGER,

  -- Virtual-station mirror: when a physical station is linked we ALSO create a
  -- matching row in weather_stations so the rest of Weather Hub (forecasts,
  -- multi-model, ensemble) automatically works at the same coordinates.
  virtual_station_id UUID REFERENCES weather_stations(id) ON DELETE SET NULL,

  -- State
  active BOOLEAN NOT NULL DEFAULT TRUE,
  installed_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,                 -- last successful uplink
  last_frame_counter INTEGER,               -- latest seen frame counter (for dedup)

  -- Housekeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pws_user ON physical_weather_stations (user_id);
CREATE INDEX IF NOT EXISTS idx_pws_parcel ON physical_weather_stations (parcel_id);
CREATE INDEX IF NOT EXISTS idx_pws_last_seen ON physical_weather_stations (last_seen_at DESC);

-- ---- Measurements (time-series) ----
CREATE TABLE IF NOT EXISTS weather_measurements (
  id BIGSERIAL PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES physical_weather_stations(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL,

  -- LoRaWAN metadata
  frame_counter INTEGER NOT NULL,
  f_port SMALLINT,

  -- Core sensor values (from decoded_payload)
  temperature_c NUMERIC(5,2),
  humidity_pct NUMERIC(5,2),
  pressure_hpa NUMERIC(6,1),
  illuminance_lux INTEGER,
  rain_counter INTEGER,                     -- cumulative tips, NOT per interval
  battery_v NUMERIC(4,3),

  -- Derived values (computed in webhook handler)
  rainfall_mm NUMERIC(5,2),                 -- diff of rain_counter * 0.1mm
  dew_point_c NUMERIC(5,2),                 -- Magnus formula
  wet_bulb_c NUMERIC(5,2),                  -- Stull approximation
  battery_status TEXT,                      -- good|low|critical

  -- Gateway / signal quality
  rssi_dbm SMALLINT,
  snr_db NUMERIC(4,1),
  gateway_count SMALLINT,

  -- Raw payload for debugging / later re-decoding
  raw_payload JSONB,

  -- Analytics helper
  harvest_year INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Dedup: the same (station, frame) should never appear twice.
  -- TTN does retransmit occasionally on gateway level.
  CONSTRAINT weather_measurements_natural_key UNIQUE (station_id, frame_counter)
);

CREATE INDEX IF NOT EXISTS idx_wm_station_time
  ON weather_measurements (station_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_harvest_year
  ON weather_measurements (harvest_year);
CREATE INDEX IF NOT EXISTS idx_wm_time
  ON weather_measurements (measured_at DESC);

-- ---- Webhook error log (for debugging bad uplinks without losing the raw body) ----
CREATE TABLE IF NOT EXISTS ttn_webhook_errors (
  id BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id TEXT,
  error_message TEXT NOT NULL,
  raw_body JSONB,
  ip_address INET,
  http_status SMALLINT
);

CREATE INDEX IF NOT EXISTS idx_ttn_err_device_time
  ON ttn_webhook_errors (device_id, received_at DESC);

-- ---- RLS ----
ALTER TABLE physical_weather_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ttn_webhook_errors ENABLE ROW LEVEL SECURITY;

-- Users read/update their own stations; service role has full access
DROP POLICY IF EXISTS pws_own_select ON physical_weather_stations;
CREATE POLICY pws_own_select ON physical_weather_stations
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS pws_own_modify ON physical_weather_stations;
CREATE POLICY pws_own_modify ON physical_weather_stations
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS pws_service_all ON physical_weather_stations;
CREATE POLICY pws_service_all ON physical_weather_stations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wm_own_select ON weather_measurements;
CREATE POLICY wm_own_select ON weather_measurements
  FOR SELECT USING (
    station_id IN (SELECT id FROM physical_weather_stations WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS wm_service_all ON weather_measurements;
CREATE POLICY wm_service_all ON weather_measurements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Only service role writes to the error log; users see their own device errors
DROP POLICY IF EXISTS ttn_err_own_select ON ttn_webhook_errors;
CREATE POLICY ttn_err_own_select ON ttn_webhook_errors
  FOR SELECT USING (
    device_id IN (SELECT device_id FROM physical_weather_stations WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS ttn_err_service_all ON ttn_webhook_errors;
CREATE POLICY ttn_err_service_all ON ttn_webhook_errors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---- updated_at trigger ----
CREATE OR REPLACE FUNCTION update_physical_weather_stations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pws_updated_at ON physical_weather_stations;
CREATE TRIGGER trg_pws_updated_at
  BEFORE UPDATE ON physical_weather_stations
  FOR EACH ROW
  EXECUTE FUNCTION update_physical_weather_stations_updated_at();

COMMENT ON TABLE physical_weather_stations IS
  'Real hardware weather stations (e.g. Dragino WSC2) connected via LoRaWAN/TTN.';
COMMENT ON TABLE weather_measurements IS
  'Time-series of observed values from physical stations. One row per LoRaWAN uplink.';
COMMENT ON TABLE ttn_webhook_errors IS
  'Audit log for failed TTN webhook calls — keeps raw body so we can replay after fixes.';
