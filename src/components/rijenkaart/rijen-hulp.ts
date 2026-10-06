/**
 * Rijenkaart (beta) — pure hulpfuncties voor de pagina's en panelen (geen React, geen I/O).
 *
 * Opmaak (Nederlands), invoer parsen, afgeleide richting, het opslaan-plan na genereren,
 * rij toevoegen tussen/naast rijen en de nummering vanaf een aangewezen rij.
 */

import { format, isValid, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  afstand,
  asRichting,
  hoekVerschil,
  inproduct,
  kompasRichting,
  lijnLengte,
  naarRD,
  normaalVector,
  normaliseerGraden,
  richtingVector,
  windstreek,
} from '@/lib/rijen/geo';
import {
  bepaalNummers,
  koppelRijenOpPositie,
  normaliseerFase,
  rijAanRand,
  rijLangs,
  rijOffset,
  rijTussen,
  startzijdeGraden,
  vindStartIndex,
} from '@/lib/rijen/generatie';
import type {
  DetectieMethode,
  GegenereerdeRij,
  LngLat,
  PerceelRD,
  Rij,
  Rijenkaart,
  RijenkaartSubperceel,
  RijInstellingen,
  RijInstellingenUpdate,
  RijParameters,
  RijWijziging,
  XY,
} from '@/lib/rijen/types';

// ---------------------------------------------------------------------------
// Opmaak
// ---------------------------------------------------------------------------

/** Getal in Nederlandse notatie met vast aantal decimalen ("3,25"). */
export function fmt(n: number | null | undefined, decimalen = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen });
}

export function fmtHa(ha: number | null | undefined): string {
  return `${fmt(ha, 2)} ha`;
}

/** Lengte in meters: hele meters vanaf 100 m, anders één decimaal. */
export function fmtLengte(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '–';
  return `${fmt(m, Math.abs(m) >= 100 ? 0 : 1)} m`;
}

/** 'YYYY-MM-DD' of ISO-tijdstempel → "12 mrt 2026" (leeg bij ongeldig). */
export function fmtDatum(s: string | null | undefined): string {
  if (!s) return '';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'd MMM yyyy', { locale: nl }) : s.slice(0, 10);
}

/** Vandaag in Nederland als 'YYYY-MM-DD' (voor datumvelden). */
export function vandaagISO(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

/** "12,5° (noordnoord–zuid)" → richting van de rij-as met beide windstreken. */
export function richtingTekst(graden: number | null | undefined): string {
  if (graden === null || graden === undefined || !Number.isFinite(graden)) return '–';
  const g = asRichting(graden);
  const a = windstreek(g);
  const b = windstreek(g + 180);
  return `${fmt(g, 1)}° (${a}–${b})`;
}

/** "noordkant", "zuidwestkant" */
export function kantNaam(graden: number): string {
  return `${windstreek(graden)}kant`;
}

/**
 * Invoerveld → getal. Komma en punt mogen allebei. Leeg → null; ongeldig → NaN.
 * Stuur het resultaat altijd als echte number naar de rijen-actions (strings worden geweigerd).
 */
export function parseGetal(tekst: string | null | undefined): number | null {
  const t = (tekst ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^[-+]?\d*\.?\d+$/.test(t) && !/^[-+]?\d+\.$/.test(t)) return NaN;
  return Number(t);
}

export function rond(n: number, decimalen: number): number {
  const f = 10 ** decimalen;
  return Math.round(n * f) / f;
}

const PIJLEN = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

/** Pijl op het scherm (noord boven) voor een kompasrichting */
export function pijl(graden: number): string {
  const i = Math.round((((graden % 360) + 360) % 360) / 45) % 8;
  return PIJLEN[i];
}

/**
 * De twee verschuifknoppen van het concept (loodrecht op de rijen), links → rechts: de kant die
 * meer naar het westen wijst eerst. `deltaM` is het teken van de faseverschuiving (+n = θ + 90).
 */
export function verschuifKnoppen(richtingGraden: number): { graden: number; teken: 1 | -1 }[] {
  const plusN = normaliseerGraden(richtingGraden + 90);
  const minN = normaliseerGraden(richtingGraden + 270);
  const westwaarts = (g: number) => Math.sin((g * Math.PI) / 180);
  const knoppen: { graden: number; teken: 1 | -1 }[] = [
    { graden: minN, teken: -1 },
    { graden: plusN, teken: 1 },
  ];
  return westwaarts(minN) <= westwaarts(plusN) ? knoppen : [knoppen[1], knoppen[0]];
}

// ---------------------------------------------------------------------------
// Perceel- en rij-afgeleiden
// ---------------------------------------------------------------------------

/** Oppervlakte-gewogen rij- of boomafstand uit de subpercelen (perceelprofiel). */
export function gewogenAfstand(subpercelen: readonly RijenkaartSubperceel[], soort: 'rij' | 'boom'): number | null {
  let som = 0;
  let gewicht = 0;
  let los: number | null = null;
  for (const s of subpercelen) {
    const v = soort === 'rij' ? s.rijafstandM : s.boomafstandM;
    if (v === null || !Number.isFinite(v) || v <= 0) continue;
    los = los ?? v;
    const w = s.oppervlakHa > 0 ? s.oppervlakHa : 0;
    som += v * w;
    gewicht += w;
  }
  if (gewicht > 0) return rond(som / gewicht, 3);
  return los;
}

/** Map subperceel-id → ras (alleen subpercelen met een ras). */
export function rassenVanSubpercelen(subpercelen: readonly RijenkaartSubperceel[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of subpercelen) {
    const ras = s.ras?.trim();
    if (ras) m.set(s.id, ras);
  }
  return m;
}

/** Unieke rasnamen als suggesties (subpercelen eerst, dan blokken/rijen). */
export function rasSuggesties(kaart: Rijenkaart): string[] {
  const uit: string[] = [];
  const gezien = new Set<string>();
  const voeg = (ras: string | null | undefined) => {
    const r = ras?.trim();
    if (!r) return;
    const k = r.toLowerCase();
    if (gezien.has(k)) return;
    gezien.add(k);
    uit.push(r);
  };
  kaart.perceel.subpercelen.forEach(s => voeg(s.ras));
  kaart.blokken.forEach(b => voeg(b.ras));
  kaart.rijen.forEach(r => voeg(r.ras));
  return uit;
}

/**
 * Rijen waar een bespuiting of notitie expliciet aan gekoppeld is. Zulke rijen worden bij
 * verwijderen niet weggegooid maar als 'gerooid' bewaard (rpc rijen_toepassen).
 */
export function gekoppeldeRijen(kaart: Rijenkaart): Set<string> {
  const uit = new Set<string>();
  for (const b of kaart.bespuitingen) for (const id of b.rijIds ?? []) uit.add(id);
  for (const n of kaart.notities) uit.add(n.rijId);
  for (const [id, s] of Object.entries(kaart.status)) {
    if (s.aantalNotities > 0 || s.laatsteBespuitingViaRijen === true) uit.add(id);
  }
  return uit;
}

function eindpuntenRD(coords: LngLat[]): XY[] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords.map(naarRD);
}

/** Rijrichting θ ∈ [0,180) afgeleid uit de rijen zelf (lengte-gewogen gemiddelde van de as). */
export function afgeleideRichting(rijen: readonly Rij[]): number | null {
  let sx = 0;
  let sy = 0;
  for (const r of rijen) {
    if (r.status !== 'actief') continue;
    const rd = eindpuntenRD(r.coordinates);
    if (!rd) continue;
    const a = rd[0];
    const b = rd[rd.length - 1];
    const lengte = lijnLengte([a, b]);
    if (lengte < 1) continue;
    const t = (2 * asRichting(kompasRichting(a, b)) * Math.PI) / 180;
    sx += Math.cos(t) * lengte;
    sy += Math.sin(t) * lengte;
  }
  if (sx === 0 && sy === 0) return null;
  const g = (Math.atan2(sy, sx) * 180) / Math.PI / 2;
  return asRichting(g);
}

function mediaan(waarden: number[]): number | null {
  if (waarden.length === 0) return null;
  const s = [...waarden].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Positie van rijen loodrecht op (offset) en langs (langs) de rij-as. */
export interface RijPositie {
  id: string;
  offsetM: number;
  langsM: number;
  lengteM: number;
}

export function rijPosities(perceel: PerceelRD, richtingGraden: number, rijen: readonly Rij[]): RijPositie[] {
  const uit: RijPositie[] = [];
  for (const r of rijen) {
    const rd = eindpuntenRD(r.coordinates);
    if (!rd) continue;
    uit.push({
      id: r.id,
      offsetM: rijOffset(perceel, richtingGraden, rd),
      langsM: rijLangs(perceel, richtingGraden, rd),
      lengteM: Number.isFinite(r.lengteM) && r.lengteM > 0 ? r.lengteM : lijnLengte(rd),
    });
  }
  return uit;
}

/**
 * Als rijPosities, maar offsetM is de loodrechte positie van de rijLIJN ter hoogte van het draaipunt
 * (langs = 0 in het assenstelsel van `richtingGraden`), verlengd langs `lijnRichtingGraden` (de
 * opgeslagen rijrichting) of, zonder die, langs de eigen richting van de rij. Na een draaiing om het
 * zwaartepunt ligt een gegenereerde rij daar precies op fase + k·s en houdt elke rij dus zijn eigen k;
 * met het midden van de rij zou de offset met langs·sin δ verschuiven, waardoor rijen ver van het
 * zwaartepunt al bij een halve graad aan hun buurrij koppelen. Bij een gelijke richting is dit exact
 * de offset van het midden (rijPosities).
 */
export function rijPositiesBijDraaipunt(
  perceel: PerceelRD,
  richtingGraden: number,
  rijen: readonly Rij[],
  lijnRichtingGraden: number | null,
): RijPositie[] {
  const theta = asRichting(richtingGraden);
  const d = richtingVector(theta);
  const n = normaalVector(theta);
  const perId = new Map(rijen.map(r => [r.id, r] as const));
  const opgeslagen = lijnRichtingGraden !== null && Number.isFinite(lijnRichtingGraden) ? richtingVector(asRichting(lijnRichtingGraden)) : null;
  return rijPosities(perceel, theta, rijen).map(p => {
    let u = opgeslagen;
    if (!u) {
      const rd = eindpuntenRD(perId.get(p.id)?.coordinates ?? []);
      if (rd && afstand(rd[0], rd[rd.length - 1]) > 0) u = richtingVector(kompasRichting(rd[0], rd[rd.length - 1]));
    }
    if (!u) return p;
    const ud = inproduct(u, d);
    // (Bijna) loodrecht op de nieuwe richting: verlengen heeft geen betekenis, dan het midden
    if (Math.abs(ud) < 0.5) return p;
    return { ...p, offsetM: p.offsetM - p.langsM * (inproduct(u, n) / ud) };
  });
}

/**
 * Liggen er actieve rijen als losse stukken in elkaars verlengde op dezelfde rijlijn (loodrecht
 * < 0,5 m uit elkaar en langs de rij grotendeels naast elkaar), bv. opgeslagen met 'alle stukken'
 * of een getekend stuk aan de andere kant van een pad? Dan moet een correctie van de hele set ook
 * met 'alle stukken' genereren, anders vervallen die stukken. Twee rijen die elkaar langs de rij
 * grotendeels overlappen zijn een dubbele rij, geen stukken.
 */
export function heeftStukkenOpEenLijn(perceel: PerceelRD, richtingGraden: number, rijen: readonly Rij[]): boolean {
  const pos = rijPosities(
    perceel,
    richtingGraden,
    rijen.filter(r => r.status === 'actief'),
  ).sort((a, b) => a.offsetM - b.offsetM);
  let begin = 0;
  for (let i = 1; i <= pos.length; i++) {
    if (i < pos.length && pos[i].offsetM - pos[i - 1].offsetM < ZELFDE_LIJN_M) continue;
    // pos[begin..i) ligt op één rijlijn: zijn er stukken die elkaar hooguit half overlappen?
    const lijn = pos.slice(begin, i);
    for (let a = 0; a < lijn.length; a++) {
      for (let b = a + 1; b < lijn.length; b++) {
        const pa = lijn[a];
        const pb = lijn[b];
        const overlap =
          Math.min(pa.langsM + pa.lengteM / 2, pb.langsM + pb.lengteM / 2) -
          Math.max(pa.langsM - pa.lengteM / 2, pb.langsM - pb.lengteM / 2);
        if (overlap < 0.5 * Math.min(pa.lengteM, pb.lengteM)) return true;
      }
    }
    begin = i;
  }
  return false;
}

/** Concept-parameters zonder kopakkers (die staan los in de UI). */
export interface ConceptBasis {
  richtingGraden: number;
  rijafstandM: number;
  faseM: number;
  /** Kompasrichting van het midden van een rij naar het begin */
  beginkantGraden: number;
}

/**
 * Parameters om een bestaande rijenset te corrigeren: de opgeslagen instellingen, aangevuld
 * met wat uit de rijen zelf af te leiden is (handmatig getekende sets hebben geen fase).
 */
export function basisUitInstellingen(
  perceel: PerceelRD,
  rijen: readonly Rij[],
  instellingen: RijInstellingen | null,
  standaardRijafstandM: number | null,
): ConceptBasis | null {
  const actief = rijen.filter(r => r.status === 'actief');
  const theta = instellingen?.rijrichtingGraden ?? afgeleideRichting(actief);
  if (theta === null || !Number.isFinite(theta)) return null;
  const pos = rijPosities(perceel, theta, actief).sort((a, b) => a.offsetM - b.offsetM);

  let s = instellingen?.rijafstandM ?? null;
  if (s === null || !(s > 0)) {
    const verschillen: number[] = [];
    for (let i = 1; i < pos.length; i++) {
      const d = pos[i].offsetM - pos[i - 1].offsetM;
      if (d > 0.5) verschillen.push(d);
    }
    s = mediaan(verschillen) ?? standaardRijafstandM;
  }
  if (s === null || !(s > 0)) return null;

  let fase = instellingen?.faseM ?? null;
  if (fase === null || !Number.isFinite(fase)) {
    // Circulair gemiddelde van de offsets modulo de rijafstand
    let cx = 0;
    let cy = 0;
    for (const p of pos) {
      const a = (2 * Math.PI * p.offsetM) / s;
      cx += Math.cos(a);
      cy += Math.sin(a);
    }
    fase = pos.length > 0 ? ((Math.atan2(cy, cx) / (2 * Math.PI)) * s) : 0;
  }
  return {
    richtingGraden: asRichting(theta),
    rijafstandM: s,
    faseM: normaliseerFase(fase, s),
    beginkantGraden: normaliseerGraden(instellingen?.beginkantGraden ?? theta),
  };
}

/** Draai de rijrichting; over de 0/180-grens heen klapt de normaal om, dus de fase mee spiegelen. */
export function draaiBasis(b: ConceptBasis, deltaGraden: number): ConceptBasis {
  let theta = b.richtingGraden + deltaGraden;
  let fase = b.faseM;
  if (theta < 0 || theta >= 180) {
    theta = asRichting(theta);
    fase = -fase;
  }
  return { ...b, richtingGraden: theta, faseM: normaliseerFase(fase, b.rijafstandM) };
}

export function verschuifBasis(b: ConceptBasis, deltaM: number): ConceptBasis {
  return { ...b, faseM: normaliseerFase(b.faseM + deltaM, b.rijafstandM) };
}

/** Beginkant bij een (nieuwe) richting: dezelfde kant houden als die al gekozen was. */
export function beginkantBijRichting(beginkant: number, theta: number): number {
  return Math.cos(((beginkant - theta) * Math.PI) / 180) >= 0 ? normaliseerGraden(theta) : normaliseerGraden(theta + 180);
}

// ---------------------------------------------------------------------------
// Opslaan na genereren
// ---------------------------------------------------------------------------

export interface ConceptBron {
  methode: DetectieMethode;
  confidence: number | null;
  bronBeeld: string | null;
}

export interface OpslaanPlan {
  rijen: RijWijziging[];
  verwijderen: string[];
  instellingen: RijInstellingenUpdate;
  /** Eerst zetBeginkantAction (draait bestaande rijen om en spiegelt notitieposities) */
  beginkantWijzigen: boolean;
  beginkantGraden: number;
  aantalGekoppeld: number;
  aantalNieuw: number;
  aantalVervallen: number;
  aantalVervallenMetKoppeling: number;
  /** Gekoppelde rijen waarvan handmatig getekende/versleepte geometrie wordt overschreven */
  aantalGetekendOverschreven: number;
  aantalControleren: number;
  /** Bestaande rijen die een ander nummer krijgen (vraagt om bevestiging) */
  aantalHernummerd: number;
  /** Eerste voorbeeld daarvan: oud → nieuw nummer */
  voorbeeldHernummerd: { van: number; naar: number } | null;
  /** Rijen die (nieuw) een nummer onder het startnummer krijgen, bv. rijen vóór de aangewezen rij 1 */
  aantalOnderStart: number;
  /** Optie alleenBestaande: nieuwe rijen uit het voorstel die niet worden toegevoegd */
  aantalNieuwOvergeslagen: number;
  /** Optie behoudGetekend: handmatig getekende/versleepte rijen die hun ligging houden */
  aantalGetekendBehouden: number;
}

/**
 * Concept → wijzigingen voor rijen_toepassen (ID-mapping op positie, nummering, instellingen).
 *  - Bestaande actieve rijen worden 1-op-1 gekoppeld op loodrechte positie (max. halve rijafstand),
 *    met de NIEUWE richting; gekoppelde rijen houden hun id (en dus hun historie).
 *  - Startrij van de nummering: de opgeslagen startrij als die gekoppeld is, anders de uiterste rij
 *    aan de opgeslagen startzijde, anders de rij met de laagste offset.
 *  - alleenBestaande: alleen de ligging van gekoppelde rijen bijwerken; geen nieuwe rijen (bv. een
 *    eerder verwijderde rij) en de nummers blijven zoals ze zijn.
 *  - behoudGetekend: handmatig getekende/versleepte rijen houden hun ligging (alleen het nummer kan wijzigen).
 */
export function maakOpslaanPlan(invoer: {
  perceel: PerceelRD;
  params: RijParameters;
  conceptRijen: readonly GegenereerdeRij[];
  bestaand: readonly Rij[];
  instellingen: RijInstellingen | null;
  gekoppeld: ReadonlySet<string>;
  bron: ConceptBron;
  /** Boomafstand uit het perceelprofiel; wordt de standaard als de instellingen er nog geen hebben */
  profielBoomafstandM?: number | null;
  nu?: Date;
  alleenBestaande?: boolean;
  behoudGetekend?: boolean;
}): OpslaanPlan {
  const { perceel, params, conceptRijen, instellingen, gekoppeld, bron } = invoer;
  const bestaand = invoer.bestaand.filter(r => r.status === 'actief');
  const theta = asRichting(params.richtingGraden);
  const s = params.rijafstandM;

  // Koppelen op de positie van de rijlijn bij het draaipunt (niet het midden): draaien houdt elke rij bij zijn eigen lijn
  const bestaandPos = rijPositiesBijDraaipunt(perceel, theta, bestaand, instellingen?.rijrichtingGraden ?? null);
  const zonderGeometrie = bestaand.filter(r => !bestaandPos.some(p => p.id === r.id)).map(r => r.id);
  const nieuwPos = conceptRijen.map(r => ({
    offsetM: r.offsetM,
    langsM: r.langsM ?? rijLangs(perceel, theta, r.coordsRD),
    lengteM: r.lengteM,
  }));
  const koppel = koppelRijenOpPositie(bestaandPos, nieuwPos, s / 2);

  const offsets = conceptRijen.map(r => r.offsetM);
  const langs = nieuwPos.map(p => p.langsM);
  const startRijId = instellingen?.nummeringStartRijId ?? null;
  const startPaar = startRijId ? koppel.paren.find(p => p.id === startRijId) : undefined;
  const startzijde = instellingen?.nummeringStartzijdeGraden ?? null;
  // Met `langs`: van de stukken op de uiterste rijlijn het stuk met de kleinste langs (contract bepaalNummers)
  const startIndex = startPaar
    ? startPaar.index
    : vindStartIndex(offsets, theta, startzijde ?? startzijdeGraden(theta, true), langs);
  const startnummer = instellingen?.startnummer ?? 1;
  const nummers = bepaalNummers(offsets, startIndex, startnummer, langs);

  // Lopen de nummers op met de offset? (bepaalt de startzijde als die nog leeg is)
  let iMin = 0;
  let iMax = 0;
  offsets.forEach((o, i) => {
    if (o < offsets[iMin]) iMin = i;
    if (o > offsets[iMax]) iMax = i;
  });
  const oplopend = offsets.length < 2 || nummers[iMax] >= nummers[iMin];

  const perId = new Map(bestaand.map(r => [r.id, r] as const));
  const rijen: RijWijziging[] = [];
  let aantalGetekendOverschreven = 0;
  let aantalGetekendBehouden = 0;
  let aantalHernummerd = 0;
  let voorbeeldHernummerd: { van: number; naar: number } | null = null;
  let aantalOnderStart = 0;
  for (const p of koppel.paren) {
    const c = conceptRijen[p.index];
    const oud = perId.get(p.id);
    const nummer = invoer.alleenBestaande && oud ? oud.nummer : nummers[p.index];
    if (oud && oud.nummer !== nummer) {
      aantalHernummerd++;
      if (!voorbeeldHernummerd) voorbeeldHernummerd = { van: oud.nummer, naar: nummer };
    }
    if (nummer < startnummer && (!oud || oud.nummer >= startnummer)) aantalOnderStart++;
    if (oud && oud.geomBron !== 'gegenereerd') {
      if (invoer.behoudGetekend) {
        aantalGetekendBehouden++;
        rijen.push({ id: p.id, nummer });
        continue;
      }
      aantalGetekendOverschreven++;
    }
    rijen.push({
      id: p.id,
      nummer,
      coordinates: c.coordinates,
      geomBron: 'gegenereerd',
      controleren: c.controleren,
    });
  }
  const nieuweIndexen = invoer.alleenBestaande && bestaand.length > 0 ? [] : koppel.nieuweIndexen;
  for (const i of nieuweIndexen) {
    const c = conceptRijen[i];
    if (nummers[i] < startnummer) aantalOnderStart++;
    rijen.push({ sleutel: `nieuw-${i}`, nummer: nummers[i], coordinates: c.coordinates, controleren: c.controleren });
  }

  const verwijderen = [...koppel.vervallenIds, ...zonderGeometrie];
  const beginkantGraden = normaliseerGraden(params.beginkantGraden ?? theta);
  const oudeBeginkant = instellingen?.beginkantGraden ?? null;
  const beginkantWijzigen =
    bestaand.length > 0 && (oudeBeginkant === null || hoekVerschil(oudeBeginkant, beginkantGraden) > 0.01);

  const instellingenUpdate: RijInstellingenUpdate = {
    rijrichtingGraden: rond(theta, 4),
    rijafstandM: rond(s, 4),
    faseM: rond(normaliseerFase(params.faseM, s), 4),
    kopakkerBeginM: rond(Math.max(0, params.kopakkerBeginM), 2),
    kopakkerEindM: rond(Math.max(0, params.kopakkerEindM), 2),
    beginkantGraden: rond(beginkantGraden, 4),
    nummeringStartzijdeGraden: rond(startzijde ?? startzijdeGraden(theta, oplopend), 4),
    startnummer,
    bronBeeld: bron.bronBeeld,
    detectieMethode: bron.methode,
    detectieConfidence: bron.confidence === null ? null : rond(bron.confidence, 4),
    laatstGegenereerdOp: (invoer.nu ?? new Date()).toISOString(),
  };
  const profielBoom = invoer.profielBoomafstandM;
  if (instellingen?.boomafstandM == null && profielBoom != null && profielBoom > 0) {
    instellingenUpdate.boomafstandM = rond(profielBoom, 3);
  }

  return {
    rijen,
    verwijderen,
    instellingen: instellingenUpdate,
    beginkantWijzigen,
    beginkantGraden,
    aantalGekoppeld: koppel.paren.length,
    aantalNieuw: nieuweIndexen.length,
    aantalVervallen: verwijderen.length,
    aantalVervallenMetKoppeling: verwijderen.filter(id => gekoppeld.has(id)).length,
    aantalGetekendOverschreven,
    aantalControleren: conceptRijen.filter(r => r.controleren).length,
    aantalHernummerd,
    voorbeeldHernummerd,
    aantalOnderStart,
    aantalNieuwOvergeslagen: koppel.nieuweIndexen.length - nieuweIndexen.length,
    aantalGetekendBehouden,
  };
}

// ---------------------------------------------------------------------------
// Rij toevoegen en nummering
// ---------------------------------------------------------------------------

/** Hoogste nummer onder de actieve rijen + 1 (gerooide rijen tellen niet mee). */
export function volgendNummer(rijen: readonly Rij[]): number {
  let max = 0;
  for (const r of rijen) if (r.status === 'actief' && r.nummer > max) max = r.nummer;
  return max + 1;
}

export type RijToevoegenVoorstel =
  | { ok: true; coordinates: LngLat[]; blokId: string | null; omschrijving: string }
  | { ok: false; reden: string };

/** Minimaal loodrecht verschil tussen twee rijen om als 'naast elkaar' te tellen */
const ZELFDE_LIJN_M = 0.5;

/**
 * Nieuwe rij uit de selectie: twee naast elkaar gelegen rijen → precies ertussen;
 * één buitenste rij → aan de buitenkant (zelfde afstand als tot de buurrij).
 */
export function rijToevoegenVoorstel(
  selectie: readonly Rij[],
  actieveRijen: readonly Rij[],
  perceel: PerceelRD,
  richtingGraden: number,
): RijToevoegenVoorstel {
  const sel = selectie.filter(r => r.status === 'actief');
  if (sel.length === 0 || sel.length > 2) {
    return { ok: false, reden: 'Selecteer twee naast elkaar gelegen rijen, of één buitenste rij.' };
  }
  const pos = rijPosities(perceel, richtingGraden, actieveRijen);
  const posVan = new Map(pos.map(p => [p.id, p] as const));
  const perId = new Map(actieveRijen.map(r => [r.id, r] as const));

  if (sel.length === 2) {
    const [a, b] = sel;
    const pa = posVan.get(a.id);
    const pb = posVan.get(b.id);
    if (!pa || !pb) return { ok: false, reden: 'Een van de rijen heeft geen geldige ligging.' };
    const lo = Math.min(pa.offsetM, pb.offsetM);
    const hi = Math.max(pa.offsetM, pb.offsetM);
    if (hi - lo < ZELFDE_LIJN_M) {
      return { ok: false, reden: 'Deze rijen liggen in elkaars verlengde. Kies twee rijen naast elkaar.' };
    }
    const ertussen = pos.filter(
      p => p.id !== a.id && p.id !== b.id && p.offsetM > lo + ZELFDE_LIJN_M && p.offsetM < hi - ZELFDE_LIJN_M,
    );
    if (ertussen.length > 0) {
      return { ok: false, reden: 'Er liggen al rijen tussen deze twee. Kies twee rijen direct naast elkaar.' };
    }
    return {
      ok: true,
      coordinates: rijTussen(a.coordinates, b.coordinates),
      blokId: a.blokId && a.blokId === b.blokId ? a.blokId : null,
      omschrijving: `tussen rij ${a.nummer} en ${b.nummer}`,
    };
  }

  const rand = sel[0];
  const pr = posVan.get(rand.id);
  if (!pr) return { ok: false, reden: 'Deze rij heeft geen geldige ligging.' };
  const lager = pos.filter(p => p.offsetM < pr.offsetM - ZELFDE_LIJN_M);
  const hoger = pos.filter(p => p.offsetM > pr.offsetM + ZELFDE_LIJN_M);
  if (lager.length > 0 && hoger.length > 0) {
    return { ok: false, reden: 'Dit is geen buitenste rij. Kies een rij aan de rand, of twee rijen naast elkaar.' };
  }
  const binnen = lager.length > 0 ? lager : hoger;
  if (binnen.length === 0) return { ok: false, reden: 'Er is geen buurrij om de afstand van over te nemen.' };
  let buur = binnen[0];
  for (const p of binnen) {
    if (Math.abs(p.offsetM - pr.offsetM) < Math.abs(buur.offsetM - pr.offsetM)) buur = p;
  }
  const buurRij = perId.get(buur.id);
  if (!buurRij) return { ok: false, reden: 'Buurrij niet gevonden.' };
  return {
    ok: true,
    coordinates: rijAanRand(rand.coordinates, buurRij.coordinates),
    blokId: rand.blokId ?? null,
    omschrijving: `naast rij ${rand.nummer} (buitenkant)`,
  };
}

export interface NummeringVoorstel {
  /** Nieuw nummer per actieve rij */
  nummers: Map<string, number>;
  startRijId: string;
  oudNummer: number;
  startnummer: number;
  /** Kant waar rij `startnummer` ligt (kompasgraden, loodrecht op de rijen) */
  startzijdeGraden: number;
  /** Kompasrichting waarin de nummers oplopen */
  oplopendRichtingGraden: number;
  aantalGewijzigd: number;
  aantalOnderEen: number;
}

/** Nummering opnieuw vanaf een aangewezen rij (die krijgt `startnummer`). */
export function nummeringVoorstel(
  actieveRijen: readonly Rij[],
  perceel: PerceelRD,
  richtingGraden: number,
  startRijId: string,
  startnummer: number,
): NummeringVoorstel | null {
  const actief = actieveRijen.filter(r => r.status === 'actief');
  const pos = rijPosities(perceel, richtingGraden, actief);
  const idx = pos.findIndex(p => p.id === startRijId);
  if (idx < 0) return null;
  const offsets = pos.map(p => p.offsetM);
  const nummersLijst = bepaalNummers(
    offsets,
    idx,
    startnummer,
    pos.map(p => p.langsM),
  );
  let iMin = 0;
  let iMax = 0;
  offsets.forEach((o, i) => {
    if (o < offsets[iMin]) iMin = i;
    if (o > offsets[iMax]) iMax = i;
  });
  const oplopend = offsets.length < 2 || nummersLijst[iMax] >= nummersLijst[iMin];
  const zijde = startzijdeGraden(richtingGraden, oplopend);
  const nummers = new Map<string, number>();
  pos.forEach((p, i) => nummers.set(p.id, nummersLijst[i]));
  const oud = actief.find(r => r.id === startRijId);
  return {
    nummers,
    startRijId,
    oudNummer: oud?.nummer ?? 0,
    startnummer,
    startzijdeGraden: zijde,
    oplopendRichtingGraden: normaliseerGraden(zijde + 180),
    aantalGewijzigd: actief.filter(r => nummers.has(r.id) && nummers.get(r.id) !== r.nummer).length,
    aantalOnderEen: nummersLijst.filter(n => n < 1).length,
  };
}

/** Rijen (kopie) met als ras het ras van hun subperceel zolang er geen blok-/rijras is. */
export function rijenMetSubperceelRas(rijen: readonly Rij[], subRas: ReadonlyMap<string, string>): Rij[] {
  return rijen.map(r => {
    if (r.rasEffectief || !r.subParcelId) return r;
    const ras = subRas.get(r.subParcelId);
    return ras ? { ...r, rasEffectief: ras } : r;
  });
}
