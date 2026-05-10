-- ============================================================================
-- Migration 076: per-station rain bucket calibration
-- ============================================================================
-- The Dragino WSC2 tipping bucket reports a cumulative tip counter; each tip
-- represents some fixed amount of rainfall (mm). The factory factor varies
-- per model and unit, so the user calibrates by pouring a known volume and
-- counting the resulting tips. We store the per-station factor here so the
-- webhook can convert tip-deltas to mm without recompiling.
-- ============================================================================

ALTER TABLE physical_weather_stations
  ADD COLUMN IF NOT EXISTS mm_per_tip NUMERIC(5,3) NOT NULL DEFAULT 0.2;

COMMENT ON COLUMN physical_weather_stations.mm_per_tip IS
  'Calibration constant: each rain bucket tip equals this many mm of rainfall. '
  'Default 0.2 matches the Dragino WSC2 factory spec; calibrate by pouring a '
  'known volume into the funnel and dividing the resulting reference-mm by '
  'the observed tick delta.';
