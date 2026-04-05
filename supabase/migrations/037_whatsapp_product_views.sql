-- ============================================
-- 037: WhatsApp Bot Product Views & Functions
-- Gestructureerde queries voor de CropNode Assistent
-- ============================================

-- ============================================
-- 1. Product Card View — complete productkaart
-- Gebruikt door WhatsApp bot als AI-context
-- ============================================

CREATE OR REPLACE VIEW v_product_card AS

-- CTGB Products
SELECT
  p.id as product_id,
  p.name,
  p.product_type,
  p.source,
  p.status as product_status,
  jsonb_build_object(
    'type', 'gewasbescherming',
    'wettelijk_bindend', true,
    'toelatingsnummer', cp.toelatingsnummer,
    'toelatingshouder', cp.toelatingshouder,
    'status', cp.status,
    'vervaldatum', cp.vervaldatum,
    'product_types', cp.product_types,
    'formuleringstype', cp.samenstelling->>'formuleringstype',
    'werkzame_stoffen', (
      SELECT jsonb_agg(jsonb_build_object(
        'naam', s->>'naam',
        'concentratie', s->>'concentratie',
        'frac_irac', COALESCE(asub.resistance_group, 'onbekend')
      ))
      FROM jsonb_array_elements(cp.samenstelling->'stoffen') s
      LEFT JOIN active_substances asub ON lower(asub.name) = lower(s->>'naam')
    ),
    'aantal_gebruiksvoorschriften', jsonb_array_length(COALESCE(cp.gebruiksvoorschriften, '[]'::jsonb)),
    'etikettering', jsonb_build_object(
      'signaalwoord', cp.etikettering->>'signaalwoord',
      'ghs_symbolen', cp.etikettering->'ghsSymbolen'
    )
  ) as details
FROM products p
JOIN ctgb_products cp ON p.source_id = cp.toelatingsnummer AND p.source = 'ctgb'

UNION ALL

-- Meststoffen
SELECT
  p.id as product_id,
  p.name,
  p.product_type,
  p.source,
  p.status as product_status,
  jsonb_build_object(
    'type', 'meststof',
    'wettelijk_bindend', false,
    'manufacturer', f.manufacturer,
    'category', f.category,
    'unit', f.unit,
    'composition', f.composition,
    'formulation', f.formulation,
    'density', f.density,
    'dosage_fruit', f.dosage_fruit,
    'application_timing', f.application_timing,
    'description', f.description
  ) as details
FROM products p
JOIN fertilizers f ON p.source_id = f.id AND p.source = 'fertilizer';

-- ============================================
-- 2. fn_search_products — Unified product search
-- Fuzzy zoek over alle producten met optioneel type filter
-- ============================================

CREATE OR REPLACE FUNCTION fn_search_products(
  search_query TEXT,
  filter_source TEXT DEFAULT NULL,  -- 'ctgb', 'fertilizer', of NULL voor beide
  max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
  product_id UUID,
  name TEXT,
  product_type TEXT,
  source TEXT,
  status TEXT,
  match_type TEXT,    -- 'exact', 'alias', 'fuzzy', 'keyword'
  match_score NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    -- 1. Exact name match
    SELECT p.id, p.name, p.product_type, p.source, p.status,
      'exact'::TEXT AS match_type, 1.0::NUMERIC AS match_score
    FROM products p
    WHERE lower(p.name) = lower(search_query)
      AND (filter_source IS NULL OR p.source = filter_source)
      AND p.status = 'active'

    UNION ALL

    -- 2. Alias match
    SELECT p.id, p.name, p.product_type, p.source, p.status,
      'alias'::TEXT, pau.confidence
    FROM product_aliases_unified pau
    JOIN products p ON p.id = pau.product_id
    WHERE lower(pau.alias) = lower(search_query)
      AND (filter_source IS NULL OR p.source = filter_source)
      AND p.status = 'active'

    UNION ALL

    -- 3. ILIKE partial match
    SELECT p.id, p.name, p.product_type, p.source, p.status,
      'partial'::TEXT, 0.6::NUMERIC
    FROM products p
    WHERE p.name ILIKE '%' || search_query || '%'
      AND lower(p.name) != lower(search_query)
      AND (filter_source IS NULL OR p.source = filter_source)
      AND p.status = 'active'

    UNION ALL

    -- 4. Keyword match
    SELECT p.id, p.name, p.product_type, p.source, p.status,
      'keyword'::TEXT, 0.7::NUMERIC
    FROM products p
    WHERE p.search_keywords IS NOT NULL
      AND lower(search_query) = ANY(
        SELECT lower(unnest(p.search_keywords))
      )
      AND (filter_source IS NULL OR p.source = filter_source)
      AND p.status = 'active'
  ) results
  ORDER BY results.match_score DESC
  LIMIT max_results;
END;
$$;

-- ============================================
-- 3. fn_get_product_for_crop — Gebruiksvoorschrift per gewas
-- Beantwoordt: "Wat is de dosering van X op Y?"
-- ============================================

CREATE OR REPLACE FUNCTION fn_get_product_for_crop(
  p_product_name TEXT,
  p_gewas TEXT
)
RETURNS TABLE (
  product_name TEXT,
  toelatingsnummer TEXT,
  product_type TEXT,
  source TEXT,
  wettelijk_bindend BOOLEAN,
  gewas TEXT,
  doelorganisme TEXT,
  dosering TEXT,
  max_toepassingen INTEGER,
  veiligheidstermijn TEXT,
  min_interval TEXT,
  toepassingsmethode TEXT,
  opmerkingen JSONB,
  w_codes JSONB,
  frac_irac_codes TEXT[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_product RECORD;
  v_gewas_lower TEXT := lower(p_gewas);
BEGIN
  -- Find the product (try exact, then alias, then fuzzy)
  SELECT p.id, p.name, p.source, p.source_id, p.product_type
  INTO v_product
  FROM products p
  WHERE (lower(p.name) = lower(p_product_name) OR p.id IN (
    SELECT pau.product_id FROM product_aliases_unified pau WHERE lower(pau.alias) = lower(p_product_name)
  ))
  AND p.status = 'active'
  LIMIT 1;

  IF v_product IS NULL THEN
    -- Try fuzzy match
    SELECT p.id, p.name, p.source, p.source_id, p.product_type
    INTO v_product
    FROM products p
    WHERE similarity(p.name, p_product_name) > 0.3 AND p.status = 'active'
    ORDER BY similarity(p.name, p_product_name) DESC
    LIMIT 1;
  END IF;

  IF v_product IS NULL THEN
    RETURN;
  END IF;

  IF v_product.source = 'ctgb' THEN
    -- Return CTGB gebruiksvoorschriften for this crop
    RETURN QUERY
    SELECT
      v_product.name,
      cp.toelatingsnummer,
      v_product.product_type,
      v_product.source,
      true AS wettelijk_bindend,
      gv->>'gewas',
      gv->>'doelorganisme',
      gv->>'dosering',
      (gv->>'maxToepassingen')::INTEGER,
      gv->>'veiligheidstermijn',
      gv->>'interval',
      gv->>'toepassingsmethode',
      gv->'opmerkingen',
      gv->'wCodes',
      ARRAY(
        SELECT DISTINCT asub.resistance_group
        FROM active_substances asub
        JOIN product_substances ps ON ps.substance_code = asub.code
        WHERE ps.product_id = cp.toelatingsnummer
        AND asub.resistance_group IS NOT NULL
      )
    FROM ctgb_products cp,
         jsonb_array_elements(cp.gebruiksvoorschriften) gv
    WHERE cp.toelatingsnummer = v_product.source_id
      AND (
        lower(gv->>'gewas') LIKE '%' || v_gewas_lower || '%'
        OR v_gewas_lower LIKE '%' || lower(gv->>'gewas') || '%'
        -- Crop hierarchy: appel/peer → pitvruchten → vruchtbomen
        OR (v_gewas_lower IN ('appel', 'peer', 'appels', 'peren')
            AND lower(gv->>'gewas') LIKE '%pitvruchten%')
        OR (v_gewas_lower IN ('appel', 'peer', 'appels', 'peren', 'pitvruchten')
            AND lower(gv->>'gewas') LIKE '%vruchtbomen%')
        OR (v_gewas_lower IN ('appel', 'peer', 'appels', 'peren', 'pitvruchten', 'vruchtbomen')
            AND lower(gv->>'gewas') LIKE '%fruitgewassen%')
      );

  ELSIF v_product.source = 'fertilizer' THEN
    -- Return fertilizer info (advies, niet wettelijk)
    RETURN QUERY
    SELECT
      v_product.name,
      NULL::TEXT,
      v_product.product_type,
      v_product.source,
      false AS wettelijk_bindend,
      p_gewas,
      NULL::TEXT,
      f.dosage_fruit,
      NULL::INTEGER,
      NULL::TEXT,
      NULL::TEXT,
      f.application_timing,
      jsonb_build_object('description', f.description, 'formulation', f.formulation)::JSONB,
      NULL::JSONB,
      ARRAY[]::TEXT[]
    FROM fertilizers f
    WHERE f.id = v_product.source_id;
  END IF;
END;
$$;

-- ============================================
-- 4. fn_find_products_for_organism — Reverse lookup
-- Beantwoordt: "Welke fungiciden zijn toegelaten voor schurft in peer?"
-- ============================================

CREATE OR REPLACE FUNCTION fn_find_products_for_organism(
  p_doelorganisme TEXT,
  p_gewas TEXT DEFAULT NULL,
  p_product_type TEXT DEFAULT NULL  -- 'fungicide', 'insecticide', etc.
)
RETURNS TABLE (
  product_name TEXT,
  toelatingsnummer TEXT,
  product_type TEXT,
  werkzame_stoffen TEXT[],
  frac_irac TEXT,
  dosering TEXT,
  max_toepassingen INTEGER,
  veiligheidstermijn TEXT,
  gewas TEXT,
  doelorganisme TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_doel_lower TEXT := lower(p_doelorganisme);
  v_gewas_lower TEXT := lower(COALESCE(p_gewas, ''));
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (cp.naam)
    cp.naam,
    cp.toelatingsnummer,
    p.product_type,
    cp.werkzame_stoffen,
    (SELECT string_agg(DISTINCT asub.resistance_group, ', ')
     FROM product_substances ps
     JOIN active_substances asub ON ps.substance_code = asub.code
     WHERE ps.product_id = cp.toelatingsnummer AND asub.resistance_group IS NOT NULL
    ),
    gv->>'dosering',
    (gv->>'maxToepassingen')::INTEGER,
    gv->>'veiligheidstermijn',
    gv->>'gewas',
    gv->>'doelorganisme'
  FROM ctgb_products cp
  JOIN products p ON p.source = 'ctgb' AND p.source_id = cp.toelatingsnummer,
       jsonb_array_elements(cp.gebruiksvoorschriften) gv
  WHERE cp.status = 'Valid'
    AND p.status = 'active'
    -- Match doelorganisme
    AND lower(gv->>'doelorganisme') LIKE '%' || v_doel_lower || '%'
    -- Optional gewas filter
    AND (p_gewas IS NULL OR (
      lower(gv->>'gewas') LIKE '%' || v_gewas_lower || '%'
      OR v_gewas_lower LIKE '%' || lower(gv->>'gewas') || '%'
      OR (v_gewas_lower IN ('appel', 'peer', 'appels', 'peren') AND lower(gv->>'gewas') LIKE '%pitvruchten%')
      OR (v_gewas_lower IN ('appel', 'peer', 'appels', 'peren', 'pitvruchten') AND lower(gv->>'gewas') LIKE '%vruchtbomen%')
    ))
    -- Optional product type filter
    AND (p_product_type IS NULL OR p.product_type = p_product_type)
  ORDER BY cp.naam;
END;
$$;

-- ============================================
-- 5. fn_check_product_status — Toelatingscheck
-- Beantwoordt: "Is middel X nog toegelaten?"
-- ============================================

CREATE OR REPLACE FUNCTION fn_check_product_status(p_product_name TEXT)
RETURNS TABLE (
  product_name TEXT,
  toelatingsnummer TEXT,
  status TEXT,
  vervaldatum TEXT,
  toelatingshouder TEXT,
  product_types TEXT[],
  werkzame_stoffen TEXT[],
  is_toegelaten BOOLEAN,
  dagen_tot_vervaldatum INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.naam,
    cp.toelatingsnummer,
    cp.status,
    cp.vervaldatum,
    cp.toelatingshouder,
    cp.product_types,
    cp.werkzame_stoffen,
    (cp.status = 'Valid' AND (cp.vervaldatum IS NULL OR cp.vervaldatum::timestamp > NOW())) AS is_toegelaten,
    CASE WHEN cp.vervaldatum IS NOT NULL
      THEN EXTRACT(DAY FROM cp.vervaldatum::timestamp - NOW())::INTEGER
      ELSE NULL
    END AS dagen_tot_vervaldatum
  FROM ctgb_products cp
  JOIN products p ON p.source = 'ctgb' AND p.source_id = cp.toelatingsnummer
  WHERE lower(cp.naam) = lower(p_product_name)
     OR p.id IN (SELECT pau.product_id FROM product_aliases_unified pau WHERE lower(pau.alias) = lower(p_product_name))
     OR similarity(cp.naam, p_product_name) > 0.4
  ORDER BY similarity(cp.naam, p_product_name) DESC
  LIMIT 3;
END;
$$;
