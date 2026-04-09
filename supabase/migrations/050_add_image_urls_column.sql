-- ============================================
-- 050: Add image_urls column to knowledge_articles
--
-- Stores URLs to disease/pest photos from public sources like WUR/Groen Kennisnet.
-- These can be displayed in the Atlas UI for visual identification.
-- ============================================

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
