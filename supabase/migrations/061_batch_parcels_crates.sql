-- Migration: Add crates + kg_per_crate columns to batch_parcels
-- Rationale: growers often estimate weight via "N crates × ~kg per crate"
-- rather than a direct total weight. Both input modes must work.
--
-- batch_events already carries these values via jsonb `details` (no migration needed there).
--
-- NOTE on view: CREATE OR REPLACE VIEW in Postgres only allows APPENDING new
-- columns to the end of the SELECT list. That's why `crates` and `kg_per_crate`
-- are added at the tail, not inserted between existing columns.

ALTER TABLE batch_parcels
  ADD COLUMN IF NOT EXISTS crates INTEGER
    CHECK (crates IS NULL OR crates >= 0);

ALTER TABLE batch_parcels
  ADD COLUMN IF NOT EXISTS kg_per_crate NUMERIC
    CHECK (kg_per_crate IS NULL OR kg_per_crate >= 0);

-- Replace the enriched view. New columns MUST come at the end.
CREATE OR REPLACE VIEW v_batch_parcels_enriched AS
SELECT
  bp.id,
  bp.batch_id,
  bp.user_id,
  bp.parcel_id,
  bp.sub_parcel_id,
  bp.estimated_kg,
  bp.created_at,
  p.name AS parcel_name,
  sp.name AS sub_parcel_name,
  sp.variety AS sub_parcel_variety,
  sp.area AS sub_parcel_area,
  sp.parcel_id AS sub_parcel_parent_id,
  bp.crates,
  bp.kg_per_crate
FROM batch_parcels bp
LEFT JOIN parcels p ON p.id = bp.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = bp.sub_parcel_id;

ALTER VIEW v_batch_parcels_enriched SET (security_invoker = on);
