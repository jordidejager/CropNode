-- Migration: Create smart_input_feedback table
-- Stores user corrections to learn from feedback patterns
-- Part of Punt 6: Feedback loop voor correcties

-- ============================================
-- 1. CREATE SMART_INPUT_FEEDBACK TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS smart_input_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- What was corrected
  correction_type TEXT NOT NULL CHECK (correction_type IN (
    'product_alias',     -- User corrected a product name mapping
    'dosage_preference', -- User changed the default dosage
    'parcel_group',      -- User corrected a parcel group mapping
    'product_combo',     -- User often uses these products together
    'exception_pattern', -- User corrected an exception (e.g., "Kanzi niet")
    'general'            -- Other corrections
  )),

  -- The original (incorrect) interpretation
  original_value TEXT NOT NULL,

  -- The corrected value from the user
  corrected_value TEXT NOT NULL,

  -- Context for smarter matching
  context JSONB DEFAULT '{}'::jsonb,
  -- Example context:
  -- For product_alias: { "raw_input": "captan", "crop": "appel" }
  -- For dosage_preference: { "product": "Captan 80 WDG", "crop": "peer" }
  -- For parcel_group: { "keyword": "alle peren", "expected_count": 5 }
  -- For product_combo: { "primary_product": "Merpan", "added_product": "Score" }

  -- Usage tracking for learning
  frequency INT NOT NULL DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================

-- Fast lookup by user and correction type
CREATE INDEX IF NOT EXISTS idx_feedback_user_type
  ON smart_input_feedback(user_id, correction_type);

-- Fast lookup by user and original value (for alias matching)
CREATE INDEX IF NOT EXISTS idx_feedback_user_original
  ON smart_input_feedback(user_id, original_value);

-- GIN index for JSONB context searches
CREATE INDEX IF NOT EXISTS idx_feedback_context
  ON smart_input_feedback USING GIN (context);

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE smart_input_feedback ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. CREATE RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view own feedback" ON smart_input_feedback;
DROP POLICY IF EXISTS "Users can insert own feedback" ON smart_input_feedback;
DROP POLICY IF EXISTS "Users can update own feedback" ON smart_input_feedback;
DROP POLICY IF EXISTS "Users can delete own feedback" ON smart_input_feedback;

CREATE POLICY "Users can view own feedback" ON smart_input_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback" ON smart_input_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback" ON smart_input_feedback
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own feedback" ON smart_input_feedback
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 5. CREATE UPDATE TRIGGER FOR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_smart_input_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_smart_input_feedback ON smart_input_feedback;
CREATE TRIGGER trigger_update_smart_input_feedback
  BEFORE UPDATE ON smart_input_feedback
  FOR EACH ROW EXECUTE FUNCTION update_smart_input_feedback_updated_at();

-- ============================================
-- 6. CREATE UPSERT FUNCTION FOR FEEDBACK
-- ============================================

-- Function to record feedback with automatic frequency updates
CREATE OR REPLACE FUNCTION record_smart_input_feedback(
  p_user_id UUID,
  p_correction_type TEXT,
  p_original_value TEXT,
  p_corrected_value TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_feedback_id UUID;
BEGIN
  -- Try to find existing feedback with same user, type, and values
  SELECT id INTO v_feedback_id
  FROM smart_input_feedback
  WHERE user_id = p_user_id
    AND correction_type = p_correction_type
    AND original_value = p_original_value
    AND corrected_value = p_corrected_value
  LIMIT 1;

  IF v_feedback_id IS NOT NULL THEN
    -- Update frequency and last_used
    UPDATE smart_input_feedback
    SET frequency = frequency + 1,
        last_used_at = NOW(),
        context = p_context
    WHERE id = v_feedback_id;

    RETURN v_feedback_id;
  ELSE
    -- Insert new feedback
    INSERT INTO smart_input_feedback (
      user_id, correction_type, original_value, corrected_value, context
    ) VALUES (
      p_user_id, p_correction_type, p_original_value, p_corrected_value, p_context
    ) RETURNING id INTO v_feedback_id;

    RETURN v_feedback_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
