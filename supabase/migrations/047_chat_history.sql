-- ============================================
-- Chat History for RAG Chatbot (Fase 2)
-- ============================================
-- Stores grounded chat sessions so we can:
--   1. Show conversation history in the UI (Fase 3)
--   2. Track which articles were retrieved per answer (for debugging + evaluation)
--   3. Collect feedback (thumbs up/down) for Fase 5 iteration loop
-- ============================================

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session metadata
  title TEXT,                           -- AI-generated summary of first user message
  context_crop TEXT[],                  -- User's focused crops at time of chat
  context_parcel_id UUID,               -- Optional parcel for personalization (future)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON chat_sessions(user_id, last_active_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_active_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_sessions_updated_at();

-- ============================================
-- Chat messages
-- ============================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Assistant-only: retrieved articles used to ground this answer
  retrieved_article_ids UUID[] DEFAULT '{}',
  retrieval_scores FLOAT[] DEFAULT '{}',

  -- Assistant-only: query understanding & confidence
  detected_intent JSONB,                -- { topic, crops, diseases, products, etc }
  confidence_score FLOAT,               -- Max similarity of top result
  used_fallback BOOLEAN DEFAULT false,  -- true when threshold not met
  ctgb_annotations JSONB,               -- { product: status } per checked product

  -- User feedback (Fase 5)
  feedback INT CHECK (feedback IN (-1, 0, 1)),
  feedback_text TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_feedback
  ON chat_messages(feedback) WHERE feedback IS NOT NULL;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
DROP POLICY IF EXISTS "Users see own chat sessions" ON chat_sessions;
CREATE POLICY "Users see own chat sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own chat sessions" ON chat_sessions;
CREATE POLICY "Users insert own chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own chat sessions" ON chat_sessions;
CREATE POLICY "Users update own chat sessions"
  ON chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Messages inherit from session ownership
DROP POLICY IF EXISTS "Users see messages in own sessions" ON chat_messages;
CREATE POLICY "Users see messages in own sessions"
  ON chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = chat_messages.session_id
    AND chat_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users insert messages in own sessions" ON chat_messages;
CREATE POLICY "Users insert messages in own sessions"
  ON chat_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = chat_messages.session_id
    AND chat_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users update messages in own sessions" ON chat_messages;
CREATE POLICY "Users update messages in own sessions"
  ON chat_messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = chat_messages.session_id
    AND chat_sessions.user_id = auth.uid()
  ));
