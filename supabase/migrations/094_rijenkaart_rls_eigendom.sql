-- ============================================================================
-- 094 — Rijenkaart (beta): RLS aanscherpen op eigendom van perceel/rij/registratie
-- ============================================================================
-- Additief / alleen op de nieuwe rijenkaart-tabellen (092). De insert/update-policies
-- controleerden alleen user_id = auth.uid(); nu moet ook het gekoppelde perceel, blok,
-- subperceel, rij, bespuiting of notitie van dezelfde gebruiker zijn. De app schrijft via
-- de service-role (met expliciete eigendomschecks); dit beschermt directe client-toegang.
-- rijen_status telt alleen nog koppelingen van de gebruiker zelf.
-- Idempotent.
-- ============================================================================

-- blokken: perceel (en optioneel subperceel) van de gebruiker
DROP POLICY IF EXISTS "Users can insert own blokken" ON public.blokken;
DROP POLICY IF EXISTS "Users can update own blokken" ON public.blokken;
CREATE POLICY "Users can insert own blokken" ON public.blokken FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.parcels p WHERE p.id = blokken.perceel_id AND p.user_id = auth.uid())
  AND (blokken.sub_parcel_id IS NULL OR EXISTS (SELECT 1 FROM public.sub_parcels s WHERE s.id = blokken.sub_parcel_id AND s.parcel_id = blokken.perceel_id))
);
CREATE POLICY "Users can update own blokken" ON public.blokken FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.parcels p WHERE p.id = blokken.perceel_id AND p.user_id = auth.uid())
  AND (blokken.sub_parcel_id IS NULL OR EXISTS (SELECT 1 FROM public.sub_parcels s WHERE s.id = blokken.sub_parcel_id AND s.parcel_id = blokken.perceel_id))
);

-- rijen: perceel en (optioneel) blok van de gebruiker, blok binnen hetzelfde perceel
DROP POLICY IF EXISTS "Users can insert own rijen" ON public.rijen;
DROP POLICY IF EXISTS "Users can update own rijen" ON public.rijen;
CREATE POLICY "Users can insert own rijen" ON public.rijen FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.parcels p WHERE p.id = rijen.perceel_id AND p.user_id = auth.uid())
  AND (rijen.blok_id IS NULL OR EXISTS (SELECT 1 FROM public.blokken b WHERE b.id = rijen.blok_id AND b.user_id = auth.uid() AND b.perceel_id = rijen.perceel_id))
);
CREATE POLICY "Users can update own rijen" ON public.rijen FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.parcels p WHERE p.id = rijen.perceel_id AND p.user_id = auth.uid())
  AND (rijen.blok_id IS NULL OR EXISTS (SELECT 1 FROM public.blokken b WHERE b.id = rijen.blok_id AND b.user_id = auth.uid() AND b.perceel_id = rijen.perceel_id))
);

-- perceel_rijinstellingen: perceel van de gebruiker
DROP POLICY IF EXISTS "Users can insert own perceel_rijinstellingen" ON public.perceel_rijinstellingen;
DROP POLICY IF EXISTS "Users can update own perceel_rijinstellingen" ON public.perceel_rijinstellingen;
CREATE POLICY "Users can insert own perceel_rijinstellingen" ON public.perceel_rijinstellingen FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.parcels p WHERE p.id = perceel_rijinstellingen.perceel_id AND p.user_id = auth.uid())
);
CREATE POLICY "Users can update own perceel_rijinstellingen" ON public.perceel_rijinstellingen FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.parcels p WHERE p.id = perceel_rijinstellingen.perceel_id AND p.user_id = auth.uid())
);

-- bespuiting_rijen: bespuiting én rij van de gebruiker
DROP POLICY IF EXISTS "Users can insert own bespuiting_rijen" ON public.bespuiting_rijen;
DROP POLICY IF EXISTS "Users can update own bespuiting_rijen" ON public.bespuiting_rijen;
CREATE POLICY "Users can insert own bespuiting_rijen" ON public.bespuiting_rijen FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.spuitschrift s WHERE s.id = bespuiting_rijen.bespuiting_id AND s.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.rijen r WHERE r.id = bespuiting_rijen.rij_id AND r.user_id = auth.uid())
);
CREATE POLICY "Users can update own bespuiting_rijen" ON public.bespuiting_rijen FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.spuitschrift s WHERE s.id = bespuiting_rijen.bespuiting_id AND s.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.rijen r WHERE r.id = bespuiting_rijen.rij_id AND r.user_id = auth.uid())
);

-- veldnotitie_rijen: notitie én rij van de gebruiker
DROP POLICY IF EXISTS "Users can insert own veldnotitie_rijen" ON public.veldnotitie_rijen;
DROP POLICY IF EXISTS "Users can update own veldnotitie_rijen" ON public.veldnotitie_rijen;
CREATE POLICY "Users can insert own veldnotitie_rijen" ON public.veldnotitie_rijen FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.field_notes n WHERE n.id = veldnotitie_rijen.veldnotitie_id AND n.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.rijen r WHERE r.id = veldnotitie_rijen.rij_id AND r.user_id = auth.uid())
);
CREATE POLICY "Users can update own veldnotitie_rijen" ON public.veldnotitie_rijen FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.field_notes n WHERE n.id = veldnotitie_rijen.veldnotitie_id AND n.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.rijen r WHERE r.id = veldnotitie_rijen.rij_id AND r.user_id = auth.uid())
);

-- rijen_status: alleen koppelingen van de gebruiker zelf meetellen
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
    SELECT DISTINCT br.bespuiting_id
    FROM public.bespuiting_rijen br
    JOIN public.rijen rr ON rr.id = br.rij_id
    WHERE rr.perceel_id = p_perceel_id AND br.user_id = p_user_id
  ),
  dekking AS (
    SELECT r.id AS rij_id, s.id AS spray_id, s.date, s.products, true AS via_rijen
    FROM r
    JOIN public.bespuiting_rijen br ON br.rij_id = r.id AND br.user_id = p_user_id
    JOIN public.spuitschrift s ON s.id = br.bespuiting_id AND s.user_id = p_user_id
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
    WHERE vr.user_id = p_user_id
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
