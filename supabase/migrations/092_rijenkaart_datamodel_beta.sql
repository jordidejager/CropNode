-- ============================================================================
-- 092 — Rijenkaart (beta): blokken, rijen, perceel-rijinstellingen en koppelingen
-- ============================================================================
-- Volledig additief: nieuwe tabellen, views en functies. Bestaande tabellen
-- (parcels, sub_parcels, spuitschrift, field_notes) worden NIET gewijzigd.
--
-- Conventies:
--   * Geometrie in WGS84 (EPSG:4326); metrische berekeningen in RD New (EPSG:28992).
--   * Tenant-scoping zoals de rest van CropNode: user_id + RLS auth.uid() = user_id.
--   * Rij-ID's zijn vast: hernummeren wijzigt alleen `nummer`.
--   * Gerooide rijen blijven bestaan (status = 'gerooid').
--   * Richtingen zijn kompasgraden (0 = noord, met de klok mee) in het RD-grid.
-- Idempotent: kan veilig opnieuw gedraaid worden.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. blokken — aaneengesloten stuk van een perceel met dezelfde aanplant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blokken (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perceel_id TEXT NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  -- Koppeling naar het bestaande subperceel (spuitschrift.plots werkt met sub_parcel-id's)
  sub_parcel_id TEXT REFERENCES public.sub_parcels(id) ON DELETE SET NULL,
  naam TEXT,
  ras TEXT,
  plantjaar INT,
  onderstam TEXT,
  rijafstand_m NUMERIC,
  boomafstand_m NUMERIC,
  teeltsysteem TEXT,
  opmerking TEXT,
  geom extensions.geometry(Polygon, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blokken_user_id ON public.blokken(user_id);
CREATE INDEX IF NOT EXISTS idx_blokken_perceel_id ON public.blokken(perceel_id);

-- ----------------------------------------------------------------------------
-- 2. rijen — elke boomrij als eigen object
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rijen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perceel_id TEXT NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
  blok_id UUID REFERENCES public.blokken(id) ON DELETE SET NULL,
  nummer INT NOT NULL,
  label TEXT,
  rol TEXT NOT NULL DEFAULT 'hoofd' CHECK (rol IN ('hoofd', 'bestuiver')),
  ras TEXT,                 -- override; effectief ras = coalesce(rij.ras, blok.ras)
  plantjaar INT,            -- override op blok
  -- begin -> eind; begin ligt altijd aan de beginkant (trigger normaliseert)
  geom extensions.geometry(LineString, 4326) NOT NULL,
  lengte_m NUMERIC GENERATED ALWAYS AS (
    round(extensions.st_length(extensions.st_transform(geom, 28992))::numeric, 2)
  ) STORED,
  aantal_bomen INT,         -- handmatig; anders afgeleid uit lengte / boomafstand
  geom_bron TEXT NOT NULL DEFAULT 'gegenereerd' CHECK (geom_bron IN ('gegenereerd', 'getekend', 'gemeten')),
  nauwkeurigheid_m NUMERIC,
  controleren BOOLEAN NOT NULL DEFAULT false,  -- bv. rij door een inham geknipt
  status TEXT NOT NULL DEFAULT 'actief' CHECK (status IN ('actief', 'gerooid')),
  geplant_op DATE,
  gerooid_op DATE,
  opmerking TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rijen_user_id ON public.rijen(user_id);
CREATE INDEX IF NOT EXISTS idx_rijen_perceel_id ON public.rijen(perceel_id);
CREATE INDEX IF NOT EXISTS idx_rijen_blok_id ON public.rijen(blok_id);
CREATE INDEX IF NOT EXISTS idx_rijen_geom ON public.rijen USING gist(geom);

-- Nummer uniek per perceel onder actieve rijen. Uitgesteld tot commit, zodat een
-- hernummering (alle nummers schuiven) in één transactie kan.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rijen_nummer_uniek_actief' AND conrelid = 'public.rijen'::regclass
  ) THEN
    ALTER TABLE public.rijen
      ADD CONSTRAINT rijen_nummer_uniek_actief
      EXCLUDE USING btree (perceel_id WITH =, nummer WITH =)
      WHERE (status = 'actief')
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. perceel_rijinstellingen — 1:1 met perceel (parcels zelf blijft ongewijzigd)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perceel_rijinstellingen (
  perceel_id TEXT PRIMARY KEY REFERENCES public.parcels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rijrichting_graden NUMERIC,          -- kompasrichting van de rij-as, 0..180
  rijafstand_m NUMERIC,
  boomafstand_m NUMERIC,               -- standaard voor rijen zonder blok
  fase_m NUMERIC,                      -- loodrechte offset van het rijenpatroon t.o.v. het perceelzwaartepunt (RD)
  kopakker_begin_m NUMERIC DEFAULT 6,
  kopakker_eind_m NUMERIC DEFAULT 6,
  beginkant_graden NUMERIC,            -- kompasrichting vanaf het midden van een rij naar het begin ervan
  nummering_startzijde_graden NUMERIC, -- kompasrichting (loodrecht op de rijen) naar de kant waar rij 1 ligt
  nummering_start_rij_id UUID REFERENCES public.rijen(id) ON DELETE SET NULL,
  startnummer INT NOT NULL DEFAULT 1,
  bron_beeld TEXT,                     -- bv. 'PDOK Actueel_orthoHR'
  detectie_methode TEXT,               -- 'auto' | 'handmatig'
  detectie_confidence NUMERIC,
  laatst_gegenereerd_op TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perceel_rijinstellingen_user_id ON public.perceel_rijinstellingen(user_id);

-- ----------------------------------------------------------------------------
-- 4. Koppelingen naar bestaande registraties
-- ----------------------------------------------------------------------------
-- 0..n rijen per bespuiting. Geen rijen = hele perceel (huidig gedrag).
CREATE TABLE IF NOT EXISTS public.bespuiting_rijen (
  bespuiting_id TEXT NOT NULL REFERENCES public.spuitschrift(id) ON DELETE CASCADE,
  rij_id UUID NOT NULL REFERENCES public.rijen(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bespuiting_id, rij_id)
);

CREATE INDEX IF NOT EXISTS idx_bespuiting_rijen_rij_id ON public.bespuiting_rijen(rij_id);
CREATE INDEX IF NOT EXISTS idx_bespuiting_rijen_user_id ON public.bespuiting_rijen(user_id);

-- positie_m = meters vanaf het begin van de rij; boomnummer = floor(positie_m / boomafstand_m) + 1
CREATE TABLE IF NOT EXISTS public.veldnotitie_rijen (
  veldnotitie_id UUID NOT NULL REFERENCES public.field_notes(id) ON DELETE CASCADE,
  rij_id UUID NOT NULL REFERENCES public.rijen(id) ON DELETE CASCADE,
  positie_m NUMERIC,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (veldnotitie_id, rij_id)
);

CREATE INDEX IF NOT EXISTS idx_veldnotitie_rijen_rij_id ON public.veldnotitie_rijen(rij_id);
CREATE INDEX IF NOT EXISTS idx_veldnotitie_rijen_user_id ON public.veldnotitie_rijen(user_id);

-- ----------------------------------------------------------------------------
-- 5. RLS — zelfde patroon als companies (088)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['blokken', 'rijen', 'perceel_rijinstellingen', 'bespuiting_rijen', 'veldnotitie_rijen'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update own %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Users can view own %s" ON public.%I FOR SELECT USING (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "Users can insert own %s" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "Users can update own %s" ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('CREATE POLICY "Users can delete own %s" ON public.%I FOR DELETE USING (auth.uid() = user_id)', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Triggers: updated_at, beginkant-normalisatie, blok-overlap
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rijenkaart_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blokken_updated_at ON public.blokken;
CREATE TRIGGER trg_blokken_updated_at BEFORE UPDATE ON public.blokken
  FOR EACH ROW EXECUTE FUNCTION public.rijenkaart_set_updated_at();

DROP TRIGGER IF EXISTS trg_rijen_updated_at ON public.rijen;
CREATE TRIGGER trg_rijen_updated_at BEFORE UPDATE ON public.rijen
  FOR EACH ROW EXECUTE FUNCTION public.rijenkaart_set_updated_at();

DROP TRIGGER IF EXISTS trg_perceel_rijinstellingen_updated_at ON public.perceel_rijinstellingen;
CREATE TRIGGER trg_perceel_rijinstellingen_updated_at BEFORE UPDATE ON public.perceel_rijinstellingen
  FOR EACH ROW EXECUTE FUNCTION public.rijenkaart_set_updated_at();

-- true als de lijn omgedraaid moet worden zodat het beginpunt aan de beginkant ligt
CREATE OR REPLACE FUNCTION public.rij_moet_omdraaien(p_geom extensions.geometry, p_beginkant_graden NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN p_geom IS NULL OR p_beginkant_graden IS NULL OR ST_NPoints(p_geom) < 2 THEN false
    ELSE COALESCE(
      cos(
        ST_Azimuth(
          ST_Transform(ST_LineInterpolatePoint(p_geom, 0.5), 28992),
          ST_Transform(ST_StartPoint(p_geom), 28992)
        ) - radians(p_beginkant_graden::double precision)
      ) < 0,
      false
    )
  END;
$$;

-- Normaliseer bij opslaan: begin -> eind, begin aan de beginkant van het perceel
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

  IF public.rij_moet_omdraaien(NEW.geom, v_beginkant) THEN
    NEW.geom := ST_Reverse(NEW.geom);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rijen_normaliseer_richting ON public.rijen;
CREATE TRIGGER trg_rijen_normaliseer_richting BEFORE INSERT OR UPDATE OF geom ON public.rijen
  FOR EACH ROW EXECUTE FUNCTION public.rijen_normaliseer_richting();

-- Overlappende blokpolygonen binnen één perceel voorkomen (blok-geom is optioneel).
-- Rijen kunnen per definitie maar in één blok zitten (rijen.blok_id).
CREATE OR REPLACE FUNCTION public.blokken_controleer_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.geom IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.blokken b
    WHERE b.perceel_id = NEW.perceel_id
      AND b.id <> NEW.id
      AND b.geom IS NOT NULL
      AND ST_Intersects(b.geom, NEW.geom)
      AND ST_Area(ST_Intersection(ST_Transform(b.geom, 28992), ST_Transform(NEW.geom, 28992))) > 1
  ) THEN
    RAISE EXCEPTION 'Blok overlapt met een ander blok in dit perceel';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blokken_controleer_overlap ON public.blokken;
CREATE TRIGGER trg_blokken_controleer_overlap BEFORE INSERT OR UPDATE OF geom ON public.blokken
  FOR EACH ROW EXECUTE FUNCTION public.blokken_controleer_overlap();

-- ----------------------------------------------------------------------------
-- 7. Views
-- ----------------------------------------------------------------------------
-- Rijen met effectieve waarden (ras, plantjaar, afstanden, bomen) en GeoJSON-geometrie.
-- sub_parcel_id = blok.sub_parcel_id, anders het enige subperceel van het perceel,
-- anders het enige subperceel met hetzelfde ras. NULL = niet eenduidig.
CREATE OR REPLACE VIEW public.v_rijen WITH (security_invoker = on) AS
SELECT
  r.id,
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
  COALESCE(
    r.aantal_bomen,
    CASE WHEN COALESCE(b.boomafstand_m, i.boomafstand_m) > 0
      THEN floor(r.lengte_m / COALESCE(b.boomafstand_m, i.boomafstand_m))::int + 1
    END
  ) AS aantal_bomen_effectief,
  r.geom_bron,
  r.nauwkeurigheid_m,
  r.controleren,
  r.status,
  r.geplant_op,
  r.gerooid_op,
  r.opmerking,
  extensions.st_asgeojson(r.geom, 7)::jsonb AS geometrie,
  COALESCE(b.sub_parcel_id, sp.id) AS sub_parcel_id,
  r.created_at,
  r.updated_at
FROM public.rijen r
LEFT JOIN public.blokken b ON b.id = r.blok_id
LEFT JOIN public.perceel_rijinstellingen i ON i.perceel_id = r.perceel_id
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN count(*) = 1 THEN min(s.id)
    WHEN count(*) FILTER (WHERE lower(s.variety) = lower(COALESCE(b.ras, r.ras))) = 1
      THEN min(s.id) FILTER (WHERE lower(s.variety) = lower(COALESCE(b.ras, r.ras)))
  END AS id
  FROM public.sub_parcels s
  WHERE s.parcel_id = r.perceel_id
) sp ON true;

GRANT SELECT ON public.v_rijen TO authenticated, service_role;

-- Samenvatting per perceel (overzichtspagina, MCP)
CREATE OR REPLACE VIEW public.v_rijen_per_perceel WITH (security_invoker = on) AS
SELECT
  r.perceel_id,
  r.user_id,
  count(*) FILTER (WHERE r.status = 'actief') AS aantal_actief,
  count(*) FILTER (WHERE r.status = 'gerooid') AS aantal_gerooid,
  count(*) FILTER (WHERE r.status = 'actief' AND r.rol = 'bestuiver') AS aantal_bestuivers,
  count(*) FILTER (WHERE r.status = 'actief' AND r.controleren) AS aantal_controleren,
  min(r.nummer) FILTER (WHERE r.status = 'actief') AS min_nummer,
  max(r.nummer) FILTER (WHERE r.status = 'actief') AS max_nummer,
  round(COALESCE(sum(r.lengte_m) FILTER (WHERE r.status = 'actief'), 0), 1) AS totale_lengte_m,
  round(COALESCE(sum(r.lengte_m * r.rijafstand_m) FILTER (WHERE r.status = 'actief'), 0) / 10000.0, 4) AS rij_oppervlak_ha,
  count(DISTINCT r.blok_id) FILTER (WHERE r.status = 'actief') AS aantal_blokken
FROM public.v_rijen r
GROUP BY r.perceel_id, r.user_id;

GRANT SELECT ON public.v_rijen_per_perceel TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Functies
-- ----------------------------------------------------------------------------
-- GeoJSON-export: FeatureCollection met alle rijen van een perceel (RLS geldt).
CREATE OR REPLACE FUNCTION public.rijen_geojson(p_perceel_id TEXT, p_incl_gerooid BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
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
    AND (p_incl_gerooid OR v.status = 'actief')
    AND (auth.uid() IS NULL OR v.user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.rijen_geojson(TEXT, BOOLEAN) TO authenticated, service_role;

-- Wijzigingen aan de rijen van één perceel in één transactie toepassen
-- (genereren met ID-mapping, hernummeren, rij toevoegen/verwijderen, eindpunt slepen).
--   p_rijen: [{ id?, nummer?, coordinates?: [[lng,lat],...], geom_bron?, nauwkeurigheid_m?, controleren?, blok_id?, rol?, ras? }]
--            id leeg = nieuwe rij (nummer + coordinates verplicht)
--   p_verwijderen: rij-id's; zonder koppelingen -> verwijderd, met koppelingen -> status 'gerooid'
--   p_instellingen: gedeeltelijke update van perceel_rijinstellingen (alleen meegegeven sleutels)
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

-- Beginkant wijzigen: draai rijen om die aan de verkeerde kant beginnen en spiegel
-- de positie van gekoppelde veldnotities mee (positie_m blijft dezelfde boom aanwijzen).
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

  UPDATE public.veldnotitie_rijen vr
  SET positie_m = GREATEST(0, r.lengte_m - vr.positie_m)
  FROM public.rijen r
  WHERE vr.rij_id = r.id AND r.id = ANY(v_ids) AND vr.positie_m IS NOT NULL;

  UPDATE public.rijen SET geom = ST_Reverse(geom) WHERE id = ANY(v_ids);

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rijen_zet_beginkant(UUID, TEXT, NUMERIC) TO authenticated, service_role;

-- Per rij: laatste bespuiting en aantal notities (popup op de kaart).
-- Een bespuiting zonder rijkoppeling op dit perceel geldt voor alle rijen van het
-- subperceel (huidig gedrag); met rijkoppeling alleen voor de gekoppelde rijen.
CREATE OR REPLACE FUNCTION public.rijen_status(p_user_id UUID, p_perceel_id TEXT)
RETURNS TABLE (
  rij_id UUID,
  laatste_bespuiting_id TEXT,
  laatste_bespuiting_datum TIMESTAMPTZ,
  laatste_bespuiting_middelen TEXT,
  laatste_bespuiting_via_rijen BOOLEAN,
  aantal_bespuitingen INT,
  aantal_notities INT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH r AS (
    SELECT v.id, v.sub_parcel_id, v.perceel_id
    FROM public.v_rijen v
    WHERE v.perceel_id = p_perceel_id AND v.user_id = p_user_id
      AND (auth.uid() IS NULL OR auth.uid() = p_user_id)
  ),
  gekoppelde_sprays AS (
    -- bespuitingen met rijkoppeling op dit perceel
    SELECT DISTINCT br.bespuiting_id
    FROM public.bespuiting_rijen br
    JOIN public.rijen rr ON rr.id = br.rij_id
    WHERE rr.perceel_id = p_perceel_id AND br.user_id = p_user_id
  ),
  dekking AS (
    SELECT r.id AS rij_id, s.id AS spray_id, s.date, s.products, true AS via_rijen
    FROM r
    JOIN public.bespuiting_rijen br ON br.rij_id = r.id
    JOIN public.spuitschrift s ON s.id = br.bespuiting_id
    WHERE COALESCE(s.registration_type, 'spraying') <> 'spreading'
    UNION ALL
    SELECT r.id, s.id, s.date, s.products, false
    FROM r
    JOIN public.spuitschrift s
      ON s.user_id = p_user_id
     AND r.sub_parcel_id IS NOT NULL
     AND r.sub_parcel_id = ANY(s.plots)
    WHERE COALESCE(s.registration_type, 'spraying') <> 'spreading'
      AND s.id NOT IN (SELECT bespuiting_id FROM gekoppelde_sprays)
  ),
  laatste AS (
    SELECT DISTINCT ON (d.rij_id) d.rij_id, d.spray_id, d.date, d.products, d.via_rijen
    FROM dekking d
    ORDER BY d.rij_id, d.date DESC
  ),
  aantallen AS (
    SELECT d.rij_id, count(DISTINCT d.spray_id)::int AS n FROM dekking d GROUP BY d.rij_id
  ),
  notities AS (
    SELECT vr.rij_id, count(*)::int AS n
    FROM public.veldnotitie_rijen vr
    JOIN r ON r.id = vr.rij_id
    GROUP BY vr.rij_id
  )
  SELECT
    r.id,
    l.spray_id,
    l.date,
    (SELECT string_agg(p->>'product', ', ') FROM jsonb_array_elements(COALESCE(l.products, '[]'::jsonb)) p),
    l.via_rijen,
    COALESCE(a.n, 0),
    COALESCE(n.n, 0)
  FROM r
  LEFT JOIN laatste l ON l.rij_id = r.id
  LEFT JOIN aantallen a ON a.rij_id = r.id
  LEFT JOIN notities n ON n.rij_id = r.id;
$$;

GRANT EXECUTE ON FUNCTION public.rijen_status(UUID, TEXT) TO authenticated, service_role;
