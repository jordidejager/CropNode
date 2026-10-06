# Rijdetectie — resultaten op echte percelen

Gemeten op 6 oktober 2026 met `scripts/rijen-detectie-echt.ts` (node, Apple Silicon). Het algoritme staat in
`src/lib/rijen/detectie.ts` (de kopcommentaar legt de aanpak uit). Het ophalen en de orkestratie staan in
`src/lib/rijen/pdok.ts`. Opnieuw draaien:

```bash
npx tsx scripts/rijen-detectie-echt.ts                    # 6 percelen × 2 lagen, met beelden in docs/rijenkaart/img
npx tsx scripts/rijen-detectie-echt.ts --profielen        # ook de gevouwen rijprofielen (grijs en groen) loggen
npx tsx scripts/rijen-detectie-echt.ts --browserpad       # ook detecteerVoorPerceel (browsercode) via een sharp-shim
npx tsx scripts/rijen-detectie-echt.ts --controle         # negatieve controle: gras, graan, akker en erf
npx tsx scripts/rijen-detectie-echt.ts Thuis --img-dir /tmp/rk   # andere percelen, beelden buiten docs/
npx tsx src/__tests__/rijen-detectie.test.ts              # synthetische tests + browserpad (offline)
```

## Review (6 oktober 2026, avond): gevonden en gerepareerd

Een tweede ronde op **alle 14 percelen** van de test-user (niet alleen de 6 uit de eerste ronde) en op
extra synthetische randgevallen leverde vier echte fouten op. Alle vier zijn gerepareerd en hebben een test
die op de oude code faalt:

1. **Twee rijrichtingen in één perceel werden 'voldoende' (0,93).** Perceel *Thuis* (10,3 ha, MultiPolygon)
   heeft blokken op ~53° en ~143°. De oude detectie gaf op orthoHR 53° en op ortho25 143°, beide met
   confidence 0,93: de gegenereerde rijen lagen dan op de helft van het perceel dwars op de bomen
   (`img/thuis-8d12-Actueel_orthoHR.jpg`). De autocorrelatie ziet dat niet, want het andere blok middelt in
   het profiel gewoon weg. **Fix:** een significantiefactor (sterkste piek / sterkste piek ≥ 15° daarnaast;
   zie de kop van `detectie.ts`). Thuis geeft nu 0 met `reden` "Meerdere rijrichtingen in dit perceel
   (ongeveer 53° en 153°)" en `meerdereRichtingen: true`.
2. **Kleine percelen met textuur maar zonder rijen werden 'voldoende'.** Op 0,08–0,16 ha haalde korrelige
   ruis (gladgestreken over 0,5–2 m) in 8 van de 24 gevallen 0,32–0,64. De piek/achtergrond-factor werkt
   daar niet, omdat er maar 1–4 tegels zijn. Dezelfde significantiefactor brengt dat nu terug naar ≤ 0,005.
3. **Rijafstand boven 4,0 m werd op de rand afgekapt.** *Kloetinge Spoor* staat op ~4,15–4,18 m. De oude
   detectie gaf 3,92/3,91 m (de rand van [2,5; 4,0]) en op ortho25 toch 'voldoende' (0,45). Die rijen
   verlopen met 0,25 m per rij. **Fix:** het standaardbereik is nu [2,5; 4,8] (max/min blijft < 2, dus nog
   steeds geen harmonischen in het bereik). Daarnaast is er een randcontrole: ligt de top op de rand en
   stijgt het vermogen erbuiten nog, dan is s afgekapt (`opRandZoekbereik`) en wordt de confidence onder de
   drempel gezet. Een echte top precies op 2,50 m wordt níet afgekeurd (test).
4. **Verwachte rijafstand niet gecontroleerd.** `Infinity` gaf `rijafstandM = NaN` en `faseM = NaN`; een
   verwachting van 0,66 (boomafstand), 1,0 of 6 m (fout) gaf een onzinnig resultaat in plaats van de echte
   rijen. **Fix:** een verwachting buiten [2; 10] m of niet-eindig wordt genegeerd (`verwachtGenegeerd`).
   Levert ±15 % rond een plausibele verwachting niets voldoendes op, dan wordt alsnog het standaardbereik
   doorzocht (`verwachtVerlaten`). Zo komt een verouderde rijafstand in de subpercelen (bv. 2,8 terwijl het
   3,6 is) niet meer in de weg.

Verder in `pdok.ts` (voor de iPhone-test):

- het ophalen heeft een timeout van 30 s (`PDOK_TIMEOUT_MS`) en is af te breken met een `AbortSignal`
  (`detecteerVoorPerceel(…, { signal })` → fout "Rijdetectie afgebroken.");
- faalt `createImageBitmap`, dan wordt `<img>` geprobeerd;
- het canvas wordt na het uitlezen meteen op 0 × 0 gezet: iOS Safari geeft canvasgeheugen anders pas bij de
  garbage collector vrij en weigert na een paar detecties nieuwe canvassen;
- de pauze vóór het rekenwerk wacht nu een frame af (`requestAnimationFrame` + `setTimeout`), zodat
  "Rijen zoeken…" echt in beeld staat voordat de main thread 0,1–2 s bezet is. Een kale `setTimeout(0)`
  garandeert geen paint;
- een leeg antwoord geeft een nette melding.

Bij `voldoende = false` staat er nu altijd een Nederlandse zin in `diagnostiek.reden` voor de UI:

- "Perceel te klein voor detectie";
- "Meerdere rijrichtingen in dit perceel (ongeveer …° en …°)";
- "Rijafstand ligt buiten het zoekbereik (…–… m)";
- "Geen duidelijk rijpatroon gevonden".

De resultaten op de 6 percelen uit de eerste ronde zijn door deze wijzigingen niet veranderd: dezelfde
richting, afstand, fase en confidence. De beelden in `img/` gelden dus nog.

## Conclusie

- **Richting en rijafstand** zijn goed op alle 14 percelen van de test-user met één rijrichting, op beide
  lagen. De eerste 6 percelen zijn volledig gecontroleerd, 7 andere via zoom-montages van orthoHR.
  Thuis (twee richtingen) wordt terecht afgewezen.
- Bij de eerste 6 percelen verschilt de richting tussen de lagen hooguit 0,05° en de afstand hooguit
  1,6 cm. Op het verste punt (tot 190 m van het midden) liggen de lijnen nog op de rij.
- **De fase is alleen in het voorjaarsbeeld betrouwbaar.** Met **`Actueel_orthoHR`** (8 cm, voorjaar 2026,
  bladloos) en het kenmerk "minst groen" lagen de lijnen op alle gecontroleerde percelen op de boomrij:
  6 in de eerste ronde, plus Pompus, Thuis (1,8 ha), Jan van W, Plantsoen, Stadhoek, Zuidhoek en
  Kloetinge Spoor in de review.
  - `Actueel_ortho25` is de zomer van 2025 (gecontroleerd: dezelfde bytes als `2025_ortho25`). Daarop is het
    teken van het contrast dubbelzinnig: onder een hagelnet is de rij de lichte, minst groene strook, maar bij
    peren zonder net is de rij de donkere kroon.
  - Het jonge blok van Jachthoek staat er nog niet op.
  - **Gebruik daarom standaard orthoHR.** `detecteerVoorPerceel` doet dat al als je geen `laag` meegeeft.
- **De aanname "donkerste strook = boomrij" bleek fout.** In het voorjaarsbeeld is de herbicidestrook onder de
  bomen beige en *lichter* dan het gras. Met 'donker' lag de fase op alle 6 percelen 1,0–1,25 m naast de
  boomrij, in het gras of in de schaduw.
  Daarom is er nu een `RijKenmerk` ('minstGroen' / 'donker' / 'licht') en een groenindex
  (`naarGroenindex`).
- **Snelheid:** 50–600 ms rekenen per perceel (0,9–11 ha) plus 0,2–0,8 s ophalen bij PDOK. Het grootst
  mogelijke beeld (2500 × 2500 px, ~40 ha) kost 1,6 s. Kost een foute verwachting een tweede zoektocht,
  dan is dat 2,6 s. Op een iPhone verwacht ik 2–3× zo lang, dus onder 10 s.
- **Drempel 0,3:**
  - Echte boomgaarden met één rijrichting scoren 0,62–0,99.
  - Uitzondering is Kloetinge Spoor: een oude boomgaard op ~4,2 m met lange schaduwen, die 0,30 (orthoHR)
    en 0,39 (ortho25) scoort. Richting en afstand kloppen daar wel.
  - Ruis en textuur zonder rijen scoren ≤ 0,01, ook op kleine percelen.
  - Onder de drempel vallen:
    - Jachthoek in het zomerbeeld (0,21). Dat beeld is van vóór de aanplant van het jonge blok, dus de
      score klopt.
    - Thuis (10 ha), met twee rijrichtingen (0).
    - Kloetinge Spoor op orthoHR (0,298).

## Resultaten per perceel (blind, zonder verwachte rijafstand)

Richting = rij-as in kompasgraden RD [0,180). Fase = offset van de rij t.o.v. het zwaartepunt langs
n = (cos θ, −sin θ). Rekentijd = alleen `detecteerRijen`. Beeld = WMS-venster (bbox + 10 m) op 0,25 m/px.

| Perceel | Laag | Richting | Rijafstand (m) | Fase (m) | Confidence | Rekentijd (ms) | Beeld (px) | Bekend (m) | Beoordeling |
|---|---|---|---|---|---|---|---|---|---|
| Steketee | orthoHR | 65,53° | 2,999 | 0,765 | 0,964 | 372 | 1901×1271 | 3,0 | **klopt**: op de herbicidestroken, ook op ±105 m en 197 m |
| Steketee | ortho25 | 65,56° | 3,002 | 0,683 | 0,987 | 386 | 1901×1271 | 3,0 | klopt (hagelnet: rij = lichte strook met witte palen) |
| Spoor | orthoHR | 174,29° | 3,303 | 0,548 | 0,958 | 356 | 1584×1446 | 3,25 | **klopt**, afstand 3,30 (zie onder); ~0,3 m west van de stamlijn |
| Spoor | ortho25 | 174,29° | 3,311 | 0,314 | 0,863 | 375 | 1584×1446 | 3,25 | klopt (0,23 m naast orthoHR) |
| Schele | orthoHR | 133,65° | 3,273 | 2,228 | 0,849 | 228 | 1516×1196 | – | **klopt** |
| Schele | ortho25 | 133,67° | 3,274 | 1,272 | 0,910 | 226 | 1516×1196 | – | **fase fout** (~1 m, richting halve rij): peer zonder net, kroon is de groenste strook |
| Yese | orthoHR | 38,46° | 2,979 | 2,756 | 0,963 | 176 | 1270×968 | – | **klopt** |
| Yese | ortho25 | 38,47° | 2,978 | 2,570 | 0,971 | 176 | 1270×968 | – | klopt (0,19 m naast orthoHR) |
| Busje | orthoHR | 136,13° | 3,301 | 2,547 | 0,916 | 54 | 816×759 | – | **klopt** |
| Busje | ortho25 | 136,12° | 3,316 | 2,269 | 0,929 | 47 | 816×759 | – | klopt (0,28 m naast orthoHR) |
| Jachthoek (MultiPolygon, 3 delen) | orthoHR | 57,67° | 3,009 | 0,598 | 0,717 | 475 | 1935×2034 | – | klopt in het oude blok; jong blok zwak zichtbaar, fase daar niet te controleren |
| Jachthoek | ortho25 | 57,63° | 3,010 | 0,876 | 0,211 | 477 | 1935×2034 | – | **onvoldoende** (terecht): jong blok nog niet geplant op de zomerfoto van 2025; in het oude blok fase op de lichte strook (peer zonder net) |

Met de bekende rijafstand als verwachting (Steketee 3,0, Spoor 3,25, ±15 %) veranderen de uitkomsten minder
dan 1 mm en 0,05°. Het zoekvenster beperkt dus niets, en de detectie volgt het beeld.

### Overige percelen van de test-user (review)

Blind, met het standaardbereik [2,5; 4,8] m. Beoordeeld met zoom-montages van orthoHR; die staan niet in
`img/`, behalve de twee genoemde.

| Perceel | Laag | Richting | Rijafstand (m) | Fase (m) | Confidence | Beoordeling |
|---|---|---|---|---|---|---|
| Jan van W (MultiPolygon, 2,7 ha) | orthoHR | 134,15° | 2,821 | 1,101 | 0,775 | klopt |
| Jan van W | ortho25 | 134,18° | 2,829 | 2,750 | 0,621 | – |
| Kloetinge Spoor (MultiPolygon, 2,6 ha) | orthoHR | 63,82° | 4,180 | 1,389 | 0,298 | richting, afstand en fase kloppen (`img/kloetinge-spoor-Actueel_orthoHR-zoom.jpg`); net onvoldoende: oude bomen, lange schaduwen |
| Kloetinge Spoor | ortho25 | 63,83° | 4,155 | 1,782 | 0,391 | – (vóór de review: 3,91 m, fout) |
| Plantsoen (1,6 ha) | orthoHR | 98,36° | 3,241 | 2,514 | 0,912 | klopt |
| Plantsoen | ortho25 | 98,31° | 3,229 | 0,325 | 0,939 | – |
| Pompus (MultiPolygon, 3,5 ha) | orthoHR | 47,41° | 2,797 | 0,250 | 0,753 | klopt |
| Pompus | ortho25 | 47,40° | 2,796 | 0,718 | 0,811 | – |
| Stadhoek (1,4 ha) | orthoHR | 50,05° | 3,012 | 1,011 | 0,893 | klopt |
| Stadhoek | ortho25 | 49,99° | 2,993 | 2,008 | 0,944 | – |
| Thuis (MultiPolygon, 10,3 ha) | orthoHR | 53,18° | 3,301 | – | **0** | **terecht onvoldoende**: blokken op ~53° en ~143° (`img/thuis-8d12-Actueel_orthoHR.jpg`); vóór de review 0,927 |
| Thuis (10,3 ha) | ortho25 | 142,77° | 3,520 | – | **0** | idem; vóór de review 0,930 met de andere richting |
| Thuis (1,8 ha) | orthoHR | 53,23° | 3,492 | 3,007 | 0,925 | klopt |
| Thuis (1,8 ha) | ortho25 | 53,22° | 3,496 | 0,446 | 0,970 | – |
| Zuidhoek (1,2 ha) | orthoHR | 147,01° | 3,005 | 1,718 | 0,910 | klopt |
| Zuidhoek | ortho25 | 146,98° | 3,007 | 1,605 | 0,931 | – |

**Beoordeeld met:** de zoom-montages `img/<perceel>-<laag>-zoom.jpg`. Elke montage heeft vier uitsneden van
24 × 18 m op 8 cm/px, met een gestippelde lijn per gedetecteerde rij:

- midden;
- beide uitersten langs de normaal (daar wordt een fout in de rijafstand het grootst);
- het verste rij-eind (daar valt een richtingsfout op).

De overzichten `img/<perceel>-<laag>.jpg` tonen de rijen zoals `genereerRijen` ze maakt, zonder kopakkers,
met het perceel in geel.

### Opvallend

- **Spoor heeft 3,30 m, niet 3,25 m.** Beide lagen geven onafhankelijk 3,303 en 3,311. Met 3,25 zou een rij
  op 146 m van het midden (44 rijen) 2,2 m verschoven liggen. Met 3,30 liggen de lijnen daar nog op de
  strook (`img/spoor-Actueel_orthoHR-zoom.jpg`). De rijafstand in de subpercelen is dus waarschijnlijk
  afgerond.
- **Jachthoek bestaat uit twee blokken met elk een eigen fase.** Een fase per tegel van 60 m is in het oude
  blok stabiel (0,45–0,73 m). In het jonge blok wisselt die alle kanten op, omdat de bomen daar nauwelijks
  zichtbaar zijn. Eén fase per perceel past daardoor niet overal. Dat drukt de confidence (0,72) en is in de
  UI met een referentielijn te corrigeren.
- **Positie binnen de rij.** "Minst groen" valt in het midden van de beige strook. Bij Spoor ligt de donkere
  stam-/taklijn ~0,3 m oostelijker. Dat is ruim binnen een halve rij en voor de kaart goed genoeg.
  - Het alternatief, de grondtoon van het gevouwen profiel, lag verder van de stamlijn en is daarom niet
    gekozen.

## Negatieve controle (`--controle`)

Vlakken naast Steketee zonder boomgaard (RD-polygonen staan in het script):

| Controlevlak | Laag | Confidence | Waarom |
|---|---|---|---|
| gras | orthoHR | 0,00 | geen patroon |
| gras (maaibanen) | ortho25 | 0,64 | maaibanen van ~2,7 m: echt, regelmatig patroon |
| graan | orthoHR | 0,53 | werkgangen van de zaaimachine (~3 m) |
| graan | ortho25 | 0,00 | patroon vrijwel onzichtbaar (streepsterkte 0,001) |
| akker (bedden) | orthoHR / ortho25 | 0,41 / 0,77 | teeltbedden ~3 m |
| erf | orthoHR / ortho25 | 0,00 / 0,08 | gebouwen, geen patroon (vóór de review 0,04 / 0,22) |

**De confidence zegt hoe regelmatig en zichtbaar het rijpatroon is, niet of het perceel een boomgaard is.**
Werkgangen en bedden van ~3 m op akkers zien er in het spectrum net zo uit. Dat is geen probleem, want de
detectie draait alleen op eigen fruitpercelen. Een UI-tekst als "rijen gevonden" is dus eerlijker dan
"boomgaard herkend".

## Synthetische tests (`src/__tests__/rijen-detectie.test.ts`)

Opzet: 1200 × 900 px op 0,25 m/px, met daarin een scheve vierhoek van ~4,6 ha. Het beeld bevat:

- donkere boomstroken met bomen om de 0,9 m;
- een gradiënt en een felle schuur in het perceel;
- buiten het perceel een storend streeppatroon in een andere richting;
- gaussische ruis met σ = 25.

| Geval | Δθ | Δs | Δfase | conf | tijd |
|---|---|---|---|---|---|
| 0°, 3,0 m | 0,00° | 0,01 cm | 0,047 m | 0,996 | ~160–200 ms |
| 37,5°, 3,25 m | 0,01° | 0,00 cm | 0,000 m | 0,998 | |
| 90°, 3,0 m | 0,00° | 0,02 cm | 0,032 m | 0,994 | |
| 123,4°, 3,25 m | 0,00° | 0,01 cm | 0,000 m | 0,998 | |
| 162°, 3,5 m | 0,00° | 0,00 cm | 0,000 m | 0,997 | |
| 64,3°, 3,0 m (verwacht 3,0) | 0,00° | 0,03 cm | 0,001 m | 0,998 | |
| 17°, 3,25 m in ruis σ = 60 | ≤ 0,01° | 0,01 cm | – | 0,991 | |
| pure ruis + gradiënt + vlekken (3 seeds) | – | – | – | 0,00 | |

De eisen waren ±1°, ±5 cm en ±0,25 m. Daarnaast test het bestand (33 tests):

- het masker: oppervlak, 3 m-erosie, MultiPolygon met gat, en 2000 × 2000 px in ~30 ms;
- het voorjaarsgeval in RGB: met 'minstGroen' de goede fase, met 'donker' een halve rij ernaast;
- `beeldVenster`, `pdokWmsUrl` en de WMS-limiet van 2500 px;
- sinds de review ook (deze tests falen op de code van vóór de review):
  - kleine percelen met korrelige textuur zonder rijen (24 gevallen, alle < 0,01);
  - twee blokken met rijen op 30° en 120°: onvoldoende, met `meerdereRichtingen` en `reden`;
  - rijafstand 4,3 m zonder verwachting;
  - rijafstand buiten het bereik (2,2 en 5,4 m): nooit 'voldoende' met een verkeerde afstand, maar met de
    juiste verwachting wel goed;
  - een echte top precies op 2,50 m wordt niet afgekeurd;
  - NaN, ∞, −3, 0,66 en 50 als verwachting: geen NaN, terugval op het standaardbereik;
  - een plausibele maar foute verwachting (2,8 bij 3,6): `verwachtVerlaten`, toch 3,6;
- **samenhang met `genereerRijen`:** de rijen die uit het detectieresultaat worden gegenereerd, liggen
  ≤ 0,03 m van de gesimuleerde boomstroken, ook bij θ = 179,7° en 0,3° (de normaal klapt daar om);
- **browserpad offline** (fetch, createImageBitmap en OffscreenCanvas nagebootst):
  - voortgangsteksten, WMS-URL, resultaat en `bronBeeld`, en dat het canvas wordt vrijgegeven;
  - de foutmeldingen bij foutcode 503, een XML-antwoord, geen verbinding, een leeg beeld en een mislukte
    decodering;
  - timeout en afbreken via `signal`;
  - een perceel zonder geometrie.

## Advies voor de UI

1. Roep `detecteerVoorPerceel(perceelRD, { verwachteRijafstandM, onVoortgang, signal })` aan **zonder
   `laag`**, dus op orthoHR, ook als de gebruiker de zomerlaag als basiskaart heeft.
   - Geef de rijafstand uit de subpercelen mee als verwachting als die bekend is (zoekvenster ±15 %; een
     onzinnige of foute waarde wordt automatisch genegeerd of verlaten).
   - Geef een `AbortSignal` mee en breek af bij het sluiten van het scherm of de dialoog.
2. Is `voldoende` onwaar (confidence < `DETECTIE_DREMPEL` = 0,3):
   - toon `diagnostiek.reden` als melding en ga naar handmatig (referentielijn);
   - bij `diagnostiek.meerdereRichtingen` past één rijpatroon niet op het hele perceel, ook niet met een
     referentielijn. Zeg dat erbij.
3. Bied altijd "verschuif halve rij" aan:
   - `diagnostiek.faseAlternatiefM` is de fase een halve rij verder;
   - `diagnostiek.halveRijTwijfel` wordt waar als de andere strook bijna even sterk is (op deze 6 percelen
     nooit);
   - als er toch op ortho25 wordt gedetecteerd, maak de knop dan prominent.
4. Bewaar `bronBeeld` ('PDOK Actueel_orthoHR') en de confidence in `perceel_rijinstellingen`.

## Bekende grenzen

- Een rijafstand buiten 2,5–4,8 m wordt alleen gevonden met een verwachting.
  - Bij 5–9,6 m valt de 2e harmonische (s/2) wél in het standaardbereik. De autocorrelatie houdt dat
    onder de drempel (5,4 m synthetisch: 0,18), maar geef zulke afstanden mee als verwachting.
  - Kersen met een boomafstand in de rij van 2,5–4,8 m kunnen een tweede piek dwars op de rijen geven.
    Dan zakt de significantie en volgt "meerdere rijrichtingen".
- Eén richting, afstand en fase per perceel.
  - Bij blokken met een andere richting wordt het perceel afgewezen (`meerdereRichtingen`).
  - Bij blokken met dezelfde richting maar een andere fase (Jachthoek) wint het sterkste blok en zakt de
    confidence.
  - Een MultiPolygon met ver uit elkaar liggende delen krijgt één groot beeld, en daardoor een grotere
    pixel.
- De PDOK-WMS levert maximaal 2500 px per zijde. Percelen breder dan ~600 m krijgen een grotere pixel; bij
  0,4 m/px is een rij van 3 m nog maar 7,5 px.
