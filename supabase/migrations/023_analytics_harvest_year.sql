-- Migration: Add harvest_year column to spuitschrift, parcel_history, logbook, and harvest_registrations
-- The harvest_year is the core concept for analytics: it groups all costs and revenues
-- belonging to a single harvest cycle, which spans across calendar years.

-- 1. Add harvest_year to spuitschrift (confirmed spray/fertilizer registrations)
ALTER TABLE spuitschrift ADD COLUMN IF NOT EXISTS harvest_year INTEGER;

-- Backfill: default = year of the registration date
-- Nov-Dec registrations → next year (preparation for next harvest)
UPDATE spuitschrift
SET harvest_year = CASE
  WHEN EXTRACT(MONTH FROM date) >= 11 THEN EXTRACT(YEAR FROM date)::INTEGER + 1
  ELSE EXTRACT(YEAR FROM date)::INTEGER
END
WHERE harvest_year IS NULL;

ALTER TABLE spuitschrift ALTER COLUMN harvest_year SET NOT NULL;

-- 2. Add harvest_year to parcel_history
ALTER TABLE parcel_history ADD COLUMN IF NOT EXISTS harvest_year INTEGER;

UPDATE parcel_history
SET harvest_year = CASE
  WHEN EXTRACT(MONTH FROM date) >= 11 THEN EXTRACT(YEAR FROM date)::INTEGER + 1
  ELSE EXTRACT(YEAR FROM date)::INTEGER
END
WHERE harvest_year IS NULL;

ALTER TABLE parcel_history ALTER COLUMN harvest_year SET NOT NULL;

-- 3. Add harvest_year to logbook (drafts)
ALTER TABLE logbook ADD COLUMN IF NOT EXISTS harvest_year INTEGER;

UPDATE logbook
SET harvest_year = CASE
  WHEN EXTRACT(MONTH FROM date) >= 11 THEN EXTRACT(YEAR FROM date)::INTEGER + 1
  ELSE EXTRACT(YEAR FROM date)::INTEGER
END
WHERE harvest_year IS NULL;

-- logbook can have NULL harvest_year (drafts may not have a date yet)

-- 4. Add harvest_year to harvest_registrations
-- Check if season field already serves this purpose
ALTER TABLE harvest_registrations ADD COLUMN IF NOT EXISTS harvest_year INTEGER;

UPDATE harvest_registrations
SET harvest_year = CASE
  WHEN EXTRACT(MONTH FROM harvest_date) >= 11 THEN EXTRACT(YEAR FROM harvest_date)::INTEGER + 1
  ELSE EXTRACT(YEAR FROM harvest_date)::INTEGER
END
WHERE harvest_year IS NULL;

ALTER TABLE harvest_registrations ALTER COLUMN harvest_year SET NOT NULL;

-- 5. Add unit_price to parcel_history for cost tracking
-- This is per-product-per-application: price per L or per kg
ALTER TABLE parcel_history ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2);

-- 6. Create indexes for harvest_year queries
CREATE INDEX IF NOT EXISTS idx_spuitschrift_harvest_year ON spuitschrift(harvest_year);
CREATE INDEX IF NOT EXISTS idx_parcel_history_harvest_year ON parcel_history(harvest_year);
CREATE INDEX IF NOT EXISTS idx_harvest_registrations_harvest_year ON harvest_registrations(harvest_year);

-- 7. Analytics view: costs per parcel per harvest year
CREATE OR REPLACE VIEW v_analytics_costs_per_parcel AS
SELECT
  ph.harvest_year,
  ph.user_id,
  ph.parcel_id,
  ph.parcel_name,
  COUNT(DISTINCT ph.spuitschrift_id) as treatment_count,
  COUNT(*) as product_application_count,
  SUM(CASE WHEN ph.unit_price IS NOT NULL THEN ph.dosage * ph.unit_price ELSE 0 END) as total_cost
FROM parcel_history ph
GROUP BY ph.harvest_year, ph.user_id, ph.parcel_id, ph.parcel_name;

-- 8. Analytics view: harvest totals per parcel per harvest year
CREATE OR REPLACE VIEW v_analytics_harvest_per_parcel AS
SELECT
  hr.harvest_year,
  hr.user_id,
  hr.parcel_id,
  hr.variety,
  COUNT(*) as pick_count,
  SUM(hr.total_crates) as total_crates,
  SUM(
    CASE WHEN hr.weight_per_crate IS NOT NULL
    THEN hr.total_crates * hr.weight_per_crate
    ELSE hr.total_crates * 18.0 -- default 18kg per crate for apples/pears
    END
  ) as total_kg,
  SUM(CASE WHEN hr.quality_class = 'Klasse I' THEN hr.total_crates ELSE 0 END) as crates_klasse_i,
  SUM(CASE WHEN hr.quality_class = 'Klasse II' THEN hr.total_crates ELSE 0 END) as crates_klasse_ii,
  SUM(CASE WHEN hr.quality_class = 'Industrie' THEN hr.total_crates ELSE 0 END) as crates_industrie
FROM harvest_registrations hr
GROUP BY hr.harvest_year, hr.user_id, hr.parcel_id, hr.variety;
