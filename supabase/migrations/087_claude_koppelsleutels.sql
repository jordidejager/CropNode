-- Koppelsleutels voor de CropNode MCP-server (/api/mcp/<sleutel>): een Claude-chat
-- praat hiermee met de gegevens van één gebruiker. Alleen de sha256-hash staat
-- in de database; intrekbaar; laatst-gebruikt bijgehouden. Zelfde patroon als
-- StoreNode's koppelsleutels.

CREATE TABLE IF NOT EXISTS claude_koppelsleutels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  omschrijving TEXT NOT NULL DEFAULT 'Claude',
  sleutel_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  laatst_gebruikt_op TIMESTAMPTZ,
  ingetrokken_op TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_claude_koppelsleutels_user ON claude_koppelsleutels(user_id);

ALTER TABLE claude_koppelsleutels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own claude_koppelsleutels" ON claude_koppelsleutels;
CREATE POLICY "Users can view own claude_koppelsleutels" ON claude_koppelsleutels
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can revoke own claude_koppelsleutels" ON claude_koppelsleutels;
CREATE POLICY "Users can revoke own claude_koppelsleutels" ON claude_koppelsleutels
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Veldnotities en spuitschrift-spiegels vanuit Claude krijgen source 'claude'.
ALTER TABLE field_notes DROP CONSTRAINT IF EXISTS field_notes_source_check;
ALTER TABLE field_notes ADD CONSTRAINT field_notes_source_check CHECK (source IN ('web', 'whatsapp', 'voice', 'claude'));
