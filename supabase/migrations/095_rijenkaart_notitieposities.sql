-- ============================================================================
-- 095 — Rijenkaart (beta): notitieposities volgen de rijgeometrie; gerooide rijen
--        nooit verwijderen
-- ============================================================================
-- Alleen de nieuwe rijenkaart-tabellen/-functies (092). Geen bestaande tabellen of
-- kolommen gewijzigd, geen data herschreven.
--
-- 1. veldnotitie_rijen.positie_m (meters vanaf het begin van de rij) bleef staan als
--    de geometrie van een rij veranderde (eindpunt slepen, opnieuw genereren, omdraaien
--    door de beginkant-trigger). De marker en het boomnummer wezen dan een andere boom
--    aan. Nu herprojecteert een AFTER UPDATE OF geom-trigger elke notitie: het oude
--    punt op de oude lijn wordt op de nieuwe lijn gelegd (in RD, begrensd op [0, lengte]).
-- 2. rijen_zet_beginkant spiegelde positie_m zelf; dat doet nu de trigger (bij het
--    omdraaien van de lijn blijft het punt hetzelfde → positie = lengte − oud). De
--    expliciete spiegeling is eruit, anders zou er dubbel gespiegeld worden.
-- 3. rijen_toepassen: de DELETE raakt alleen nog actieve rijen; een gerooide rij die
--    (via een verouderde kaart) in p_verwijderen staat, blijft bestaan.
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Notitieposities herprojecteren bij een nieuwe rijgeometrie
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rijen_herprojecteer_notities()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_oud extensions.geometry;
  v_nieuw extensions.geometry;
  v_oud_lengte DOUBLE PRECISION;
  v_nieuw_lengte DOUBLE PRECISION;
BEGIN
  IF OLD.geom IS NULL OR NEW.geom IS NULL OR ST_OrderingEquals(OLD.geom, NEW.geom) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.veldnotitie_rijen WHERE rij_id = NEW.id AND positie_m IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  v_oud := ST_Transform(OLD.geom, 28992);
  v_nieuw := ST_Transform(NEW.geom, 28992);
  v_oud_lengte := ST_Length(v_oud);
  v_nieuw_lengte := ST_Length(v_nieuw);
  IF v_oud_lengte IS NULL OR v_oud_lengte <= 0 OR v_nieuw_lengte IS NULL OR v_nieuw_lengte <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.veldnotitie_rijen vr
  SET positie_m = round((
    ST_LineLocatePoint(
      v_nieuw,
      ST_LineInterpolatePoint(v_oud, LEAST(1.0, GREATEST(0.0, vr.positie_m::double precision / v_oud_lengte)))
    ) * v_nieuw_lengte
  )::numeric, 3)
  WHERE vr.rij_id = NEW.id
    AND vr.user_id = NEW.user_id
    AND vr.positie_m IS NOT NULL;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_rijen_herprojecteer_notities ON public.rijen;
CREATE TRIGGER trg_rijen_herprojecteer_notities AFTER UPDATE OF geom ON public.rijen
  FOR EACH ROW EXECUTE FUNCTION public.rijen_herprojecteer_notities();

-- ----------------------------------------------------------------------------
-- 2. Beginkant wijzigen: zonder eigen spiegeling (de trigger hierboven doet dat)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rijen_zet_beginkant(p_user_id UUID, p_perceel_id TEXT, p_beginkant_graden NUMERIC)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Geen toegang tot dit perceel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parcels WHERE id = p_perceel_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Perceel niet gevonden';
  END IF;

  INSERT INTO public.perceel_rijinstellingen (perceel_id, user_id)
  VALUES (p_perceel_id, p_user_id)
  ON CONFLICT (perceel_id) DO NOTHING;

  UPDATE public.perceel_rijinstellingen
  SET beginkant_graden = p_beginkant_graden
  WHERE perceel_id = p_perceel_id AND user_id = p_user_id;

  SELECT COALESCE(array_agg(id), '{}') INTO v_ids
  FROM public.rijen
  WHERE perceel_id = p_perceel_id AND user_id = p_user_id
    AND public.rij_moet_omdraaien(geom, p_beginkant_graden);

  -- Omdraaien; trg_rijen_herprojecteer_notities spiegelt de notitieposities mee
  -- (positie_m blijft dezelfde boom aanwijzen)
  UPDATE public.rijen SET geom = ST_Reverse(geom) WHERE id = ANY(v_ids);

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rijen_zet_beginkant(UUID, TEXT, NUMERIC) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. rijen_toepassen: gelijk aan 092, alleen de DELETE beperkt tot actieve rijen
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rijen_toepassen(
  p_user_id UUID,
  p_perceel_id TEXT,
  p_rijen JSONB DEFAULT '[]'::jsonb,
  p_verwijderen UUID[] DEFAULT '{}'::uuid[],
  p_instellingen JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_item JSONB;
  v_id UUID;
  v_geom extensions.geometry;
  v_ingevoegd JSONB := '[]'::jsonb;
  v_bijgewerkt INT := 0;
  v_verwijderd INT := 0;
  v_gerooid INT := 0;
  v_n INT;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Geen toegang tot dit perceel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parcels WHERE id = p_perceel_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Perceel niet gevonden';
  END IF;

  -- Instellingen eerst (beginkant bepaalt de normalisatie van nieuwe geometrie)
  IF p_instellingen IS NOT NULL THEN
    INSERT INTO public.perceel_rijinstellingen (perceel_id, user_id)
    VALUES (p_perceel_id, p_user_id)
    ON CONFLICT (perceel_id) DO NOTHING;

    UPDATE public.perceel_rijinstellingen SET
      rijrichting_graden = CASE WHEN p_instellingen ? 'rijrichting_graden' THEN (p_instellingen->>'rijrichting_graden')::numeric ELSE rijrichting_graden END,
      rijafstand_m = CASE WHEN p_instellingen ? 'rijafstand_m' THEN (p_instellingen->>'rijafstand_m')::numeric ELSE rijafstand_m END,
      boomafstand_m = CASE WHEN p_instellingen ? 'boomafstand_m' THEN (p_instellingen->>'boomafstand_m')::numeric ELSE boomafstand_m END,
      fase_m = CASE WHEN p_instellingen ? 'fase_m' THEN (p_instellingen->>'fase_m')::numeric ELSE fase_m END,
      kopakker_begin_m = CASE WHEN p_instellingen ? 'kopakker_begin_m' THEN (p_instellingen->>'kopakker_begin_m')::numeric ELSE kopakker_begin_m END,
      kopakker_eind_m = CASE WHEN p_instellingen ? 'kopakker_eind_m' THEN (p_instellingen->>'kopakker_eind_m')::numeric ELSE kopakker_eind_m END,
      beginkant_graden = CASE WHEN p_instellingen ? 'beginkant_graden' THEN (p_instellingen->>'beginkant_graden')::numeric ELSE beginkant_graden END,
      nummering_startzijde_graden = CASE WHEN p_instellingen ? 'nummering_startzijde_graden' THEN (p_instellingen->>'nummering_startzijde_graden')::numeric ELSE nummering_startzijde_graden END,
      startnummer = CASE WHEN p_instellingen ? 'startnummer' THEN COALESCE((p_instellingen->>'startnummer')::int, 1) ELSE startnummer END,
      bron_beeld = CASE WHEN p_instellingen ? 'bron_beeld' THEN p_instellingen->>'bron_beeld' ELSE bron_beeld END,
      detectie_methode = CASE WHEN p_instellingen ? 'detectie_methode' THEN p_instellingen->>'detectie_methode' ELSE detectie_methode END,
      detectie_confidence = CASE WHEN p_instellingen ? 'detectie_confidence' THEN (p_instellingen->>'detectie_confidence')::numeric ELSE detectie_confidence END,
      laatst_gegenereerd_op = CASE WHEN p_instellingen ? 'laatst_gegenereerd_op' THEN (p_instellingen->>'laatst_gegenereerd_op')::timestamptz ELSE laatst_gegenereerd_op END
    WHERE perceel_id = p_perceel_id AND user_id = p_user_id;
  END IF;

  -- Verwijderen: rijen met koppelingen blijven als 'gerooid' bewaard (historie)
  IF p_verwijderen IS NOT NULL AND array_length(p_verwijderen, 1) > 0 THEN
    UPDATE public.rijen r SET status = 'gerooid'
    WHERE r.id = ANY(p_verwijderen)
      AND r.perceel_id = p_perceel_id AND r.user_id = p_user_id
      AND r.status = 'actief'
      AND (
        EXISTS (SELECT 1 FROM public.bespuiting_rijen br WHERE br.rij_id = r.id)
        OR EXISTS (SELECT 1 FROM public.veldnotitie_rijen vr WHERE vr.rij_id = r.id)
      );
    GET DIAGNOSTICS v_gerooid = ROW_COUNT;

    DELETE FROM public.rijen r
    WHERE r.id = ANY(p_verwijderen)
      AND r.perceel_id = p_perceel_id AND r.user_id = p_user_id
      AND r.status = 'actief'   -- 095: gerooide rijen verdwijnen nooit (ook niet via een verouderde client)
      AND NOT EXISTS (SELECT 1 FROM public.bespuiting_rijen br WHERE br.rij_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM public.veldnotitie_rijen vr WHERE vr.rij_id = r.id);
    GET DIAGNOSTICS v_verwijderd = ROW_COUNT;
  END IF;

  -- Upserts
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_rijen, '[]'::jsonb)) LOOP
    v_geom := NULL;
    IF v_item ? 'coordinates' AND jsonb_typeof(v_item->'coordinates') = 'array' THEN
      v_geom := ST_SetSRID(
        ST_GeomFromGeoJSON(jsonb_build_object('type', 'LineString', 'coordinates', v_item->'coordinates')::text),
        4326
      );
    END IF;

    IF v_item ? 'id' AND NULLIF(v_item->>'id', '') IS NOT NULL THEN
      UPDATE public.rijen SET
        nummer = COALESCE((v_item->>'nummer')::int, nummer),
        geom = COALESCE(v_geom, geom),
        geom_bron = COALESCE(v_item->>'geom_bron', geom_bron),
        nauwkeurigheid_m = CASE WHEN v_item ? 'nauwkeurigheid_m' THEN (v_item->>'nauwkeurigheid_m')::numeric ELSE nauwkeurigheid_m END,
        controleren = COALESCE((v_item->>'controleren')::boolean, controleren),
        blok_id = CASE WHEN v_item ? 'blok_id' THEN NULLIF(v_item->>'blok_id', '')::uuid ELSE blok_id END,
        rol = COALESCE(v_item->>'rol', rol),
        ras = CASE WHEN v_item ? 'ras' THEN NULLIF(v_item->>'ras', '') ELSE ras END
      WHERE id = (v_item->>'id')::uuid AND perceel_id = p_perceel_id AND user_id = p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_bijgewerkt := v_bijgewerkt + v_n;
    ELSE
      IF v_geom IS NULL OR (v_item->>'nummer') IS NULL THEN
        RAISE EXCEPTION 'Nieuwe rij heeft nummer en coordinates nodig';
      END IF;
      INSERT INTO public.rijen (user_id, perceel_id, nummer, geom, geom_bron, nauwkeurigheid_m, controleren, blok_id, rol, ras)
      VALUES (
        p_user_id,
        p_perceel_id,
        (v_item->>'nummer')::int,
        v_geom,
        COALESCE(v_item->>'geom_bron', 'gegenereerd'),
        (v_item->>'nauwkeurigheid_m')::numeric,
        COALESCE((v_item->>'controleren')::boolean, false),
        NULLIF(v_item->>'blok_id', '')::uuid,
        COALESCE(v_item->>'rol', 'hoofd'),
        NULLIF(v_item->>'ras', '')
      )
      RETURNING id INTO v_id;
      v_ingevoegd := v_ingevoegd || jsonb_build_object('id', v_id, 'nummer', (v_item->>'nummer')::int, 'sleutel', v_item->'sleutel');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ingevoegd', v_ingevoegd,
    'bijgewerkt', v_bijgewerkt,
    'verwijderd', v_verwijderd,
    'gerooid', v_gerooid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rijen_toepassen(UUID, TEXT, JSONB, UUID[], JSONB) TO authenticated, service_role;
