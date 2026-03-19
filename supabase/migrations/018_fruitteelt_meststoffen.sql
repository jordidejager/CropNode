-- ============================================
-- FRUITTEELT MESTSTOFFEN - Aanvulling database
-- ============================================
-- Voegt veelgebruikte meststoffen in de Nederlandse fruitteelt toe
-- die niet in de originele fertilizers-dump.json stonden.
-- Categorieën: Calcium, Borium, Magnesium, Kalium, Stikstof,
-- IJzer, Zink, Mangaan, Sporenelementen, Zwavel, Koper, Fosfor,
-- Fertigatie, Organisch/Bodemverbeteraars.

-- Gebruik ON CONFLICT DO NOTHING zodat bestaande producten niet overschreven worden.

INSERT INTO fertilizers (id, name, manufacturer, category, unit, composition, search_keywords) VALUES

-- =============================================
-- CALCIUM PRODUCTEN (Stip-preventie / Vruchtkwaliteit)
-- =============================================
('fruit-chelal-omnical', 'Chelal Omnical', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"CaO": 12.5}',
 ARRAY['chelal', 'omnical', 'chelal omnical', 'calcium', 'stip', 'bladmeststof', 'bms']),

('fruit-chelal-ca', 'Chelal Ca', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"CaO": 7.5}',
 ARRAY['chelal ca', 'chelal calcium', 'calcium chelaat', 'bms']),

('fruit-calcium-forte', 'Calcium-Forte', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"CaO": 15, "Mn": 0.5, "Zn": 0.5}',
 ARRAY['calcium forte', 'calcium', 'agriton', 'agro-vital', 'bladmeststof']),

('fruit-yaratera-cacl2', 'YaraTera Calciumchloride Vloeibaar', 'Yara', 'Leaf', 'L',
 '{"CaO": 22}',
 ARRAY['yaratera', 'calciumchloride', 'cacl2', 'yara', 'stip', 'calcium']),

('fruit-solufert-cacl2', 'Solufert Calciumchloride', 'CropSolutions', 'Leaf', 'kg',
 '{"CaO": 29}',
 ARRAY['solufert', 'calciumchloride', 'cropsolutions', 'calcium', 'stip', 'bio']),

('fruit-agroleaf-calcium', 'Agroleaf Power Calcium', 'ICL', 'Leaf', 'kg',
 '{"N": 11, "P": 5, "K": 19, "CaO": 9}',
 ARRAY['agroleaf', 'agroleaf power', 'agroleaf calcium', 'icl', 'calcium', 'bladmeststof']),

-- =============================================
-- BORIUM PRODUCTEN (Bloei / Vruchtzetting)
-- =============================================
('fruit-powerleaf-borium-manual', 'Powerleaf Borium', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"B": 11}',
 ARRAY['powerleaf', 'borium', 'powerline', 'bloei', 'vruchtzetting']),

('fruit-boron-15', 'Boron 15', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"B": 15}',
 ARRAY['boron', 'borium', 'agriton', 'agro-vital', 'bloei']),

('fruit-solubor', 'Solubor', 'U.S. Borax', 'Leaf', 'kg',
 '{"B": 20.5}',
 ARRAY['solubor', 'borax', 'borium', 'natriumboraat', 'bloei']),

-- =============================================
-- MAGNESIUM PRODUCTEN
-- =============================================
('fruit-bittersalz', 'Bittersalz', 'K+S', 'Leaf', 'kg',
 '{"MgO": 16, "SO3": 32}',
 ARRAY['bittersalz', 'bitterzout', 'magnesiumsulfaat', 'epsom', 'k+s', 'magnesium']),

('fruit-alimento-mg', 'TopTrace Alimento Magnesium', 'Agrifirm', 'Leaf', 'L',
 '{"MgO": 8}',
 ARRAY['alimento', 'toptrace', 'magnesium', 'agrifirm', 'bladmeststof']),

('fruit-mag500', 'Mag500', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"MgO": 27}',
 ARRAY['mag500', 'mag 500', 'magnesium', 'agriton', 'agro-vital']),

('fruit-agroleaf-mg', 'Agroleaf Power Magnesium', 'ICL', 'Leaf', 'kg',
 '{"N": 10, "P": 5, "K": 10, "MgO": 16}',
 ARRAY['agroleaf', 'agroleaf power', 'agroleaf magnesium', 'icl', 'magnesium']),

-- =============================================
-- KALIUM PRODUCTEN
-- =============================================
('fruit-alimento-k', 'TopTrace Alimento Kalium', 'Agrifirm', 'Leaf', 'L',
 '{"K": 20}',
 ARRAY['alimento', 'toptrace', 'kalium', 'agrifirm', 'bladmeststof']),

('fruit-bladkali-ts', 'Bladkali TS', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"K": 25}',
 ARRAY['bladkali', 'bladkali ts', 'kalium', 'agriton', 'agro-vital']),

('fruit-kalizout-60', 'Kalizout 60', 'Various', 'Soil', 'kg',
 '{"K": 60}',
 ARRAY['kalizout', 'kali 60', 'kalizout 60', 'kalium', 'strooimeststof']),

('fruit-kaliumsulfaat', 'Kaliumsulfaat', 'Various', 'Soil', 'kg',
 '{"K": 50, "SO3": 45}',
 ARRAY['kaliumsulfaat', 'kalium sulfaat', 'zwavelzure kali', 'strooimeststof']),

-- =============================================
-- STIKSTOF PRODUCTEN
-- =============================================
('fruit-kas', 'Kalkammonsalpeter (KAS)', 'Yara / Various', 'Soil', 'kg',
 '{"N": 27}',
 ARRAY['kas', 'kas 27', 'kalkammonsalpeter', 'can', 'stikstof', 'strooimeststof']),

('fruit-ureum', 'Ureum', 'Various', 'Leaf', 'kg',
 '{"N": 46}',
 ARRAY['ureum', 'ureumbladvoeding', 'urea', 'stikstof', 'bladmeststof']),

('fruit-agroleaf-high-n', 'Agroleaf Power High N', 'ICL', 'Leaf', 'kg',
 '{"N": 31, "P": 11, "K": 11}',
 ARRAY['agroleaf', 'agroleaf power', 'agroleaf high n', 'icl', 'stikstof']),

('fruit-aminosol', 'Aminosol', 'Various', 'Leaf', 'L',
 '{"N": 8}',
 ARRAY['aminosol', 'aminozuur', 'stikstof', 'bladmeststof', 'organisch']),

-- =============================================
-- IJZER PRODUCTEN (IJzerchelaten)
-- =============================================
('fruit-ferroplus', 'FerroPlus', 'Mertens Groep', 'Soil', 'kg',
 '{"Fe": 6}',
 ARRAY['ferroplus', 'ferro plus', 'ijzer', 'ijzerchelaat', 'dtpa', 'eddha', 'mertens']),

('fruit-ferrilene', 'Ferrilene', 'Valagro', 'Soil', 'kg',
 '{"Fe": 6}',
 ARRAY['ferrilene', 'ijzer', 'ijzerchelaat', 'eddha', 'valagro']),

('fruit-ultraferro', 'UltraFerro', 'Syngenta', 'Soil', 'kg',
 '{"Fe": 6}',
 ARRAY['ultraferro', 'ultra ferro', 'ijzer', 'ijzerchelaat', 'eddha', 'syngenta']),

('fruit-chelal-fe', 'Chelal Fe', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"Fe": 5.4}',
 ARRAY['chelal fe', 'chelal ijzer', 'ijzer', 'bms', 'bladmeststof']),

('fruit-sidero', 'SIDERO', 'Xantafe', 'Soil', 'kg',
 '{"Fe": 6}',
 ARRAY['sidero', 'xantafe', 'ijzer', 'ijzerchelaat', 'eddha']),

('fruit-ferro-terra', 'Ferro-Terra Liquid', 'Alliance Groep', 'Soil', 'L',
 '{"Fe": 6}',
 ARRAY['ferro terra', 'ferro-terra', 'alliance', 'ijzer', 'vloeibaar']),

-- =============================================
-- ZINK PRODUCTEN
-- =============================================
('fruit-powerleaf-zink-manual', 'Powerleaf Zink', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"Zn": 8}',
 ARRAY['powerleaf', 'zink', 'powerline', 'bladmeststof']),

('fruit-zink-fl', 'Zink FL', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"Zn": 7}',
 ARRAY['zink fl', 'zink', 'agriton', 'agro-vital', 'bladmeststof']),

('fruit-landamine-zn', 'Landamine Zn', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"Zn": 6.2}',
 ARRAY['landamine', 'landamine zn', 'zink', 'bms', 'chelaat', 'bladmeststof']),

-- =============================================
-- MANGAAN PRODUCTEN
-- =============================================
('fruit-mangaan-500', 'Mangaan 500', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"Mn": 27}',
 ARRAY['mangaan 500', 'mn 500', 'mn500', 'mangaan', 'agriton', 'agro-vital']),

('fruit-powerleaf-mn', 'Powerleaf Mangaan Plus', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"Mn": 15}',
 ARRAY['powerleaf', 'mangaan', 'mangaan plus', 'powerline', 'bladmeststof']),

-- =============================================
-- CHELAL SERIE (BMS Micro-Nutrients) - Compleet
-- =============================================
('fruit-chelal-az', 'Chelal AZ', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"Fe": 0.7, "Mn": 0.7, "Zn": 0.35, "Cu": 0.2, "B": 0.2, "Mo": 0.01}',
 ARRAY['chelal az', 'chelal sporenelementen', 'sporenelementen', 'bms', 'mix']),

('fruit-chelal-b', 'Chelal B', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"B": 7.5}',
 ARRAY['chelal b', 'chelal borium', 'borium', 'bms', 'bloei']),

('fruit-chelal-bzn', 'Chelal BZn', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"B": 4, "Zn": 3.5}',
 ARRAY['chelal bzn', 'chelal boor zink', 'borium', 'zink', 'bms']),

('fruit-chelal-mn', 'Chelal Mn', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"Mn": 5.2}',
 ARRAY['chelal mn', 'chelal mangaan', 'mangaan', 'bms']),

('fruit-chelal-mg', 'Chelal Mg', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"MgO": 5}',
 ARRAY['chelal mg', 'chelal magnesium', 'magnesium', 'bms']),

('fruit-chelal-cu', 'Chelal Cu', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"Cu": 5.8}',
 ARRAY['chelal cu', 'chelal koper', 'koper', 'bms']),

('fruit-fructol-bio', 'Fructol Bio', 'BMS Micro-Nutrients', 'Leaf', 'L',
 '{"Fe": 0.4, "Mn": 0.3, "Zn": 0.2}',
 ARRAY['fructol', 'fructol bio', 'biostimulant', 'zeewier', 'bms', 'organisch']),

-- =============================================
-- MULTI-ELEMENT / SPORENELEMENTEN MENGSELS
-- =============================================
('fruit-hortispoor-mix', 'Hortispoor Mix Vloeibaar', 'Van Iperen', 'Leaf', 'L',
 '{"B": 0.5, "Mo": 0.1, "Zn": 0.5, "Fe": 1.4, "Cu": 0.3, "Mn": 1.4}',
 ARRAY['hortispoor', 'hortispoor mix', 'van iperen', 'sporenelementen', 'mix', 'bladmeststof']),

('fruit-stimuplant-vitaal', 'Stimuplant Vitaal', 'Van Iperen', 'Leaf', 'L',
 '{"B": 0.5, "Cu": 0.3, "Mo": 0.05, "Mn": 1.0, "Zn": 0.5}',
 ARRAY['stimuplant', 'stimuplant vitaal', 'van iperen', 'sporenelementen', 'chelaat']),

('fruit-solufert-micro', 'Solufert Micro', 'CropSolutions', 'Leaf', 'kg',
 '{"N": 6.7, "K": 16, "MgO": 5, "Mn": 2.3, "B": 1.1, "Zn": 1.2, "Cu": 0.8, "Fe": 1.7, "Mo": 0.02}',
 ARRAY['solufert', 'solufert micro', 'cropsolutions', 'sporenelementen', 'mix']),

('fruit-agroleaf-total', 'Agroleaf Power Total', 'ICL', 'Leaf', 'kg',
 '{"N": 20, "P": 20, "K": 20}',
 ARRAY['agroleaf', 'agroleaf power', 'agroleaf total', 'icl', 'npk', 'compleet']),

('fruit-wuxal-mn-b', 'Wuxal Mangaan+Boor', 'Aglukon/BASF', 'Leaf', 'L',
 '{"N": 5, "Mn": 5, "B": 2.6, "MgO": 3}',
 ARRAY['wuxal', 'mangaan', 'boor', 'basf', 'aglukon', 'bladmeststof']),

('fruit-top-mix-fruit', 'Top Mix Fruit', 'Agrifirm', 'Soil', 'kg',
 '{"N": 12, "P": 4, "K": 18, "MgO": 3}',
 ARRAY['top mix', 'top mix fruit', 'agrifirm', 'npk', 'strooimeststof', 'fruitteelt']),

-- =============================================
-- ZWAVEL PRODUCTEN
-- =============================================
('fruit-super-sulfo-wg800', 'Super Sulfo WG 800', 'Afepasa / Van Wesemael', 'Leaf', 'kg',
 '{"S": 80}',
 ARRAY['super sulfo', 'sulfo', 'super sulfo wg', 'wg 800', 'zwavel', 'afepasa', 'wesemael']),

('fruit-powerleaf-zwavel-manual', 'Powerleaf Zwavel', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"S": 80}',
 ARRAY['powerleaf', 'zwavel', 'powerline', 'sulfur', 'bladmeststof']),

-- =============================================
-- KOPER PRODUCTEN
-- =============================================
('fruit-copfall-manual', 'Copfall', 'Alliance / Various', 'Leaf', 'L',
 '{"Cu": 5}',
 ARRAY['copfall', 'koper', 'bladval', 'herfst', 'bladmeststof']),

('fruit-powerleaf-koper-zwavel', 'Powerleaf Koper Zwavel', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"Cu": 5, "S": 15}',
 ARRAY['powerleaf', 'koper zwavel', 'koper', 'zwavel', 'powerline']),

('fruit-koper-fl', 'Koper FL', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"Cu": 5}',
 ARRAY['koper fl', 'koper', 'agriton', 'agro-vital', 'bladmeststof']),

('fruit-acs-koper-500', 'ACS-Koper 500', 'ACS', 'Leaf', 'L',
 '{"Cu": 5}',
 ARRAY['acs koper', 'acs-koper', 'acs koper 500', 'koper', 'bladmeststof']),

-- =============================================
-- FOSFOR PRODUCTEN
-- =============================================
('fruit-monokalifosfaat', 'Monokalifosfaat (MKP)', 'Various', 'Leaf', 'kg',
 '{"P": 52, "K": 34}',
 ARRAY['monokalifosfaat', 'mkp', 'mono kali fosfaat', 'fosfor', 'kalium', 'bladmeststof']),

('fruit-monoammoniumfosfaat', 'Monoammoniumfosfaat (MAP)', 'Various', 'Leaf', 'kg',
 '{"N": 12, "P": 61}',
 ARRAY['monoammoniumfosfaat', 'map', 'fosfor', 'stikstof', 'bladmeststof']),

('fruit-powerleaf-fosfaat-manual', 'Powerleaf Fosfaat', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"P": 15, "K": 10, "MgO": 3}',
 ARRAY['powerleaf', 'fosfaat', 'fosfor', 'powerline', 'bladmeststof']),

('fruit-hi-phos', 'Hi-Phos', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"P": 30}',
 ARRAY['hi-phos', 'hiphos', 'fosfor', 'agriton', 'agro-vital']),

('fruit-fosanit-cu', 'Fosanit Cu', 'Various', 'Leaf', 'L',
 '{"P": 20, "Cu": 3}',
 ARRAY['fosanit', 'fosanit cu', 'fosfor', 'koper', 'bladmeststof']),

-- =============================================
-- OVERIGE BLADMESTSTOFFEN
-- =============================================
('fruit-kappa-v', 'Kappa V', 'Various', 'Leaf', 'L',
 '{"K": 15, "N": 5}',
 ARRAY['kappa', 'kappa v', 'bladmeststof', 'mix']),

('fruit-selectyc-x', 'Selectyc X', 'Various', 'Leaf', 'L',
 '{}',
 ARRAY['selectyc', 'selectyc x', 'bladmeststof', 'mix']),

('fruit-alsupre-s', 'Alsupre S', 'Various', 'Leaf', 'L',
 '{}',
 ARRAY['alsupre', 'alsupre s', 'bladmeststof', 'mix']),

('fruit-fertigofol-ultra', 'Fertigofol Ultra', 'Various', 'Leaf', 'L',
 '{"N": 5, "P": 5, "K": 5}',
 ARRAY['fertigofol', 'fertigofol ultra', 'npk', 'bladmeststof', 'mix']),

('fruit-calcimax', 'CalciMax', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"CaO": 8, "B": 0.5}',
 ARRAY['calcimax', 'calcium', 'borium', 'agriton', 'agro-vital', 'stip']),

('fruit-calin-w', 'Calin W', 'Agro-Vital / Agriton', 'Leaf', 'L',
 '{"CaO": 10}',
 ARRAY['calin', 'calin w', 'calcium', 'agriton', 'agro-vital']),

-- =============================================
-- FERTIGATIE PRODUCTEN
-- =============================================
('fruit-powerdrip-teon-a', 'Powerdrip Teon A', 'Van Iperen', 'Fertigation', 'L',
 '{"N": 8, "K": 4, "MgO": 2}',
 ARRAY['powerdrip', 'teon a', 'van iperen', 'fertigatie', 'druppelirrigatie']),

('fruit-powerdrip-teon-b', 'Powerdrip Teon B', 'Van Iperen', 'Fertigation', 'L',
 '{"N": 5, "P": 3, "K": 8}',
 ARRAY['powerdrip', 'teon b', 'van iperen', 'fertigatie', 'druppelirrigatie']),

-- =============================================
-- STROOIMESTSTOFFEN
-- =============================================
('fruit-patentkali-manual', 'Patentkali', 'K+S', 'Soil', 'kg',
 '{"K": 30, "MgO": 10, "SO3": 42}',
 ARRAY['patentkali', 'patent kali', 'k+s', 'kalium', 'magnesium', 'strooimeststof']),

('fruit-kalkstikstof', 'Kalkstikstof (Perlka)', 'AlzChem', 'Soil', 'kg',
 '{"N": 19.8, "CaO": 50}',
 ARRAY['kalkstikstof', 'perlka', 'alzchem', 'stikstof', 'calcium', 'strooimeststof']),

('fruit-tripel-super', 'Tripel Superfosfaat (TSP)', 'Various', 'Soil', 'kg',
 '{"P": 46}',
 ARRAY['tripel super', 'tripel superfosfaat', 'tsp', 'fosfor', 'strooimeststof']),

('fruit-mas', 'Magnesammonsalpeter (MAS)', 'Various', 'Soil', 'kg',
 '{"N": 21, "MgO": 7}',
 ARRAY['mas', 'mas 21', 'magnesammonsalpeter', 'stikstof', 'magnesium', 'strooimeststof']),

('fruit-zza', 'Zwavelzure ammoniak (ZZA)', 'Various', 'Soil', 'kg',
 '{"N": 21, "SO3": 60}',
 ARRAY['zza', 'za', 'zwavelzure ammoniak', 'stikstof', 'zwavel', 'strooimeststof']),

('fruit-kalksalpeter', 'Kalksalpeter', 'Yara / Various', 'Soil', 'kg',
 '{"N": 15.5, "CaO": 26}',
 ARRAY['kalksalpeter', 'calciumnitraat', 'calcinit', 'stikstof', 'calcium']),

('fruit-haifa-multi-k', 'Haifa Multi-K (Kaliumnitraat)', 'Haifa', 'Soil', 'kg',
 '{"N": 13, "K": 46}',
 ARRAY['haifa', 'multi-k', 'kaliumnitraat', 'haifa multi-k', 'kalium', 'stikstof']),

('fruit-mengmest-12-10-18', 'Mengmest 12-10-18', 'Various', 'Soil', 'kg',
 '{"N": 12, "P": 10, "K": 18}',
 ARRAY['mengmest', '12-10-18', 'npk 12-10-18', 'npk', 'strooimeststof']),

('fruit-ipreum', 'IPreum (Ureum korrel)', 'Van Iperen', 'Soil', 'kg',
 '{"N": 46}',
 ARRAY['ipreum', 'ureum korrel', 'van iperen', 'stikstof', 'strooimeststof']),

('fruit-multi-kmg', 'Multi Kmg', 'Various', 'Soil', 'kg',
 '{"K": 24, "N": 12, "MgO": 5}',
 ARRAY['multi kmg', 'multi k', 'kalium', 'stikstof', 'magnesium', 'strooimeststof']),

-- =============================================
-- ORGANISCH / BODEMVERBETERAARS
-- =============================================
('fruit-ecostyle-fruit-az', 'ECOstyle Fruit-AZ', 'ECOstyle', 'Soil', 'kg',
 '{"N": 6, "P": 5, "K": 12}',
 ARRAY['ecostyle', 'fruit-az', 'organisch', 'biologisch', 'fruitteelt']),

('fruit-champost', 'Champost', 'Various', 'Soil', 'kg',
 '{}',
 ARRAY['champost', 'champignonmest', 'organisch', 'bodemverbeteraar', 'compost']),

('fruit-dolokal-manual', 'Dolokal', 'Various', 'Soil', 'kg',
 '{"CaO": 30, "MgO": 18}',
 ARRAY['dolokal', 'dolomiet', 'kalk', 'calcium', 'magnesium', 'bodemverbeteraar', 'ph']),

('fruit-gips', 'Gips (Calciumsulfaat)', 'Various', 'Soil', 'kg',
 '{"CaO": 32, "SO3": 46}',
 ARRAY['gips', 'calciumsulfaat', 'calcium', 'bodemverbeteraar', 'structuur']),

('fruit-basaltmeel', 'Basaltmeel', 'Organifer / Various', 'Soil', 'kg',
 '{"CaO": 12, "MgO": 8}',
 ARRAY['basaltmeel', 'basalt', 'organifer', 'bodemverbeteraar', 'silicium', 'sporenelementen']),

-- =============================================
-- POWERLEAF SERIE AANVULLINGEN
-- =============================================
('fruit-powerleaf-kali', 'Powerleaf Kali', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"K": 25}',
 ARRAY['powerleaf', 'kali', 'kalium', 'powerline', 'bladmeststof']),

('fruit-powerleaf-molybdeen', 'Powerleaf Molybdeen', 'Powerline Meststoffen', 'Leaf', 'L',
 '{"Mo": 8}',
 ARRAY['powerleaf', 'molybdeen', 'powerline', 'sporenelement', 'bladmeststof'])

ON CONFLICT (id) DO NOTHING;

-- =============================================
-- NIEUWE MESTSTOF ALIASSEN
-- =============================================
INSERT INTO fertilizer_aliases (alias, official_name) VALUES
  -- Calcium
  ('omnical', 'Chelal Omnical'),
  ('chelal calcium', 'Chelal Omnical'),
  ('calcium forte', 'Calcium-Forte'),
  ('cacl2', 'YaraTera Calciumchloride Vloeibaar'),
  ('calciumchloride', 'YaraTera Calciumchloride Vloeibaar'),
  ('agroleaf calcium', 'Agroleaf Power Calcium'),
  -- Borium
  ('bortrac', 'YaraVita BORTRAC 150'),
  ('yaravita bortrac', 'YaraVita BORTRAC 150'),
  ('boron 15', 'Boron 15'),
  -- IJzer
  ('ferroplus', 'FerroPlus'),
  ('ferro plus', 'FerroPlus'),
  ('ultraferro', 'UltraFerro'),
  ('ultra ferro', 'UltraFerro'),
  ('ferrilene', 'Ferrilene'),
  ('sidero', 'SIDERO'),
  ('ferro terra', 'Ferro-Terra Liquid'),
  ('ferro-terra', 'Ferro-Terra Liquid'),
  ('yaravita ferritrac', 'YaraVita FERRITRAC 54'),
  ('ferritrac', 'YaraVita FERRITRAC 54'),
  -- Zink
  ('zintrac', 'YaraVita ZINTRAC 700'),
  ('yaravita zintrac', 'YaraVita ZINTRAC 700'),
  ('landamine zn', 'Landamine Zn'),
  ('zink fl', 'Zink FL'),
  -- Mangaan
  ('mantrac', 'YaraVita MANTRAC PRO'),
  ('yaravita mantrac', 'YaraVita MANTRAC PRO'),
  ('mangaan plus', 'Powerleaf Mangaan Plus'),
  -- Zwavel
  ('super sulfo', 'Super Sulfo WG 800'),
  ('sulfo', 'Super Sulfo WG 800'),
  ('super sulfo wg', 'Super Sulfo WG 800'),
  ('sulfo wg 800', 'Super Sulfo WG 800'),
  -- Sporenelementen
  ('hortispoor mix', 'Hortispoor Mix Vloeibaar'),
  ('stimuplant vitaal', 'Stimuplant Vitaal'),
  ('solufert micro', 'Solufert Micro'),
  ('frutrel', 'YaraVita FRUTREL'),
  ('yaravita frutrel', 'YaraVita FRUTREL'),
  ('fructol', 'Fructol Bio'),
  ('fructol bio', 'Fructol Bio'),
  ('agroleaf total', 'Agroleaf Power Total'),
  -- Koper
  ('acs koper', 'ACS-Koper 500'),
  ('acs-koper', 'ACS-Koper 500'),
  ('acs koper 500', 'ACS-Koper 500'),
  ('koper fl', 'Koper FL'),
  ('koper zwavel', 'Powerleaf Koper Zwavel'),
  -- Fosfor
  ('mkp', 'Monokalifosfaat (MKP)'),
  ('mono kali fosfaat', 'Monokalifosfaat (MKP)'),
  ('map', 'Monoammoniumfosfaat (MAP)'),
  ('hi-phos', 'Hi-Phos'),
  ('hiphos', 'Hi-Phos'),
  -- Overig
  ('kappa', 'Kappa V'),
  ('kappa v', 'Kappa V'),
  ('selectyc', 'Selectyc X'),
  ('alsupre', 'Alsupre S'),
  ('fertigofol', 'Fertigofol Ultra'),
  ('calcimax', 'CalciMax'),
  ('calin', 'Calin W'),
  ('calin w', 'Calin W'),
  -- Strooimeststoffen
  ('ecostyle fruit', 'ECOstyle Fruit-AZ'),
  ('fruit-az', 'ECOstyle Fruit-AZ'),
  ('champost', 'Champost'),
  ('champignonmest', 'Champost'),
  ('basaltmeel', 'Basaltmeel'),
  ('gips', 'Gips (Calciumsulfaat)'),
  ('calciumsulfaat', 'Gips (Calciumsulfaat)'),
  -- Fertigatie
  ('powerdrip a', 'Powerdrip Teon A'),
  ('teon a', 'Powerdrip Teon A'),
  ('powerdrip b', 'Powerdrip Teon B'),
  ('teon b', 'Powerdrip Teon B')
ON CONFLICT (alias) DO NOTHING;
