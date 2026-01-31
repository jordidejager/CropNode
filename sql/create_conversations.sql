-- Migration: Create conversations table for session management
-- Description: Stores draft sessions, chat history, and completed conversations

-- Create enum type for conversation status
DO $$ BEGIN
    CREATE TYPE conversation_status AS ENUM ('draft', 'active', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User association (if using auth)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Status management
    status conversation_status NOT NULL DEFAULT 'draft',

    -- Title (auto-generated or manual)
    title TEXT NOT NULL DEFAULT 'Nieuwe sessie',

    -- Draft state: selected parcels, products, dosage, date
    draft_data JSONB DEFAULT '{}'::jsonb,
    -- Example structure:
    -- {
    --   "plots": ["uuid-1", "uuid-2"],
    --   "products": [{ "product": "Merpan", "dosage": 1.5, "unit": "kg", "targetReason": "Schurft" }],
    --   "date": "2025-01-21"
    -- }

    -- Chat history: array of messages
    chat_history JSONB DEFAULT '[]'::jsonb,
    -- Example structure:
    -- [
    --   { "role": "user", "content": "Merpan op peren", "timestamp": "2025-01-21T10:00:00Z" },
    --   { "role": "assistant", "content": "Welke percelen?", "timestamp": "2025-01-21T10:00:01Z" }
    -- ]

    -- Metadata
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_updated ON conversations(last_updated DESC);

-- Trigger to auto-update last_updated
CREATE OR REPLACE FUNCTION update_conversations_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_conversations_last_updated ON conversations;
CREATE TRIGGER trigger_conversations_last_updated
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_last_updated();

-- RLS Policies (Row Level Security)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own conversations
CREATE POLICY "Users can view own conversations"
    ON conversations FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own conversations
CREATE POLICY "Users can insert own conversations"
    ON conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own conversations
CREATE POLICY "Users can update own conversations"
    ON conversations FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own conversations
CREATE POLICY "Users can delete own conversations"
    ON conversations FOR DELETE
    USING (auth.uid() = user_id);

-- Function to generate auto-title from draft data
CREATE OR REPLACE FUNCTION generate_conversation_title(draft JSONB)
RETURNS TEXT AS $$
DECLARE
    product_names TEXT[];
    parcel_count INT;
    title_text TEXT;
BEGIN
    -- Extract product names
    SELECT ARRAY(
        SELECT jsonb_array_elements(draft->'products')->>'product'
    ) INTO product_names;

    -- Get parcel count
    parcel_count := jsonb_array_length(COALESCE(draft->'plots', '[]'::jsonb));

    -- Build title
    IF array_length(product_names, 1) > 0 AND parcel_count > 0 THEN
        IF array_length(product_names, 1) = 1 THEN
            title_text := product_names[1] || ' op ' || parcel_count || ' percelen';
        ELSE
            title_text := product_names[1] || ' + ' || (array_length(product_names, 1) - 1) || ' op ' || parcel_count || ' percelen';
        END IF;
    ELSIF array_length(product_names, 1) > 0 THEN
        title_text := array_to_string(product_names, ', ');
    ELSE
        title_text := 'Nieuwe sessie';
    END IF;

    RETURN title_text;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE conversations IS 'Stores conversation sessions with drafts and chat history for the Smart Input feature';
COMMENT ON COLUMN conversations.status IS 'draft = saved but not submitted, active = currently in progress, completed = submitted to logbook';
COMMENT ON COLUMN conversations.draft_data IS 'JSON object with plots (array of UUIDs), products (array), and date';
COMMENT ON COLUMN conversations.chat_history IS 'Array of chat messages with role, content, and timestamp';
