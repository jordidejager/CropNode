/**
 * Rijenkaart — automatische rijdetectie uit een luchtfoto (klassieke beeldverwerking, geen ML).
 *
 * Puur: geen DOM, draait in de browser én in node (tests). Het beeld is een raster in RD New met
 * vierkante pixels van `pixelM` meter; pixel (i, j) heeft zijn middelpunt op
 *   x = origineRD[0] + (i + 0,5)·pixelM,   y = origineRD[1] − (j + 0,5)·pixelM.
 *
 * Aanpak (deterministisch; gemeten in node 50–600 ms per echt perceel van 1–11 ha, ~1,6 s voor het maximale
 * beeld van 2500 × 2500 px, ~2,6 s als een foute verwachting een tweede zoektocht kost):
 *
 * 1. Voorbewerking — high-pass: het beeld min een genormaliseerde boxblur (straal 2,5 m, alleen binnen het
 *    masker), daarna gemiddelde 0, gedeeld door de standaarddeviatie en afgekapt op ±3σ (schuren, auto's en
 *    sloten mogen het spectrum niet domineren). Een blok van 5 m dooft zo alles boven ~5 m uit; het
 *    rijpatroon (2,5–4,8 m) komt er met versterking ~0,9–1,2 doorheen.
 *
 * 2. Richting + rijafstand — projectieprofielen. Voor een hoek θ projecteren we elk pixel op de normaal
 *    n(θ) en tellen de waarden op in smalle bakjes; de DFT van dat profiel op frequentie 1/s is (stelling
 *    van de projectiedoorsnede) precies de 2D-Fouriercoëfficiënt van het beeld op k = n(θ)/s. Rijen met
 *    afstand s en richting θ geven daar één scherpe piek. Om de piek niet te missen gaat dit in twee stappen:
 *    a. Grof (θ 0..179° stap 1°, s stap 0,1 m) op het blokgemiddelde beeld (punten op ~0,75 m; Nyquist
 *       0,67 /m ruim boven 1/2,5 m) met Welch-middeling over vaste tegels van 40 × 40 m: het vermogen per
 *       tegel wordt opgeteld. De piek is dan ~4° en ~0,2 m breed, dus dit rooster kan hem niet overslaan
 *       (een coherente DFT over 400 m rijlengte is maar 0,4° breed). Het vermogen wordt gedeeld door de
 *       mediaan over alle hoeken bij dezelfde s (spectrale achtergrond), zodat het van nature sterkere
 *       laagfrequente spectrum geen voorkeur voor grote s geeft.
 *    b. Fijn (θ ±1,5° stap 0,1°, s ±0,1 m stap 0,005 m) coherent over het hele perceel (één profiel met
 *       bakjes van 5 cm): de piek is hier het scherpst, zodat richting en afstand precies genoeg zijn om de
 *       rijen over 100+ m niet te laten verlopen. Daarna parabolische interpolatie in θ en s; ligt de top op
 *       de rand van het venster, dan wordt het venster verlegd (max. 3 rondes).
 *    Harmonischen: het zoekbereik is [2,5; 4,8] m (of ±15 % rond de verwachte rijafstand); de verhouding
 *    max/min < 2, dus s/2 en 2s van een rijpatroon in het bereik vallen er altijd buiten. De piek in het
 *    bereik is daarmee de grondfrequentie. (Boomafstand in de rij, 0,6–1,3 m, valt buiten de band.) Een
 *    patroon van 5–9,6 m heeft zijn 2e harmonische wél in het bereik; de autocorrelatie op lag s (stap 4) is
 *    dan laag, zodat dat niet als 'voldoende' doorkomt — geef zulke rijafstanden als verwachting mee.
 *    Rand: ligt de gevonden s op de rand van het zoekbereik en stijgt het vermogen erbuiten nog, dan is s
 *    afgekapt (`opRandZoekbereik`) en wordt de confidence onder de drempel gezet. Levert ±15 % rond de
 *    verwachting niets voldoendes op (verouderde/foute invoer), dan wordt het standaardbereik doorzocht
 *    (`verwachtVerlaten`); een onzinnige verwachting (< 2 of > 10 m, NaN) wordt genegeerd (`verwachtGenegeerd`).
 *
 * 3. Fase — het beeld op (θ, s) wordt modulo s gevouwen (= kruiscorrelatie met een kam op afstand s) tot
 *    een gemiddeld rijprofiel in 32 stapjes; pixels worden naar rato van hun voetafdruk verdeeld, zodat
 *    rijen precies langs het pixelrooster geen lege stapjes geven. De rij ligt in het minimum van het
 *    gevouwen profiel van het rijkenmerk (zie `RijKenmerk`). Op echte PDOK-beelden bleek de boomrij in het
 *    voorjaarsbeeld (orthoHR, bladloos) de herbicidestrook: bruin/beige en juist LICHTER dan het gras,
 *    maar altijd het minst groen → 'minstGroen' (alle gecontroleerde percelen goed). Met 'donker' lag de
 *    fase daar op alle 6 eerst gecontroleerde percelen 1,0–1,25 m naast de rij (in het gras/de schaduw).
 *    Zomerbeelden zijn dubbelzinnig (hagelnet = lichte rij, kroon zonder net = donkere rij); zie
 *    docs/rijenkaart/detectie-resultaten.md. In `diagnostiek` staat ook het contrast van de fase een
 *    halve rij verschoven, zodat de UI 'verschuif halve rij' kan aanbieden.
 *
 * 4. Confidence ∈ [0, 1] — de genormaliseerde autocorrelatie van het (met een venster van precies s
 *    ontdaan van trend) profiel op lag s: R(s) / R(0). Voor zuivere strepen is die ≈ 1, voor ruis ≈ 0, en
 *    een trend of één grote vlek (vijver, schuur) telt niet mee. Het is het deel van de profielvariantie dat
 *    zich na precies één rijafstand herhaalt, dus het daalt ook als een deel van het perceel andere rijen
 *    heeft (ander blok, verschoven fase). Dit getal wordt vermenigvuldigd met drie factoren in [0, 1]:
 *     - min(1, (P − 2) / 3), met P de piek/achtergrond-verhouding van het grove spectrum (structuurloos
 *       beeld op een groot perceel: P ≈ 2 → 0; echte boomgaarden P ≈ 300–8000);
 *     - significantie: (G − 2) / 4 begrensd op [0, 1], met G = P / (sterkste piek ≥ 15° naast de gevonden
 *       richting). Ruis en textuur zonder rijen: G ≈ 1,0–3,1 — ook op kleine percelen, waar P door de
 *       weinige tegels wél groot kan worden (zonder deze factor scoorde korrelige ruis op 0,1 ha tot 0,64);
 *       echte boomgaarden G ≈ 23–370; een perceel met blokken in twee rijrichtingen G ≈ 1,1–1,8 (anders
 *       0,93 'voldoende' met rijen die maar op de helft passen) → `meerdereRichtingen` + `reden`;
 *     - min(1, S / 0,02), met S de streepsterkte: het deel van de pixelvariantie dat het gevouwen
 *       rijpatroon verklaart (echte percelen 0,04–0,72; een vrijwel onzichtbaar maar regelmatig patroon,
 *       bv. werkgangen in graan, 0,001).
 *    Kalibratie: synthetische strepen 0,99; pure ruis 0,00–0,01; echte percelen met één rijrichting
 *    0,62–0,99, een oude boomgaard met lange schaduwen (~4,2 m) 0,30–0,39, één zwak, jong blok in een
 *    zomerbeeld 0,21. Is de uitkomst onvoldoende, dan staat in
 *    `diagnostiek.reden` een NL-zin voor de UI. Let op: confidence meet de regelmaat van een patroon, niet
 *    "dit is een boomgaard" — akkers met werkgangen of bedden van ~3 m scoren ook hoog.
 */

import { asRichting } from './geo';
import type { DetectieResultaat, PerceelRD, XY } from './types';

// ---------------------------------------------------------------------------
// Constanten
// ---------------------------------------------------------------------------

/** Onder deze confidence: melding + handmatige modus. Gekalibreerd op synthetische en echte beelden. */
export const DETECTIE_DREMPEL = 0.3;

/**
 * Zoekbereik voor de rijafstand als er geen verwachting is (fruitteelt NL). max/min < 2, zodat er van een
 * rijpatroon binnen het bereik nooit een harmonische (s/2, 2s) in het bereik valt. 4,8 i.p.v. 4,0: een
 * oudere boomgaard van de test-user (Kloetinge Spoor) staat op ~4,15 m en werd met 4,0 op de rand gevonden.
 */
export const RIJAFSTAND_MIN_M = 2.5;
export const RIJAFSTAND_MAX_M = 4.8;

/**
 * Een verwachte rijafstand buiten dit bereik wordt genegeerd (typefout, boomafstand, cm i.p.v. m); dan wordt
 * het standaardbereik doorzocht en staat `verwachtGenegeerd` in de diagnostiek.
 */
const VERWACHT_MIN_M = 2.0;
const VERWACHT_MAX_M = 10;

/**
 * Significantie = sterkste piek / sterkste piek ≥ 15° daarnaast (in het grove spectrum, alle s). Ruis en
 * structuur zonder rijen: 1,0–3,1 (gemeten, ook kleine percelen met korrelige textuur); echte boomgaarden
 * met één rijrichting: 23–370. Een perceel met blokken in twee richtingen (Thuis, 10 ha): 1,1–1,8.
 * Factor in de confidence: 0 bij ≤ 2, 1 bij ≥ 6.
 */
const SIGNIFICANTIE_MIN = 2;
const SIGNIFICANTIE_VOL = 6;
const ELDERS_HOEK = 15;
/** Piek/achtergrond vanaf waar de tweede richting zelf een echt rijpatroon is (ruis haalt ≤ ~30) */
const TWEEDE_PATROON_P = 50;
/** Ligt de rijafstand binnen deze marge van de rand van het zoekbereik, dan wordt gecontroleerd of de top erbuiten ligt */
const RAND_MARGE_M = 0.02;

/**
 * Onder deze streepsterkte (deel van de pixelvariantie dat het rijpatroon verklaart) zakt de confidence
 * evenredig: zulke strepen zijn met het oog niet te zien (echte percelen ≥ 0,04, ruis ≈ 0).
 */
const MIN_STREEPSTERKTE = 0.02;

/** Bij een verwachte rijafstand wordt ±15 % rond die waarde gezocht */
const VERWACHT_MARGE = 0.15;
const HIGHPASS_STRAAL_M = 2.5;
const GROF_PUNT_M = 0.75;
const GROF_TEGEL_M = 40;
const GROF_BAK_M = 0.2;
const GROF_S_STAP = 0.1;
const FIJN_BAK_M = 0.05;
const FIJN_HOEK_BEREIK = 1.5;
const FIJN_HOEK_STAP = 0.1;
const FIJN_S_BEREIK = 0.1;
const FIJN_S_STAP = 0.005;
const VOUW_BAKJES = 32;

const RAD = Math.PI / 180;
const TWEE_PI = 2 * Math.PI;

/**
 * Welke strook in het gevouwen profiel de boomrij is.
 *  - 'donker': minimum van de helderheid (zomerbeeld: kroon donkerder dan gras)
 *  - 'licht': maximum van de helderheid
 *  - 'minstGroen': minimum van de groenindex (voorjaarsbeeld: herbicidestrook bruin/beige, gras groen);
 *    vereist `groen` in de invoer, anders wordt 'donker' gebruikt.
 */
export type RijKenmerk = 'donker' | 'licht' | 'minstGroen';

export interface DetectieInvoer {
  /** Helderheid per pixel (rij voor rij, linksboven eerst), zie `naarGrijs` */
  grijs: Float32Array;
  breedte: number;
  hoogte: number;
  /** Pixelgrootte in meters */
  pixelM: number;
  /** RD-coördinaat van de linkerbovenhoek van het beeld: [minX, maxY] */
  origineRD: XY;
  /** 1 = pixel telt mee (binnen het perceel, weg van de rand); null = alles */
  masker?: Uint8Array | null;
  zwaartepuntRD: XY;
  /** Bekende rijafstand: zoek ±15 % hieromheen */
  verwachteRijafstandM?: number | null;
  bronBeeld?: string;
  /** Optioneel: groenindex per pixel (zie `naarGroenindex`), voor de fase bij rijKenmerk 'minstGroen' */
  groen?: Float32Array | null;
  /** Standaard 'minstGroen' als `groen` is meegegeven, anders 'donker' */
  rijKenmerk?: RijKenmerk;
}

// ---------------------------------------------------------------------------
// Beeldhulpjes
// ---------------------------------------------------------------------------

function nu(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

/** Helderheid (Rec. 601, 0..255) uit RGBA-bytes */
export function naarGrijs(rgba: Uint8ClampedArray | Uint8Array, breedte: number, hoogte: number): Float32Array {
  const n = breedte * hoogte;
  if (rgba.length < n * 4) throw new Error('RGBA-buffer is kleiner dan breedte × hoogte × 4');
  const uit = new Float32Array(n);
  for (let i = 0, k = 0; i < n; i++, k += 4) {
    uit[i] = 0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2];
  }
  return uit;
}

/**
 * Groenindex (genormaliseerde 'excess green', ×100): 100·(2G − R − B) / (R + G + B).
 * Gras ≈ 10–25, kale grond/dode herbicidestrook ≈ 0 of lager.
 */
export function naarGroenindex(rgba: Uint8ClampedArray | Uint8Array, breedte: number, hoogte: number): Float32Array {
  const n = breedte * hoogte;
  if (rgba.length < n * 4) throw new Error('RGBA-buffer is kleiner dan breedte × hoogte × 4');
  const uit = new Float32Array(n);
  for (let i = 0, k = 0; i < n; i++, k += 4) {
    const r = rgba[k];
    const g = rgba[k + 1];
    const b = rgba[k + 2];
    const som = r + g + b;
    uit[i] = som > 0 ? (100 * (2 * g - r - b)) / som : 0;
  }
  return uit;
}

/**
 * Masker: 1 voor pixels waarvan het middelpunt binnen het perceel ligt én minstens `erosieM` van de rand.
 * Rasterisatie per scanlijn (even-odd, dus gaten en MultiPolygon werken), daarna erosie met een vierkant
 * van ±erosieM (scheidbaar, via lopende tellingen): elk pixel binnen erosieM van de rand valt zeker weg.
 */
export function maakMasker(
  perceel: PerceelRD,
  breedte: number,
  hoogte: number,
  pixelM: number,
  origineRD: XY,
  erosieM = 3,
): Uint8Array {
  const masker = new Uint8Array(breedte * hoogte);
  const [ox, oy] = origineRD;
  const randen: number[] = []; // x0, y0, x1, y1 per randsegment
  for (const poly of perceel.polygonen) {
    for (const ring of poly) {
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        randen.push(ring[b][0], ring[b][1], ring[a][0], ring[a][1]);
      }
    }
  }
  const kruisingen: number[] = [];
  for (let j = 0; j < hoogte; j++) {
    const y = oy - (j + 0.5) * pixelM;
    kruisingen.length = 0;
    for (let e = 0; e < randen.length; e += 4) {
      const y0 = randen[e + 1];
      const y1 = randen[e + 3];
      if ((y0 > y) !== (y1 > y)) {
        const x0 = randen[e];
        const x1 = randen[e + 2];
        kruisingen.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    if (kruisingen.length < 2) continue;
    kruisingen.sort((p, q) => p - q);
    const rij = j * breedte;
    for (let k = 0; k + 1 < kruisingen.length; k += 2) {
      // pixel i binnen als x_i = ox + (i+0,5)·pixelM in [xa, xb)
      const i0 = Math.max(0, Math.ceil((kruisingen[k] - ox) / pixelM - 0.5));
      const i1 = Math.min(breedte - 1, Math.ceil((kruisingen[k + 1] - ox) / pixelM - 0.5) - 1);
      for (let i = i0; i <= i1; i++) masker[rij + i] = 1;
    }
  }
  const r = Math.round(erosieM / pixelM);
  if (r <= 0) return masker;
  return erodeer(masker, breedte, hoogte, r);
}

/** Erosie met een vierkant (2r+1)²: scheidbaar, O(n). Buiten het beeld telt als 'buiten'. */
function erodeer(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const uit = new Uint8Array(w * h);
  const venster = 2 * r + 1;
  // horizontaal
  const pre = new Int32Array(Math.max(w, h) + 1);
  for (let j = 0; j < h; j++) {
    const rij = j * w;
    pre[0] = 0;
    for (let i = 0; i < w; i++) pre[i + 1] = pre[i] + m[rij + i];
    for (let i = r; i < w - r; i++) {
      if (m[rij + i] && pre[i + r + 1] - pre[i - r] === venster) tmp[rij + i] = 1;
    }
  }
  // verticaal
  for (let i = 0; i < w; i++) {
    pre[0] = 0;
    for (let j = 0; j < h; j++) pre[j + 1] = pre[j] + tmp[j * w + i];
    for (let j = r; j < h - r; j++) {
      if (tmp[j * w + i] && pre[j + r + 1] - pre[j - r] === venster) uit[j * w + i] = 1;
    }
  }
  return uit;
}

/** Boxsom met straal r langs rijen en kolommen (scheidbaar), randen afgekapt. */
function boxSom(bron: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const uit = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const rij = j * w;
    let acc = 0;
    for (let i = 0; i <= Math.min(r, w - 1); i++) acc += bron[rij + i];
    for (let i = 0; i < w; i++) {
      tmp[rij + i] = acc;
      const erbij = i + r + 1;
      const eraf = i - r;
      if (erbij < w) acc += bron[rij + erbij];
      if (eraf >= 0) acc -= bron[rij + eraf];
    }
  }
  for (let i = 0; i < w; i++) {
    let acc = 0;
    for (let j = 0; j <= Math.min(r, h - 1); j++) acc += tmp[j * w + i];
    for (let j = 0; j < h; j++) {
      uit[j * w + i] = acc;
      const erbij = j + r + 1;
      const eraf = j - r;
      if (erbij < h) acc += tmp[erbij * w + i];
      if (eraf >= 0) acc -= tmp[eraf * w + i];
    }
  }
  return uit;
}

/**
 * High-pass binnen het masker: beeld − lokaal gemiddelde (genormaliseerde boxblur), dan gemiddelde 0,
 * gedeeld door σ en afgekapt op ±3. Buiten het masker 0.
 */
export function voorbewerk(beeld: Float32Array, w: number, h: number, masker: Uint8Array, pixelM: number,
  straalM = HIGHPASS_STRAAL_M): Float32Array {
  const n = w * h;
  const gewogen = new Float32Array(n);
  const m = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (masker[k]) {
      gewogen[k] = beeld[k];
      m[k] = 1;
    }
  }
  const r = Math.max(1, Math.round(straalM / pixelM));
  const teller = boxSom(gewogen, w, h, r);
  const noemer = boxSom(m, w, h, r);
  const uit = new Float32Array(n);
  let som = 0;
  let som2 = 0;
  let aantal = 0;
  for (let k = 0; k < n; k++) {
    if (!masker[k] || noemer[k] <= 0) continue;
    const v = beeld[k] - teller[k] / noemer[k];
    uit[k] = v;
    som += v;
    som2 += v * v;
    aantal++;
  }
  if (aantal === 0) return uit;
  const gem = som / aantal;
  const sd = Math.sqrt(Math.max(1e-12, som2 / aantal - gem * gem));
  for (let k = 0; k < n; k++) {
    if (!masker[k] || noemer[k] <= 0) continue;
    let v = (uit[k] - gem) / sd;
    if (v > 3) v = 3;
    else if (v < -3) v = -3;
    uit[k] = v;
  }
  return uit;
}

// ---------------------------------------------------------------------------
// Punten (2×2-gemiddeld beeld) en spectra
// ---------------------------------------------------------------------------

interface Punten {
  x: Float32Array; // t.o.v. zwaartepunt (m)
  y: Float32Array;
  v: Float32Array;
  tegel: Int32Array; // index in tegelX/tegelY
  n: number;
  tegelX: Float64Array; // tegelmiddelpunt t.o.v. zwaartepunt
  tegelY: Float64Array;
  aantalTegels: number;
  straal: number; // max |p|
  blokM: number; // afstand tussen de punten (m)
}

function bouwPunten(hp: Float32Array, masker: Uint8Array, w: number, h: number, pixelM: number, origine: XY,
  zwaartepunt: XY): Punten {
  const f = Math.max(1, Math.round(GROF_PUNT_M / pixelM));
  const bw = Math.floor(w / f);
  const bh = Math.floor(h / f);
  const max = bw * bh;
  const xs = new Float32Array(max);
  const ys = new Float32Array(max);
  const vs = new Float32Array(max);
  const tegelRuw = new Int32Array(max);
  const blokM = f * pixelM;
  const tegelsPerRij = Math.ceil((bw * blokM) / GROF_TEGEL_M) + 1;
  const kaart = new Map<number, number>();
  const tx: number[] = [];
  const ty: number[] = [];
  let n = 0;
  let straal = 0;
  for (let bj = 0; bj < bh; bj++) {
    for (let bi = 0; bi < bw; bi++) {
      let som = 0;
      let vol = true;
      for (let dj = 0; dj < f && vol; dj++) {
        const rij = (bj * f + dj) * w + bi * f;
        for (let di = 0; di < f; di++) {
          if (!masker[rij + di]) {
            vol = false;
            break;
          }
          som += hp[rij + di];
        }
      }
      if (!vol) continue;
      const x = origine[0] + (bi + 0.5) * blokM - zwaartepunt[0];
      const y = origine[1] - (bj + 0.5) * blokM - zwaartepunt[1];
      const ti = Math.floor((bi * blokM) / GROF_TEGEL_M);
      const tj = Math.floor((bj * blokM) / GROF_TEGEL_M);
      const sleutel = tj * tegelsPerRij + ti;
      let idx = kaart.get(sleutel);
      if (idx === undefined) {
        idx = tx.length;
        kaart.set(sleutel, idx);
        tx.push(origine[0] + (ti + 0.5) * GROF_TEGEL_M - zwaartepunt[0]);
        ty.push(origine[1] - (tj + 0.5) * GROF_TEGEL_M - zwaartepunt[1]);
      }
      xs[n] = x;
      ys[n] = y;
      vs[n] = som / (f * f);
      tegelRuw[n] = idx;
      const r = Math.hypot(x, y);
      if (r > straal) straal = r;
      n++;
    }
  }
  return {
    x: xs, y: ys, v: vs, tegel: tegelRuw, n,
    tegelX: Float64Array.from(tx), tegelY: Float64Array.from(ty), aantalTegels: tx.length, straal, blokM,
  };
}

/**
 * Grof spectrum: Welch-vermogen (som over tegels van |DFT|²) voor θ = 0..179° en alle s in `sWaarden`.
 * Resultaat: Float64Array [θ * nS + si].
 */
function grofSpectrum(p: Punten, sWaarden: number[]): Float64Array {
  const nS = sWaarden.length;
  const half = (GROF_TEGEL_M * Math.SQRT2) / 2 + 1;
  const nB = Math.ceil((2 * half) / GROF_BAK_M);
  const cosT = new Float64Array(nS * nB);
  const sinT = new Float64Array(nS * nB);
  for (let si = 0; si < nS; si++) {
    const w = TWEE_PI / sWaarden[si];
    for (let b = 0; b < nB; b++) {
      const t = -half + (b + 0.5) * GROF_BAK_M;
      cosT[si * nB + b] = Math.cos(w * t);
      sinT[si * nB + b] = Math.sin(w * t);
    }
  }
  const T = p.aantalTegels;
  const prof = new Float64Array(T * nB);
  const bMin = new Int32Array(T);
  const bMax = new Int32Array(T);
  const tc = new Float64Array(T);
  const uit = new Float64Array(180 * nS);
  for (let hoek = 0; hoek < 180; hoek++) {
    const nx = Math.cos(hoek * RAD);
    const ny = -Math.sin(hoek * RAD);
    prof.fill(0);
    bMin.fill(nB);
    bMax.fill(-1);
    for (let t = 0; t < T; t++) tc[t] = p.tegelX[t] * nx + p.tegelY[t] * ny - half;
    for (let k = 0; k < p.n; k++) {
      const tg = p.tegel[k];
      let b = Math.floor((p.x[k] * nx + p.y[k] * ny - tc[tg]) / GROF_BAK_M);
      if (b < 0) b = 0;
      else if (b >= nB) b = nB - 1;
      prof[tg * nB + b] += p.v[k];
      if (b < bMin[tg]) bMin[tg] = b;
      if (b > bMax[tg]) bMax[tg] = b;
    }
    for (let si = 0; si < nS; si++) {
      let vermogen = 0;
      const basis = si * nB;
      for (let t = 0; t < T; t++) {
        let re = 0;
        let im = 0;
        const off = t * nB;
        for (let b = bMin[t]; b <= bMax[t]; b++) {
          const v = prof[off + b];
          re += v * cosT[basis + b];
          im += v * sinT[basis + b];
        }
        vermogen += re * re + im * im;
      }
      uit[hoek * nS + si] = vermogen;
    }
  }
  return uit;
}

/** Coherente DFT van alle punten op (θ, s): geeft re/im, met offsets t.o.v. het zwaartepunt. */
function fijnProfiel(p: Punten, hoek: number): { prof: Float64Array; t0: number; bMin: number; bMax: number } {
  const nx = Math.cos(hoek * RAD);
  const ny = -Math.sin(hoek * RAD);
  const t0 = -p.straal - 1;
  const nB = Math.ceil((2 * p.straal + 2) / FIJN_BAK_M) + 1;
  const prof = new Float64Array(nB);
  let bMin = nB;
  let bMax = -1;
  for (let k = 0; k < p.n; k++) {
    const b = Math.floor((p.x[k] * nx + p.y[k] * ny - t0) / FIJN_BAK_M);
    prof[b] += p.v[k];
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }
  return { prof, t0, bMin, bMax };
}

function dft(prof: Float64Array, t0: number, bMin: number, bMax: number, s: number): { re: number; im: number } {
  // recurrente rotatie i.p.v. cos/sin per bakje
  const w = TWEE_PI / s;
  const start = w * (t0 + (bMin + 0.5) * FIJN_BAK_M);
  let c = Math.cos(start);
  let sn = Math.sin(start);
  const dc = Math.cos(w * FIJN_BAK_M);
  const ds = Math.sin(w * FIJN_BAK_M);
  let re = 0;
  let im = 0;
  for (let b = bMin; b <= bMax; b++) {
    const v = prof[b];
    re += v * c;
    im -= v * sn;
    const c2 = c * dc - sn * ds;
    sn = sn * dc + c * ds;
    c = c2;
  }
  return { re, im };
}

/** Parabolische interpolatie: offset ∈ [−0,5; 0,5] van de top t.o.v. het middelste punt */
function parabool(a: number, b: number, c: number): number {
  const noemer = a - 2 * b + c;
  if (noemer >= 0 || !Number.isFinite(noemer)) return 0;
  const d = (0.5 * (a - c)) / noemer;
  return Math.max(-0.5, Math.min(0.5, d));
}

function mediaan(waarden: number[]): number {
  const s = [...waarden].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------------------
// Profiel op volle resolutie: confidence en vouwen
// ---------------------------------------------------------------------------

/**
 * Verdeel waarde v van een pixel met voetafdruk [u − half, u + half] over bakjes van breedte bw
 * (bakje b dekt [b·bw, (b+1)·bw)), naar rato van overlap. Zonder dit blijven bij rijen precies langs het
 * pixelrooster (0° of 90°) bakjes leeg, omdat alle offsets dan op een veelvoud van pixelM liggen.
 */
function spreid(doel: Float64Array, tel: Float64Array | null, u: number, half: number, bw: number, v: number,
  circulair: boolean): void {
  const a = (u - half) / bw;
  const b = (u + half) / bw;
  const breedte = b - a;
  const n = doel.length;
  const ia = Math.floor(a);
  const ib = Math.floor(b);
  for (let k = ia; k <= ib; k++) {
    const f = (Math.min(b, k + 1) - Math.max(a, k)) / breedte;
    if (f <= 0) continue;
    let idx = k;
    if (circulair) idx = ((k % n) + n) % n;
    else if (k < 0 || k >= n) continue;
    doel[idx] += v * f;
    if (tel) tel[idx] += f;
  }
}

export interface GevouwenProfiel {
  /** Gemiddelde waarde per fasestapje (32 stapjes), stapje q ligt op (q + 0,5)·s/32 */
  waarden: Float64Array;
  /** Fase van het minimum (m), ∈ [0, s) */
  minimumM: number;
  /** Fase van het maximum (m), ∈ [0, s) */
  maximumM: number;
  /** max − min van het (licht gladgestreken) profiel */
  bereik: number;
  /**
   * Deel van de pixelvariantie (binnen het masker) dat het rijpatroon verklaart: tussen-stapjes-variantie /
   * totale variantie ∈ [0, 1]. Ruis ≈ 0; duidelijk zichtbare rijen ≫ 0.
   */
  verklaardDeel: number;
}

/**
 * Vouw de waarden (binnen het masker) op de normaal van richting θ modulo s, t.o.v. het zwaartepunt
 * (= kruiscorrelatie met een kam op afstand s). Het profiel wordt circulair gladgestreken over 3 stapjes
 * (~0,3 m) en het minimum/maximum parabolisch geïnterpoleerd. Ook bruikbaar voor diagnostiek met een
 * ander kenmerk (bv. groenindex).
 */
export function vouwProfiel(waarden: Float32Array, masker: Uint8Array | null | undefined, breedte: number,
  hoogte: number, pixelM: number, origineRD: XY, zwaartepuntRD: XY, richtingGraden: number,
  rijafstandM: number): GevouwenProfiel {
  const nx = Math.cos(richtingGraden * RAD);
  const ny = -Math.sin(richtingGraden * RAD);
  const q = VOUW_BAKJES;
  const s = rijafstandM;
  const bw = s / q;
  const half = pixelM / 2;
  const som = new Float64Array(q);
  const aantal = new Float64Array(q);
  let totSom = 0;
  let totKwadraat = 0;
  let totAantal = 0;
  for (let j = 0; j < hoogte; j++) {
    const basis = (origineRD[1] - (j + 0.5) * pixelM - zwaartepuntRD[1]) * ny;
    const rij = j * breedte;
    for (let i = 0; i < breedte; i++) {
      const k = rij + i;
      if (masker && !masker[k]) continue;
      const v = waarden[k];
      const t = (origineRD[0] + (i + 0.5) * pixelM - zwaartepuntRD[0]) * nx + basis;
      spreid(som, aantal, t - Math.floor(t / s) * s, half, bw, v, true);
      totSom += v;
      totKwadraat += v * v;
      totAantal++;
    }
  }
  let verklaardDeel = 0;
  if (totAantal > 0) {
    const gem = totSom / totAantal;
    const totaal = totKwadraat - totAantal * gem * gem;
    let tussen = 0;
    for (let b = 0; b < q; b++) {
      if (aantal[b] > 0) {
        const m = som[b] / aantal[b] - gem;
        tussen += aantal[b] * m * m;
      }
    }
    verklaardDeel = totaal > 0 ? Math.max(0, Math.min(1, tussen / totaal)) : 0;
  }
  const glad = new Float64Array(q);
  for (let b = 0; b < q; b++) {
    let sw = 0;
    let n = 0;
    for (let r = 1; n <= 0 && r < q; r++) {
      sw = 0;
      n = 0;
      for (let d = -r; d <= r; d++) {
        const idx = (b + d + q) % q;
        sw += som[idx];
        n += aantal[idx];
      }
    }
    glad[b] = n > 0 ? sw / n : 0;
  }
  let iMin = 0;
  let iMax = 0;
  for (let b = 1; b < q; b++) {
    if (glad[b] < glad[iMin]) iMin = b;
    if (glad[b] > glad[iMax]) iMax = b;
  }
  const dMin = parabool(-glad[(iMin + q - 1) % q], -glad[iMin], -glad[(iMin + 1) % q]);
  const dMax = parabool(glad[(iMax + q - 1) % q], glad[iMax], glad[(iMax + 1) % q]);
  const naarM = (idx: number) => {
    const v = ((idx + 0.5) / q) * s;
    return ((v % s) + s) % s;
  };
  return {
    waarden: glad,
    minimumM: naarM(iMin + dMin),
    maximumM: naarM(iMax + dMax),
    bereik: glad[iMax] - glad[iMin],
    verklaardDeel,
  };
}

/** Waarde van een gevouwen profiel op fase φ (lineair geïnterpoleerd, circulair) */
function profielOp(p: GevouwenProfiel, faseM: number, s: number): number {
  const q = p.waarden.length;
  let f = (faseM / s) * q - 0.5;
  f = ((f % q) + q) % q;
  const a = Math.floor(f);
  const t = f - a;
  return p.waarden[a % q] * (1 - t) + p.waarden[(a + 1) % q] * t;
}

/**
 * Autocorrelatie-confidence: profiel (som per bakje van s/32, pixels naar rato verdeeld) van de high-pass
 * waarden op richting θ, trend weg met een lopend gemiddelde van precies één rijafstand, dan R(s)/R(0)
 * (Pearson over de overlappende delen), afgekapt op [0, 1].
 */
function autocorrelatieOpLag(hp: Float32Array, masker: Uint8Array, w: number, h: number, pixelM: number,
  origine: XY, zwaartepunt: XY, hoek: number, s: number): number {
  const q = VOUW_BAKJES;
  const bw = s / q;
  const nx = Math.cos(hoek * RAD);
  const ny = -Math.sin(hoek * RAD);
  // bereik van t over het beeld
  const hoeken: XY[] = [
    [origine[0] - zwaartepunt[0], origine[1] - zwaartepunt[1]],
    [origine[0] + w * pixelM - zwaartepunt[0], origine[1] - zwaartepunt[1]],
    [origine[0] - zwaartepunt[0], origine[1] - h * pixelM - zwaartepunt[1]],
    [origine[0] + w * pixelM - zwaartepunt[0], origine[1] - h * pixelM - zwaartepunt[1]],
  ];
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const [x, y] of hoeken) {
    const t = x * nx + y * ny;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  const t0 = tMin - pixelM - bw;
  const nB = Math.ceil((tMax + pixelM - t0) / bw) + 2;
  const prof = new Float64Array(nB);
  const half = pixelM / 2;
  for (let j = 0; j < h; j++) {
    const basis = (origine[1] - (j + 0.5) * pixelM - zwaartepunt[1]) * ny - t0;
    const rij = j * w;
    for (let i = 0; i < w; i++) {
      const k = rij + i;
      if (!masker[k]) continue;
      const u = (origine[0] + (i + 0.5) * pixelM - zwaartepunt[0]) * nx + basis;
      spreid(prof, null, u, half, bw, hp[k], false);
    }
  }
  // lopend gemiddelde over q bakjes (= één rijafstand)
  const cum = new Float64Array(nB + 1);
  for (let b = 0; b < nB; b++) cum[b + 1] = cum[b] + prof[b];
  const halfQ = q >> 1;
  const d = new Float64Array(nB);
  for (let b = 0; b < nB; b++) {
    const a = Math.max(0, b - halfQ);
    const e = Math.min(nB, b - halfQ + q);
    const gem = e > a ? (cum[e] - cum[a]) / q : 0;
    d[b] = prof[b] - gem;
  }
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let b = 0; b + q < nB; b++) {
    sxy += d[b] * d[b + q];
    sxx += d[b] * d[b];
    syy += d[b + q] * d[b + q];
  }
  if (sxx <= 0 || syy <= 0) return 0;
  return Math.max(0, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

// ---------------------------------------------------------------------------
// Detectie
// ---------------------------------------------------------------------------

/** Fase op mm afgerond, binnen [0, s) */
function rondFase(f: number, s: number): number {
  const r = Math.round((((f % s) + s) % s) * 1000) / 1000;
  return r >= s ? 0 : r;
}

function rond(v: number, decimalen: number): number {
  const f = 10 ** decimalen;
  return Math.round(v * f) / f;
}

function leegResultaat(bron: string, start: number, reden: string): DetectieResultaat {
  return {
    richtingGraden: 0,
    rijafstandM: 0,
    faseM: 0,
    confidence: 0,
    drempel: DETECTIE_DREMPEL,
    voldoende: false,
    bronBeeld: bron,
    duurMs: Math.round(nu() - start),
    diagnostiek: { reden },
  };
}

/** Uitkomst van de spectrale zoektocht (richting + rijafstand) binnen één zoekbereik */
interface Kandidaat {
  richting: number;
  s: number;
  sMin: number;
  sMax: number;
  /** Grove piek / spectrale achtergrond */
  besteScore: number;
  /** besteScore / sterkste piek ≥ ELDERS_HOEK daarnaast */
  significantie: number;
  eldersScore: number;
  tweedeRichting: number;
  tweedeS: number;
  grofRichting: number;
  grofS: number;
  fijnVermogen: number;
  /** De top ligt (net) buiten het zoekbereik: de rijafstand is afgekapt en dus onbetrouwbaar */
  opRand: boolean;
  grofMs: number;
  fijnMs: number;
}

/** Coherent vermogen van het fijne profiel op afstand s */
function vermogen(fp: { prof: Float64Array; t0: number; bMin: number; bMax: number }, s: number): number {
  const { re, im } = dft(fp.prof, fp.t0, fp.bMin, fp.bMax, s);
  return re * re + im * im;
}

/** Grof (Welch, alle richtingen) → fijn (coherent) zoeken naar de rijrichting en rijafstand in [sMin, sMax]. */
function zoekPatroon(punten: Punten, sMin: number, sMax: number): Kandidaat {
  const t0 = nu();
  const sWaarden: number[] = [];
  const nS = Math.max(3, Math.round((sMax - sMin) / GROF_S_STAP) + 1);
  for (let i = 0; i < nS; i++) sWaarden.push(sMin + ((sMax - sMin) * i) / (nS - 1));

  // --- grof
  const grof = grofSpectrum(punten, sWaarden);
  const achtergrond: number[] = [];
  for (let si = 0; si < nS; si++) {
    const kolom: number[] = [];
    for (let hoek = 0; hoek < 180; hoek++) kolom.push(grof[hoek * nS + si]);
    achtergrond.push(Math.max(1e-12, mediaan(kolom)));
  }
  let besteH = 0;
  let besteS = 0;
  let besteScore = -1;
  for (let hoek = 0; hoek < 180; hoek++) {
    for (let si = 0; si < nS; si++) {
      const score = grof[hoek * nS + si] / achtergrond[si];
      if (score > besteScore) {
        besteScore = score;
        besteH = hoek;
        besteS = si;
      }
    }
  }
  // sterkste piek elders (≥ ELDERS_HOEK van de beste richting): ruisniveau van dít beeld, of een tweede blok
  let eldersScore = 0;
  let tweedeH = 0;
  let tweedeSi = 0;
  for (let hoek = 0; hoek < 180; hoek++) {
    const dh = Math.abs(hoek - besteH);
    if (Math.min(dh, 180 - dh) < ELDERS_HOEK) continue;
    for (let si = 0; si < nS; si++) {
      const score = grof[hoek * nS + si] / achtergrond[si];
      if (score > eldersScore) {
        eldersScore = score;
        tweedeH = hoek;
        tweedeSi = si;
      }
    }
  }
  const significantie = eldersScore > 0 ? besteScore / eldersScore : besteScore > 0 ? SIGNIFICANTIE_VOL : 0;

  const sc = (hoek: number, si: number) => grof[(((hoek % 180) + 180) % 180) * nS + si] / achtergrond[si];
  let grofHoek = besteH + parabool(sc(besteH - 1, besteS), besteScore, sc(besteH + 1, besteS));
  let grofS = sWaarden[besteS];
  if (besteS > 0 && besteS < nS - 1) {
    grofS += parabool(sc(besteH, besteS - 1), besteScore, sc(besteH, besteS + 1)) * (sWaarden[1] - sWaarden[0]);
  }
  const tGrof = nu();

  // --- fijn (coherent), max. 3 keer hercentreren als de top op de rand van het venster ligt
  let fijnHoek = grofHoek;
  let fijnS = grofS;
  let fijnVermogen = 0;
  for (let ronde = 0; ronde < 3; ronde++) {
    const nH = Math.round((2 * FIJN_HOEK_BEREIK) / FIJN_HOEK_STAP) + 1;
    const nSf = Math.round((2 * FIJN_S_BEREIK) / FIJN_S_STAP) + 1;
    const hoeken: number[] = [];
    for (let i = 0; i < nH; i++) hoeken.push(grofHoek - FIJN_HOEK_BEREIK + i * FIJN_HOEK_STAP);
    const ss: number[] = [];
    for (let i = 0; i < nSf; i++) {
      const s = grofS - FIJN_S_BEREIK + i * FIJN_S_STAP;
      if (s >= sMin - 1e-9 && s <= sMax + 1e-9) ss.push(s);
    }
    if (ss.length < 3) ss.splice(0, ss.length, grofS - FIJN_S_STAP, grofS, grofS + FIJN_S_STAP);
    const veld = new Float64Array(hoeken.length * ss.length);
    let bi = 0;
    let bs = 0;
    let bv = -1;
    for (let hi = 0; hi < hoeken.length; hi++) {
      const fp = fijnProfiel(punten, hoeken[hi]);
      for (let si = 0; si < ss.length; si++) {
        const v = vermogen(fp, ss[si]);
        veld[hi * ss.length + si] = v;
        if (v > bv) {
          bv = v;
          bi = hi;
          bs = si;
        }
      }
    }
    const V = (hi: number, si: number) => veld[hi * ss.length + si];
    const dH = bi > 0 && bi < hoeken.length - 1 ? parabool(V(bi - 1, bs), bv, V(bi + 1, bs)) : 0;
    const dS = bs > 0 && bs < ss.length - 1 ? parabool(V(bi, bs - 1), bv, V(bi, bs + 1)) : 0;
    fijnHoek = hoeken[bi] + dH * FIJN_HOEK_STAP;
    fijnS = ss[bs] + dS * (ss.length > 1 ? ss[1] - ss[0] : FIJN_S_STAP);
    fijnVermogen = bv;
    const opRandH = bi === 0 || bi === hoeken.length - 1;
    const opRandS = (bs === 0 && ss[0] > sMin + 1e-9) || (bs === ss.length - 1 && ss[ss.length - 1] < sMax - 1e-9);
    if (!opRandH && !opRandS) break;
    grofHoek = fijnHoek;
    grofS = fijnS;
  }

  // --- ligt de top op de rand van het zoekbereik en stijgt het vermogen erbuiten nog? Dan is s afgekapt.
  // (Een echte top precies op de rand, bv. 2,50 m, daalt erbuiten en wordt dus niet afgekeurd.)
  let opRand = false;
  const kant = fijnS - sMin < RAND_MARGE_M ? -1 : sMax - fijnS < RAND_MARGE_M ? 1 : 0;
  if (kant !== 0) {
    const fp = fijnProfiel(punten, fijnHoek);
    const binnen = vermogen(fp, fijnS);
    for (let k = 1; k <= 10 && !opRand; k++) {
      if (vermogen(fp, fijnS + kant * k * FIJN_S_STAP) > binnen * 1.001) opRand = true;
    }
  }

  return {
    // eerst afronden, dan pas vouwen: zo hoort de fase exact bij de gerapporteerde richting en afstand
    richting: asRichting(rond(asRichting(fijnHoek), 2)),
    s: rond(fijnS, 4),
    sMin,
    sMax,
    besteScore,
    significantie,
    eldersScore,
    tweedeRichting: tweedeH,
    tweedeS: sWaarden[tweedeSi],
    grofRichting: asRichting(besteH),
    grofS: sWaarden[besteS],
    fijnVermogen,
    opRand,
    grofMs: tGrof - t0,
    fijnMs: nu() - tGrof,
  };
}

/** Beoordeling van een kandidaat: fase (gevouwen rijkenmerk) en confidence */
interface Beoordeling {
  fase: number;
  faseAlt: number;
  contrastRij: number;
  contrastHalveRij: number;
  kenmerk: RijKenmerk;
  ac: number;
  streepsterkte: number;
  streepsterkteKenmerk: number;
  zichtbaarheid: number;
  confidence: number;
  meerdereRichtingen: boolean;
}

interface Beeld {
  grijs: Float32Array;
  groen: Float32Array | null;
  hp: Float32Array;
  masker: Uint8Array;
  w: number;
  h: number;
  pixelM: number;
  origineRD: XY;
  zwaartepuntRD: XY;
}

function beoordeel(b: Beeld, k: Kandidaat, gevraagd: RijKenmerk): Beoordeling {
  const { richting, s } = k;
  const { w, h, pixelM, origineRD, zwaartepuntRD, masker, hp } = b;
  // --- fase: vouwen van het rijkenmerk
  const kenmerk: RijKenmerk = gevraagd === 'minstGroen' && !b.groen ? 'donker' : gevraagd;
  const bronWaarden = kenmerk === 'minstGroen' && b.groen ? b.groen : b.grijs;
  const vouw = vouwProfiel(bronWaarden, masker, w, h, pixelM, origineRD, zwaartepuntRD, richting, s);
  const fase = rondFase(kenmerk === 'licht' ? vouw.maximumM : vouw.minimumM, s);
  const faseAlt = rondFase(fase + s / 2, s);
  const gem = vouw.waarden.reduce((a, c) => a + c, 0) / vouw.waarden.length;
  const teken = kenmerk === 'licht' ? -1 : 1; // rij = dal (donker/minst groen) of top (licht)
  const bereik = vouw.bereik > 0 ? vouw.bereik : 1;
  const contrastRij = (teken * (gem - profielOp(vouw, fase, s))) / bereik;
  const contrastHalveRij = (teken * (gem - profielOp(vouw, faseAlt, s))) / bereik;

  // --- confidence
  const ac = autocorrelatieOpLag(hp, masker, w, h, pixelM, origineRD, zwaartepuntRD, richting, s);
  const streep = vouwProfiel(hp, masker, w, h, pixelM, origineRD, zwaartepuntRD, richting, s);
  const spectraalFactor = Math.max(0, Math.min(1, (k.besteScore - 2) / 3));
  const significantieFactor = Math.max(0, Math.min(1,
    (k.significantie - SIGNIFICANTIE_MIN) / (SIGNIFICANTIE_VOL - SIGNIFICANTIE_MIN)));
  const zichtbaarheid = Math.min(1, streep.verklaardDeel / MIN_STREEPSTERKTE);
  let confidence = rond(ac * spectraalFactor * significantieFactor * zichtbaarheid, 3);
  // afgekapte rijafstand: nooit 'voldoende' (de rijen zouden over het perceel verlopen)
  if (k.opRand) confidence = Math.min(confidence, rond(DETECTIE_DREMPEL / 2, 3));
  return {
    fase,
    faseAlt,
    contrastRij,
    contrastHalveRij,
    kenmerk,
    ac,
    streepsterkte: streep.verklaardDeel,
    streepsterkteKenmerk: vouw.verklaardDeel,
    zichtbaarheid,
    confidence,
    meerdereRichtingen: k.significantie < SIGNIFICANTIE_VOL && k.eldersScore >= TWEEDE_PATROON_P,
  };
}

/** Detecteer rijrichting, rijafstand en fase in een (gemaskeerd) luchtfotoraster. */
export function detecteerRijen(invoer: DetectieInvoer): DetectieResultaat {
  const start = nu();
  const { grijs, breedte: w, hoogte: h, pixelM, origineRD, zwaartepuntRD } = invoer;
  const bron = invoer.bronBeeld ?? 'onbekend';
  if (!(w > 0 && h > 0) || !Number.isInteger(w) || !Number.isInteger(h) || grijs.length < w * h) {
    throw new Error('Ongeldige beeldafmetingen voor rijdetectie');
  }
  if (!(pixelM > 0) || !Number.isFinite(pixelM)) throw new Error('Ongeldige pixelgrootte voor rijdetectie');
  if (invoer.masker && invoer.masker.length < w * h) throw new Error('Masker past niet bij het beeld');
  if (invoer.groen && invoer.groen.length < w * h) throw new Error('Groenindex past niet bij het beeld');

  const masker = invoer.masker ?? new Uint8Array(w * h).fill(1);
  let maskAantal = 0;
  for (let k = 0; k < w * h; k++) maskAantal += masker[k] ? 1 : 0;
  // minimaal ~400 m² bruikbaar oppervlak (ruim 6 rijen van 20 m)
  if (maskAantal * pixelM * pixelM < 400) return leegResultaat(bron, start, 'Perceel te klein voor detectie');

  const hp = voorbewerk(grijs, w, h, masker, pixelM);
  const punten = bouwPunten(hp, masker, w, h, pixelM, origineRD, zwaartepuntRD);
  if (punten.n < 100) return leegResultaat(bron, start, 'Te weinig bruikbare pixels');
  const tVoor = nu();

  const beeld: Beeld = { grijs, groen: invoer.groen ?? null, hp, masker, w, h, pixelM, origineRD, zwaartepuntRD };
  const kenmerk: RijKenmerk = invoer.rijKenmerk ?? (invoer.groen ? 'minstGroen' : 'donker');

  // --- zoekbereik voor s; ondergrens ook boven 2,2 × de puntafstand (anders aliasing in het grove spectrum)
  const ondergrens = 2.2 * punten.blokM;
  const vRuw = invoer.verwachteRijafstandM;
  const verwachtOk = typeof vRuw === 'number' && Number.isFinite(vRuw) && vRuw >= VERWACHT_MIN_M && vRuw <= VERWACHT_MAX_M;
  const verwachtGenegeerd = vRuw != null && !verwachtOk;
  const standaard = (): Kandidaat => zoekPatroon(punten, Math.max(RIJAFSTAND_MIN_M, ondergrens), RIJAFSTAND_MAX_M);
  let kandidaat = verwachtOk
    ? zoekPatroon(punten, Math.max(vRuw * (1 - VERWACHT_MARGE), ondergrens), vRuw * (1 + VERWACHT_MARGE))
    : standaard();
  let oordeel = beoordeel(beeld, kandidaat, kenmerk);
  let verwachtVerlaten = false;
  if (verwachtOk && oordeel.confidence < DETECTIE_DREMPEL) {
    // niets (goeds) binnen ±15 % van de verwachting — verouderde of foute invoer? Het standaardbereik proberen.
    const ruim = standaard();
    const ruimOordeel = beoordeel(beeld, ruim, kenmerk);
    if (ruimOordeel.confidence > oordeel.confidence) {
      kandidaat = ruim;
      oordeel = ruimOordeel;
      verwachtVerlaten = true;
    }
  }
  const tZoek = nu();
  const { richting, s } = kandidaat;
  const { confidence } = oordeel;
  const voldoende = confidence >= DETECTIE_DREMPEL;

  let reden: string | null = null;
  if (!voldoende) {
    if (oordeel.meerdereRichtingen) {
      reden = `Meerdere rijrichtingen in dit perceel (ongeveer ${Math.round(richting) % 180}° en ${kandidaat.tweedeRichting}°)`;
    } else if (kandidaat.opRand) {
      const getal = (v: number) => v.toFixed(2).replace('.', ',');
      reden = `Rijafstand ligt buiten het zoekbereik (${getal(kandidaat.sMin)}–${getal(kandidaat.sMax)} m)`;
    } else {
      reden = 'Geen duidelijk rijpatroon gevonden';
    }
  }

  return {
    richtingGraden: richting,
    rijafstandM: s,
    faseM: oordeel.fase,
    confidence,
    drempel: DETECTIE_DREMPEL,
    voldoende,
    bronBeeld: bron,
    duurMs: Math.round(nu() - start),
    diagnostiek: {
      reden,
      rijKenmerk: oordeel.kenmerk,
      autocorrelatie: rond(oordeel.ac, 3),
      zichtbaarheid: rond(oordeel.zichtbaarheid, 3),
      streepsterkte: rond(oordeel.streepsterkte, 3),
      streepsterkteKenmerk: rond(oordeel.streepsterkteKenmerk, 3),
      piekAchtergrond: rond(kandidaat.besteScore, 2),
      significantie: rond(kandidaat.significantie, 2),
      meerdereRichtingen: oordeel.meerdereRichtingen,
      tweedeRichtingGraden: kandidaat.tweedeRichting,
      tweedeRijafstandM: rond(kandidaat.tweedeS, 3),
      opRandZoekbereik: kandidaat.opRand,
      verwachtGenegeerd,
      verwachtVerlaten,
      grofRichting: rond(kandidaat.grofRichting, 1),
      grofRijafstandM: rond(kandidaat.grofS, 3),
      fijnVermogen: Number(kandidaat.fijnVermogen.toPrecision(4)),
      faseAlternatiefM: oordeel.faseAlt,
      contrastRij: rond(oordeel.contrastRij, 3),
      contrastHalveRij: rond(oordeel.contrastHalveRij, 3),
      halveRijTwijfel: oordeel.contrastHalveRij > 0.6 * oordeel.contrastRij,
      zoekMinM: rond(kandidaat.sMin, 3),
      zoekMaxM: rond(kandidaat.sMax, 3),
      pixels: maskAantal,
      punten: punten.n,
      tegels: punten.aantalTegels,
      voorbewerkingMs: Math.round(tVoor - start),
      grofMs: Math.round(kandidaat.grofMs),
      fijnMs: Math.round(kandidaat.fijnMs),
      zoekEnBeoordeelMs: Math.round(tZoek - tVoor),
    },
  };
}
