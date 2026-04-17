-- Migration: Add total_crates to batches
-- Rationale: a grower typically knows the total number of crates up front,
-- but not the total kg. Tracking total_crates on the batch lets us:
--   1) cap how many crates can be assigned per parcel via batch_parcels.crates
--   2) derive kg_per_crate when total kg becomes known from sortering/afzet events
--
-- NOTE on view: CREATE OR REPLACE VIEW in Postgres only allows APPENDING new
-- columns to the end of the SELECT list; existing columns keep their name and
-- order. batches.total_crates is therefore exposed as `batch_total_crates` at
-- the end, while the existing `total_crates` column (from harvest_registrations)
-- stays unchanged for backward compatibility.

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS total_crates INTEGER
    CHECK (total_crates IS NULL OR total_crates >= 0);

-- Rebuild v_batches_enriched — append b.total_crates at the end as `batch_total_crates`.
CREATE OR REPLACE VIEW v_batches_enriched AS
SELECT
  b.id,
  b.user_id,
  b.harvest_registration_id,
  b.label,
  b.variety,
  b.season,
  b.harvest_year,
  b.status,
  b.reserved_for,
  b.notes,
  b.created_at,
  b.updated_at,
  hr.harvest_date,
  COALESCE(b.pick_number, hr.pick_number) AS pick_number,
  hr.total_crates,
  hr.weight_per_crate,
  hr.quality_class,
  hr.parcel_id,
  hr.sub_parcel_id,
  p.name AS parcel_name,
  sp.name AS sub_parcel_name,
  vcs.current_storage_cell_id,
  vcs.last_storage_event_type,
  vcs.last_storage_event_date,
  sc.name AS current_storage_cell_name,
  COALESCE(vbt.total_kg_in, 0) AS total_kg_in,
  COALESCE(vbt.total_kg_out, 0) AS total_kg_out,
  COALESCE(vbt.total_cost_eur, 0) AS total_cost_eur,
  COALESCE(vbt.total_revenue_eur, 0) AS total_revenue_eur,
  COALESCE(vbt.margin_eur, 0) AS margin_eur,
  COALESCE(vbt.event_count, 0) AS event_count,
  b.total_crates AS batch_total_crates
FROM batches b
LEFT JOIN harvest_registrations hr ON hr.id = b.harvest_registration_id
LEFT JOIN parcels p ON p.id = hr.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = hr.sub_parcel_id
LEFT JOIN v_batch_current_storage vcs ON vcs.batch_id = b.id
LEFT JOIN storage_cells sc ON sc.id = vcs.current_storage_cell_id
LEFT JOIN v_batch_totals vbt ON vbt.batch_id = b.id;

ALTER VIEW v_batches_enriched SET (security_invoker = on);
