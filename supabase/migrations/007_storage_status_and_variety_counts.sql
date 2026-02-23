-- Migration: Storage Status Update & Variety Counts
-- Adds 'cooling_down' status and variety breakdown to summary view

-- ============================================
-- 1. UPDATE STATUS COLUMN (if exists as enum, recreate as text)
-- ============================================

-- The status column is already TEXT, just update existing values if needed
-- Valid values are now: 'active', 'cooling_down', 'inactive'
-- Update any 'maintenance' status to 'inactive'
UPDATE storage_cells SET status = 'inactive' WHERE status = 'maintenance';

-- ============================================
-- 2. UPDATE SUMMARY VIEW WITH VARIETY COUNTS
-- ============================================

DROP VIEW IF EXISTS v_storage_cells_summary;

CREATE VIEW v_storage_cells_summary AS
SELECT
  sc.id,
  sc.user_id,
  sc.name,
  sc.width,
  sc.depth,
  sc.blocked_positions,
  sc.status,
  sc.max_stack_height,
  sc.door_positions,
  sc.evaporator_positions,
  sc.position_height_overrides,
  sc.complex_id,
  sc.complex_position,
  sc.created_at,
  sc.updated_at,
  (sc.width * sc.depth - COALESCE(jsonb_array_length(sc.blocked_positions), 0)) as total_positions,
  COUNT(sp.id)::integer as filled_positions,
  COALESCE(
    ROUND(
      COUNT(sp.id)::numeric /
      NULLIF((sc.width * sc.depth - COALESCE(jsonb_array_length(sc.blocked_positions), 0)), 0) * 100,
      1
    ),
    0
  ) as fill_percentage,
  MODE() WITHIN GROUP (ORDER BY sp.variety) as dominant_variety,
  -- Total crates (sum of all quantities/stack heights)
  COALESCE(SUM(sp.quantity), 0)::integer as total_crates,
  -- Variety breakdown: array of {variety, count} ordered by count descending
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object('variety', v.variety, 'count', v.total_qty)
        ORDER BY v.total_qty DESC
      )
      FROM (
        SELECT
          sp2.variety,
          SUM(sp2.quantity)::integer as total_qty
        FROM storage_positions sp2
        WHERE sp2.cell_id = sc.id AND sp2.variety IS NOT NULL
        GROUP BY sp2.variety
      ) v
    ),
    '[]'::jsonb
  ) as variety_counts,
  -- Calculate total capacity based on max_stack_height and overrides
  COALESCE(
    (
      SELECT SUM(
        COALESCE(
          (sc.position_height_overrides->>(r || '-' || c))::integer,
          sc.max_stack_height
        )
      )
      FROM generate_series(0, sc.depth - 1) AS r,
           generate_series(0, sc.width - 1) AS c
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(sc.blocked_positions) AS bp
        WHERE (bp->>'row')::integer = r AND (bp->>'col')::integer = c
      )
    ),
    sc.width * sc.depth * sc.max_stack_height
  ) as total_capacity
FROM storage_cells sc
LEFT JOIN storage_positions sp ON sc.id = sp.cell_id
GROUP BY sc.id;
