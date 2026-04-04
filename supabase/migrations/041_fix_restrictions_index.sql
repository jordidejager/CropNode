-- Fix: gewas column btree index can't handle long strings (boomkwekerij lists)
-- Replace with hash index which has no size limit
DROP INDEX IF EXISTS idx_usage_restrictions_gewas;
CREATE INDEX IF NOT EXISTS idx_usage_restrictions_gewas ON ctgb_usage_restrictions USING hash(gewas);
