-- ============================================================================
-- Migration 072: Dedupe weather_measurements by (station_id, measured_at)
-- ============================================================================
-- Frame counters reset to 0/1 on every LoRaWAN rejoin, so after a rejoin
-- the new session's fc=1 collides with the old session's fc=1 and all new
-- measurements get silently skipped by ignoreDuplicates=true.
--
-- Timestamps are unique per uplink regardless of session, so switch the
-- natural key to (station_id, measured_at).
--
-- frame_counter is still stored, just no longer part of the unique key.
-- ============================================================================

-- Drop the old constraint
ALTER TABLE weather_measurements
  DROP CONSTRAINT IF EXISTS weather_measurements_natural_key;

-- Clean any timestamp duplicates before adding the new constraint.
-- Keep the row with the highest id (i.e. most recently inserted) — this is
-- the safe choice when we re-received the same uplink twice via multiple
-- gateways and only one of them made it through.
DELETE FROM weather_measurements w1
USING weather_measurements w2
WHERE w1.station_id = w2.station_id
  AND w1.measured_at = w2.measured_at
  AND w1.id < w2.id;

-- New constraint: one row per (station, timestamp)
ALTER TABLE weather_measurements
  ADD CONSTRAINT weather_measurements_natural_key
  UNIQUE (station_id, measured_at);
