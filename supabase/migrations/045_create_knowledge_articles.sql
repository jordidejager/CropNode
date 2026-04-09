-- ============================================
-- Knowledge Articles Table for RAG Pipeline (Fase 1)
-- ============================================
-- CropNode kennisbank-chatbot foundation. Slaat hergeformuleerde
-- kennisartikelen op met embeddings voor semantische zoekopdrachten.
-- Bron-content (FruitConsult, etc.) wordt NOOIT direct opgeslagen —
-- alleen herformuleerde, gevalideerde CropNode-content.
-- ============================================

-- pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Table: knowledge_articles
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_embedding vector(768),                  -- text-embedding-004
  summary TEXT,

  -- Categorisering
  category TEXT NOT NULL,                         -- ziekte | plaag | bemesting | snoei | dunning | bewaring | certificering | algemeen | rassenkeuze | bodem | watermanagement
  subcategory TEXT,                               -- vrije tekst: schurft | meeldauw | fruitmot | etc.
  knowledge_type TEXT NOT NULL,                   -- strategie | middel_advies | timing | techniek | regelgeving | waarneming | biologisch

  -- Toepassingscontext
  crops TEXT[] DEFAULT '{}',                      -- {appel, peer, kers, pruim, blauwe_bes}
  varieties TEXT[] DEFAULT '{}',                  -- specifieke rassen
  season_phases TEXT[] DEFAULT '{}',              -- {rust, knopstadium, bloei, vruchtzetting, groei, oogst, nabloei}
  relevant_months INT[] DEFAULT '{}',             -- {3, 4, 5}

  -- Koppelingen
  products_mentioned TEXT[] DEFAULT '{}',
  related_article_ids UUID[] DEFAULT '{}',

  -- Bronbeheer (commerciële bronnen krijgen NOOIT bronvermelding)
  is_public_source BOOLEAN DEFAULT false,
  public_source_ref TEXT,                         -- Alleen bij is_public_source=true

  -- Kwaliteit & versheid
  confidence_level TEXT DEFAULT 'hoog',           -- hoog | gemiddeld | laag
  harvest_year INT NOT NULL,
  valid_from DATE,
  valid_until DATE,
  is_evergreen BOOLEAN DEFAULT false,

  -- Deduplicatie & beheer
  content_hash TEXT NOT NULL,                     -- SHA-256 van content
  fusion_sources INT DEFAULT 1,                   -- aantal bronnen waaruit gefuseerd
  status TEXT DEFAULT 'draft',                    -- draft | published | archived | needs_review

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- ============================================
-- Indexen
-- ============================================

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_embedding
  ON knowledge_articles USING ivfflat (content_embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category ON knowledge_articles(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_subcategory ON knowledge_articles(subcategory);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status ON knowledge_articles(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_harvest_year ON knowledge_articles(harvest_year);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_content_hash ON knowledge_articles(content_hash);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_crops ON knowledge_articles USING GIN(crops);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_season ON knowledge_articles USING GIN(season_phases);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_months ON knowledge_articles USING GIN(relevant_months);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_products ON knowledge_articles USING GIN(products_mentioned);

-- ============================================
-- updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_knowledge_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_articles_updated_at ON knowledge_articles;
CREATE TRIGGER trg_knowledge_articles_updated_at
  BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_articles_updated_at();

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published articles are readable by all users" ON knowledge_articles;
CREATE POLICY "Published articles are readable by all users"
  ON knowledge_articles FOR SELECT
  USING (status = 'published');

-- Insert/update/delete: alleen via service role (geen policy = geen toegang)

-- ============================================
-- Table: knowledge_scrape_log
-- ============================================
-- Operationele logging van scrape runs. Bevat WEL bron-codes (intern),
-- maar deze worden NOOIT in knowledge_articles opgeslagen.

CREATE TABLE IF NOT EXISTS knowledge_scrape_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  scrape_source TEXT NOT NULL,                    -- "fc" (later: "dlv", "wur", "ctgb", etc.)
  scrape_type TEXT NOT NULL,                      -- weekly_advice | research | regulation | product_update

  raw_content_hash TEXT NOT NULL,                 -- SHA-256 van ruwe content
  source_identifier TEXT,                         -- typh_id, document_id, etc. — uniek per bron-item
  source_metadata JSONB,                          -- titel, datum, etc. — alleen voor logging

  articles_created INT DEFAULT 0,
  articles_updated INT DEFAULT 0,
  articles_fused INT DEFAULT 0,

  status TEXT DEFAULT 'pending',                  -- pending | processing | completed | failed | skipped
  error_message TEXT,

  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scrape_log_source ON knowledge_scrape_log(scrape_source);
CREATE INDEX IF NOT EXISTS idx_scrape_log_hash ON knowledge_scrape_log(raw_content_hash);
CREATE INDEX IF NOT EXISTS idx_scrape_log_source_identifier
  ON knowledge_scrape_log(scrape_source, source_identifier);
CREATE INDEX IF NOT EXISTS idx_scrape_log_started_at ON knowledge_scrape_log(started_at DESC);

ALTER TABLE knowledge_scrape_log ENABLE ROW LEVEL SECURITY;
-- Geen public policies — alleen toegankelijk via service role

-- ============================================
-- RPC: match_knowledge_articles
-- Semantic search voor de kennisbank chatbot (Fase 2)
-- ============================================

CREATE OR REPLACE FUNCTION match_knowledge_articles(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5,
  filter_crop text DEFAULT NULL,
  filter_category text DEFAULT NULL,
  filter_subcategory text DEFAULT NULL,
  filter_month int DEFAULT NULL
)
RETURNS TABLE (
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
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.content,
    a.summary,
    a.category,
    a.subcategory,
    a.knowledge_type,
    a.crops,
    a.season_phases,
    a.relevant_months,
    a.products_mentioned,
    a.is_public_source,
    a.public_source_ref,
    1 - (a.content_embedding <=> query_embedding) AS similarity
  FROM knowledge_articles a
  WHERE
    a.status = 'published'
    AND a.content_embedding IS NOT NULL
    AND 1 - (a.content_embedding <=> query_embedding) > match_threshold
    AND (filter_crop IS NULL OR filter_crop = ANY(a.crops))
    AND (filter_category IS NULL OR a.category = filter_category)
    AND (filter_subcategory IS NULL OR a.subcategory = filter_subcategory)
    AND (filter_month IS NULL OR filter_month = ANY(a.relevant_months) OR a.is_evergreen = true)
  ORDER BY a.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- RPC: find_fusion_candidate
-- Vindt een bestaand kennisartikel met hoge overlap voor fusie-detectie
-- ============================================

CREATE OR REPLACE FUNCTION find_fusion_candidate(
  query_embedding vector(768),
  filter_category text,
  filter_subcategory text DEFAULT NULL,
  filter_crops text[] DEFAULT NULL,
  similarity_threshold float DEFAULT 0.90
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  summary text,
  category text,
  subcategory text,
  knowledge_type text,
  crops text[],
  varieties text[],
  season_phases text[],
  relevant_months int[],
  products_mentioned text[],
  fusion_sources int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.content,
    a.summary,
    a.category,
    a.subcategory,
    a.knowledge_type,
    a.crops,
    a.varieties,
    a.season_phases,
    a.relevant_months,
    a.products_mentioned,
    a.fusion_sources,
    1 - (a.content_embedding <=> query_embedding) AS similarity
  FROM knowledge_articles a
  WHERE
    a.content_embedding IS NOT NULL
    AND a.category = filter_category
    AND (filter_subcategory IS NULL OR a.subcategory = filter_subcategory)
    AND (filter_crops IS NULL OR a.crops && filter_crops)
    AND 1 - (a.content_embedding <=> query_embedding) > similarity_threshold
  ORDER BY a.content_embedding <=> query_embedding
  LIMIT 1;
END;
$$;
