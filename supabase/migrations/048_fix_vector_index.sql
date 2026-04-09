-- ============================================
-- 048: Fix vector index — switch from IVFFlat to HNSW
--
-- IVFFlat with lists=100 was causing timeouts on the match_knowledge_articles
-- RPC with only 1970 rows. HNSW is faster for queries and doesn't need
-- the lists parameter to be tuned to the dataset size.
--
-- Also: HNSW is the same index type used successfully on ctgb_regulation_embeddings.
-- ============================================

-- Drop the old IVFFlat index
DROP INDEX IF EXISTS idx_knowledge_articles_embedding;

-- Create HNSW index (same settings as ctgb_regulation_embeddings)
CREATE INDEX idx_knowledge_articles_embedding
  ON knowledge_articles
  USING hnsw (content_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
