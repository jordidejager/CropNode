-- 082_dedupe_disease_profile_products.sql
--
-- Dedup key_preventive_products en key_curative_products arrays in
-- knowledge_disease_profile — sommige profielen hadden tot 5× dezelfde
-- naam (bv. 'movento', 'Movento', 'movento sc', 'MOVENTO OD' — afhankelijk
-- van wat de extract-prompt teruggaf).
--
-- We dedupliceren case-INSENSITIEF en behouden de eerste voorkomende
-- variant (vaak met capitalize) als 'canonieke' weergave.
--
-- Idempotent — re-runnen verandert al-gecleande arrays niet.

CREATE OR REPLACE FUNCTION dedup_case_insensitive(arr TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  seen TEXT[] := ARRAY[]::TEXT[];
  result TEXT[] := ARRAY[]::TEXT[];
  v TEXT;
  k TEXT;
BEGIN
  IF arr IS NULL THEN RETURN ARRAY[]::TEXT[]; END IF;
  FOREACH v IN ARRAY arr LOOP
    IF v IS NULL OR length(trim(v)) = 0 THEN CONTINUE; END IF;
    k := lower(trim(v));
    IF NOT (k = ANY(seen)) THEN
      seen := array_append(seen, k);
      result := array_append(result, v);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- Dedup zowel preventieve als curatieve product-arrays
UPDATE knowledge_disease_profile
SET
  key_preventive_products = dedup_case_insensitive(key_preventive_products),
  key_curative_products   = dedup_case_insensitive(key_curative_products),
  susceptible_varieties   = dedup_case_insensitive(susceptible_varieties),
  resistant_varieties     = dedup_case_insensitive(resistant_varieties),
  aliases                 = dedup_case_insensitive(aliases)
WHERE
  cardinality(key_preventive_products) > 0
  OR cardinality(key_curative_products) > 0
  OR cardinality(susceptible_varieties) > 0
  OR cardinality(resistant_varieties) > 0
  OR cardinality(aliases) > 0;

-- Diagnostiek (alleen leesbaar in editor — geen impact)
DO $$
DECLARE
  total INT;
BEGIN
  SELECT count(*) INTO total FROM knowledge_disease_profile;
  RAISE NOTICE 'Dedup voltooid op % profielen', total;
END $$;
