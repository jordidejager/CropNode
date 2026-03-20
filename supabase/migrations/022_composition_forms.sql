-- ============================================
-- SAMENSTELLINGSVORMEN (composition_forms)
-- ============================================
-- Voegt een JSONB kolom toe die per element de chemische vorm aangeeft.
-- Bijv: {"Cu": "koperoxychloride", "Fe": "EDDHA-chelaat"}
--
-- Relevante elementen met verschillende vormen:
-- Cu: koperoxychloride, kopersulfaat, koper-EDTA, koper-DTPA
-- Fe: EDDHA-chelaat, DTPA-chelaat, EDTA-chelaat, ijzersulfaat
-- Mn: mangaancarbonaat, mangaanoxide, EDTA-chelaat, mangaansulfaat
-- Zn: zinkoxide, zinksulfaat, EDTA-chelaat
-- B:  boorzuur, natriumboraat (dinatriumoctaboraat), borium-ethanolamine
-- Ca: calciumchloride, calcium-DTPA-chelaat, calciumcarbonaat, calciumnitraat, calciumsulfaat, calciumcyanamide
-- Mg: magnesiumsulfaat, magnesiumcarbonaat
-- Mo: natriummolybdaat, ammoniummolybdaat
-- S:  elementaire zwavel, sulfaat
-- N:  nitraat, ammonium, ureum, cyanamide
-- K:  kaliumchloride, kaliumsulfaat, kaliumnitraat

-- Kolom toevoegen
ALTER TABLE fertilizers
ADD COLUMN IF NOT EXISTS composition_forms JSONB;

-- =============================================
-- KOPER PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"Cu": "koperoxychloride"}'
WHERE name = 'ACS-Koper 500' OR id = 'fruit-acs-koper-500';

UPDATE fertilizers SET composition_forms = '{"Cu": "koper-EDTA-chelaat"}'
WHERE name = 'Chelal Cu' OR id = 'fruit-chelal-cu';

UPDATE fertilizers SET composition_forms = '{"Cu": "koperoxychloride"}'
WHERE name = 'Koper FL' OR id = 'fruit-koper-fl';

UPDATE fertilizers SET composition_forms = '{"Cu": "kopersuspensie"}'
WHERE name ILIKE '%COPTREL 500%';

UPDATE fertilizers SET composition_forms = '{"Cu": "koper-EDTA", "S": "elementaire zwavel"}'
WHERE name = 'Powerleaf Koper Zwavel' OR id = 'fruit-powerleaf-koper-zwavel';

UPDATE fertilizers SET composition_forms = '{"Cu": "koper-EDTA", "P": "fosfiet"}'
WHERE name = 'Fosanit Cu' OR id = 'fruit-fosanit-cu';

UPDATE fertilizers SET composition_forms = '{"Cu": "kopersulfaat"}'
WHERE name ILIKE 'Solufert Kopersulfaat%';

-- =============================================
-- IJZER PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"Fe": "DTPA/EDDHA-chelaat"}'
WHERE name = 'FerroPlus' OR id = 'fruit-ferroplus';

UPDATE fertilizers SET composition_forms = '{"Fe": "EDDHA-chelaat (4.8% o-o)"}'
WHERE name = 'Ferrilene' OR id = 'fruit-ferrilene';

UPDATE fertilizers SET composition_forms = '{"Fe": "EDDHA-chelaat (4.2% o-o)"}'
WHERE name = 'UltraFerro' OR id = 'fruit-ultraferro';

UPDATE fertilizers SET composition_forms = '{"Fe": "EDDHA-chelaat"}'
WHERE name = 'SIDERO' OR id = 'fruit-sidero';

UPDATE fertilizers SET composition_forms = '{"Fe": "EDDHA-chelaat"}'
WHERE name ILIKE '%FERRITRAC%';

UPDATE fertilizers SET composition_forms = '{"Fe": "DTPA/EDTA/HEEDTA-chelaat"}'
WHERE name = 'Chelal Fe' OR id = 'fruit-chelal-fe';

UPDATE fertilizers SET composition_forms = '{"Fe": "ijzervloeibaar"}'
WHERE name = 'Ferro-Terra Liquid' OR id = 'fruit-ferro-terra';

UPDATE fertilizers SET composition_forms = '{"Fe": "EDDHA-chelaat"}'
WHERE name ILIKE 'Solufert Ijzer EDDHA%';

UPDATE fertilizers SET composition_forms = '{"Fe": "ijzersulfaat"}'
WHERE name ILIKE 'Solufert Ijzersulfaat%';

UPDATE fertilizers SET composition_forms = '{"Fe": "EDTA-chelaat"}'
WHERE name ILIKE '%Agroleaf Liquid%Iron%';

-- =============================================
-- MANGAAN PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"Mn": "mangaancarbonaat"}'
WHERE name = 'Mangaan 500' OR id = 'fruit-mangaan-500';

UPDATE fertilizers SET composition_forms = '{"Mn": "mangaanoxide-suspensie"}'
WHERE name ILIKE '%MANTRAC%';

UPDATE fertilizers SET composition_forms = '{"Mn": "mangaanoxide + stikstof + zwavel"}'
WHERE name = 'Powerleaf Mangaan Plus' OR id = 'fruit-powerleaf-mn';

UPDATE fertilizers SET composition_forms = '{"Mn": "DTPA/EDTA/HEEDTA-chelaat"}'
WHERE name ILIKE 'Chelal Mn%' OR id = 'fruit-chelal-mn';

UPDATE fertilizers SET composition_forms = '{"Mn": "mangaansuspensie"}'
WHERE name ILIKE '%Wuxal%Suspensie Mangaan%';

UPDATE fertilizers SET composition_forms = '{"Mn": "mangaansulfaat"}'
WHERE name ILIKE 'Solufert Mangaansulfaat%';

UPDATE fertilizers SET composition_forms = '{"Mn": "EDTA-chelaat"}'
WHERE name ILIKE 'Solufert Mangaan%EDTA%';

UPDATE fertilizers SET composition_forms = '{"Mn": "EDTA-chelaat"}'
WHERE name ILIKE '%Agroleaf Special%Mn%';

-- =============================================
-- ZINK PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"Zn": "zinkoxide"}'
WHERE name ILIKE '%ZINTRAC%';

UPDATE fertilizers SET composition_forms = '{"Zn": "zinkoxide-suspensie"}'
WHERE name = 'Zink FL' OR id = 'fruit-zink-fl';

UPDATE fertilizers SET composition_forms = '{"Zn": "zink-EDTA-chelaat"}'
WHERE name = 'Landamine Zn' OR id = 'fruit-landamine-zn';

UPDATE fertilizers SET composition_forms = '{"Zn": "zinksulfaat"}'
WHERE name ILIKE 'Solufert Zinksulfaat%';

UPDATE fertilizers SET composition_forms = '{"Zn": "zink-EDTA-chelaat"}'
WHERE name ILIKE 'Solufert Zink%EDTA%';

UPDATE fertilizers SET composition_forms = '{"Zn": "EDTA-chelaat"}'
WHERE name ILIKE '%Agroleaf Special%Zn%';

UPDATE fertilizers SET composition_forms = '{"Zn": "EDTA-chelaat"}'
WHERE name ILIKE '%Agroleaf Liquid%Zinc%' AND name NOT ILIKE '%Zinc M+%';

-- =============================================
-- BORIUM PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"B": "borium-ethanolamine"}'
WHERE name ILIKE '%BORTRAC%';

UPDATE fertilizers SET composition_forms = '{"B": "boorzuur"}'
WHERE name = 'Boron 15' OR id = 'fruit-boron-15';

UPDATE fertilizers SET composition_forms = '{"B": "dinatriumoctaboraat-tetrahydraat"}'
WHERE name = 'Solubor' OR id = 'fruit-solubor';

UPDATE fertilizers SET composition_forms = '{"B": "boorzuur + polyolen"}'
WHERE name = 'Chelal B' OR id = 'fruit-chelal-b';

UPDATE fertilizers SET composition_forms = '{"B": "borium-ethanolamine"}'
WHERE name ILIKE '%Wuxal%Folibor%';

UPDATE fertilizers SET composition_forms = '{"B": "boorzuur"}'
WHERE name = 'Powerleaf Borium' OR id = 'fruit-powerleaf-borium-manual';

UPDATE fertilizers SET composition_forms = '{"B": "boorzuur"}'
WHERE name ILIKE 'Solufert Boorzuur%';

-- =============================================
-- CALCIUM PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"CaO": "calcium-DTPA-chelaat"}'
WHERE name = 'Chelal Omnical' OR id = 'fruit-chelal-omnical';

UPDATE fertilizers SET composition_forms = '{"CaO": "calcium-DTPA-chelaat"}'
WHERE name = 'Chelal Ca' OR id = 'fruit-chelal-ca';

UPDATE fertilizers SET composition_forms = '{"CaO": "calciumchloride"}'
WHERE name ILIKE '%Calciumchloride Vloeibaar%' OR id = 'fruit-yaratera-cacl2';

UPDATE fertilizers SET composition_forms = '{"CaO": "calciumchloride"}'
WHERE name = 'Solufert Calciumchloride' OR id = 'fruit-solufert-cacl2';

UPDATE fertilizers SET composition_forms = '{"CaO": "calcium + aminozuren"}'
WHERE name = 'Calcium-Forte' OR id = 'fruit-calcium-forte';

UPDATE fertilizers SET composition_forms = '{"CaO": "calcium-floeemmobiel formulering"}'
WHERE name = 'CalciMax' OR id = 'fruit-calcimax';

UPDATE fertilizers SET composition_forms = '{"CaO": "speciale calcium-formulering"}'
WHERE name = 'Calin W' OR id = 'fruit-calin-w';

UPDATE fertilizers SET composition_forms = '{"CaO": "calcium + aminozuren (glycine, L-arginine)"}'
WHERE name ILIKE '%Agroleaf Liquid%Calcium%';

UPDATE fertilizers SET composition_forms = '{"CaO": "calcium-suspensie"}'
WHERE name ILIKE '%Wuxal%Calcium%';

UPDATE fertilizers SET composition_forms = '{"N": "calciumnitraat"}'
WHERE (name ILIKE 'Kalksalpeter%' AND name NOT ILIKE '%YaraTera%') OR id = 'fruit-kalksalpeter';

UPDATE fertilizers SET composition_forms = '{"N": "calciumnitraat", "CaO": "calciumnitraat"}'
WHERE name ILIKE '%CALCINIT%';

UPDATE fertilizers SET composition_forms = '{"CaO": "calciumcarbonaat + magnesiumcarbonaat"}'
WHERE name ILIKE 'Dolokal%' OR id = 'fruit-dolokal-manual';

UPDATE fertilizers SET composition_forms = '{"CaO": "calciumsulfaat"}'
WHERE name ILIKE '%Gips%' OR id = 'fruit-gips';

UPDATE fertilizers SET composition_forms = '{"N": "calciumcyanamide", "CaO": "calciumcyanamide"}'
WHERE name ILIKE '%Kalkstikstof%' OR id = 'fruit-kalkstikstof';

-- =============================================
-- MAGNESIUM PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"MgO": "magnesiumsulfaat-heptahydraat"}'
WHERE name = 'Bittersalz' OR id = 'fruit-bittersalz';

UPDATE fertilizers SET composition_forms = '{"MgO": "magnesiumsulfaat"}'
WHERE name ILIKE 'Bitterzout%';

UPDATE fertilizers SET composition_forms = '{"MgO": "magnesiumsulfaat"}'
WHERE name ILIKE '%EPSO Top%';

UPDATE fertilizers SET composition_forms = '{"MgO": "magnesiumcarbonaat"}'
WHERE name = 'Mag500' OR id = 'fruit-mag500';

UPDATE fertilizers SET composition_forms = '{"MgO": "DTPA/EDTA/HEEDTA-chelaat"}'
WHERE name ILIKE 'Chelal Mg%' OR id = 'fruit-chelal-mg';

UPDATE fertilizers SET composition_forms = '{"MgO": "magnesiumsulfaat + mangaan + zink"}'
WHERE name ILIKE '%EPSO Combitop%';

UPDATE fertilizers SET composition_forms = '{"MgO": "magnesiumsulfaat + borium + mangaan"}'
WHERE name ILIKE '%EPSO Microtop%';

-- =============================================
-- STIKSTOF PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"N": "ammoniumnitraat + calciumcarbonaat"}'
WHERE name ILIKE '%Kalkammonsalpeter%' OR id = 'fruit-kas';

UPDATE fertilizers SET composition_forms = '{"N": "ureum (CO(NH2)2)"}'
WHERE (name = 'Ureum' OR id = 'fruit-ureum') AND name NOT ILIKE '%IPreum%';

UPDATE fertilizers SET composition_forms = '{"N": "ureum"}'
WHERE name ILIKE 'IPreum%' OR id = 'fruit-ipreum';

UPDATE fertilizers SET composition_forms = '{"N": "ammoniumsulfaat"}'
WHERE name ILIKE '%Zwavelzure ammoniak%' OR id = 'fruit-zza';

UPDATE fertilizers SET composition_forms = '{"N": "ammoniumnitraat + magnesiumsulfaat"}'
WHERE name ILIKE '%Magnesammonsalpeter%' OR id = 'fruit-mas';

UPDATE fertilizers SET composition_forms = '{"N": "aminozuren (organisch)"}'
WHERE name = 'Aminosol' OR id = 'fruit-aminosol';

-- =============================================
-- KALIUM PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"K": "kaliumchloride"}'
WHERE name ILIKE '%Kalizout 60%' OR id = 'fruit-kalizout-60';

UPDATE fertilizers SET composition_forms = '{"K": "kaliumsulfaat"}'
WHERE name = 'Kaliumsulfaat' OR id = 'fruit-kaliumsulfaat';

UPDATE fertilizers SET composition_forms = '{"K": "kaliumsulfaat + magnesiumsulfaat"}'
WHERE name ILIKE 'Patentkali%' OR id = 'fruit-patentkali-manual';

UPDATE fertilizers SET composition_forms = '{"K": "kaliumnitraat"}'
WHERE name ILIKE '%Haifa Multi-K%' OR id = 'fruit-haifa-multi-k';

UPDATE fertilizers SET composition_forms = '{"K": "niet-zout gebaseerd"}'
WHERE name = 'Bladkali TS' OR id = 'fruit-bladkali-ts';

-- =============================================
-- FOSFOR PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"P": "monokalifosfaat (KH2PO4)"}'
WHERE name ILIKE '%Monokalifosfaat%' OR id = 'fruit-monokalifosfaat';

UPDATE fertilizers SET composition_forms = '{"P": "monoammoniumfosfaat (NH4H2PO4)"}'
WHERE name ILIKE '%Monoammoniumfosfaat%' OR id = 'fruit-monoammoniumfosfaat';

UPDATE fertilizers SET composition_forms = '{"P": "tripelsuperfosfaat"}'
WHERE name ILIKE '%Tripel Super%' OR id = 'fruit-tripel-super';

UPDATE fertilizers SET composition_forms = '{"P": "fosfaat + calcium"}'
WHERE name ILIKE '%SENIPHOS%';

-- =============================================
-- ZWAVEL PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"S": "elementaire zwavel (micronized)"}'
WHERE name = 'Super Sulfo WG 800' OR id = 'fruit-super-sulfo-wg800';

UPDATE fertilizers SET composition_forms = '{"S": "elementaire zwavel-suspensie"}'
WHERE name = 'Powerleaf Zwavel' OR id = 'fruit-powerleaf-zwavel-manual';

-- =============================================
-- MOLYBDEEN PRODUCTEN
-- =============================================
UPDATE fertilizers SET composition_forms = '{"Mo": "natriummolybdaat"}'
WHERE name = 'Powerleaf Molybdeen' OR id = 'fruit-powerleaf-molybdeen';

UPDATE fertilizers SET composition_forms = '{"Mo": "ammoniummolybdaat"}'
WHERE name ILIKE 'Solufert Molybdaat%';

-- =============================================
-- CHELAL MULTI-ELEMENT (meerdere vormen)
-- =============================================
UPDATE fertilizers SET composition_forms = '{"Fe": "chelaat", "Mn": "chelaat", "Zn": "chelaat", "Cu": "chelaat", "B": "boorzuur", "Mo": "molybdaat"}'
WHERE name = 'Chelal AZ' OR id = 'fruit-chelal-az';

UPDATE fertilizers SET composition_forms = '{"B": "boorzuur + polyolen", "Zn": "chelaat"}'
WHERE name = 'Chelal BZn' OR id = 'fruit-chelal-bzn';

UPDATE fertilizers SET composition_forms = '{"Fe": "chelaat", "Mn": "chelaat", "Zn": "chelaat"}'
WHERE name = 'Fructol Bio' OR id = 'fruit-fructol-bio';
