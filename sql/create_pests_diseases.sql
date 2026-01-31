-- ============================================
-- Pests & Diseases Database Schema
-- Ziekte- en plagenbibliotheek voor appel en peer
-- ============================================
-- RUN THIS FILE IN PARTS IN SUPABASE SQL EDITOR
-- ============================================

-- PART 1: Create enums (run first)
-- ============================================
DO $$ BEGIN
    CREATE TYPE pest_type AS ENUM ('fungus', 'insect', 'bacteria', 'virus', 'mite', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE crop_type AS ENUM ('apple', 'pear', 'both');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE impact_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- PART 2: Create main table
-- ============================================
CREATE TABLE IF NOT EXISTS pests_diseases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Identity
    name TEXT NOT NULL,
    latin_name TEXT,
    type pest_type NOT NULL,
    crop crop_type NOT NULL DEFAULT 'both',

    -- Severity & Impact
    impact_level impact_level NOT NULL DEFAULT 'medium',
    subtitle TEXT,

    -- Visual Content
    hero_image_url TEXT,
    gallery_images JSONB DEFAULT '[]'::jsonb,

    -- Biology & Conditions
    overwintering TEXT,
    infection_conditions TEXT,
    damage_threshold TEXT,

    -- Lifecycle Timeline
    lifecycle_timeline JSONB DEFAULT '[]'::jsonb,

    -- Recognition & Symptoms
    symptoms JSONB DEFAULT '[]'::jsonb,

    -- Control Strategies
    biological_control TEXT,
    cultural_control TEXT,
    chemical_control TEXT,

    -- Tags & Search
    tags TEXT[] DEFAULT '{}',
    search_keywords TEXT[] DEFAULT '{}',

    -- External links & products
    related_products TEXT[] DEFAULT '{}',
    external_links JSONB DEFAULT '[]'::jsonb
);

-- PART 3: Create indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pests_diseases_type ON pests_diseases(type);
CREATE INDEX IF NOT EXISTS idx_pests_diseases_crop ON pests_diseases(crop);
CREATE INDEX IF NOT EXISTS idx_pests_diseases_impact ON pests_diseases(impact_level);
CREATE INDEX IF NOT EXISTS idx_pests_diseases_name ON pests_diseases(name);
CREATE INDEX IF NOT EXISTS idx_pests_diseases_search ON pests_diseases USING GIN(search_keywords);

-- PART 4: Enable RLS
-- ============================================
ALTER TABLE pests_diseases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access" ON pests_diseases;
DROP POLICY IF EXISTS "Allow service role write access" ON pests_diseases;

-- Create policies
CREATE POLICY "Allow public read access" ON pests_diseases
    FOR SELECT USING (true);

CREATE POLICY "Allow service role write access" ON pests_diseases
    FOR ALL USING (auth.role() = 'service_role');

-- PART 5: Create trigger for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_pests_diseases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_pests_diseases_updated_at ON pests_diseases;

CREATE TRIGGER trigger_update_pests_diseases_updated_at
    BEFORE UPDATE ON pests_diseases
    FOR EACH ROW
    EXECUTE FUNCTION update_pests_diseases_updated_at();
