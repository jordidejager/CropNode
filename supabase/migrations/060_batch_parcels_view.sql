-- Migration: Enriched view for batch_parcels with parcel/sub_parcel names
-- Purpose: Fast lookup of which parcels are linked to a batch, including display names.

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
  sp.parcel_id AS sub_parcel_parent_id
FROM batch_parcels bp
LEFT JOIN parcels p ON p.id = bp.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = bp.sub_parcel_id;

-- Respect underlying RLS (consistent with migration 059)
ALTER VIEW v_batch_parcels_enriched SET (security_invoker = on);
