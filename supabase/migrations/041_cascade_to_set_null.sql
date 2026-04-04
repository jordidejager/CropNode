-- Migration: Change CASCADE to SET NULL on sub_parcels → parcels
--
-- Rationale: Deleting a parcel should NOT cascade-delete sub_parcels,
-- because that would destroy all linked spray registrations, harvest data,
-- and task logs. Instead, set parcel_id to NULL to preserve historical data.
--
-- Also changes parcel_profiles and soil_analyses to SET NULL for safety.

-- Step 1: sub_parcels.parcel_id → SET NULL instead of CASCADE
ALTER TABLE sub_parcels
  DROP CONSTRAINT IF EXISTS sub_parcels_parcel_id_fkey;

ALTER TABLE sub_parcels
  ADD CONSTRAINT sub_parcels_parcel_id_fkey
  FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE SET NULL;

-- Step 2: parcel_profiles → SET NULL
ALTER TABLE parcel_profiles
  DROP CONSTRAINT IF EXISTS parcel_profiles_parcel_id_fkey;

ALTER TABLE parcel_profiles
  ADD CONSTRAINT parcel_profiles_parcel_id_fkey
  FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE SET NULL;

ALTER TABLE parcel_profiles
  DROP CONSTRAINT IF EXISTS parcel_profiles_sub_parcel_id_fkey;

ALTER TABLE parcel_profiles
  ADD CONSTRAINT parcel_profiles_sub_parcel_id_fkey
  FOREIGN KEY (sub_parcel_id) REFERENCES sub_parcels(id) ON DELETE SET NULL;

-- Step 3: soil_analyses → SET NULL
ALTER TABLE soil_analyses
  DROP CONSTRAINT IF EXISTS soil_analyses_parcel_id_fkey;

ALTER TABLE soil_analyses
  ADD CONSTRAINT soil_analyses_parcel_id_fkey
  FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE SET NULL;

ALTER TABLE soil_analyses
  DROP CONSTRAINT IF EXISTS soil_analyses_sub_parcel_id_fkey;

ALTER TABLE soil_analyses
  ADD CONSTRAINT soil_analyses_sub_parcel_id_fkey
  FOREIGN KEY (sub_parcel_id) REFERENCES sub_parcels(id) ON DELETE SET NULL;

-- Step 4: brp_gewashistorie → SET NULL
ALTER TABLE brp_gewashistorie
  DROP CONSTRAINT IF EXISTS brp_gewashistorie_parcel_id_fkey;

ALTER TABLE brp_gewashistorie
  ADD CONSTRAINT brp_gewashistorie_parcel_id_fkey
  FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE SET NULL;
