-- ============================================================================
-- 093 — Rijenkaart (beta): v_blokken met GeoJSON-geometrie
-- ============================================================================
-- Additief. PostgREST geeft PostGIS-kolommen als hex-WKB terug; deze view levert
-- de (optionele) blokpolygoon als GeoJSON plus het aantal actieve rijen per blok.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_blokken WITH (security_invoker = on) AS
SELECT
  b.id,
  b.user_id,
  b.perceel_id,
  b.sub_parcel_id,
  b.naam,
  b.ras,
  b.plantjaar,
  b.onderstam,
  b.rijafstand_m,
  b.boomafstand_m,
  b.teeltsysteem,
  b.opmerking,
  CASE WHEN b.geom IS NULL THEN NULL ELSE extensions.st_asgeojson(b.geom, 7)::jsonb END AS geometrie,
  (SELECT count(*) FROM public.rijen r WHERE r.blok_id = b.id AND r.status = 'actief')::int AS aantal_rijen,
  (SELECT min(r.nummer) FROM public.rijen r WHERE r.blok_id = b.id AND r.status = 'actief') AS min_nummer,
  (SELECT max(r.nummer) FROM public.rijen r WHERE r.blok_id = b.id AND r.status = 'actief') AS max_nummer,
  b.created_at,
  b.updated_at
FROM public.blokken b;

GRANT SELECT ON public.v_blokken TO authenticated, service_role;
