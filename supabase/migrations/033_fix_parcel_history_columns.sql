-- ============================================
-- Fix parcel_history: add missing columns that code already expects
-- Without these, addParcelHistoryEntries() silently fails
-- and interval validation never works.
-- ============================================

ALTER TABLE parcel_history ADD COLUMN IF NOT EXISTS log_id TEXT;
ALTER TABLE parcel_history ADD COLUMN IF NOT EXISTS spuitschrift_id TEXT;

CREATE INDEX IF NOT EXISTS idx_parcel_history_spuitschrift
  ON parcel_history(spuitschrift_id) WHERE spuitschrift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parcel_history_log
  ON parcel_history(log_id) WHERE log_id IS NOT NULL;
