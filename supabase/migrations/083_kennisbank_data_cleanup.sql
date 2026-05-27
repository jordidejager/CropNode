-- 083_kennisbank_data_cleanup.sql
--
-- Eenmalige data-cleanup voor alle anomalieën gevonden door
-- scripts/diagnose-kennisbank.ts:
--
--   1. Archive published artikelen met valid_until in verleden (638 stuks)
--   2. Default [appel,peer] crops voor 6 artikelen zonder crop-tagging
--   3. Archive artikelen met te korte content (<100 chars)
--   4. Dedup knowledge_product_advice (187 duplicates op product×target×crop)
--   5. Strip bronvermeldingen uit content (FruitConsult, Delphy, etc.)
--   6. Vervang temporal references door fenologische placeholder
--
-- Idempotent — re-run safe.

-- ============================================
-- 1. Archive expired published
-- ============================================
UPDATE knowledge_articles
SET status = 'archived'
WHERE status = 'published'
  AND valid_until IS NOT NULL
  AND valid_until < CURRENT_DATE;

-- ============================================
-- 2. Default crops voor onbekende
-- ============================================
UPDATE knowledge_articles
SET crops = ARRAY['appel', 'peer']
WHERE (crops IS NULL OR cardinality(crops) = 0)
  AND status = 'published';

-- ============================================
-- 3. Archive te-korte content
-- ============================================
UPDATE knowledge_articles
SET status = 'archived'
WHERE status != 'archived'
  AND (content IS NULL OR length(content) < 100);

-- ============================================
-- 4. Dedup product_advice
-- ============================================
-- Houdt rij met hoogste source_article_count; bij gelijk: oudste created_at.
DELETE FROM knowledge_product_advice
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          lower(coalesce(product_name, '')),
          lower(coalesce(target, '')),
          lower(coalesce(crop, ''))
        ORDER BY
          source_article_count DESC NULLS LAST,
          created_at ASC NULLS LAST
      ) AS rn
    FROM knowledge_product_advice
  ) t
  WHERE rn > 1
);

-- ============================================
-- 5. Strip bron-vermeldingen uit content
-- ============================================
-- Vervang specifieke bron-zinsdelen door neutrale tekst. Veiliger dan
-- volledige zinnen verwijderen — behoudt context.
UPDATE knowledge_articles
SET content = regexp_replace(
  content,
  -- "volgens FruitConsult" / "Delphy adviseert" / "WGF-fruit" etc.
  '(?:volgens|via|door|bron:|info van|advies van|onderzoek door|gegevens van)\s+(?:FruitConsult|Delphy|NFO|WGF[- ]?Fruit|NFT[- ]?Fruit|GroenKennisnet|WUR(?: Wageningen)?|Wageningen Universiteit|adviseur \w+|de adviseur)',
  '',
  'gi'
)
WHERE content ~* '(?:volgens|via|door|bron|info|advies)\s+(?:FruitConsult|Delphy|NFO|WGF[- ]?Fruit|NFT[- ]?Fruit|GroenKennisnet|adviseur)';

-- Standalone bron-namen (zonder voorgaand woord) → ook strippen
UPDATE knowledge_articles
SET content = regexp_replace(
  content,
  '\m(FruitConsult|Delphy|NFO|WGF[- ]?Fruit|NFT[- ]?Fruit|GroenKennisnet)\M',
  'de kennisbank',
  'gi'
)
WHERE content ~* '\m(FruitConsult|Delphy|NFO|WGF[- ]?Fruit|NFT[- ]?Fruit|GroenKennisnet)\M';

-- ============================================
-- 6. Temporal references → fenologische placeholder
-- ============================================
-- Vervang weekdagen + "vandaag/morgen/etc." door neutrale fasering.
-- Niet perfect, maar voorkomt verwarrende verouderde tijdsreferenties.

UPDATE knowledge_articles
SET content = regexp_replace(
  regexp_replace(
    regexp_replace(
      content,
      '\m(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\M',
      'binnen enkele dagen', 'gi'
    ),
    '\m(de komende dagen|komende dagen|volgende week|afgelopen weekend|deze week|eerder deze week|begin volgende week|eind deze week|aanstaande week)\M',
    'in deze periode', 'gi'
  ),
  '\m(vandaag|gisteren|morgen|overmorgen|eergisteren)\M',
  'in deze periode', 'gi'
)
WHERE content ~* '\m(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|vandaag|gisteren|morgen|de komende dagen|volgende week|afgelopen weekend|deze week)\M';

-- Summary apart — zelfde behandeling
UPDATE knowledge_articles
SET summary = regexp_replace(
  regexp_replace(
    summary,
    '\m(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|vandaag|gisteren|morgen|de komende dagen|volgende week|afgelopen weekend|deze week)\M',
    'in deze periode', 'gi'
  ),
  '\m(FruitConsult|Delphy|NFO|WGF[- ]?Fruit|NFT[- ]?Fruit|GroenKennisnet)\M',
  'de kennisbank', 'gi'
)
WHERE summary ~* '\m(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|vandaag|gisteren|morgen|FruitConsult|Delphy)\M';

-- ============================================
-- 7. Slimme cleanup: dubbele spaties + lege regelafsluiters
-- ============================================
UPDATE knowledge_articles
SET content = regexp_replace(content, '[ ]{2,}', ' ', 'g')
WHERE content ~ '[ ]{2,}';

-- ============================================
-- Diagnostiek
-- ============================================
DO $$
DECLARE
  total INT;
  archived_count INT;
  advice_count INT;
BEGIN
  SELECT count(*) INTO total FROM knowledge_articles;
  SELECT count(*) INTO archived_count FROM knowledge_articles WHERE status = 'archived';
  SELECT count(*) INTO advice_count FROM knowledge_product_advice;
  RAISE NOTICE 'Cleanup voltooid. Totaal articles: %, archived: %, advice rows: %', total, archived_count, advice_count;
END $$;
