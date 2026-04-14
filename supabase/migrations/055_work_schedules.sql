-- Work Schedule: per-user werkweek configuratie
-- Gebruikt bij het stoppen van multi-dag actieve taken

CREATE TABLE IF NOT EXISTS work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=zondag, 1=maandag...6=zaterdag
    is_workday BOOLEAN NOT NULL DEFAULT true,
    start_time TIME,
    end_time TIME,
    -- Pauzes als JSON array: [{"start":"12:00","end":"12:30"},{"start":"15:00","end":"15:15"}]
    breaks JSONB NOT NULL DEFAULT '[]',
    -- Legacy fallback (computed from breaks for backward compat)
    break_minutes INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, day_of_week)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_work_schedules_user ON work_schedules(user_id);

-- RLS
ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own work_schedules" ON work_schedules;
CREATE POLICY "Users can view own work_schedules" ON work_schedules
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own work_schedules" ON work_schedules;
CREATE POLICY "Users can insert own work_schedules" ON work_schedules
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own work_schedules" ON work_schedules;
CREATE POLICY "Users can update own work_schedules" ON work_schedules
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own work_schedules" ON work_schedules;
CREATE POLICY "Users can delete own work_schedules" ON work_schedules
    FOR DELETE USING (auth.uid() = user_id);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON work_schedules TO authenticated;

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER update_work_schedules_updated_at
    BEFORE UPDATE ON work_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
