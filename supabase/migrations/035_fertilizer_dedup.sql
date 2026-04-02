-- ============================================
-- 035: Fertilizer Deduplication
-- Remove 27 duplicate fertilizer names (keep the one with most data)
-- ============================================

-- Delete duplicates keeping the row with the most filled fields
DELETE FROM fertilizers
WHERE id IN (
  SELECT f.id FROM fertilizers f
  INNER JOIN (
    SELECT name, MIN(id) as keep_id
    FROM fertilizers
    GROUP BY name
    HAVING COUNT(*) > 1
  ) dupes ON f.name = dupes.name AND f.id != dupes.keep_id
);
