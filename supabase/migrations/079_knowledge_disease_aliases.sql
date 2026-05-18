-- 079_knowledge_disease_aliases.sql
--
-- Voeg informele/regionale synoniemen toe aan knowledge_disease_profile,
-- zodat een vraag over "dikkoppen" gemapt wordt naar het perengalmug-
-- profiel, "springer" naar perenbladvlo, enzovoort.
--
-- Idempotent — safe to re-run. Bestaande waarden worden gemerged met
-- array_cat, dus handmatig toegevoegde aliases blijven behouden.

-- ============================================
-- 1. Aliases kolom + GIN index
-- ============================================

ALTER TABLE knowledge_disease_profile
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_kdp_aliases
  ON knowledge_disease_profile USING GIN(aliases);

-- ============================================
-- 2. Helper: merge aliases zonder duplicaten
-- ============================================

CREATE OR REPLACE FUNCTION kdp_merge_aliases(existing TEXT[], additions TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY(
    SELECT DISTINCT unnest(COALESCE(existing, ARRAY[]::TEXT[]) || COALESCE(additions, ARRAY[]::TEXT[]))
  );
$$;

-- ============================================
-- 3. Backfill: bekende informele termen → canonical profile
-- ============================================
-- Deze lijst is gebaseerd op veel gebruikte telersterminologie.
-- Voeg hier nieuwe termen toe wanneer ze in feedback opduiken.

-- Perengalmug (dikkoppen-symptoom)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['dikkoppen', 'dikkop', 'dikke peren', 'galmug', 'Contarinia pyrivora'])
WHERE lower(name) = 'perengalmug';

-- Perenbladvlo (springer / pearlice)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['springer', 'springers', 'peerluis', 'pear psylla', 'Cacopsylla pyri', 'Psylla pyri', 'bladvlo'])
WHERE lower(name) = 'perenbladvlo';

-- Schurft (fusicladium / black spot)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['fusicladium', 'black spot', 'appelschurft', 'peerschurft', 'Venturia inaequalis', 'Venturia pirina'])
WHERE lower(name) = 'schurft';

-- Vruchtboomkanker (neonectria / canker)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['kanker', 'takkanker', 'neonectria', 'Neonectria ditissima', 'Nectria galligena', 'canker'])
WHERE lower(name) = 'vruchtboomkanker';

-- Meeldauw (echte + valse)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['echte meeldauw', 'oidium', 'Podosphaera leucotricha', 'witziekte', 'melkdauw'])
WHERE lower(name) = 'meeldauw';

-- Bacterievuur
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['bacterievuur', 'fire blight', 'Erwinia amylovora', 'herderstaf'])
WHERE lower(name) = 'bacterievuur';

-- Bloedluis
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['wolluis', 'woolly aphid', 'Eriosoma lanigerum', 'witte luis'])
WHERE lower(name) = 'bloedluis';

-- Appelbloesemkever
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['bloesemkever', 'kever', 'snuitkever', 'Anthonomus pomorum', 'roodkop', 'roodkopjes'])
WHERE lower(name) = 'appelbloesemkever';

-- Fruitmot (codling moth)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['codling moth', 'Cydia pomonella', 'appelmot', 'appelwurm', 'wurm'])
WHERE lower(name) = 'fruitmot';

-- Spint / spintmijt
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['spintmijt', 'rode spint', 'rode mijt', 'Panonychus ulmi', 'Tetranychus urticae', 'kasspint'])
WHERE lower(name) = 'spint';

-- Luis (bladluis in het algemeen)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['bladluis', 'aphid', 'roze luis', 'groene luis', 'Dysaphis plantaginea'])
WHERE lower(name) = 'luis';

-- Vruchtrot (monilia + gloeosporium combined — name-dependent)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['rot', 'bewaarrot', 'Gloeosporium', 'Neofabraea', 'lenticelrot', 'lenticel rot'])
WHERE lower(name) = 'vruchtrot';

-- Monilia (vruchtmonilia)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['bruinrot', 'Monilinia', 'monilinia laxa', 'monilinia fructigena', 'bloesemmonilia'])
WHERE lower(name) = 'monilia';

-- Roetdauw (sooty mould)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['sooty mould', 'zwart', 'Capnodium', 'honingdauwschimmel'])
WHERE lower(name) = 'roetdauw';

-- Stemphylium (lederrot)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['lederrot', 'Stemphylium vesicarium', 'vlekkenziekte stemphylium', 'donkere vlekken'])
WHERE lower(name) = 'stemphylium';

-- Wants (groene wants etc.)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['groene wants', 'Lygus', 'Lygocoris pabulinus', 'stinkwants'])
WHERE lower(name) = 'wants';

-- Alternaria
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['Alternaria alternata', 'alternaria vlekken', 'zwartvlekkenziekte'])
WHERE lower(name) = 'alternaria';

-- Vlekkenziekte (generic)
UPDATE knowledge_disease_profile
SET aliases = kdp_merge_aliases(aliases, ARRAY['blattflecken', 'leaf spot', 'bladvlekken'])
WHERE lower(name) = 'vlekkenziekte';
