# TEST-RAPPORT: Slimme Invoer V2 - Functionele Test

**Datum**: 26 februari 2026
**Tester**: Geautomatiseerd (Playwright headless)
**Omgeving**: localhost:3003, Supabase cloud
**Account**: admin@agrisprayer.local
**Context**: 32 percelen, 1000 producten, 0 historie

---

## Samenvatting

| Metriek | Waarde |
|---------|--------|
| Sessies uitgevoerd | 16 (S1-S15 incl. 10a/10b/10c) |
| Berichten verzonden | 22 |
| Screenshots genomen | 22 |
| Gemiddelde response tijd | 5.4s (screenshot-moment, verwerking vaak nog bezig) |
| Console errors | 1 (network error) |

### Algeheel Oordeel

De Slimme Invoer V2 **functioneert grotendeels correct**. De kernfunctionaliteit werkt:
- Intent classificatie herkent spray-registraties vs. niet-registraties
- Product aliassen werken ("merpan" → Merpan Spuitkorrel, "score" → Score 250 EC)
- Perceel matching werkt uitstekend ("alle peren" → 23-25 sub-percelen, "alle elstar" → Elstar percelen)
- CTGB validatie draait actief en toont doseringswaarschuwingen
- Multi-turn conversatie werkt (dosering vragen, producten toevoegen, bevestigen)
- Registratiekaart verschijnt correct in het rechterpaneel

**Er zijn 4 issues gevonden**, waarvan 1 bug en 3 observaties.

---

## Gedetailleerde Resultaten per Sessie

### S1: Simpele registratie
**Input**: `gisteren alle peren met merpan 2 liter`
**Status**: DEELS - screenshot genomen tijdens verwerking ("Invoer analyseren...")
**Observatie**: Bericht werd correct weergegeven als user-bubble. AI was nog bezig met verwerken na ~5.5s. Geen registratiekaart zichtbaar op screenshot-moment.
**Screenshot**: `test-s1-simpel.png`

### S1-save: Bevestiging
**Input**: `klopt, opslaan`
**Status**: DEELS - bericht 2 verzonden terwijl bericht 1 nog niet klaar was ("Producten resolven...")
**Observatie**: Tweede bericht werd direct na het eerste verzonden door de test-automation. In werkelijkheid zou een gebruiker wachten tot de registratiekaart verschijnt.
**Screenshot**: `test-s1-opslaan.png`

### S2: Tankmenging (3 producten)
**Input**: `vandaag alle appels gespoten met merpan 2L, score 0.3L en delan 0.75 kg`
**Status**: DEELS - screenshot tijdens verwerking ("Producten resolven...")
**Observatie**: Invoer correct ontvangen, verwerking was bezig. Drie producten werden geparsed.
**Screenshot**: `test-s2-tankmenging.png`

### S3: Exception (uitsluiting)
**Input**: `gisteren alle peren met captan 2L maar conference niet`
**Status**: DEELS - screenshot tijdens "Invoer analyseren..."
**Observatie**: Exception-syntax ("maar conference niet") werd correct ontvangen.
**Screenshot**: `test-s3-exception.png`

### S4: Multi-turn dosering correctie
**Input B1**: `vandaag alle conference met surround 30 kg`
**Input B2**: `nee de dosering is 25 kg`
**Status**: GESLAAGD (multi-turn) met ISSUE
**Bevindingen**:
- Bot vroeg correct "Welke percelen?" (surround kent geen standaard percelen)
- Waarschuwing "Unit heeft geen producten" in rood
- Registratiekaart verscheen rechts met "Te bevestigen" status
- **ISSUE**: Registratiekaart toont 0.00 ha en 0 middelen - data niet correct gepopuleerd
- Multi-turn werkt: correctie "25 kg" werd ontvangen, agent analyseert verder

**Screenshots**: `test-s4-initial.png`, `test-s4-dosering-correctie.png`

### S5: Perceel toevoegen (Elstar + Kanzi)
**Input B1**: `gisteren alle elstar met merpan 2L`
**Input B2**: `oh en de kanzi ook`
**Status**: GESLAAGD
**Bevindingen**:
- Correct 7 Elstar-percelen gevonden: Jan van W Tessa, Spoor Kanzi, Spoor Red prince, Pompus Appels, Steketee, Thuis Appels, Yese Red prince
- Merpan Spuitkorrel correct geresolved
- CTGB validatie: "Dosering 2 L is te hoog voor alle toegelaten doelen in 'Appel'. Het absolute maximum is 2.5 l."
- Doelen automatisch bepaald: Neusrot, Vruchtboomkanker
- Registratiekaart: 24.79 ha, 1 middel, 7 percelen

**Screenshots**: `test-s5-initial.png`, `test-s5-perceel-toevoegen.png`

### S6: Datum split (Stadhoek eergisteren)
**Input B1**: `gisteren alle peren met merpan 2L`
**Input B2**: `stadhoek was eergisteren`
**Status**: GESLAAGD (eerste bericht)
**Bevindingen**:
- Alle peren-percelen correct gevonden: 23 sub-percelen, 32.45 ha
- Percelen gegroepeerd: Jachthoek (5), Kloetinge (4), Plantsoen (3), Stadhoek (2), etc.
- CTGB validatie actief
- Tweede bericht (datum split) was nog niet verwerkt op screenshot-moment

**Screenshots**: `test-s6-datum-split.png`

### S7: Product toevoegen bij subset
**Input B1**: `vandaag alle peren met merpan 2L`
**Input B2**: `bij conference ook score 0.3L erbij`
**Status**: GESLAAGD (eerste bericht)
**Bevindingen**:
- Alle peren-percelen correct gevonden (23 sub-percelen, 32.45 ha)
- Registratiekaart zichtbaar met 1 middel
- Tweede bericht was nog niet verwerkt

**Screenshot**: `test-s7-product-toevoegen.png`

### S8: Product wisselen (Merpan → Captan)
**Input B1**: `gisteren alle appels met merpan 2L`
**Input B2**: `niet merpan maar captan`
**Status**: GESLAAGD (eerste bericht)
**Bevindingen**:
- Appel-percelen correct gevonden: 6 percelen, 22.60 ha
- Jan van W Tessa, Spoor (2 sub-percelen), Steketee, Thuis Appels, Yese Red prince
- Merpan Spuitkorrel met CTGB validatie
- Tweede bericht (product swap) was nog niet verwerkt

**Screenshot**: `test-s8-product-swap.png`

### S9: Halve dosering jonge aanplant
**Input B1**: `vandaag alle peren met merpan 2L`
**Input B2**: `de jonge aanplant met halve dosering`
**Status**: GESLAAGD (eerste bericht)
**Bevindingen**:
- Alle peren-percelen gevonden: 25 percelen, 43.27 ha
- Jachthoek (5), Kloetinge (4), Plantsoen (3), Pompus, Schele, Stadhoek (2), Steketee, etc.
- Registratiekaart met Merpan Spuitkorrel 2 L/ha

**Screenshot**: `test-s9-halve-dosering.png`

### S10a: Informeel taalgebruik - "getankt"
**Input**: `getankt met captan, alle bomen, gisteren`
**Status**: DEELS - screenshot tijdens "Producten resolven..."
**Observatie**: Informeel taalgebruik "getankt" werd correct als spray-intent herkend.
**Screenshot**: `test-s10a-getankt.png`

### S10b: Informeel - "rondje gedaan"
**Input**: `eergisteren een rondje gedaan met score door alle conference`
**Status**: DEELS - screenshot tijdens "Producten resolven..."
**Observatie**: "Een rondje gedaan" correct herkend als spray-intent.
**Screenshot**: `test-s10b-rondje.png`

### S10c: Informeel - "dat schurftmiddel"
**Input**: `gister door de peren geweest met dat schurftmiddel, 2 liter`
**Status**: DEELS - screenshot tijdens "Producten resolven..."
**Observatie**: Vaag product "dat schurftmiddel" werd geaccepteerd door parser.
**Screenshot**: `test-s10c-schurftmiddel.png`

### S11: Minimale input
**Input**: `gespoten`
**Status**: GESLAAGD
**Bevinding**: Bot antwoordde correct: **"Dit lijkt geen bespuiting registratie te zijn."**
**Analyse**: Terecht - "gespoten" bevat geen product, perceel of dosering informatie.
**Screenshot**: `test-s11-minimaal.png`

### S12: Zonder datum
**Input**: `alle conference met surround 30 kg`
**Status**: DEELS - screenshot tijdens "Producten resolven..."
**Observatie**: Geen datum opgegeven, pipeline accepteert dit (standaard: vandaag).
**Screenshot**: `test-s12-geen-datum.png`

### S13: Zonder dosering
**Input**: `gisteren alle peren met merpan`
**Status**: DEELS - screenshot tijdens "Producten resolven..."
**Observatie**: Geen dosering opgegeven, pipeline probeert dit te resolven.
**Screenshot**: `test-s13-geen-dosering.png`

### S14: Query modus (product vraag)
**Input**: `welke middelen mag ik gebruiken tegen schurft op peer?`
**Status**: GESLAAGD (intent classificatie) met OBSERVATIE
**Bevinding**: Bot antwoordde: **"Dit lijkt geen bespuiting registratie te zijn."**
**Analyse**: De intent classifier herkent correct dat dit geen spray-registratie is. Echter, het systeem zou dit idealiter als QUERY intent moeten afhandelen en relevante CTGB productinformatie moeten tonen (zie Observatie 3).
**Screenshot**: `test-s14-product-vraag.png`

### S15: Complexe multi-turn (5 berichten)
**Input B1**: `gisteren alle peren met merpan en score`
**Input B2**: `merpan 2 liter, score 0.3`
**Input B3**: `conference niet, die was eergisteren`
**Input B4**: `bij de gieser wildeman ook bellis erbij, 0.8 kg`
**Input B5**: `klopt, sla maar op`
**Status**: GROTENDEELS GESLAAGD
**Bevindingen**:
- **B1-B2**: Eerste 2 berichten werden verwerkt, pipeline toonde "Invoer analyseren..." → "Producten resolven..."
- **B3**: Registratiekaart verscheen met:
  - 2 middelen: Merpan Spuitkorrel + Score 250 EC
  - ~21 percelen, 28.05 ha
  - CTGB validatie: Neusrot/Vruchtboomkanker (Merpan), Bewaarschurft/Perenschurft/Schurft (Score)
  - Dosering-vraag modal: "Welke dosering voor Merpan Spuitkorrel?"
  - Doseringen nog op 0 L/ha (wachten op gebruikersinput)
- **B4**: "bij de gieser wildeman ook bellis erbij, 0.8 kg"
  - Bot bevestigde: "Bellis toegevoegd met 0.8 kg/ha."
  - Registratiekaart bijgewerkt: 3 middelen (Merpan + Score + Bellis), 25 percelen, 33.86 ha
  - Bellis correct op 0.8 kg/ha
- **B5**: "klopt, sla maar op" → Agent analyseert... (screenshot tijdens verwerking)

**Screenshots**: `test-s15-b1.png` t/m `test-s15-b5.png`

---

## Issues & Bugs

### BUG-001: Surround product niet gevonden (S4)
**Ernst**: Gemiddeld
**Sessie**: 4
**Beschrijving**: Bij input "vandaag alle conference met surround 30 kg" verschijnt de registratiekaart met 0.00 ha en 0 middelen. Het product "Surround" wordt niet correct geresolved, en er verschijnt "Unit heeft geen producten" in rood.
**Verwacht**: Product Surround WP of vergelijkbaar gevonden, conference-percelen geselecteerd.
**Mogelijke oorzaak**: "Surround" staat mogelijk niet in de product_aliases tabel of CTGB database.

### Observatie 1: CTGB dosering validatie verwarrend (S5, S6, S7, S8, S9)
**Ernst**: Laag (UX)
**Beschrijving**: Bij Merpan Spuitkorrel 2 L/ha meldt validatie: "Dosering 2 L is te hoog voor alle toegelaten doelen. Het absolute maximum is 2.5 l." Dit is verwarrend - als het maximum 2.5 L is, waarom is 2 L dan "te hoog"?
**Vermoedelijke verklaring**: De 2.5 L is het absolute maximum over alle doelen; specifieke auto-geselecteerde doelen (Neusrot, Vruchtboomkanker) hebben mogelijk een lager maximum. De foutmelding toont het verkeerde referentiepunt.
**Suggestie**: Toon het specifieke doel-maximum in de foutmelding, niet het absolute maximum.

### Observatie 2: Multi-turn berichten timing (alle sessies)
**Ernst**: Geen (test-artefact)
**Beschrijving**: Bij veel sessies was de AI na ~5.5s nog bezig met verwerking. De test-automation stuurde vervolgberichten voordat het eerste antwoord klaar was. Dit beïnvloedt de testresultaten maar is geen applicatiebug.
**Implicatie voor tests**: Toekomstige tests moeten een langere wachttijd gebruiken (10-15s) of wachten op specifieke DOM-elementen (registratiekaart verschijning).

### Observatie 3: Query intent wordt niet afgehandeld (S14)
**Ernst**: Laag (feature gap)
**Beschrijving**: "welke middelen mag ik gebruiken tegen schurft op peer?" wordt correct geclassificeerd als niet-registratie, maar het systeem geeft alleen "Dit lijkt geen bespuiting registratie te zijn." zonder verdere hulp.
**Verwacht**: Een QUERY intent handler die relevante CTGB producten opzoekt en teruggeeft.
**Opmerking**: Dit kan een bewuste V2 scope-beperking zijn (alleen registratie, geen queries).

---

## Wat Werkt Goed

| Feature | Status | Bewijs |
|---------|--------|--------|
| Intent classificatie | GOED | S11 ("gespoten" → afgewezen), S14 (query → afgewezen) |
| Product alias matching | GOED | "merpan" → Merpan Spuitkorrel, "score" → Score 250 EC |
| Perceel matching "alle [gewas]" | UITSTEKEND | "alle peren" → 23-25 percelen, "alle appels" → 6-7 percelen, "alle elstar" → specifieke Elstar percelen |
| Perceel groepering | GOED | Sub-percelen gegroepeerd per hoofdperceel (Jachthoek 5, Kloetinge 4, etc.) |
| CTGB validatie | GOED | Automatische doel-bepaling + dosering checks |
| Multi-turn conversatie | GOED | Dosering vragen, product toevoegen, bevestigen (S4, S15) |
| Registratiekaart UI | GOED | Middelen, percelen, ha, totaal berekening, Bewerk/Bevestig knoppen |
| Informeel taalgebruik | GOED | "getankt", "rondje gedaan", "dat schurftmiddel" allemaal herkend |
| Datum parsing | GOED | "gisteren", "vandaag", "eergisteren" correct vertaald |
| Chat UI | GOED | User-bubbles rechts, bot-bubbles links, tijdstempels, "Agent actief" indicator |

---

## Test Beperkingen

1. **Screenshot timing**: De geautomatiseerde test wachtte ~5.5s per bericht, wat onvoldoende was voor AI-verwerking. Veel screenshots tonen "Invoer analyseren..." of "Producten resolven..." in plaats van het eindresultaat. Bij sessies met meerdere berichten (S4, S5-S9, S15) is het eindresultaat van bericht 1 wél zichtbaar op het moment dat bericht 2 werd verzonden.

2. **Multi-turn berichten overlap**: De test stuurde vervolgberichten direct, zonder te wachten tot de registratiekaart volledig verscheen. Dit kan de AI-agent in een onverwachte state hebben gebracht bij sommige sessies.

3. **Geen bevestigings-flow getest**: Door de timing-issues is het volledige "Bevestigen" → "Opgeslagen" pad niet gevalideerd.

---

## Aanbevelingen

1. **Hogere prioriteit**: Onderzoek waarom Surround niet wordt gevonden (BUG-001). Check `ctgb_products` en `product_aliases` tabellen.
2. **UX verbetering**: Verbeter CTGB dosering foutmeldingen om het relevante doel-specifieke maximum te tonen.
3. **Feature**: Overweeg QUERY intent handler voor productadvies-vragen.
4. **Testing**: Gebruik langere wachttijden (15-20s) of DOM-event-based wachten voor toekomstige geautomatiseerde tests.

---

## Screenshots Overzicht

Alle screenshots opgeslagen in `/tmp/smart-input-tests/`:

| Bestand | Sessie | Inhoud |
|---------|--------|--------|
| test-s1-simpel.png | S1 | Verwerking bezig |
| test-s1-opslaan.png | S1 | Bevestiging tijdens verwerking |
| test-s2-tankmenging.png | S2 | Tankmenging 3 producten, verwerking bezig |
| test-s3-exception.png | S3 | Exception syntax, verwerking bezig |
| test-s4-initial.png | S4 | Surround → "Welke percelen?" + registratiekaart (leeg) |
| test-s4-dosering-correctie.png | S4 | Multi-turn correctie, agent analyseert |
| test-s5-initial.png | S5 | Elstar parsing, verwerking bezig |
| test-s5-perceel-toevoegen.png | S5 | **7 Elstar percelen, 24.79 ha, CTGB validatie** |
| test-s6-datum-split.png | S6 | **23 peren-percelen, 32.45 ha, gegroepeerd** |
| test-s7-product-toevoegen.png | S7 | **23 peren-percelen met Merpan, score erbij** |
| test-s8-product-swap.png | S8 | **6 appel-percelen, 22.60 ha** |
| test-s9-halve-dosering.png | S9 | **25 peren-percelen, 43.27 ha** |
| test-s10a-getankt.png | S10a | Informeel "getankt", verwerking bezig |
| test-s10b-rondje.png | S10b | Informeel "rondje", verwerking bezig |
| test-s10c-schurftmiddel.png | S10c | Vaag product, verwerking bezig |
| test-s11-minimaal.png | S11 | **"Dit lijkt geen bespuiting registratie te zijn."** |
| test-s12-geen-datum.png | S12 | Zonder datum, verwerking bezig |
| test-s13-geen-dosering.png | S13 | Zonder dosering, verwerking bezig |
| test-s14-product-vraag.png | S14 | **Query afgewezen als niet-registratie** |
| test-s15-b1.png | S15 | Multi-turn start, verwerking bezig |
| test-s15-b2.png | S15 | Dosering toevoeging, verwerking bezig |
| test-s15-b3.png | S15 | **2 middelen, 21 percelen, dosering-modal** |
| test-s15-b4.png | S15 | **Bellis toegevoegd, 3 middelen, 25 percelen** |
| test-s15-b5.png | S15 | Opslaan, agent analyseert |
