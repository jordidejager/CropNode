/**
 * Rijenkaart — rijgeneratie en rijgeometrie (puur, geen I/O).
 *
 * Conventies (zie docs/rijenkaart/PLAN.md §3 en types.ts):
 *  - Rekenen gebeurt in RD New (meters); opslag/uitvoer in WGS84.
 *  - Rijrichting θ ∈ [0, 180), d = (sin θ, cos θ), normaal n = (cos θ, −sin θ).
 *  - offset(p) = (p − zwaartepunt) · n; rijen liggen op faseM + k · rijafstandM.
 *  - beginkantGraden = kompasrichting vanaf het midden van de rij naar het begin
 *    (standaard θ: het begin ligt aan de +d-kant).
 */

import {
  afstand,
  aftrekken,
  asRichting,
  inproduct,
  kompasRichting,
  lijnLengte,
  naarRD,
  naarWGS,
  normaalVector,
  normaliseerGraden,
  projecteerOpLijn,
  puntOpLijn,
  richtingVector,
} from './geo';
import type { GegenereerdeRij, LngLat, PerceelRD, RijParameters, XY } from './types';

const RAD = Math.PI / 180;

/** Stukken van een rij korter dan dit tellen niet als apart stuk (inham-detectie) */
const MIN_STUK_M = 1;
/**
 * Openingen in een rij korter dan dit worden overbrugd: een hoekpunt dat de lijn raakt,
 * een paal-uitsparing in de perceelgrens (in echte BRP-percelen gaten van ~0,6 × 0,6 m) en
 * de naad van een paar mm/cm tussen aangrenzende delen van een MultiPolygon. Echte
 * onderbrekingen (pad, sloot, inham) zijn breder en geven nog steeds `controleren`.
 */
const SAMENVOEG_M = 1;
/** Standaard minimale rijlengte na het inkorten met de kopakkers */
const STANDAARD_MIN_LENGTE_M = 5;
/** Veiligheidsgrens tegen een absurd kleine rijafstand (dan: geen rijen) */
const MAX_RIJEN = 20000;

function eindig(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function nietNegatief(x: unknown): number {
  return eindig(x) && x > 0 ? x : 0;
}

// ---------------------------------------------------------------------------
// Fase en offset
// ---------------------------------------------------------------------------

/** Breng een fase terug naar [0, rijafstandM). Ongeldige invoer → 0. */
export function normaliseerFase(faseM: number, rijafstandM: number): number {
  if (!eindig(rijafstandM) || rijafstandM <= 0 || !eindig(faseM)) return 0;
  let r = faseM % rijafstandM;
  if (r < 0) r += rijafstandM;
  // Afrondingsruis (bv. −1e-12 → rijafstand − 1e-12) terugzetten naar 0
  if (r >= rijafstandM - 1e-6 || r < 1e-9) return 0;
  return r;
}

/** Loodrechte offset (langs de normaal) van het midden van een rij t.o.v. het zwaartepunt. */
export function rijOffset(perceel: PerceelRD, richtingGraden: number, coordsRD: XY[]): number {
  if (coordsRD.length === 0) throw new Error('Lege rij');
  const midden = puntOpLijn(coordsRD, lijnLengte(coordsRD) / 2);
  return inproduct(aftrekken(midden, perceel.zwaartepunt), normaalVector(asRichting(richtingGraden)));
}

/**
 * Rijrichting en fase uit een referentielijn a → b (RD), bv. getekend langs één boomrij.
 * De lijn hoeft niet binnen het perceel te liggen; alleen richting en loodrechte positie tellen.
 */
export function referentielijnNaarParameters(
  perceel: PerceelRD,
  a: XY,
  b: XY,
  rijafstandM: number,
): { richtingGraden: number; faseM: number } {
  const richtingGraden = asRichting(kompasRichting(a, b));
  const faseM = normaliseerFase(rijOffset(perceel, richtingGraden, [a, b]), rijafstandM);
  return { richtingGraden, faseM };
}

// ---------------------------------------------------------------------------
// Generatie
// ---------------------------------------------------------------------------

interface GeprojecteerdeRing {
  /** offset langs n per hoekpunt */
  o: Float64Array;
  /** positie langs d per hoekpunt */
  t: Float64Array;
}

/**
 * Genereer evenwijdige rijen binnen het perceel.
 *
 * Elke oneindige lijn offset = faseM + k·rijafstandM wordt gesneden met alle ringen
 * (buitenranden én gaten, ook bij een MultiPolygon). Binnen-intervallen volgen uit de
 * even-odd-regel; openingen korter dan 1 m worden overbrugd. Doorsnijdt een lijn het
 * perceel daarna nog meerdere keren (inham, gat, tweede polygoon), dan wordt het langste
 * stuk genomen en staat `controleren` aan.
 * Daarna worden begin en eind ingekort met de kopakkers; te korte rijen vervallen.
 * Ongeldige invoer (rijafstand ≤ 0, NaN, > 20 000 rijen) geeft [].
 *
 * Resultaat gesorteerd op offset oplopend (rij met de laagste offset eerst).
 */
export function genereerRijen(
  perceel: PerceelRD,
  params: RijParameters,
  opties?: { minLengteM?: number },
): GegenereerdeRij[] {
  const s = params.rijafstandM;
  if (!eindig(s) || s <= 0 || !eindig(params.richtingGraden)) return [];

  const theta = asRichting(params.richtingGraden);
  const d = richtingVector(theta);
  const n = normaalVector(theta);
  const c = perceel.zwaartepunt;
  const fase = normaliseerFase(params.faseM, s);
  const kopBegin = nietNegatief(params.kopakkerBeginM);
  const kopEind = nietNegatief(params.kopakkerEindM);
  const minOptie = opties?.minLengteM;
  const minLengte = eindig(minOptie) ? Math.max(0, minOptie) : STANDAARD_MIN_LENGTE_M;
  const beginOptie = params.beginkantGraden;
  const beginkant = eindig(beginOptie) ? beginOptie : theta;
  // Begin aan de +d-kant (grootste t) als de beginkant niet tegen d in wijst
  const beginAanPlusKant = Math.cos((beginkant - theta) * RAD) >= 0;

  // Alle ringen één keer projecteren op (n, d), relatief t.o.v. het zwaartepunt
  const ringen: GeprojecteerdeRing[] = [];
  let oMin = Infinity;
  let oMax = -Infinity;
  for (const poly of perceel.polygonen) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      const o = new Float64Array(ring.length);
      const t = new Float64Array(ring.length);
      ring.forEach((p, i) => {
        const rel = aftrekken(p, c);
        o[i] = inproduct(rel, n);
        t[i] = inproduct(rel, d);
        if (o[i] < oMin) oMin = o[i];
        if (o[i] > oMax) oMax = o[i];
      });
      ringen.push({ o, t });
    }
  }
  if (ringen.length === 0) return [];

  const kMin = Math.ceil((oMin - fase) / s);
  const kMax = Math.floor((oMax - fase) / s);
  // Absurd kleine rijafstand (bv. halverwege typen): geen rijen i.p.v. een exception,
  // zodat een live voorbeeld in de UI niet crasht.
  if (!(kMax - kMin + 1 <= MAX_RIJEN)) return [];

  const rijen: GegenereerdeRij[] = [];
  for (let k = kMin; k <= kMax; k++) {
    const off = fase + k * s;

    // Snijpunten van de lijn met alle randen, als parameter t langs d
    const ts: number[] = [];
    for (const { o, t } of ringen) {
      for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
        const si = o[i] - off;
        const sj = o[j] - off;
        // Half-open regel: een hoekpunt precies op de lijn telt als 'niet boven',
        // zodat een rand die de lijn alleen raakt geen dubbel snijpunt geeft.
        if ((si > 0) !== (sj > 0)) {
          ts.push(t[i] + ((t[j] - t[i]) * si) / (si - sj));
        }
      }
    }
    if (ts.length < 2) continue;
    ts.sort((a, b) => a - b);

    // Even-odd: paren van snijpunten zijn de binnen-intervallen
    const intervallen: [number, number][] = [];
    for (let i = 0; i + 1 < ts.length; i += 2) {
      const vorige = intervallen[intervallen.length - 1];
      if (vorige && ts[i] - vorige[1] < SAMENVOEG_M) {
        vorige[1] = ts[i + 1];
      } else {
        intervallen.push([ts[i], ts[i + 1]]);
      }
    }
    const stukken = intervallen.filter(([a, b]) => b - a >= MIN_STUK_M);
    if (stukken.length === 0) continue;

    let [t0, t1] = stukken[0];
    for (const [a, b] of stukken) {
      if (b - a > t1 - t0) {
        t0 = a;
        t1 = b;
      }
    }

    const lengte = t1 - t0 - kopBegin - kopEind;
    if (!(lengte > 0) || lengte < minLengte) continue;

    const tBegin = beginAanPlusKant ? t1 - kopBegin : t0 + kopBegin;
    const tEind = beginAanPlusKant ? t0 + kopEind : t1 - kopEind;
    const begin: XY = [c[0] + off * n[0] + tBegin * d[0], c[1] + off * n[1] + tBegin * d[1]];
    const eind: XY = [c[0] + off * n[0] + tEind * d[0], c[1] + off * n[1] + tEind * d[1]];

    rijen.push({
      offsetM: off,
      coordsRD: [begin, eind],
      coordinates: [naarWGS(begin), naarWGS(eind)],
      lengteM: afstand(begin, eind),
      controleren: stukken.length > 1,
    });
  }

  return rijen;
}

// ---------------------------------------------------------------------------
// Opnieuw genereren: bestaande rijen koppelen aan nieuwe
// ---------------------------------------------------------------------------

/**
 * 1-op-1 koppeling op loodrechte positie. Een paar telt alleen als |Δoffset| ≤ maxAfstandM;
 * bij een conflict wint het dichtstbijzijnde paar.
 */
export function koppelRijenOpPositie(
  bestaand: { id: string; offsetM: number }[],
  nieuw: { offsetM: number }[],
  maxAfstandM: number,
): { paren: { id: string; index: number }[]; nieuweIndexen: number[]; vervallenIds: string[] } {
  const kandidaten: { b: number; n: number; delta: number }[] = [];
  if (eindig(maxAfstandM) && maxAfstandM >= 0) {
    bestaand.forEach((r, bi) => {
      if (!eindig(r.offsetM)) return;
      nieuw.forEach((x, ni) => {
        if (!eindig(x.offsetM)) return;
        const delta = Math.abs(r.offsetM - x.offsetM);
        if (delta <= maxAfstandM) kandidaten.push({ b: bi, n: ni, delta });
      });
    });
  }
  kandidaten.sort((p, q) => p.delta - q.delta || p.n - q.n || p.b - q.b);

  const bestaandGebruikt = new Set<number>();
  const nieuwGebruikt = new Set<number>();
  const paren: { id: string; index: number }[] = [];
  for (const k of kandidaten) {
    if (bestaandGebruikt.has(k.b) || nieuwGebruikt.has(k.n)) continue;
    bestaandGebruikt.add(k.b);
    nieuwGebruikt.add(k.n);
    paren.push({ id: bestaand[k.b].id, index: k.n });
  }
  paren.sort((p, q) => p.index - q.index);

  const nieuweIndexen = nieuw.map((_, i) => i).filter(i => !nieuwGebruikt.has(i));
  const vervallenIds = bestaand.filter((_, i) => !bestaandGebruikt.has(i)).map(r => r.id);
  return { paren, nieuweIndexen, vervallenIds };
}

// ---------------------------------------------------------------------------
// Nummering
// ---------------------------------------------------------------------------

/**
 * Nummers per rij (zelfde volgorde als de invoer). De startrij krijgt `startnummer`.
 * Liggen er aan de hoge-offsetkant evenveel of meer rijen dan aan de lage kant, dan lopen
 * de nummers op met de offset, anders af. Rijen aan de 'achterkant' krijgen startnummer−1, −2, …
 */
export function bepaalNummers(offsets: number[], startIndex: number, startnummer: number): number[] {
  const n = offsets.length;
  if (n === 0) return [];
  const volgorde = offsets.map((_, i) => i).sort((a, b) => offsets[a] - offsets[b] || a - b);
  const geldigeStart = Number.isInteger(startIndex) && startIndex >= 0 && startIndex < n;
  const p = geldigeStart ? volgorde.indexOf(startIndex) : 0;
  const lager = p;
  const hoger = n - 1 - p;
  const oplopend = hoger >= lager;
  const basis = eindig(startnummer) ? Math.round(startnummer) : 1;

  const nummers = new Array<number>(n);
  volgorde.forEach((invoerIndex, q) => {
    nummers[invoerIndex] = oplopend ? basis + (q - p) : basis + (p - q);
  });
  return nummers;
}

/**
 * Kompasrichting (loodrecht op de rijen) naar de kant waar rij 1 ligt.
 * Oplopend met offset → rij 1 aan de −n-kant (θ + 270), anders aan de +n-kant (θ + 90).
 */
export function startzijdeGraden(richtingGraden: number, oplopendMetOffset: boolean): number {
  return normaliseerGraden(asRichting(richtingGraden) + (oplopendMetOffset ? 270 : 90));
}

/** Index van de uiterste rij aan de kant `startzijdeGraden` (−1 bij geen rijen). */
export function vindStartIndex(offsets: number[], richtingGraden: number, startzijdeGraden: number): number {
  if (offsets.length === 0) return -1;
  // +n wijst naar θ + 90; ligt de startzijde aan die kant, dan is de hoogste offset de startrij
  const naarPlusN = Math.cos((startzijdeGraden - (asRichting(richtingGraden) + 90)) * RAD) >= 0;
  let beste = 0;
  for (let i = 1; i < offsets.length; i++) {
    if (naarPlusN ? offsets[i] > offsets[beste] : offsets[i] < offsets[beste]) beste = i;
  }
  return beste;
}

// ---------------------------------------------------------------------------
// Oppervlak, posities en bomen
// ---------------------------------------------------------------------------

/** Σ(lengte × rijafstand) / 10 000. Rijen zonder eigen of standaard rijafstand tellen niet mee. */
export function rijOppervlakHa(
  rijen: { lengteM: number; rijafstandM: number | null }[],
  standaardRijafstandM?: number | null,
): number {
  let m2 = 0;
  for (const r of rijen) {
    const afst = eindig(r.rijafstandM) ? r.rijafstandM : eindig(standaardRijafstandM) ? standaardRijafstandM : null;
    if (afst === null || !eindig(r.lengteM)) continue;
    m2 += r.lengteM * afst;
  }
  return m2 / 10000;
}

/** Positie (meters vanaf het begin) van een punt op een rij, plus de loodrechte afstand tot de rij. */
export function positieOpRij(coordinates: LngLat[], punt: LngLat): { positieM: number; afstandTotRijM: number } {
  if (coordinates.length === 0) throw new Error('Lege rij');
  const lijn = coordinates.map(naarRD);
  const p = naarRD(punt);
  if (lijn.length === 1) return { positieM: 0, afstandTotRijM: afstand(p, lijn[0]) };
  const r = projecteerOpLijn(p, lijn);
  return { positieM: r.afstandLangsM, afstandTotRijM: r.loodrechtM };
}

/** Punt op `positieM` meter vanaf het begin van de rij (begrensd tot de rij). */
export function puntOpRij(coordinates: LngLat[], positieM: number): LngLat {
  if (coordinates.length === 0) throw new Error('Lege rij');
  return naarWGS(puntOpLijn(coordinates.map(naarRD), eindig(positieM) ? positieM : 0));
}

/** Boomnummer vanaf het begin: floor(positie / boomafstand) + 1. null bij ontbrekende waarden. */
export function boomnummer(positieM: number | null, boomafstandM: number | null): number | null {
  if (!eindig(positieM) || !eindig(boomafstandM) || boomafstandM <= 0) return null;
  // kleine marge zodat 1,32 / 0,66 niet op 1,999… uitkomt
  return Math.max(1, Math.floor(positieM / boomafstandM + 1e-9) + 1);
}

// ---------------------------------------------------------------------------
// Rij toevoegen tussen / naast bestaande rijen
// ---------------------------------------------------------------------------

function eindpuntenRD(coords: LngLat[]): [XY, XY] {
  if (coords.length < 2) throw new Error('Een rij heeft minstens twee punten nodig');
  return [naarRD(coords[0]), naarRD(coords[coords.length - 1])];
}

/** Eindpunten van b, zo gedraaid dat ze dezelfde kant op lopen als a. */
function gelijkGericht(a: [XY, XY], b: [XY, XY]): [XY, XY] {
  const da = aftrekken(a[1], a[0]);
  const db = aftrekken(b[1], b[0]);
  return inproduct(da, db) < 0 ? [b[1], b[0]] : b;
}

/** Nieuwe rij precies tussen twee rijen (gemiddelde van overeenkomstige eindpunten). */
export function rijTussen(a: LngLat[], b: LngLat[]): LngLat[] {
  const ra = eindpuntenRD(a);
  const rb = gelijkGericht(ra, eindpuntenRD(b));
  const begin: XY = [(ra[0][0] + rb[0][0]) / 2, (ra[0][1] + rb[0][1]) / 2];
  const eind: XY = [(ra[1][0] + rb[1][0]) / 2, (ra[1][1] + rb[1][1]) / 2];
  return [naarWGS(begin), naarWGS(eind)];
}

/** Nieuwe rij aan de buitenkant: rand + (rand − buur), per eindpunt. */
export function rijAanRand(rand: LngLat[], buur: LngLat[]): LngLat[] {
  const rr = eindpuntenRD(rand);
  const rb = gelijkGericht(rr, eindpuntenRD(buur));
  const begin: XY = [2 * rr[0][0] - rb[0][0], 2 * rr[0][1] - rb[0][1]];
  const eind: XY = [2 * rr[1][0] - rb[1][0], 2 * rr[1][1] - rb[1][1]];
  return [naarWGS(begin), naarWGS(eind)];
}
