-- ============================================================================
-- 074: Normalize field_notes.parcel_ids[] van TEXT-namen naar sub_parcel.id (uuid)
-- ============================================================================
--
-- Probleem: legacy field_notes rijen (pre-AI-classifier of geïmporteerd via
-- WhatsApp/email) bevatten in `parcel_ids` soms TEKST-namen i.p.v. uuid's.
-- Dit veroorzaakt inconsistentie in de UI en niet-koppelbare percelen.
--
-- Oplossing: voor elke rij waarin minstens één entry géén uuid is, probeer de
-- naam-strings op te zoeken in `v_sprayable_parcels` (matcht op `name`,
-- `parcel_name`, of `synonyms`). Vervang de array door een schone lijst van
-- sub_parcel.id's (deduped). Onresolvbare entries worden weggelaten.
--
-- App-laag: nieuwe writes via /api/field-notes valideren via Zod dat elk id
-- een uuid is. Migratie is idempotent (kan herhaaldelijk gedraaid worden).
-- ============================================================================

DO $$
DECLARE
    fn record;
    resolved_ids text[];
BEGIN
    FOR fn IN
        SELECT id, user_id, parcel_ids
        FROM field_notes
        WHERE parcel_ids IS NOT NULL
          AND array_length(parcel_ids, 1) > 0
          -- Alleen rijen met minstens één niet-uuid waarde
          AND EXISTS (
            SELECT 1 FROM unnest(parcel_ids) AS x
            WHERE x !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          )
    LOOP
        -- Resolve elke entry: behoud uuid's, lookup namen via v_sprayable_parcels
        SELECT array_agg(DISTINCT v.id)
            INTO resolved_ids
            FROM unnest(fn.parcel_ids) AS raw
            LEFT JOIN v_sprayable_parcels v
              ON v.user_id = fn.user_id
             AND (
                  -- Exact uuid match
                  raw = v.id
                  -- Naam match (case-insensitive)
                  OR lower(v.name) = lower(raw)
                  OR lower(v.parcel_name) = lower(raw)
                  -- Synoniem match
                  OR EXISTS (
                      SELECT 1 FROM unnest(coalesce(v.synonyms, '{}'::text[])) s
                      WHERE lower(s) = lower(raw)
                  )
             )
            WHERE v.id IS NOT NULL;

        UPDATE field_notes
        SET parcel_ids = COALESCE(resolved_ids, '{}'::text[])
        WHERE id = fn.id;
    END LOOP;
END$$;

-- Document conventie voor toekomstige writes
COMMENT ON COLUMN field_notes.parcel_ids IS
  'Array van sub_parcel.id (uuid). Alle writes MOETEN sub_parcel.id gebruiken; legacy naam-gebaseerde entries zijn genormaliseerd door migratie 074. App-laag (/api/field-notes) valideert via Zod uuid refinement.';
