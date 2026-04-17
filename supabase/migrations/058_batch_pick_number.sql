-- Migration: Add pick_number to batches
-- Lets users record the pluk (1e/2e/3e/4e/5e) directly on a batch,
-- also when the batch is not linked to a harvest_registration.
-- Enriched view falls back to harvest_registrations.pick_number for bootstrapped batches.

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS pick_number INTEGER
  CHECK (pick_number IS NULL OR (pick_number >= 1 AND pick_number <= 5));

-- Rebuild v_batches_enriched so pick_number resolves from batches OR harvest_registrations.
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
  -- harvest_registration context (may be null for merged batches)
  hr.harvest_date,
  COALESCE(b.pick_number, hr.pick_number) AS pick_number,
  hr.total_crates,
  hr.weight_per_crate,
  hr.quality_class,
  hr.parcel_id,
  hr.sub_parcel_id,
  p.name AS parcel_name,
  sp.name AS sub_parcel_name,
  -- storage from view
  vcs.current_storage_cell_id,
  vcs.last_storage_event_type,
  vcs.last_storage_event_date,
  sc.name AS current_storage_cell_name,
  -- totals from view
  COALESCE(vbt.total_kg_in, 0) AS total_kg_in,
  COALESCE(vbt.total_kg_out, 0) AS total_kg_out,
  COALESCE(vbt.total_cost_eur, 0) AS total_cost_eur,
  COALESCE(vbt.total_revenue_eur, 0) AS total_revenue_eur,
  COALESCE(vbt.margin_eur, 0) AS margin_eur,
  COALESCE(vbt.event_count, 0) AS event_count
FROM batches b
LEFT JOIN harvest_registrations hr ON hr.id = b.harvest_registration_id
LEFT JOIN parcels p ON p.id = hr.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = hr.sub_parcel_id
LEFT JOIN v_batch_current_storage vcs ON vcs.batch_id = b.id
LEFT JOIN storage_cells sc ON sc.id = vcs.current_storage_cell_id
LEFT JOIN v_batch_totals vbt ON vbt.batch_id = b.id;
