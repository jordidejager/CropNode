-- Migration: Storage Redesign - Complex Overview + Enhanced Cell Editor
-- Adds storage_complex table and extends storage_cells with door, evaporator, and height features

-- ============================================
-- 1. CREATE STORAGE_COMPLEX TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS storage_complex (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Hoofdlocatie',
  grid_width INTEGER NOT NULL DEFAULT 20 CHECK (grid_width > 0 AND grid_width <= 100),
  grid_height INTEGER NOT NULL DEFAULT 15 CHECK (grid_height > 0 AND grid_height <= 100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. ADD COLUMNS TO STORAGE_CELLS
-- ============================================

-- Max stack height for the cell (default 8 crates high)
ALTER TABLE storage_cells ADD COLUMN IF NOT EXISTS
  max_stack_height INTEGER DEFAULT 8 CHECK (max_stack_height > 0 AND max_stack_height <= 20);

-- Door positions: array of {side, startCol, endCol}
-- Example: [{"side": "south", "startCol": 2, "endCol": 4}]
ALTER TABLE storage_cells ADD COLUMN IF NOT EXISTS
  door_positions JSONB DEFAULT '[]'::jsonb;

-- Evaporator positions: array of {side, startCol, endCol}
-- Example: [{"side": "north", "startCol": 0, "endCol": 5}]
ALTER TABLE storage_cells ADD COLUMN IF NOT EXISTS
  evaporator_positions JSONB DEFAULT '[]'::jsonb;

-- Per-position height overrides: {"row-col": maxHeight}
-- Example: {"0-2": 5, "0-3": 5, "1-2": 6}
ALTER TABLE storage_cells ADD COLUMN IF NOT EXISTS
  position_height_overrides JSONB DEFAULT '{}'::jsonb;

-- Link to complex for layout positioning
ALTER TABLE storage_cells ADD COLUMN IF NOT EXISTS
  complex_id TEXT REFERENCES storage_complex(id) ON DELETE SET NULL;

-- Position and rotation in complex overview
-- Example: {"x": 0, "y": 0, "rotation": 0}
ALTER TABLE storage_cells ADD COLUMN IF NOT EXISTS
  complex_position JSONB DEFAULT '{"x": 0, "y": 0, "rotation": 0}'::jsonb;

-- ============================================
-- 3. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_storage_complex_user ON storage_complex(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_cells_complex ON storage_cells(complex_id);

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY FOR COMPLEX
-- ============================================

ALTER TABLE storage_complex ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. CREATE RLS POLICIES FOR STORAGE_COMPLEX
-- ============================================

DROP POLICY IF EXISTS "Users can view own storage_complex" ON storage_complex;
DROP POLICY IF EXISTS "Users can insert own storage_complex" ON storage_complex;
DROP POLICY IF EXISTS "Users can update own storage_complex" ON storage_complex;
DROP POLICY IF EXISTS "Users can delete own storage_complex" ON storage_complex;

CREATE POLICY "Users can view own storage_complex" ON storage_complex
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own storage_complex" ON storage_complex
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own storage_complex" ON storage_complex
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own storage_complex" ON storage_complex
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 6. CREATE UPDATE TRIGGER FOR STORAGE_COMPLEX
-- ============================================

CREATE OR REPLACE FUNCTION update_storage_complex_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_storage_complex ON storage_complex;
CREATE TRIGGER trigger_update_storage_complex
  BEFORE UPDATE ON storage_complex
  FOR EACH ROW EXECUTE FUNCTION update_storage_complex_updated_at();

-- ============================================
-- 7. UPDATE SUMMARY VIEW TO INCLUDE NEW FIELDS
-- ============================================

-- Drop and recreate view (column structure changed)
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

-- ============================================
-- 8. CREATE FUNCTION TO AUTO-CREATE DEFAULT COMPLEX
-- ============================================

-- This function creates a default complex for users who don't have one
CREATE OR REPLACE FUNCTION get_or_create_default_complex(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_complex_id TEXT;
BEGIN
  -- Check if user already has a complex
  SELECT id INTO v_complex_id
  FROM storage_complex
  WHERE user_id = p_user_id
  LIMIT 1;

  -- If no complex exists, create one
  IF v_complex_id IS NULL THEN
    INSERT INTO storage_complex (user_id, name, grid_width, grid_height)
    VALUES (p_user_id, 'Hoofdlocatie', 20, 15)
    RETURNING id INTO v_complex_id;
  END IF;

  RETURN v_complex_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
