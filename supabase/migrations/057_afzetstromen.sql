-- Migration: Afzetstromen (Post-harvest workflow)
-- Purpose: Partij-record + event-log voor transport, sortering, afzet, koelcel-events, kwaliteitsmeting.
-- Strategy:
--   * `batches` is het centrale partij-record.
--   * `batch_events` is een uniforme event-log met jsonb details en uniforme kg/cost/revenue velden.
--   * Bestaande `harvest_registrations` wordt 1:1 gebootstrapt naar `batches`.
--   * `cell_sub_parcels.harvest_registration_id` blijft ongewijzigd — geen breaking change.
--
-- Storage bucket: `partij-documenten` moet handmatig worden aangemaakt in Supabase Dashboard
-- met RLS policy op path-prefix `{user_id}/...`. Zie inline comments onderaan.

-- ============================================================================
-- Enum: batch_event_type
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE batch_event_type AS ENUM (
    'inslag',
    'uitslag',
    'verplaatsing',
    'transport',
    'sortering_extern',
    'sortering_eigen',
    'afzet',
    'correctie',
    'kwaliteitsmeting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Table: batches (partij-record)
-- ============================================================================

CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optional link to the harvest registration this batch originates from.
  -- NULL if the batch is the result of merging multiple harvest registrations
  -- (see `batch_sources`) or was created manually without a harvest record.
  harvest_registration_id UUID REFERENCES harvest_registrations(id) ON DELETE SET NULL,

  -- Auto-generated on INSERT from variety + sub_parcel_name + pick_number + year,
  -- but editable by the user (nullable → fallback to auto-computed display label in UI).
  label TEXT,

  -- Denormalized for filtering/display without joining harvest_registrations
  variety TEXT,
  season TEXT,
  harvest_year INTEGER,

  -- Lifecycle state
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'gereserveerd_voor_afnemer', 'closed', 'archived')),
  reserved_for TEXT, -- afnemer-naam als status = 'gereserveerd_voor_afnemer'

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batches" ON batches;
CREATE POLICY "Users can view own batches"
  ON batches FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own batches" ON batches;
CREATE POLICY "Users can insert own batches"
  ON batches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own batches" ON batches;
CREATE POLICY "Users can update own batches"
  ON batches FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own batches" ON batches;
CREATE POLICY "Users can delete own batches"
  ON batches FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_batches_user ON batches(user_id);
CREATE INDEX IF NOT EXISTS idx_batches_harvest_registration ON batches(harvest_registration_id);
CREATE INDEX IF NOT EXISTS idx_batches_season ON batches(season);
CREATE INDEX IF NOT EXISTS idx_batches_harvest_year ON batches(harvest_year);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

DROP TRIGGER IF EXISTS batches_updated_at ON batches;
CREATE TRIGGER batches_updated_at
  BEFORE UPDATE ON batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Table: batch_sources (m:m voor gemengde partijen uit meerdere harvests)
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_sources (
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  harvest_registration_id UUID NOT NULL REFERENCES harvest_registrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kg_portion NUMERIC, -- hoeveel kg van die oorspronkelijke oogst in deze partij zit (optioneel)
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (batch_id, harvest_registration_id)
);

ALTER TABLE batch_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batch_sources" ON batch_sources;
CREATE POLICY "Users can view own batch_sources"
  ON batch_sources FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own batch_sources" ON batch_sources;
CREATE POLICY "Users can insert own batch_sources"
  ON batch_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own batch_sources" ON batch_sources;
CREATE POLICY "Users can update own batch_sources"
  ON batch_sources FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own batch_sources" ON batch_sources;
CREATE POLICY "Users can delete own batch_sources"
  ON batch_sources FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_batch_sources_batch ON batch_sources(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_sources_harvest ON batch_sources(harvest_registration_id);

-- ============================================================================
-- Table: batch_parcels (m:m voor partijen zonder harvest_registration)
-- Fallback voor batches die direct aan percelen gekoppeld zijn zonder dat er
-- een harvest_registration record is. Meestal leeg — batches zijn normaal
-- gekoppeld via harvest_registration_id of batch_sources.
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parcel_id TEXT REFERENCES parcels(id) ON DELETE SET NULL,
  sub_parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL,
  estimated_kg NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batch_parcels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batch_parcels" ON batch_parcels;
CREATE POLICY "Users can view own batch_parcels"
  ON batch_parcels FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own batch_parcels" ON batch_parcels;
CREATE POLICY "Users can insert own batch_parcels"
  ON batch_parcels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own batch_parcels" ON batch_parcels;
CREATE POLICY "Users can update own batch_parcels"
  ON batch_parcels FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own batch_parcels" ON batch_parcels;
CREATE POLICY "Users can delete own batch_parcels"
  ON batch_parcels FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_batch_parcels_batch ON batch_parcels(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_parcels_parcel ON batch_parcels(parcel_id);
CREATE INDEX IF NOT EXISTS idx_batch_parcels_sub_parcel ON batch_parcels(sub_parcel_id);

-- ============================================================================
-- Table: batch_events (central event-log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,

  event_type batch_event_type NOT NULL,
  event_date DATE, -- nullable: retroactieve invoer mag zonder datum

  -- Uniform reporting fields (nullable; welke van toepassing is hangt af van event_type).
  --   kg     : + voor inslag/sortering_output, - voor uitslag/afzet/verlies
  --   cost   : altijd positief (transport, sortering-kosten, etc.)
  --   revenue: altijd positief (afzet)
  kg NUMERIC,
  cost_eur NUMERIC,
  revenue_eur NUMERIC,

  -- Optional link to current storage location (for inslag/verplaatsing events)
  storage_cell_id TEXT REFERENCES storage_cells(id) ON DELETE SET NULL,

  -- Type-specific fields live here.
  -- Examples:
  --   transport:         { carrier, from, to, distance_km, invoice_number }
  --   sortering_extern:  { sorter_name, invoice_number, sizes: [{size, class, kg, price_per_kg}] }
  --   sortering_eigen:   { sizes: [{size, class, kg}], rot_percentage, industrie_kg }
  --   afzet:             { buyer, price_per_kg, bonus_eur, deduction_eur, payment_date }
  --   verplaatsing:      { from_cell_id }
  --   kwaliteitsmeting:  { brix, firmness, starch_index, storage_scald, notes }
  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optional link to source document (factuur/sorteeroverzicht/klantorder)
  source_document_id UUID, -- FK set below after batch_documents exists

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batch_events" ON batch_events;
CREATE POLICY "Users can view own batch_events"
  ON batch_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own batch_events" ON batch_events;
CREATE POLICY "Users can insert own batch_events"
  ON batch_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own batch_events" ON batch_events;
CREATE POLICY "Users can update own batch_events"
  ON batch_events FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own batch_events" ON batch_events;
CREATE POLICY "Users can delete own batch_events"
  ON batch_events FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_batch_events_batch ON batch_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_events_user ON batch_events(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_events_type ON batch_events(event_type);
CREATE INDEX IF NOT EXISTS idx_batch_events_date ON batch_events(event_date);
CREATE INDEX IF NOT EXISTS idx_batch_events_storage_cell ON batch_events(storage_cell_id);

DROP TRIGGER IF EXISTS batch_events_updated_at ON batch_events;
CREATE TRIGGER batch_events_updated_at
  BEFORE UPDATE ON batch_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Table: batch_documents (uploads voor facturen, sorteeroverzichten, klantorders)
-- ============================================================================

CREATE TABLE IF NOT EXISTS batch_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Nullable: documenten kunnen in de "inbox" liggen zonder partij-koppeling.
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,

  -- Optional: direct gekoppeld aan een specifiek event (bv. factuur bij transport-event)
  linked_event_id UUID REFERENCES batch_events(id) ON DELETE SET NULL,

  storage_path TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,

  document_type TEXT NOT NULL DEFAULT 'overig'
    CHECK (document_type IN ('sorteer_overzicht', 'factuur', 'klant_order', 'overig')),

  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'linked', 'needs_review')),

  notes TEXT,

  uploaded_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE batch_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batch_documents" ON batch_documents;
CREATE POLICY "Users can view own batch_documents"
  ON batch_documents FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own batch_documents" ON batch_documents;
CREATE POLICY "Users can insert own batch_documents"
  ON batch_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own batch_documents" ON batch_documents;
CREATE POLICY "Users can update own batch_documents"
  ON batch_documents FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own batch_documents" ON batch_documents;
CREATE POLICY "Users can delete own batch_documents"
  ON batch_documents FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_batch_documents_user ON batch_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_documents_batch ON batch_documents(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_documents_status ON batch_documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_batch_documents_type ON batch_documents(document_type);

DROP TRIGGER IF EXISTS batch_documents_updated_at ON batch_documents;
CREATE TRIGGER batch_documents_updated_at
  BEFORE UPDATE ON batch_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- FK batch_events.source_document_id → batch_documents(id)
-- Added AFTER batch_documents exists to avoid circular dependency
DO $$ BEGIN
  ALTER TABLE batch_events
    ADD CONSTRAINT batch_events_source_document_fk
    FOREIGN KEY (source_document_id) REFERENCES batch_documents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- View: v_batch_current_storage
-- Derives current cell (if any) from the latest inslag/uitslag/verplaatsing event.
-- ============================================================================

CREATE OR REPLACE VIEW v_batch_current_storage AS
SELECT DISTINCT ON (batch_id)
  batch_id,
  user_id,
  event_type AS last_storage_event_type,
  event_date AS last_storage_event_date,
  CASE
    WHEN event_type = 'uitslag' THEN NULL
    ELSE storage_cell_id
  END AS current_storage_cell_id,
  created_at AS last_storage_event_created_at
FROM batch_events
WHERE event_type IN ('inslag', 'uitslag', 'verplaatsing')
ORDER BY batch_id, COALESCE(event_date, created_at::date) DESC, created_at DESC;

-- ============================================================================
-- View: v_batch_totals
-- Aggregates kg/cost/revenue across all events per batch for fast list-display.
-- ============================================================================

CREATE OR REPLACE VIEW v_batch_totals AS
SELECT
  b.id AS batch_id,
  b.user_id,
  COALESCE(SUM(be.kg) FILTER (WHERE be.event_type IN ('inslag', 'sortering_eigen', 'sortering_extern')), 0)::numeric AS total_kg_in,
  COALESCE(SUM(be.kg) FILTER (WHERE be.event_type IN ('uitslag', 'afzet')), 0)::numeric AS total_kg_out,
  COALESCE(SUM(be.cost_eur), 0)::numeric AS total_cost_eur,
  COALESCE(SUM(be.revenue_eur), 0)::numeric AS total_revenue_eur,
  (COALESCE(SUM(be.revenue_eur), 0) - COALESCE(SUM(be.cost_eur), 0))::numeric AS margin_eur,
  COUNT(be.id)::integer AS event_count
FROM batches b
LEFT JOIN batch_events be ON be.batch_id = b.id
GROUP BY b.id, b.user_id;

-- ============================================================================
-- View: v_batches_enriched
-- Central list-view combining batches + harvest_registration context + totals + storage.
-- ============================================================================

CREATE OR REPLACE VIEW v_batches_enriched AS
SELECT
  b.id,
  b.user_id,
  b.harvest_registration_id,
  b.label,
  b.variety,
  b.season,
  b.harvest_year,
  b.status,
  b.reserved_for,
  b.notes,
  b.created_at,
  b.updated_at,
  -- harvest_registration context (may be null for merged batches)
  hr.harvest_date,
  hr.pick_number,
  hr.total_crates,
  hr.weight_per_crate,
  hr.quality_class,
  hr.parcel_id,
  hr.sub_parcel_id,
  p.name AS parcel_name,
  sp.name AS sub_parcel_name,
  -- storage from view
  vcs.current_storage_cell_id,
  vcs.last_storage_event_type,
  vcs.last_storage_event_date,
  sc.name AS current_storage_cell_name,
  -- totals from view
  COALESCE(vbt.total_kg_in, 0) AS total_kg_in,
  COALESCE(vbt.total_kg_out, 0) AS total_kg_out,
  COALESCE(vbt.total_cost_eur, 0) AS total_cost_eur,
  COALESCE(vbt.total_revenue_eur, 0) AS total_revenue_eur,
  COALESCE(vbt.margin_eur, 0) AS margin_eur,
  COALESCE(vbt.event_count, 0) AS event_count
FROM batches b
LEFT JOIN harvest_registrations hr ON hr.id = b.harvest_registration_id
LEFT JOIN parcels p ON p.id = hr.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = hr.sub_parcel_id
LEFT JOIN v_batch_current_storage vcs ON vcs.batch_id = b.id
LEFT JOIN storage_cells sc ON sc.id = vcs.current_storage_cell_id
LEFT JOIN v_batch_totals vbt ON vbt.batch_id = b.id;

-- ============================================================================
-- Bootstrap: create one batch per existing harvest_registration (1:1)
-- Skips any harvest that already has a batch (idempotent).
-- Also back-fills an `inslag` event if the harvest is linked to a storage cell.
-- ============================================================================

INSERT INTO batches (
  user_id,
  harvest_registration_id,
  label,
  variety,
  season,
  harvest_year,
  status,
  created_at,
  updated_at
)
SELECT
  hr.user_id,
  hr.id,
  -- Auto-generated label: "Elstar — P2 — Perceel 3B — 2025"
  CONCAT_WS(
    ' — ',
    hr.variety,
    CASE WHEN hr.pick_number > 1 THEN 'P' || hr.pick_number ELSE NULL END,
    COALESCE(sp.name, p.name),
    EXTRACT(YEAR FROM hr.harvest_date)::text
  ) AS label,
  hr.variety,
  hr.season,
  -- Derive harvest_year: July-Dec → same year; Jan-Jun → previous year's campaign
  CASE WHEN EXTRACT(MONTH FROM hr.harvest_date) >= 7
    THEN EXTRACT(YEAR FROM hr.harvest_date)::integer
    ELSE EXTRACT(YEAR FROM hr.harvest_date)::integer
  END AS harvest_year,
  'active' AS status,
  hr.created_at,
  hr.updated_at
FROM harvest_registrations hr
LEFT JOIN parcels p ON p.id = hr.parcel_id
LEFT JOIN sub_parcels sp ON sp.id = hr.sub_parcel_id
WHERE NOT EXISTS (
  SELECT 1 FROM batches b WHERE b.harvest_registration_id = hr.id
);

-- Back-fill `inslag` events for batches whose harvest is currently linked to a storage cell
INSERT INTO batch_events (
  user_id,
  batch_id,
  event_type,
  event_date,
  kg,
  storage_cell_id,
  details,
  notes
)
SELECT
  b.user_id,
  b.id,
  'inslag'::batch_event_type,
  hr.harvest_date,
  CASE
    WHEN hr.weight_per_crate IS NOT NULL AND vhrt.stored_crates IS NOT NULL
      THEN (hr.weight_per_crate * vhrt.stored_crates)::numeric
    ELSE NULL
  END AS kg,
  -- first linked cell if multiple; NULL otherwise
  (
    SELECT csp.cell_id
    FROM cell_sub_parcels csp
    WHERE csp.harvest_registration_id = hr.id
    ORDER BY csp.created_at ASC
    LIMIT 1
  ) AS storage_cell_id,
  jsonb_build_object('source', 'bootstrap', 'stored_crates', vhrt.stored_crates),
  'Automatisch aangemaakt bij migratie 057 op basis van bestaande koelcelkoppeling.'
FROM batches b
JOIN harvest_registrations hr ON hr.id = b.harvest_registration_id
LEFT JOIN v_harvest_registration_totals vhrt ON vhrt.id = hr.id
WHERE EXISTS (
  SELECT 1 FROM cell_sub_parcels csp
  WHERE csp.harvest_registration_id = hr.id
)
AND NOT EXISTS (
  SELECT 1 FROM batch_events be
  WHERE be.batch_id = b.id AND be.event_type = 'inslag'
);

-- ============================================================================
-- Storage bucket (create via Supabase Dashboard — SQL cannot create buckets)
-- ============================================================================
--
-- 1. Supabase Dashboard → Storage → New bucket
--    Name: partij-documenten
--    Public: false
--
-- 2. Add RLS policies on storage.objects for this bucket:
--
--    -- SELECT (users can read their own files)
--    CREATE POLICY "Users can view own partij-documenten"
--      ON storage.objects FOR SELECT
--      USING (bucket_id = 'partij-documenten' AND auth.uid()::text = (storage.foldername(name))[1]);
--
--    -- INSERT (users can upload to their own folder)
--    CREATE POLICY "Users can upload partij-documenten"
--      ON storage.objects FOR INSERT
--      WITH CHECK (bucket_id = 'partij-documenten' AND auth.uid()::text = (storage.foldername(name))[1]);
--
--    -- DELETE (users can delete their own files)
--    CREATE POLICY "Users can delete own partij-documenten"
--      ON storage.objects FOR DELETE
--      USING (bucket_id = 'partij-documenten' AND auth.uid()::text = (storage.foldername(name))[1]);
--
-- Path convention: `{user_id}/{batch_id_or_inbox}/{timestamp}-{filename}`
