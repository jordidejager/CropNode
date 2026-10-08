# Rijenkaart (beta) — oplevering

*Gebouwd in de nacht van 6 op 7 oktober 2026, volgens `Briefing-CropNode-rijenkaart.pdf`.*
*Branch `feature/rijenkaart-beta`, daarna samengevoegd in `main` en live gezet (zie §4).*

## In het kort

- **Waar:** in CropNode staat onder **Percelen** een nieuwe tab **Rijen (beta)**. Daar open je een perceel en laat je de rijen uit de PDOK-luchtfoto detecteren.
- **Bewerken:** je corrigeert, nummert, maakt blokken en bestuiverrijen, en registreert een bespuiting en een notitie op specifieke rijen. Dat kan in de app én via Claude (MCP).
- **Detectie:** gemeten op 14 echte percelen. Richting en rijafstand kloppen op elk perceel met één rijrichting. Op de voorjaarsfoto (8 cm) liggen de lijnen op de herbicidestrook onder de bomen.
- **Bestaande functies blijven gelijk zolang je geen rijen kiest.** Dat is gecontroleerd: 21 MCP-aanroepen oud tegen nieuw gaven identieke uitvoer, er is een regressiereview gedaan, en de build is groen.
- **Jouw account is nog leeg.** Alle automatische tests draaiden op het tweede account (3ec9943a) en zijn opgeruimd. Je echte account (90a3acab) heeft nog geen rijen; jij tekent morgen de eerste.

---

## 1. Wat werkt, wat half, wat niet — per fase

| Fase | Status | Wat |
|---|---|---|
| 0 Verkennen | ✅ | `docs/rijenkaart/PLAN.md`: bevindingen, beslissingen, contracten. Sectie 6 bevat de aanpassingen na de review. |
| 1 Datamodel | ✅ | Migraties 092–095: tabellen `blokken`, `rijen`, `perceel_rijinstellingen`, `bespuiting_rijen` en `veldnotitie_rijen`, alle met RLS op eigendom.<br>Views `v_rijen`, `v_blokken` en `v_rijen_per_perceel`. GeoJSON-export via `rijen_geojson(perceel_id)`.<br>Transactioneel opslaan en hernummeren via `rijen_toepassen`. Beginkant wisselen via `rijen_zet_beginkant`. Laatste bespuiting en notities per rij via `rijen_status`.<br>De generatiefunctie (handmatig pad) heeft 65 unit-tests. |
| 2 Kaart | ✅ | PDOK-luchtfoto als basemap: 8 cm voorjaar (standaard) of 25 cm zomer, scherp tot zoom 22.<br>Rijen hebben een kleur per ras met legenda. Bestuivers zijn gestippeld, gerooide rijen grijs en standaard verborgen. Bij genoeg zoom staat het rijnummer aan begin én eind.<br>Tik op een rij voor een kaartje met nummer, ras, blok, lengte, bomen, laatste bespuiting en aantal notities. Er is een rijenlijst (sorteerbaar), een knop 'Mijn locatie' en een overzichtspagina van alle percelen. |
| 3 Genereren & corrigeren | ✅ (⚠️ zie §6) | **Detecteren**: automatisch uit de luchtfoto, of met de hand via een referentierij.<br>**Corrigeren**: ±10 cm, ½ rij, draaien ±0,5°, rijafstand, kopakker per kant, beginkant, en 'alle stukken' bij onderbroken rijen.<br>**Opslaan** gebruikt ID-mapping: bestaande rijen houden hun ID en koppelingen.<br>**Losse rijen**: verwijderen, toevoegen (tussen twee rijen, aan de rand, of zelf tekenen), en eindpunt slepen.<br>**Indeling**: nummering (rij 1 aanwijzen, startnummer, beginkant), blokken (zonder overlap) en bestuiverrijen. |
| 4 Koppelingen | ✅ | **Web**: in 'Nieuwe bespuiting' staat 'Alleen bepaalde rijen? (beta)', of je kiest 'Bespuiting' vanuit de selectie op de kaart. Het behandelde oppervlak wordt Σ(lengte × rijafstand). In het spuitschrift staat een badge 'Rijen 1–20'. Op de kaart kun je bij 'Markeer bespuiting' zien welke rijen behandeld zijn. Notities met rij en positie verschijnen als marker op de kaart en met een badge in Veldnotities.<br>**MCP 1.3.0**: zie §7. |
| 4b Taal ("rij 1 t/m 20") | ✅ beperkt | Werkt in de MCP-tekstinvoer: "Steketee rij 1 t/m 20 met merpan". Dat geldt alleen als het genoemde perceel rijen heeft en er geen getal vóór "rijen" staat ("Jachthoek 4 rijen" blijft de subperceelnaam). "blok X" in vrije tekst wordt bewust niet gelezen. De WhatsApp-spuit-inbox is niet aangepast. |
| 5 Afronden | ✅ | Typecheck: geen nieuwe fouten (de 23 bestaande in analytics/parcel-timeline staan er nog). Tests: 139 unit-tests groen, plus een DB-integratietest van 35 controles. `next build` is groen. Daarna gecommit, gepusht en de Vercel-deploy gecontroleerd. Lint is niet bruikbaar in deze repo (geen ESLint-config); typecheck is de echte poort. |

### Hoe ik getest heb

- **Pure rekenmodules** (generatie, selectie, detectie, kleuren): `npm run test:rijen`, 139 tests. Daaronder vallen een synthetische polygoon en een synthetisch streepbeeld met een bekende hoek en afstand. Die moesten binnen ±1° en ±5 cm uitkomen; gemeten werd 0,01° en 0,03 cm.
- **Database:** `npm run test:rijen-store`, 35 controles op een echt perceel; ruimt zichzelf op.
- **Pagina's:** in Playwright met iPhone 13-emulatie, met echte PDOK-detectie en de echte database, 29 stappen. Een echte iPhone en Safari kon ik niet testen.
- **End-to-end via de MCP** (zelf gedaan, daarna alles verwijderd):
  - bevestigde bespuiting op rij 1–20 van Steketee: `plot_areas` = 1,1061 ha (exact Σ lengte × rijafstand), historie `sprayed_area` = 1,1061, voorraad −1,659 kg (= 1,5 kg/ha × 1,1061), 20 rijkoppelingen;
  - per rij: 'laatste bespuiting via rijen' op rij 1–20, en op rij 21 de oudere bespuiting van het hele perceel;
  - notitie op rij 12 op 34 m gaf "boom ~52"; bij het wisselen van de beginkant ging die naar 106,5 m en daarna terug naar 34 m;
  - verwijderen via `bespuiting_aanpassen` ruimde alles op: historie, voorraad, uren en koppelingen.

---

## 2. Beslissingen en waarom

1. **Kaartbibliotheek: Leaflet, dezelfde als de bestaande perceelkaart.**
   - Er komt geen nieuwe dependency bij behalve **proj4** (een klein pakket voor RD ⇄ WGS84).
   - Rijen staan op een canvas-laag met ruime tiktolerantie, voor de iPhone.
2. **PostGIS aangezet** (staat in het schema `extensions`).
   - Gebruikt voor: opslag van rijen als `LineString(4326)`, `lengte_m` als afgeleide kolom (`ST_Length` in RD), een trigger die elke rij aan de beginkant laat beginnen, transacties en de GeoJSON-export.
   - De bestaande `parcels.geometry` (jsonb) is niet aangeraakt.
3. **Rekenen in TypeScript, niet in PostGIS-functies.**
   - Generatie en detectie zijn pure TS-functies, met proj4 op exact de RD-definitie van PostGIS. Gemeten verschil met PostGIS: 5 mm. Oppervlak en zwaartepunt komen op de cm overeen.
   - Reden: draait in de browser (direct voorbeeld tijdens het corrigeren) én in node-tests, en is goed te testen.
4. **Detectie in de browser** op de PDOK-WMS (RD, 0,25 m/px).
   - PDOK staat CORS toe, dus er is geen proxy, edge function of nieuwe dienst nodig.
   - Nooit commerciële tiles.
   - Rekentijd 0,05–0,6 s per perceel, plus 0,2–0,8 s ophalen.
5. **Rijkenmerk 'minst groen' in plaats van 'donkerst'.**
   - Op de voorjaarsfoto is de herbicidestrook onder de bomen beige, dus *lichter* dan het gras. 'Donkerst' lag op alle percelen 1–1,25 m naast de rij.
   - Detectie gebruikt daarom altijd de 8 cm-voorjaarsfoto. Op de zomerfoto (2025) hangt het af van hagelnet ja/nee, en jonge aanplant staat er nog niet op.
6. **Naamgeving: Nederlands zoals de briefing.** Tenant-kolom `user_id` zoals de hele codebase. Code staat in `src/lib/rijen/*` en `src/components/rijenkaart/*`.
7. **Extra kolommen** (allemaal optioneel):
   - `blokken.sub_parcel_id`: koppelt een blok aan het bestaande subperceel, nodig om een bespuiting op rijen in het spuitschrift te krijgen.
   - `rijen.controleren` en `rijen.opmerking`.
   - in de instellingen: `fase_m`, `boomafstand_m`, `startnummer`, `nummering_start_rij_id` en `detectie_methode`.
8. **Beginkant en "kant van rij 1"** worden opgeslagen als kompasgraden.
   - In de app kies je gewoon "Begin aan de noordoostkant".
   - Wissel je de beginkant, dan draaien de rijen om en schuiven de notitieposities mee, zodat ze dezelfde boom blijven aanwijzen.
9. **Verwijderen of rooien.**
   - 'Verwijderen' haalt een rij echt weg als er niets aan hangt (bv. een detectiefout).
   - Hangt er een bespuiting of notitie aan, dan wordt de rij 'gerooid' en blijft ze bewaard (historie).
   - 'Rooien' is een aparte actie met datum.
   - Gerooide rijen worden in de database nooit verwijderd.
10. **Opnieuw genereren of corrigeren** koppelt nieuwe aan bestaande rijen op positie.
    - Bestaande rijen houden zo hun ID, nummer en koppelingen.
    - Rijen die vervallen terwijl er registraties aan hangen, worden 'gerooid'. Je krijgt dat vooraf te zien, net als een melding als de nummering verandert.
11. **Bespuiting op rijen**: de subpercelen van de rijen worden de `plots`, en `plot_areas` het rij-oppervlak (bestaande mechaniek van "deels gespoten"). Zonder rijen verandert er niets, en historische registraties blijven onaangeroerd.
12. **Onderbroken rijen (inham, erf, pad):**
    - Standaard volgt de app de briefing: het langste stuk, gemarkeerd als 'controleren'.
    - Met de keuze 'Alle stukken' wordt elk stuk een eigen rij. Op Steketee levert dat 13 rijen en 0,37 ha meer op.
    - Daarnaast kun je met 'Rij tekenen' ontbrekende stukken tekenen.
13. **Merge naar `main`.** De repo gebruikt geen branches: de remote `cropnode` heeft alleen `main` en Vercel deployt `main`. De briefing staat mergen dan toe. Er is per fase gecommit op `feature/rijenkaart-beta` en daarna ge-fast-forward. Zo kun je morgen op je iPhone testen.

---

## 3. Detectieresultaten op echte percelen

Gemeten zonder opgegeven rijafstand, op het testaccount. Dat zijn dezelfde percelen als in jouw account (zelfde BRP-grenzen). Richting = rij-as in kompasgraden. Volledige tabel, alle 14 percelen en uitleg: `docs/rijenkaart/detectie-resultaten.md`. Beelden met de gedetecteerde lijnen over de luchtfoto: `docs/rijenkaart/img/` (bv. `steketee-Actueel_orthoHR.jpg`, `-zoom.jpg` = 4 uitsneden op 8 cm).

| Perceel | Richting | Rijafstand | Zekerheid | Bekend | Oordeel (8 cm voorjaar) |
|---|---|---|---|---|---|
| Steketee | 65,5° | 3,00 m | 96 % | 3,0 m | ✅ op de stroken, ook 200 m verderop |
| Spoor | 174,3° | 3,30 m | 96 % | 3,25 m geregistreerd | ✅ 3,30 klopt: de lijnen liggen 146 m verderop nog op de rij. **Je perceelprofiel zegt 3,25.** |
| Schele | 133,7° | 3,27 m | 85 % | – | ✅ |
| Yese | 38,5° | 2,98 m | 96 % | – | ✅ |
| Busje | 136,1° | 3,30 m | 92 % | – | ✅ |
| Jachthoek | 57,7° | 3,01 m | 72 % | – | ✅ oude blok; jonge blok zwak zichtbaar |
| Pompus, Jan van W, Plantsoen, Stadhoek, Zuidhoek, Thuis 1,8 ha | – | – | 75–93 % | – | ✅ visueel gecontroleerd |
| Kloetinge Spoor | 63,8° | 4,18 m | 30 % | – | ⚠️ richting en afstand goed, zekerheid net onder de drempel (oude bomen, lange schaduwen) |
| Thuis 10 ha | – | – | 0 % | – | ✅ terecht afgewezen: **twee rijrichtingen** (53° en 143°). Melding met uitleg. |

- **Zekerheid** is de regelmaat van het patroon (autocorrelatie, met een controle op een tweede richting).
- **Drempel 30 %.** Daaronder volgt een melding met de reden, en de app zet je in 'Teken referentierij'.
- Een akker met werkgangen van ±3 m kan ook hoog scoren: de zekerheid zegt "regelmatig patroon", niet "boomgaard".

---

## 4. Migraties

| Migratie | Wat | Toegepast |
|---|---|---|
| 092 `rijenkaart_datamodel_beta` | PostGIS, 5 tabellen, RLS, views, functies | ✅ |
| 093 `rijenkaart_blokken_view` | `v_blokken` (blokpolygoon als GeoJSON) | ✅ |
| 094 `rijenkaart_rls_eigendom` | RLS: perceel, rij en bespuiting moeten van jezelf zijn; `rijen_status` telt alleen eigen koppelingen | ✅ |
| 095 `rijenkaart_notitieposities` | notitieposities volgen de rij bij slepen, genereren en omdraaien; een gerooide rij kan nooit verwijderd worden | ✅ |

- **Omgeving:** het ene Supabase-project, waar de repo altijd zijn migraties op draait. Dat is meteen productie: een aparte ontwikkelomgeving bestaat niet.
- **Waarom toch toegepast:** de stopregel in de briefing gaat over twijfel tussen productie en ontwikkeling. Die twijfel is er niet: dit is bewust productie.
  - De migraties zijn volledig additief: alleen nieuwe tabellen, functies en policies, geen bestaande kolom of data gewijzigd. Ze zijn elk twee keer gedraaid (idempotent).
  - Jij hebt eerder toestemming gegeven om migraties zelf via de pooler te draaien.
  - Zonder deze migraties is de iPhone-test morgen onmogelijk.
- **Terugdraaien** (verwijdert alleen de rijenkaart):
  ```sql
  drop table if exists public.bespuiting_rijen, public.veldnotitie_rijen, public.perceel_rijinstellingen, public.rijen, public.blokken cascade;
  drop view if exists public.v_rijen, public.v_blokken, public.v_rijen_per_perceel;
  drop function if exists public.rijen_geojson(text, boolean), public.rijen_toepassen(uuid, text, jsonb, uuid[], jsonb), public.rijen_zet_beginkant(uuid, text, numeric), public.rijen_status(uuid, text), public.rij_moet_omdraaien(extensions.geometry, numeric);
  ```

**Deploy:** zie de onderste regel van dit bestand (commit + Vercel-status).

---

## 5. Testscript voor morgenochtend (±10 minuten, iPhone)

Gebruik bv. **Steketee** (Tessa, rijafstand 3,0 m).

1. **Percelen → tab "Rijen (beta)"** → tik Steketee. De luchtfoto moet scherp zijn; knijp in tot de bomen. Rechtsboven wissel je tussen 8 cm voorjaar en 25 cm zomer.
2. **Genereren → "Rijen detecteren uit luchtfoto"**. Je ziet ongeveer 65,5° · 3,00 m · 96 % en 82 gele voorstelrijen op de foto. Zoom in: liggen ze op de stroken?
   - Bij de inham bij het erf staan 14 rijen op 'controleren'. Zet **Onderbroken rijen → "Alle stukken"** voor de stukken aan beide kanten.
3. **Corrigeren:** probeer ◀ 10 cm / ½ rij / ↻ ½° en zet 'Kopakker begin' op 8 m. Het voorstel past live aan. Tik daarna **"Opslaan (… rijen)"** (staat ook in de gele balk op de kaart).
4. **Tab Rijen:**
   - tik een rij → het kaartje toont nummer, lengte en bomen;
   - **"Slepen"** → sleep een eindpunt → Klaar;
   - selecteer een rij → **Verwijder**.
5. **Indeling → "Rij 1 aanwijzen"** → tik de rij die 1 moet zijn → bevestig. Kies daarna de **Beginkant** (bv. "Begin aan de zuidwestkant"). Controleer de nummers op de kaart: zoom in, ze staan aan beide uiteinden.
6. **Blok:** Rijen → typ **1-20** → in de selectiebalk **Blok** → naam "Conference 2018" of "Tessa 2016", ras, plantjaar, subperceel (staat al goed) → opslaan. Typ dan **7** → **Bestuiver** → ras bv. "Elstar". Kleuren en legenda moeten veranderen, en rij 7 is gestippeld.
7. **Bespuiting op rij 1–20:** typ 1-20 → **Bespuiting**. De spuitdialoog opent met "Rijen 1–20 · ±1,1 ha behandeld (RVO 6,98 ha)". Rond af met een middel.
   - Spuitschrift: badge "Rijen 1–20" en "1,1 van 6,98 ha".
   - Op de rijenkaart: **Markeer bespuiting** laat rij 1–20 oplichten.
8. **Notitie op rij 12:** tik rij 12 → **Notitie** → "Tik op de kaart langs de rij" voor de positie → opslaan. Er komt een amber marker op de rij en een badge "Rij 12 · boom …" in Veldnotities.
9. **Bestaande functies:** maak een gewone bespuiting zonder rijen en kijk de perceellijst en de perceelkaart na. Vraag Claude bv. "welke percelen heb ik deze week gespoten".
10. **Claude (MCP)**, na het verversen van de connector:
    - "Steketee rij 21 t/m 30 gespoten met merpan 1,5 kg" → het voorstel toont de rijen en het oppervlak;
    - "notitie: rij 12 op 30 meter schurft";
    - de tool `rijen` → overzicht met blokken.
11. **Export:** tab Export → **Download GeoJSON** (bv. openen in QGIS of geojson.io).

Tip: wil je de testdata weg, verwijder dan de rijen in de tab Rijen. Gekoppelde rijen blijven als 'gerooid' bewaard: zo is het ontworpen.

---

## 6. Bekende bugs en open keuzes

- **Niet op een echte iPhone of Safari getest**, alleen in Chromium met iPhone-emulatie. Let op:
  - slepen van eindpunten;
  - tikken tussen dicht naast elkaar liggende rijen;
  - de datumkiezer bij rooien;
  - de onderbalk terwijl het toetsenbord open is;
  - 'Mijn locatie' (vraagt toestemming).
- **Percelen met twee rijrichtingen** (Thuis 10 ha): één patroon per perceel. Opslaan vervangt alle rijen van het perceel. Voor het tweede deel is nu alleen 'Rij tekenen' beschikbaar. → Volgende stap: genereren per blokpolygoon.
- **Rij-oppervlak is altijd kleiner dan het RVO-oppervlak** (geen kopakkers). Een bespuiting op "alle rijen" staat daarom als *deels gespoten* in het spuitschrift (6,29 van 6,98 ha op Steketee). Dat volgt de briefing, maar het voelt misschien vreemd.
  - Keuze: wil je dat "alle rijen" als "hele perceel" telt?
- **Na opslaan niet automatisch vastgelegd:** de rij die je als 1 aanwees wordt wel bewaard. Maar zonder aangewezen rij 1 kan een correctie aan de rand de nummering verschuiven. Je krijgt dan een bevestiging met het aantal hernummerde rijen.
- **Bewerken van een bespuiting met rijen** via het spuitschrift: haal je een subperceel weg, dan vervalt de rijkoppeling (melding). Rijen *wijzigen* kan alleen door de bespuiting opnieuw te registreren.
- **Percelen samenvoegen** (Percelen → reorganiseren) weigert, met uitleg, als meer dan één perceel rijen heeft. Anders zouden die rijen verdwijnen.
- **Een concept dat niet is opgeslagen** gaat verloren als iOS de tab weggooit of je via het menu wegnavigeert. Bij 'Alle percelen' en bij het sluiten van de tab krijg je wel een waarschuwing.
- **Spoor:** de detectie zegt 3,30 m; je perceelprofiel zegt 3,25 m. Even nameten?
- **Kloetinge Spoor** scoort net onder de drempel. Je kunt het voorstel toch gebruiken of een referentierij tekenen.
- **WhatsApp-spuit-inbox** kent nog geen rijen. Concepten worden zoals altijd op perceelniveau goedgekeurd.

## 7. MCP (Claude) — wat er nieuw is (versie 1.3.0, 28 tools)

Alles is optioneel en bestaande aanroepen werken exact hetzelfde.

| Tool | Nieuw |
|---|---|
| `rijen` (nieuw) | Per perceel: blokken met bereik, ras en plantjaar, bestuivers, rijen om te controleren, gerooide rijen en totalen. Met `details=true` per rij. |
| `percelen` | Bij percelen met rijen één regel extra, bv. "rijen 1–82 · blokken: Tessa 2016 r1–20 · bestuivers: r7 · rij-opp 6,29 ha". |
| `registreer_bespuiting` | `rijen` per perceel (`{"naam":"steketee","rijen":"1-20"}`) of op topniveau als er één perceel is; ook "rij 1 t/m 20" in de tekst. Onbekende rij → duidelijke fout, niets opgeslagen. |
| `veldnotitie` | `rijen` + `positie_m` (meters vanaf het begin) → "Genoteerd ✓ bij Steketee rij 12 (34 m, boom ~52)". |
| `bespuitingen` / `veldnotities` | Tonen rijen: "· rijen 1–20 (Steketee)", "rij 12 (34 m, boom 52)". |
| `bespuiting_aanpassen` | Gaat er een perceel uit de registratie, dan vervalt de rijkoppeling, met melding. |

## 8. Voorgestelde volgende stappen

1. Veldtest op de iPhone (§5). Op basis daarvan de tikgebieden en de onderbalk bijschaven.
2. **Genereren per blok/gebied**: een blokpolygoon tekenen, met detectie en generatie alleen binnen dat blok. Dit lost Thuis (twee richtingen) en Jachthoek (jong en oud blok) op.
3. Beslissen over "alle rijen = hele perceel" (§6).
4. Rijen in de WhatsApp-spuit-inbox en in de goedkeuring in de web-inbox (parser "rij 1 t/m 20").
5. Een detail van de rijenkaart op de perceeldetailpagina: alleen kijken, met de laatste bespuiting per rij als kleur.
6. Jager Core: de GeoJSON-export staat klaar. Later kunnen RTK/LiDAR-gemeten rijen (`geom_bron = 'gemeten'`, `nauwkeurigheid_m`) de gegenereerde vervangen met behoud van ID.

## 9. Per rij op de foto leggen (verfijning) — 7 oktober 2026

**Waarom:** de generatie legt een regelmatig raster (vaste rijafstand). Dat klopt op GPS-geplante percelen, maar bij
met de hand uitgezette (oudere) aanplant wijkt elke rij een paar cm af en dat telt op. Jordi's Murre (niet op GPS):
rijen tot ~1 m naast het raster.

**Wat het doet** (`src/lib/rijen/verfijning.ts`, knop *Genereren → Rijen precies op de foto leggen*, en automatisch na
het opslaan van gegenereerde rijen):
1. Haalt een scherp beeld op (PDOK 8 cm-voorjaarsfoto op 10 cm/px, in tegels).
2. Legt elke rij per stuk van ~20 m op de boomstrook (vergelijking met het gemiddelde rijprofiel van het perceel,
   zoekvenster ±⅓ rijafstand: een rij kan nooit naar de buurrij of de grasbaan springen). Per rij een rechte lijn
   (mag iets scheef), en een **gladde boog met extra punten** als de rij aantoonbaar buigt (parabool-toets: significant
   en ≥ 6 cm, of meer bij een ruisig beeld). Rijen waar de foto te zwak is volgen hun buren en krijgen 'controleren'.
3. Fit daarnaast een **fijnafgesteld regelmatig raster** (rijafstand, positie, kleine draaiing). Liggen de rijen daar
   binnen ±10 cm omheen (GPS-aanplant), dan is *Raster* de aanbeveling; anders *Per rij*. Je kunt wisselen.
4. Voorbeeld op de kaart (gele stippellijnen) met cijfers; **Opslaan** wijzigt alleen de ligging: nummers, ID's,
   bespuitingen en notities blijven (notitieposities schuiven mee). Handmatig getekende/versleepte rijen blijven liggen.
5. Per rij in het rijkaartje: *Ligging* (afwijking t.o.v. het raster, nauwkeurigheid, gebogen), **← 10 cm / 10 cm →**
   en **Op foto** (alleen die rij opnieuw leggen).
6. **Oppervlak per rij** = lengte × de *werkelijke* afstand tot de buurrijen (gemiddelde van beide kanten; randrij: de
   ene buur; begrensd op 0,5–1,5 × de rijafstand). Geldt voor nieuwe bespuitingen op rijen (web en Claude). Bij een
   regelmatig raster is dat precies hetzelfde als voorheen.

**Gemeten op jouw percelen** (alleen gelezen; dezelfde uitkomst als twee onafhankelijke prototypes):

| Perceel | Aanbeveling | Rest rond regelmatig raster | Verschuiving per rij | Gebogen rijen | Opmerking |
|---|---|---|---|---|---|
| Murre (niet GPS) | **Per rij** | 50 cm | gem. 36 cm, max 116 cm | 5 (24–36 cm boog) | rij 1–4: −0,7…−1 m, rij 15: +48 cm, rij 36: −1,16 m; rij 1–10 krijgt +3,2 % oppervlak |
| Schele | **Per rij** | 28 cm | gem. 22 cm, max 61 cm | 3 | twee blokken met een bredere tussenbaan (zaagtand) |
| Spoor (GPS) | **Raster** | 8,5 cm | raster: gem. 9 cm, max 25 cm | – | opgeslagen rijafstand 3,303 → 3,3008 m (scheelde ~30 cm aan de westkant) |

Beelden: `img/verfijning-murre-randrijen.jpg` en `img/verfijning-murre-gebogen.jpg` (2,5 cm/px, geel = huidig,
cyaan = per rij), `img/verfijning-murre-overzicht.jpg`, `img/verfijning-schele.jpg`, `img/verfijning-spoor.jpg`
(magenta = fijnafgesteld raster). Opnieuw meten: `npm run rijen:verfijning-echt -- Murre Spoor`.

**Rekentijd:** ophalen 0,6–0,8 s + rekenen 0,1–0,5 s per perceel (node); op de iPhone naar schatting 1–3 s.

**Uiteinden uit de foto (8 oktober):** de standaard-kopakker van 6 m klopte niet: bij de meeste van jouw percelen
staan de bomen tot vlak bij de RVO-grens (Kloetinge Spoor, Steketee, Murre), bij andere ligt er een kopakker binnen het
perceel (Busje, ~10 m). Nu volgt de verfijning elke rij vanaf het midden naar buiten tot waar de bomen ophouden:
- **waar staan bomen** = de **zomerfoto** (25 cm, kronen het duidelijkst) — jouw idee; rijen die nog niet op de
  zomerfoto staan (jonge aanplant, bv. Jachthoek) via de 8 cm-voorjaarsfoto. De **ligging** blijft uit de 8 cm-foto;
- het uiteinde ligt waar "meestal bomen" overgaat in "meestal niet" (ontbrekende bomen en wielsporen in de kopakker
  verschuiven het nauwelijks); lopen de bomen tot binnen 2,5 m van de grens, dan tot de grens;
- een echt einde (kopakker, **laadplek**, inham) geldt voor een groep buurrijen; een losse rij die afwijkt van zijn buren
  volgt de buren (jonge aanplant met een zwak signaal);
- nooit buiten de perceelgrens. De uitkomst hangt niet meer af van de kopakker waarmee gegenereerd is (getest: start
  met 0 m of 6 m → zelfde uiteinden, mediaan 0,02–0,25 m; Jachthoek 1,6 m).
De standaard-kopakker bij genereren is daarom nu **0 m**; het voorbeeld na opslaan toont "N rijen langer/korter".
Beelden: `img/uiteinden-kloetinge-spoor.jpg`, `img/uiteinden-busje.jpg` (rood = korter dan het voorstel,
geel = voorstel tot de grens), `img/uiteinden-jachthoek-laadplek.jpg`. Een gat midden in een rij (laadplek midden in
het perceel) splitst de rij nog niet: teken die met *Rij tekenen* of zet de rij op 'controleren'.

**Uiteinden al in het voorstel (8 oktober, middag):** Jordi zag bij Jachthoek in het voorstel nog rijen over de laadplek
— de uiteinden kwamen pas ná *Opslaan* uit de foto. Nu kort het voorstel zelf de rijen in tot waar de bomen staan
(`useConceptEinden`: zelfde uiteindebepaling op de voorgestelde rijen, alleen inkorten, ligging dwars blijft het raster;
opnieuw na elke correctie, tot dan blijven de vorige uiteinden per rijlijn staan). Schakelaar *Uiteinden uit de luchtfoto*
bij de kopakkers; de verfijning na opslaan doet dan alleen nog de ligging. Het scherpe beeld wordt gedeeld
(`fijn-beeld-cache.ts`), dus maar één keer opgehaald. Beeld: `img/voorstel-jachthoek-laadplek.jpg` (links voorheen,
rechts nu). Tegelijk de bepaling robuuster gemaakt (jonge aanplant zonder zichtbare strook kortte ten onrechte in):
- zomerfoto alleen als ≥ 30% van de rijen erop staat (Jachthoek is na de zomerfoto geplant: 9 rijen 'zagen' toevallig
  grondbewerkingssporen);
- per 2 m-cel meerderheid met de buurrijen (een vlek of gat in één rij valt weg, een schuine laadplekrand blijft);
- alleen inkorten bij een duidelijke overgang (≥ 80% bomen vlak ervoor, ≥ 60 procentpunt minder erna) en alleen bij
  rijen met een goed gemeten ligging; anders blijft het uiteinde staan. Jachthoek: laadplek-rijen 13–33 m korter, de rest
  stopt ±5 m voor de grens (pad); de noordwesthoek (zwak beeld) blijft tot de grens.

**Grenzen:** waar geen duidelijke herbicidestrook op de foto staat (bv. het oude blok van Jachthoek, Kloetinge
Plantsoen) meldt de app "niet precies te leggen" en blijven de rijen zoals ze zijn. Randrijen zijn onzekerder
(greppel/schaduw in beeld) en krijgen sneller 'controleren'. Een S-vormige rij wordt als één boog benaderd.

**Testen (5 min):** Murre openen → Genereren → *Rijen precies op de foto leggen* → je ziet "Per rij ★", gem. ~36 cm
verschoven → inzoomen op rij 1 en 36: de gele lijnen liggen op de stroken → *Opslaan (36)* → tik rij 1: "Ligging:
… t.o.v. raster". Spoor: zelfde knop → "Raster ★" (rijafstand 3,301).

---

**Deploy:** live op productie (Vercel, `main`) sinds 7 oktober 2026, ±02:15, commit `c74e512` (de code staat in `985a280`). Beide Production-deploys geslaagd. Live gecontroleerd: `/percelen/rijen` bestaat (achter login), de MCP antwoordt met versie 1.3.0 en 28 tools, en `rijen` werkt. Rijen-tabellen in productie: leeg, klaar voor de eerste echte rijen.
