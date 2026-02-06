-- Migration: Fix v_sprayable_parcels to use LEFT JOIN
-- Problem: sub_parcels.parcel_id doesn't match parcels.id (FK mismatch)
-- Solution: Use LEFT JOIN so sub_parcels are returned even without matching parent parcels

-- Drop and recreate the view
DROP VIEW IF EXISTS v_sprayable_parcels;
DROP VIEW IF EXISTS v_active_parcels;

CREATE VIEW v_sprayable_parcels AS
SELECT
    sp.id,
    -- Generate readable name with multiple fallback levels
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
    sp.updated_at,
    -- RLS: user_id for row-level security
    sp.user_id
FROM
    sub_parcels sp
LEFT JOIN
    parcels p ON sp.parcel_id = p.id
ORDER BY
    COALESCE(p.name, sp.name, sp.crop), sp.name;

-- Enable RLS on the view (if supported) - Supabase requires this for security
-- Note: Views inherit RLS from underlying tables when using security_invoker
-- For older Postgres versions, RLS on views is handled differently
