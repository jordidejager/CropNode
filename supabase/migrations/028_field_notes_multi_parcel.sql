-- Migration 028: Support multiple parcels per field note
-- Adds parcel_ids TEXT[] alongside existing parcel_id (kept for parcel filter compatibility)

ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS parcel_ids TEXT[] DEFAULT '{}';

-- Migrate existing single parcel_id to parcel_ids array
UPDATE field_notes
  SET parcel_ids = ARRAY[parcel_id]
  WHERE parcel_id IS NOT NULL
    AND (parcel_ids IS NULL OR array_length(parcel_ids, 1) IS NULL);

-- Index for array containment queries (@> operator)
CREATE INDEX IF NOT EXISTS idx_field_notes_parcel_ids
  ON field_notes USING gin(parcel_ids);
