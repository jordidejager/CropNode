-- ============================================
-- 040: Enrich active_substances with missing fruit farming substances
-- Add FRAC/IRAC codes, CAS numbers, and mode of action
-- Then re-populate product_substances junction
-- ============================================

INSERT INTO active_substances (code, name, name_en, category, resistance_group, cas_number, mode_of_action, max_applications_per_year) VALUES
  -- Biologische fungiciden
  ('aureobasidium-dsm14940', 'Aureobasidium pullulans stam DSM 14940', 'Aureobasidium pullulans DSM 14940', 'Fungicide', 'BM02', NULL, 'Biologisch - competitie', 3),
  ('aureobasidium-dsm14941', 'Aureobasidium pullulans stam DSM 14941', 'Aureobasidium pullulans DSM 14941', 'Fungicide', 'BM02', NULL, 'Biologisch - competitie', 3),
  ('bacillus-qst713', 'Bacillus amyloliquefaciens stam QST 713', 'Bacillus amyloliquefaciens QST 713', 'Fungicide', 'BM02', NULL, 'Biologisch - antibiose', 6),
  ('bacillus-d747', 'Bacillus amyloliquefaciens subsp. plantarum stam D747', 'Bacillus amyloliquefaciens D747', 'Fungicide', 'BM02', NULL, 'Biologisch - antibiose', 6),
  ('trichoderma-sc1', 'Trichoderma atroviride strain SC1', 'Trichoderma atroviride SC1', 'Fungicide', 'BM02', NULL, 'Biologisch - competitie', 2),
  ('trichoderma-t22', 'Trichoderma harzianum Rifai stam T-22', 'Trichoderma harzianum T-22', 'Fungicide', 'BM02', NULL, 'Biologisch - competitie', 4),
  ('candida-o', 'Candida oleophila stam O', 'Candida oleophila O', 'Fungicide', 'BM02', NULL, 'Biologisch - competitie', 2),
  ('laminarin', 'Laminarin', 'Laminarin', 'Fungicide', 'P04', NULL, 'Plant defence inducer (elicitor)', 6),
  ('kalium-waterstofcarbonaat', 'Kalium waterstofcarbonaat', 'Potassium hydrogen carbonate', 'Fungicide', 'NC', '298-14-6', 'Multi-site contact activity', 10),

  -- Biologische insecticiden
  ('cpgv', 'Cydia pomonella granulovirus (CpGV)', 'Codling moth granulovirus', 'Insecticide', '31', NULL, 'Baculovirus', 10),
  ('bt-kurstaki-sa11', 'Bacillus thuringiensis subsp. kurstaki stam SA-11', 'Bt kurstaki SA-11', 'Insecticide', '11A', NULL, 'Bacterieel insecticide', 6),
  ('acequinocyl', 'Acequinocyl', 'Acequinocyl', 'Acaricide', '20B', '57960-19-7', 'Mitochondrial complex III (Qo site)', 2),

  -- Feromonen (verwarring)
  ('ee-dodecadienol', '(E,E)-8,10-Dodecadieen-1-ol', '(E,E)-8,10-Dodecadien-1-ol', 'Feromoon', 'NC', NULL, 'Feromoon verwarring (fruitmot)', NULL),
  ('z-tetradecenylacetaat', '(Z)-tetradec-9-enylacetaat', '(Z)-9-Tetradecenyl acetate', 'Feromoon', 'NC', NULL, 'Feromoon verwarring (bladroller)', NULL),
  ('z-11-tetradecenylacetaat', '(Z)-11-tetradecen-1-ylacetaat', '(Z)-11-Tetradecenyl acetate', 'Feromoon', 'NC', NULL, 'Feromoon verwarring (bladroller)', NULL),
  ('dodecan-1-ol', 'Dodecan-1-ol', 'Dodecanol', 'Feromoon', 'NC', '112-53-8', 'Feromoon synergist', NULL),
  ('tetradecanol', 'Tetradecanol', 'Tetradecanol', 'Feromoon', 'NC', '112-72-1', 'Feromoon synergist', NULL),

  -- Groeiregulatoren
  ('metamitron', 'Metamitron', 'Metamitron', 'Groeiregulator', '5', '41394-05-2', 'Fotosynthese remmer (dunner)', 3),

  -- Herbiciden (fruitteelt-relevant)
  ('glyfosaat', 'Glyfosaat', 'Glyphosate', 'Herbicide', '9', '1071-83-6', 'EPSP synthase remmer', 2),
  ('24-d', '2,4-D', '2,4-D', 'Herbicide', '4', '94-75-7', 'Auxine-achtig', 1),
  ('mcpa', 'MCPA', 'MCPA', 'Herbicide', '4', '94-74-6', 'Auxine-achtig', 1),
  ('propyzamide', 'Propyzamide', 'Propyzamide', 'Herbicide', '3', '23950-58-5', 'Mitose remmer', 1),
  ('isoxaben', 'Isoxaben', 'Isoxaben', 'Herbicide', '21', '82558-50-7', 'Celwand synthese remmer', 1),
  ('propaquizafop', 'Propaquizafop', 'Propaquizafop', 'Herbicide', '1', '111479-05-1', 'ACCase remmer', 1),

  -- Mollusciciden
  ('ijzer-iii-fosfaat', 'IJzer(III)fosfaat', 'Ferric phosphate', 'Molluscicide', 'NC', '10045-86-0', 'Maagwerking slakken', 4),
  ('ijzer-iii-pyrofosfaat', 'IJzer(III)pyrofosfaat', 'Ferric pyrophosphate', 'Molluscicide', 'NC', '10058-44-3', 'Maagwerking slakken', 4),

  -- Overige
  ('koolzaadolie', 'Koolzaadolie', 'Rapeseed oil', 'Insecticide', 'NC', NULL, 'Fysische werking (verstikking)', 6),
  ('vetzuren-kaliumzouten', 'Vetzuren C8-C18, kaliumzouten', 'Fatty acid potassium salts', 'Insecticide', 'NC', NULL, 'Fysische werking (insecticide zeep)', 8),

  -- Pyraclostrobine (NL spelling variant in some products like Bellis)
  ('pyraclostrobine', 'Pyraclostrobine', 'Pyraclostrobin', 'Fungicide', '11', '175013-18-0', 'QoI strobilurin', 3)
ON CONFLICT (code) DO UPDATE SET
  resistance_group = COALESCE(EXCLUDED.resistance_group, active_substances.resistance_group),
  cas_number = COALESCE(EXCLUDED.cas_number, active_substances.cas_number),
  mode_of_action = COALESCE(EXCLUDED.mode_of_action, active_substances.mode_of_action),
  last_updated = NOW();

-- ============================================
-- Re-populate product_substances for ALL matching substances
-- (including newly added ones)
-- ============================================

INSERT INTO product_substances (product_id, substance_code)
SELECT DISTINCT
  cp.toelatingsnummer,
  asub.code
FROM ctgb_products cp
CROSS JOIN LATERAL unnest(cp.werkzame_stoffen) ws(stof)
JOIN active_substances asub ON lower(ws.stof) = lower(asub.name)
WHERE NOT EXISTS (
  SELECT 1 FROM product_substances ps
  WHERE ps.product_id = cp.toelatingsnummer AND ps.substance_code = asub.code
)
ON CONFLICT (product_id, substance_code) DO NOTHING;
