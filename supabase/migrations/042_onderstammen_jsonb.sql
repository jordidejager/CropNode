-- Migration 042: Onderstam → Onderstammen (JSONB weighted array)
-- Ondersteunt meerdere onderstammen met percentages:
-- [{ "value": "Kwee MC", "percentage": 70 }, { "value": "Kwee Adams", "percentage": 30 }]

-- Voeg nieuwe kolom toe
ALTER TABLE parcel_profiles ADD COLUMN IF NOT EXISTS onderstammen JSONB DEFAULT '[]'::jsonb;

-- Migreer bestaande data van onderstam (TEXT) naar onderstammen (JSONB)
UPDATE parcel_profiles
SET onderstammen = jsonb_build_array(jsonb_build_object('value', onderstam, 'percentage', 100))
WHERE onderstam IS NOT NULL AND onderstam != '';

-- Drop oude kolom
ALTER TABLE parcel_profiles DROP COLUMN IF EXISTS onderstam;
