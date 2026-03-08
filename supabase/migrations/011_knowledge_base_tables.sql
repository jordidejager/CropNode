-- ============================================
-- KENNISBANK TABELLEN
-- ============================================

-- Bloeidatum referentie per user per jaar
CREATE TABLE bloom_references (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  bloom_date DATE NOT NULL,
  crop VARCHAR DEFAULT 'conference',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year, crop)
);

-- Kennisbank onderwerpen (de factsheets)
CREATE TABLE kb_topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug VARCHAR UNIQUE NOT NULL,
  title VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  subcategory VARCHAR,
  applies_to TEXT[] DEFAULT ARRAY['appel', 'peer'],
  summary TEXT,
  content JSONB NOT NULL,
  phenological_phases TEXT[],
  search_keywords TEXT[],
  article_count INTEGER DEFAULT 0,
  coverage_period VARCHAR,
  coverage_quality VARCHAR,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Middelen per onderwerp
CREATE TABLE kb_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID REFERENCES kb_topics(id) ON DELETE CASCADE,
  product_name VARCHAR NOT NULL,
  active_substance VARCHAR,
  product_type VARCHAR,
  application_type VARCHAR,
  applies_to TEXT[] NOT NULL,
  dosage VARCHAR,
  timing VARCHAR,
  remarks TEXT,
  UNIQUE(topic_id, product_name, applies_to)
);

-- Bestrijdings-/teeltstrategie als tijdlijn
CREATE TABLE kb_strategy_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID REFERENCES kb_topics(id) ON DELETE CASCADE,
  phase VARCHAR NOT NULL,
  sort_order INTEGER NOT NULL,
  action TEXT NOT NULL,
  applies_to TEXT[] DEFAULT ARRAY['appel', 'peer'],
  urgency VARCHAR DEFAULT 'seasonal',
  products TEXT[],
  dosages TEXT[],
  conditions TEXT,
  sub_timing VARCHAR
);

-- Rasgevoeligheid
CREATE TABLE kb_variety_susceptibility (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID REFERENCES kb_topics(id) ON DELETE CASCADE,
  variety_name VARCHAR NOT NULL,
  fruit_type VARCHAR NOT NULL,
  susceptibility VARCHAR NOT NULL,
  notes TEXT,
  UNIQUE(topic_id, variety_name)
);

-- Wetenschappelijke verrijking (Deep Research, papers, proefresultaten)
CREATE TABLE kb_research_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID REFERENCES kb_topics(id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  summary TEXT,
  key_insights JSONB,
  conflicts TEXT,
  source_type VARCHAR DEFAULT 'deep_research',
  source_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seizoensactiepunten status per user
CREATE TABLE season_action_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_step_id UUID REFERENCES kb_strategy_steps(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  status VARCHAR DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, strategy_step_id, year)
);

-- ============================================
-- INDEXEN
-- ============================================

CREATE INDEX idx_kb_topics_category ON kb_topics(category);
CREATE INDEX idx_kb_topics_slug ON kb_topics(slug);
CREATE INDEX idx_kb_topics_phases ON kb_topics USING GIN(phenological_phases);
CREATE INDEX idx_kb_topics_keywords ON kb_topics USING GIN(search_keywords);

CREATE INDEX idx_kb_products_topic ON kb_products(topic_id);
CREATE INDEX idx_kb_products_name ON kb_products(product_name);

CREATE INDEX idx_kb_strategy_topic ON kb_strategy_steps(topic_id);
CREATE INDEX idx_kb_strategy_phase ON kb_strategy_steps(phase);
CREATE INDEX idx_kb_strategy_order ON kb_strategy_steps(topic_id, sort_order);

CREATE INDEX idx_kb_variety_topic ON kb_variety_susceptibility(topic_id);
CREATE INDEX idx_kb_variety_fruit ON kb_variety_susceptibility(fruit_type);

CREATE INDEX idx_kb_research_topic ON kb_research_notes(topic_id);

CREATE INDEX idx_bloom_ref_user ON bloom_references(user_id);
CREATE INDEX idx_season_log_user ON season_action_log(user_id);
CREATE INDEX idx_season_log_step ON season_action_log(strategy_step_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE bloom_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_strategy_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_variety_susceptibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_research_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_action_log ENABLE ROW LEVEL SECURITY;

-- Bloom references: eigen records
CREATE POLICY "Users can view own bloom references"
  ON bloom_references FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bloom references"
  ON bloom_references FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bloom references"
  ON bloom_references FOR UPDATE USING (auth.uid() = user_id);

-- KB tabellen: lezen voor alle ingelogde users
CREATE POLICY "Authenticated users can read kb_topics"
  ON kb_topics FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read kb_products"
  ON kb_products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read kb_strategy_steps"
  ON kb_strategy_steps FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read kb_variety_susceptibility"
  ON kb_variety_susceptibility FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read kb_research_notes"
  ON kb_research_notes FOR SELECT USING (auth.role() = 'authenticated');

-- Season action log: eigen records
CREATE POLICY "Users can view own season actions"
  ON season_action_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own season actions"
  ON season_action_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own season actions"
  ON season_action_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own season actions"
  ON season_action_log FOR DELETE USING (auth.uid() = user_id);
