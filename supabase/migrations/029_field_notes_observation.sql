-- Migration 029: Add observation metadata to field_notes
-- Stores the pest/disease/disorder subject and category detected by AI

ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS observation_subject TEXT,
  ADD COLUMN IF NOT EXISTS observation_category TEXT
    CHECK (observation_category IN ('insect', 'schimmel', 'ziekte', 'fysiologisch', 'overig'));

CREATE INDEX IF NOT EXISTS idx_field_notes_observation_category
  ON field_notes(observation_category)
  WHERE observation_category IS NOT NULL;
