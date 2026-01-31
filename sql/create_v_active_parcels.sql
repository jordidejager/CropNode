-- ============================================
-- View: v_active_parcels
-- ============================================
-- Purpose: Flatten parcels + sub_parcels into a single, easy-to-query view
-- This eliminates complex joins in TypeScript and provides consistent data
--
-- Usage: SELECT * FROM v_active_parcels WHERE id IN ('uuid1', 'uuid2', ...)
-- ============================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS v_active_parcels;

-- Create the flattened view
CREATE VIEW v_active_parcels AS
SELECT
    p.id,
    p.name,
    p.area AS parcel_area,
    p.location,
    p.geometry,
    p.source,
    p.rvo_id,
    -- Get crop from first sub_parcel, fallback to 'Onbekend'
    COALESCE(
        (SELECT sp.crop FROM sub_parcels sp WHERE sp.parcel_id = p.id ORDER BY sp.created_at ASC LIMIT 1),
        'Onbekend'
    ) AS crop,
    -- Get variety from first sub_parcel, fallback to NULL
    (SELECT sp.variety FROM sub_parcels sp WHERE sp.parcel_id = p.id ORDER BY sp.created_at ASC LIMIT 1) AS variety,
    -- Get area from first sub_parcel (more accurate for spraying calculations)
    (SELECT sp.area FROM sub_parcels sp WHERE sp.parcel_id = p.id ORDER BY sp.created_at ASC LIMIT 1) AS sub_parcel_area,
    -- Count of sub_parcels for debugging
    (SELECT COUNT(*) FROM sub_parcels sp WHERE sp.parcel_id = p.id) AS sub_parcel_count,
    -- First sub_parcel ID (useful for debugging ID mismatches)
    (SELECT sp.id FROM sub_parcels sp WHERE sp.parcel_id = p.id ORDER BY sp.created_at ASC LIMIT 1) AS first_sub_parcel_id
FROM
    parcels p;

-- Grant access (adjust based on your RLS policies)
-- GRANT SELECT ON v_active_parcels TO authenticated;
-- GRANT SELECT ON v_active_parcels TO anon;

-- ============================================
-- Alternative: Materialized View (for better performance)
-- Uncomment if you need faster queries at the cost of real-time updates
-- ============================================
-- DROP MATERIALIZED VIEW IF EXISTS mv_active_parcels;
-- CREATE MATERIALIZED VIEW mv_active_parcels AS
-- SELECT ... (same query as above)
-- CREATE UNIQUE INDEX ON mv_active_parcels (id);
-- REFRESH MATERIALIZED VIEW mv_active_parcels; -- Run periodically

-- ============================================
-- Test the view
-- ============================================
-- SELECT * FROM v_active_parcels LIMIT 5;
-- SELECT id, name, crop, variety, sub_parcel_count FROM v_active_parcels;
