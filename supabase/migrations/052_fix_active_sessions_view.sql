-- Fix: recreate views for task sessions and logs
-- Error: "column v_active_task_sessions_enriched.default_hourly_rate does not exist"

-- Ensure task_types has the column (idempotent)
ALTER TABLE task_types ADD COLUMN IF NOT EXISTS default_hourly_rate DECIMAL(10,2) DEFAULT 25.00;

-- Drop and recreate (CREATE OR REPLACE can't change column order)
DROP VIEW IF EXISTS v_active_task_sessions_enriched;
CREATE VIEW v_active_task_sessions_enriched AS
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

DROP VIEW IF EXISTS v_task_logs_enriched;
CREATE VIEW v_task_logs_enriched AS
SELECT
    tl.id,
    tl.start_date,
    tl.end_date,
    tl.days,
    tl.sub_parcel_id,
    CASE
        WHEN sp.variety IS NOT NULL THEN p.name || ' (' || sp.variety || ')'
        ELSE p.name
    END AS sub_parcel_name,
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
LEFT JOIN parcels p ON sp.parcel_id = p.id
ORDER BY tl.start_date DESC, tl.created_at DESC;

-- Ensure grants
GRANT SELECT ON v_active_task_sessions_enriched TO anon, authenticated;
GRANT SELECT ON v_task_logs_enriched TO anon, authenticated;
