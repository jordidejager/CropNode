-- ============================================================================
-- WhatsApp Bot: Tables & registration_source column
-- ============================================================================

-- 1. Add registration_source to spuitschrift
ALTER TABLE spuitschrift ADD COLUMN IF NOT EXISTS registration_source TEXT DEFAULT 'web';
-- Possible values: 'web', 'whatsapp', 'api' (future)

-- 2. Linked WhatsApp phone numbers
CREATE TABLE IF NOT EXISTS whatsapp_linked_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_label TEXT DEFAULT 'Hoofdnummer',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_phone UNIQUE (phone_number)
);

-- Index for fast lookup on incoming messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_phone
  ON whatsapp_linked_numbers(phone_number) WHERE is_active = true;

-- RLS: users see only their own numbers
ALTER TABLE whatsapp_linked_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own numbers" ON whatsapp_linked_numbers;
DROP POLICY IF EXISTS "Users can insert own numbers" ON whatsapp_linked_numbers;
DROP POLICY IF EXISTS "Users can update own numbers" ON whatsapp_linked_numbers;
DROP POLICY IF EXISTS "Users can delete own numbers" ON whatsapp_linked_numbers;

CREATE POLICY "Users can view own numbers"
  ON whatsapp_linked_numbers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own numbers"
  ON whatsapp_linked_numbers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own numbers"
  ON whatsapp_linked_numbers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own numbers"
  ON whatsapp_linked_numbers FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Conversation state tracking
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  wa_message_id TEXT,
  state TEXT NOT NULL DEFAULT 'idle',
  pending_registration JSONB,
  last_input TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- State values: 'idle', 'awaiting_confirmation', 'confirmed', 'cancelled', 'expired'

CREATE INDEX IF NOT EXISTS idx_wa_conv_phone
  ON whatsapp_conversations(phone_number, state);

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON whatsapp_conversations;

CREATE POLICY "Users can view own conversations"
  ON whatsapp_conversations FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Message log (audit trail, server-side only)
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT,
  wa_message_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_log_phone
  ON whatsapp_message_log(phone_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_log_message_id
  ON whatsapp_message_log(wa_message_id);

-- No RLS on message_log — server-side audit table only, accessed via service_role client
