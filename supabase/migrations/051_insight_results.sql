-- ============================================
-- INSIGHT RESULTS — Cached AI correlation analysis
-- ============================================

CREATE TABLE IF NOT EXISTS insight_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_json JSONB NOT NULL,
  data_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insight_results_user ON insight_results(user_id);

ALTER TABLE insight_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own insights"
  ON insight_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights"
  ON insight_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own insights"
  ON insight_results FOR DELETE
  USING (auth.uid() = user_id);
