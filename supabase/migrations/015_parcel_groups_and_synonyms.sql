-- Migration: Parcel Groups & Synonyms
-- Adds: parcel_groups table, parcel_group_members junction table, synonyms column on sub_parcels

-- ============================================
-- 1. Parcel Groups table
-- ============================================
CREATE TABLE IF NOT EXISTS parcel_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(name, user_id)
);

-- 2. Junction table: sub_parcels → groups (many-to-many)
CREATE TABLE IF NOT EXISTS parcel_group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES parcel_groups(id) ON DELETE CASCADE,
    sub_parcel_id TEXT NOT NULL REFERENCES sub_parcels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(group_id, sub_parcel_id)
);

-- 3. Add synonyms column to sub_parcels
ALTER TABLE sub_parcels
ADD COLUMN IF NOT EXISTS synonyms TEXT[] DEFAULT '{}';

-- ============================================
-- 4. RLS policies
-- ============================================
ALTER TABLE parcel_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own parcel_groups" ON parcel_groups
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own parcel_groups" ON parcel_groups
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own parcel_groups" ON parcel_groups
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own parcel_groups" ON parcel_groups
    FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE parcel_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own parcel_group_members" ON parcel_group_members
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own parcel_group_members" ON parcel_group_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own parcel_group_members" ON parcel_group_members
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own parcel_group_members" ON parcel_group_members
    FOR DELETE USING (auth.uid() = user_id);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_parcel_group_members_group_id ON parcel_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_parcel_group_members_sub_parcel_id ON parcel_group_members(sub_parcel_id);
CREATE INDEX IF NOT EXISTS idx_parcel_groups_user_id ON parcel_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_parcels_synonyms ON sub_parcels USING gin(synonyms);

-- ============================================
-- 6. Update v_sprayable_parcels view to include synonyms
-- ============================================
DROP VIEW IF EXISTS v_sprayable_parcels;

CREATE VIEW v_sprayable_parcels AS
SELECT
    sp.id,
    CASE
        WHEN p.name IS NOT NULL AND sp.name IS NOT NULL AND sp.name != '' THEN
            CONCAT(p.name, ' ', sp.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
        WHEN p.name IS NOT NULL THEN
            CONCAT(p.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
        WHEN sp.name IS NOT NULL AND sp.name != '' THEN
            CONCAT(sp.name, ' (', COALESCE(sp.variety, sp.crop, 'Onbekend'), ')')
        ELSE
            CONCAT(COALESCE(sp.crop, 'Perceel'), ' ', COALESCE(sp.variety, ''), ' - ', LEFT(sp.id::text, 8))
    END AS name,
    sp.area,
    sp.crop,
    sp.variety,
    p.id AS parcel_id,
    p.name AS parcel_name,
    p.location,
    p.geometry,
    p.source,
    p.rvo_id,
    sp.synonyms,
    sp.created_at,
    sp.updated_at,
    sp.user_id
FROM
    sub_parcels sp
LEFT JOIN
    parcels p ON sp.parcel_id = p.id
ORDER BY
    COALESCE(p.name, sp.name, sp.crop), sp.name;
