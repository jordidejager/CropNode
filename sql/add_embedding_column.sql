-- ============================================
-- Add embedding column to ctgb_products
-- Fase 2.2: RAG voor CTGB Kennisbank
--
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column (768 dimensions for text-embedding-004)
ALTER TABLE ctgb_products
ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 3. Create index for fast similarity search (HNSW is faster for queries)
CREATE INDEX IF NOT EXISTS idx_ctgb_products_embedding
ON ctgb_products
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 4. Create function for semantic search
CREATE OR REPLACE FUNCTION search_products_by_embedding(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  toelatingsnummer text,
  naam text,
  categorie text,
  werkzame_stoffen text[],
  gebruiksvoorschriften jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.toelatingsnummer,
    p.naam,
    p.categorie,
    p.werkzame_stoffen,
    p.gebruiksvoorschriften,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM ctgb_products p
  WHERE
    p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Grant execute permission
GRANT EXECUTE ON FUNCTION search_products_by_embedding TO anon, authenticated;

-- ============================================
-- Verification queries (run after migration)
-- ============================================

-- Check if column exists:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'ctgb_products' AND column_name = 'embedding';

-- Check embedding count:
-- SELECT COUNT(*) FROM ctgb_products WHERE embedding IS NOT NULL;

-- Test similarity search (after generating embeddings):
-- SELECT naam, similarity FROM search_products_by_embedding('[0.1, 0.2, ...]'::vector, 0.3, 5);
