-- 081_knowledge_articles_transform_model.sql
--
-- Track per artikel welk AI-model de transform-stap heeft uitgevoerd.
-- Helpt bij latere audits: welke artikelen zijn met de oude flash-lite
-- pipeline gemaakt, welke met Claude Sonnet, etc. Geeft handvat voor
-- gerichte re-processing.
--
-- Idempotent.

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS transform_model TEXT,
  ADD COLUMN IF NOT EXISTS transformed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ka_transform_model
  ON knowledge_articles(transform_model)
  WHERE transform_model IS NOT NULL;
