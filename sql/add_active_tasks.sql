-- ============================================
-- Active Task Sessions - Live Timer Functionaliteit
-- ============================================

-- Tabel voor actieve/lopende taken (nog niet afgerond)
CREATE TABLE IF NOT EXISTS active_task_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_type_id UUID NOT NULL REFERENCES task_types(id) ON DELETE RESTRICT,
    sub_parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    people_count INTEGER NOT NULL DEFAULT 1 CHECK (people_count > 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes voor snelle queries
CREATE INDEX IF NOT EXISTS idx_active_task_sessions_start_time ON active_task_sessions(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_active_task_sessions_task_type ON active_task_sessions(task_type_id);

-- View met joined data voor actieve sessies
CREATE OR REPLACE VIEW v_active_task_sessions_enriched AS
SELECT
    ats.id,
    ats.task_type_id,
    tt.name AS task_type_name,
    tt.default_hourly_rate,
    ats.sub_parcel_id,
    CASE
        WHEN sp.variety IS NOT NULL THEN p.name || ' (' || sp.variety || ')'
        ELSE p.name
    END AS sub_parcel_name,
    ats.start_time,
    ats.people_count,
    ats.notes,
    ats.created_at
FROM active_task_sessions ats
JOIN task_types tt ON ats.task_type_id = tt.id
LEFT JOIN sub_parcels sp ON ats.sub_parcel_id = sp.id
LEFT JOIN parcels p ON sp.parcel_id = p.id
ORDER BY ats.start_time DESC;

-- Grant permissions (voor anon key)
GRANT SELECT, INSERT, UPDATE, DELETE ON active_task_sessions TO anon;
GRANT SELECT ON v_active_task_sessions_enriched TO anon;
