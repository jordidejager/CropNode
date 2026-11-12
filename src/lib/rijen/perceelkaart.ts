/**
 * Perceelkaart — één GeoJSON-bestand per perceel met de perceelgrens, de rijen en de maten die een zelfrijdende
 * machine nodig heeft (afnemer: de Jager Core-simulatie). Puur: geen I/O; de database-kant staat in
 * perceelkaart-store.ts, de veldbeschrijving in docs/rijenkaart/PERCEELKAART.md.
 *
 * Afspraken:
 *  - geometrie in WGS84 (EPSG:4326); elke feature heeft properties.rd: dezelfde punten in RD New (EPSG:28992),
 *    berekend met PostGIS ST_Transform, 3 decimalen. Alle maten hieronder zijn in RD gerekend.
 *  - Rijen lopen van begin naar eind; links/rechts = gezien in die richting.
 *  - Bestaande velden van de rijen-export (rijen_geojson) blijven precies zo heten; nieuwe velden komen erbij.
 *  - Wat CropNode niet weet is null (niet geschat, niet weggelaten).
 */

import type { LngLat, XY } from './types';

export const PERCEELKAART_SCHEMA_VERSIE = '1.0';
export const PERCEELKAART_DELEN = ['grens', 'rijen', 'obstakels'] as const;
export type PerceelkaartDeel = (typeof PERCEELKAART_DELEN)[number];

/** Buren verder weg dan dit veelvoud van de rijafstand tellen niet (pad, ander blok) */
export const MAX_BUUR_FACTOR = 2.5;
/** Minimale overlap langs de rij (deel van de kortste) om als buur te tellen */
const BUUR_OVERLAP_DEEL = 0.3;
/** Loodrecht dichterbij dan dit = stuk op dezelfde rijlijn, geen buur */
const ZELFDE_LIJN_M = 0.5;
/** Bemonstering langs de rij voor min/mediaan/max en het profiel */
const STAP_M = 1;
const PROFIEL_STAP_M = 10;
const GRENS_TOLERANTIE_M = 1;
const LENGTE_TOLERANTIE_M = 0.1;

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type RdRing = XY[];
export type RdPolygoon = RdRing[];

export interface PerceelkaartInvoer {
  exportTijd: string;
  perceel: {
    id: string;
    naam: string;
    /** Perceelgrens zoals CropNode hem gebruikt (WGS84); null = geen grens bekend */
    geometrie: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null;
    /** Uit perceelkaart_geometrie: coördinaten in RD (zelfde nesting als de geometrie) */
    rd: unknown;
    oppervlakM2: number | null;
    oppervlakHaGeregistreerd: number | null;
    grensBron: string | null;
    brpId: string | null;
  };
  instellingen: {
    rijrichtingGraden: number | null;
    rijafstandM: number | null;
    boomafstandM: number | null;
    kopakkerBeginM: number | null;
    kopakkerEindM: number | null;
    beginkantGraden: number | null;
    bronBeeld: string | null;
    detectieMethode: string | null;
    laatstGegenereerdOp: string | null;
  } | null;
  /** Actieve rijen: feature uit rijen_geojson + RD-ligging uit perceelkaart_geometrie */
  rijen: {
    feature: { type: 'Feature'; id?: string | number; geometry: { type: 'LineString'; coordinates: LngLat[] }; properties: Record<string, unknown> };
    rd: XY[];
    /** Lengte van de rij die meer dan 1 m buiten de grens ligt (null = niet te bepalen) */
    buitenGrensM: number | null;
  }[];
  /** Aantal actieve rijen volgens de rijen-tabel (controle) */
  aantalActiefInCropnode: number;
  aantalGerooid: number;
}

export interface Spreiding {
  min: number;
  mediaan: number;
  max: number;
}

export interface PerceelkaartControles {
  ok: boolean;
  aantal_rijen: { in_bestand: number; in_cropnode: number; ok: boolean };
  binnen_grens: { tolerantie_m: number; gecontroleerd: boolean; buiten: { nummer: number; buiten_m: number }[]; ok: boolean };
  lengte: { tolerantie_m: number; max_afwijking_m: number | null; afwijkend: number[]; ok: boolean };
  zonder_boomafstand: number[];
  controleren: number[];
  richting: {
    ok: boolean;
    per_blok: { blok: string | null; rijen: number; richting_graden: number | null; tegen_de_rest_in: number[] }[];
  };
  /** Dezelfde uitkomst in gewone zinnen (voor na het downloaden); info = ter kennisgeving, geen fout */
  meldingen: { soort: 'ok' | 'let_op' | 'info'; tekst: string }[];
}

export interface PerceelkaartMetadata {
  schema_versie: string;
  export_tijd: string;
  perceel_id: string;
  perceel_naam: string;
  brp_jaar: number | null;
  brp_id: string | null;
  grens_bron: string | null;
  oppervlak_ha: number | null;
  oppervlak_ha_geregistreerd: number | null;
  aantal_rijen_actief: number;
  aantal_rijen_gerooid: number;
  geplant_op_gps: boolean | Record<string, boolean | null> | null;
  luchtfoto_bron: string | null;
  opnamedatum: string | null;
  rijinstellingen: {
    rijrichting_graden: number | null;
    rijafstand_m: number | null;
    boomafstand_m: number | null;
    kopakker_begin_m: number | null;
    kopakker_eind_m: number | null;
    beginkant_graden: number | null;
    detectie_methode: string | null;
    laatst_gegenereerd_op: string | null;
  } | null;
  crs: string;
  crs_rd: string;
  conventies: Record<string, string>;
  controles: PerceelkaartControles;
  /** Alleen bij een deel van de kaart (MCP) */
  deel?: PerceelkaartDeel;
  rijen_selectie?: string;
  vervolg?: { reden: string; aanroepen: { deel: PerceelkaartDeel; rijen?: string }[] };
}

export interface PerceelkaartFeature {
  type: 'Feature';
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> & { soort: 'perceel' | 'rij' | 'obstakel' };
}

export interface Perceelkaart {
  type: 'FeatureCollection';
  name: 'perceelkaart';
  metadata: PerceelkaartMetadata;
  features: PerceelkaartFeature[];
}

export const PERCEELKAART_CONVENTIES: Record<string, string> = {
  geometrie: 'WGS84 (EPSG:4326), zoals de rijen-export',
  rd: 'properties.rd = dezelfde punten in RD New (EPSG:28992), PostGIS ST_Transform, meters, 3 decimalen; alle maten zijn in RD gerekend',
  rij: 'LineString van begin naar eind; meer dan 2 punten = licht gebogen rij',
  links_rechts: 'gezien in de rijrichting (van begin naar eind)',
  afstanden: 'hart op hart, loodrecht op de rij gemeten; bemonsterd per 1 m (min/mediaan/max) en per 10 m (afstand_profiel)',
  richting_graden: 'richting van begin naar eind in graden vanaf RD-noord (rasternoord, zoals de rijrichting in CropNode); richting_graden_ware_noorden = t.o.v. het ware noorden',
  kop_m: 'afstand van het rijuiteinde in het verlengde van de rij tot de perceelgrens; negatief = het uiteinde ligt buiten de grens',
  boomnummering: 'boom n ligt tussen (n-1) x boomafstand en n x boomafstand vanaf het begin van de rij',
  null: 'CropNode weet het niet (niet geregistreerd); er is niets geschat',
  rijen: 'alleen actieve rijen; gerooide rijen staan alleen als aantal in de metadata',
};

// ---------------------------------------------------------------------------
// Geometrie (RD, meters)
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

function rond(n: number, d = 3): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function lengte(lijn: XY[]): number {
  let l = 0;
  for (let i = 1; i < lijn.length; i++) l += Math.hypot(lijn[i][0] - lijn[i - 1][0], lijn[i][1] - lijn[i - 1][1]);
  return l;
}

/** Richting van a naar b in graden [0, 360) vanaf het noorden (RD: rasternoord), met de klok mee */
export function richtingRD(a: XY, b: XY): number {
  const g = Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD;
  return (g + 360) % 360;
}

/** Begin-richting (graden vanaf het ware noorden) van de grootcirkel van a naar b (WGS84) */
export function richtingWaar(a: LngLat, b: LngLat): number {
  const [l1, f1] = [a[0] * RAD, a[1] * RAD];
  const [l2, f2] = [b[0] * RAD, b[1] * RAD];
  const y = Math.sin(l2 - l1) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(l2 - l1);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

/** Punt en richting (eenheidsvector) op afstand s langs een polylijn */
function puntEnRichting(lijn: XY[], s: number): { p: XY; r: XY } {
  let rest = Math.max(0, s);
  for (let i = 1; i < lijn.length; i++) {
    const a = lijn[i - 1];
    const b = lijn[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    if (rest <= l || i === lijn.length - 1) {
      const f = Math.min(1, rest / l);
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], r: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
    }
    rest -= l;
  }
  return { p: lijn[0], r: [0, 1] };
}

/** Kleinste λ > 0 waarvoor p + λ·r een segment van de lijn snijdt (null = geen snijpunt) */
function straalSnijdt(p: XY, r: XY, segmenten: [XY, XY][], minLambda = 1e-9): number | null {
  let beste: number | null = null;
  for (const [a, b] of segmenten) {
    const sx = b[0] - a[0];
    const sy = b[1] - a[1];
    const noemer = r[0] * sy - r[1] * sx;
    if (Math.abs(noemer) < 1e-12) continue; // evenwijdig
    const qx = a[0] - p[0];
    const qy = a[1] - p[1];
    const lambda = (qx * sy - qy * sx) / noemer;
    const mu = (qx * r[1] - qy * r[0]) / noemer;
    if (lambda >= minLambda && mu >= -1e-9 && mu <= 1 + 1e-9 && (beste === null || lambda < beste)) beste = lambda;
  }
  return beste;
}

function segmentenVan(lijn: XY[]): [XY, XY][] {
  const s: [XY, XY][] = [];
  for (let i = 1; i < lijn.length; i++) s.push([lijn[i - 1], lijn[i]]);
  return s;
}

/** Even-odd over alle ringen (buitenranden, gaten, meerdere polygonen) */
export function puntInRingen(p: XY, ringen: RdRing[]): boolean {
  let binnen = false;
  for (const ring of ringen) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) binnen = !binnen;
    }
  }
  return binnen;
}

/** Ringen uit RD-coördinaten van een Polygon of MultiPolygon (zelfde nesting als GeoJSON) */
export function ringenUitRd(rd: unknown): RdRing[] {
  const isPunt = (v: unknown): v is XY => Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
  const isRing = (v: unknown): v is XY[] => Array.isArray(v) && v.length > 0 && v.every(isPunt);
  if (!Array.isArray(rd)) return [];
  if (rd.every(isRing)) return (rd as XY[][]).map(r => r.map(p => [p[0], p[1]] as XY)); // Polygon
  return rd.flatMap(poly => (Array.isArray(poly) ? poly.filter(isRing).map(r => r.map(p => [p[0], p[1]] as XY)) : []));
}

/**
 * Afstand van een rijuiteinde in het verlengde van de rij tot de perceelgrens (eerste snijpunt met een rand,
 * ook die van een inham). Ligt het uiteinde buiten de grens: negatief (afstand terug tot de grens).
 */
export function kopAfstand(lijn: XY[], kant: 'begin' | 'eind', ringen: RdRing[]): number | null {
  if (lijn.length < 2 || ringen.length === 0) return null;
  const [p, q] = kant === 'begin' ? [lijn[0], lijn[1]] : [lijn[lijn.length - 1], lijn[lijn.length - 2]];
  const l = Math.hypot(p[0] - q[0], p[1] - q[1]);
  if (l < 1e-9) return null;
  const naarBuiten: XY = [(p[0] - q[0]) / l, (p[1] - q[1]) / l];
  const randen = ringen.flatMap(r => segmentenVan(r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]]));
  if (puntInRingen(p, ringen)) {
    const d = straalSnijdt(p, naarBuiten, randen, 0);
    return d === null ? null : rond(d);
  }
  const terug = straalSnijdt(p, [-naarBuiten[0], -naarBuiten[1]], randen, 0);
  return terug === null ? null : rond(-terug);
}

export function spreiding(waarden: number[]): Spreiding | null {
  if (waarden.length === 0) return null;
  const s = [...waarden].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { min: rond(s[0]), mediaan: rond(m), max: rond(s[s.length - 1]) };
}

// ---------------------------------------------------------------------------
// Buren en afstanden
// ---------------------------------------------------------------------------

interface RijLigging {
  rd: XY[];
  /** Nominale rijafstand (rij → blok → perceel), voor de maximale buurafstand */
  nominaalM: number | null;
}

export interface BuurUitkomst {
  links: number | null;
  rechts: number | null;
  /** Alle stukken op de dichtstbijzijnde rijlijn aan die kant (voor de afstanden) */
  lijnLinks: number[];
  lijnRechts: number[];
}

/**
 * Buurrijen links en rechts (gezien van begin naar eind): de dichtstbijzijnde rijlijn aan elke kant die minstens
 * 30% overlapt langs de rij, niet verder dan 2,5 × de rijafstand. Stukken op dezelfde lijn (< 0,5 m) tellen niet;
 * liggen er meerdere stukken op de buurlijn, dan is de buur het stuk met de meeste overlap.
 */
export function vindBuren(rijen: RijLigging[]): BuurUitkomst[] {
  const vorm = rijen.map(r => {
    const b = r.rd[0];
    const e = r.rd[r.rd.length - 1];
    const l = Math.hypot(e[0] - b[0], e[1] - b[1]);
    const u: XY = l > 1e-9 ? [(e[0] - b[0]) / l, (e[1] - b[1]) / l] : [0, 1];
    return { b, u, links: [-u[1], u[0]] as XY, l, lengte: lengte(r.rd) };
  });
  const kandidaten = rijen.map((_, i) => {
    const vi = vorm[i];
    const uit: { j: number; gap: number; overlap: number }[] = [];
    if (vi.l < 1e-9) return uit;
    rijen.forEach((rj, j) => {
      if (j === i || rj.rd.length < 2) return;
      const ts = rj.rd.map(p => (p[0] - vi.b[0]) * vi.u[0] + (p[1] - vi.b[1]) * vi.u[1]);
      const os = rj.rd.map(p => (p[0] - vi.b[0]) * vi.links[0] + (p[1] - vi.b[1]) * vi.links[1]);
      const lo = Math.max(0, Math.min(...ts));
      const hi = Math.min(vi.l, Math.max(...ts));
      const kortste = Math.min(vi.lengte, vorm[j].lengte);
      if (hi - lo < BUUR_OVERLAP_DEEL * kortste || hi <= lo) return;
      const tc = (lo + hi) / 2;
      const oj = interpoleer(ts, os, tc);
      const oi = interpoleer(
        rijen[i].rd.map(p => (p[0] - vi.b[0]) * vi.u[0] + (p[1] - vi.b[1]) * vi.u[1]),
        rijen[i].rd.map(p => (p[0] - vi.b[0]) * vi.links[0] + (p[1] - vi.b[1]) * vi.links[1]),
        tc,
      );
      if (oj === null || oi === null) return;
      const gap = oj - oi;
      if (Math.abs(gap) < ZELFDE_LIJN_M) return;
      uit.push({ j, gap, overlap: hi - lo });
    });
    return uit;
  });
  // Nominale rijafstand als die ontbreekt: mediaan van de kleinste afstand per rij
  const kleinste = kandidaten.map(k => (k.length ? Math.min(...k.map(c => Math.abs(c.gap))) : null)).filter((v): v is number => v !== null);
  const mediaanKleinste = spreiding(kleinste)?.mediaan ?? null;

  return rijen.map((r, i) => {
    const nominaal = r.nominaalM ?? mediaanKleinste;
    const max = nominaal !== null ? MAX_BUUR_FACTOR * nominaal : Infinity;
    const kies = (teken: 1 | -1) => {
      const kant = kandidaten[i].filter(c => Math.sign(c.gap) === teken && Math.abs(c.gap) <= max);
      if (kant.length === 0) return { buur: null, lijn: [] as number[] };
      const dichtst = Math.min(...kant.map(c => Math.abs(c.gap)));
      const opLijn = kant.filter(c => Math.abs(c.gap) - dichtst < ZELFDE_LIJN_M);
      const buur = opLijn.reduce((a, c) => (c.overlap > a.overlap ? c : a)).j;
      return { buur, lijn: opLijn.map(c => c.j) };
    };
    const l = kies(1);
    const rr = kies(-1);
    return { links: l.buur, rechts: rr.buur, lijnLinks: l.lijn, lijnRechts: rr.lijn };
  });
}

/** Lineaire interpolatie van o bij t (t-waarden van een rij, niet per se oplopend); null buiten het bereik */
function interpoleer(ts: number[], os: number[], t: number): number | null {
  const paren = ts.map((x, k) => [x, os[k]] as const).sort((a, b) => a[0] - b[0]);
  if (t < paren[0][0] - 1e-9 || t > paren[paren.length - 1][0] + 1e-9) return null;
  for (let k = 1; k < paren.length; k++) {
    if (t <= paren[k][0] + 1e-9) {
      const [t0, o0] = paren[k - 1];
      const [t1, o1] = paren[k];
      return t1 - t0 < 1e-12 ? o1 : o0 + ((o1 - o0) * (t - t0)) / (t1 - t0);
    }
  }
  return paren[paren.length - 1][1];
}

/**
 * Afstand hart op hart naar de buurlijn, loodrecht op de rij, op afstand s vanaf het begin (null = de buur
 * ligt daar niet naast de rij, of verder dan maxM).
 */
export function afstandOp(lijn: XY[], s: number, buren: XY[][], teken: 1 | -1, maxM: number): number | null {
  const { p, r } = puntEnRichting(lijn, s);
  const dir: XY = teken === 1 ? [-r[1], r[0]] : [r[1], -r[0]];
  let beste: number | null = null;
  for (const b of buren) {
    const d = straalSnijdt(p, dir, segmentenVan(b), 1e-6);
    if (d !== null && d <= maxM && (beste === null || d < beste)) beste = d;
  }
  return beste;
}

// ---------------------------------------------------------------------------
// Opbouw
// ---------------------------------------------------------------------------

const getal = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function bouwPerceelkaart(inv: PerceelkaartInvoer): Perceelkaart {
  const ringen = ringenUitRd(inv.perceel.rd);
  const rijen = [...inv.rijen].sort((a, b) => (getal(a.feature.properties.nummer) ?? 0) - (getal(b.feature.properties.nummer) ?? 0));
  const nummerVan = (i: number) => getal(rijen[i].feature.properties.nummer) ?? 0;
  const perceelRijafstand = inv.instellingen?.rijafstandM ?? null;
  const buren = vindBuren(
    rijen.map(r => ({ rd: r.rd, nominaalM: getal(r.feature.properties.rijafstand_m) ?? perceelRijafstand })),
  );

  const rijFeatures: PerceelkaartFeature[] = rijen.map((r, i) => {
    const props = r.feature.properties;
    const wgs = r.feature.geometry.coordinates;
    const lengteRd = lengte(r.rd);
    const nominaal = getal(props.rijafstand_m) ?? perceelRijafstand;
    const maxBuur = nominaal !== null ? MAX_BUUR_FACTOR * nominaal : 50;
    const b = buren[i];
    const lijnLinks = b.lijnLinks.map(j => rijen[j].rd);
    const lijnRechts = b.lijnRechts.map(j => rijen[j].rd);
    const links: number[] = [];
    const rechts: number[] = [];
    for (let s = 0; s <= lengteRd + 1e-9; s += STAP_M) {
      const dl = lijnLinks.length ? afstandOp(r.rd, s, lijnLinks, 1, maxBuur) : null;
      const dr = lijnRechts.length ? afstandOp(r.rd, s, lijnRechts, -1, maxBuur) : null;
      if (dl !== null) links.push(dl);
      if (dr !== null) rechts.push(dr);
    }
    const profiel: [number, number | null, number | null][] = [];
    for (let s = 0; s <= lengteRd + 1e-9; s += PROFIEL_STAP_M) {
      const dl = lijnLinks.length ? afstandOp(r.rd, s, lijnLinks, 1, maxBuur) : null;
      const dr = lijnRechts.length ? afstandOp(r.rd, s, lijnRechts, -1, maxBuur) : null;
      profiel.push([rond(s, 1), dl === null ? null : rond(dl), dr === null ? null : rond(dr)]);
    }
    const id = (j: number | null) => (j === null ? null : String(rijen[j].feature.properties.id ?? rijen[j].feature.id ?? ''));
    return {
      type: 'Feature',
      id: r.feature.id,
      geometry: r.feature.geometry,
      properties: {
        soort: 'rij',
        // bestaande velden van de rijen-export, ongewijzigd
        ...props,
        rd: r.rd.map(p => [rond(p[0]), rond(p[1])]),
        richting_graden: rond(richtingRD(r.rd[0], r.rd[r.rd.length - 1]), 2),
        richting_graden_ware_noorden: wgs.length >= 2 ? rond(richtingWaar(wgs[0], wgs[wgs.length - 1]), 2) : null,
        buur_links_id: id(b.links),
        buur_rechts_id: id(b.rechts),
        buur_links_nummer: b.links === null ? null : nummerVan(b.links),
        buur_rechts_nummer: b.rechts === null ? null : nummerVan(b.rechts),
        afstand_links_m: spreiding(links),
        afstand_rechts_m: spreiding(rechts),
        afstand_profiel: profiel,
        kop_begin_m: kopAfstand(r.rd, 'begin', ringen),
        kop_eind_m: kopAfstand(r.rd, 'eind', ringen),
        kop_begin_achter: null,
        kop_eind_achter: null,
        eerste_boom_m: null,
        lege_plekken: null,
        herplant: null,
        kroonbreedte_m: null,
        boomhoogte_m: null,
        hagelnet: null,
        nethoogte_m: null,
        paalafstand_m: null,
      },
    };
  });

  const oppervlakHa = inv.perceel.oppervlakM2 === null ? null : rond(inv.perceel.oppervlakM2 / 10000, 4);
  const perceelFeature: PerceelkaartFeature = {
    type: 'Feature',
    id: inv.perceel.id,
    geometry: inv.perceel.geometrie,
    properties: { soort: 'perceel', naam: inv.perceel.naam, oppervlak_ha: oppervlakHa, rd: inv.perceel.rd ?? null },
  };

  const controles = maakControles(inv, rijen, rijFeatures);
  const i = inv.instellingen;
  return {
    type: 'FeatureCollection',
    name: 'perceelkaart',
    metadata: {
      schema_versie: PERCEELKAART_SCHEMA_VERSIE,
      export_tijd: inv.exportTijd,
      perceel_id: inv.perceel.id,
      perceel_naam: inv.perceel.naam,
      brp_jaar: null,
      brp_id: inv.perceel.brpId,
      grens_bron: inv.perceel.grensBron,
      oppervlak_ha: oppervlakHa,
      oppervlak_ha_geregistreerd: inv.perceel.oppervlakHaGeregistreerd,
      aantal_rijen_actief: rijFeatures.length,
      aantal_rijen_gerooid: inv.aantalGerooid,
      geplant_op_gps: null,
      luchtfoto_bron: i?.bronBeeld ?? null,
      opnamedatum: null,
      rijinstellingen: i
        ? {
            rijrichting_graden: i.rijrichtingGraden,
            rijafstand_m: i.rijafstandM,
            boomafstand_m: i.boomafstandM,
            kopakker_begin_m: i.kopakkerBeginM,
            kopakker_eind_m: i.kopakkerEindM,
            beginkant_graden: i.beginkantGraden,
            detectie_methode: i.detectieMethode,
            laatst_gegenereerd_op: i.laatstGegenereerdOp,
          }
        : null,
      crs: 'EPSG:4326',
      crs_rd: 'EPSG:28992',
      conventies: PERCEELKAART_CONVENTIES,
      controles,
    },
    features: [perceelFeature, ...rijFeatures],
  };
}

function maakControles(
  inv: PerceelkaartInvoer,
  rijen: PerceelkaartInvoer['rijen'],
  features: PerceelkaartFeature[],
): PerceelkaartControles {
  const nummer = (r: PerceelkaartInvoer['rijen'][number]) => getal(r.feature.properties.nummer) ?? 0;
  const aantal = { in_bestand: features.length, in_cropnode: inv.aantalActiefInCropnode, ok: features.length === inv.aantalActiefInCropnode };

  const gecontroleerd = rijen.every(r => r.buitenGrensM !== null) && ringenUitRd(inv.perceel.rd).length > 0;
  const buiten = rijen
    .filter(r => r.buitenGrensM !== null && r.buitenGrensM > 0.001)
    .map(r => ({ nummer: nummer(r), buiten_m: rond(r.buitenGrensM as number, 2) }));
  const binnen = { tolerantie_m: GRENS_TOLERANTIE_M, gecontroleerd, buiten, ok: gecontroleerd && buiten.length === 0 };

  const afwijkingen = rijen.map(r => {
    const l = getal(r.feature.properties.lengte_m);
    return l === null ? null : { nummer: nummer(r), d: Math.abs(lengte(r.rd) - l) };
  });
  const metLengte = afwijkingen.filter((a): a is { nummer: number; d: number } => a !== null);
  const afwijkend = [...metLengte.filter(a => a.d >= LENGTE_TOLERANTIE_M).map(a => a.nummer), ...rijen.filter((_, k) => afwijkingen[k] === null).map(nummer)];
  const lengteC = {
    tolerantie_m: LENGTE_TOLERANTIE_M,
    max_afwijking_m: metLengte.length ? rond(Math.max(...metLengte.map(a => a.d)), 3) : null,
    afwijkend,
    ok: afwijkend.length === 0,
  };

  const zonderBoomafstand = rijen.filter(r => getal(r.feature.properties.boomafstand_m) === null).map(nummer);
  const controleren = rijen.filter(r => r.feature.properties.controleren === true).map(nummer);

  // Richting per blok: alle rijen van een blok horen met het begin aan dezelfde kopakker te liggen
  const groepen = new Map<string, number[]>();
  rijen.forEach((r, k) => {
    const sleutel = String(r.feature.properties.blok_id ?? '');
    groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), k]);
  });
  const perBlok = [...groepen.entries()].map(([, ks]) => {
    const richtingen = ks.map(k => richtingRD(rijen[k].rd[0], rijen[k].rd[rijen[k].rd.length - 1]));
    // as (ongericht) via verdubbelde hoeken, daarna de meerderheid van de zin
    const sx = richtingen.reduce((a, g) => a + Math.cos(2 * g * RAD), 0);
    const sy = richtingen.reduce((a, g) => a + Math.sin(2 * g * RAD), 0);
    const as = ((Math.atan2(sy, sx) / RAD / 2) + 360) % 360;
    const mee = ks.filter((_, n) => Math.cos((richtingen[n] - as) * RAD) >= 0);
    const tegen = ks.filter((_, n) => Math.cos((richtingen[n] - as) * RAD) < 0);
    const [meerderheid, minderheid] = mee.length >= tegen.length ? [mee, tegen] : [tegen, mee];
    const hoofd = meerderheid.length ? (mee.length >= tegen.length ? as : (as + 180) % 360) : null;
    const blok = rijen[ks[0]].feature.properties.blok;
    return {
      blok: typeof blok === 'string' && blok ? blok : null,
      rijen: ks.length,
      richting_graden: hoofd === null ? null : rond(hoofd, 1),
      tegen_de_rest_in: minderheid.map(k => nummer(rijen[k])).sort((a, b) => a - b),
    };
  });
  const richting = { ok: perBlok.every(b => b.tegen_de_rest_in.length === 0), per_blok: perBlok };

  const lijst = (ns: number[]) => (ns.length > 12 ? `${ns.slice(0, 12).join(', ')} … (${ns.length})` : ns.join(', '));
  const meldingen: PerceelkaartControles['meldingen'] = [];
  const meld = (ok: boolean, tekst: string) => meldingen.push({ soort: ok ? 'ok' : 'let_op', tekst });
  meld(
    aantal.ok,
    aantal.ok
      ? `${aantal.in_bestand} actieve rijen, gelijk aan CropNode.`
      : `Aantal rijen klopt niet: ${aantal.in_bestand} in het bestand, ${aantal.in_cropnode} in CropNode.`,
  );
  if (!gecontroleerd) meld(false, 'Of de rijen binnen de perceelgrens liggen kon niet worden gecontroleerd (geen perceelgrens).');
  else meld(binnen.ok, buiten.length ? `Buiten de perceelgrens (> 1 m): rij ${buiten.map(b => `${b.nummer} (${b.buiten_m} m)`).join(', ')}.` : 'Alle rijen liggen binnen de perceelgrens (±1 m).');
  meld(
    lengteC.ok,
    lengteC.ok
      ? `Lengte in RD klopt met lengte_m (max. afwijking ${lengteC.max_afwijking_m ?? 0} m).`
      : `Lengte wijkt ≥ 0,1 m af van lengte_m bij rij ${lijst(afwijkend)}.`,
  );
  for (const b of perBlok) {
    if (b.tegen_de_rest_in.length) meld(false, `${b.blok ? `Blok ${b.blok}` : 'Rijen zonder blok'}: rij ${lijst(b.tegen_de_rest_in)} loopt de andere kant op dan de rest.`);
  }
  if (richting.ok && rijen.length) meld(true, 'Binnen elk blok lopen alle rijen dezelfde kant op.');
  if (zonderBoomafstand.length) meldingen.push({ soort: 'info', tekst: `Geen boomafstand bekend bij ${zonderBoomafstand.length === rijen.length ? 'alle rijen' : `rij ${lijst(zonderBoomafstand)}`}.` });
  if (controleren.length) meldingen.push({ soort: 'info', tekst: `Op 'controleren' (rijlijn door een inham geknipt): ${controleren.length === rijen.length ? 'alle rijen' : `rij ${lijst(controleren)}`}.` });

  return {
    ok: aantal.ok && binnen.ok && lengteC.ok && richting.ok,
    aantal_rijen: aantal,
    binnen_grens: binnen,
    lengte: lengteC,
    zonder_boomafstand: zonderBoomafstand,
    controleren,
    richting,
    meldingen,
  };
}

// ---------------------------------------------------------------------------
// Delen (MCP) en bestandsnaam
// ---------------------------------------------------------------------------

/** Rijnummers uit "1-40, 45" (alleen nummers en bereiken) */
export function nummersUitTekst(tekst: string): Set<number> | null {
  const uit = new Set<number>();
  for (const deel of tekst.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(deel);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) uit.add(n);
  }
  return uit.size ? uit : null;
}

/** Een deel van de kaart: metadata blijft volledig (incl. controles), de features alleen van dat deel */
export function perceelkaartDeel(kaart: Perceelkaart, deel: PerceelkaartDeel, rijen?: { nummers: Set<number>; tekst: string }): Perceelkaart {
  const soort = deel === 'grens' ? 'perceel' : deel === 'rijen' ? 'rij' : 'obstakel';
  const features = kaart.features.filter(
    f => f.properties.soort === soort && (soort !== 'rij' || !rijen || rijen.nummers.has(Number(f.properties.nummer))),
  );
  return {
    ...kaart,
    metadata: { ...kaart.metadata, deel, ...(rijen && deel === 'rijen' ? { rijen_selectie: rijen.tekst } : {}) },
    features,
  };
}

/** Rijen in opeenvolgende stukken waarvan de JSON elk onder maxTekens blijft (op nummer) */
export function rijStukken(kaart: Perceelkaart, maxTekens: number): string[] {
  const rijen = kaart.features.filter(f => f.properties.soort === 'rij');
  const basis = JSON.stringify({ ...kaart, features: [] }).length;
  const stukken: string[] = [];
  let begin: number | null = null;
  let eind: number | null = null;
  let grootte = basis;
  for (const f of rijen) {
    const n = Number(f.properties.nummer);
    const g = JSON.stringify(f).length + 1;
    if (begin !== null && grootte + g > maxTekens) {
      stukken.push(begin === eind ? `${begin}` : `${begin}-${eind}`);
      begin = null;
      grootte = basis;
    }
    if (begin === null) begin = n;
    eind = n;
    grootte += g;
  }
  if (begin !== null) stukken.push(begin === eind ? `${begin}` : `${begin}-${eind}`);
  return stukken;
}

/** "Steketee Oost (2)" → "perceelkaart-steketee-oost-2.geojson" (ASCII, werkt overal) */
export function perceelkaartBestandsnaam(naam: string | null | undefined): string {
  const s = (naam ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `perceelkaart-${s || 'perceel'}.geojson`;
}
