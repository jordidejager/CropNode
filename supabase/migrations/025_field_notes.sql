-- Migration 025: Field Notes (Veldnotities)
-- Quick note capture for field observations, tasks, and reminders

-- ============================================
-- 1. CREATE FIELD_NOTES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS field_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'done', 'transferred')),
  auto_tag VARCHAR(30) DEFAULT NULL CHECK (auto_tag IN (NULL, 'bespuiting', 'bemesting', 'taak', 'waarneming', 'overig')),
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_field_notes_user_created ON field_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_notes_status ON field_notes(user_id, status);

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE field_notes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. CREATE RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view own field_notes" ON field_notes;
DROP POLICY IF EXISTS "Users can insert own field_notes" ON field_notes;
DROP POLICY IF EXISTS "Users can update own field_notes" ON field_notes;
DROP POLICY IF EXISTS "Users can delete own field_notes" ON field_notes;

CREATE POLICY "Users can view own field_notes" ON field_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own field_notes" ON field_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own field_notes" ON field_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own field_notes" ON field_notes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 5. UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_field_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER field_notes_updated_at
  BEFORE UPDATE ON field_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_field_notes_updated_at();
