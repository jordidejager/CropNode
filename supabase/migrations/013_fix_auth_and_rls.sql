-- Migration 013: Fix auth trigger, add missing RLS policies, add cultivation_type, fix nullable user_id
-- Run this in the Supabase Dashboard SQL Editor

-- ============================================
-- 1. ADD cultivation_type COLUMN TO profiles
-- ============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS cultivation_type TEXT DEFAULT 'fruit'
CHECK (cultivation_type IN ('fruit', 'arable', 'other'));

-- Update existing profiles with cultivation_type from user metadata
UPDATE profiles p
SET cultivation_type = COALESCE(
  (SELECT raw_user_meta_data->>'cultivation_type' FROM auth.users u WHERE u.id = p.user_id),
  'fruit'
)
WHERE cultivation_type IS NULL OR cultivation_type = 'fruit';

-- ============================================
-- 2. FIX THE PROFILE TRIGGER
-- ============================================

-- Drop old trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate with better error handling and conflict handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, company_name, cultivation_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Onbekend'),
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'Onbekend'),
    COALESCE(NEW.raw_user_meta_data->>'cultivation_type', 'fruit')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log but don't fail user creation
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set search_path for security
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. RLS POLICIES FOR REFERENCE TABLES
-- These tables should be readable by ALL authenticated users
-- ============================================

-- pests_diseases: readable by all authenticated users
ALTER TABLE pests_diseases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read pests_diseases" ON pests_diseases;
CREATE POLICY "Authenticated users can read pests_diseases"
  ON pests_diseases FOR SELECT
  USING (auth.role() = 'authenticated');

-- fertilizers: readable by all authenticated users
ALTER TABLE fertilizers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fertilizers" ON fertilizers;
CREATE POLICY "Authenticated users can read fertilizers"
  ON fertilizers FOR SELECT
  USING (auth.role() = 'authenticated');

-- ctgb_products: readable by all authenticated users
ALTER TABLE ctgb_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ctgb_products" ON ctgb_products;
CREATE POLICY "Authenticated users can read ctgb_products"
  ON ctgb_products FOR SELECT
  USING (auth.role() = 'authenticated');

-- active_substances: readable by all authenticated users
ALTER TABLE active_substances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read active_substances" ON active_substances;
CREATE POLICY "Authenticated users can read active_substances"
  ON active_substances FOR SELECT
  USING (auth.role() = 'authenticated');

-- product_substances: readable by all authenticated users
ALTER TABLE product_substances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read product_substances" ON product_substances;
CREATE POLICY "Authenticated users can read product_substances"
  ON product_substances FOR SELECT
  USING (auth.role() = 'authenticated');

-- product_usages: readable by all authenticated users
ALTER TABLE product_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read product_usages" ON product_usages;
CREATE POLICY "Authenticated users can read product_usages"
  ON product_usages FOR SELECT
  USING (auth.role() = 'authenticated');

-- product_aliases: readable by all authenticated users
ALTER TABLE product_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read product_aliases" ON product_aliases;
CREATE POLICY "Authenticated users can read product_aliases"
  ON product_aliases FOR SELECT
  USING (auth.role() = 'authenticated');

-- ctgb_regulation_embeddings: readable by all authenticated users
ALTER TABLE ctgb_regulation_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ctgb_regulation_embeddings" ON ctgb_regulation_embeddings;
CREATE POLICY "Authenticated users can read ctgb_regulation_embeddings"
  ON ctgb_regulation_embeddings FOR SELECT
  USING (auth.role() = 'authenticated');

-- research_papers: readable by all authenticated users
ALTER TABLE research_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read research_papers" ON research_papers;
CREATE POLICY "Authenticated users can read research_papers"
  ON research_papers FOR SELECT
  USING (auth.role() = 'authenticated');

-- bloom_references: readable by all authenticated users
ALTER TABLE bloom_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read bloom_references" ON bloom_references;
CREATE POLICY "Authenticated users can read bloom_references"
  ON bloom_references FOR SELECT
  USING (auth.role() = 'authenticated');

-- kb_products: readable by all authenticated users
ALTER TABLE kb_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read kb_products" ON kb_products;
CREATE POLICY "Authenticated users can read kb_products"
  ON kb_products FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- 4. MAKE user_id NOT NULL ON CRITICAL TABLES
-- (Only safe because migration 001 already set all NULLs to admin user)
-- ============================================

-- First verify no NULLs exist
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM parcels WHERE user_id IS NULL;
  IF null_count > 0 THEN
    UPDATE parcels SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
    RAISE NOTICE 'Fixed % parcels with NULL user_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM sub_parcels WHERE user_id IS NULL;
  IF null_count > 0 THEN
    UPDATE sub_parcels SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
    RAISE NOTICE 'Fixed % sub_parcels with NULL user_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM logbook WHERE user_id IS NULL;
  IF null_count > 0 THEN
    UPDATE logbook SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
    RAISE NOTICE 'Fixed % logbook entries with NULL user_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM spuitschrift WHERE user_id IS NULL;
  IF null_count > 0 THEN
    UPDATE spuitschrift SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
    RAISE NOTICE 'Fixed % spuitschrift entries with NULL user_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM conversations WHERE user_id IS NULL;
  IF null_count > 0 THEN
    UPDATE conversations SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
    RAISE NOTICE 'Fixed % conversations with NULL user_id', null_count;
  END IF;
END $$;

-- Now make NOT NULL
ALTER TABLE parcels ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sub_parcels ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE logbook ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE spuitschrift ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE parcel_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE inventory_movements ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE task_types ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE task_logs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE active_task_sessions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE soil_samples ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE production_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_id SET NOT NULL;

-- ============================================
-- 5. ADD ON DELETE CASCADE TO user_id FOREIGN KEYS
-- (So deleting a user cascades to their data)
-- ============================================

-- Note: ALTER COLUMN doesn't support changing FK constraints in-place.
-- For now, the NOT NULL constraint is the most important fix.
-- CASCADE can be added later if needed.

-- ============================================
-- DONE
-- ============================================
