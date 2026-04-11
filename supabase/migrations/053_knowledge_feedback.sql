-- ============================================
-- 053: Knowledge Feedback — thumbs up/down on RAG chat answers
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  answer_preview TEXT,
  feedback TEXT NOT NULL CHECK (feedback IN ('positive', 'negative')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_feedback_created ON knowledge_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_feedback_type ON knowledge_feedback(feedback);

ALTER TABLE knowledge_feedback ENABLE ROW LEVEL SECURITY;
-- No public read — only via service role
