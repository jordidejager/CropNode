-- 078_knowledge_hybrid_search.sql
--
-- Hybrid search for knowledge_articles: adds a generated `content_tsv` column
-- (Dutch stemmer) with a GIN index, plus a `rag_query_log` table for
-- observability (see Tier 4 #21). Idempotent — safe to re-run.

-- ============================================
-- 1. Full-text search column
-- ============================================
-- Dutch configuration for stemming — "schurft" and "schurften" become one stem.
--
-- NB: `to_tsvector(regconfig, text)` is STABLE, not IMMUTABLE, which
-- disqualifies it for GENERATED ALWAYS AS ... STORED columns. We use a
-- BEFORE INSERT OR UPDATE trigger instead.

-- Drop any half-baked leftovers from a failed previous run
ALTER TABLE knowledge_articles DROP COLUMN IF EXISTS content_tsv;

ALTER TABLE knowledge_articles
  ADD COLUMN content_tsv tsvector;

CREATE OR REPLACE FUNCTION knowledge_articles_tsv_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_tsv :=
    setweight(to_tsvector('dutch', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('dutch', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('dutch', coalesce(NEW.content, '')), 'C') ||
    setweight(
      to_tsvector(
        'simple',
        array_to_string(coalesce(NEW.products_mentioned, ARRAY[]::text[]), ' ')
      ),
      'A'
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_articles_tsv_trigger ON knowledge_articles;
CREATE TRIGGER knowledge_articles_tsv_trigger
  BEFORE INSERT OR UPDATE OF title, summary, content, products_mentioned
  ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION knowledge_articles_tsv_update();

-- Backfill existing rows in chunks to avoid a giant transaction
UPDATE knowledge_articles
SET content_tsv =
  setweight(to_tsvector('dutch', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('dutch', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('dutch', coalesce(content, '')), 'C') ||
  setweight(
    to_tsvector(
      'simple',
      array_to_string(coalesce(products_mentioned, ARRAY[]::text[]), ' ')
    ),
    'A'
  )
WHERE content_tsv IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_articles_content_tsv_idx
  ON knowledge_articles USING GIN (content_tsv);

-- ============================================
-- 2. BM25-style candidate RPC
-- ============================================
-- Returns top-N article rows (full payload incl. embedding) ranked by
-- ts_rank_cd. Used alongside metadata + vector candidate strategies.

CREATE OR REPLACE FUNCTION knowledge_fts_search(
  query_text text,
  crop_filter text DEFAULT NULL,
  match_limit int DEFAULT 20
) RETURNS TABLE (
  id uuid,
  title text,
  content text,
  summary text,
  category text,
  subcategory text,
  knowledge_type text,
  crops text[],
  season_phases text[],
  relevant_months int[],
  products_mentioned text[],
  is_public_source boolean,
  public_source_ref text,
  fusion_sources int,
  harvest_year int,
  valid_until date,
  content_embedding vector(768),
  image_urls text[],
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id, a.title, a.content, a.summary, a.category, a.subcategory,
    a.knowledge_type, a.crops, a.season_phases, a.relevant_months,
    a.products_mentioned, a.is_public_source, a.public_source_ref,
    a.fusion_sources, a.harvest_year, a.valid_until,
    a.content_embedding, a.image_urls,
    ts_rank_cd(a.content_tsv, websearch_to_tsquery('dutch', query_text)) AS rank
  FROM knowledge_articles a
  WHERE
    a.status = 'published'
    AND a.content_tsv @@ websearch_to_tsquery('dutch', query_text)
    AND (crop_filter IS NULL OR crop_filter = ANY(a.crops))
  ORDER BY rank DESC
  LIMIT match_limit;
$$;

GRANT EXECUTE ON FUNCTION knowledge_fts_search(text, text, int) TO authenticated, service_role;

-- ============================================
-- 3. RAG query log (observability)
-- ============================================
-- One row per user query. Used to surface empty-answer hot-spots and track
-- confidence-fail rate over time. See src/lib/knowledge/rag/query-log.ts.

CREATE TABLE IF NOT EXISTS rag_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  query text NOT NULL,
  rewritten_query text,
  intent jsonb,
  candidate_count int,
  retrieved_count int,
  top_raw_similarity numeric(4, 3),
  top_similarity numeric(4, 3),
  confidence_passed boolean,
  confidence_reason text,
  used_agent boolean,
  used_fallback boolean,
  answer_length int,
  retrieved_article_ids uuid[],
  latency_ms int,
  error text
);

CREATE INDEX IF NOT EXISTS rag_query_log_created_at_idx
  ON rag_query_log (created_at DESC);

CREATE INDEX IF NOT EXISTS rag_query_log_confidence_idx
  ON rag_query_log (confidence_passed, created_at DESC);

-- Read-only for authenticated users (for admin dashboards); writes via
-- service role only (webhook context).
ALTER TABLE rag_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rag_query_log_read ON rag_query_log;
CREATE POLICY rag_query_log_read ON rag_query_log
  FOR SELECT TO authenticated USING (true);
