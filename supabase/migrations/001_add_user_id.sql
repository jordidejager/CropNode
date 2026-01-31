-- Migration: Add user_id to all user-owned tables and link existing data to admin
-- Admin User ID: 3ec9943a-ccfc-4a1b-b433-90dbd0ae0617

-- ============================================
-- 1. ADD user_id COLUMNS TO ALL TABLES
-- ============================================

-- Parcels
ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Sub Parcels (inherits from parcels, but adding for direct queries)
ALTER TABLE sub_parcels
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Logbook
ALTER TABLE logbook
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Spuitschrift
ALTER TABLE spuitschrift
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Parcel History
ALTER TABLE parcel_history
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Inventory Movements
ALTER TABLE inventory_movements
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- User Preferences
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Task Types
ALTER TABLE task_types
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Task Logs
ALTER TABLE task_logs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Active Task Sessions
ALTER TABLE active_task_sessions
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Field Signals (already has author_id, but adding user_id for consistency)
ALTER TABLE field_signals
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Field Signal Reactions
ALTER TABLE field_signal_reactions
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Soil Samples
ALTER TABLE soil_samples
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Production History
ALTER TABLE production_history
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Conversations
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- ============================================
-- 2. UPDATE EXISTING DATA TO ADMIN USER
-- ============================================

UPDATE parcels SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE sub_parcels SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE logbook SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE spuitschrift SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE parcel_history SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE inventory_movements SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE user_preferences SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE task_types SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE task_logs SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE active_task_sessions SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE field_signals SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE field_signal_reactions SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE soil_samples SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE production_history SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;
UPDATE conversations SET user_id = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617' WHERE user_id IS NULL;

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_parcels_user_id ON parcels(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_parcels_user_id ON sub_parcels(user_id);
CREATE INDEX IF NOT EXISTS idx_logbook_user_id ON logbook(user_id);
CREATE INDEX IF NOT EXISTS idx_spuitschrift_user_id ON spuitschrift(user_id);
CREATE INDEX IF NOT EXISTS idx_parcel_history_user_id ON parcel_history(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_user_id ON inventory_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_task_types_user_id ON task_types(user_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_user_id ON task_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_active_task_sessions_user_id ON active_task_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_field_signals_user_id ON field_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_soil_samples_user_id ON soil_samples(user_id);
CREATE INDEX IF NOT EXISTS idx_production_history_user_id ON production_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE logbook ENABLE ROW LEVEL SECURITY;
ALTER TABLE spuitschrift ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcel_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_task_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_signal_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE soil_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. CREATE RLS POLICIES
-- ============================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own parcels" ON parcels;
DROP POLICY IF EXISTS "Users can insert own parcels" ON parcels;
DROP POLICY IF EXISTS "Users can update own parcels" ON parcels;
DROP POLICY IF EXISTS "Users can delete own parcels" ON parcels;

-- Parcels policies
CREATE POLICY "Users can view own parcels" ON parcels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own parcels" ON parcels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own parcels" ON parcels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own parcels" ON parcels FOR DELETE USING (auth.uid() = user_id);

-- Sub Parcels policies
DROP POLICY IF EXISTS "Users can view own sub_parcels" ON sub_parcels;
DROP POLICY IF EXISTS "Users can insert own sub_parcels" ON sub_parcels;
DROP POLICY IF EXISTS "Users can update own sub_parcels" ON sub_parcels;
DROP POLICY IF EXISTS "Users can delete own sub_parcels" ON sub_parcels;

CREATE POLICY "Users can view own sub_parcels" ON sub_parcels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sub_parcels" ON sub_parcels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sub_parcels" ON sub_parcels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sub_parcels" ON sub_parcels FOR DELETE USING (auth.uid() = user_id);

-- Logbook policies
DROP POLICY IF EXISTS "Users can view own logbook" ON logbook;
DROP POLICY IF EXISTS "Users can insert own logbook" ON logbook;
DROP POLICY IF EXISTS "Users can update own logbook" ON logbook;
DROP POLICY IF EXISTS "Users can delete own logbook" ON logbook;

CREATE POLICY "Users can view own logbook" ON logbook FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logbook" ON logbook FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own logbook" ON logbook FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own logbook" ON logbook FOR DELETE USING (auth.uid() = user_id);

-- Spuitschrift policies
DROP POLICY IF EXISTS "Users can view own spuitschrift" ON spuitschrift;
DROP POLICY IF EXISTS "Users can insert own spuitschrift" ON spuitschrift;
DROP POLICY IF EXISTS "Users can update own spuitschrift" ON spuitschrift;
DROP POLICY IF EXISTS "Users can delete own spuitschrift" ON spuitschrift;

CREATE POLICY "Users can view own spuitschrift" ON spuitschrift FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own spuitschrift" ON spuitschrift FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own spuitschrift" ON spuitschrift FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own spuitschrift" ON spuitschrift FOR DELETE USING (auth.uid() = user_id);

-- Parcel History policies
DROP POLICY IF EXISTS "Users can view own parcel_history" ON parcel_history;
DROP POLICY IF EXISTS "Users can insert own parcel_history" ON parcel_history;
DROP POLICY IF EXISTS "Users can update own parcel_history" ON parcel_history;
DROP POLICY IF EXISTS "Users can delete own parcel_history" ON parcel_history;

CREATE POLICY "Users can view own parcel_history" ON parcel_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own parcel_history" ON parcel_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own parcel_history" ON parcel_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own parcel_history" ON parcel_history FOR DELETE USING (auth.uid() = user_id);

-- Inventory Movements policies
DROP POLICY IF EXISTS "Users can view own inventory_movements" ON inventory_movements;
DROP POLICY IF EXISTS "Users can insert own inventory_movements" ON inventory_movements;
DROP POLICY IF EXISTS "Users can update own inventory_movements" ON inventory_movements;
DROP POLICY IF EXISTS "Users can delete own inventory_movements" ON inventory_movements;

CREATE POLICY "Users can view own inventory_movements" ON inventory_movements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inventory_movements" ON inventory_movements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inventory_movements" ON inventory_movements FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inventory_movements" ON inventory_movements FOR DELETE USING (auth.uid() = user_id);

-- User Preferences policies
DROP POLICY IF EXISTS "Users can view own user_preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own user_preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own user_preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete own user_preferences" ON user_preferences;

CREATE POLICY "Users can view own user_preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own user_preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own user_preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own user_preferences" ON user_preferences FOR DELETE USING (auth.uid() = user_id);

-- Task Types policies
DROP POLICY IF EXISTS "Users can view own task_types" ON task_types;
DROP POLICY IF EXISTS "Users can insert own task_types" ON task_types;
DROP POLICY IF EXISTS "Users can update own task_types" ON task_types;
DROP POLICY IF EXISTS "Users can delete own task_types" ON task_types;

CREATE POLICY "Users can view own task_types" ON task_types FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own task_types" ON task_types FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own task_types" ON task_types FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own task_types" ON task_types FOR DELETE USING (auth.uid() = user_id);

-- Task Logs policies
DROP POLICY IF EXISTS "Users can view own task_logs" ON task_logs;
DROP POLICY IF EXISTS "Users can insert own task_logs" ON task_logs;
DROP POLICY IF EXISTS "Users can update own task_logs" ON task_logs;
DROP POLICY IF EXISTS "Users can delete own task_logs" ON task_logs;

CREATE POLICY "Users can view own task_logs" ON task_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own task_logs" ON task_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own task_logs" ON task_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own task_logs" ON task_logs FOR DELETE USING (auth.uid() = user_id);

-- Active Task Sessions policies
DROP POLICY IF EXISTS "Users can view own active_task_sessions" ON active_task_sessions;
DROP POLICY IF EXISTS "Users can insert own active_task_sessions" ON active_task_sessions;
DROP POLICY IF EXISTS "Users can update own active_task_sessions" ON active_task_sessions;
DROP POLICY IF EXISTS "Users can delete own active_task_sessions" ON active_task_sessions;

CREATE POLICY "Users can view own active_task_sessions" ON active_task_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own active_task_sessions" ON active_task_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own active_task_sessions" ON active_task_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own active_task_sessions" ON active_task_sessions FOR DELETE USING (auth.uid() = user_id);

-- Field Signals policies
DROP POLICY IF EXISTS "Users can view own field_signals" ON field_signals;
DROP POLICY IF EXISTS "Users can insert own field_signals" ON field_signals;
DROP POLICY IF EXISTS "Users can update own field_signals" ON field_signals;
DROP POLICY IF EXISTS "Users can delete own field_signals" ON field_signals;

CREATE POLICY "Users can view own field_signals" ON field_signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own field_signals" ON field_signals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own field_signals" ON field_signals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own field_signals" ON field_signals FOR DELETE USING (auth.uid() = user_id);

-- Field Signal Reactions policies
DROP POLICY IF EXISTS "Users can view own field_signal_reactions" ON field_signal_reactions;
DROP POLICY IF EXISTS "Users can insert own field_signal_reactions" ON field_signal_reactions;
DROP POLICY IF EXISTS "Users can update own field_signal_reactions" ON field_signal_reactions;
DROP POLICY IF EXISTS "Users can delete own field_signal_reactions" ON field_signal_reactions;

CREATE POLICY "Users can view own field_signal_reactions" ON field_signal_reactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own field_signal_reactions" ON field_signal_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own field_signal_reactions" ON field_signal_reactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own field_signal_reactions" ON field_signal_reactions FOR DELETE USING (auth.uid() = user_id);

-- Soil Samples policies
DROP POLICY IF EXISTS "Users can view own soil_samples" ON soil_samples;
DROP POLICY IF EXISTS "Users can insert own soil_samples" ON soil_samples;
DROP POLICY IF EXISTS "Users can update own soil_samples" ON soil_samples;
DROP POLICY IF EXISTS "Users can delete own soil_samples" ON soil_samples;

CREATE POLICY "Users can view own soil_samples" ON soil_samples FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own soil_samples" ON soil_samples FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own soil_samples" ON soil_samples FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own soil_samples" ON soil_samples FOR DELETE USING (auth.uid() = user_id);

-- Production History policies
DROP POLICY IF EXISTS "Users can view own production_history" ON production_history;
DROP POLICY IF EXISTS "Users can insert own production_history" ON production_history;
DROP POLICY IF EXISTS "Users can update own production_history" ON production_history;
DROP POLICY IF EXISTS "Users can delete own production_history" ON production_history;

CREATE POLICY "Users can view own production_history" ON production_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own production_history" ON production_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own production_history" ON production_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own production_history" ON production_history FOR DELETE USING (auth.uid() = user_id);

-- Conversations policies
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;

CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON conversations FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 6. UPDATE VIEWS TO INCLUDE user_id FILTER
-- ============================================

-- Recreate v_sprayable_parcels view if needed (views don't need RLS, they inherit from base tables)
-- The view will automatically filter based on the user's access to the underlying tables
