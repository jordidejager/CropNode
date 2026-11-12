-- Perceelkaart (export voor de Jager Core-simulatie): perceelgrens en actieve rijen in RD New.
--
-- Alleen lezen: een nieuwe functie, geen wijziging aan tabellen of gegevens. De omrekening naar RD New
-- (EPSG:28992) gebeurt hier met ST_Transform, zodat de export precies dezelfde RD-coördinaten geeft als
-- lengte_m (generated column) en de afnemer niet zelf hoeft om te rekenen.
--
-- Uitvoer:
--   { perceel: { type, rd, oppervlak_m2, geldig } | null,
--     rijen: [{ id, rd, lengte_rd_m, buiten_grens_m }] }
--   rd = coördinaten in meters, 3 decimalen (Polygon/MultiPolygon resp. LineString zoals in GeoJSON);
--   buiten_grens_m = lengte van de rij die meer dan 1 m buiten de perceelgrens ligt (0 = binnen).
-- Filtert op p_user_id (aanroep met de admin-client) én, bij een ingelogde aanroep, op auth.uid().

CREATE OR REPLACE FUNCTION public.perceelkaart_geometrie(p_user_id UUID, p_perceel_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH perceel AS (
    SELECT ST_Transform(
             ST_SetSRID(
               ST_GeomFromGeoJSON(
                 CASE WHEN jsonb_typeof(pa.geometry) = 'string' THEN pa.geometry #>> '{}' ELSE pa.geometry::text END
               ),
               4326
             ),
             28992
           ) AS g
    FROM public.parcels pa
    WHERE pa.id = p_perceel_id
      AND pa.user_id = p_user_id
      AND (auth.uid() IS NULL OR pa.user_id = auth.uid())
      AND pa.geometry IS NOT NULL
      AND jsonb_typeof(pa.geometry) IN ('string', 'object')
    LIMIT 1
  ),
  grens AS (
    SELECT g, ST_Buffer(ST_MakeValid(g), 1.0) AS buffer FROM perceel
  ),
  rij AS (
    SELECT r.id, r.nummer, ST_Transform(r.geom, 28992) AS g
    FROM public.rijen r
    WHERE r.perceel_id = p_perceel_id
      AND r.user_id = p_user_id
      AND (auth.uid() IS NULL OR r.user_id = auth.uid())
      AND r.status = 'actief'
  )
  SELECT jsonb_build_object(
    'perceel', (
      SELECT jsonb_build_object(
        'type', GeometryType(g),
        'rd', (ST_AsGeoJSON(g, 3)::jsonb) -> 'coordinates',
        'oppervlak_m2', ST_Area(g),
        'geldig', ST_IsValid(g)
      )
      FROM perceel
    ),
    'rijen', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', rij.id,
          'rd', (ST_AsGeoJSON(rij.g, 3)::jsonb) -> 'coordinates',
          'lengte_rd_m', ST_Length(rij.g),
          'buiten_grens_m', (SELECT CASE WHEN grens.buffer IS NULL THEN NULL ELSE ST_Length(ST_Difference(rij.g, grens.buffer)) END FROM grens)
        )
        ORDER BY rij.nummer
      )
      FROM rij
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.perceelkaart_geometrie(UUID, TEXT) TO authenticated, service_role;
