# CropNode Testrapport - Uitgebreide Functionaliteitstest

**Testdatum:** 4 maart 2026
**Testpersona:** Henk van den Berg - Fruitbedrijf Van den Berg, Betuwe
**Account:** henk.vandenberg@fruitbedrijfvandenberg.nl
**Bedrijfstype:** Fruitteelt, ~40 hectare
**Testomgeving:** Lokale dev server (port 3005)

---

## 1. Samenvatting

CropNode is een veelbelovend platform voor fruitteeltbedrijven. De app biedt een breed scala aan functionaliteiten: perceelbeheer, gewasbescherming (spuitschrift), oogstregistratie, koelcelbeheer, weerdata, urenregistratie en een AI-gestuurde invoer. De basis is solide, maar er zijn enkele **kritieke bugs** gevonden, waaronder een data-isolatieprobleem.

### Totaalscore: 7/10

| Categorie | Score | Status |
|-----------|-------|--------|
| Registratie & Login | 9/10 | Goed |
| Perceelbeheer | 9/10 | Uitstekend |
| Perceel Kaart | 6/10 | Basis werkt, zoekfunctie niet |
| Crop Care - Spuitschrift | 7/10 | Formulier werkt, middelen zoeken niet gekoppeld |
| Crop Care - CTGB Database | 9/10 | Uitstekend |
| Crop Care - Voorraad | 3/10 | Levering opslaan faalt |
| Harvest Hub - Oogst | 8/10 | Werkt, maar data-isolatie bug |
| Harvest Hub - Koelcel | 9/10 | Indrukwekkende wizard |
| Weather Hub | 7/10 | Radar werkt, weerdata ontbreekt |
| Command Center | 8/10 | Slimme interface, sessie crashte |
| Team & Tasks | 8/10 | Compleet formulier |
| Research Hub | 8/10 | Field Signals mooi concept |
| Data-isolatie | 4/10 | KRITIEK - meerdere tabellen lekken |
| Navigatie & UI | 9/10 | Fraai, professioneel design |

---

## 2. Gedetailleerde Testresultaten

### 2.1 Registratie & Login

**Test:** Nieuw account aanmaken als fruitteler
**Resultaat:** GESLAAGD

- Registratieformulier werkt correct met velden: email, wachtwoord, naam, bedrijfsnaam, teelttype
- Teelttype "Fruitteelt" geeft directe toegang; "Akkerbouw" en "Overig" tonen wachtlijst-bericht
- Na registratie automatische redirect naar Command Center
- Login met bestaand account werkt correct

**Bevinding:** Geen problemen gevonden.

---

### 2.2 Perceelbeheer (Lijstweergave)

**Test:** 4 percelen aanmaken met totaal 40 ha en diverse rassen
**Resultaat:** GESLAAGD

Aangemaakt bedrijf:
| Perceel | Blokken | Totaal |
|---------|---------|--------|
| Betuwe Noord | Elstar 5ha, Conference 4ha, Jonagold 3.5ha | 12.5 ha |
| Betuwe Zuid | Conference 5ha, Kanzi 5ha | 10 ha |
| Rivierweg | Golden Delicious 4.5ha, Doyenne du Comice 4ha | 8.5 ha |
| De Linge | Cox's Orange Pippin 5ha, Rode Boskoop 4ha | 9 ha |

**Positief:**
- "Perceel Componist" is een uitstekende UX - visuele verdeling met real-time teller
- "PERFECT VERDEELD - Klaar voor opslag" feedback is helder
- Live Bedrijfsoverzicht dashboard toont totalen correct (40.00 ha, 9 blokken, 8 rassen)
- Zoekfunctie op perceelnaam, gewas of ras aanwezig
- Hoofdpercelen-weergave en Kaart-weergave toggle
- Perceelkaarten tonen gewas, ras, hectares duidelijk met kleurcodering

**Bevinding:** Typo - knop zegt "Veder naar Samenstelling" in plaats van "Verder naar Samenstelling".

---

### 2.3 Perceelbeheer (Kaartweergave)

**Test:** Kaartweergave openen en RVO-percelen zoeken
**Resultaat:** DEELS GESLAAGD

**Positief:**
- Leaflet kaart met PDOK luchtfoto's laadt correct
- Zoomt standaard naar heel Nederland
- Adres-zoekbalk aanwezig

**Bug gevonden:**
- **Adres-zoekfunctie werkt niet:** Zoeken op "Buren Gelderland" triggert geen geocoding. De kaart zoomt niet in na invoer en Enter.
- Geen RVO-perceelimport knop gevonden (mogelijk niet geimplementeerd voor deze gebruiker)

---

### 2.4 Crop Care - Spuitschrift

**Test:** Nieuwe bespuiting toevoegen
**Resultaat:** DEELS GESLAAGD

**Positief:**
- Formulier "Nieuwe Bespuiting" is compleet: datum, tijd, percelen (multi-select), middelen, dosering, notities
- Perceelselectie werkt uitstekend met groepering per gewas, "Alles selecteren" en teller
- Toont "Totaal: 40.00 ha" bij alle percelen geselecteerd
- Chronologisch en Per Perceel weergave-tabs

**Bug gevonden:**
- **Middelzoekfunctie niet gekoppeld aan CTGB database:** In het bespuitingsformulier zoekt "Zoek een middel..." alleen in "Mijn Producten" (leeg voor nieuwe gebruiker). Zoeken op "Captan" geeft "Geen producten gevonden". De CTGB database (506 middelen) is niet doorzoekbaar vanuit het bespuitingsformulier.

---

### 2.5 Crop Care - CTGB Database

**Test:** Database Gewasbescherming doorzoeken
**Resultaat:** GESLAAGD

**Positief:**
- 506 relevante middelen voor hardfruit geladen
- Filterknoppen: Fungicide, Insecticide, Herbicide, Groeiregulator
- Zoeken op "Captan" geeft 11 resultaten (CAPITAL, Capone, Captosan 500 SC, Malvin WG, Merpan Flowable, etc.)
- Productkaarten tonen: naam, categorie (badge), werkzame stof, houder, toelatingssnr, geldigheid, dosering
- Database Meststoffen sectie ook aanwezig

**Bevinding:** Geen problemen gevonden. Uitstekende implementatie.

---

### 2.6 Crop Care - Voorraadbeheer

**Test:** Levering toevoegen aan voorraad
**Resultaat:** GEFAALD

**Bug gevonden:**
- **Levering opslaan faalt:** Formulier "Levering Toevoegen" (Middel: Captan, Hoeveelheid: 25, Eenheid: L) - de POST request retourneert 200 OK maar wordt afgebroken (net::ERR_ABORTED). Na pagina refresh is de levering niet opgeslagen. De dialog sluit niet na klikken op "Toevoegen".
- Middelzoekfunctie in voorraad: toont "Maak 'Captan' aan" in plaats van CTGB-producten te tonen. Middelen zijn niet gekoppeld aan de CTGB database.

---

### 2.7 Harvest Hub - Oogstregistratie

**Test:** Nieuwe oogst registreren
**Resultaat:** GESLAAGD (met data-isolatie bug)

**Positief:**
- Formulier "Nieuwe oogst registreren" is compleet: Perceel/Blok (dropdown met alle blokken), Plukdatum, Pluk nummer (1e pluk, 2e pluk etc.), Aantal kisten, Kwaliteitsklasse, Gewicht per kist (kg), Notities
- Registratie van 45 kisten Elstar (1e pluk, Klasse I, 18 kg/kist) succesvol opgeslagen
- Lijst- en Dagweergave tabs
- Seizoensfilter (2025-2026)
- Kisten totaal teller

**KRITIEKE BUG:**
- **Data-isolatie:** Oogstregistratie van "Jan van W Tessa" (30 kisten, 14 Feb 2026) van een andere gebruiker is zichtbaar voor henk.vandenberg. Dit is hetzelfde type data-lekprobleem als eerder gevonden bij percelen.

---

### 2.8 Harvest Hub - Koelcelbeheer

**Test:** Koelcel aanmaken
**Resultaat:** GESLAAGD

**Positief:**
- 5-staps wizard: Basis, Deuren, Verdampers, Hoogtes, Bevestigen
- Basisgegevens: naam, status (Actief/Inactief), breedte (kolommen), diepte (rijen), maximale stapelhoogte - allemaal met sliders
- Visuele "Voorvertoning" grid van de koelcel
- "KOELCEL 1 - ELSTAR" succesvol aangemaakt: 10x6 grid, max 480 kisten capaciteit
- Visueel koelcel-overzicht met zoom controls (100%)
- Capaciteit teller: "0/60 posities (0%) | Capaciteit: 480 kisten"

**Bevinding:** Indrukwekkende implementatie. De visuele koelcel-weergave is uniek.

---

### 2.9 Weather Hub

**Test:** Weather Dashboard bekijken
**Resultaat:** DEELS GESLAAGD

**Positief:**
- Locatie correct: Kapel-Avezaath (51.89°N, 5.35°O) - Betuwe regio
- Neerslagradar van Buienradar.nl embedded met live data
- "Komende 2 uur: Geen neerslag" indicator
- Legenda beschikbaar
- Bijgewerkt timestamp

**Bevinding:**
- "Geen actuele weerdata beschikbaar" - waarschijnlijk API key niet geconfigureerd in dev-omgeving
- Sub-secties (Ziektedruk, Seizoensanalyse, Expert Forecast) niet apart getest maar zichtbaar in navigatie

---

### 2.10 Command Center - Slimme Invoer

**Test:** AI-gestuurde bespuitingsinvoer testen
**Resultaat:** DEELS GESLAAGD

**Positief:**
- Welkomstbericht: "Goedenavond. Wat is het plan vandaag?" met contextuele suggesties
- Quick-action buttons: "Alle peren vandaag gespoten met", "Gisteren heel het bedrijf gespoten met"
- Natuurlijke taal input: "Wat heb je gespoten? (bijv. 1.5kg Captan op Elstar)"
- Meerdere invoermodi (Regi + 3 andere tabs)
- Quick-filter knoppen: "VANDAAG GESPOTEN", "GISTEREN ALLES AFGESPOTEN", "ZELFDE ALS V..."
- Rechter panel: "Actieve Registratie"
- "AGRIBOT MULTI-MODAL COMMAND CENTER" branding

**Bug gevonden:**
- **Sessie crasht na invoer:** Na het versturen van "Vandaag 1.5 kg Captan op alle Elstar percelen" werd de gebruiker uitgelogd en teruggestuurd naar het loginscherm. Dit duidt op een onafgehandelde fout in de API-call die de auth-sessie verbreekt.

---

### 2.11 Team & Tasks

**Test:** Pagina bekijken
**Resultaat:** GESLAAGD

**Positief:**
- Dashboard met: uren vandaag (0.0), geschatte kosten deze week (€0), top activiteit
- "Nieuwe Registratie" formulier: Taak (dropdown), Perceel (optioneel), Begindatum, Einddatum
- Twee modes: "Direct registreren" en "Taak starten" (timer)
- Urenregistratie knop in header

**Bevinding:** Niet uitgebreid getest qua data-opslag, maar formulier ziet er compleet uit.

---

### 2.12 Research Hub

**Test:** Pagina bekijken
**Resultaat:** GESLAAGD

**Positief:**
- "Ziekten & Plagen" encyclopedie voor appel & peer
- Tabs: Papers & Onderzoek, Field Signals
- "Nieuwe Field Signal": tekstveld met tags (Appel, Peer, Schurft, Kanker, Bemesting, Nieuws, Waarschuwing)
- Foto- en bijlage-upload mogelijkheid
- Trending Tags: #Schurft, #Appel, #Droogte, #Luizen
- Community-achtige functionaliteit voor het delen van veldobservaties

---

## 3. KRITIEKE BUGS

### BUG-001: Data-isolatie niet volledig (KRITIEK)
**Ernst:** KRITIEK
**Locatie:** Meerdere tabellen/views
**Beschrijving:** Gegevens van andere gebruikers zijn zichtbaar voor nieuwe gebruikers. Gefixt voor: parcels, sub_parcels, spuitschrift, inventory_movements, logbook. NOG NIET gefixt voor: harvest_registrations (oogstregistraties), en mogelijk andere tabellen.
**Impact:** Privacy-schending, incorrect bedrijfsoverzicht
**Fix toegepast:** Expliciet `.eq('user_id', userId)` filtering toegevoegd aan 6 functies in `supabase-store.ts`. Verdere audit nodig voor alle tabellen.

### BUG-002: Voorraad levering opslaan faalt
**Ernst:** HOOG
**Locatie:** `/crop-care/inventory` - Levering Toevoegen
**Beschrijving:** POST request retourneert 200 OK maar wordt afgebroken. Data wordt niet opgeslagen. Dialog sluit niet.
**Reproduceerstappen:** Voorraad > Levering Toevoegen > Vul middel/hoeveelheid/eenheid in > Klik Toevoegen

### BUG-003: Sessie crasht bij Slimme Invoer
**Ernst:** HOOG
**Locatie:** `/command-center/smart-input`
**Beschrijving:** Na het versturen van een natuurlijke taal invoer wordt de gebruiker uitgelogd. De API-call veroorzaakt waarschijnlijk een onafgehandelde fout die de auth-sessie verbreekt.

### BUG-004: Kaart adres-zoekfunctie werkt niet
**Ernst:** MEDIUM
**Locatie:** `/parcels/map`
**Beschrijving:** Invoeren van een adres en Enter drukken triggert geen geocoding. De kaart zoomt niet in.

### BUG-005: Middelzoekfunctie niet gekoppeld aan CTGB
**Ernst:** MEDIUM
**Locatie:** Bespuitingsformulier en Voorraadbeheer
**Beschrijving:** De zoekfunctie voor middelen in het bespuitingsformulier en voorraadbeheer zoekt alleen in "Mijn Producten", niet in de CTGB database (506 middelen). Nieuwe gebruikers kunnen geen middelen vinden.

---

## 4. KLEINE BEVINDINGEN

| # | Locatie | Beschrijving | Ernst |
|---|---------|-------------|-------|
| 1 | Perceel aanmaken | Typo: "Veder" moet "Verder" zijn | Laag |
| 2 | Weather Dashboard | "Geen actuele weerdata beschikbaar" - API configuratie nodig | Info |
| 3 | Sidebar gebruikersnaam | Soms toont "Gebruiker" in plaats van "henk.vandenberg" | Laag |
| 4 | Gewas-opties | Alleen "Appel" en "Peer" beschikbaar - geen pruim, kers, etc. | Feature request |

---

## 5. Positieve Bevindingen

1. **UI/UX Design:** Het donkere thema met groene accenten is professioneel en prettig voor langdurig gebruik
2. **Perceel Componist:** Uitstekende UX voor het verdelen van percelen in blokken met rassen
3. **CTGB Database:** 506 middelen met filtering op categorie, zoekfunctie, en gedetailleerde productkaarten
4. **Koelcelbeheer:** Indrukwekkende 5-staps wizard met visuele voorvertoning van de koelcel
5. **Slimme Invoer:** Innovatief concept met AI-gestuurde natuurlijke taal invoer
6. **Research Hub / Field Signals:** Community-functie voor het delen van veldobservaties is uniek
7. **Weather Hub:** Buienradar integratie met real-time neerslagradar
8. **Navigatie:** Overzichtelijke sidebar met logische groepering van functionaliteiten
9. **Responsive layout:** Sidebar kan worden ingeklapt

---

## 6. Aanbevelingen

1. **PRIORITEIT 1:** Volledige audit van data-isolatie voor ALLE tabellen - voeg `user_id` filtering toe aan alle queries
2. **PRIORITEIT 1:** Fix het opslaan van voorraadleveringen
3. **PRIORITEIT 2:** Koppel CTGB database aan bespuitingsformulier en voorraadbeheer
4. **PRIORITEIT 2:** Fix de kaart adres-zoekfunctie (geocoding)
5. **PRIORITEIT 2:** Onderzoek waarom Slimme Invoer de sessie laat crashen
6. **PRIORITEIT 3:** Fix typo "Veder" -> "Verder"
7. **PRIORITEIT 3:** Voeg meer gewastypen toe (pruim, kers, etc.)
8. **PRIORITEIT 3:** Configureer weather API voor actuele weerdata

---

*Rapport opgesteld door testgebruiker Henk van den Berg (henk.vandenberg@fruitbedrijfvandenberg.nl)*
*Fruitbedrijf Van den Berg - Betuwe - 40 ha fruitteelt*
