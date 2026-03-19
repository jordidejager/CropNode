-- ============================================
-- MESTSTOFFEN VERRIJKING - BATCH 3
-- ============================================
-- Verrijkt 12 veelgebruikte bladmeststoffen in de Nederlandse fruitteelt
-- die al in fertilizers-dump.json staan maar nog geen description,
-- formulation, density, dosage_fruit en application_timing hebben.
--
-- Producten: EPSO Combitop, EPSO Microtop, Wuxal Calcium, Wuxal Folibor,
-- Wuxal Top K, Wuxal Top N, Wuxal Suspensie Mangaan, YaraVita COPTREL 500,
-- YaraVita SENIPHOS, Stimuplant Multimix, Agroleaf Liquid Calcium+,
-- Powerleaf Mangaan Magnesium.
--
-- Bronnen: K+S, Aglukon/BASF, Certis Belchim, Yara UK, ICL, Van Iperen,
-- Mertens Groep productpagina's en technische datasheets.

-- =============================================
-- K+S (EPSO serie)
-- Bron: kpluss.com productpagina's
-- =============================================

-- EPSO Combitop
UPDATE fertilizers SET
  description = 'Wateroplosbaar magnesiumsulfaat met mangaan en zink voor bladbemesting. Voorkomt Mg-, Mn- en Zn-gebrek. Stimuleert fotosynthese en enzymactiviteit.',
  formulation = 'WSG',
  density = NULL,
  composition = '{"MgO": 14, "SO3": 34.5, "Mn": 4, "Zn": 1}',
  dosage_fruit = '10-15 kg/ha per bespuiting, 2-3x per seizoen in 300-500 L water/ha. Totaal 20-45 kg/ha/jaar.',
  application_timing = 'Voor bloei of na oogst, voordat blad vergelt. Meerdere toepassingen.'
WHERE id = '7d586a7e-4105-458d-8568-b5d397e60e20'
   OR name ILIKE '%EPSO Combitop%';

-- EPSO Microtop
UPDATE fertilizers SET
  description = 'Wateroplosbaar magnesiumsulfaat met borium en mangaan voor bladbemesting. Ondersteunt bloei, vruchtzetting en bladgroen.',
  formulation = 'WSG',
  density = NULL,
  composition = '{"MgO": 15, "SO3": 31, "B": 0.9, "Mn": 1}',
  dosage_fruit = '5-15 kg/ha per bespuiting, 2-3x per seizoen in 300-500 L water/ha. Totaal 10-30 kg/ha/jaar.',
  application_timing = 'Voor bloei voor borium-opbouw, en na vruchtzetting voor Mg-behoefte. Meerdere toepassingen.'
WHERE id = '7e4091bb-6fb9-4b04-aded-923e2e5c7537'
   OR name ILIKE '%EPSO Microtop%';

-- =============================================
-- WUXAL serie (Aglukon / Certis Belchim / Mertens)
-- Bronnen: aglukon.com, wuxal.com, mertens-groep.nl, certisbelchim.co.uk
-- =============================================

-- Wuxal Calcium
UPDATE fertilizers SET
  description = 'Vloeibare calcium-stikstof bladmeststof (SC) met sporenelementen. Voorkomt stip (bitter pit) bij appel, verbetert celwandsterkte en bewaarbaarheid.',
  formulation = 'SC',
  density = 1.50,
  composition = '{"N": 10, "CaO": 15, "MgO": 2, "B": 0.05, "Cu": 0.04, "Fe": 0.05, "Mn": 0.1, "Mo": 0.001, "Zn": 0.02}',
  dosage_fruit = '3-5 L/ha per bespuiting (0.3-0.5% concentratie) in 500-1000 L water/ha.',
  application_timing = 'Vanaf vruchtzetting tot 1 week voor oogst. Om de 14 dagen herhalen.'
WHERE id = 'f17cd07e-ec5b-4ab1-a850-fbd4658808d0'
   OR name ILIKE '%Wuxal%Calcium%';

-- Wuxal Folibor
UPDATE fertilizers SET
  description = 'Vloeibaar boriumcomplex (ethanolamine) voor veilige en efficiënte boriumbemesting. Verbetert bestuiving, pollenvorming en vruchtzetting.',
  formulation = 'SL',
  density = 1.35,
  composition = '{"B": 11}',
  dosage_fruit = 'Appel/peer: 0.1-0.2 L/ha per bespuiting. Druif: 0.1 L/ha. Verdund in 200-1000 L water/ha.',
  application_timing = 'Bij bloei en vruchtontwikkeling. Bij steenfruit 2-4 weken voor bloei (2 toepassingen). Borium wordt opgeslagen in bloemknoppen voor voorjaarsbeschikbaarheid.'
WHERE id = '555d5dab-34a8-4d3a-8258-bd0c85b11022'
   OR name ILIKE '%Wuxal%Folibor%';

-- Wuxal Top K
UPDATE fertilizers SET
  description = 'Vloeibare NPK-bladmeststof met nadruk op kalium en sporenelementen. Bevordert vruchtrijping, kleuring en suikervorming. Extreem gewas-veilig door super-chelatie.',
  formulation = 'SC',
  density = 1.55,
  composition = '{"N": 5, "P2O5": 8, "K2O": 12}',
  dosage_fruit = '5-10 L/ha per bespuiting (0.1-0.4% concentratie) in 300-500 L water/ha.',
  application_timing = 'Tijdens vruchtontwikkeling en rijping. pH-buffer (6-6.5) maakt combinatie met hard water mogelijk.'
WHERE id = '6b8269e2-cd65-4925-95c0-76d601099ee1'
   OR name ILIKE '%Wuxal%Top K%';

-- Wuxal Top N
UPDATE fertilizers SET
  description = 'Vloeibare NPK-bladmeststof met nadruk op stikstof en sporenelementen. Stimuleert bladgroei en fotosynthese. Laag biuret- en chloorgehalte.',
  formulation = 'SC',
  density = 1.55,
  composition = '{"N": 12, "P2O5": 4, "K2O": 6}',
  dosage_fruit = '5-10 L/ha per bespuiting (0.1-0.4% concentratie) in 300-500 L water/ha.',
  application_timing = 'Vroeg seizoen voor vegetatieve groei. Combineerbaar met gewasbeschermingsmiddelen door pH-buffering.'
WHERE id = 'b61e6719-a283-4460-819f-dc8f1d75a68c'
   OR name ILIKE '%Wuxal%Top N%';

-- Wuxal Suspensie Mangaan
UPDATE fertilizers SET
  description = 'Geconcentreerde mangaan-suspensie voor bladbemesting. Bestrijdt mangaangebrek, stimuleert enzymsysteem en voorkomt vroegtijdige bladveroudering.',
  formulation = 'SC',
  density = 1.60,
  composition = '{"Mn": 23.6}',
  dosage_fruit = '2.5 L/ha per bespuiting in 200-1000 L water/ha. Preventief: 1.5 L/ha. Herhalen bij aanhoudend gebrek.',
  application_timing = 'Vanaf begin groei bij mangaangebreksverschijnselen. Meerdere toepassingen met lagere dosering werken beter dan eenmalige hoge dosering.'
WHERE id = '6ed9d28a-690b-4017-ae09-10f38d60998f'
   OR name ILIKE '%Wuxal%Suspensie Mangaan%';

-- =============================================
-- YARA (YaraVita serie)
-- Bron: yara.co.uk productpagina's
-- =============================================

-- YaraVita COPTREL 500
UPDATE fertilizers SET
  description = 'Geconcentreerde vloeibare koper-suspensie (500 g/L Cu). 5x meer koper dan gangbare chelaten. Lage doseringen, snel opneembaar door het gewas.',
  formulation = 'SC',
  density = 1.52,
  composition = '{"Cu": 33}',
  dosage_fruit = 'Appel/peer/kers/pruim: 0.5 L/ha na oogst voor bladval, in 1000 L water/ha. Aardbei/framboos: 0.5 L/ha vroeg seizoen voor bloei, in 200-400 L water/ha.',
  application_timing = 'Na oogst voor bladval (pitfruit, steenfruit). NIET toepassen wanneer bloemen of vruchten aan de boom zitten.'
WHERE id = 'fe7c6650-71a7-44f0-bd7b-b40fc314db64'
   OR name ILIKE '%COPTREL 500%';

-- YaraVita SENIPHOS
UPDATE fertilizers SET
  description = 'Vloeibare fosfaat-calcium bladmeststof. Versterkt celwanden, verbetert vruchtkwaliteit, stevigheid en bewaarbaarheid. Vermindert schilgebreken en bevordert roodkleuring.',
  formulation = 'SL',
  density = 1.28,
  composition = '{"N": 3, "P2O5": 24, "CaO": 3.1}',
  dosage_fruit = 'Appel/peer: 10 L/ha per bespuiting, 5-8 toepassingen om de 10-14 dagen vanaf bloembladval. In 500-1000 L water/ha. Voor roodkleuring: 10 L/ha, 2-3 weken voor oogst.',
  application_timing = 'Vanaf bloembladval tot vlak voor oogst. Intervallen van 10-14 dagen. Extra toepassing voor kleuring 2-3 weken voor oogst.'
WHERE id = '8052f269-81a1-4507-8a07-2c2e4b4283fe'
   OR name ILIKE '%SENIPHOS%';

-- =============================================
-- VAN IPEREN
-- Bron: iperen.com, powerlinemeststoffen.nl, stimuline.nl
-- =============================================

-- Stimuplant Multimix
UPDATE fertilizers SET
  description = 'NPK-bladmeststof met sporenelementen (chelaat), aminozuren en zeewierextract (Ascophyllum nodosum). Breed inzetbaar, vermindert stress bij hitte, droogte en gewasbeschermingstoepassingen.',
  formulation = 'SL',
  density = 1.17,
  composition = '{"N": 7.5, "P2O5": 4.5, "K2O": 4.5, "B": 0.02, "Cu": 0.01, "Fe": 0.05, "Mn": 0.05, "Zn": 0.02, "Mo": 0.005}',
  dosage_fruit = '2.5-5 L/ha per bespuiting. Combineerbaar met fungiciden.',
  application_timing = 'Gedurende hele groeiseizoen. Bij stressmomenten (hitte, droogte, groeipieken, na chemische bespuiting).'
WHERE id = '2415a5c9-6abe-4860-8e78-b09df6cb64dd'
   OR name ILIKE '%Stimuplant Multimix%';

-- Powerleaf Mangaan Magnesium
UPDATE fertilizers SET
  description = 'Vloeibare bladmeststof met mangaan, magnesium en stikstof. Houdt gewas vitaal, bestrijdt mangaangebrek en ondersteunt fotosynthese.',
  formulation = 'SL',
  density = 1.38,
  composition = '{"N": 8, "MgO": 8, "Mn": 3}',
  dosage_fruit = '5 L/ha per bespuiting. Meerdere toepassingen mogelijk gedurende seizoen.',
  application_timing = 'Gedurende groeiseizoen wanneer voldoende stikstof beschikbaar is. Belangrijk rond bloei voor vruchtgroei.'
WHERE id = '85dbf50d-7e02-4f8f-89a3-577ed20c1c52'
   OR name ILIKE '%Powerleaf Mangaan Magnesium%';

-- =============================================
-- ICL (Agroleaf Liquid serie)
-- Bron: icl-growingsolutions.com
-- =============================================

-- Agroleaf Liquid Calcium+
UPDATE fertilizers SET
  description = 'Vloeibare calcium-bladmeststof met aminozuren (glycine, glutaminezuur, L-arginine) en F3 SurfActive Technology. Vermindert stip tot 63% bij appel. Verbetert celwanden en bewaarbaarheid.',
  formulation = 'SL',
  density = 1.30,
  composition = '{"N": 8, "CaO": 13.8}',
  dosage_fruit = '3-10 L/ha per bespuiting in 200-600 L water/ha.',
  application_timing = 'Vanaf vruchtzetting tot enkele weken voor oogst. Bij sterke groei, voor en na bloei.'
WHERE id = '310e762d-a10d-4d62-82e2-ce9ddfbaf136'
   OR name ILIKE '%Agroleaf Liquid%Calcium%';

-- =============================================
-- ALIASSEN voor nieuwe producten
-- =============================================
INSERT INTO fertilizer_aliases (alias, official_name) VALUES
  ('epso combitop', 'EPSO Combitop®'),
  ('combitop', 'EPSO Combitop®'),
  ('epso microtop', 'EPSO Microtop®'),
  ('microtop', 'EPSO Microtop®'),
  ('wuxal calcium', 'Wuxal® Calcium'),
  ('wuxal folibor', 'Wuxal® Folibor'),
  ('folibor', 'Wuxal® Folibor'),
  ('wuxal top k', 'Wuxal® Top K'),
  ('wuxal top n', 'Wuxal® Top N'),
  ('wuxal suspensie mangaan', 'Wuxal® Suspensie Mangaan'),
  ('wuxal mangaan suspensie', 'Wuxal® Suspensie Mangaan'),
  ('coptrel', 'YaraVita COPTREL 500'),
  ('coptrel 500', 'YaraVita COPTREL 500'),
  ('yaravita coptrel', 'YaraVita COPTREL 500'),
  ('seniphos', 'YaraVita SENIPHOS'),
  ('yaravita seniphos', 'YaraVita SENIPHOS'),
  ('stimuplant multimix', 'Stimuplant Multimix'),
  ('multimix', 'Stimuplant Multimix'),
  ('powerleaf mangaan magnesium', 'Powerleaf Mangaan Magnesium'),
  ('powerleaf mn mg', 'Powerleaf Mangaan Magnesium'),
  ('agroleaf liquid calcium', 'Agroleaf Liquid - Calcium + - 8-0-0+13.8CaO'),
  ('agroleaf calcium liquid', 'Agroleaf Liquid - Calcium + - 8-0-0+13.8CaO'),
  ('agroleaf calcium+', 'Agroleaf Liquid - Calcium + - 8-0-0+13.8CaO')
ON CONFLICT (alias) DO NOTHING;
