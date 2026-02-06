-- ============================================
-- View: v_sprayable_parcels
-- ============================================
-- Purpose: Sub-parcels are the "unit of work" for spraying.
-- This view flattens sub_parcels + parcels into a single, easy-to-query list.
--
-- Key decisions:
-- - ID comes from sub_parcels (this is what the frontend uses)
-- - Name is generated: "ParcelName SubParcelName (Variety)" or "ParcelName (Variety)"
-- - Area comes from sub_parcels (accurate for calculations)
-- - Crop/Variety come from sub_parcels
--
-- Usage: SELECT * FROM v_sprayable_parcels WHERE crop = 'Peer'
-- ============================================

-- Drop existing views (clean slate)
DROP VIEW IF EXISTS v_sprayable_parcels;
DROP VIEW IF EXISTS v_active_parcels;

-- Create the new flattened view
-- Uses LEFT JOIN to handle cases where sub_parcels.parcel_id doesn't match parcels.id
CREATE VIEW v_sprayable_parcels AS
SELECT
    sp.id,
    -- Generate readable name: "ParcelName SubParcelName (Variety)" or fallback to sub_parcel info only
    CASE
        WHEN p.name IS NOT NULL AND sp.name IS NOT NULL AND sp.name != '' THEN
            CONCAT(p.name, ' ', sp.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
        WHEN p.name IS NOT NULL THEN
            CONCAT(p.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
        WHEN sp.name IS NOT NULL AND sp.name != '' THEN
            -- No parent parcel: use sub_parcel name directly
            CONCAT(sp.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
        ELSE
            -- No names at all: use crop/variety
            CONCAT(COALESCE(sp.crop, 'Perceel'), ' ', COALESCE(sp.variety, ''), ' - ', LEFT(sp.id::text, 8))
    END AS name,
    sp.area,
    sp.crop,
    sp.variety,
    -- Keep parent parcel info for reference (may be NULL with LEFT JOIN)
    p.id AS parcel_id,
    p.name AS parcel_name,
    p.location,
    p.geometry,
    p.source,
    p.rvo_id,
    -- Metadata
    sp.created_at,
    sp.updated_at
FROM
    sub_parcels sp
LEFT JOIN
    parcels p ON sp.parcel_id = p.id
ORDER BY
    COALESCE(p.name, sp.name, sp.crop), sp.name;

-- ============================================
-- Test the view
-- ============================================
-- SELECT * FROM v_sprayable_parcels LIMIT 10;
-- SELECT id, name, crop, variety, area FROM v_sprayable_parcels;
-- SELECT * FROM v_sprayable_parcels WHERE crop = 'Peer';
