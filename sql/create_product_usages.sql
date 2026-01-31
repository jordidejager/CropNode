-- Migration to create product_usages table for better RAG retrieval
-- Based on senior backend/DB architect recommendations

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the product_usages table
CREATE TABLE IF NOT EXISTS product_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL REFERENCES ctgb_products(id) ON DELETE CASCADE,
    crop_category TEXT, -- e.g., "Roos"
    pest_category TEXT, -- e.g., "Echte meeldauw"
    full_text_context TEXT NOT NULL, -- The text we embed
    embedding vector(768), -- Vector for googleai/text-embedding-004
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for the foreign key
CREATE INDEX IF NOT EXISTS idx_product_usages_product_id ON product_usages(product_id);

-- GIN indexes for text filtering
CREATE INDEX IF NOT EXISTS idx_product_usages_crop ON product_usages(crop_category);
CREATE INDEX IF NOT EXISTS idx_product_usages_pest ON product_usages(pest_category);

-- IVFFlat index for vector search as requested
-- Note: IVFFlat is a good choice for retrieval speed
CREATE INDEX IF NOT EXISTS idx_product_usages_embedding 
ON product_usages 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- RPC for semantic search
CREATE OR REPLACE FUNCTION match_product_usages(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  product_id text,
  naam text,
  toelatingsnummer text,
  crop_category text,
  pest_category text,
  full_text_context text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pu.id,
    pu.product_id,
    p.naam,
    p.toelatingsnummer,
    pu.crop_category,
    pu.pest_category,
    pu.full_text_context,
    1 - (pu.embedding <=> query_embedding) AS similarity
  FROM product_usages pu
  JOIN ctgb_products p ON pu.product_id = p.id
  WHERE 1 - (pu.embedding <=> query_embedding) > match_threshold
  ORDER BY pu.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
