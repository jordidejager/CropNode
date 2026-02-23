-- Migration: Create storage_cells and storage_positions tables
-- Visual cold storage cell management with floor plan editor
-- Part of Koelcelbeheer feature

-- ============================================
-- 1. CREATE STORAGE_CELLS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS storage_cells (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0 AND width <= 50),   -- columns (crate positions)
  depth INTEGER NOT NULL CHECK (depth > 0 AND depth <= 50),   -- rows (crate positions)
  blocked_positions JSONB DEFAULT '[]'::jsonb,                -- [{row: number, col: number}]
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. CREATE STORAGE_POSITIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS storage_positions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cell_id TEXT NOT NULL REFERENCES storage_cells(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL CHECK (row_index >= 0),
  col_index INTEGER NOT NULL CHECK (col_index >= 0),
  variety TEXT,
  sub_parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL,
  date_stored DATE,
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),            -- stack height
  quality_class TEXT CHECK (quality_class IN ('Klasse I', 'Klasse II', 'Industrie')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cell_id, row_index, col_index)                       -- One position per grid cell
);

-- ============================================
-- 3. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_storage_cells_user ON storage_cells(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_cells_status ON storage_cells(status);
CREATE INDEX IF NOT EXISTS idx_storage_positions_cell ON storage_positions(cell_id);
CREATE INDEX IF NOT EXISTS idx_storage_positions_user ON storage_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_positions_variety ON storage_positions(variety);

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE storage_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_positions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. CREATE RLS POLICIES FOR STORAGE_CELLS
-- ============================================

DROP POLICY IF EXISTS "Users can view own storage_cells" ON storage_cells;
DROP POLICY IF EXISTS "Users can insert own storage_cells" ON storage_cells;
DROP POLICY IF EXISTS "Users can update own storage_cells" ON storage_cells;
DROP POLICY IF EXISTS "Users can delete own storage_cells" ON storage_cells;

CREATE POLICY "Users can view own storage_cells" ON storage_cells
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own storage_cells" ON storage_cells
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own storage_cells" ON storage_cells
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own storage_cells" ON storage_cells
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 6. CREATE RLS POLICIES FOR STORAGE_POSITIONS
-- ============================================

DROP POLICY IF EXISTS "Users can view own storage_positions" ON storage_positions;
DROP POLICY IF EXISTS "Users can insert own storage_positions" ON storage_positions;
DROP POLICY IF EXISTS "Users can update own storage_positions" ON storage_positions;
DROP POLICY IF EXISTS "Users can delete own storage_positions" ON storage_positions;

CREATE POLICY "Users can view own storage_positions" ON storage_positions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own storage_positions" ON storage_positions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own storage_positions" ON storage_positions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own storage_positions" ON storage_positions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 7. CREATE UPDATE TRIGGERS FOR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_storage_cells_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_storage_cells ON storage_cells;
CREATE TRIGGER trigger_update_storage_cells
  BEFORE UPDATE ON storage_cells
  FOR EACH ROW EXECUTE FUNCTION update_storage_cells_updated_at();

CREATE OR REPLACE FUNCTION update_storage_positions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_storage_positions ON storage_positions;
CREATE TRIGGER trigger_update_storage_positions
  BEFORE UPDATE ON storage_positions
  FOR EACH ROW EXECUTE FUNCTION update_storage_positions_updated_at();

-- ============================================
-- 8. CREATE SUMMARY VIEW
-- ============================================

CREATE OR REPLACE VIEW v_storage_cells_summary AS
SELECT
  sc.id,
  sc.user_id,
  sc.name,
  sc.width,
  sc.depth,
  sc.blocked_positions,
  sc.status,
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
  MODE() WITHIN GROUP (ORDER BY sp.variety) as dominant_variety
FROM storage_cells sc
LEFT JOIN storage_positions sp ON sc.id = sp.cell_id
GROUP BY sc.id;
