# Brede GWB Middelentest - Slimme Invoer V2

**Datum:** 1 maart 2026
**Versie:** Eindrapport na fixes

---

## Samenvatting

| Metric | Waarde |
|--------|--------|
| **Totaal tests** | 25 |
| **Geslaagd** | 24 (96%) |
| **Gefaald** | 1 (Apollo - niet in CTGB DB) |
| **Broken aliases gefixt** | 4 (Decis, Karate, Chorus, Luna) |
| **Bestanden gewijzigd** | 4 bronbestanden + 15 DB records |

---

## Testresultaten per Categorie

### Fungiciden (6/6)

| Test | Input | Product | Dosering | Status |
|------|-------|---------|----------|--------|
| A1 | vandaag alle conference met merpan 0.7 kg | Merpan Spuitkorrel | 0.7 kg/ha | PASS |
| A2 | vandaag alle peren met delan 0.5 kg | Delan DF | 0.5 kg/ha | PASS |
| A3 | vandaag alle elstar met bellis 0.8 kg | Bellis | 0.8 kg/ha | PASS |
| A4 | vandaag alle conference met flint 0.15 kg | FLINT | 0.15 kg/ha | PASS |
| A5 | vandaag alle peren met scala 0.75 L | Scala | 0.75 L/ha | PASS |
| A6 | vandaag alle conference met score 0.2 L | Score 250 EC | 0.2 L/ha | PASS |

### Insecticiden (4/4)

| Test | Input | Product | Dosering | Status |
|------|-------|---------|----------|--------|
| B1 | vandaag alle appels met decis 0.25 L | Decis Protech | 0.25 L/ha | PASS (niet toegelaten voor fruit) |
| B2 | vandaag alle peren met pirimor 0.5 kg | Pirimor | 0.5 kg/ha | PASS |
| B3 | vandaag alle appels met coragen 0.18 L | CORAGEN | 0.18 L/ha | PASS |
| B4 | vandaag alle conference met karate zeon 0.15 L | Karate Next | 0.15 L/ha | PASS |

### Acariciden (2/3)

| Test | Input | Product | Dosering | Status |
|------|-------|---------|----------|--------|
| C1 | vandaag alle appels met nissorun 0.2 L | Nissorun vloeibaar | 0.2 L/ha | PASS |
| C2 | vandaag alle peren met apollo 0.3 L | Apollo 50 SC | 0.3 L/ha | FAIL (niet in CTGB DB) |
| C3 | vandaag alle elstar met floramite 0.4 L | FLORAMITE 240 SC | 0.4 L/ha | PASS |

### Groeiregulator (1/1)

| Test | Input | Product | Dosering | Status |
|------|-------|---------|----------|--------|
| D1 | vandaag alle appels met regalis plus 2.5 kg | Regalis Plus | 2.5 kg/ha | PASS |

### Overig (2/2)

| Test | Input | Product | Dosering | Status |
|------|-------|---------|----------|--------|
| D2 | vandaag alle conference met teldor 1.5 kg | Teldor | 1.5 kg/ha | PASS |
| D3 | vandaag alle peren met switch 1 kg | Switch | 1 kg/ha | PASS |

### Lastige namen (3/3)

| Test | Input | Product | Dosering | Status |
|------|-------|---------|----------|--------|
| E1 | vandaag alle conference met chorus 0.6 kg | CHORUS 50 WG | 0.6 kg/ha | PASS |
| E2 | vandaag alle appels met luna experience 0.75 L | LUNA EXPERIENCE | 0.75 L/ha | PASS |
| E3 | vandaag alle peren met captosan 1.1 L | Captosan 500 SC | 1.1 L/ha | PASS |

### Eenheidsconversie (3/3)

| Test | Input | Conversie | Status |
|------|-------|-----------|--------|
| F1 | vandaag alle conference met merpan 700 gram | 700g correct verwerkt | PASS |
| F2 | vandaag alle elstar met scala 750 ml | 750ml correct verwerkt | PASS |
| F3 | vandaag alle peren met score 200 ml | 200ml correct verwerkt | PASS |

### Tankmix (3/3)

| Test | Input | Producten | Status |
|------|-------|-----------|--------|
| G1 | vandaag alle conference met merpan 0.7 kg en score 0.2 L | Merpan + Score | PASS |
| G2 | vandaag alle peren met delan 0.5 kg + flint 0.15 kg | Delan + FLINT | PASS |
| G3 | vandaag alle conference met merpan 0.7 kg, score 0.2 L en flint 0.15 kg | Merpan + Score + FLINT | PASS |

---

## Gevonden & Opgeloste Issues

### Broken Aliases (4 gefixt)

| Product | Was (broken) | Nu (correct) | Oorzaak |
|---------|-------------|-------------|---------|
| Decis | Decis EC | Decis Protech | Verkeerde productnaam in alias |
| Karate | Karate Zeon | Karate Next | Product hernoemd door fabrikant |
| Chorus | Chorus | CHORUS 50 WG | Case-mismatch + ontbrekend suffix |
| Luna | Luna Sensation | LUNA EXPERIENCE | Verkeerd product in alias |

### Overige gecorrigeerde aliases

| Alias | Was | Nu |
|-------|-----|-----|
| flint | Flint | FLINT |
| tracer | Tracer | TRACER |
| nissorun | Nissorun | Nissorun vloeibaar |
| floramite | Floramite 240 SC | FLORAMITE 240 SC |
| madex | Madex Top | Madex Top SC |
| carpovirusine | Carpovirusine Evo 2 | CARPOVIRUSINE EVO 2 |
| teppeki | Teppeki | TEPPEKI |
| syllit | Syllit Flow | Syllit Flow 400 SC |
| vertimec | Vertimec | Vertimec Gold |
| ridomil | Ridomil Gold | Ridomil Gold SL |
| amistar | Amistar | Amistar Top |
| kumulus | Kumulus WG | KUMULUS |

### Verwijderde aliases (producten niet in CTGB DB)

Calypso, Movento, Steward, Runner, Envidor, Apollo, Masai, Batavia, Basta, Roundup, WOPRO Luisweg, Solubor, Rhodofix, Fontelis, Pristine

---

## Gewijzigde Bestanden

### 1. `src/lib/product-aliases.ts` (MAIN alias service)
- 15+ aliases gecorrigeerd naar exacte CTGB productnamen
- 15+ broken aliases verwijderd (producten niet in DB)
- 6 nieuwe aliases toegevoegd (captosan, karate zeon, karate next, decis protech, luna experience, exilis)

### 2. `src/lib/validation/product-matcher.ts` (product matcher)
- 17+ statische aliases gecorrigeerd
- Aliases voor niet-bestaande producten verwijderd

### 3. `src/lib/validation-service.ts` (validatie service)
- Alias resolution + fuzzy matching toegevoegd aan product lookup
- Was: exact-match only (lijn 946)
- Nu: alias resolution -> exact match -> starts-with match -> contains match

### 4. `src/lib/validation/ctgb-engine.ts` (CTGB engine)
- Alias resolution + fuzzy matching in `validateSprayApplication`
- Alias resolution + fuzzy matching in `quickValidate`

### 5. `product_aliases` database tabel (Supabase)
- 15+ database aliases geüpdatet via REST API

---

## Bekende Beperkingen

1. **Apollo (C2)**: Product "Apollo 50 SC" bestaat niet in de CTGB database. Waarschijnlijk niet meer toegelaten in NL.
2. **Decis Protech**: Correct geresolved maar niet toegelaten voor fruitteelt (alleen akkerbouw). CTGB validatie geeft terecht een waarschuwing.
3. **AI parsing**: Gemini retourneert soms lege products in V2 flat-string format. Percelen worden via pre-processing als fallback correct geselecteerd.

---

## CTGB Database Dekking

| Categorie | In DB | Niet in DB |
|-----------|-------|------------|
| Fungiciden | Merpan, Delan DF, Bellis, FLINT, Scala, Score 250 EC, CHORUS 50 WG, Teldor, Switch, LUNA EXPERIENCE, Folicur, Geoxe, Sercadis, Stroby WG, Captosan 500 SC | Fontelis, Pristine |
| Insecticiden | Pirimor, Karate Next, Decis Protech, TRACER, CORAGEN, TEPPEKI, Sivanto Prime, Exirel, Milbeknock | Calypso, Movento, Steward, Runner |
| Acariciden | Nissorun vloeibaar, FLORAMITE 240 SC, Vertimec Gold | Envidor, Apollo, Masai |
| Groeiregulatoren | Regalis Plus, Brevis, Exilis 100 SC, MaxCel, SURROUND | Rhodofix |
| Herbiciden | Kerb Flo, Spotlight Plus | Roundup, Basta |
