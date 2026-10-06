# Rijenkaart (beta) — verkenning, beslissingen en contracten

Fase 0 van de briefing (`Briefing-CropNode-rijenkaart.pdf`). Hier staat wat ik heb gevonden, wat ik heb besloten en
waarom. Daarnaast staan de vaste contracten waar de bouwonderdelen (generatie, detectie, opslag, kaart, koppelingen,
MCP) tegen worden gebouwd.

## 1. Bevindingen (verkenning)

| Onderwerp | Wat er is |
|---|---|
| Kaartbibliotheek | Leaflet 1.9.4 met leaflet-draw, zonder react-leaflet. Kaarten worden via `next/dynamic` met `ssr:false` geladen, met één init-`useEffect` en callbacks in refs (`src/components/rvo-map/rvo-map.tsx`). Leaflet-CSS staat globaal in `src/app/layout.tsx`. De huidige basemap is al de PDOK-luchtfoto `Actueel_orthoHR` (WMTS EPSG:3857), maar met `maxZoom: 19` en zonder overzoom. |
| Tekentools | `L.Control.Draw` alleen voor polygonen (perceel tekenen). Lijnen tekenen wordt nergens gebruikt. |
| Perceelopslag | `parcels.geometry` is **jsonb met daarin een JSON-string** (dubbel gecodeerde GeoJSON (Multi)Polygon in WGS84). Er was geen PostGIS. Er zijn 49 percelen, waarvan 37 met geometrie (7 MultiPolygon). `parcels.id` en `sub_parcels.id` zijn TEXT. `sub_parcels` zijn de bestaande "blokken" (ras/oppervlak per deel van een hoofdperceel) en `spuitschrift.plots` bevat sub_parcel-id's. |
| Tenant/RLS | Er is geen aparte tenant-kolom: overal `user_id UUID REFERENCES auth.users` met RLS `auth.uid() = user_id` (4 policies). Servercode gebruikt de admin-client met een expliciete `.eq('user_id', …)`. Bedrijfsprofielen (`companies`) zijn een label per perceel, geen tenant. |
| Bespuitingen | `spuitschrift` (id text, plots text[], products jsonb, `plot_areas` jsonb {subParcelId: gespoten ha} sinds 089, `notes`). Historie en voorraad worden opnieuw opgebouwd via `src/lib/spray-records.ts`. De web-invoer loopt via `NewSprayDialog` naar `addManualSprayEntry` (`src/app/actions.ts`); MCP en WhatsApp lopen via `confirmRegistration` (`src/lib/registration-service.ts`). |
| Veldnotities | `field_notes` (id uuid, `parcel_ids` text[] met sub_parcel-id's, source incl. 'claude'). |
| MCP-server | `src/lib/mcp/*` (v1.2.0, 27 tools). Toolschema's gebruiken `additionalProperties:false` op topniveau, dus nieuwe parameters moeten expliciet worden toegevoegd. |
| Migraties | `supabase/migrations/NNN_*.sql`. De laatste was 091, dus de volgende is **092**. Migraties zijn idempotent en worden met de hand gedraaid (Jordi staat toe dat ik ze zelf via de pooler draai). Er is één Supabase-project (productie). |
| Tests | Losse tsx-scripts met `node:assert` (`src/__tests__/*.test.ts`), elk met een `test:*`-script in package.json. ESLint is niet bruikbaar (geen config); `npm run typecheck` is de echte poort. `next build` negeert TS-fouten (`ignoreBuildErrors`). |
| Branches | De deploy-remote `cropnode` heeft alleen `main`, en Vercel deployt `main`. De repo gebruikt dus geen branches. |
| PDOK | WMTS `…/hwh/luchtfotorgb/wmts/v1_0/{laag}/EPSG:3857/{z}/{x}/{y}.jpeg` (z tot en met 21 voor HR) en WMS `…/wms/v1_0` (EPSG:28992). Beide sturen `Access-Control-Allow-Origin: *`. Open data zonder kosten of sleutel; attributie © PDOK/Beeldmateriaal (CC-BY). |

## 2. Beslissingen

1. **PostGIS aangezet** (`extensions`-schema, versie 3.3.7) en gebruikt voor opslag (`geometry(LineString,4326)`), afgeleide lengte (generated column `ST_Length(ST_Transform(geom,28992))`), normalisatie van de beginkant (trigger), GeoJSON-export en transactionele RPC's. De bestaande `parcels.geometry` blijft ongewijzigd jsonb.
2. **Generatie en detectie in TypeScript** (proj4, met exact de PostGIS-definitie van 28992; het verschil is ~5 mm gemeten), zonder turf. De wiskunde is klein (lijn × polygoon in RD), puur en goed te testen, en draait zowel in de browser als in node-tests. PostGIS-functies zijn gebruikt waar ze transactie of integriteit geven.
3. **Detectie client-side** (canvas) op PDOK WMS in EPSG:28992. CORS is toegestaan, dus er is geen proxy of nieuwe infra nodig. Er wordt **nooit** op commerciële tiles gedetecteerd.
4. **Naamgeving**: tabellen en kolommen in het Nederlands zoals de briefing (`blokken`, `rijen`, `perceel_rijinstellingen`, `bespuiting_rijen`, `veldnotitie_rijen`). De tenant-kolom heet `user_id`, zoals in de hele codebase. Code staat in `src/lib/rijen/*` en `src/components/rijenkaart/*`.
5. **Toevoegingen bovenop de briefing** (allemaal nullable/additief):
   - `blokken.sub_parcel_id`: koppelt een blok aan het bestaande subperceel, zodat een bespuiting op rijen in `spuitschrift.plots`/`plot_areas` terechtkomt.
   - `rijen.controleren`: rij door een inham geknipt.
   - `rijen.opmerking`.
   - In de instellingen: `fase_m` (positie van het rijpatroon), `boomafstand_m` (standaard), `startnummer`, `nummering_start_rij_id` en `detectie_methode`.
6. **Beginkant en startzijde** worden opgeslagen als kompasgraden (`beginkant_graden`, `nummering_startzijde_graden`). Een trigger draait elke rij bij opslaan zo dat het begin aan de beginkant ligt. Bij het wisselen van de beginkant (`rijen_zet_beginkant`) worden de posities van gekoppelde notities gespiegeld, zodat ze dezelfde boom blijven aanwijzen.
7. **Nummer uniek per perceel onder actieve rijen** via een `EXCLUDE … WHERE status='actief' DEFERRABLE INITIALLY DEFERRED`. Zo kan een hernummering in één transactie (getest: rijen wisselen lukt, een dubbel nummer wordt geweigerd).
8. **Verwijderen versus rooien**:
   - "Rij verwijderen" verwijdert echt als de rij nergens aan gekoppeld is (bijvoorbeeld een detectiefout).
   - Een rij met een bespuiting of notitie wordt status `gerooid` en blijft bewaard.
   - Rooien is een aparte actie met `gerooid_op`.
9. **Opnieuw genereren met ID-mapping**: nieuwe en bestaande rijen worden gekoppeld op loodrechte positie (1-op-1, maximaal een halve rijafstand). Gekoppelde rijen houden hun ID en krijgen nieuwe geometrie. Rijen zonder match gaan weg, of worden `gerooid` als er koppelingen aan hangen (vooraf gemeld).
10. **Bespuiting met rijen**:
    - `plots` worden de subpercelen van de rijen. Die komen uit `blok.sub_parcel_id`, anders het enige subperceel, anders het enige subperceel met hetzelfde ras.
    - `plot_areas[sub]` = Σ(lengte × rijafstand)/10 000, begrensd op het subperceeloppervlak.
    - Daarna worden de `bespuiting_rijen` ingevoegd.
    - Zonder rijen verandert er niets. Historische registraties worden niet aangeraakt.
11. **Overlap van blokken**: een rij hoort bij hooguit één blok (`rijen.blok_id`), dus overlap via rijen is onmogelijk. Voor de optionele blokpolygonen weigert een trigger overlap.
12. **Branch**: er wordt gewerkt en gecommit per fase op `feature/rijenkaart-beta`. Omdat de repo geen branches gebruikt (alleen `main` wordt gedeployed), wordt na build en controle naar `main` gemerged; de briefing staat dat toe.
13. **Migratie toegepast** op het enige Supabase-project, waar de repo altijd zijn migraties op draait. Ze is volledig additief, dus ze valt binnen het "mag". Productie en ontwikkeling zijn hetzelfde project; dat is gemeld in STATUS.md.

## 3. Conventies (geometrie)

- `LngLat = [lng, lat]` (WGS84) en `XY = [x, y]` (RD New, meters).
- Kompasgraden in het RD-grid: 0 = noord, 90 = oost.
- De rijrichting θ ligt in [0,180). Richtingsvector d = (sin θ, cos θ), normaal n = (cos θ, −sin θ).
- `offset(p) = (p − zwaartepunt) · n`. Rijen liggen op `faseM + k·rijafstandM`, met `faseM` in [0, rijafstandM).
- `beginkantGraden` = de richting vanaf het midden van de rij naar het begin. Standaard is dat θ: het begin ligt aan de +d-kant.
- Standaardnummering: rij 1 ligt aan de kant met de laagste offset (de −n-kant), dus `nummering_startzijde_graden` = θ + 270 (mod 360). Bij noord-zuidrijen is rij 1 daardoor de westelijkste.

## 4. Datamodel (migratie 092)

Zie `supabase/migrations/092_rijenkaart_datamodel_beta.sql`. Tabellen: `blokken`, `rijen`, `perceel_rijinstellingen`, `bespuiting_rijen`, `veldnotitie_rijen` (alle met RLS). Views: `v_rijen` (effectieve waarden + `geometrie` als GeoJSON + `sub_parcel_id`) en `v_rijen_per_perceel`. Functies:

- `rijen_geojson(perceel_id, incl_gerooid default true)`: de export.
- `rijen_toepassen(user_id, perceel_id, rijen jsonb, verwijderen uuid[], instellingen jsonb)`: transactioneel invoegen, bijwerken, hernummeren en verwijderen.
- `rijen_zet_beginkant(user_id, perceel_id, graden)`.
- `rijen_status(user_id, perceel_id)`: per rij de laatste bespuiting en het aantal notities.

## 5. Modulecontracten

Gedeelde types staan in `src/lib/rijen/types.ts`; geometrie in `src/lib/rijen/geo.ts` (`naarRD`, `naarWGS`, `perceelNaarRD`, `parseGeometrie`, `projecteerOpLijn`, `puntOpLijn`, `kompasRichting`, `windstreek`, …). Beide liggen vast.

### `src/lib/rijen/generatie.ts` (puur)
```ts
genereerRijen(perceel: PerceelRD, params: RijParameters, opties?: { minLengteM?: number }): GegenereerdeRij[]   // gesorteerd op offset oplopend
referentielijnNaarParameters(perceel: PerceelRD, a: XY, b: XY, rijafstandM: number): { richtingGraden: number; faseM: number }
rijOffset(perceel: PerceelRD, richtingGraden: number, coordsRD: XY[]): number      // offset van het midden van de rij
normaliseerFase(faseM: number, rijafstandM: number): number
koppelRijenOpPositie(bestaand: { id: string; offsetM: number }[], nieuw: { offsetM: number }[], maxAfstandM: number):
  { paren: { id: string; index: number }[]; nieuweIndexen: number[]; vervallenIds: string[] }
bepaalNummers(offsets: number[], startIndex: number, startnummer: number): number[]   // zelfde volgorde als invoer
startzijdeGraden(richtingGraden: number, oplopendMetOffset: boolean): number
vindStartIndex(offsets: number[], richtingGraden: number, startzijdeGraden: number): number
rijOppervlakHa(rijen: { lengteM: number; rijafstandM: number | null }[], standaardRijafstandM?: number | null): number
positieOpRij(coordinates: LngLat[], punt: LngLat): { positieM: number; afstandTotRijM: number }
puntOpRij(coordinates: LngLat[], positieM: number): LngLat
boomnummer(positieM: number | null, boomafstandM: number | null): number | null     // floor(positie/boomafstand)+1
rijTussen(a: LngLat[], b: LngLat[]): LngLat[]
rijAanRand(rand: LngLat[], buur: LngLat[]): LngLat[]
```

### `src/lib/rijen/selectie.ts` (puur)
```ts
interface SelecteerbareRij { id: string; nummer: number; label?: string | null; blokId?: string | null; blokNaam?: string | null; rol?: RijRol; status?: RijStatus; rasEffectief?: string | null }
interface RijSelectieResultaat { rijIds: string[]; nummers: number[]; fouten: string[]; leeg: boolean; omschrijving: string }
parseRijSelectie(tekst: string, rijen: SelecteerbareRij[], blokken?: { id: string; naam: string | null }[]): RijSelectieResultaat
formatteerBereiken(nummers: number[]): string    // [1,2,3,5] → "1–3, 5"
```

### `src/lib/rijen/detectie.ts` (puur) + `src/lib/rijen/pdok.ts` (browser)
```ts
// detectie.ts
interface DetectieInvoer { grijs: Float32Array; breedte: number; hoogte: number; pixelM: number; origineRD: XY /* linksboven: [minX, maxY] */; masker?: Uint8Array | null; zwaartepuntRD: XY; verwachteRijafstandM?: number | null; bronBeeld?: string }
detecteerRijen(invoer: DetectieInvoer): DetectieResultaat
naarGrijs(rgba: Uint8ClampedArray | Uint8Array, breedte: number, hoogte: number): Float32Array
maakMasker(perceel: PerceelRD, breedte: number, hoogte: number, pixelM: number, origineRD: XY, erosieM?: number): Uint8Array
DETECTIE_DREMPEL: number
// pdok.ts
PDOK_LAGEN: { orthoHR: 'Actueel_orthoHR'; ortho25: 'Actueel_ortho25' }
pdokWmtsUrl(laag): string        // Leaflet-template {z}/{x}/{y}
PDOK_ATTRIBUTIE: string
beeldVenster(perceel: PerceelRD, opties?: { margeM?: number; doelPixelM?: number; maxPixels?: number }): { bbox: [number,number,number,number]; breedte: number; hoogte: number; pixelM: number; origineRD: XY }
pdokWmsUrl(bbox, breedte, hoogte, laag?): string
haalLuchtfotoOp(venster, laag?): Promise<{ rgba: Uint8ClampedArray; breedte: number; hoogte: number }>   // browser
detecteerVoorPerceel(perceel: PerceelRD, opties?: { laag?: string; verwachteRijafstandM?: number | null; onVoortgang?: (stap: string) => void }): Promise<DetectieResultaat>  // browser
```

### `src/lib/rijen/store.ts` + `src/lib/rijen/koppelingen.ts` (server, admin-client + userId)
```ts
// store.ts
laadRijenkaart(userId, perceelId): Promise<Rijenkaart | null>
laadRijenOverzicht(userId): Promise<RijenSamenvatting[]>
laadRijenVanPerceel(userId, perceelId, opties?: { inclGerooid?: boolean }): Promise<Rij[]>
laadBlokken(userId, perceelId): Promise<Blok[]>
rijenToepassen(userId, perceelId, w: { rijen?: RijWijziging[]; verwijderen?: string[]; instellingen?: RijInstellingenUpdate }): Promise<RijenToepassenResultaat>
zetBeginkant(userId, perceelId, graden: number): Promise<number>
zetNummeringStart(userId, perceelId, startRijId: string | null): Promise<void>
zetRijAttributen(userId, perceelId, rijIds: string[], attrs: RijAttributen): Promise<number>
slaBlokOp(userId, perceelId, blok: BlokInvoer, rijIds?: string[]): Promise<Blok>
verwijderBlok(userId, perceelId, blokId: string): Promise<void>
rijenGeoJSON(userId, perceelId, inclGerooid?: boolean): Promise<GeoJSON.FeatureCollection | null>
// koppelingen.ts
rijSelectieNaarPlots(userId, rijIds): Promise<RijSelectieOppervlak>
koppelBespuitingAanRijen(userId, spuitschriftId, rijIds): Promise<void>
koppelNotitieAanRijen(userId, veldnotitieId, rijen: { rijId: string; positieM?: number | null }[]): Promise<void>
maakRijNotitie(userId, invoer: { perceelId: string; tekst: string; rijen: { rijId: string; positieM?: number | null }[]; bron?: 'web' | 'claude' }): Promise<{ id: string }>
rijenVoorBespuitingen(userId, spuitschriftIds: string[]): Promise<Record<string, BespuitingRijenInfo[]>>
rijenVoorNotities(userId, veldnotitieIds: string[]): Promise<Record<string, NotitieRijInfo[]>>
```
Server actions in `src/app/rijen-actions.ts`; react-query hooks in `src/hooks/use-rijen.ts`; download via `GET /api/parcels/[id]/rijen-geojson`.

### `src/components/rijenkaart/rijenkaart-map.tsx` (Leaflet)
```ts
type KaartModus = 'bekijken' | 'selecteren' | 'referentielijn' | 'positie';
type Basislaag = 'orthoHR' | 'ortho25';
interface RijenkaartMapProps {
  perceelGeometrie; rijen: Rij[]; toonGerooid: boolean; kleurVoorRas: (ras: string | null) => string;
  geselecteerd: ReadonlySet<string>; gemarkeerd?: ReadonlySet<string> | null;
  concept?: { coordinates: LngLat[]; controleren: boolean }[] | null;
  notities?: { id: string; rijId: string; punt: LngLat; tekst: string }[];
  modus: KaartModus; bewerkRijId?: string | null; basislaag: Basislaag; fitSleutel?: string;
  onRijKlik?(rijId, punt); onKaartKlik?(punt); onReferentielijn?(a, b); onEindpuntVerplaatst?(rijId, coordinates); onNotitieKlik?(id);
  className?: string;
}
```
`kleuren.ts` (`maakKleurVoorRas`, palet) and `legenda.tsx` are part of the map component.

### `NewSprayDialog` (optional prop)
`initieleRijSelectie?: { perceelId: string; rijIds: string[] }`. It preselects the sub-parcels of those rows and turns on row selection. `addManualSprayEntry({..., rijIds?: string[]})`.

### MCP (optional extensions, version 1.3.0)
- `percelen`: per perceel that has rows, adds a line with blocks, ranges and varieties.
- `registreer_bespuiting`: `rijen` per perceel item, plus at top level (when there is exactly one perceel).
- `veldnotitie`: `rijen` + `positie_m`.
- `bespuitingen`/`veldnotities`: show rows.
- New tool `rijen` (perceel → blocks, ranges, pollinators, area).
