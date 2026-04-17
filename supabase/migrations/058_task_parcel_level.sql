-- Migration 058: Support whole-parcel selection for task logs and active sessions
--
-- Context:
-- Until now, task_logs and active_task_sessions only had `sub_parcel_id`.
-- Some tasks (e.g. snoeien) apply to an entire parcel, not a specific
-- sub-parcel. This migration introduces a parallel `parcel_id` column so
-- the user can pick either a specific sub-parcel OR an entire parcel.
--
-- Semantics:
--   sub_parcel_id NULL   + parcel_id NULL    → no parcel selected
--   sub_parcel_id NOT NULL + parcel_id *     → specific sub-parcel (parcel_id optional/derived)
--   sub_parcel_id NULL   + parcel_id NOT NULL → whole parcel selected
--
-- This is NOT a breaking change for existing rows: they have sub_parcel_id
-- as before (or NULL), and the new parcel_id column defaults to NULL.

-- ============================================
-- 1. Add parcel_id columns
-- ============================================

-- parcels.id is TEXT (RVO-afgeleid), niet UUID — daarom TEXT hier ook.
ALTER TABLE task_logs
  ADD COLUMN IF NOT EXISTS parcel_id TEXT REFERENCES parcels(id) ON DELETE SET NULL;

ALTER TABLE active_task_sessions
  ADD COLUMN IF NOT EXISTS parcel_id TEXT REFERENCES parcels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_logs_parcel_id
  ON task_logs(parcel_id)
  WHERE parcel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_active_task_sessions_parcel_id
  ON active_task_sessions(parcel_id)
  WHERE parcel_id IS NOT NULL;

-- ============================================
-- 2. Constraint: not both levels at the same time
--    (sub_parcel_id and parcel_id are mutually exclusive)
-- ============================================

-- Drop if exists first so the migration is idempotent
ALTER TABLE task_logs
  DROP CONSTRAINT IF EXISTS task_logs_parcel_level_check;
ALTER TABLE task_logs
  ADD CONSTRAINT task_logs_parcel_level_check
    CHECK (sub_parcel_id IS NULL OR parcel_id IS NULL);

ALTER TABLE active_task_sessions
  DROP CONSTRAINT IF EXISTS active_task_sessions_parcel_level_check;
ALTER TABLE active_task_sessions
  ADD CONSTRAINT active_task_sessions_parcel_level_check
    CHECK (sub_parcel_id IS NULL OR parcel_id IS NULL);

-- ============================================
-- 3. Recreate enriched views
--    - `sub_parcel_name` keeps its role as "the display name of the selected parcel"
--      (either sub-parcel naam of hoofdperceel + " — heel perceel"). This keeps
--      existing callers working without changes.
--    - New columns: `parcel_id`, `parcel_name`, `is_whole_parcel`.
-- ============================================

DROP VIEW IF EXISTS v_active_task_sessions_enriched;
CREATE VIEW v_active_task_sessions_enriched AS
SELECT
    ats.id,
    ats.task_type_id,
    tt.name AS task_type_name,
    tt.default_hourly_rate,
    ats.sub_parcel_id,
    ats.parcel_id,
    -- Display name: sub-parcel naam, of "<hoofdperceel> — heel perceel"
    CASE
        WHEN ats.sub_parcel_id IS NOT NULL THEN
            CASE
                WHEN sp.variety IS NOT NULL THEN sp_parcel.name || ' (' || sp.variety || ')'
                ELSE sp_parcel.name
            END
        WHEN ats.parcel_id IS NOT NULL THEN
            wp.name || ' — heel perceel'
        ELSE NULL
    END AS sub_parcel_name,
    -- Name of the parent parcel (for grouping / filtering)
    COALESCE(sp_parcel.name, wp.name) AS parcel_name,
    (ats.parcel_id IS NOT NULL) AS is_whole_parcel,
    ats.start_time,
    ats.people_count,
    ats.notes,
    ats.created_at
FROM active_task_sessions ats
JOIN task_types tt ON ats.task_type_id = tt.id
LEFT JOIN sub_parcels sp ON ats.sub_parcel_id = sp.id
LEFT JOIN parcels sp_parcel ON sp.parcel_id = sp_parcel.id
LEFT JOIN parcels wp ON ats.parcel_id = wp.id
ORDER BY ats.start_time DESC;

DROP VIEW IF EXISTS v_task_logs_enriched;
CREATE VIEW v_task_logs_enriched AS
SELECT
    tl.id,
    tl.start_date,
    tl.end_date,
    tl.days,
    tl.sub_parcel_id,
    tl.parcel_id,
    CASE
        WHEN tl.sub_parcel_id IS NOT NULL THEN
            CASE
                WHEN sp.variety IS NOT NULL THEN sp_parcel.name || ' (' || sp.variety || ')'
                ELSE sp_parcel.name
            END
        WHEN tl.parcel_id IS NOT NULL THEN
            wp.name || ' — heel perceel'
        ELSE NULL
    END AS sub_parcel_name,
    COALESCE(sp_parcel.name, wp.name) AS parcel_name,
    (tl.parcel_id IS NOT NULL) AS is_whole_parcel,
    tl.task_type_id,
    tt.name AS task_type_name,
    tt.default_hourly_rate,
    tl.people_count,
    tl.hours_per_person,
    tl.total_hours,
    (tl.total_hours * tt.default_hourly_rate) AS estimated_cost,
    tl.notes,
    tl.created_at,
    tl.updated_at
FROM task_logs tl
JOIN task_types tt ON tl.task_type_id = tt.id
LEFT JOIN sub_parcels sp ON tl.sub_parcel_id = sp.id
LEFT JOIN parcels sp_parcel ON sp.parcel_id = sp_parcel.id
LEFT JOIN parcels wp ON tl.parcel_id = wp.id
ORDER BY tl.start_date DESC, tl.created_at DESC;

-- Ensure grants
GRANT SELECT ON v_active_task_sessions_enriched TO anon, authenticated;
GRANT SELECT ON v_task_logs_enriched TO anon, authenticated;
