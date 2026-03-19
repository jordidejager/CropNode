-- Migration: BRP Gewasrotatiehistorie
-- Adds: brp_gewascodes lookup table, brp_gewashistorie cache table

-- ============================================
-- 1. Gewascodes lookup table (public, no user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS brp_gewascodes (
    gewascode INTEGER PRIMARY KEY,
    gewas TEXT NOT NULL,
    category TEXT NOT NULL,
    crop_group TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed most relevant codes for fruit farming
INSERT INTO brp_gewascodes (gewascode, gewas, category, crop_group) VALUES
    (233,  'Appelen', 'Tuinbouw', 'Fruit'),
    (234,  'Peren', 'Tuinbouw', 'Fruit'),
    (235,  'Pruimen', 'Tuinbouw', 'Fruit'),
    (236,  'Kersen', 'Tuinbouw', 'Fruit'),
    (237,  'Andere steenvruchten', 'Tuinbouw', 'Fruit'),
    (256,  'Aardbeien', 'Tuinbouw', 'Fruit'),
    (259,  'Mais, snij-', 'Bouwland', 'Akkerbouw'),
    (265,  'Grasland, blijvend', 'Grasland', 'Grasland'),
    (266,  'Grasland, tijdelijk', 'Grasland', 'Grasland'),
    (331,  'Grasland, natuurlijk', 'Grasland', 'Grasland'),
    (332,  'Grasland, tijdelijk', 'Grasland', 'Grasland'),
    (343,  'Sloot', 'Water', 'Overig'),
    (1926, 'Agrarisch natuurmengsel', 'Grasland', 'Grasland'),
    (2596, 'Overig pit- en steenfruit', 'Tuinbouw', 'Fruit'),
    (2741, 'Braak', 'Bouwland', 'Overig'),
    (3724, 'Natuur', 'Natuur', 'Overig')
ON CONFLICT (gewascode) DO NOTHING;

-- ============================================
-- 2. Gewashistorie cache table (per user)
-- ============================================
CREATE TABLE IF NOT EXISTS brp_gewashistorie (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    jaar INTEGER NOT NULL,
    gewascode INTEGER NOT NULL,
    gewas TEXT NOT NULL,
    category TEXT,
    crop_group TEXT NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    UNIQUE(parcel_id, jaar, user_id)
);

-- ============================================
-- 3. RLS policies
-- ============================================
ALTER TABLE brp_gewascodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gewascodes are publicly readable" ON brp_gewascodes
    FOR SELECT USING (true);

ALTER TABLE brp_gewashistorie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brp_gewashistorie" ON brp_gewashistorie
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own brp_gewashistorie" ON brp_gewashistorie
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own brp_gewashistorie" ON brp_gewashistorie
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own brp_gewashistorie" ON brp_gewashistorie
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 4. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_brp_gewashistorie_parcel_id ON brp_gewashistorie(parcel_id);
CREATE INDEX IF NOT EXISTS idx_brp_gewashistorie_user_id ON brp_gewashistorie(user_id);
CREATE INDEX IF NOT EXISTS idx_brp_gewashistorie_jaar ON brp_gewashistorie(jaar);
