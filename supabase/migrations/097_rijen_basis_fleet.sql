-- 097: rijen als basis voor Jager Fleet (Fleet leest, schrijft nooit).
--  * rijen worden nooit meer echt weggegooid: status 'verwijderd' (naast 'actief' en 'gerooid'); het rij-id blijft
--  * per rij gewas en onderstam (naast ras/plantjaar/rol); blokken.gewas
--  * rijen.gewijzigd_op: verandert alleen bij een andere lijn, nummer, status of perceel (niet bij ras/opmerking)
--  * v_rijen: + gewas, gewas_effectief, onderstam_effectief, onderstam_eigen, is_bestuiver, gewijzigd_op (bestaande kolommen ongewijzigd)
--  * v_rijen_per_perceel: + rijen_gewijzigd_op, aantal_verwijderd; v_blokken: + gewas, rij_van, rij_tot
--  * rijen_geojson: verwijderde rijen nooit in de export
-- Idempotent; alleen toevoegingen aan bestaande tabellen.

ALTER TABLE public.rijen DROP CONSTRAINT IF EXISTS rijen_status_check;
ALTER TABLE public.rijen ADD CONSTRAINT rijen_status_check CHECK (status IN ('actief', 'gerooid', 'verwijderd'));

ALTER TABLE public.rijen ADD COLUMN IF NOT EXISTS gewas TEXT;
ALTER TABLE public.rijen ADD COLUMN IF NOT EXISTS onderstam TEXT;
ALTER TABLE public.rijen ADD COLUMN IF NOT EXISTS gewijzigd_op TIMESTAMPTZ;
UPDATE public.rijen SET gewijzigd_op = COALESCE(updated_at, created_at, now()) WHERE gewijzigd_op IS NULL;
ALTER TABLE public.rijen ALTER COLUMN gewijzigd_op SET DEFAULT now();
ALTER TABLE public.rijen ALTER COLUMN gewijzigd_op SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rijen_perceel_gewijzigd ON public.rijen (perceel_id, gewijzigd_op DESC);

ALTER TABLE public.blokken ADD COLUMN IF NOT EXISTS gewas TEXT;

CREATE OR REPLACE FUNCTION public.rijen_zet_gewijzigd_op()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.gewijzigd_op := now();
  ELSIF NEW.geom IS DISTINCT FROM OLD.geom
     OR NEW.nummer IS DISTINCT FROM OLD.nummer
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.perceel_id IS DISTINCT FROM OLD.perceel_id THEN
    NEW.gewijzigd_op := now();
  ELSE
    NEW.gewijzigd_op := OLD.gewijzigd_op;  -- niet door een client te zetten
  END IF;
  RETURN NEW;
END;
$fn$;

-- 'zz': na de normalisatie van de beginkant (triggers lopen op naam)
DROP TRIGGER IF EXISTS trg_rijen_zz_gewijzigd_op ON public.rijen;
CREATE TRIGGER trg_rijen_zz_gewijzigd_op BEFORE INSERT OR UPDATE ON public.rijen
  FOR EACH ROW EXECUTE FUNCTION public.rijen_zet_gewijzigd_op();

-- Echt weggooien kan niet meer via de API (verwijderen = status 'verwijderd'); een perceel weggooien neemt de rijen
-- wel mee (ON DELETE CASCADE).
DROP POLICY IF EXISTS "Users can delete own rijen" ON public.rijen;
REVOKE DELETE ON public.rijen FROM authenticated, anon;

CREATE OR REPLACE VIEW public.v_rijen WITH (security_invoker = on) AS
 SELECT r.id,
    r.user_id,
    r.perceel_id,
    r.blok_id,
    b.naam AS blok_naam,
    r.nummer,
    r.label,
    r.rol,
    r.ras,
    COALESCE(r.ras, b.ras) AS ras_effectief,
    r.plantjaar,
    COALESCE(r.plantjaar, b.plantjaar) AS plantjaar_effectief,
    b.onderstam,
    COALESCE(b.rijafstand_m, i.rijafstand_m) AS rijafstand_m,
    COALESCE(b.boomafstand_m, i.boomafstand_m) AS boomafstand_m,
    r.lengte_m,
    r.aantal_bomen,
    COALESCE(r.aantal_bomen,
        CASE
            WHEN COALESCE(b.boomafstand_m, i.boomafstand_m) > 0::numeric THEN floor(r.lengte_m / COALESCE(b.boomafstand_m, i.boomafstand_m))::integer + 1
            ELSE NULL::integer
        END) AS aantal_bomen_effectief,
    r.geom_bron,
    r.nauwkeurigheid_m,
    r.controleren,
    r.status,
    r.geplant_op,
    r.gerooid_op,
    r.opmerking,
    st_asgeojson(r.geom, 7)::jsonb AS geometrie,
    COALESCE(b.sub_parcel_id, sp.id) AS sub_parcel_id,
    r.created_at,
    r.updated_at,
    r.gewas,
    COALESCE(r.gewas, b.gewas, spc.crop, pa.crop) AS gewas_effectief,
    COALESCE(r.onderstam, b.onderstam) AS onderstam_effectief,
    r.onderstam AS onderstam_eigen,
    r.rol = 'bestuiver'::text AS is_bestuiver,
    r.gewijzigd_op
   FROM rijen r
     LEFT JOIN blokken b ON b.id = r.blok_id
     LEFT JOIN perceel_rijinstellingen i ON i.perceel_id = r.perceel_id
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN count(*) = 1 THEN min(s.id)
                    WHEN count(*) FILTER (WHERE lower(s.variety) = lower(COALESCE(b.ras, r.ras))) = 1 THEN min(s.id) FILTER (WHERE lower(s.variety) = lower(COALESCE(b.ras, r.ras)))
                    ELSE NULL::text
                END AS id
           FROM sub_parcels s
          WHERE s.parcel_id = r.perceel_id) sp ON true
     LEFT JOIN sub_parcels spc ON spc.id = COALESCE(b.sub_parcel_id, sp.id)
     LEFT JOIN parcels pa ON pa.id = r.perceel_id;
GRANT SELECT ON public.v_rijen TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_rijen_per_perceel WITH (security_invoker = on) AS
 SELECT perceel_id,
    user_id,
    count(*) FILTER (WHERE status = 'actief'::text) AS aantal_actief,
    count(*) FILTER (WHERE status = 'gerooid'::text) AS aantal_gerooid,
    count(*) FILTER (WHERE status = 'actief'::text AND rol = 'bestuiver'::text) AS aantal_bestuivers,
    count(*) FILTER (WHERE status = 'actief'::text AND controleren) AS aantal_controleren,
    min(nummer) FILTER (WHERE status = 'actief'::text) AS min_nummer,
    max(nummer) FILTER (WHERE status = 'actief'::text) AS max_nummer,
    round(COALESCE(sum(lengte_m) FILTER (WHERE status = 'actief'::text), 0::numeric), 1) AS totale_lengte_m,
    round(COALESCE(sum(lengte_m * rijafstand_m) FILTER (WHERE status = 'actief'::text), 0::numeric) / 10000.0, 4) AS rij_oppervlak_ha,
    count(DISTINCT blok_id) FILTER (WHERE status = 'actief'::text) AS aantal_blokken,
    max(gewijzigd_op) AS rijen_gewijzigd_op,
    count(*) FILTER (WHERE status = 'verwijderd'::text) AS aantal_verwijderd
   FROM v_rijen r
  GROUP BY perceel_id, user_id;
GRANT SELECT ON public.v_rijen_per_perceel TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_blokken WITH (security_invoker = on) AS
 SELECT id,
    user_id,
    perceel_id,
    sub_parcel_id,
    naam,
    ras,
    plantjaar,
    onderstam,
    rijafstand_m,
    boomafstand_m,
    teeltsysteem,
    opmerking,
        CASE
            WHEN geom IS NULL THEN NULL::jsonb
            ELSE st_asgeojson(geom, 7)::jsonb
        END AS geometrie,
    (( SELECT count(*) AS count
           FROM rijen r
          WHERE r.blok_id = b.id AND r.status = 'actief'::text))::integer AS aantal_rijen,
    ( SELECT min(r.nummer) AS min
           FROM rijen r
          WHERE r.blok_id = b.id AND r.status = 'actief'::text) AS min_nummer,
    ( SELECT max(r.nummer) AS max
           FROM rijen r
          WHERE r.blok_id = b.id AND r.status = 'actief'::text) AS max_nummer,
    created_at,
    updated_at,
    gewas,
    ( SELECT min(r.nummer) AS min
           FROM rijen r
          WHERE r.blok_id = b.id AND r.status = 'actief'::text) AS rij_van,
    ( SELECT max(r.nummer) AS max
           FROM rijen r
          WHERE r.blok_id = b.id AND r.status = 'actief'::text) AS rij_tot
   FROM blokken b;
GRANT SELECT ON public.v_blokken TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rijen_toepassen(p_user_id uuid, p_perceel_id text, p_rijen jsonb DEFAULT '[]'::jsonb, p_verwijderen uuid[] DEFAULT '{}'::uuid[], p_instellingen jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
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

    -- 097: nooit echt weggooien — status 'verwijderd' (Fleet hangt routes aan het rij-id)
    UPDATE public.rijen r SET status = 'verwijderd'
    WHERE r.id = ANY(p_verwijderen)
      AND r.perceel_id = p_perceel_id AND r.user_id = p_user_id
      AND r.status = 'actief'
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
$function$;

CREATE OR REPLACE FUNCTION public.rijen_geojson(p_perceel_id text, p_incl_gerooid boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'name', 'rijen',
    'perceel_id', p_perceel_id,
    'crs_opmerking', 'WGS84 (EPSG:4326); lengtes in meters berekend in RD New (EPSG:28992)',
    'features', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'id', v.id,
          'geometry', v.geometrie,
          'properties', jsonb_build_object(
            'id', v.id,
            'perceel_id', v.perceel_id,
            'nummer', v.nummer,
            'label', v.label,
            'ras', v.ras_effectief,
            'plantjaar', v.plantjaar_effectief,
            'onderstam', v.onderstam,
            'blok_id', v.blok_id,
            'blok', v.blok_naam,
            'rol', v.rol,
            'status', v.status,
            'lengte_m', v.lengte_m,
            'rijafstand_m', v.rijafstand_m,
            'boomafstand_m', v.boomafstand_m,
            'aantal_bomen', v.aantal_bomen_effectief,
            'geom_bron', v.geom_bron,
            'nauwkeurigheid_m', v.nauwkeurigheid_m,
            'controleren', v.controleren,
            'geplant_op', v.geplant_op,
            'gerooid_op', v.gerooid_op,
            'sub_parcel_id', v.sub_parcel_id
          )
        )
        ORDER BY v.status, v.nummer
      ),
      '[]'::jsonb
    )
  )
  FROM public.v_rijen v
  WHERE v.perceel_id = p_perceel_id
    AND (v.status = 'actief' OR (p_incl_gerooid AND v.status = 'gerooid'))
    AND (auth.uid() IS NULL OR v.user_id = auth.uid());
$function$;
