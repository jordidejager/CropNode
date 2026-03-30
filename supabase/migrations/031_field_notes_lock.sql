-- Migration 031: Add lock feature to field notes
-- Locked notes are hidden from default views (privacy/NVWA)

ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_field_notes_locked
  ON field_notes(user_id, is_locked)
  WHERE is_locked = true;
