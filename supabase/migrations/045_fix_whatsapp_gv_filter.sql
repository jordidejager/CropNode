-- ============================================
-- 045: Fix WhatsApp bot filter — exclude boomkwekerij GVs
-- The fn_get_product_for_crop function uses LIKE '%appel%' which matches
-- long boomkwekerij crop lists. Fix with word-boundary regex + crop count check.
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
  v_is_hardfruit BOOLEAN := v_gewas_lower IN ('appel', 'peer', 'appels', 'peren', 'pitvruchten', 'pitfruit', 'hardfruit');
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
      -- Skip overly broad GV entries (8+ crops = boomkwekerij lists)
      -- Only accept them if the gewas STARTS with a hardfruit term
      AND (
        array_length(string_to_array(gv->>'gewas', ','), 1) <= 8
        OR (v_is_hardfruit AND (
          lower(gv->>'gewas') ~ '^\s*(appel|peer|pitvruchten|pitvrucht|vruchtbomen)\b'
        ))
      )
      -- Word-boundary match for the gewas term
      AND (
        -- Exact hardfruit match via word boundary
        (v_is_hardfruit AND lower(gv->>'gewas') ~ ('(^|[\s,;/()]+)(appel|peer|peren|appels|pitvruchten|pitvrucht|pitfruit|vruchtbomen)([\s,;/()]+|$)'))
        -- Or direct word-boundary match on the searched crop
        OR lower(gv->>'gewas') ~ ('(^|[\s,;/()]+)' || v_gewas_lower || '([\s,;/()]+|$)')
      );

  ELSIF v_product.source = 'fertilizer' THEN
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
