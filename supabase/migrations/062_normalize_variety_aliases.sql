-- Migration: Normalize variety aliases in bestaande data
-- Fengapi is het ras, Tessa is de merknaam. Behandel ze als één variant "Tessa/Fengapi".
-- Alleen `batches` en `harvest_registrations` normaliseren. `sub_parcels.variety` laten
-- we staan zoals de gebruiker die heeft ingevoerd (handmatig beheerd per perceelprofiel).

UPDATE batches
SET variety = 'Tessa/Fengapi'
WHERE LOWER(TRIM(variety)) IN ('fengapi', 'tessa', 'fengapi/tessa');

UPDATE harvest_registrations
SET variety = 'Tessa/Fengapi'
WHERE LOWER(TRIM(variety)) IN ('fengapi', 'tessa', 'fengapi/tessa');

-- Handig voor de gebruiker om te zien wat er gewijzigd is:
-- SELECT DISTINCT variety FROM batches ORDER BY variety;
-- SELECT DISTINCT variety FROM harvest_registrations ORDER BY variety;
