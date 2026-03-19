-- ============================================
-- MESTSTOFFEN DATABASE VERRIJKING
-- ============================================
-- Voegt extra kolommen toe aan fertilizers tabel:
-- - description: korte productomschrijving
-- - formulation: productformulering (SL, WG, SC, WSG, etc.)
-- - density: soortelijk gewicht in kg/L (voor vloeistoffen)
-- - dosage_fruit: aanbevolen dosering voor fruitteelt
-- - application_timing: wanneer toepassen in fruitteelt
--
-- Verrijkt bestaande EN nieuwe producten met geverifieerde fabrikantdata.

-- =============================================
-- STAP 1: Extra kolommen toevoegen
-- =============================================
ALTER TABLE fertilizers
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS formulation TEXT,
ADD COLUMN IF NOT EXISTS density DECIMAL(4,2),
ADD COLUMN IF NOT EXISTS dosage_fruit TEXT,
ADD COLUMN IF NOT EXISTS application_timing TEXT;

-- =============================================
-- STAP 2: VERRIJKING VAN PRODUCTEN UIT DUMP (fertilizers-dump.json)
-- Alleen geverifieerde fabrikantdata, exacte productnamen.
-- =============================================

-- === BMS MICRO-NUTRIENTS (Chelal serie) ===
-- Bron: chelal.com technische fiches + SDS documenten

UPDATE fertilizers SET
  description = 'Vloeibare calciumchelaat (DTPA) voor bladbemesting. Vermindert stip bij appel en verbetert vruchthardheid.',
  formulation = 'SL',
  density = 1.25,
  composition = '{"CaO": 8.1}',
  dosage_fruit = '1-4 L/ha per bespuiting',
  application_timing = 'Vanaf bloembladval tot vlak voor oogst. Laatste weken voor oogst voor vruchthardheid.'
WHERE name = 'Chelal Omnical' OR id = 'fruit-chelal-omnical';

UPDATE fertilizers SET
  description = 'Volledig gecheleerd sporenelementen-complex met zeewierextract (Ascophyllum nodosum). Biologisch toegelaten.',
  formulation = 'SL',
  composition = '{"K": 2.5, "Mo": 0.2, "Zn": 1.8}',
  dosage_fruit = '1-4 L/ha per bespuiting',
  application_timing = 'Gedurende hele groeiseizoen. Combineerbaar met Chelal B, Kappa V of Chelal Omnical.'
WHERE name = 'Chelal AZ' OR id = 'fruit-chelal-az';

UPDATE fertilizers SET
  description = 'Vloeibaar borium als boorzuur en polyolen. Essentieel voor bloei en vruchtzetting. Biologisch toegelaten.',
  formulation = 'SL',
  composition = '{"B": 8.0}',
  dosage_fruit = '1-2 L/ha per bespuiting (max 4 L/ha/jaar)',
  application_timing = 'Voor en tijdens bloei voor bestuiving en vruchtzetting.'
WHERE name = 'Chelal B' OR id = 'fruit-chelal-b';

UPDATE fertilizers SET
  description = 'Gecombineerd borium + zink chelaat voor optimale vruchtzetting.',
  formulation = 'SL',
  composition = '{"B": 5.3, "Zn": 2.3}',
  dosage_fruit = '1-4 L/ha per bespuiting',
  application_timing = 'Voor en tijdens bloei voor optimale vruchtzetting.'
WHERE name = 'Chelal BZn' OR id = 'fruit-chelal-bzn';

UPDATE fertilizers SET
  description = 'Vloeibaar ijzerchelaat (DTPA/EDTA/HEEDTA). Voor blad- en bodemtoepassing. Biologisch toegelaten.',
  formulation = 'SL',
  composition = '{"Fe": 5.2}',
  dosage_fruit = '1-4 L/ha per bespuiting. Max concentratie 0.3%.',
  application_timing = 'Vroeg seizoen. Combineerbaar met Chelal RD voor peren.'
WHERE name = 'Chelal Fe' OR id = 'fruit-chelal-fe';

UPDATE fertilizers SET
  description = 'Volledig gecheleerd mangaan (DTPA/EDTA/HEEDTA) voor optimale bladopname.',
  formulation = 'SL',
  composition = '{"Mn": 6.6}',
  dosage_fruit = '1-4 L/ha per bespuiting',
  application_timing = 'Gedurende groeiseizoen bij mangaangebrek.'
WHERE name ILIKE 'Chelal Mn%' OR id = 'fruit-chelal-mn';

UPDATE fertilizers SET
  description = 'Gecheleerd magnesium (DTPA/EDTA/HEEDTA). Belangrijk bij Golden Delicious (gevoelig voor Mg-gebrek).',
  formulation = 'SL',
  composition = '{"MgO": 5.3}',
  dosage_fruit = '1-4 L/ha per bespuiting. Max concentratie 0.5%.',
  application_timing = 'Gedurende groeiseizoen. Controleer Mg-balans voor toepassing Chelal Omnical.'
WHERE name ILIKE 'Chelal Mg%' OR id = 'fruit-chelal-mg';

UPDATE fertilizers SET
  description = 'Koperchelaat (EDTA 6%, DTPA, HEEDTA). 100 g Cu/L. Biologisch toegelaten. LET OP: niet gebruiken op steenfruit.',
  formulation = 'SL',
  density = 1.32,
  composition = '{"Cu": 7.6}',
  dosage_fruit = '1-4 L/ha per bespuiting. Max concentratie 2%.',
  application_timing = 'Gedurende groeiseizoen. NIET op steenfruit (kersen, pruimen).'
WHERE name = 'Chelal Cu' OR id = 'fruit-chelal-cu';

UPDATE fertilizers SET
  description = 'Biostimulant met zeewierextract (150 g/L Ascophyllum nodosum) + gecheleerde sporenelementen.',
  formulation = 'SL',
  composition = '{"B": 0.5, "Fe": 0.8, "Mn": 0.8, "Mo": 0.08, "Zn": 0.8}',
  dosage_fruit = '1-4 L/ha per bespuiting. Max concentratie 0.3%.',
  application_timing = 'Gedurende groeiseizoen. Stimuleert en reguleert gewasontwikkeling.'
WHERE name = 'Fructol Bio' OR id = 'fruit-fructol-bio';

UPDATE fertilizers SET
  description = 'PK-meststof met gecheleerd zink. Stimuleert jeugdgroei, vruchtzetting en rijping. Verbetert vruchtkleur.',
  formulation = 'SL',
  composition = '{"P": 9.1, "K": 20, "Zn": 1.6}',
  dosage_fruit = '1-4 L/ha per bespuiting. Max concentratie 0.5%.',
  application_timing = 'Gedurende groeiseizoen. Verbetert vruchtuniformiteit en kleuring.'
WHERE name = 'Landamine Zn' OR id = 'fruit-landamine-zn';

-- === YARA (YaraVita / YaraTera serie) ===
-- Bron: yara.nl, yara.co.uk, yara.ie, yara.co.nz product pages

UPDATE fertilizers SET
  description = 'Vloeibaar borium (borium-ethanolamine). 150 g B/L. Geen sedimentatie.',
  formulation = 'SL',
  composition = '{"B": 15, "N": 6.5}',
  dosage_fruit = '1-2 L/ha bij roze knop, begin bloei, en bij bloembladval. 2 L/ha na oogst voor bladverkleuring.',
  application_timing = 'Roze knop → bloei → bloembladval. Na oogst voor bladverkleuring.'
WHERE name ILIKE '%BORTRAC%';

UPDATE fertilizers SET
  description = 'Hooggeconcentreerd zinkoxide in suspensie. 700 g Zn/L. Chloorvrij.',
  formulation = 'SC',
  density = 1.73,
  composition = '{"Zn": 39.5}',
  dosage_fruit = '1-2 L/ha bij knopuitloop en einde bloei (niet tijdens bloei). 1-2 L/ha na oogst.',
  application_timing = 'Knopuitloop en einde bloei. Niet tijdens bloei. Na oogst voor bladverkleuring.'
WHERE name ILIKE '%ZINTRAC%';

UPDATE fertilizers SET
  description = 'Hooggeconcentreerd mangaanoxide in suspensie. 500 g Mn/L. Chloorvrij.',
  formulation = 'SC',
  composition = '{"Mn": 50, "N": 6.9}',
  dosage_fruit = '1 L/ha voor bloei (bij ernstig tekort), anders bij bloembladval. Herhaal na 10-14 dagen.',
  application_timing = 'Voor bloei bij ernstig tekort. Bij bloembladval, herhalen na 10-14 dagen.'
WHERE name ILIKE '%MANTRAC%';

UPDATE fertilizers SET
  description = 'Speciaal voor fruitteelt: B (stuifmeel), Zn (celdeling), Mg (groei), P (wortel), Ca (vruchtkwaliteit). Bevat zeewierextract.',
  formulation = 'SC',
  composition = '{"N": 4.3, "P": 15, "CaO": 17.5, "MgO": 6.3, "B": 1.3, "Zn": 2.5}',
  dosage_fruit = 'Tot 5 L/ha bij knopuitloop. Dan 2-5x tot 5 L/ha vanaf vruchtzetting (20mm) met 10-14 dagen interval.',
  application_timing = 'Knopuitloop → vruchtzetting → 30 dagen voor oogst stoppen.'
WHERE name ILIKE '%FRUTREL%';

UPDATE fertilizers SET
  description = 'IJzer-EDDHA chelaat voor BODEMtoepassing. 54 g Fe/L. Stabiel pH 4-10. Breekt af in zonlicht.',
  formulation = 'SL',
  composition = '{"Fe": 5.4}',
  category = 'Soil',
  dosage_fruit = 'Licht tekort: 10 L/ha. Matig: 20 L/ha. Ernstig: 40 L/ha. Fertigatie: 3-4 L/ha per week.',
  application_timing = 'Op zwartstrook voor start groeiseizoen (vlak voor bloei) OF in augustus bij actieve wortelgroei.'
WHERE name ILIKE '%FERRITRAC%';

UPDATE fertilizers SET
  description = 'Vloeibaar calciumchloride tuinbouwkwaliteit. 165 g CaO/L.',
  formulation = 'SL',
  composition = '{"CaO": 16.5}',
  dosage_fruit = 'Via fertigatie/waterdoseersysteem.',
  application_timing = 'Gedurende groeiseizoen via fertigatie.'
WHERE name ILIKE '%Calciumchloride Vloeibaar%' OR id = 'fruit-yaratera-cacl2';

UPDATE fertilizers SET
  description = 'Volledig wateroplosbare calciumnitraat prill. RHP gecertificeerd.',
  formulation = 'WSG',
  density = 1.10,
  composition = '{"N": 15.5, "CaO": 26.3}',
  dosage_fruit = 'Via fertigatie als calcium- en stikstofbron.',
  application_timing = 'Gedurende groeiseizoen via fertigatie/druppelirrigatie.'
WHERE name ILIKE '%CALCINIT%';

-- === ICL (Agroleaf Power serie) ===
-- Bron: icl-growingsolutions.com

UPDATE fertilizers SET
  description = 'Wateroplosbaar granulaat 11-5-19+9CaO+2.5MgO+TE met DPI technologie.',
  formulation = 'WSG',
  density = 1.05,
  composition = '{"N": 11, "P": 5, "K": 19, "CaO": 9, "MgO": 2.5, "B": 0.04, "Cu": 0.03, "Fe": 0.25, "Mn": 0.13, "Mo": 0.002, "Zn": 0.03}',
  dosage_fruit = '3-5 kg in 200-600 L water/ha',
  application_timing = 'Gedurende groeiseizoen voor calcium-aanvulling.'
WHERE name = 'Agroleaf Power Calcium' OR id = 'fruit-agroleaf-calcium';

UPDATE fertilizers SET
  description = 'Wateroplosbaar granulaat 10-5-10+16MgO+32SO3+TE.',
  formulation = 'WSG',
  density = 1.05,
  composition = '{"N": 10, "P": 5, "K": 10, "MgO": 16, "SO3": 32, "Fe": 0.14, "Mn": 0.25, "B": 0.25, "Cu": 0.70, "Mo": 0.001, "Zn": 0.07}',
  dosage_fruit = '3-5 kg in 200-600 L water/ha',
  application_timing = 'Bij magnesiumgebrek gedurende groeiseizoen.'
WHERE name = 'Agroleaf Power Magnesium' OR id = 'fruit-agroleaf-mg';

UPDATE fertilizers SET
  description = 'Wateroplosbaar granulaat 20-20-20+TE. Uitgebalanceerde NPK bladvoeding.',
  formulation = 'WSG',
  composition = '{"N": 20, "P": 20, "K": 20, "Fe": 0.14, "Mn": 0.07, "B": 0.03, "Cu": 0.07, "Mo": 0.001, "Zn": 0.07}',
  dosage_fruit = '3-5 kg in 200-600 L water/ha',
  application_timing = 'Gedurende groeiseizoen als complete bladvoeding.'
WHERE name = 'Agroleaf Power Total' OR id = 'fruit-agroleaf-total';

UPDATE fertilizers SET
  description = 'Wateroplosbaar granulaat 31-11-11+TE. Hoog stikstof voor vegetatieve groei.',
  formulation = 'WSG',
  density = 1.05,
  composition = '{"N": 31, "P": 11, "K": 11, "B": 0.03, "Cu": 0.07, "Fe": 0.14, "Mn": 0.07, "Mo": 0.001, "Zn": 0.07}',
  dosage_fruit = '3-5 kg in 200-600 L water/ha',
  application_timing = 'Vroeg seizoen voor vegetatieve groei.'
WHERE name = 'Agroleaf Power High N' OR id = 'fruit-agroleaf-high-n';

-- === POWERLINE MESTSTOFFEN ===
-- Bron: powerlinemeststoffen.nl

UPDATE fertilizers SET
  description = 'Vloeibaar borium. 11% B. Biologisch toegelaten.',
  formulation = 'SL',
  density = 1.36,
  composition = '{"B": 11}',
  dosage_fruit = '1-2 L/ha vanaf roze knop tot vroege bloei, herhaal bij bloembladval. 2 L/ha na oogst.',
  application_timing = 'Roze knop → bloei → bloembladval. Na oogst voor bladverkleuring.'
WHERE name = 'Powerleaf Borium' OR id = 'fruit-powerleaf-borium-manual';

UPDATE fertilizers SET
  description = 'Vloeibaar zink. 6% Zn (80 g/L). Biologisch toegelaten.',
  formulation = 'SL',
  density = 1.30,
  composition = '{"Zn": 6}',
  dosage_fruit = '1-3 L/ha',
  application_timing = 'Gedurende groeiseizoen bij zinktekort.'
WHERE name = 'Powerleaf Zink' OR id = 'fruit-powerleaf-zink-manual';

UPDATE fertilizers SET
  description = 'Mangaan suspensie met stikstof en zwavel. 19.3% Mn.',
  formulation = 'SC',
  density = 1.63,
  composition = '{"N": 4, "SO3": 5, "Mn": 19.3, "Zn": 0.07}',
  dosage_fruit = '0.5 L/ha per bespuiting',
  application_timing = 'Gedurende groeiseizoen bij mangaangebrek in hardfruit.'
WHERE name = 'Powerleaf Mangaan Plus' OR id = 'fruit-powerleaf-mn';

UPDATE fertilizers SET
  description = 'Vloeibare zwavelsuspensie. 800 g S/L. Biologisch toegelaten.',
  formulation = 'SC',
  density = 1.43,
  composition = '{"S": 56}',
  dosage_fruit = '2-5 L/ha',
  application_timing = 'Gedurende groeiseizoen als zwavelvoeding en schimmelwerend.'
WHERE name = 'Powerleaf Zwavel' OR id = 'fruit-powerleaf-zwavel-manual';

UPDATE fertilizers SET
  description = 'Koper + zwavel combinatie in suspensie. 3.65% Cu + 47% S.',
  formulation = 'SC',
  density = 1.42,
  composition = '{"Cu": 3.65, "S": 47}',
  dosage_fruit = '2.5-4 L/ha',
  application_timing = 'Gedurende groeiseizoen.'
WHERE name = 'Powerleaf Koper Zwavel' OR id = 'fruit-powerleaf-koper-zwavel';

UPDATE fertilizers SET
  description = 'Vloeibaar fosfaat met kalium en magnesium. 29.5% P2O5. Bijna 100% bladopname.',
  formulation = 'SL',
  density = 1.49,
  composition = '{"P": 12.9, "K": 4.2, "MgO": 6.7}',
  dosage_fruit = '5 L/ha',
  application_timing = 'Gedurende groeiseizoen bij fosfaatbehoefte.'
WHERE name = 'Powerleaf Fosfaat' OR id = 'fruit-powerleaf-fosfaat-manual';

UPDATE fertilizers SET
  description = 'Vloeibaar kalium met zwavel, aminozuren en zeewierextract. 22% K2O + 32% SO3.',
  formulation = 'SL',
  density = 1.42,
  composition = '{"K": 18.3, "SO3": 32}',
  dosage_fruit = 'Wekelijks 2.5 L/ha of tweewekelijks 5 L/ha (max 15 L/ha/seizoen)',
  application_timing = 'Vanaf begin vrucht-/knolgroei. Appel, peer.'
WHERE name ILIKE 'Powerleaf Kali%' OR id = 'fruit-powerleaf-kali';

-- === AFEPASA / VAN WESEMAEL ===
UPDATE fertilizers SET
  description = 'Micronized zwavel 80% w/w in wateroplosbaar granulaat. Contactfungicide/acaricide + zwavelvoeding.',
  formulation = 'WG',
  composition = '{"S": 80}',
  dosage_fruit = '2-5 kg/ha voor fruitteelt',
  application_timing = 'Effectief tussen 18-30°C. Niet toepassen binnen 10 dagen na paraffineolie.'
WHERE name = 'Super Sulfo WG 800' OR id = 'fruit-super-sulfo-wg800';

-- === K+S (EPSO Top / Bittersalz) ===
-- Bron: kpluss.com

UPDATE fertilizers SET
  description = 'Magnesiumsulfaat-heptahydraat kristallen. 16% MgO + 32.5% SO3. Volledig wateroplosbaar. Biologisch toegelaten.',
  formulation = 'Kristal (wateroplosbaar)',
  composition = '{"MgO": 16, "SO3": 32.5}',
  dosage_fruit = 'Latent tekort: 10-25 kg/ha (5% oplossing). Ernstig: tot 50 kg/ha verdeeld over 2-5 bespuitingen.',
  application_timing = 'Gedurende groeiseizoen bij magnesiumgebrek.'
WHERE name ILIKE '%EPSO Top%';

UPDATE fertilizers SET
  description = 'Magnesiumsulfaat (Bittersalz/Bitterzout). 16% MgO + 32% SO3. Volledig wateroplosbaar.',
  formulation = 'Kristal (wateroplosbaar)',
  composition = '{"MgO": 16, "SO3": 32}',
  dosage_fruit = '10-25 kg/ha in 5% oplossing. Bij ernstig tekort tot 50 kg/ha.',
  application_timing = 'Gedurende groeiseizoen bij magnesiumgebrek.'
WHERE name = 'Bittersalz' OR id = 'fruit-bittersalz';

-- Bitterzout varianten uit dump
UPDATE fertilizers SET
  description = 'Bitterzout (magnesiumsulfaat) 37%. Bladmeststof voor magnesiumaanvulling.',
  formulation = 'Vloeibaar',
  composition = '{"MgO": 10, "SO3": 13}'
WHERE name = 'Bitterzout 37%';

UPDATE fertilizers SET
  description = 'Bitterzout (magnesiumsulfaat) 43%.',
  formulation = 'Vloeibaar',
  composition = '{"MgO": 11.5, "SO3": 15}'
WHERE name = 'Bitterzout 43%';

UPDATE fertilizers SET
  description = 'Bitterzout (magnesiumsulfaat) 50%.',
  formulation = 'Vloeibaar',
  composition = '{"MgO": 13, "SO3": 18}'
WHERE name = 'Bitterzout 50%';

-- === AGRITON / AGRO-VITAL ===
-- Bron: nutrientsandadjuvants.agriton.nl

UPDATE fertilizers SET
  description = 'Vloeibaar calcium (chelaatvorm, floeemmobiel) + borium tegen stip in appels.',
  formulation = 'SL',
  composition = '{"CaO": 11.2, "B": 0.5}',
  dosage_fruit = 'Elke 7-10 dagen toepassen in minimaal 500-750 L water/ha.',
  application_timing = 'Vanaf vruchtzetting tot oogst tegen stip (bitter pit).'
WHERE name = 'CalciMax' OR id = 'fruit-calcimax';

-- === WUXAL (Aglukon/BASF) ===
-- Bron: oxygen-agro.gr (distributeur), mertens-groep.nl
-- Let op: Wuxal Super 8-8-6 is het hoofdproduct

UPDATE fertilizers SET
  description = 'Vloeibare NPK suspensie 8-8-6+MgO+sporenelementen (EDTA gecheleerd).',
  formulation = 'SC',
  density = 1.24,
  composition = '{"N": 8, "P": 8, "K": 6, "MgO": 1.4, "B": 0.01, "Cu": 0.004, "Fe": 0.02, "Mn": 0.012, "Mo": 0.001, "Zn": 0.004}'
WHERE name ILIKE '%Wuxal%Super%';

UPDATE fertilizers SET
  description = 'Wuxal Mangaan+Boor suspensie voor bladbemesting.',
  formulation = 'SC',
  density = 1.24
WHERE name = 'Wuxal Mangaan+Boor' OR id = 'fruit-wuxal-mn-b';

-- === ACS-KOPER 500 ===
-- Bron: mertens-groep.nl, agrocentrum.nl

UPDATE fertilizers SET
  description = 'Koperoxychloride 500 g/kg. Poeder voor bladbemesting. Biologisch toegelaten. Nevenwerking tegen schurft en vruchtboomkanker.',
  formulation = 'WP',
  unit = 'kg',
  composition = '{"Cu": 50}',
  manufacturer = 'Lebosol / ACS'
WHERE name = 'ACS-Koper 500' OR id = 'fruit-acs-koper-500';

-- === OVERIGE PRODUCTEN UIT MIGRATIE 018 ===

UPDATE fertilizers SET
  description = 'IJzerchelaat 6% Fe. 90% DTPA + 10% EDDHA. Natriumvrij.',
  formulation = 'WG'
WHERE name = 'FerroPlus' OR id = 'fruit-ferroplus';

UPDATE fertilizers SET
  description = 'IJzer-EDDHA chelaat 6% Fe (4.8% o-o isomeer). Premium ijzerchelaat.',
  formulation = 'WG'
WHERE name = 'Ferrilene' OR id = 'fruit-ferrilene';

UPDATE fertilizers SET
  description = 'IJzer-EDDHA chelaat 6% Fe (4.2% o-o isomeer).',
  formulation = 'WG'
WHERE name = 'UltraFerro' OR id = 'fruit-ultraferro';

UPDATE fertilizers SET
  description = 'IJzer-EDDHA chelaat voor bodemtoepassing.',
  formulation = 'WG'
WHERE name = 'SIDERO' OR id = 'fruit-sidero';

UPDATE fertilizers SET
  description = 'Hoogwaardige vloeibare ijzerformulering voor bodemtoepassing.',
  formulation = 'SL'
WHERE name = 'Ferro-Terra Liquid' OR id = 'fruit-ferro-terra';

-- Patentkali (K+S)
UPDATE fertilizers SET
  description = 'Chloorarme kaliummeststof met magnesium en zwavel. 30% K2O + 10% MgO + 42% SO3.',
  formulation = 'Korrel'
WHERE name ILIKE 'Patentkali%' OR id = 'fruit-patentkali-manual';

-- Dolokal varianten
UPDATE fertilizers SET
  description = 'Dolomietse kalk-magnesium meststof voor pH-regulatie en calcium/magnesium aanvulling.',
  formulation = 'Korrel/poeder'
WHERE name ILIKE 'Dolokal%' OR id = 'fruit-dolokal-manual';

-- Copfall
UPDATE fertilizers SET
  description = 'Koper-bladmeststof die bladval in het najaar versnelt/verkort.',
  formulation = 'SL'
WHERE name = 'Copfall' OR id = 'fruit-copfall-manual';

-- Van Iperen producten
UPDATE fertilizers SET
  description = 'Vloeibare EDTA-gecheleerde sporenelementen mix. B, Mo, Zn, Fe, Cu, Mn. Natriumvrij.',
  formulation = 'SL',
  dosage_fruit = '0.5-1.0 L/ha per bespuiting',
  application_timing = 'Gedurende groeiseizoen als sporenelementenaanvulling.'
WHERE name ILIKE '%Hortispoor Mix%' OR id = 'fruit-hortispoor-mix';

UPDATE fertilizers SET
  description = 'Gecheleerde sporenelementen + zeewierextract. B, Cu, Mo, Mn, Zn. Verbetert stresstolerantie.',
  formulation = 'SL',
  application_timing = 'Gedurende groeiseizoen. Zeewiercomponent verbetert vruchtzetting, vorst- en droogtetolerantie.'
WHERE name ILIKE 'Stimuplant Vitaal%' OR id = 'fruit-stimuplant-vitaal';

-- Powerdrip (Van Iperen)
UPDATE fertilizers SET
  description = 'Vloeibare fertigatiemeststof voor druppelirrigatie in groeifase.',
  formulation = 'SL'
WHERE name = 'Powerdrip Teon A' OR id = 'fruit-powerdrip-teon-a';

UPDATE fertilizers SET
  description = 'Vloeibare fertigatiemeststof voor druppelirrigatie in groeifase.',
  formulation = 'SL'
WHERE name = 'Powerdrip Teon B' OR id = 'fruit-powerdrip-teon-b';

-- Monokalifosfaat (MKP)
UPDATE fertilizers SET
  description = 'Monokalifosfaat (KH2PO4). 52% P2O5 + 34% K2O. Standaard bladmeststof.',
  formulation = 'Kristal (wateroplosbaar)',
  composition = '{"P": 22.7, "K": 28.2}'
WHERE name ILIKE '%Monokalifosfaat%' OR id = 'fruit-monokalifosfaat';

-- Monoammoniumfosfaat (MAP)
UPDATE fertilizers SET
  description = 'Monoammoniumfosfaat (NH4H2PO4). 12% N + 61% P2O5.',
  formulation = 'Kristal (wateroplosbaar)',
  composition = '{"N": 12, "P": 26.6}'
WHERE name ILIKE '%Monoammoniumfosfaat%' OR id = 'fruit-monoammoniumfosfaat';

-- KAS
UPDATE fertilizers SET
  description = 'Kalkammonsalpeter. Standaard stikstofmeststof 27% N met calcium.',
  formulation = 'Korrel'
WHERE name ILIKE '%Kalkammonsalpeter%' OR id = 'fruit-kas';

-- Ureum
UPDATE fertilizers SET
  description = 'Ureum (CO(NH2)2). 46% N. Ongeladen molecuul passeert bladcuticula.',
  formulation = 'Kristal/korrel'
WHERE name = 'Ureum' OR id = 'fruit-ureum';

-- ECOstyle Fruit-AZ
UPDATE fertilizers SET
  description = '100% organische meststof met hoog kaliumgehalte. 4 maanden nawerking.',
  formulation = 'Korrel (organisch)'
WHERE name = 'ECOstyle Fruit-AZ' OR id = 'fruit-ecostyle-fruit-az';

-- Champost
UPDATE fertilizers SET
  description = 'Champignoncompost. Hoog organisch stofgehalte. Bodemverbeteraar.',
  formulation = 'Compost'
WHERE name = 'Champost' OR id = 'fruit-champost';

-- Basaltmeel
UPDATE fertilizers SET
  description = 'Basaltmeel met silicium, kalk, magnesium en sporenelementen. Verbetert bodemstructuur.',
  formulation = 'Meel/poeder'
WHERE name = 'Basaltmeel' OR id = 'fruit-basaltmeel';

-- Gips
UPDATE fertilizers SET
  description = 'Calciumsulfaat (CaSO4). pH-neutraal. Structuurverbeteraar. Calcium zonder pH-verhoging.',
  formulation = 'Korrel/poeder'
WHERE name ILIKE '%Gips%' OR id = 'fruit-gips';

-- Solufert Micro (CropSolutions)
UPDATE fertilizers SET
  description = 'Volledig wateroplosbaar poeder met macro- en sporenelementen (EDTA gecheleerd). Natriumvrij. Zonder calcium en fosfaat.',
  formulation = 'WSP',
  dosage_fruit = '1 kg/ha per bespuiting'
WHERE name = 'Solufert Micro' OR id = 'fruit-solufert-micro';

-- Solufert Calciumchloride
UPDATE fertilizers SET
  description = 'Wateroplosbaar calciumchloride. 29% CaO. Geschikt voor biologische fruitteelt.',
  formulation = 'Kristal (wateroplosbaar)'
WHERE name = 'Solufert Calciumchloride' OR id = 'fruit-solufert-cacl2';

-- Kalkstikstof (Perlka)
UPDATE fertilizers SET
  description = 'Calciumcyanamide. 19.8% N + 50% CaO. Langzame stikstofafgifte + onkruidwerend.',
  formulation = 'Korrel'
WHERE name ILIKE '%Kalkstikstof%' OR id = 'fruit-kalkstikstof';

-- Tripel Superfosfaat
UPDATE fertilizers SET
  description = 'Tripelsuperfosfaat. 46% P2O5. Standaard fosformeststof.',
  formulation = 'Korrel'
WHERE name ILIKE '%Tripel Super%' OR id = 'fruit-tripel-super';

-- MAS
UPDATE fertilizers SET
  description = 'Magnesammonsalpeter. 21% N + 7% MgO. Stikstof met magnesium.',
  formulation = 'Korrel'
WHERE name ILIKE '%Magnesammonsalpeter%' OR id = 'fruit-mas';

-- ZZA
UPDATE fertilizers SET
  description = 'Zwavelzure ammoniak. 21% N + 60% SO3. Stikstof met zwavel, verzurend.',
  formulation = 'Korrel'
WHERE name ILIKE '%Zwavelzure ammoniak%' OR id = 'fruit-zza';

-- Haifa Multi-K
UPDATE fertilizers SET
  description = 'Kaliumnitraat (KNO3). 13% N + 46% K2O. Chloorvrij.',
  formulation = 'Kristal (wateroplosbaar)'
WHERE name ILIKE '%Haifa Multi-K%' OR id = 'fruit-haifa-multi-k';

-- Kalksalpeter
UPDATE fertilizers SET
  description = 'Calciumnitraat. 15.5% N + 26% CaO. Snel beschikbare stikstof en calcium.',
  formulation = 'Korrel/prill'
WHERE (name ILIKE 'Kalksalpeter%' AND name NOT ILIKE '%YaraTera%') OR id = 'fruit-kalksalpeter';

-- IPreum
UPDATE fertilizers SET
  description = 'Ureum korrels van Van Iperen. 46% N.',
  formulation = 'Korrel'
WHERE name = 'IPreum (Ureum korrel)' OR id = 'fruit-ipreum';

-- TopTrace Alimento varianten (Agrifirm)
UPDATE fertilizers SET
  description = 'Vloeibare calciumbladvoeding. Beste uit Fruitconsult test voor calciumopname bij Jonagold.',
  formulation = 'SL',
  application_timing = 'Vanaf vruchtzetting tot oogst voor stippreventie.'
WHERE name ILIKE '%alimento calcium%';

UPDATE fertilizers SET
  description = 'Vloeibare kaliumbladvoeding.',
  formulation = 'SL'
WHERE name ILIKE '%alimento kali%' OR id = 'fruit-alimento-k';

UPDATE fertilizers SET
  description = 'Vloeibare magnesiumbladvoeding.',
  formulation = 'SL'
WHERE name ILIKE '%alimento Magnesium%' OR id = 'fruit-alimento-mg';

UPDATE fertilizers SET
  description = 'Vloeibare sporenelementen bladvoeding.',
  formulation = 'SL'
WHERE name ILIKE '%alimento Micro%';

UPDATE fertilizers SET
  description = 'Vloeibare najaarsbladvoeding.',
  formulation = 'SL'
WHERE name ILIKE '%alimento najaar%';

UPDATE fertilizers SET
  description = 'Vloeibare voorjaarsbladvoeding.',
  formulation = 'SL'
WHERE name ILIKE '%alimento voorjaar%';

-- DCM Mix varianten
UPDATE fertilizers SET
  description = 'Organische korrelmeststof met 100% organische stikstof. Langzame nawerking.',
  formulation = 'Korrel (organisch)'
WHERE name ILIKE 'DCM MIX%';

-- Wuxal varianten uit dump
UPDATE fertilizers SET
  description = 'Vloeibare calcium + aminozuren bladmeststof.',
  formulation = 'SC'
WHERE name ILIKE '%Wuxal%Aminocal%';

UPDATE fertilizers SET
  description = 'Vloeibare NPK + sporenelementen (chloorarm).',
  formulation = 'SC'
WHERE name ILIKE '%Wuxal%Microplant%';

UPDATE fertilizers SET
  description = 'Vloeibare hoog-fosfor bladmeststof.',
  formulation = 'SC'
WHERE name ILIKE '%Wuxal%Top P%';

UPDATE fertilizers SET
  description = 'Vloeibare magnesium bladmeststof.',
  formulation = 'SC'
WHERE name ILIKE '%Wuxal%Magnesium%';

UPDATE fertilizers SET
  description = 'Vloeibare zwavel + ijzer combinatie.',
  formulation = 'SC'
WHERE name ILIKE '%Wuxal%Combi Fe%';

-- Aminosol
UPDATE fertilizers SET
  description = 'Organische stikstof (aminozuren) bladmeststof. Verbetert opname andere voedingsstoffen.',
  formulation = 'SL'
WHERE name = 'Aminosol' OR id = 'fruit-aminosol';

-- Kappa V
UPDATE fertilizers SET
  description = 'Bladmeststof complex met meerdere voedingselementen.',
  formulation = 'SL'
WHERE name = 'Kappa V' OR id = 'fruit-kappa-v';
