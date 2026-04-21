-- Performance: add missing FK indexes that block JOIN performance on views
-- v_sprayable_parcels, v_task_logs_enriched, v_active_task_sessions_enriched

-- sub_parcels JOIN to parcels (used in v_sprayable_parcels + many queries)
CREATE INDEX IF NOT EXISTS idx_sub_parcels_parcel_id ON sub_parcels(parcel_id);

-- cell_sub_parcels JOIN to sub_parcels (storage views)
CREATE INDEX IF NOT EXISTS idx_cell_sub_parcels_sub_parcel ON cell_sub_parcels(sub_parcel_id);

-- spuitschrift filtered by harvest_year + registration_type
CREATE INDEX IF NOT EXISTS idx_spuitschrift_harvest_year ON spuitschrift(harvest_year);
CREATE INDEX IF NOT EXISTS idx_spuitschrift_registration_type ON spuitschrift(registration_type);

-- parcel_history lookups
CREATE INDEX IF NOT EXISTS idx_parcel_history_spuitschrift_id ON parcel_history(spuitschrift_id);
CREATE INDEX IF NOT EXISTS idx_parcel_history_harvest_year ON parcel_history(harvest_year);
