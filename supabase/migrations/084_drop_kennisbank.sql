-- 084_drop_kennisbank.sql
--
-- Verwijdert de volledige Kennisbank/RAG-laag uit de database. De
-- Kennisbank-functie is uit CropNode gehaald om de app simpel te houden;
-- de gescrapte data is geëxporteerd naar JSON vóór deze drop.
--
-- BLIJFT BEHOUDEN (core, NIET droppen):
--   - phenology_reference   → gebruikt door ziektedruk + kalender + pear-scab model
--   - products / ctgb_products / fertilizers → core gewasbescherming
--   - fn_search_products    → WhatsApp CTGB middel-info
--
-- Idempotent (IF EXISTS overal). Draai in Supabase SQL Editor.

-- ============================================
-- 1. Triggers
-- ============================================
DROP TRIGGER IF EXISTS knowledge_articles_tsv_trigger ON knowledge_articles;
DROP TRIGGER IF EXISTS kpp_updated_at_trigger ON knowledge_product_profile;
DROP TRIGGER IF EXISTS trg_knowledge_articles_updated_at ON knowledge_articles;

-- ============================================
-- 2. Functions / RPCs (knowledge-specifiek)
-- ============================================
DROP FUNCTION IF EXISTS match_knowledge_articles(vector, double precision, integer, text, text, integer);
DROP FUNCTION IF EXISTS match_knowledge_articles;
DROP FUNCTION IF EXISTS find_fusion_candidate;
DROP FUNCTION IF EXISTS knowledge_fts_search(text, text, integer);
DROP FUNCTION IF EXISTS knowledge_fts_search;
DROP FUNCTION IF EXISTS knowledge_articles_tsv_update();
DROP FUNCTION IF EXISTS update_knowledge_articles_updated_at();
DROP FUNCTION IF EXISTS get_disease_profile;
DROP FUNCTION IF EXISTS get_product_relations;
DROP FUNCTION IF EXISTS lookup_product_advice;
DROP FUNCTION IF EXISTS kdp_merge_aliases(text[], text[]);
DROP FUNCTION IF EXISTS kpp_merge_aliases(text[], text[]);
DROP FUNCTION IF EXISTS kpp_touch_updated_at();
DROP FUNCTION IF EXISTS dedup_case_insensitive(text[]);

-- ============================================
-- 3. Tabellen (CASCADE ruimt indices, policies, constraints mee)
-- ============================================
DROP TABLE IF EXISTS knowledge_product_relations CASCADE;
DROP TABLE IF EXISTS knowledge_product_advice CASCADE;
DROP TABLE IF EXISTS knowledge_product_profile CASCADE;
DROP TABLE IF EXISTS knowledge_disease_profile CASCADE;
DROP TABLE IF EXISTS knowledge_feedback CASCADE;
DROP TABLE IF EXISTS knowledge_scrape_log CASCADE;
DROP TABLE IF EXISTS knowledge_articles CASCADE;
DROP TABLE IF EXISTS rag_query_log CASCADE;

-- ============================================
-- Diagnostiek
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Kennisbank-tabellen verwijderd. phenology_reference + products blijven behouden.';
END $$;
