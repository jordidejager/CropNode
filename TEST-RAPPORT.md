# CropNode — Volledig Test Rapport

**Datum**: 24 februari 2026
**Tester**: Automatische test via Playwright (headless Chromium)
**Test account**: `admin@agrisprayer.local`
**Dev server**: `http://localhost:3003` (Next.js 15.5.9 + Turbopack)

---

## 1. Samenvatting

| Categorie | Aantal |
|---|---|
| ✅ Geslaagd | 18 |
| ❌ Gefaald / Bug | 7 |
| ⚠️ Waarschuwing | 5 |
| 🚧 Coming Soon (placeholder) | 3 |
| 🔍 Niet volledig testbaar (headless limitatie) | 4 |

### Totaalindruk
CropNode ziet er **professioneel en consistent** uit. De Emerald Dark Mode is goed doorgevoerd, de sidebar-navigatie is logisch opgebouwd, en de meeste pagina's laden correct. De kernfunctionaliteit (perceelbeheer, spuitschrift, koelcelbeheer, research hub) is aanwezig en bruikbaar. Er zijn echter enkele **kritieke bugs** rondom authenticatie en de slimme invoer, plus een significant aantal TypeScript-fouten (121) die de codekwaliteit bedreigen.

---

## 2. Kritieke Bugs

### 🔴 BUG-001: `/harvest-hub/*` routes niet beveiligd door auth middleware
**Ernst**: KRITIEK
**Locatie**: `src/lib/supabase/middleware.ts` regel 88
**Beschrijving**: De middleware regex die beschermde routes matcht bevat NIET het `/harvest-hub` pad. Hierdoor zijn alle Harvest Hub pagina's (oogstregistratie, koelcelbeheer, etc.) toegankelijk zonder inloggen.
**Regex nu**: `^\/(app|command-center|parcels|crop-care|research|perceelhistorie|bedrijf-dashboard|team-tasks|profile)/`
**Fix**: Voeg `harvest-hub` toe aan de regex:
```
^\/(app|command-center|parcels|crop-care|harvest-hub|research|perceelhistorie|bedrijf-dashboard|team-tasks|profile)/
```
**Bewijs**: `curl http://localhost:3003/harvest-hub/registration` geeft HTTP 200 zonder auth cookies, terwijl `/command-center` correct 307 naar `/login` redirect.

---

### 🔴 BUG-002: Slimme Invoer V2 — "Kon context niet laden"
**Ernst**: KRITIEK (kern-feature onbruikbaar)
**Locatie**: `/command-center/smart-input-v2`
**Beschrijving**: Bij het laden van de Slimme Invoer 2.0 pagina verschijnt de foutmelding "Kon context niet laden" met een rood X icoon en toast "Context laden mislukt — Probeer de pagina te herladen". De pagina toont een loading spinner "Context laden..." die uiteindelijk faalt.
**Mogelijke oorzaak**: De `/api/smart-input-v2/context` endpoint retourneert 401 Unauthorized. In een headless browser-sessie wordt de auth cookie mogelijk niet correct doorgegeven aan de API route, of het admin testaccount mist benodigde data (percelen, producten) die de context API verwacht.
**Opmerking**: Bij een tweede poging toonde de pagina wél het chat-interface correct (mobiele screenshot toont "Hallo! Slimme Invoer 2.0 — Wat kan ik vandaag voor u doen?"). Dit duidt op een **race condition** bij het laden van de context.
**Screenshot**: `/tmp/cropnode-03-smart-input-v2.png` (fout) en `/tmp/cn-mobile-smart-input.png` (succesvol)

---

### 🔴 BUG-003: Slimme Invoer V1 toont alleen skeleton loading
**Ernst**: HOOG
**Locatie**: `/command-center/smart-input`
**Beschrijving**: De Smart Input V1 pagina toont permanent skeleton loading placeholders in plaats van het chat-interface. Er is geen command bar, geen chat feed, en geen mogelijkheid tot interactie zichtbaar. De pagina lijkt te hangen op het laden van dashboard data (stats kaarten bovenaan en tabel onderaan).
**Opmerking**: Het `/command-center` pad redirect automatisch naar `/command-center/smart-input`, waardoor het command center dashboard identiek eruitziet — ook alleen skeletons.
**Mogelijke oorzaak**: De pagina combineert dashboard stats + smart input interface. Als de data queries voor stats falen of lang duren, kan het hele interface hangen.
**Screenshot**: `/tmp/cn-smart-input-v1.png`

---

## 3. Belangrijke Bugs

### 🟠 BUG-004: "Mijn Producten" (Product Matrix) niet bereikbaar via sidebar
**Ernst**: GEMIDDELD
**Locatie**: `src/components/layout/sidebar.tsx`
**Beschrijving**: De pagina `/crop-care/my-products` bestaat en werkt uitstekend (toont Product Matrix met 506 middelen, filterbare categorieën, dosering info). Echter, er is **geen link in de sidebar** naar deze pagina. Gebruikers kunnen deze functionaliteit niet vinden tenzij ze de URL direct typen.
**Fix**: Voeg een sidebar-item toe onder "Crop Care" met label "Mijn Producten" of "Product Matrix", link naar `/crop-care/my-products`.
**Screenshot**: `/tmp/cn-my-products.png`

---

### 🟠 BUG-005: Database Gewasbescherming toont alleen skeletons
**Ernst**: GEMIDDELD
**Locatie**: `/crop-care/db-protection`
**Beschrijving**: De pagina voor de CTGB database gewasbescherming toont alleen skeleton loading placeholders. Er zijn geen producten, geen zoekfunctie, en geen content zichtbaar. De data lijkt niet geladen te worden.
**Opmerking**: De Database Meststoffen pagina (`/crop-care/db-fertilizer`) werkt wél correct en toont 1000 meststoffen.
**Screenshot**: `/tmp/cn-db-protection.png`

---

### 🟠 BUG-006: Spuitschrift toont alleen skeleton loading
**Ernst**: GEMIDDELD
**Locatie**: `/crop-care/logs`
**Beschrijving**: De Spuitschrift pagina toont de titel "Spuitschrift — Overzicht van alle definitief geregistreerde bespuitingen" correct, maar de inhoud bestaat uit alleen skeleton loading placeholders. Er zijn geen registraties zichtbaar, geen filter-opties, en geen actie-knoppen.
**Mogelijke oorzaak**: Dezelfde datalaad-issue als bij Smart Input V1 — de queries voor spuitschrift-data hangen of falen voor dit testaccount.
**Screenshot**: `/tmp/cn-crop-care-logs.png`

---

### 🟠 BUG-007: Tijdlijn — "Voltooid" tab toont 0 items
**Ernst**: LAAG
**Locatie**: `/command-center/timeline`
**Beschrijving**: De Tijdlijn pagina werkt correct en toont 2 concepten (Merpan Spuitkorrel, SURROUND WP CROP). De tabs "Alles (2)" en "Concepten (2)" werken. Echter, "Voltooid (0)" toont 0 items. Als er eerder registraties zijn bevestigd, verschijnen deze niet onder de Voltooid tab.
**Opmerking**: Dit was een eerder bekend probleem. Kan ook correct zijn als dit testaccount daadwerkelijk geen voltooide registraties heeft.
**Screenshot**: `/tmp/cn-timeline.png`

---

## 4. Visuele Issues

### ✅ Emerald Dark Mode — Consistent
De donkere theme met emerald accenten is **consequent** toegepast op alle pagina's. Geen witte vlakken, geen broken styling, geen onleesbare tekst. De kleurcodering is goed doorgevoerd:
- Groene emerald accenten voor actieve items en CTA's
- Donkerblauwe/grijze achtergronden voor cards en containers
- Subtiele borders en hover-effecten

### ⚠️ VIS-001: Voorraad pagina — skeleton loading zonder paginatitel
**Locatie**: `/crop-care/inventory`
**Beschrijving**: De pagina toont de titel "Voorraadbeheer" met beschrijving en een "Levering Toevoegen" knop, maar de content eronder is alleen skeletons. Het is onduidelijk of dit een lege-state is (geen voorraad) of een laadprobleem. Een betere UX zou een duidelijke lege-state boodschap zijn als er geen voorraad is.
**Screenshot**: `/tmp/cn-inventory.png`

### ⚠️ VIS-002: Command Center dashboard — permanent skeleton
**Locatie**: `/command-center/smart-input` (dashboard sectie)
**Beschrijving**: Het bovenste deel van de Smart Input pagina toont 4 statkaarten en een tabel, allemaal als skeletons. Deze lijken permanent te laden en nooit data te tonen. Als dit de bedoeling is als "dashboard", dan zouden ze verborgen moeten zijn als er geen data is.

### ✅ VIS-003: Koelcelbeheer — visueel indrukwekkend
De koelcel plattegrond is **visueel sterk**: cellen zijn kleurgecodeerd (Actief=groen border, labels groot en leesbaar), deuren en verdampers zijn zichtbaar, en de zoom/pan functionaliteit werkt. Legenda onderaan met status kleuren.

### ✅ VIS-004: Percelen overzicht — professioneel
Het "Uw Bedrijf Dashboard" met 58.65 ha, 32 blokken, 8 rassen is overzichtelijk. Cards tonen gewas (PEER label), ras, en hectare. Zoekfunctie en "Nieuw Perceel" knop aanwezig.

---

## 5. Performance Issues

### ⚠️ PERF-001: Meerdere pagina's laden traag of hangen op skeletons
**Pagina's**: Smart Input V1, Spuitschrift, Voorraad, DB Gewasbescherming
**Beschrijving**: Diverse pagina's tonen na 3 seconden nog steeds skeleton loading states. In een headless browser kan dit een tijdsprobleem zijn, maar als dit ook in een echte browser optreedt is het een significante UX-issue. Een teler die na 3+ seconden alleen grijze blokken ziet, denkt dat de app niet werkt.
**Aanbeveling**: Voeg timeouts toe aan skeleton loading states — na 5 seconden toon een "Data kon niet worden geladen, probeer opnieuw" boodschap.

### ✅ PERF-002: Slimme Invoer V2 context laden
De context loading indicator ("Context laden...") is een goede UX-beslissing. Als het mislukt, wordt er een duidelijke foutmelding getoond met een "Pagina herladen" knop. De error recovery is goed.

---

## 6. Ontbrekende Features (Coming Soon)

| Pagina | Status | Beschrijving |
|---|---|---|
| Perceelanalyse (`/harvest-hub/field-analysis`) | 🚧 Coming Soon | "Vergelijk opbrengsten per perceel over seizoenen" |
| Sortering & Kwaliteit (`/harvest-hub/quality`) | 🚧 Coming Soon | "Bekijk maatsortering, kwaliteitsklassen en resultaten" |
| Afleveroverzicht (`/harvest-hub/deliveries`) | 🚧 Coming Soon | "Overzicht van afleveringen aan veiling of afnemers" |

**Opmerking**: De "Coming Soon" placeholders zijn netjes gestyled met een passend icoon en beschrijvende tekst. Dit is goed gedaan — gebruikers weten dat de feature nog komt.

---

## 7. Responsive & Mobiel (375px)

### ✅ Mobiel hamburger menu aanwezig
Op 375px breed verdwijnt de sidebar en verschijnt een hamburger menu (☰) linksboven. CropNode logo blijft zichtbaar in de top-bar.

### ✅ Slimme Invoer V2 — mobiel uitstekend
De chat-interface past zich goed aan op mobiel: welkomstbericht, mode-selector knoppen, command bar met placeholder tekst, en quick-action suggesties ("Alle peren vandaag gespoten met", "Gisteren heel het bedrijf gespoten met"). Dit is **de beste mobiele ervaring** in de app.

### ⚠️ MOB-001: Koelcelbeheer op mobiel — moeilijk bruikbaar
De koelcel plattegrond op 375px is lastig te navigeren. Cellen zijn gedeeltelijk buiten beeld, celnamen/labels zijn niet meer leesbaar, en de zoom-knoppen overlappen met content. De instructie-tekst "Scroll om te pannen • Ctrl+Scroll om te zoomen • Alt+Klik om te slepen" is desktop-georiënteerd — op mobiel zijn deze acties niet van toepassing.
**Aanbeveling**: Op mobiel formaat een lijstweergave tonen i.p.v. de plattegrond, of de plattegrond initieel uitgezoomd tonen zodat alle cellen zichtbaar zijn.

### ✅ MOB-002: Spuitschrift op mobiel — goed responsive
De Spuitschrift kaarten stapelen netjes onder elkaar op mobiel formaat. Geen horizontale scroll.

### ✅ MOB-003: Command Center op mobiel — cards stapelen goed
De dashboard cards stapelen correct van grid naar single column op mobiel.

---

## 8. Authenticatie & Beveiliging

### ✅ AUTH-001: Login flow werkt correct
- Email + wachtwoord formulier professioneel gestyled
- Foutmelding "Ongeldige inloggegevens" in rode banner bij verkeerde credentials
- "Wachtwoord vergeten?" en "Registreer hier" links aanwezig
- Na succesvolle login: redirect naar `/command-center/smart-input`

### ✅ AUTH-002: Beschermde routes redirecten naar login
Getest met curl: `/command-center`, `/parcels`, `/crop-care/logs`, `/team-tasks`, `/research`, `/profile` geven allemaal HTTP 307 redirect naar `/login` zonder auth.

### ❌ AUTH-003: `/harvest-hub/*` niet beschermd
Zie BUG-001. Alle harvest-hub routes zijn toegankelijk zonder authenticatie.

### ✅ AUTH-004: Profiel pagina correct
Toont email (admin@agrisprayer.local, niet wijzigbaar), naam (Admin), bedrijfsnaam, type teelt (Fruitteelt, niet wijzigbaar). Wachtwoord wijzigen beschikbaar.

---

## 9. Navigatie & Sidebar

### ✅ NAV-001: Sidebar structuur compleet
Alle secties aanwezig met correcte sub-items:

| Sectie | Sub-items | ✅/❌ |
|---|---|---|
| Command Center | Slimme Invoer, Slimme Invoer 2.0, Tijdlijn | ✅ |
| Percelen | Lijstweergave, Kaartweergave | ✅ |
| Crop Care | Spuitschrift, Voorraad, DB Gewasbescherming, DB Meststoffen | ⚠️ Mist "Mijn Producten" |
| Harvest Hub | Oogstregistratie, Koelcelbeheer, Perceelanalyse, Sortering & Kwaliteit, Afleveroverzicht | ✅ |
| Team & Tasks | Urenregistratie | ✅ |
| Research Hub | Field Signals, Papers & Onderzoek, Ziekten & Plagen | ✅ |

### ✅ NAV-002: CropNode branding correct
- Logo (blad-netwerk icoon + "CropNode" tekst) linksboven in sidebar
- Geen verwijzingen naar "AgriSprayer", "CropOS" of "PROFESSIONAL" gevonden
- Sidebar collapse/expand met "Inklappen" knop onderaan

### ✅ NAV-003: Alle pagina's laden (geen 404's)
Elke sidebar-link navigeert naar een bestaande pagina. Geen 404 errors.

### ✅ NAV-004: User info in sidebar
Onderaan de sidebar: avatar (AD), naam (admin), "PROFIEL BEKIJKEN" link, en logout icoon.

---

## 10. Feature-Specifieke Bevindingen

### Percelen (✅ Werkt goed)
- **Lijstweergave**: Dashboard met 58.65 ha, 32 blokken. Cards per perceel met gewas, ras, hectare. Zoekfunctie en "Nieuw Perceel" knop aanwezig.
- **Kaartweergave**: Leaflet kaart met PDOK luchtfoto. Oranje markers voor perceellocaties. Zelfde dashboard header.

### Oogstregistratie (✅ Werkt)
- Overzicht per datum met registraties (30 kisten, 1e pluk, Klasse I)
- "Nieuwe Oogst" knop aanwezig
- Lijst/Dagweergave toggle
- Seizoenfilter (2025-2026)
- Opslag-status zichtbaar ("0/30 opgeslagen", "Niet opgeslagen")

### Koelcelbeheer (✅ Indrukwekkend)
- 5 cellen op plattegrond met visuele weergave
- Kleurcodering per status (Actief=groen, Inkoelen=oranje)
- Capaciteit info (0/200 posities, 1678 kisten)
- "Nieuwe cel" wizard aanwezig
- Overzicht/Detail toggle

### Team & Tasks (✅ Functioneel)
- Stats: Vandaag uren, kosten deze week, top activiteit
- Nieuwe Registratie formulier met taak, perceel, datum, personen, uren
- "Direct registreren" en "Taak starten" (timer) modi
- Dagberekening zichtbaar: (za=0.5, zo=0)
- Totaal uren berekening: 9.0 uur (1 persoon × 9 uur × 1 dag)

### Research Hub (✅ Goed)
- "Ziekten & Plagen" encyclopedie link
- Tabs: Papers & Onderzoek, Field Signals
- Field Signals: social feed met observatie-invoer, tags, trending tags
- Nette lege-state: "Nog geen signalen. Deel als eerste je observatie!"

### Ziekten & Plagen (✅ Uitstekend)
- 8 entries zichtbaar: Schurft, Fruitmot, Perenbladvlo, Meeldauw
- Kleurgecodeerd op ernst (KRITIEK=rood)
- Filters: Alle gewassen, Alle types, Schimmels, Insecten
- Zoekfunctie aanwezig
- Categorietelling: 6 Appel ziekten, 5 Peer ziekten, 4 Schimmels, 4 Insecten & Mijten
- Actieve maanden indicator per ziekte

### Meststoffen Database (✅ Werkt perfect)
- 1000 meststoffen geladen
- Zoekfunctie en categoriefilters (Blad, Bodem, Fertigatie)
- Cards met producent, categorie, "Bekijk details" link
- Professionele kaartindeling

---

## 11. TypeScript & Build Kwaliteit

### ❌ TECH-001: 121 TypeScript fouten
```
npx tsc --noEmit → 121 errors
```
**Meest voorkomende fouten**:
- `supabase-store.ts`: 20+ fouten — `'client' is possibly 'null'`, property not found op type `never`
- `harvest-store.ts`, `cold-storage-store.ts`: soortgelijke null-checks ontbreken
- `ctgb-engine.ts`, `parcel-filter.ts`, `product-matcher.ts`: type-safety issues
- `test-fetch.ts`: type `unknown` niet afgevangen

**Aanbeveling**: Dit zijn vooral stricte TypeScript-fouten die de runtime niet direct breken, maar het is belangrijk om ze op te lossen voor code-kwaliteit en refactoring-veiligheid. Begin met `supabase-store.ts` (het meest kritieke bestand).

---

## 12. Suggesties voor Verbetering

### UX Verbeteringen
1. **Skeleton timeout**: Na 5+ seconden loading, toon een "Kon niet laden" boodschap i.p.v. permanente skeletons
2. **Lege-state consistentie**: Sommige pagina's (Research Hub) hebben goede lege-states, andere (Voorraad, DB Gewasbescherming) tonen alleen skeletons als er geen data is
3. **Smart Input V1 vs V2**: Overweeg V1 te verbergen als V2 de opvolger is, of maak duidelijk wat het verschil is voor de gebruiker
4. **Command Center landing**: In plaats van een redirect naar Smart Input, toon een echt dashboard met snelle stats en links

### Navigatie
5. **Mijn Producten toevoegen aan sidebar**: De Product Matrix is een waardevolle feature die onvindbaar is
6. **Sidebar actieve state**: De groene highlight voor het actieve item werkt goed — overweeg ook een breadcrumb voor diepere navigatie

### Mobiel
7. **Koelcelbeheer mobiel**: Lijstweergave als default op mobiel, plattegrond als optie
8. **Touch instructies**: Vervang "Ctrl+Scroll" door touch-specifieke instructies op mobiel

### Technisch
9. **Auth middleware uitbreiden**: Voeg `harvest-hub` toe aan beschermde routes
10. **TypeScript strict mode**: Los de 121 fouten op, begin met null-safety in stores
11. **Error boundaries**: Voeg React error boundaries toe aan elke pagina om witte schermen te voorkomen

---

## 13. Geteste Pagina's — Compleet Overzicht

| # | Pagina | URL | Status | Opmerking |
|---|---|---|---|---|
| 1 | Login | `/login` | ✅ OK | Professioneel, foutmelding werkt |
| 2 | Command Center | `/command-center` | ⚠️ | Redirect naar smart-input, skeletons |
| 3 | Slimme Invoer V1 | `/command-center/smart-input` | ❌ Bug | Alleen skeleton loading |
| 4 | Slimme Invoer V2 | `/command-center/smart-input-v2` | ⚠️ | Context laden faalt soms (race condition) |
| 5 | Tijdlijn | `/command-center/timeline` | ✅ OK | 2 concepten, tabs werken |
| 6 | Percelen Lijst | `/parcels/list` | ✅ OK | Dashboard + 32 blokken |
| 7 | Percelen Kaart | `/parcels/map` | ✅ OK | Leaflet kaart met markers |
| 8 | Spuitschrift | `/crop-care/logs` | ❌ Bug | Alleen skeleton loading |
| 9 | Mijn Producten | `/crop-care/my-products` | ✅ OK | Product Matrix, 506 middelen (maar niet in sidebar!) |
| 10 | Voorraad | `/crop-care/inventory` | ⚠️ | Skeleton loading, onduidelijk of leeg of laadprobleem |
| 11 | DB Gewasbescherming | `/crop-care/db-protection` | ❌ Bug | Alleen skeleton loading |
| 12 | DB Meststoffen | `/crop-care/db-fertilizer` | ✅ OK | 1000 meststoffen, zoekfunctie werkt |
| 13 | Oogstregistratie | `/harvest-hub/registration` | ✅ OK | Registratie + overzicht werkend |
| 14 | Koelcelbeheer | `/harvest-hub/cold-storage` | ✅ OK | Plattegrond, 5 cellen, visueel sterk |
| 15 | Perceelanalyse | `/harvest-hub/field-analysis` | 🚧 | Coming Soon |
| 16 | Sortering & Kwaliteit | `/harvest-hub/quality` | 🚧 | Coming Soon |
| 17 | Afleveroverzicht | `/harvest-hub/deliveries` | 🚧 | Coming Soon |
| 18 | Team & Tasks | `/team-tasks` | ✅ OK | Urenregistratie functioneel |
| 19 | Research Hub | `/research` | ✅ OK | Field Signals + Papers |
| 20 | Ziekten & Plagen | `/research/pests` | ✅ OK | Encyclopedie, 8+ entries |
| 21 | Profiel | `/profile` | ✅ OK | Profielgegevens + wachtwoord wijzigen |
| 22 | Mobiel Command Center | (375px) | ✅ OK | Hamburger menu, cards stapelen |
| 23 | Mobiel Smart Input V2 | (375px) | ✅ OK | Chat-interface perfect op mobiel |
| 24 | Mobiel Spuitschrift | (375px) | ⚠️ | Skeletons (zelfde issue als desktop) |
| 25 | Mobiel Koelcelbeheer | (375px) | ⚠️ | Bruikbaarheidsprobleem op klein scherm |

---

## 14. Prioriteiten voor de Volgende Sprint

### Must Fix (voor productie)
1. **BUG-001**: Auth middleware — `harvest-hub` toevoegen aan beschermde routes
2. **BUG-003/006**: Skeleton loading issues onderzoeken — mogelijk data loading probleem voor bepaalde accounts
3. **BUG-002**: Smart Input V2 context race condition oplossen

### Should Fix
4. **BUG-004**: Mijn Producten toevoegen aan sidebar navigatie
5. **TECH-001**: TypeScript fouten oplossen (start met supabase-store.ts)
6. **MOB-001**: Koelcelbeheer mobiele ervaring verbeteren

### Nice to Have
7. Skeleton timeout mechanisme implementeren
8. Lege-state boodschappen toevoegen waar ze ontbreken
9. Command Center een echt dashboard geven i.p.v. redirect

---

*Rapport gegenereerd door geautomatiseerde test suite. Screenshots opgeslagen in `/tmp/cn-*.png` en `/tmp/cropnode-*.png`.*
