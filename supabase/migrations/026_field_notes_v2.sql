-- Migration 026: Field Notes V2 — Auto-tagging, Parcel linkage, Source tracking
-- Adds: source column, parcel_id column (TEXT FK to sub_parcels.id), indexes

-- ============================================
-- 1. ADD source COLUMN
-- ============================================

ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'web'
  CHECK (source IN ('web', 'whatsapp', 'voice'));

-- ============================================
-- 2. ADD parcel_id COLUMN
-- sub_parcels.id is TEXT (not UUID) — confirmed from existing migrations
-- ============================================

ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL;

-- ============================================
-- 3. ADD INDEXES
-- ============================================

-- Index for parcel-based filtering
CREATE INDEX IF NOT EXISTS idx_field_notes_parcel
  ON field_notes(parcel_id)
  WHERE parcel_id IS NOT NULL;

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_field_notes_source
  ON field_notes(user_id, source);

-- Index for auto_tag filtering (column exists but lacked index)
CREATE INDEX IF NOT EXISTS idx_field_notes_tag
  ON field_notes(user_id, auto_tag)
  WHERE auto_tag IS NOT NULL;
