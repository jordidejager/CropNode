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
CREATE VIEW v_sprayable_parcels AS
SELECT
    sp.id,
    -- Generate readable name: "Thuis Grote wei (Lucas)" or "Thuis (Conference)" if no sub_parcel name
    CASE
        WHEN sp.name IS NOT NULL AND sp.name != '' THEN
            CONCAT(p.name, ' ', sp.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
        ELSE
            CONCAT(p.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
    END AS name,
    sp.area,
    sp.crop,
    sp.variety,
    -- Keep parent parcel info for reference
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
JOIN
    parcels p ON sp.parcel_id = p.id
ORDER BY
    p.name, sp.name;

-- ============================================
-- Test the view
-- ============================================
-- SELECT * FROM v_sprayable_parcels LIMIT 10;
-- SELECT id, name, crop, variety, area FROM v_sprayable_parcels;
-- SELECT * FROM v_sprayable_parcels WHERE crop = 'Peer';
