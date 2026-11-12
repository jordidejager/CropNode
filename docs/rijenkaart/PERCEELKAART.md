# Perceelkaart — export voor de Jager Core-simulatie

Eén GeoJSON-bestand per perceel met de perceelgrens, de rijenkaart en de maten die een zelfrijdende machine nodig heeft.
De afnemer (de Jager Core-simulatie) leest alleen; er wordt niets teruggeschreven. Schema-versie **1.0**.

## Ophalen

| Manier | Hoe |
|---|---|
| Knop | Percelen › perceel › **Perceelkaart downloaden** (naast *Rijenkaart (beta)*), of Rijenkaart › tab **Export**. Geeft `perceelkaart-<naam>.geojson` en toont daarna de controles. |
| API | `GET /api/parcels/<perceel_id>/perceelkaart` (ingelogd; alleen eigen percelen). `?download=1` = als bestand, `?deel=grens\|rijen\|obstakels` = alleen dat deel. |
| Connector (MCP) | `perceelkaart(perceel)`: perceelnaam mag slordig, zelfde inhoud als de knop, geen bevestiging (leest alleen). Te groot voor één antwoord (> 50.000 tekens): je krijgt `deel: "grens"` plus `metadata.vervolg.aanroepen`, bijv. `perceelkaart(perceel, deel="rijen", rijen="1-30")`, `…rijen="31-36"`, `…deel="obstakels"`. |

Elk deel bevat de volledige `metadata` (incl. controles), met `metadata.deel` en bij rijen `metadata.rijen_selectie`.

## Formaat

GeoJSON `FeatureCollection` (`name: "perceelkaart"`), geometrie in **WGS84 (EPSG:4326)** zoals de rijen-export.
Elke feature heeft `properties.rd`: dezelfde punten in **RD New (EPSG:28992)**, berekend met PostGIS `ST_Transform`
(functie `perceelkaart_geometrie`, migratie 096), in meters met 3 decimalen. Alle maten zijn in RD gerekend.
Wat CropNode niet weet is `null` — niet geschat en niet weggelaten.

### `metadata`

| Veld | Eenheid / waarden | Betekenis |
|---|---|---|
| `schema_versie` | `"1.0"` | Hoog bij elke wijziging van veldnamen |
| `export_tijd` | ISO 8601 (UTC) | Moment van de export |
| `perceel_id`, `perceel_naam` | tekst | Hoofdperceel in CropNode |
| `brp_jaar`, `brp_id` | jaar, tekst | RVO/BRP-referentie van de grens (nu `null`, zie onder) |
| `grens_bron` | tekst | Herkomst van de grens in CropNode (`RVO_IMPORT`) |
| `oppervlak_ha` | ha (4 dec.) | Oppervlak van de grens in dit bestand (RD) |
| `oppervlak_ha_geregistreerd` | ha | Oppervlak zoals geregistreerd bij het perceel |
| `aantal_rijen_actief`, `aantal_rijen_gerooid` | aantal | Gerooide rijen staan niet in het bestand, alleen geteld |
| `geplant_op_gps` | true/false (perceel of per blok) | Nu `null` (niet geregistreerd) |
| `luchtfoto_bron` | tekst | Foto waar de rijen uit komen, bijv. `PDOK Actueel_orthoHR` |
| `opnamedatum` | datum | Nu `null` (PDOK geeft geen datum per plek) |
| `rijinstellingen` | object | Instellingen van het rijraster: `rijrichting_graden` (as, [0,180), RD-noord), `rijafstand_m`, `boomafstand_m`, `kopakker_begin_m`, `kopakker_eind_m` (m), `beginkant_graden`, `detectie_methode`, `laatst_gegenereerd_op` |
| `crs`, `crs_rd` | `EPSG:4326`, `EPSG:28992` | |
| `conventies` | tekst per onderwerp | De afspraken hieronder, in het bestand zelf |
| `controles` | object | Zie *Controles* |

### `soort = "perceel"` (Polygon of MultiPolygon)

| Veld | Eenheid | Betekenis |
|---|---|---|
| `naam` | tekst | Perceelnaam |
| `oppervlak_ha` | ha | Oppervlak van deze grens (RD) |
| `rd` | m | Ringen in RD (zelfde nesting als `geometry.coordinates`) |

### `soort = "rij"` (LineString van begin naar eind)

Bestaande velden van de rijen-export (`rijen-<perceel>.geojson`), ongewijzigde namen en waarden:

| Veld | Eenheid | |
|---|---|---|
| `id` | uuid | Vaste rij-id |
| `perceel_id`, `blok_id`, `sub_parcel_id` | id | Eigen id's van dit perceel |
| `nummer`, `label` | | Rijnummer en eigen label |
| `ras`, `plantjaar`, `onderstam`, `blok` | | Effectief (rij → blok) |
| `rol` | `hoofd` \| `bestuiver` | |
| `status` | `actief` | Alleen actieve rijen in de perceelkaart |
| `lengte_m` | m | Lengte in RD (PostGIS) |
| `rijafstand_m`, `boomafstand_m` | m | Effectief (rij → blok → perceel) |
| `aantal_bomen` | aantal | Effectief |
| `geom_bron` | `gegenereerd` \| `getekend` \| `gemeten` | Herkomst van de ligging |
| `nauwkeurigheid_m` | m | Geschatte fout van de ligging (na *precies op de foto*) |
| `controleren` | true/false | Rijlijn liep door een inham/pad (geknipt) |
| `geplant_op`, `gerooid_op` | datum | |

Nieuwe velden:

| Veld | Eenheid | Betekenis |
|---|---|---|
| `soort` | `"rij"` | |
| `rd` | m | Punten in RD, begin → eind |
| `richting_graden` | graden [0,360) | Richting van begin naar eind, vanaf **RD-noord** (rasternoord, zoals de rijrichting in CropNode) |
| `richting_graden_ware_noorden` | graden [0,360) | Zelfde, t.o.v. het ware noorden (WGS84) |
| `buur_links_id`, `buur_rechts_id` | uuid | Buurrij links/rechts, **gezien in de rijrichting**; `null` aan de rand |
| `buur_links_nummer`, `buur_rechts_nummer` | nummer | Zelfde, als rijnummer |
| `afstand_links_m`, `afstand_rechts_m` | `{min, mediaan, max}` m | Hart op hart, loodrecht op de rij, per 1 m langs de rij |
| `afstand_profiel` | `[[s, links, rechts], …]` m | Om de 10 m vanaf het begin (`s` = afstand vanaf begin); `null` waar de buur er niet naast ligt |
| `kop_begin_m`, `kop_eind_m` | m | Afstand van het rijuiteinde in het verlengde van de rij tot de perceelgrens (ook de rand van een inham). Negatief = uiteinde ligt buiten de grens |
| `kop_begin_achter`, `kop_eind_achter` | `sloot`, `weg`, `erf`, `buurperceel`, `laadplek` | Wat er achter de grens ligt (nu `null`) |
| `eerste_boom_m` | m | Afstand van het begin van de lijn tot de eerste boom (nu `null`) |
| `lege_plekken` | [boomnummer] | Plekken zonder boom (nu `null`) |
| `herplant` | [{boomnummer, plantjaar}] | (nu `null`) |
| `kroonbreedte_m`, `boomhoogte_m` | m | Alleen als geregistreerd (nu `null`) |
| `hagelnet` | true/false | Alleen als geregistreerd (nu `null`) |
| `nethoogte_m`, `paalafstand_m` | m | Alleen als geregistreerd (nu `null`) |

**Buren:** de dichtstbijzijnde rijlijn aan elke kant die minstens 30% langs de rij overlapt, niet verder dan
2,5 × de rijafstand (verder = pad of ander blok → `null`). Stukken op dezelfde rijlijn (< 0,5 m opzij) zijn geen buren.
Liggen er meerdere stukken op de buurlijn, dan is de buur het stuk met de meeste overlap; de afstanden worden tot
alle stukken op die lijn gemeten.

**Boomnummering:** boom *n* ligt tussen (n−1) × boomafstand en n × boomafstand vanaf het begin van de rij
(zelfde regel als in de rest van CropNode: `boomnummer = floor(positie / boomafstand) + 1`).

### `soort = "obstakel"` (Point, LineString of Polygon)

`type` (`sloot`, `paal`, `anker`, `put`, `pad`, `laadplek`, `inrit`, `no-go`) en `omschrijving`. CropNode kent nog
geen obstakels, dus deze features komen (nog) niet voor; `deel="obstakels"` geeft een lege lijst.

## Controles (`metadata.controles`)

| Veld | Controle |
|---|---|
| `aantal_rijen` | Actieve rijen in het bestand = actieve rijen in CropNode |
| `binnen_grens` | Elke rij ligt binnen de perceelgrens, tolerantie 1 m (PostGIS); `buiten` = rijnummers + meters erbuiten |
| `lengte` | Lengte van de lijn uit `rd` wijkt < 0,1 m af van `lengte_m` |
| `richting` | Binnen één blok lopen alle rijen dezelfde kant op; `tegen_de_rest_in` = rijen die andersom lopen (niet omgedraaid) |
| `zonder_boomafstand`, `controleren` | Rijnummers, ter informatie |
| `ok` | Alle vier de controles hierboven in orde |
| `meldingen` | Dezelfde uitkomst in zinnen: `{soort: ok \| let_op \| info, tekst}` (zo getoond na het downloaden) |

## Wat nu `null` blijft (CropNode heeft de gegevens niet)

Om te kiezen wat het waard is om te gaan registreren:

| Veld | Waarom leeg | Hoe het gevuld kan worden |
|---|---|---|
| `boomafstand_m` (alle rijen), `aantal_bomen` | Niet in de rijinstellingen, niet bij de subpercelen (Murre, Spoor: leeg) | Indeling › boomafstand per perceel of blok invullen — weinig werk, nodig voor boomposities |
| `geplant_op_gps` | Wordt niet geregistreerd | Ja/nee per blok — weinig werk; zegt de simulatie of rechte rijen te vertrouwen zijn |
| `brp_jaar`, `brp_id` | `parcels.rvo_id` is bij alle 31 percelen leeg | Bij de RVO-import het BRP-id en jaar bewaren |
| `opnamedatum` | PDOK *Actueel* heeft geen datum per plek | Bij genereren de jaarlaag vastleggen (bijv. `2026_orthoHR`) |
| `kop_begin_achter`, `kop_eind_achter` | Onbekend | Automatisch af te leiden uit PDOK BGT (water/weg/erf) en AHN (sloot); of per kopakker aanklikken |
| `kroonbreedte_m`, `boomhoogte_m` | Niet gemeten | Automatisch uit AHN (oppervlak − maaiveld) of zomerfoto |
| `hagelnet`, `nethoogte_m`, `paalafstand_m` | Niet geregistreerd | Per blok invullen (teeltsysteem) — weinig werk |
| `eerste_boom_m`, `lege_plekken`, `herplant` | Niet geregistreerd | Veldwerk (of later JagerVision per boom) — veel werk |
| `ras`/`plantjaar` per rij | Geen blokken op de rijenkaart (Murre heeft wel 2 subpercelen) | Indeling › blokken maken; ook nodig voor de richtingcontrole per blok |
| obstakels | CropNode kent ze niet | Later: tekenen op de rijenkaart |

## Testresultaten (12 november 2026, productie, alleen lezen)

**Murre** — 36 actieve rijen, alle controles in orde: aantal 36 = 36, alle rijen binnen de grens (±1 m), lengte
max. 0,005 m afwijking, één richting. Info: geen boomafstand (alle rijen), alle 36 op *controleren* (inham).
Rijafstand overal 3,401 m (raster), `kop_begin_m` = `kop_eind_m` = 6,0 m. Eerste rij:
`nummer 1 · lengte_m 147,36 · richting_graden 321,71 (ware noorden 320,64) · buur links rij 2 (3,401 m), rechts null (rand) ·
kop 6,0 / 6,0 m · rd [[53618.981, 387482.648], [53527.673, 387598.306]]`.

**Spoor** — 106 actieve rijen, alle controles in orde (zelfde vier), info: geen boomafstand, rij 14 op *controleren*.
Rijafstand 3,302–3,304 m (GPS-raster), kopakker ~6,0 m (rij 8 eind 4,03 m: hoek van de grens). Eerste rij:
`nummer 1 · lengte_m 19,1 · richting_graden 354,27 · buur links rij 2 (3,302 m) · kop 6,0 / 6,0 m`.

**Let op:** beide percelen staan nog op het eerste raster van 7 oktober (kopakker 6 m, rechte rijen, nog niet per rij
op de foto gelegd). De kopakkermaten in de export zijn dus die 6 m, niet de echte ruimte tot de bomen. Opnieuw
genereren met kopakker 0 (uiteinden uit de foto) en — voor Murre, niet op GPS geplant — *Rijen precies op de foto
leggen* maakt de kaart realistischer. De export zelf wijzigt nooit rijen.

## Techniek

- Pure opbouw: `src/lib/rijen/perceelkaart.ts` (buren, afstanden, kopakkers, controles, delen); tests:
  `npm run test:rijen-perceelkaart`.
- Database: `src/lib/rijen/perceelkaart-store.ts` (rijen = zelfde features als `rijen_geojson`, RD + grens-controle uit
  `perceelkaart_geometrie(p_user_id, p_perceel_id)`, migratie 096, alleen lezen).
- Route `src/app/api/parcels/[id]/perceelkaart/route.ts`; knop `src/components/rijenkaart/perceelkaart-download.tsx`;
  MCP `src/lib/mcp/perceelkaart.ts` (v1.4.0).
- Echte percelen (alleen lezen): `npm run rijen:perceelkaart-echt -- Murre Spoor` (optioneel `--uit <map>` schrijft
  de bestanden weg).
