-- ============================================
-- Sample Data for Pests & Diseases
-- Run AFTER create_pests_diseases.sql
-- ============================================

-- Clear existing data (optional)
-- DELETE FROM pests_diseases;

-- ============================================
-- Appel Schimmels
-- ============================================
INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Schurft',
    'Venturia inaequalis',
    'fungus',
    'apple',
    'critical',
    'De nummer 1 vijand van de appelteler',
    'Overwintert in afgevallen bladeren op de grond als pseudothecia (vruchtlichamen).',
    'Heeft bladnat nodig (minimaal 9-12 uur) bij temperaturen boven 7°C. RIM-tabel is essentieel.',
    'Preventieve aanpak vereist. Bij eerste infectie direct ingrijpen.',
    '[{"month": 3, "activity": "Ascosporenrijping", "intensity": 30}, {"month": 4, "activity": "Primaire infecties", "intensity": 80}, {"month": 5, "activity": "Secundaire infecties", "intensity": 100}, {"month": 6, "activity": "Verspreiding", "intensity": 70}, {"month": 7, "activity": "Zomerinfecties", "intensity": 50}, {"month": 8, "activity": "Bewaarschurft risico", "intensity": 40}]'::jsonb,
    ARRAY['schurft', 'appel', 'schimmel', 'primair'],
    ARRAY['schurft', 'venturia', 'inaequalis', 'apple scab', 'appelschurft']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Meeldauw',
    'Podosphaera leucotricha',
    'fungus',
    'apple',
    'high',
    'De witte waas op jonge scheuten',
    'Overwintert in geïnfecteerde knoppen (primair inoculum).',
    'Gedijt bij warm, droog weer met hoge luchtvochtigheid. Geen vrij water nodig.',
    'Bij >5% aangetaste scheuten in gevoelig ras ingrijpen.',
    '[{"month": 4, "activity": "Uitlopen knoppen", "intensity": 60}, {"month": 5, "activity": "Primaire infectie", "intensity": 90}, {"month": 6, "activity": "Secundaire verspreiding", "intensity": 100}, {"month": 7, "activity": "Actief", "intensity": 80}, {"month": 8, "activity": "Afnemend", "intensity": 40}]'::jsonb,
    ARRAY['meeldauw', 'appel', 'schimmel', 'wit'],
    ARRAY['meeldauw', 'podosphaera', 'powdery mildew', 'witziekte']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Vruchtboomkanker',
    'Nectria galligena',
    'fungus',
    'apple',
    'high',
    'Houtaantasting met blijvende schade',
    'Overwintert in kankerplekken op het hout.',
    'Infectie via wonden (snoei, hagel, bladlittekens). Vochtig weer bevordert sporulatie.',
    'Preventief snoeien van aangetast hout. Wondbehandeling na snoei.',
    '[{"month": 9, "activity": "Bladval infecties", "intensity": 80}, {"month": 10, "activity": "Herfstinfecties", "intensity": 100}, {"month": 11, "activity": "Sporulatie", "intensity": 90}, {"month": 3, "activity": "Voorjaarsinfecties", "intensity": 70}, {"month": 4, "activity": "Via snoei", "intensity": 50}]'::jsonb,
    ARRAY['kanker', 'appel', 'schimmel', 'hout'],
    ARRAY['vruchtboomkanker', 'nectria', 'galligena', 'european canker', 'kanker']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Gloeosporium',
    'Neofabraea alba',
    'fungus',
    'apple',
    'high',
    'Dé bewaarziekte - rot in de koelcel',
    'Sporuleert op kankertjes in de boom.',
    'Infecteert via lenticellen op de vrucht, vooral bij regen en hoge RV.',
    'Focus op oogstmomenten. Late bespuitingen voor bewaarpartijen.',
    '[{"month": 7, "activity": "Lenticelinfectie start", "intensity": 50}, {"month": 8, "activity": "Kritieke infectieperiode", "intensity": 90}, {"month": 9, "activity": "Tot aan oogst", "intensity": 100}, {"month": 1, "activity": "Uitgroei in bewaring", "intensity": 60}]'::jsonb,
    ARRAY['gloeosporium', 'appel', 'schimmel', 'bewaring'],
    ARRAY['gloeosporium', 'neofabraea', 'bewaarrot', 'kurkstip', 'lenticel rot']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Phytophthora',
    'Phytophthora cactorum',
    'fungus',
    'apple',
    'medium',
    'Wortel- en stamrot - natte voeten zijn dodelijk',
    'Persisteert als oösporen in de grond.',
    'Wateroverlast en slechte drainage. Warme, natte zomers zijn kritiek.',
    'Drainage verbeteren. Onderstam keuze is cruciaal.',
    '[{"month": 5, "activity": "Wortelinfecties bij nat", "intensity": 60}, {"month": 6, "activity": "Kraagrot symptomen", "intensity": 80}, {"month": 7, "activity": "Verspreiding bij warmte", "intensity": 100}, {"month": 8, "activity": "Acute symptomen", "intensity": 90}]'::jsonb,
    ARRAY['phytophthora', 'appel', 'schimmel', 'wortel'],
    ARRAY['phytophthora', 'cactorum', 'wortelrot', 'kraagrot', 'crown rot']
);

-- ============================================
-- Appel Insecten
-- ============================================
INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Fruitmot',
    'Cydia pomonella',
    'insect',
    'both',
    'critical',
    'De worm in de appel - wormstekigheid',
    'Overwintert als volgroeide larve in cocon onder schors of in de grond.',
    'Vluchten bij schemering, T>15°C. Eiafzet op vruchten bij warm weer.',
    'Feromoonvallen monitoren. Drempel: >5 motjes/val/week.',
    '[{"month": 5, "activity": "1e vlucht start", "intensity": 50}, {"month": 6, "activity": "Piek 1e generatie", "intensity": 100}, {"month": 7, "activity": "2e generatie start", "intensity": 70}, {"month": 8, "activity": "Piek 2e generatie", "intensity": 90}, {"month": 9, "activity": "Afnemend", "intensity": 30}]'::jsonb,
    ARRAY['fruitmot', 'appel', 'peer', 'insect', 'mot'],
    ARRAY['fruitmot', 'cydia', 'pomonella', 'codling moth', 'wormstekig']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Appelbloedluis',
    'Eriosoma lanigerum',
    'insect',
    'apple',
    'high',
    'Wollige witte plekken op het hout',
    'Overwintert op wortels en in scheuren in de schors.',
    'Gedijt in beschutte plaatsen, vooral bij verwonde plekken.',
    'Scout op kolonies in mei-juni. Vroege bestrijding cruciaal.',
    '[{"month": 4, "activity": "Uitlopen kolonies", "intensity": 40}, {"month": 5, "activity": "Verspreiding", "intensity": 70}, {"month": 6, "activity": "Populatie-opbouw", "intensity": 90}, {"month": 7, "activity": "Maximum", "intensity": 100}, {"month": 8, "activity": "Hoog", "intensity": 90}]'::jsonb,
    ARRAY['bloedluis', 'appel', 'insect', 'luis'],
    ARRAY['appelbloedluis', 'eriosoma', 'lanigerum', 'woolly aphid', 'bloedluis', 'wollige luis']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Roze Appelluis',
    'Dysaphis plantaginea',
    'insect',
    'apple',
    'high',
    'Krullende bladeren en misvormde vruchten',
    'Overwintert als ei op het hout.',
    'Kolonisatie bij uitlopen knoppen. Snelle vermeerdering in voorjaar.',
    'Bij rozetopening: >50 eieren/100 knoppen = actie.',
    '[{"month": 4, "activity": "Eileg uitkomen", "intensity": 80}, {"month": 5, "activity": "Kolonievorming", "intensity": 100}, {"month": 6, "activity": "Migratie weegbree", "intensity": 60}, {"month": 9, "activity": "Terugvlucht", "intensity": 50}, {"month": 10, "activity": "Wintereieren", "intensity": 40}]'::jsonb,
    ARRAY['rozeluis', 'appel', 'insect', 'luis'],
    ARRAY['roze appelluis', 'dysaphis', 'plantaginea', 'rosy apple aphid', 'luis', 'bladluis']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Appelzaagwesp',
    'Hoplocampa testudinea',
    'insect',
    'apple',
    'medium',
    'Lintvormige littekens op jonge vruchtjes',
    'Overwintert als larve in de grond.',
    'Adulten actief tijdens bloei. Eiafzet in bloemen.',
    'Witte vallen tijdens bloei. >10 wespen = ingrijpen.',
    '[{"month": 4, "activity": "Pop verschijnt", "intensity": 60}, {"month": 5, "activity": "Vlucht + eiafzet bloei", "intensity": 100}, {"month": 6, "activity": "Larven vreten", "intensity": 80}, {"month": 7, "activity": "Larven naar grond", "intensity": 30}]'::jsonb,
    ARRAY['zaagwesp', 'appel', 'insect'],
    ARRAY['appelzaagwesp', 'hoplocampa', 'testudinea', 'apple sawfly', 'zaagwesp']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Spintmijt',
    'Panonychus ulmi',
    'mite',
    'both',
    'medium',
    'Bronzen bladeren - zuigschade',
    'Overwintert als winterei op het hout.',
    'Droog, warm weer bevordert populatieopbouw.',
    '>5 mijten/blad. Let op natuurlijke vijanden.',
    '[{"month": 5, "activity": "Zomereieren", "intensity": 50}, {"month": 6, "activity": "Populatieopbouw", "intensity": 70}, {"month": 7, "activity": "Piek mogelijk", "intensity": 100}, {"month": 8, "activity": "Hoog bij droogte", "intensity": 90}, {"month": 9, "activity": "Wintereieren", "intensity": 40}]'::jsonb,
    ARRAY['spint', 'appel', 'peer', 'mijt'],
    ARRAY['spintmijt', 'panonychus', 'ulmi', 'fruit tree red spider mite', 'spint', 'rode spintmijt']
);

-- ============================================
-- Peer Schimmels
-- ============================================
INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Perenschurft',
    'Venturia pyrina',
    'fungus',
    'pear',
    'critical',
    'Anders dan appelschurft - eigen aanpak nodig',
    'Overwintert in twijgschurft én afgevallen blad.',
    'Langere bladnatperiode nodig dan appelschurft. Andere RIM-waarden.',
    'Twijgschurft verwijderen in winter. Preventieve strategie.',
    '[{"month": 3, "activity": "Sporenrijping", "intensity": 40}, {"month": 4, "activity": "Primaire infecties", "intensity": 90}, {"month": 5, "activity": "Secundaire golf", "intensity": 100}, {"month": 6, "activity": "Verspreiding", "intensity": 70}, {"month": 7, "activity": "Actief", "intensity": 50}]'::jsonb,
    ARRAY['schurft', 'peer', 'schimmel'],
    ARRAY['perenschurft', 'venturia', 'pyrina', 'pear scab']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Stemphylium',
    'Stemphylium vesicarium',
    'fungus',
    'pear',
    'critical',
    'De moderne plaag - bruinrot en bladval',
    'Overwintert op dood organisch materiaal in boomgaard.',
    'Vochtig weer. Verhoogd risico na hagelschade of stress.',
    'Vroege detectie essentieel. Gecombineerde aanpak nodig.',
    '[{"month": 5, "activity": "Eerste infecties", "intensity": 60}, {"month": 6, "activity": "Bladinfecties", "intensity": 80}, {"month": 7, "activity": "Vruchtrot risico", "intensity": 100}, {"month": 8, "activity": "Piek zwartvruchtrot", "intensity": 100}, {"month": 9, "activity": "Tot oogst", "intensity": 70}]'::jsonb,
    ARRAY['stemphylium', 'peer', 'schimmel', 'bruinrot'],
    ARRAY['stemphylium', 'vesicarium', 'brown spot', 'zwartvruchtrot', 'perenbruinrot']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Vruchtboomkanker (Peer)',
    'Nectria galligena',
    'fungus',
    'pear',
    'high',
    'Ook Conference is gevoelig',
    'In kankerplekken op hout.',
    'Wonden en vochtig weer.',
    'Snoei aangetast hout. Behandel snoei- en oogstwonden.',
    '[{"month": 9, "activity": "Bladval infecties", "intensity": 70}, {"month": 10, "activity": "Herfst sporulatie", "intensity": 100}, {"month": 11, "activity": "Winter infecties", "intensity": 80}, {"month": 3, "activity": "Voorjaar", "intensity": 60}]'::jsonb,
    ARRAY['kanker', 'peer', 'schimmel', 'hout'],
    ARRAY['vruchtboomkanker', 'nectria', 'peer', 'kanker']
);

-- ============================================
-- Peer Insecten
-- ============================================
INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Perenbladvlo',
    'Cacopsylla pyri',
    'insect',
    'pear',
    'critical',
    'Dé uitdaging voor elke perenteler - honingdauw',
    'Wintervorm overwintert op peren en coniferen.',
    '3-5 generaties per jaar. Honingdauw veroorzaakt roetdauw.',
    'Monitoren vanaf maart. Drempelwaarde afhankelijk van predatoren.',
    '[{"month": 3, "activity": "Wintervorm actief", "intensity": 50}, {"month": 4, "activity": "1e generatie", "intensity": 70}, {"month": 5, "activity": "2e generatie", "intensity": 90}, {"month": 6, "activity": "Explosieve groei", "intensity": 100}, {"month": 7, "activity": "Maximum honingdauw", "intensity": 100}, {"month": 8, "activity": "3e/4e generatie", "intensity": 90}]'::jsonb,
    ARRAY['bladvlo', 'peer', 'insect'],
    ARRAY['perenbladvlo', 'cacopsylla', 'pyri', 'pear psylla', 'bladvlo', 'honingdauw']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Perenknopkever',
    'Anthonomus pyri',
    'insect',
    'pear',
    'medium',
    'Vreet knoppen uit in de winter',
    'Overwintert als adult onder schors en bladafval.',
    'Actief bij T>5°C in late winter. Vreet en legt eieren in knoppen.',
    'Klopvangsten in januari-februari. >5 kevers = ingrijpen.',
    '[{"month": 1, "activity": "Kevers actief bij zacht", "intensity": 40}, {"month": 2, "activity": "Knopvraat", "intensity": 80}, {"month": 3, "activity": "Eiafzet", "intensity": 100}, {"month": 4, "activity": "Larven in knop", "intensity": 70}]'::jsonb,
    ARRAY['knopkever', 'peer', 'insect', 'kever'],
    ARRAY['perenknopkever', 'anthonomus', 'pyri', 'pear bud weevil', 'knopkever']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Perenzaagwesp',
    'Hoplocampa brevis',
    'insect',
    'pear',
    'medium',
    'Vruchtval net na de bloei',
    'Larven overwinteren in de grond.',
    'Adulten vliegen tijdens bloei.',
    'Witte vangplaten in bloei. Vergelijkbaar met appelzaagwesp.',
    '[{"month": 4, "activity": "Verschijning adulten", "intensity": 70}, {"month": 5, "activity": "Eiafzet in bloem", "intensity": 100}, {"month": 6, "activity": "Larven vreten", "intensity": 80}]'::jsonb,
    ARRAY['zaagwesp', 'peer', 'insect'],
    ARRAY['perenzaagwesp', 'hoplocampa', 'brevis', 'pear sawfly', 'zaagwesp']
);

INSERT INTO pests_diseases (name, latin_name, type, crop, impact_level, subtitle, overwintering, infection_conditions, damage_threshold, lifecycle_timeline, tags, search_keywords) VALUES
(
    'Perengalmug',
    'Contarinia pyrivora',
    'insect',
    'pear',
    'medium',
    'Zwarte vruchtjes die niet groeien',
    'Larven overwinteren in cocon in de grond.',
    'Muggen leggen eieren in open bloemen.',
    'Inspectie tijdens bloei op aangetaste bloemen.',
    '[{"month": 4, "activity": "Muggen verschijnen", "intensity": 60}, {"month": 5, "activity": "Eiafzet in bloem", "intensity": 100}, {"month": 6, "activity": "Larven in vruchtje", "intensity": 80}, {"month": 7, "activity": "Zwarte vruchtjes vallen", "intensity": 50}]'::jsonb,
    ARRAY['galmug', 'peer', 'insect'],
    ARRAY['perengalmug', 'contarinia', 'pyrivora', 'pear midge', 'galmug', 'zwarte vruchtjes']
);

-- ============================================
-- View for easy filtering
-- ============================================
CREATE OR REPLACE VIEW v_pests_diseases_summary AS
SELECT
    id,
    name,
    latin_name,
    type,
    crop,
    impact_level,
    subtitle,
    hero_image_url,
    tags,
    created_at
FROM pests_diseases
ORDER BY
    CASE impact_level
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
    END,
    name;
