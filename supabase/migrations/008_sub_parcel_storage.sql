-- Migration: Sub-parcel based storage system
-- Adds cell_sub_parcels and storage_position_contents tables for sub-parcel tracking

-- ============================================================================
-- Table: cell_sub_parcels
-- Links sub-parcels to storage cells with color and metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS cell_sub_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id TEXT NOT NULL REFERENCES storage_cells(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Parcel reference (at least one should be set for traceability)
  parcel_id TEXT REFERENCES parcels(id) ON DELETE SET NULL,
  sub_parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL,

  -- Display properties
  variety TEXT NOT NULL,
  color TEXT NOT NULL,  -- Hex color (e.g., '#ef4444')

  -- Harvest metadata
  pick_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- Plukdatum
  pick_number INTEGER NOT NULL DEFAULT 1 CHECK (pick_number >= 1 AND pick_number <= 5),  -- 1e t/m 5e pluk
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure unique color per cell (prevents visual confusion)
  CONSTRAINT unique_color_per_cell UNIQUE (cell_id, color)
);

-- RLS
ALTER TABLE cell_sub_parcels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cell_sub_parcels"
  ON cell_sub_parcels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cell_sub_parcels"
  ON cell_sub_parcels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cell_sub_parcels"
  ON cell_sub_parcels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cell_sub_parcels"
  ON cell_sub_parcels FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_cell_sub_parcels_cell ON cell_sub_parcels(cell_id);
CREATE INDEX idx_cell_sub_parcels_user ON cell_sub_parcels(user_id);

-- Updated_at trigger
CREATE TRIGGER cell_sub_parcels_updated_at
  BEFORE UPDATE ON cell_sub_parcels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Table: storage_position_contents
-- Allows multiple sub-parcels per position (mixed stacks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS storage_position_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id TEXT NOT NULL REFERENCES storage_cells(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Position reference
  row_index INTEGER NOT NULL,
  col_index INTEGER NOT NULL,

  -- Content reference
  cell_sub_parcel_id UUID NOT NULL REFERENCES cell_sub_parcels(id) ON DELETE CASCADE,

  -- Stack properties
  stack_count INTEGER NOT NULL CHECK (stack_count > 0),  -- Number of crates from this sub-parcel
  stack_order INTEGER NOT NULL,                          -- Order in stack (1 = bottom)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure unique order per position (no duplicate layers)
  CONSTRAINT unique_order_per_position UNIQUE (cell_id, row_index, col_index, stack_order)
);

-- RLS
ALTER TABLE storage_position_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own position_contents"
  ON storage_position_contents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own position_contents"
  ON storage_position_contents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own position_contents"
  ON storage_position_contents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own position_contents"
  ON storage_position_contents FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_position_contents_cell ON storage_position_contents(cell_id);
CREATE INDEX idx_position_contents_position ON storage_position_contents(cell_id, row_index, col_index);
CREATE INDEX idx_position_contents_sub_parcel ON storage_position_contents(cell_sub_parcel_id);

-- Updated_at trigger
CREATE TRIGGER storage_position_contents_updated_at
  BEFORE UPDATE ON storage_position_contents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- View: v_cell_sub_parcel_totals
-- Aggregates position contents into totals per cell sub-parcel
-- ============================================================================

CREATE OR REPLACE VIEW v_cell_sub_parcel_totals AS
SELECT
  csp.id,
  csp.cell_id,
  csp.user_id,
  csp.parcel_id,
  csp.sub_parcel_id,
  csp.variety,
  csp.color,
  csp.pick_date,
  csp.pick_number,
  csp.notes,
  csp.created_at,
  csp.updated_at,
  COALESCE(SUM(spc.stack_count), 0)::integer as total_crates,
  COUNT(DISTINCT (spc.row_index, spc.col_index))::integer as positions_used,
  -- Join parcel names for display
  p.name as parcel_name,
  sp.name as sub_parcel_name
FROM cell_sub_parcels csp
LEFT JOIN storage_position_contents spc ON spc.cell_sub_parcel_id = csp.id
LEFT JOIN parcels p ON p.id = csp.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = csp.sub_parcel_id
GROUP BY
  csp.id, csp.cell_id, csp.user_id, csp.parcel_id, csp.sub_parcel_id,
  csp.variety, csp.color, csp.pick_date, csp.pick_number, csp.notes,
  csp.created_at, csp.updated_at, p.name, sp.name;


-- ============================================================================
-- View: v_position_stacks
-- Aggregates position contents into stack view for floor plan rendering
-- ============================================================================

CREATE OR REPLACE VIEW v_position_stacks AS
SELECT
  spc.cell_id,
  spc.row_index,
  spc.col_index,
  SUM(spc.stack_count)::integer as total_height,
  COUNT(DISTINCT spc.cell_sub_parcel_id)::integer as sub_parcel_count,
  CASE WHEN COUNT(DISTINCT spc.cell_sub_parcel_id) > 1 THEN true ELSE false END as is_mixed,
  -- Get dominant color (sub-parcel with most crates)
  (SELECT csp.color
   FROM storage_position_contents spc2
   JOIN cell_sub_parcels csp ON csp.id = spc2.cell_sub_parcel_id
   WHERE spc2.cell_id = spc.cell_id
     AND spc2.row_index = spc.row_index
     AND spc2.col_index = spc.col_index
   GROUP BY csp.color, csp.id
   ORDER BY SUM(spc2.stack_count) DESC
   LIMIT 1
  ) as dominant_color,
  -- Get all layers as JSONB array
  jsonb_agg(
    jsonb_build_object(
      'id', spc.id,
      'cellSubParcelId', spc.cell_sub_parcel_id,
      'stackCount', spc.stack_count,
      'stackOrder', spc.stack_order,
      'color', csp.color,
      'variety', csp.variety
    ) ORDER BY spc.stack_order
  ) as layers
FROM storage_position_contents spc
JOIN cell_sub_parcels csp ON csp.id = spc.cell_sub_parcel_id
GROUP BY spc.cell_id, spc.row_index, spc.col_index;
