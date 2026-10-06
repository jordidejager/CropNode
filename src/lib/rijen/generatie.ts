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
import type { GegenereerdeRij, LngLat, PerceelRD, RijParameters, RijStukkenKeuze, XY } from './types';

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
/**
 * Rijen waarvan de offsets minder dan dit verschillen, liggen op dezelfde rijlijn (stukken van
 * één onderbroken rij). Ruim boven de afrondingsruis van opgeslagen rijen (v_rijen geeft
 * GeoJSON met 7 decimalen, ~1 cm per coördinaat) en ver onder elke echte rijafstand.
 */
const ZELFDE_LIJN_M = 0.1;
/** Stukken op dezelfde rijlijn koppelen alleen als ze elkaar voor minstens dit deel van het kortste stuk overlappen */
const MIN_OVERLAP_DEEL = 0.5;

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
 * Positie langs de rij-as d = (sin θ, cos θ) van het midden van een rij t.o.v. het zwaartepunt.
 * Voor een gegenereerde rij gelijk aan `langsM`; samen met `rijOffset` en de lengte is een stuk
 * van een onderbroken rijlijn daarmee eenduidig te herkennen.
 */
export function rijLangs(perceel: PerceelRD, richtingGraden: number, coordsRD: XY[]): number {
  if (coordsRD.length === 0) throw new Error('Lege rij');
  const midden = puntOpLijn(coordsRD, lijnLengte(coordsRD) / 2);
  return inproduct(aftrekken(midden, perceel.zwaartepunt), richtingVector(asRichting(richtingGraden)));
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

export interface GeneratieOpties {
  /** Minimale rijlengte na het inkorten met de kopakkers (standaard 5 m) */
  minLengteM?: number;
  /** Onderbroken rijlijnen: alleen het langste stuk (standaard) of alle stukken als aparte rijen */
  stukken?: RijStukkenKeuze;
}

/**
 * Genereer evenwijdige rijen binnen het perceel.
 *
 * Elke oneindige lijn offset = faseM + k·rijafstandM wordt gesneden met alle ringen
 * (buitenranden én gaten, ook bij een MultiPolygon). Binnen-intervallen volgen uit de
 * even-odd-regel; openingen korter dan 1 m worden overbrugd. Elk stuk wordt aan beide
 * uiteinden ingekort met de kopakkers; stukken korter dan `minLengteM` vervallen.
 * Doorsnijdt een lijn het perceel meerdere keren (inham, pad, gat, tweede polygoon), dan:
 *  - stukken 'langste' (standaard): alleen het langste stuk wordt een rij, met `controleren`;
 *  - stukken 'alle': elk stuk wordt een eigen rij (een inham of pad is ook een kopakker);
 *    blijft er na het filteren meer dan één stuk over, dan staat `controleren` op al die stukken.
 * Elke rij krijgt `langsM` (midden langs d), `stukIndex` en `aantalStukken` (zie GegenereerdeRij).
 * Ongeldige invoer (rijafstand ≤ 0, NaN, > 20 000 rijlijnen) geeft [].
 *
 * Resultaat gesorteerd op offset oplopend (rij met de laagste offset eerst), daarna op langsM.
 */
export function genereerRijen(
  perceel: PerceelRD,
  params: RijParameters,
  opties?: GeneratieOpties,
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
  const alleStukken = opties?.stukken === 'alle';
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

    // Stukken die na het inkorten met de kopakkers (aan beide uiteinden) lang genoeg zijn,
    // in volgorde langs d
    const bruikbaar = stukken.filter(([a, b]) => {
      const lengte = b - a - kopBegin - kopEind;
      return lengte > 0 && lengte >= minLengte;
    });
    if (bruikbaar.length === 0) continue;

    const maakRij = ([t0, t1]: [number, number], controleren: boolean, stukIndex: number): GegenereerdeRij => {
      const tBegin = beginAanPlusKant ? t1 - kopBegin : t0 + kopBegin;
      const tEind = beginAanPlusKant ? t0 + kopEind : t1 - kopEind;
      const begin: XY = [c[0] + off * n[0] + tBegin * d[0], c[1] + off * n[1] + tBegin * d[1]];
      const eind: XY = [c[0] + off * n[0] + tEind * d[0], c[1] + off * n[1] + tEind * d[1]];
      return {
        offsetM: off,
        coordsRD: [begin, eind],
        coordinates: [naarWGS(begin), naarWGS(eind)],
        lengteM: afstand(begin, eind),
        controleren,
        langsM: (tBegin + tEind) / 2,
        stukIndex,
        aantalStukken: bruikbaar.length,
      };
    };

    if (alleStukken) {
      const meerdere = bruikbaar.length > 1;
      bruikbaar.forEach((stuk, i) => rijen.push(maakRij(stuk, meerdere, i)));
    } else {
      // Langste stuk (bij gelijke lengte het eerste langs d); de kopakkers korten elk stuk
      // even veel in, dus het langste stuk is ook het langste bruikbare stuk.
      let langste = bruikbaar[0];
      for (const stuk of bruikbaar) {
        if (stuk[1] - stuk[0] > langste[1] - langste[0]) langste = stuk;
      }
      rijen.push(maakRij(langste, stukken.length > 1, 0));
    }
  }

  return rijen;
}

// ---------------------------------------------------------------------------
// Rijlijnen: stukken met (bijna) dezelfde offset
// ---------------------------------------------------------------------------

interface Lijnen {
  /** Per invoerindex: het nummer van de rijlijn (0 = laagste offset) */
  lijn: number[];
  /** Per rijlijn: de invoerindexen, op offset en daarna op index */
  leden: number[][];
  /** Per rijlijn: de gemiddelde offset */
  offset: number[];
}

/**
 * Deel offsets in rijlijnen in: op volgorde van offset begint een nieuwe lijn waar het verschil
 * met de vorige offset ≥ ZELFDE_LIJN_M is. Niet-eindige offsets komen achteraan, elk apart.
 */
function groepeerLijnen(offsets: number[]): Lijnen {
  const sleutel = (i: number) => (eindig(offsets[i]) ? offsets[i] : Infinity);
  const volgorde = offsets.map((_, i) => i).sort((a, b) => sleutel(a) - sleutel(b) || a - b);
  const lijn = new Array<number>(offsets.length);
  const leden: number[][] = [];
  let vorige = NaN;
  for (const i of volgorde) {
    const o = sleutel(i);
    if (!(o - vorige < ZELFDE_LIJN_M)) leden.push([]);
    leden[leden.length - 1].push(i);
    lijn[i] = leden.length - 1;
    vorige = o;
  }
  const offset = leden.map(g => g.reduce((som, i) => som + sleutel(i), 0) / g.length);
  return { lijn, leden, offset };
}

// ---------------------------------------------------------------------------
// Opnieuw genereren: bestaande rijen koppelen aan nieuwe
// ---------------------------------------------------------------------------

/** Rij zoals koppelRijenOpPositie hem bekijkt. langsM + lengteM zijn optioneel (stukken). */
export interface KoppelbareRij {
  offsetM: number;
  /** Midden langs d (zie GegenereerdeRij.langsM / rijLangs) */
  langsM?: number | null;
  lengteM?: number | null;
}

/** [begin, eind, lengte] langs d, of null als langsM/lengteM ontbreken of ongeldig zijn */
function langsInterval(r: KoppelbareRij): [number, number, number] | null {
  const l = r.langsM;
  const len = r.lengteM;
  if (!eindig(l) || !eindig(len) || len < 0) return null;
  return [l - len / 2, l + len / 2, len];
}

/**
 * 1-op-1 koppeling op loodrechte positie. Een paar telt alleen als |Δoffset| ≤ maxAfstandM;
 * bij een conflict wint het dichtstbijzijnde paar.
 *
 * Stukken van onderbroken rijen: hebben bestaand én nieuw allebei `langsM` en `lengteM`, dan telt
 * een paar bovendien alleen als de intervallen [langsM ± lengteM/2] elkaar voor minstens 50% van
 * het kortste stuk overlappen (dus geen kruiskoppeling tussen het linker- en rechterstuk van een
 * rijlijn). Kosten zijn dan Δoffset tussen de rijlijnen (stukken binnen 10 cm van elkaar = één lijn,
 * zodat afrondingsruis niet beslist) en daarna de kleinste |Δlangs|. Zonder die velden: exact
 * het gedrag van vóór de stukken.
 */
export function koppelRijenOpPositie(
  bestaand: (KoppelbareRij & { id: string })[],
  nieuw: KoppelbareRij[],
  maxAfstandM: number,
): { paren: { id: string; index: number }[]; nieuweIndexen: number[]; vervallenIds: string[] } {
  const langsB = bestaand.map(langsInterval);
  const langsN = nieuw.map(langsInterval);
  const metLangs = langsB.some(Boolean) && langsN.some(Boolean);
  const lijnenB = metLangs ? groepeerLijnen(bestaand.map(r => r.offsetM)) : null;
  const lijnenN = metLangs ? groepeerLijnen(nieuw.map(r => r.offsetM)) : null;

  // kost = Δoffset (bij stukken: tussen de rijlijnen), dLangs = |Δlangs| (0 zonder stukken)
  const kandidaten: { b: number; n: number; delta: number; kost: number; dLangs: number }[] = [];
  if (eindig(maxAfstandM) && maxAfstandM >= 0) {
    bestaand.forEach((r, bi) => {
      if (!eindig(r.offsetM)) return;
      nieuw.forEach((x, ni) => {
        if (!eindig(x.offsetM)) return;
        const delta = Math.abs(r.offsetM - x.offsetM);
        if (delta > maxAfstandM) return;
        const ib = langsB[bi];
        const iN = langsN[ni];
        if (ib && iN && lijnenB && lijnenN) {
          const overlap = Math.min(ib[1], iN[1]) - Math.max(ib[0], iN[0]);
          if (overlap < MIN_OVERLAP_DEEL * Math.min(ib[2], iN[2]) - 1e-9) return;
          const kost = Math.abs(lijnenB.offset[lijnenB.lijn[bi]] - lijnenN.offset[lijnenN.lijn[ni]]);
          const dLangs = Math.abs((ib[0] + ib[1]) / 2 - (iN[0] + iN[1]) / 2);
          kandidaten.push({ b: bi, n: ni, delta, kost, dLangs });
        } else {
          kandidaten.push({ b: bi, n: ni, delta, kost: delta, dLangs: 0 });
        }
      });
    });
  }
  // Zonder stukken is kost = delta en dLangs = 0: dezelfde volgorde als delta, n, b
  kandidaten.sort((p, q) => p.kost - q.kost || p.dLangs - q.dLangs || p.delta - q.delta || p.n - q.n || p.b - q.b);

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
 *
 * Met `langs` (positie langs d per rij, zie rijLangs/langsM) worden rijen op (bijna) dezelfde
 * offset (< 10 cm verschil: stukken van één onderbroken rijlijn) op langs geordend in plaats van op
 * invoerindex: oplopend, of aflopend als de startrij in de bovenste helft (op langs) van zijn lijn
 * ligt. De stukken van één lijn krijgen opeenvolgende nummers en elke lijn telt in dezelfde
 * richting. Is de startrij een buitenste stuk van zijn lijn (bv. via vindStartIndex), dan krijgt
 * geen ander stuk van die lijn een nummer onder `startnummer`; bij een middelste stuk (≥ 3 stukken)
 * is dat onvermijdelijk. Zonder `langs` (of met een array van een andere lengte) is het gedrag
 * ongewijzigd.
 */
export function bepaalNummers(
  offsets: number[],
  startIndex: number,
  startnummer: number,
  langs?: number[],
): number[] {
  const n = offsets.length;
  if (n === 0) return [];
  const geldigeStart = Number.isInteger(startIndex) && startIndex >= 0 && startIndex < n;
  const basis = eindig(startnummer) ? Math.round(startnummer) : 1;
  const nummers = new Array<number>(n);

  if (!Array.isArray(langs) || langs.length !== n) {
    const volgorde = offsets.map((_, i) => i).sort((a, b) => offsets[a] - offsets[b] || a - b);
    const p = geldigeStart ? volgorde.indexOf(startIndex) : 0;
    const lager = p;
    const hoger = n - 1 - p;
    const oplopend = hoger >= lager;
    volgorde.forEach((invoerIndex, q) => {
      nummers[invoerIndex] = oplopend ? basis + (q - p) : basis + (p - q);
    });
    return nummers;
  }

  const { lijn, leden } = groepeerLijnen(offsets);
  const l = (i: number) => (eindig(langs[i]) ? langs[i] : 0);
  // Binnen een rijlijn op langs oplopend (gelijke langs: op offset, dan index)
  const lijnen = leden.map(g => [...g].sort((a, b) => l(a) - l(b) || offsets[a] - offsets[b] || a - b));
  const start = geldigeStart ? startIndex : lijnen[0][0];
  const startLijn = lijn[start];
  const eigen = lijnen[startLijn];
  // Ligt de startrij in de bovenste helft (langs) van zijn lijn, dan tellen alle lijnen aflopend
  const langsOplopend = eigen.indexOf(start) <= (eigen.length - 1) / 2;

  let lager = 0;
  let hoger = 0;
  lijnen.forEach((g, i) => {
    if (i < startLijn) lager += g.length;
    else if (i > startLijn) hoger += g.length;
  });
  const oplopend = hoger >= lager;

  const reeks: number[] = [];
  for (const g of oplopend ? lijnen : [...lijnen].reverse()) {
    reeks.push(...(langsOplopend ? g : [...g].reverse()));
  }
  const p = reeks.indexOf(start);
  reeks.forEach((invoerIndex, q) => {
    nummers[invoerIndex] = basis + (q - p);
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

/**
 * Index van de uiterste rij aan de kant `startzijdeGraden` (−1 bij geen rijen).
 * Met `langs` (zie bepaalNummers): van de stukken op de uiterste rijlijn het stuk met de kleinste
 * langs, zodat de keuze niet van afrondingsruis of invoervolgorde afhangt.
 */
export function vindStartIndex(
  offsets: number[],
  richtingGraden: number,
  startzijdeGraden: number,
  langs?: number[],
): number {
  if (offsets.length === 0) return -1;
  // +n wijst naar θ + 90; ligt de startzijde aan die kant, dan is de hoogste offset de startrij
  const naarPlusN = Math.cos((startzijdeGraden - (asRichting(richtingGraden) + 90)) * RAD) >= 0;
  let beste = 0;
  for (let i = 1; i < offsets.length; i++) {
    if (naarPlusN ? offsets[i] > offsets[beste] : offsets[i] < offsets[beste]) beste = i;
  }
  if (!Array.isArray(langs) || langs.length !== offsets.length || !eindig(offsets[beste])) return beste;

  const { lijn, leden } = groepeerLijnen(offsets);
  const l = (i: number) => (eindig(langs[i]) ? langs[i] : 0);
  return leden[lijn[beste]].reduce((a, b) => (l(b) < l(a) || (l(b) === l(a) && b < a) ? b : a));
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
