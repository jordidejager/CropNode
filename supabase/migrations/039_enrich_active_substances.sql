-- ============================================
-- 039: Enrich active_substances with all relevant fruit farming substances
-- + re-populate product_substances junction from enriched ctgb_products
-- ============================================

-- Add additional fruit-farming relevant substances with FRAC/IRAC codes
INSERT INTO active_substances (code, name, name_en, category, resistance_group, cas_number, mode_of_action, max_applications_per_year) VALUES
  -- Fungiciden (aanvulling)
  ('azoxystrobin', 'Azoxystrobin', 'Azoxystrobin', 'Fungicide', '11', '131860-33-8', 'QoI strobilurin', 4),
  ('fosetyl-aluminium', 'Fosetyl-aluminium', 'Fosetyl-aluminium', 'Fungicide', '33', '39148-24-8', 'Fosfonaat', 6),
  ('fosfonzuur', 'Fosfonzuur', 'Phosphorous acid', 'Fungicide', '33', '13598-36-2', 'Fosfonaat', 6),
  ('metiram', 'Metiram', 'Metiram', 'Fungicide', 'M3', '9006-42-2', 'Multi-site dithiocarbamaat', 6),
  ('mancozeb', 'Mancozeb', 'Mancozeb', 'Fungicide', 'M3', '8018-01-7', 'Multi-site dithiocarbamaat', 6),
  ('myclobutanil', 'Myclobutanil', 'Myclobutanil', 'Fungicide', '3', '88671-89-0', 'DMI triazool', 4),
  ('fenbuconazool', 'Fenbuconazool', 'Fenbuconazole', 'Fungicide', '3', '114369-43-6', 'DMI triazool', 3),
  ('ametoctradin', 'Ametoctradin', 'Ametoctradin', 'Fungicide', '45', '865318-97-4', 'QoSI', 3),
  ('dimethomorf', 'Dimethomorf', 'Dimethomorph', 'Fungicide', '40', '110488-70-5', 'CAA morfoline', 3),
  ('cyflufenamid', 'Cyflufenamid', 'Cyflufenamid', 'Fungicide', 'U13', '180409-60-3', 'Onbekend', 2),
  ('benzovindiflupyr', 'Benzovindiflupyr', 'Benzovindiflupyr', 'Fungicide', '7', '1072957-71-1', 'SDHI', 2),
  ('isopyrazam', 'Isopyrazam', 'Isopyrazam', 'Fungicide', '7', '881685-58-1', 'SDHI', 2),
  ('bupirimaat', 'Bupirimaat', 'Bupirimate', 'Fungicide', '8', '41483-43-6', 'Hydroxypyrimidine', 4),
  -- Biologische fungiciden
  ('bacillus amyloliquefaciens stam qst 713', 'Bacillus amyloliquefaciens QST 713', 'Bacillus amyloliquefaciens QST 713', 'Fungicide (biologisch)', 'BM02', NULL, 'Biologisch microbieel', NULL),
  ('bacillus subtilis stam qst 713', 'Bacillus subtilis QST 713', 'Bacillus subtilis QST 713', 'Fungicide (biologisch)', 'BM02', NULL, 'Biologisch microbieel', NULL),
  ('aureobasidium pullulans stam dsm 14940', 'Aureobasidium pullulans DSM 14940', 'Aureobasidium pullulans DSM 14940', 'Fungicide (biologisch)', 'BM02', NULL, 'Biologisch microbieel', NULL),
  ('aureobasidium pullulans stam dsm 14941', 'Aureobasidium pullulans DSM 14941', 'Aureobasidium pullulans DSM 14941', 'Fungicide (biologisch)', 'BM02', NULL, 'Biologisch microbieel', NULL),
  -- Insecticiden (aanvulling)
  ('cyantraniliprole', 'Cyantraniliprole', 'Cyantraniliprole', 'Insecticide', '28', '736994-63-1', 'Diamide', 2),
  ('spinetoram', 'Spinetoram', 'Spinetoram', 'Insecticide', '5', '187166-40-1', 'Spinosyn', 3),
  ('emamectine-benzoaat', 'Emamectine-benzoaat', 'Emamectin benzoate', 'Insecticide', '6', '155569-91-8', 'Avermectine', 2),
  ('pyriproxyfen', 'Pyriproxyfen', 'Pyriproxyfen', 'Insecticide', '7C', '95737-68-1', 'Juvenoid', 1),
  ('thiacloprid', 'Thiacloprid', 'Thiacloprid', 'Insecticide', '4A', '111988-49-9', 'Neonicotinoide', 1),
  ('flupyradifuron', 'Flupyradifuron', 'Flupyradifurone', 'Insecticide', '4D', '951659-40-8', 'Butenolide', 2),
  ('tau-fluvalinaat', 'Tau-fluvalinaat', 'Tau-fluvalinate', 'Insecticide', '3A', '102851-06-9', 'Pyrethroide', 2),
  ('etofenprox', 'Etofenprox', 'Etofenprox', 'Insecticide', '3A', '80844-07-1', 'Pyrethroide', 2),
  -- Biologische insecticiden
  ('bacillus thuringiensis subsp. kurstaki', 'Bacillus thuringiensis kurstaki', 'Bacillus thuringiensis kurstaki', 'Insecticide (biologisch)', '11A', NULL, 'Biologisch Bt-toxine', NULL),
  ('cydia pomonella granulovirus', 'CpGV (Granulovirus)', 'Cydia pomonella granulovirus', 'Insecticide (biologisch)', NULL, NULL, 'Biologisch virus', NULL),
  ('beauveria bassiana stam gha', 'Beauveria bassiana GHA', 'Beauveria bassiana GHA', 'Insecticide (biologisch)', NULL, NULL, 'Biologisch schimmel', NULL),
  -- Acariciden (aanvulling)
  ('etoxazool', 'Etoxazool', 'Etoxazole', 'Acaricide', '10B', '153233-91-1', 'METI acaricide', 1),
  ('fenpyroximaat', 'Fenpyroximaat', 'Fenpyroximate', 'Acaricide', '21A', '134098-61-6', 'METI acaricide', 1),
  ('milbemectin', 'Milbemectin', 'Milbemectin', 'Acaricide', '6', '51596-10-2', 'Avermectine', 2),
  ('clofentezine', 'Clofentezine', 'Clofentezine', 'Acaricide', '10A', '74115-24-5', 'Clofentezine groep', 1),
  -- Groeiregulatoren
  ('prohexadion-calcium', 'Prohexadion-calcium', 'Prohexadione-calcium', 'Groeiregulator', NULL, '127277-53-6', 'GA-biosynthese remmer', 3),
  ('1-methylcyclopropeen', '1-MCP', '1-Methylcyclopropene', 'Groeiregulator', NULL, '3100-04-7', 'Ethyleen receptor blokker', 1),
  ('6-benzyladenine', '6-BA', '6-Benzyladenine', 'Groeiregulator', NULL, '1214-39-7', 'Cytokinine', 2),
  ('ethefon', 'Ethefon', 'Ethephon', 'Groeiregulator', NULL, '16672-87-0', 'Ethyleen generator', 2),
  ('gibberellinezuur', 'Gibberellinezuur', 'Gibberellic acid', 'Groeiregulator', NULL, '77-06-5', 'Gibberelline', 3),
  -- Herbiciden (fruit)
  ('glyfosaat', 'Glyfosaat', 'Glyphosate', 'Herbicide', '9', '1071-83-6', 'EPSPS remmer', 2),
  ('glufosinaat-ammonium', 'Glufosinaat-ammonium', 'Glufosinate-ammonium', 'Herbicide', '10', '77182-82-2', 'Glutamine synthetase remmer', 2),
  ('flumioxazin', 'Flumioxazin', 'Flumioxazine', 'Herbicide', '14', '103361-09-7', 'PPO remmer', 1),
  ('isoxaben', 'Isoxaben', 'Isoxaben', 'Herbicide', '21', '82558-50-7', 'Cellulose biosynthese remmer', 1),
  ('pendimethalin', 'Pendimethalin', 'Pendimethalin', 'Herbicide', '3', '40487-42-1', 'Dinitroaniline', 1),
  -- Hulpstoffen
  ('paraffineolie', 'Paraffineolie', 'Mineral oil', 'Insecticide/Acaricide', NULL, '8042-47-5', 'Fysisch werkend', 3),
  ('kaliumbicarbonaat', 'Kaliumbicarbonaat', 'Potassium bicarbonate', 'Fungicide', 'NC', '298-14-6', 'Niet geclassificeerd', NULL),
  ('ijzer(III)fosfaat', 'IJzer(III)fosfaat', 'Ferric phosphate', 'Molluscicide', NULL, '10045-86-0', 'Stofwisselingsremmer', NULL),
  ('metaldehyde', 'Metaldehyde', 'Metaldehyde', 'Molluscicide', NULL, '108-62-3', 'Zenuwstelsel', NULL)
ON CONFLICT (code) DO UPDATE SET
  resistance_group = COALESCE(EXCLUDED.resistance_group, active_substances.resistance_group),
  cas_number = COALESCE(EXCLUDED.cas_number, active_substances.cas_number),
  mode_of_action = COALESCE(EXCLUDED.mode_of_action, active_substances.mode_of_action),
  category = COALESCE(EXCLUDED.category, active_substances.category),
  last_updated = NOW();

-- ============================================
-- Re-populate product_substances junction table
-- Now matches more substances since we added ~45 new ones
-- ============================================

-- Clear and re-insert to avoid stale data
TRUNCATE product_substances;

INSERT INTO product_substances (product_id, substance_code, concentration_unit)
SELECT DISTINCT
  cp.toelatingsnummer,
  asub.code,
  (SELECT s->>'concentratie'
   FROM jsonb_array_elements(cp.samenstelling->'stoffen') s
   WHERE lower(s->>'naam') = lower(asub.name)
   LIMIT 1
  )
FROM ctgb_products cp
CROSS JOIN LATERAL unnest(cp.werkzame_stoffen) ws(stof)
JOIN active_substances asub ON lower(ws.stof) = lower(asub.name)
ON CONFLICT (product_id, substance_code) DO NOTHING;
