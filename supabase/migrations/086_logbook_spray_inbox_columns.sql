-- Spuit-inbox: logbook-rijen die via het aparte WhatsApp spuit-nummer binnenkomen.
-- source: 'web' (bestaand) | 'whatsapp_spray'
-- review_meta: aannames, onzekere velden en validatieflags voor de review-UI.

ALTER TABLE logbook ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';
ALTER TABLE logbook ADD COLUMN IF NOT EXISTS wa_message_id TEXT;
ALTER TABLE logbook ADD COLUMN IF NOT EXISTS review_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_logbook_inbox ON logbook(user_id, source, status);
