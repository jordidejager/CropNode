-- ============================================
-- 038: Sync Infrastructure
-- Logging en tracking voor product synchronisatie
-- ============================================

-- Sync log tabel
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('ctgb', 'fertilizer', 'all')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  products_added INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  products_withdrawn INTEGER DEFAULT 0,
  aliases_added INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  summary TEXT,
  triggered_by TEXT DEFAULT 'manual'  -- 'manual', 'cron', 'webhook'
);

CREATE INDEX IF NOT EXISTS idx_sync_log_source ON sync_log(source);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at DESC);

-- RLS
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read sync_log" ON sync_log FOR SELECT USING (true);
CREATE POLICY "Allow authenticated write sync_log" ON sync_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update sync_log" ON sync_log FOR UPDATE USING (true);

-- ============================================
-- Product change log — changelog per product
-- ============================================

CREATE TABLE IF NOT EXISTS product_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  sync_log_id UUID REFERENCES sync_log(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('added', 'updated', 'withdrawn', 'reactivated')),
  changed_fields TEXT[],  -- welke velden zijn gewijzigd
  old_values JSONB,       -- vorige waarden (voor updates)
  new_values JSONB,       -- nieuwe waarden
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changelog_product ON product_changelog(product_id);
CREATE INDEX IF NOT EXISTS idx_changelog_sync ON product_changelog(sync_log_id);
CREATE INDEX IF NOT EXISTS idx_changelog_type ON product_changelog(change_type);
CREATE INDEX IF NOT EXISTS idx_changelog_created ON product_changelog(created_at DESC);

-- RLS
ALTER TABLE product_changelog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read changelog" ON product_changelog FOR SELECT USING (true);
CREATE POLICY "Allow authenticated write changelog" ON product_changelog FOR INSERT WITH CHECK (true);
