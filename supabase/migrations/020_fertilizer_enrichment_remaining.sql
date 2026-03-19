-- ============================================
-- MESTSTOFFEN VERRIJKING - RESTERENDE PRODUCTEN
-- ============================================
-- Vult description, formulation, density, dosage_fruit, application_timing aan
-- voor alle producten die in migratie 019 nog niet verrijkt waren.
-- Bronnen: officiële fabrikant-websites en technische datasheets.

-- =============================================
-- AGRITON / AGRO-VITAL PRODUCTEN
-- Bron: nutrientsandadjuvants.agriton.nl
-- =============================================

-- Calcium-Forte
UPDATE fertilizers SET
  description = 'Vloeibare calcium-bladmeststof tegen stip (bitter pit), verbetert vruchthardheid en -kleuring. Zonder minerale stikstof of chloride. Bevat aminozuur-gebaseerde hechter/uitvloeier.',
  formulation = 'SL',
  density = 1.32,
  composition = '{"CaO": 25, "Mn": 1.5, "Zn": 0.5}',
  dosage_fruit = '4-8 L/ha in 500 L water/ha',
  application_timing = 'Vanaf vruchtzetting tot oogst. Elke 8 dagen herhalen. Op droog gewas toepassen, 2 uur droogtijd.'
WHERE name = 'Calcium-Forte' OR id = 'fruit-calcium-forte';

-- Calin W
UPDATE fertilizers SET
  description = 'Speciale calcium-bladmeststof met unieke formulering voor zeer snelle opname door de bladcuticula. Extreem lage dosering vereist.',
  formulation = 'SL',
  dosage_fruit = '0.25 L/ha in 250-300 L water/ha',
  application_timing = 'Gedurende groeiseizoen, elke 2 weken herhalen. Fijne tot medium druppels op droog gewas. Combineer met Agro-Vital Guard als hechter.'
WHERE name = 'Calin W' OR id = 'fruit-calin-w';

-- Boron 15
UPDATE fertilizers SET
  description = 'Vloeibaar borium-bladmeststof op basis van boorzuur (Headland formulering). Snelle opname via blad én bodem, geschikt voor vroege toepassing.',
  formulation = 'SL',
  composition = '{"B": 15}',
  dosage_fruit = 'Preventief: 1.25 L/ha. Bij duidelijk gebrek: 2.5 L/ha. Herhaal bij ernstig tekort.',
  application_timing = 'Vanaf vroeg groeiseizoen. Bij voorkeur ochtend of avond toepassen. Combineer met Guard 2000 voor betere werking.'
WHERE name = 'Boron 15' OR id = 'fruit-boron-15';

-- Mag500
UPDATE fertilizers SET
  description = 'Gebruiksklare geconcentreerde magnesiumcarbonaat-suspensie. Zeer goede regenvastheid. Voor preventie/correctie van chronisch magnesiumgebrek.',
  formulation = 'SC',
  density = 1.45,
  composition = '{"MgO": 27}',
  dosage_fruit = 'Appel/peer: 2-3 L/ha per bespuiting, tot 3x na vruchtzetting met 3 weken interval. Max 4 L/ha per keer, 16 L/ha per seizoen.',
  application_timing = 'Na vruchtzetting. Bij voorkeur op bedauwd gewas in vroege ochtend. Niet bij felle zon/hoge temperatuur. Min 200 L water/ha.'
WHERE name = 'Mag500' OR id = 'fruit-mag500';

-- Bladkali TS
UPDATE fertilizers SET
  description = 'Speciale kalium-bladmeststof, niet-zout gebaseerd. Geen uitspoeling of vervluchtiging. Volledig gewas-veilig, geen verbrandingsrisico. Chloorvrij.',
  formulation = 'SL',
  composition = '{"K2O": 25, "SO3": 42}',
  dosage_fruit = '5-7 L/ha in 300-500 L water (appel: min 900 L water/ha). Meerdere toepassingen gedurende groeiseizoen.',
  application_timing = 'Gedurende groeiseizoen. Tankmixtolerant met fungiciden, insecticiden en herbiciden.'
WHERE name = 'Bladkali TS' OR id = 'fruit-bladkali-ts';

-- Mangaan 500
UPDATE fertilizers SET
  description = 'Klassieke mangaancarbonaat-suspensie voor bladbemesting. Trage maar langdurige werking. Stimuleert enzymsysteem, ondersteunt chlorofylontwikkeling en stikstofconversie.',
  formulation = 'SC',
  density = 1.50,
  composition = '{"Mn": 27}',
  dosage_fruit = '1 L/ha bij eerste gebreksverschijnselen of preventief. Wekelijks herhalen indien nodig.',
  application_timing = 'Vanaf 3-6 bladstadium. Min 200 L water/ha. Goed schudden voor gebruik.'
WHERE name = 'Mangaan 500' OR id = 'fruit-mangaan-500';

-- Zink FL
UPDATE fertilizers SET
  description = 'Zeer stabiele zinkoxide-formulering met dubbelfunctie: bladvoeding + fungistaat (onderdrukt schimmelspore-kieming).',
  formulation = 'SC',
  density = 1.60,
  composition = '{"Zn": 7}',
  dosage_fruit = '1-2 L/ha per bespuiting. Voldoende bladbedekking vereist.',
  application_timing = 'Vanaf 3-bladstadium gedurende groeiseizoen bij zinkbehoefte.'
WHERE name = 'Zink FL' OR id = 'fruit-zink-fl';

-- Koper FL
UPDATE fertilizers SET
  description = 'Stabiele koperoxychloride-suspensie met toegevoegde hechter voor superieure bladretentie. Voor kopergebrek bij hoge pH-bodems.',
  formulation = 'SC',
  composition = '{"Cu": 5}',
  dosage_fruit = 'Preventief: 0.25-0.5 L/ha, of 125 mL per 100 L water. In 200-400 L water/ha.',
  application_timing = 'Preventief vanaf 3-bladstadium. Voldoende bladontwikkeling vereist voor opname.'
WHERE name = 'Koper FL' OR id = 'fruit-koper-fl';

-- Hi-Phos (Foli-Phos)
UPDATE fertilizers SET
  description = 'Fosfaat-bladmeststof met kalium en magnesium. Stimuleert wortelgroei en vruchtzetting. Ook bekend als Foli-Phos.',
  formulation = 'SL',
  composition = '{"P2O5": 44, "K2O": 7.4, "MgO": 8}',
  dosage_fruit = '5 L/ha per bespuiting. Herhaal binnen 10 dagen. Min 200 L water/ha.',
  application_timing = 'Interval 10-14 dagen. Compatibel met de meeste gewasbeschermingsmiddelen. Vorstvrij bewaren.'
WHERE name = 'Hi-Phos' OR id = 'fruit-hi-phos';

-- =============================================
-- BMS MICRO-NUTRIENTS
-- Bron: chelal.com
-- =============================================

-- Chelal Ca (waarschijnlijk regionaal/historisch product, nauw verwant aan Omnical)
UPDATE fertilizers SET
  description = 'Vloeibaar calciumchelaat voor bladbemesting. Verwant aan Chelal Omnical. Voor calciumaanvulling en stippreventie.',
  formulation = 'SL',
  density = 1.25,
  dosage_fruit = '1-4 L/ha per bespuiting. Max concentratie 1%.',
  application_timing = 'Vanaf vruchtzetting tot vlak voor oogst. Laatste weken voor oogst voor vruchthardheid.'
WHERE name = 'Chelal Ca' OR id = 'fruit-chelal-ca';

-- Fosanit Cu (BMS)
UPDATE fertilizers SET
  description = 'NP-meststof met EDTA-gecheleerd koper. Oorspronkelijk voor granen, ook inzetbaar voor fruitteelt.',
  formulation = 'SL',
  composition = '{"P": 20, "Cu": 3}',
  dosage_fruit = '2-4 L/ha per bespuiting',
  application_timing = 'Gedurende groeiseizoen bij koper- en fosfaatbehoefte.'
WHERE name = 'Fosanit Cu' OR id = 'fruit-fosanit-cu';

-- =============================================
-- ALTINCO PRODUCTEN
-- Bron: altinco.com
-- =============================================

-- Selectyc X
UPDATE fertilizers SET
  description = 'Bladproduct met plantenextracten, Mn- en Zn-chelaten (EDTA), oppervlakteactieve stoffen en lysine-aminozuur. Reinigt bladoppervlak, verbetert fotosynthese.',
  formulation = 'SL',
  density = 1.17,
  composition = '{"Mn": 0.5, "Zn": 1.5}',
  dosage_fruit = 'Peer: 25-35 mL per 10 L water (250-350 mL/hl). Steenfruit: 20-30 mL per 10 L water.',
  application_timing = 'Vanaf bloembladval tot oogst. Elke 10-20 dagen herhalen. Mag tot op dag van oogst worden toegepast.'
WHERE name = 'Selectyc X' OR id = 'fruit-selectyc-x';

-- Alsupre S
UPDATE fertilizers SET
  description = 'Multifunctioneel zwavelproduct met systemische werking. Levert zwavel, stikstof en kalium. Verbetert eiwitstructuur, versterkt blad en wortels.',
  formulation = 'WG',
  composition = '{"SO3": 66, "N": 8.2, "K2O": 10.2}',
  dosage_fruit = 'Bladbespuiting: 50-100 g/hl (0.5-1.0 g/L). Bodem: 1-2 kg/ha.',
  application_timing = 'Fruitbomen: van na oogst tot voor bloei. Compatibel met de meeste gewasbeschermingsmiddelen en bladmeststoffen.'
WHERE name = 'Alsupre S' OR id = 'fruit-alsupre-s';

-- =============================================
-- AGRONUTRITION / DE SANGOSSE
-- Bron: agronutrition.com, desangosse.it
-- =============================================

-- Fertigofol Ultra
UPDATE fertilizers SET
  description = 'NPK-bladmeststof met 18 aminozuren en EDTA-gecheleerde sporenelementen. Verbetert voedingsstatus, activeert celmetabolisme, stimuleert fotosynthese en wortelopname.',
  formulation = 'SL',
  density = 1.20,
  composition = '{"N": 8.3, "P2O5": 3, "K2O": 7, "B": 0.41, "Cu": 0.11, "Fe": 0.20, "Mn": 0.41, "Mo": 0.004, "Zn": 0.33}',
  dosage_fruit = '3-5 L/ha voor fruitbomen. Algemeen: 1-3 L/ha.',
  application_timing = 'Tijdens perioden van abiotische stress. Via bladbespuiting.'
WHERE name = 'Fertigofol Ultra' OR id = 'fruit-fertigofol-ultra';

-- =============================================
-- AGRIFIRM (TopTrace Alimento)
-- Bron: agrifirm.nl, issuu brochures
-- =============================================

-- TopTrace Alimento Kalium
UPDATE fertilizers SET
  description = 'Vloeibare kaliumbladvoeding uit de 6-delige TopTrace Alimento lijn. Kant-en-klaar, minimaliseert mengfouten. Met stikstof, calcium en sporenelementen.',
  formulation = 'SL',
  density = 1.25,
  composition = '{"N": 6, "K2O": 19.6, "CaO": 5.2}',
  dosage_fruit = '5x 12 L/ha per bespuitingsronde in appel/peer.',
  application_timing = 'Vanaf begin juli, afwisselend met calciumtoepassingen tot oogst.'
WHERE name = 'TopTrace Alimento Kalium' OR id = 'fruit-alimento-k';

-- TopTrace Alimento Magnesium
UPDATE fertilizers SET
  description = 'Vloeibare magnesiumbladvoeding uit de TopTrace Alimento lijn. Met stikstof, kalium en sporenelementen.',
  formulation = 'SL',
  density = 1.20,
  composition = '{"N": 6, "MgO": 9.2, "K2O": 5.2}',
  dosage_fruit = 'Appel: 3x 8 L/ha + 3x 12 L/ha. Peer: 3x 8 L/ha + 3x 12 L/ha.',
  application_timing = 'Vanaf na bloei, doorlopend gedurende groeiseizoen.'
WHERE name ILIKE '%alimento Magnesium%' OR id = 'fruit-alimento-mg';

-- Top Mix Fruit
UPDATE fertilizers SET
  description = 'Samengestelde korrelmeststof specifiek voor fruitteelt. Drie formuleringen beschikbaar, afgestemd op bodemtype. Uniforme korrelgrootte voor gelijkmatig strooien.',
  formulation = 'Korrel',
  composition = '{"N": 10, "P2O5": 5, "K2O": 18, "MgO": 7}',
  dosage_fruit = '300-500 kg/ha afhankelijk van grondanalyse. In één werkgang toepasbaar.',
  application_timing = 'Vroeg voorjaar vóór start groeiseizoen.'
WHERE name = 'Top Mix Fruit' OR id = 'fruit-top-mix-fruit';

-- =============================================
-- GENERIEKE STROOIMESTSTOFFEN
-- Bronnen: triferto.eu, farmers4all.nl, royalbrinkman.nl
-- =============================================

-- Kalizout 60
UPDATE fertilizers SET
  description = 'Chloorhoudende kaliummeststof (kaliumchloride / KCl). 60% K2O. Universele kaliumbron. LET OP: bij voorkeur in herfst/winter toepassen zodat chloride uitspoelt vóór groeiseizoen.',
  formulation = 'Korrel',
  dosage_fruit = '150-300 kg/ha afhankelijk van K-status bodem. Bij voorkeur herfst/wintertoepassing.',
  application_timing = 'Late herfst tot winter (voor fruitteelt). Voorkomt chlorideschade aan chloordesgevoelige gewassen.'
WHERE name ILIKE '%Kalizout 60%' OR id = 'fruit-kalizout-60';

-- Kaliumsulfaat
UPDATE fertilizers SET
  description = 'Chloorarme kaliummeststof met zwavel. 50% K2O + 45% SO3. Geschikt voor chloordesgevoelige gewassen en voorjaarstoepassing.',
  formulation = 'Korrel',
  dosage_fruit = '150-300 kg/ha op basis van grondanalyse. Bijzonder waardevol op lichte/zandgronden waar ook zwavel tekort is.',
  application_timing = 'Vroeg voorjaar (kort voor groeiseizoen). Ook geschikt voor bijbemesting rond midzomer bij actief kaliumgebruik.'
WHERE name = 'Kaliumsulfaat' OR id = 'fruit-kaliumsulfaat';

-- Mengmest 12-10-18
UPDATE fertilizers SET
  description = 'Universele chloorarme NPK-samengestelde meststof met zwavel. Kalium volledig uit kaliumsulfaat. Breed inzetbaar in tuinbouw en fruitteelt.',
  formulation = 'Korrel',
  composition = '{"N": 12, "P2O5": 10, "K2O": 18, "SO3": 32}',
  dosage_fruit = '300-500 kg/ha afhankelijk van grondanalyse. 4-6 kg per fruitboom.',
  application_timing = 'Vroeg voorjaar vóór knopuitloop.'
WHERE name ILIKE '%Mengmest 12-10-18%' OR id = 'fruit-mengmest-12-10-18';

-- Multi Kmg (Haifa Multi-K Mg)
UPDATE fertilizers SET
  description = 'Kaliumnitraat verrijkt met magnesium. Voor basis-, bij- en overbemesting. Alle stikstof in nitraatvorm voor directe beschikbaarheid.',
  formulation = 'Korrel/prill',
  composition = '{"N": 12.5, "K2O": 44, "MgO": 1}',
  dosage_fruit = 'Dosering op basis van K- en N-behoefte uit grondanalyse. Als onderdeel van mengmestprogramma.',
  application_timing = 'Voorjaar als basisbemesting of gedurende seizoen als bijbemesting.'
WHERE name = 'Multi Kmg' OR id = 'fruit-multi-kmg';

-- Kalksalpeter (aanvulling met fruitteelt-specifieke dosering)
UPDATE fertilizers SET
  description = 'Snelwerkende calcium- en stikstofmeststof. Stikstof voornamelijk in nitraatvorm (directe beschikbaarheid, werkingsduur 0-3 weken). Versterkt celwanden, verbetert vruchthardheid en houdbaarheid.',
  formulation = 'Korrel/prill',
  composition = '{"N": 15.5, "CaO": 26.5}',
  dosage_fruit = 'Peer: 50-60 kg N/ha (320-390 kg product/ha). Appel: 40-50 kg N/ha (260-320 kg product/ha).',
  application_timing = 'Vroeg voorjaar bij knopzwelling. Calcium ook kritiek vlak voor oogst voor vruchtkwaliteit.'
WHERE (name ILIKE 'Kalksalpeter%' AND name NOT ILIKE '%YaraTera%') OR id = 'fruit-kalksalpeter';

-- =============================================
-- POWERLINE MESTSTOFFEN
-- Bron: powerlinemeststoffen.nl
-- =============================================

-- Powerleaf Molybdeen
UPDATE fertilizers SET
  description = 'Oplosbaar molybdeenpoeder voor bladbemesting. Essentieel voor stikstofmetabolisme (nitraatreductase-enzym). Biologisch toegelaten.',
  formulation = 'WP',
  composition = '{"Mo": 39.5}',
  dosage_fruit = '50 g/ha per bespuiting. Herhaalbaar elke 2-6 weken.',
  application_timing = 'Gedurende groeiseizoen bij behoefte. Gebrekrisico hoger op zure en ijzerrijke bodems. Mengbaar met andere bladmeststoffen.'
WHERE name = 'Powerleaf Molybdeen' OR id = 'fruit-powerleaf-molybdeen';

-- =============================================
-- U.S. BORAX
-- Bron: agriculture.borax.com
-- =============================================

-- Solubor
UPDATE fertilizers SET
  description = 'Hoogst geconcentreerde wateroplosbare boriumbemesting. 20.5% B als dinatriumoctaboraat-tetrahydraat. Vrij van onzuiverheden. Compatibel met herbiciden, fungiciden en insecticiden.',
  formulation = 'WG',
  composition = '{"B": 20.5}',
  dosage_fruit = 'Na oogst: 1-3.5 kg/ha (blad nog groen). Winterslaap: 3.5-5.5 kg/ha met winterolie. Voor bloei: 1-2.5 kg/ha. Bloembladval: 2.5 kg/ha.',
  application_timing = 'Na oogst (meest gebruikelijk), winterslaap, roze knop/bloei, of bloembladval. Borium is immobiel in plant, bladtoepassing richt zich op bloemknoppen.'
WHERE name = 'Solubor' OR id = 'fruit-solubor';

-- =============================================
-- YARA PRODUCTEN (aanvulling)
-- Bron: yara.nl
-- =============================================

-- YaraTera Calciumchloride Vloeibaar (aanvulling dosering fruitteelt)
UPDATE fertilizers SET
  dosage_fruit = 'Via fertigatie/waterdoseersysteem. 165 g CaO/L.',
  application_timing = 'Gedurende groeiseizoen via fertigatie voor continue calciumaanvoer.'
WHERE name = 'YaraTera Calciumchloride Vloeibaar' OR id = 'fruit-yaratera-cacl2';

-- =============================================
-- DOLOKAL (aanvulling)
-- =============================================
UPDATE fertilizers SET
  description = 'Dolomietse kalk-magnesium meststof voor pH-regulatie en calcium/magnesium aanvulling. 30% CaO + 18% MgO.',
  formulation = 'Korrel/poeder',
  dosage_fruit = '1000-3000 kg/ha afhankelijk van pH en bodemtype. Lichte grond: lagere dosering.',
  application_timing = 'Herfst of winter. pH-verhoging duurt 6-12 maanden. Niet combineren met stikstofmeststoffen (ammoniakverlies).'
WHERE name ILIKE 'Dolokal%' OR id = 'fruit-dolokal-manual';
