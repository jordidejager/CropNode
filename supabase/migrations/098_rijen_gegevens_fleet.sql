-- 098: rijen voor Jager Fleet, stap 4
--  1. Richting: een nieuwe of verlegde rij wordt omgedraaid naar de beginkant van het perceel. Had het perceel
--     nog geen rijinstellingen (beginkant leeg), dan gold de rij zoals getekend; nu neemt hij de richting van
--     de bestaande actieve rijen over. Een lijn met tussenpunten wordt als geheel omgedraaid (ST_Reverse).
--  2. v_rijen: ras_effectief valt terug op het ras van het subperceel (zoals de app het al toont) en
--     gewas_effectief op het gewas van de subpercelen als die allemaal hetzelfde gewas hebben.
--     Kolomnamen en -volgorde blijven gelijk (Jager Fleet leest ze).

CREATE OR REPLACE FUNCTION public.rijen_normaliseer_richting()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_beginkant NUMERIC;
BEGIN
  SELECT beginkant_graden INTO v_beginkant
  FROM public.perceel_rijinstellingen
  WHERE perceel_id = NEW.perceel_id;

  -- Geen beginkant ingesteld: richting van de bestaande actieve rijen (laagste nummer) overnemen
  IF v_beginkant IS NULL THEN
    SELECT degrees(ST_Azimuth(
             ST_Transform(ST_LineInterpolatePoint(r.geom, 0.5), 28992),
             ST_Transform(ST_StartPoint(r.geom), 28992)))
      INTO v_beginkant
    FROM public.rijen r
    WHERE r.perceel_id = NEW.perceel_id
      AND r.id <> NEW.id
      AND r.status = 'actief'
      AND ST_NPoints(r.geom) >= 2
    ORDER BY r.nummer
    LIMIT 1;
  END IF;

  IF public.rij_moet_omdraaien(NEW.geom, v_beginkant) THEN
    NEW.geom := ST_Reverse(NEW.geom);
  END IF;
  RETURN NEW;
END;
$$;

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
    COALESCE(r.ras, b.ras, spc.variety) AS ras_effectief,
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
    COALESCE(r.gewas, b.gewas, spc.crop, sg.crop, pa.crop) AS gewas_effectief,
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
     LEFT JOIN parcels pa ON pa.id = r.perceel_id
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN count(DISTINCT lower(s.crop)) = 1 THEN min(s.crop)
                    ELSE NULL::text
                END AS crop
           FROM sub_parcels s
          WHERE s.parcel_id = r.perceel_id AND s.crop IS NOT NULL) sg ON true;
GRANT SELECT ON public.v_rijen TO authenticated, service_role;
