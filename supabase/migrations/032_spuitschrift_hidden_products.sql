-- Migration 032: Product hiding for spuitschrift entries
-- Allows telers to hide individual products from the official record.
-- Hidden products are moved from `products` to `hidden_products` JSONB array.

-- Hidden products storage on spuitschrift
ALTER TABLE spuitschrift
  ADD COLUMN IF NOT EXISTS hidden_products JSONB DEFAULT '[]'::jsonb;

-- Link field_notes to spuitschrift (for transferred registrations)
ALTER TABLE field_notes
  ADD COLUMN IF NOT EXISTS spuitschrift_id TEXT;

CREATE INDEX IF NOT EXISTS idx_field_notes_spuitschrift
  ON field_notes(spuitschrift_id)
  WHERE spuitschrift_id IS NOT NULL;
