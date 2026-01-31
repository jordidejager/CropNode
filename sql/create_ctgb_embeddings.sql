-- ============================================
-- CTGB Regulation Embeddings Table for RAG
-- Fase 2.2: Semantic Search over gebruiksvoorschriften
-- ============================================

-- Enable pgvector extension (run as superuser if not enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Table: ctgb_regulation_embeddings
-- Stores embeddings for individual gebruiksvoorschriften
-- ============================================

CREATE TABLE IF NOT EXISTS ctgb_regulation_embeddings (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to product (no FK constraint - ctgb_products may not have unique constraint)
  product_toelatingsnummer TEXT NOT NULL,
  product_naam TEXT NOT NULL,

  -- The text content that was embedded
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'gebruiksvoorschrift',

  -- Structured metadata for filtering
  gewas TEXT,
  doelorganisme TEXT,
  dosering TEXT,
  veiligheidstermijn TEXT,
  max_toepassingen INTEGER,
  locatie TEXT,
  interval TEXT,

  -- The embedding vector (1536 dimensions for text-embedding-004)
  embedding vector(768),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for performance
-- ============================================

-- Index on product reference
CREATE INDEX IF NOT EXISTS idx_reg_emb_product
  ON ctgb_regulation_embeddings(product_toelatingsnummer);

-- Index on content type
CREATE INDEX IF NOT EXISTS idx_reg_emb_content_type
  ON ctgb_regulation_embeddings(content_type);

-- GIN index on gewas for filtering
CREATE INDEX IF NOT EXISTS idx_reg_emb_gewas
  ON ctgb_regulation_embeddings(gewas);

-- HNSW index for fast approximate nearest neighbor search
-- Note: HNSW is faster for queries, IVFFlat is faster to build
CREATE INDEX IF NOT EXISTS idx_reg_emb_vector
  ON ctgb_regulation_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================
-- Trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_reg_emb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ctgb_regulation_embeddings_updated_at ON ctgb_regulation_embeddings;
CREATE TRIGGER update_ctgb_regulation_embeddings_updated_at
  BEFORE UPDATE ON ctgb_regulation_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_reg_emb_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE ctgb_regulation_embeddings ENABLE ROW LEVEL SECURITY;

-- Public read access (embeddings zijn gebaseerd op publieke CTGB data)
CREATE POLICY "Allow public read access" ON ctgb_regulation_embeddings
  FOR SELECT
  USING (true);

-- Insert/update voor authenticated users (sync scripts)
CREATE POLICY "Allow authenticated insert" ON ctgb_regulation_embeddings
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON ctgb_regulation_embeddings
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow authenticated delete" ON ctgb_regulation_embeddings
  FOR DELETE
  USING (true);

-- ============================================
-- Function: match_regulations
-- Semantic search over gebruiksvoorschriften
-- ============================================

CREATE OR REPLACE FUNCTION match_regulations(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_gewas text DEFAULT NULL,
  filter_product text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  product_toelatingsnummer text,
  product_naam text,
  content text,
  gewas text,
  doelorganisme text,
  dosering text,
  veiligheidstermijn text,
  max_toepassingen integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.product_toelatingsnummer,
    e.product_naam,
    e.content,
    e.gewas,
    e.doelorganisme,
    e.dosering,
    e.veiligheidstermijn,
    e.max_toepassingen,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM ctgb_regulation_embeddings e
  WHERE
    e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
    AND (filter_gewas IS NULL OR e.gewas ILIKE '%' || filter_gewas || '%')
    AND (filter_product IS NULL OR e.product_naam ILIKE '%' || filter_product || '%')
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- Example queries
-- ============================================

-- Semantic search (na embedding generation):
-- SELECT * FROM match_regulations(
--   '[0.1, 0.2, ...]'::vector,  -- query embedding
--   0.5,                         -- threshold
--   10,                          -- limit
--   'appel',                     -- filter op gewas
--   NULL                         -- geen product filter
-- );

-- Check embedding count:
-- SELECT COUNT(*) FROM ctgb_regulation_embeddings WHERE embedding IS NOT NULL;

-- Get embeddings for a specific product:
-- SELECT * FROM ctgb_regulation_embeddings WHERE product_naam = 'Captan 80 WG';
