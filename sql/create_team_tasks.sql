-- ============================================
-- Team & Tasks Module - Database Schema
-- ============================================

-- 1. Task Types Table (de soorten werk)
CREATE TABLE IF NOT EXISTS task_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    default_hourly_rate DECIMAL(10,2) DEFAULT 25.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data voor standaard taaktypen
INSERT INTO task_types (name, default_hourly_rate) VALUES
    ('Snoeien', 25.00),
    ('Dunnen', 22.00),
    ('Plukken', 20.00),
    ('Sorteren', 18.00),
    ('Onderhoud', 25.00)
ON CONFLICT (name) DO NOTHING;

-- 2. Task Logs Table (de urenregistratie)
-- Note: sub_parcel_id is TEXT to match sub_parcels.id type
CREATE TABLE IF NOT EXISTS task_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL DEFAULT CURRENT_DATE,
    days DECIMAL(5,2) NOT NULL DEFAULT 1 CHECK (days > 0),
    sub_parcel_id TEXT REFERENCES sub_parcels(id) ON DELETE SET NULL,
    task_type_id UUID NOT NULL REFERENCES task_types(id) ON DELETE RESTRICT,
    people_count INTEGER NOT NULL DEFAULT 1 CHECK (people_count > 0),
    hours_per_person DECIMAL(5,2) NOT NULL CHECK (hours_per_person > 0),
    total_hours DECIMAL(10,2) GENERATED ALWAYS AS (people_count * hours_per_person * days) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes voor snelle queries
CREATE INDEX IF NOT EXISTS idx_task_logs_start_date ON task_logs(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_task_logs_end_date ON task_logs(end_date DESC);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_type ON task_logs(task_type_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_sub_parcel ON task_logs(sub_parcel_id);

-- Trigger voor updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to task_types
DROP TRIGGER IF EXISTS update_task_types_updated_at ON task_types;
CREATE TRIGGER update_task_types_updated_at
    BEFORE UPDATE ON task_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to task_logs
DROP TRIGGER IF EXISTS update_task_logs_updated_at ON task_logs;
CREATE TRIGGER update_task_logs_updated_at
    BEFORE UPDATE ON task_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- View: Task Logs met joined data (via sub_parcels)
-- ============================================
CREATE OR REPLACE VIEW v_task_logs_enriched AS
SELECT
    tl.id,
    tl.start_date,
    tl.end_date,
    tl.days,
    tl.sub_parcel_id,
    -- Build display name: "ParcelName (Variety)" or just "ParcelName"
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

-- ============================================
-- RLS Policies (indien nodig)
-- ============================================
-- ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow all for authenticated users" ON task_types
--     FOR ALL USING (auth.role() = 'authenticated');

-- CREATE POLICY "Allow all for authenticated users" ON task_logs
--     FOR ALL USING (auth.role() = 'authenticated');

-- Grant permissions (voor anon key)
GRANT SELECT, INSERT, UPDATE, DELETE ON task_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_logs TO anon;
GRANT SELECT ON v_task_logs_enriched TO anon;
