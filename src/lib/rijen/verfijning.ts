/**
 * Rijenkaart — rijen per rij precies op de luchtfoto leggen (verfijning).
 *
 * Waarom: de generatie legt een regelmatig raster (richting θ, vaste rijafstand s, fase). Bij met de hand
 * uitgezette (oudere) aanplant wijkt elke rij een paar cm af en dat telt op tot decimeters (Murre: rijen tot
 * ~0,9 m naast het raster). Deze module legt elke rij afzonderlijk op het rijkenmerk in het beeld.
 *
 * Puur (geen I/O, geen DOM): draait in de browser en in node. Invoer is een rijkenmerk-raster in RD New
 * (lager = rij; standaard de groenindex: de herbicidestrook onder de bomen is het minst groen) en de huidige
 * rijen (basis). Aanpak (gemeten op echte percelen, zie docs/rijenkaart/STATUS.md §9):
 *  1. Per rij segmenten van ~20 m; per segment een dwarsprofiel (bakjes van 5 cm) rond de basislijn.
 *  2. Lokale offset per segment via kruiscorrelatie met het gemiddelde rijprofiel van het perceel (sjabloon)
 *     binnen ±s/3 (de grasbaan op s/2 en de buurrij op s liggen erbuiten) + parabool; geldig bij r ≥ 0,5.
 *  3. Per rij een robuuste lijnfit (Theil–Sen + Huber, uitschieters weg); draaiing gekrompen naar de buren.
 *  4. Begrenzing t.o.v. de trend van de buren (lopende mediaan van 5 rijen), nooit meer dan s/2 − 0,1 m van het
 *     raster: een rij kan nooit naar de buurrij of de grasbaan springen. Zwakke rijen volgen hun buren.
 *  5. Kromme rijen: buigen de segmentresiduen duidelijk meer uit dan de meetruis (≥ 6 cm en ≥ 3 × de ruis), dan wordt de rij een polylijn door de
 *     (gladgestreken) segmentposities, vereenvoudigd tot alleen de punten die nodig zijn (Douglas–Peucker 3 cm).
 *  6. Daarnaast een fijnafgesteld regelmatig raster (fase, rijafstand, kleine draaiing) door alle metingen.
 *     Liggen de rijen daar binnen ~10 cm omheen (GPS-aanplant), dan is 'raster' de aanbeveling — per rij
 *     verschuiven zou dan alleen ruis toevoegen.
 *  7. Oordeel per perceel: te zwak rijkenmerk of te veel zwakke/springende rijen → niet betrouwbaar (raster houden).
 */

import { puntInPerceel } from './geo';
import type { PerceelRD, XY } from './types';

export type VerfijnModus = 'raster' | 'per-rij';

export interface VerfijnBasisRij {
  id: string;
  nummer: number;
  /** Huidige ligging begin → eind (RD); bij een polylijn wordt de koorde (begin–eind) als basis gebruikt */
  coordsRD: XY[];
}

export interface VerfijnOpties {
  /** Segmentlengte langs de rij (m), standaard 20 */
  segmentM?: number;
  /** Halve breedte zoekvenster (standaard s/3) */
  vensterM?: number;
  /** Max |offset − trend van de buren| (standaard s/4) */
  maxOffsetM?: number;
  /** Minimale correlatie met het sjabloon (standaard 0,5) */
  minCorrelatie?: number;
  /** Minimaal deel geldige segmenten (standaard 0,4; en minstens 2) */
  minGeldigDeel?: number;
  /** Afwijking van de buren (midden) waarboven een rij 'controleren' krijgt (standaard 0,30 m) */
  sprongM?: number;
  /** Uitbuiging (m) vanaf waar een rij een polylijn wordt (standaard 0,06; hoger als het beeld ruisig is: 3 × de meetruis) */
  krommeDrempelM?: number;
  /** Tolerantie voor het vereenvoudigen van een polylijn (standaard 0,03 m) */
  vereenvoudigM?: number;
  /** Rest-spreiding rond het fijnafgestelde raster waaronder 'raster' wordt aanbevolen (standaard 0,10 m) */
  rasterGrensM?: number;
  /** Bemonstering langs de rij (m); standaard pixelM */
  langsStapM?: number;
  /** Uiteinden van de rijen uit de foto bepalen (standaard aan) */
  eindenUitFoto?: boolean;
  /** Maximaal verlengen per uiteinde (m, standaard 30) */
  maxVerlengingM?: number;
  /** Lengte van het meetvenster langs de rij bij het zoeken van de uiteinden (m, standaard 3) */
  eindVensterM?: number;
  /** Minimale correlatie met het rijprofiel om 'hier staan bomen' te zeggen (standaard 0,45) */
  eindMinCorrelatie?: number;
}

/** Beeldraster in RD New: waarden per pixel, rij voor rij vanaf linksboven */
export interface VerfijnRaster {
  waarden: Float32Array;
  breedte: number;
  hoogte: number;
  pixelM: number;
  /** RD van de linkerbovenhoek [minX, maxY] */
  origineRD: XY;
}

export interface VerfijnInvoer extends VerfijnRaster {
  /** (VerfijnRaster) rijkenmerk voor de ligging: lager = rij (groenindex van de 8 cm-voorjaarsfoto) */
  /** Rijrichting θ (kompasgraden RD, [0,180)) en rijafstand van de basis */
  richtingGraden: number;
  rijafstandM: number;
  /** Referentiepunt voor offsets (zwaartepunt perceel) */
  zwaartepunt: XY;
  rijen: VerfijnBasisRij[];
  /** Perceel: uiteinden worden nooit buiten de perceelgrens gelegd */
  perceel?: PerceelRD | null;
  /**
   * Tweede beeld om te zien wáár bomen staan (25 cm-zomerfoto, helderheid): de kronen zijn daar het duidelijkst.
   * Het rijpatroon wordt uit het beeld zelf geleerd (sjabloon op de gevonden rijen), dus het teken maakt niet uit.
   */
  aanwezigheid?: VerfijnRaster | null;
  opties?: VerfijnOpties;
}

export interface VerfijndeRij {
  id: string;
  nummer: number;
  /** Voorstel 'per rij': eigen ligging (polylijn met 2+ punten), begin → eind zoals de basis */
  coordsRD: XY[];
  /** Voorstel 'raster': ligging volgens het fijnafgestelde regelmatige raster */
  rasterCoordsRD: XY[];
  /** Verschuiving van het midden t.o.v. de huidige ligging (m, langs +n) — per rij / raster */
  verschuivingM: number;
  rasterVerschuivingM: number;
  /** Afwijking van het midden t.o.v. het fijnafgestelde raster (m) */
  afwijkingRasterM: number;
  /** Draaiing t.o.v. de rijrichting (graden, + = met de klok mee) */
  hoekAfwijkingGraden: number;
  /** Grootste uitbuiging t.o.v. een rechte lijn (m); 0 = recht */
  krommingM: number;
  /** Aantal punten van het per-rij-voorstel */
  punten: number;
  /** Geschatte onzekerheid (m): σ/√n met een vloer van 2 cm; null = niet gemeten (zwak) */
  nauwkeurigheidM: number | null;
  /** Te weinig bruikbaar beeld → ligging van de buren overgenomen */
  zwak: boolean;
  controleren: boolean;
  /** Aantal gebruikte / totale segmenten */
  segmentenGebruikt: number;
  segmentenTotaal: number;
  /** Nieuwe lengte − huidige lengte (m): uiteinden uit de foto */
  lengteVerschilM: number;
}

export interface VerfijnStatistiek {
  /** Verschuiving per rij t.o.v. de huidige ligging (cm, midden) */
  gemiddeldCm: number;
  stdCm: number;
  maxCm: number;
  boven15: number;
  boven30: number;
}

export interface VerfijnResultaat {
  rijen: VerfijndeRij[];
  aanbevolen: VerfijnModus;
  betrouwbaar: boolean;
  /** NL-uitleg als de verfijning niet betrouwbaar is */
  reden: string | null;
  /** Fijnafgesteld raster (voor de instellingen) */
  raster: {
    richtingGraden: number;
    rijafstandM: number;
    /** Offset van het patroon t.o.v. het zwaartepunt langs de (nieuwe) normaal, ∈ [0, rijafstand) */
    faseM: number;
    /** Robuuste spreiding van de rijen rond dit raster (m) */
    restStdM: number;
  };
  /** Verschuiving t.o.v. de huidige ligging voor beide voorstellen */
  perRij: VerfijnStatistiek;
  rasterStat: VerfijnStatistiek;
  zwak: number;
  controleren: number;
  krom: number;
  /** Uiteinden uit de foto: hoeveel rijen verlengd/ingekort (> 1 m) en gemiddeld lengteverschil */
  einden: { bepaald: boolean; metZomerfoto: boolean; verlengd: number; ingekort: number; gemVerlengingM: number };
  duurMs: number;
  diagnostiek: Record<string, number | string | boolean>;
}

const RAD = Math.PI / 180;
const DU = 0.05; // bakjes dwars (m)

function nu(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function mediaan(a: number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function robuusteStd(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mediaan(a);
  return 1.4826 * mediaan(a.map(v => Math.abs(v - m)));
}

function parabool(a: number, b: number, c: number): number {
  const noemer = a - 2 * b + c;
  if (!(noemer > 0)) return 0;
  const d = (0.5 * (a - c)) / noemer;
  return Math.max(-0.5, Math.min(0.5, d));
}

function bemonster(inv: VerfijnRaster, x: number, y: number): number {
  const fi = (x - inv.origineRD[0]) / inv.pixelM - 0.5;
  const fj = (inv.origineRD[1] - y) / inv.pixelM - 0.5;
  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  if (i0 < 0 || j0 < 0 || i0 + 1 >= inv.breedte || j0 + 1 >= inv.hoogte) return NaN;
  const a = fi - i0;
  const b = fj - j0;
  const w = inv.breedte;
  const v = inv.waarden;
  const k = j0 * w + i0;
  return (v[k] * (1 - a) + v[k + 1] * a) * (1 - b) + (v[k + w] * (1 - a) + v[k + w + 1] * a) * b;
}

/** Basislijn in het (t, o)-stelsel: t langs d, o langs n, beide t.o.v. het zwaartepunt */
interface BasisLijn {
  id: string;
  nummer: number;
  t0: number;
  t1: number;
  o0: number;
  o1: number;
}

function offsetOp(l: { t0: number; t1: number; o0: number; o1: number }, t: number): number {
  if (Math.abs(l.t1 - l.t0) < 1e-9) return l.o0;
  return l.o0 + ((l.o1 - l.o0) * (t - l.t0)) / (l.t1 - l.t0);
}

/** Robuuste lijnfit e = a + b·(t − tm): Theil–Sen-start, Huber-IRLS, uitschieters > max(3σ, 12 cm) weg. */
function robuusteLijn(ts: number[], es: number[], ws: number[]): {
  a: number; b: number; tm: number; gebruikt: boolean[]; sigma: number | null;
} {
  const n = ts.length;
  const tm = ts.reduce((p, c) => p + c, 0) / Math.max(1, n);
  if (n === 0) return { a: 0, b: 0, tm: 0, gebruikt: [], sigma: null };
  if (n === 1) return { a: es[0], b: 0, tm, gebruikt: [true], sigma: null };
  if (n === 2) {
    if (Math.abs(es[1] - es[0]) > 0.25) return { a: (es[0] + es[1]) / 2, b: 0, tm, gebruikt: [true, true], sigma: null };
    const b = (es[1] - es[0]) / (ts[1] - ts[0]);
    return { a: es[0] + b * (tm - ts[0]), b, tm, gebruikt: [true, true], sigma: null };
  }
  const hellingen: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.abs(ts[j] - ts[i]) > 1e-6) hellingen.push((es[j] - es[i]) / (ts[j] - ts[i]));
  }
  let b = hellingen.length ? mediaan(hellingen) : 0;
  let a = mediaan(es.map((e, i) => e - b * (ts[i] - tm)));
  let gebruikt = new Array<boolean>(n).fill(true);
  for (let iter = 0; iter < 6; iter++) {
    const r = es.map((e, i) => e - a - b * (ts[i] - tm));
    const sigma = Math.max(0.015, 1.4826 * mediaan(r.map(Math.abs)));
    const grens = Math.max(3 * sigma, 0.12);
    gebruikt = r.map(x => Math.abs(x) <= grens);
    const k = 1.345 * sigma;
    let sw = 0, swt = 0, swe = 0, swtt = 0, swte = 0;
    for (let i = 0; i < n; i++) {
      if (!gebruikt[i]) continue;
      const hw = Math.abs(r[i]) <= k ? 1 : k / Math.abs(r[i]);
      const w = hw * ws[i];
      const x = ts[i] - tm;
      sw += w; swt += w * x; swe += w * es[i]; swtt += w * x * x; swte += w * x * es[i];
    }
    if (sw <= 0) break;
    const noemer = sw * swtt - swt * swt;
    const nb = noemer > 1e-9 ? (sw * swte - swt * swe) / noemer : 0;
    const na = (swe - nb * swt) / sw;
    const klaar = Math.abs(na - a) < 1e-5 && Math.abs(nb - b) < 1e-7;
    a = na; b = nb;
    if (klaar) break;
  }
  const r = es.map((e, i) => e - a - b * (ts[i] - tm)).filter((_, i) => gebruikt[i]);
  const sig = r.length >= 3 ? Math.max(0.005, 1.4826 * mediaan(r.map(Math.abs))) : null;
  return { a, b, tm, gebruikt, sigma: sig };
}

interface Profiel {
  p: Float64Array;
  B: number;
}

function segmentProfiel(inv: VerfijnRaster, c: XY, d: XY, n: XY, l: BasisLijn, ta: number, tb: number,
  centrum: (t: number) => number, halfM: number, langsStap: number): Profiel {
  const B = Math.ceil(halfM / DU);
  const nb = 2 * B + 1;
  const som = new Float64Array(nb);
  const tel = new Float64Array(nb);
  const stappen = Math.max(1, Math.round((tb - ta) / langsStap));
  for (let s = 0; s < stappen; s++) {
    const t = ta + ((s + 0.5) * (tb - ta)) / stappen;
    const o = offsetOp(l, t) + centrum(t);
    const bx = c[0] + t * d[0] + o * n[0];
    const by = c[1] + t * d[1] + o * n[1];
    for (let b = 0; b < nb; b++) {
      const u = (b - B) * DU;
      const v = bemonster(inv, bx + u * n[0], by + u * n[1]);
      if (v === v) {
        som[b] += v;
        tel[b] += 1;
      }
    }
  }
  const p = new Float64Array(nb);
  for (let b = 0; b < nb; b++) p[b] = tel[b] >= 0.5 * stappen ? som[b] / tel[b] : NaN;
  return { p, B };
}

function glad(p: Float64Array, sigmaBakjes: number): Float64Array {
  const r = Math.ceil(3 * sigmaBakjes);
  const k: number[] = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigmaBakjes * sigmaBakjes)));
  const uit = new Float64Array(p.length);
  for (let b = 0; b < p.length; b++) {
    let s = 0, w = 0;
    for (let i = -r; i <= r; i++) {
      const v = p[b + i];
      if (b + i < 0 || b + i >= p.length || v !== v) continue;
      s += v * k[i + r];
      w += k[i + r];
    }
    uit[b] = w > 0 ? s / w : NaN;
  }
  return uit;
}

/** Minimum van het gladgestreken profiel (voor het opbouwen van het sjabloon) */
function schatMinimum(pr: Profiel, vensterM: number): { u: number | null; diepte: number } {
  const g = glad(pr.p, 2);
  const W = Math.floor(vensterM / DU);
  let bMin = -1;
  for (let b = pr.B - W; b <= pr.B + W; b++) {
    if (g[b] !== g[b]) return { u: null, diepte: 0 };
    if (bMin < 0 || g[b] < g[bMin]) bMin = b;
  }
  if (bMin <= pr.B - W || bMin >= pr.B + W) return { u: null, diepte: 0 };
  let links = -Infinity, rechts = -Infinity;
  for (let b = pr.B - W; b < bMin; b++) links = Math.max(links, g[b]);
  for (let b = bMin + 1; b <= pr.B + W; b++) rechts = Math.max(rechts, g[b]);
  const diepte = Math.min(links, rechts) - g[bMin];
  const u = (bMin - pr.B + parabool(g[bMin - 1], g[bMin], g[bMin + 1])) * DU;
  return { u, diepte };
}

/** Kruiscorrelatie (Pearson) met het sjabloon over één rijafstand, verschuiving binnen ±venster */
function schatSjabloon(pr: Profiel, sjabloon: Float64Array, S: number, vensterM: number, minR: number):
  { u: number | null; r: number } {
  const W = Math.floor(vensterM / DU);
  const rs: number[] = [];
  let best = -Infinity, bestK = 0;
  for (let k = -W; k <= W; k++) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, m = 0;
    for (let i = -S; i <= S; i++) {
      const idx = pr.B + k + i;
      if (idx < 0 || idx >= pr.p.length) continue;
      const v = pr.p[idx];
      if (v !== v) continue;
      const t = sjabloon[i + S];
      sx += v; sy += t; sxx += v * v; syy += t * t; sxy += v * t; m++;
    }
    let r = -1;
    if (m > S) {
      const cov = sxy - (sx * sy) / m;
      const vx = sxx - (sx * sx) / m;
      const vy = syy - (sy * sy) / m;
      r = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : -1;
    }
    rs.push(r);
    if (r > best) { best = r; bestK = k; }
  }
  if (bestK === -W || bestK === W) return { u: null, r: best };
  const i = bestK + W;
  const d = parabool(-rs[i - 1], -rs[i], -rs[i + 1]);
  if (best < minR) return { u: null, r: best };
  return { u: (bestK + d) * DU, r: best };
}

/**
 * Staat hier een rij? Kruiscorrelatie met het sjabloon binnen ±venster (r ≥ minR) én voldoende contrast:
 * de versterking (regressie van het profiel op het sjabloon) moet ≥ minVersterking zijn. Wielsporen of
 * maaibanen in een kopakker lopen in het verlengde van de rijpaden door en lijken op het patroon, maar zijn veel
 * zwakker dan bomen.
 */
function rijAanwezig(pr: Profiel, sjabloon: Float64Array, S: number, vensterM: number, minR: number, minVersterking: number): boolean {
  const W = Math.floor(vensterM / DU);
  let sy = 0, syy = 0;
  for (let i = -S; i <= S; i++) { sy += sjabloon[i + S]; syy += sjabloon[i + S] ** 2; }
  let beste: { r: number; versterking: number; k: number } | null = null;
  for (let k = -W; k <= W; k++) {
    let sx = 0, sxx = 0, sxy = 0, ty = 0, tyy = 0, m = 0;
    for (let i = -S; i <= S; i++) {
      const idx = pr.B + k + i;
      if (idx < 0 || idx >= pr.p.length) continue;
      const v = pr.p[idx];
      if (v !== v) continue;
      const t = sjabloon[i + S];
      sx += v; sxx += v * v; sxy += v * t; ty += t; tyy += t * t; m++;
    }
    if (m <= S) continue;
    const cov = sxy - (sx * ty) / m;
    const vx = sxx - (sx * sx) / m;
    const vy = tyy - (ty * ty) / m;
    if (!(vx > 0 && vy > 0)) continue;
    const r = cov / Math.sqrt(vx * vy);
    if (!beste || r > beste.r) beste = { r, versterking: cov / vy, k };
  }
  if (!beste || beste.k === -W || beste.k === W) return false;
  return beste.r >= minR && beste.versterking >= minVersterking;
}

interface Segment {
  tM: number;
  /** Offset t.o.v. de basislijn (m), null = ongeldig */
  e: number | null;
  r: number;
  gebruikt: boolean;
}

/** Tussenresultaat per rij (offsets t.o.v. de basislijn) */
interface RijFit {
  eB: number;
  eE: number;
  segs: Segment[];
  sigma: number | null;
  gebruikt: number;
  zwak: boolean;
  begrensd: boolean;
}

function vereenvoudig(punten: [number, number][], tol: number): [number, number][] {
  if (punten.length <= 2) return punten;
  const houd = new Array<boolean>(punten.length).fill(false);
  houd[0] = true;
  houd[punten.length - 1] = true;
  const stapel: [number, number][] = [[0, punten.length - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop()!;
    const [ta, ea] = punten[a];
    const [tb, eb] = punten[b];
    let maxD = -1, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [t, e] = punten[i];
      const lijn = tb === ta ? ea : ea + ((eb - ea) * (t - ta)) / (tb - ta);
      const dd = Math.abs(e - lijn);
      if (dd > maxD) { maxD = dd; maxI = i; }
    }
    if (maxD > tol && maxI > 0) {
      houd[maxI] = true;
      stapel.push([a, maxI], [maxI, b]);
    }
  }
  return punten.filter((_, i) => houd[i]);
}

function statistiek(verschuivingen: number[]): VerfijnStatistiek {
  if (verschuivingen.length === 0) return { gemiddeldCm: 0, stdCm: 0, maxCm: 0, boven15: 0, boven30: 0 };
  const abs = verschuivingen.map(Math.abs);
  const gem = verschuivingen.reduce((a, b) => a + b, 0) / verschuivingen.length;
  const std = Math.sqrt(verschuivingen.reduce((a, b) => a + (b - gem) ** 2, 0) / verschuivingen.length);
  return {
    gemiddeldCm: Math.round(abs.reduce((a, b) => a + b, 0) / abs.length * 1000) / 10,
    stdCm: Math.round(std * 1000) / 10,
    maxCm: Math.round(Math.max(...abs) * 1000) / 10,
    boven15: abs.filter(v => v > 0.15).length,
    boven30: abs.filter(v => v > 0.3).length,
  };
}

export function verfijnRijen(inv: VerfijnInvoer): VerfijnResultaat {
  const start = nu();
  const s = inv.rijafstandM;
  const o = inv.opties ?? {};
  const segmentM = o.segmentM ?? 20;
  const venster = o.vensterM ?? s / 3;
  const maxOffset = o.maxOffsetM ?? s / 4;
  const minR = o.minCorrelatie ?? 0.5;
  const minDeel = o.minGeldigDeel ?? 0.4;
  const sprongM = o.sprongM ?? 0.3;
  const krommeDrempel = o.krommeDrempelM ?? 0.06;
  const vereenvoudigTol = o.vereenvoudigM ?? 0.03;
  const rasterGrens = o.rasterGrensM ?? 0.1;
  const langsStap = o.langsStapM ?? Math.max(inv.pixelM, 0.08);
  const veilig = s / 2 - 0.1;
  const tau = 0.001; // verwachte spreiding van de draaiing t.o.v. de buren (rad, ≈ 0,06°)
  const th = inv.richtingGraden * RAD;
  const d: XY = [Math.sin(th), Math.cos(th)];
  const n: XY = [Math.cos(th), -Math.sin(th)];
  const c = inv.zwaartepunt;
  const halfProfiel = s / 2 + venster + 0.3;
  const diag: Record<string, number | string | boolean> = {};

  const lijnen: BasisLijn[] = inv.rijen
    .filter(r => r.coordsRD.length >= 2)
    .map(r => {
      const P0 = r.coordsRD[0];
      const P1 = r.coordsRD[r.coordsRD.length - 1];
      const rel0: XY = [P0[0] - c[0], P0[1] - c[1]];
      const rel1: XY = [P1[0] - c[0], P1[1] - c[1]];
      return {
        id: r.id,
        nummer: r.nummer,
        t0: rel0[0] * d[0] + rel0[1] * d[1],
        t1: rel1[0] * d[0] + rel1[1] * d[1],
        o0: rel0[0] * n[0] + rel0[1] * n[1],
        o1: rel1[0] * n[0] + rel1[1] * n[1],
      };
    });

  const leeg = (reden: string): VerfijnResultaat => ({
    rijen: [],
    aanbevolen: 'raster',
    betrouwbaar: false,
    reden,
    raster: { richtingGraden: inv.richtingGraden, rijafstandM: s, faseM: 0, restStdM: 0 },
    perRij: statistiek([]),
    rasterStat: statistiek([]),
    zwak: 0,
    controleren: 0,
    krom: 0,
    einden: { bepaald: false, metZomerfoto: false, verlengd: 0, ingekort: 0, gemVerlengingM: 0 },
    duurMs: nu() - start,
    diagnostiek: diag,
  });
  if (!(s > 0) || lijnen.length === 0) return leeg('Geen rijen of geen rijafstand om te verfijnen.');

  // volgorde op offset (midden) voor buren
  const volgorde = lijnen.map((_, i) => i).sort((a, b) => (lijnen[a].o0 + lijnen[a].o1) - (lijnen[b].o0 + lijnen[b].o1));
  const pos = new Map<number, number>();
  volgorde.forEach((li, p) => pos.set(li, p));

  const segGrenzen = lijnen.map(l => {
    const ta = Math.min(l.t0, l.t1);
    const tb = Math.max(l.t0, l.t1);
    const ns = Math.max(1, Math.round((tb - ta) / segmentM));
    const g: [number, number][] = [];
    for (let j = 0; j < ns; j++) g.push([ta + ((tb - ta) * j) / ns, ta + ((tb - ta) * (j + 1)) / ns]);
    return g;
  });

  const S = Math.round(s / 2 / DU);
  let sjabloon: Float64Array | null = null;
  const centra = lijnen.map(() => ({ a: 0, b: 0 }));
  let grenzen: ({ cB: number; cE: number } | null)[] = lijnen.map(() => null);
  let fits: RijFit[] = [];

  const offsetFit = (f: RijFit, l: BasisLijn, t: number) =>
    Math.abs(l.t1 - l.t0) < 1e-9 ? f.eB : f.eB + ((f.eE - f.eB) * (t - l.t0)) / (l.t1 - l.t0);

  const klem = (e: number, grens: { cB: number; cE: number } | null, kant: 'B' | 'E') => {
    let v = e;
    if (grens) {
      const cen = kant === 'B' ? grens.cB : grens.cE;
      v = Math.max(cen - maxOffset, Math.min(cen + maxOffset, v));
    }
    return Math.max(-veilig, Math.min(veilig, v));
  };

  for (let ronde = 0; ronde < 2; ronde++) {
    const profielen: Profiel[][] = lijnen.map((l, li) =>
      segGrenzen[li].map(([ta, tb]) => segmentProfiel(inv, c, d, n, l, ta, tb,
        t => centra[li].a + centra[li].b * t, halfProfiel, langsStap)));

    if (ronde === 0) {
      // sjabloon: segmenten uitlijnen op hun minimum en middelen over ±s/2
      const minima = profielen.map(rij => rij.map(pr => schatMinimum(pr, venster)));
      const diepten = minima.flat().filter(m => m.u !== null).map(m => m.diepte);
      const dMed = diepten.length ? mediaan(diepten) : 0;
      const som = new Float64Array(2 * S + 1);
      const tel = new Float64Array(2 * S + 1);
      profielen.forEach((rij, li) => rij.forEach((pr, si) => {
        const m = minima[li][si];
        if (m.u === null || m.diepte < 0.5 * dMed) return;
        const k = Math.round(m.u / DU);
        for (let i = -S; i <= S; i++) {
          const idx = pr.B + k + i;
          if (idx < 0 || idx >= pr.p.length) continue;
          const v = pr.p[idx];
          if (v === v) { som[i + S] += v; tel[i + S]++; }
        }
      }));
      sjabloon = new Float64Array(2 * S + 1);
      for (let i = 0; i < som.length; i++) sjabloon[i] = tel[i] > 0 ? som[i] / tel[i] : 0;
      const W = Math.min(Math.floor(venster / DU), S);
      let lo = Infinity, hiL = -Infinity, hiR = -Infinity;
      for (let i = -W; i <= W; i++) lo = Math.min(lo, sjabloon[i + S]);
      for (let i = -W; i < 0; i++) hiL = Math.max(hiL, sjabloon[i + S]);
      for (let i = 1; i <= W; i++) hiR = Math.max(hiR, sjabloon[i + S]);
      const refDiepte = Math.min(hiL, hiR) - lo;
      diag.sjabloonDiepte = Number(refDiepte.toFixed(3));
      diag.segmentDiepteMediaan = Number(dMed.toFixed(3));
      diag.diepteRatio = Number((dMed / Math.max(1e-9, refDiepte)).toFixed(2));
    }

    // per rij schatten en fitten
    fits = lijnen.map((l, li) => {
      const segs: Segment[] = segGrenzen[li].map(([ta, tb], si) => {
        const tM = (ta + tb) / 2;
        const cen = centra[li].a + centra[li].b * tM;
        const sj = schatSjabloon(profielen[li][si], sjabloon!, S, venster, minR);
        return { tM, e: sj.u === null ? null : sj.u + cen, r: sj.r, gebruikt: false };
      });
      const geldig = segs.map((sg, i) => (sg.e !== null ? i : -1)).filter(i => i >= 0);
      const fit = robuusteLijn(geldig.map(i => segs[i].tM), geldig.map(i => segs[i].e as number),
        geldig.map(i => Math.max(0.1, segs[i].r)));
      geldig.forEach((si, k) => { segs[si].gebruikt = fit.gebruikt[k]; });
      const nGebruikt = fit.gebruikt.filter(Boolean).length;
      const nodig = Math.max(2, Math.ceil(minDeel * segs.length));
      const zwak = segs.length === 1 ? nGebruikt < 1 : nGebruikt < Math.min(nodig, segs.length);
      const eB = zwak ? 0 : fit.a + fit.b * (l.t0 - fit.tm);
      const eE = zwak ? 0 : fit.a + fit.b * (l.t1 - fit.tm);
      return { eB, eE, segs, sigma: fit.sigma, gebruikt: nGebruikt, zwak, begrensd: false };
    });

    // draaiing krimpen naar de mediaan van de buren
    const ruw = fits.map((f, li) => {
      const dt = lijnen[li].t1 - lijnen[li].t0;
      return Math.abs(dt) > 1e-9 ? (f.eE - f.eB) / dt : 0;
    });
    fits = fits.map((f, li) => {
      if (f.zwak) return f;
      const l = lijnen[li];
      const gebruikt = f.segs.filter(sg => sg.gebruikt && sg.e !== null);
      const p = pos.get(li)!;
      const buren: number[] = [];
      for (const richting of [-1, 1]) {
        let gevonden = 0;
        for (let q = p + richting; q >= 0 && q < volgorde.length && gevonden < 2; q += richting) {
          const fb = fits[volgorde[q]];
          if (fb.zwak || fb.gebruikt < 3) continue;
          buren.push(ruw[volgorde[q]]);
          gevonden++;
        }
      }
      if (buren.length === 0) return f;
      const bNb = mediaan(buren);
      const tm = gebruikt.length ? gebruikt.reduce((a, sg) => a + sg.tM, 0) / gebruikt.length : (l.t0 + l.t1) / 2;
      const sxx = gebruikt.reduce((a, sg) => a + (sg.tM - tm) ** 2, 0);
      const sig = Math.max(0.02, f.sigma ?? 0.05);
      const w1 = sxx > 0 ? sxx / (sig * sig) : 0;
      const w2 = 1 / (tau * tau);
      const bNieuw = (ruw[li] * w1 + bNb * w2) / (w1 + w2);
      const eTm = offsetFit(f, l, tm);
      return { ...f, eB: eTm + bNieuw * (l.t0 - tm), eE: eTm + bNieuw * (l.t1 - tm) };
    });

    // zwakke rijen: mediaan van de geldige buren (max 2 per kant)
    fits = fits.map((f, li) => {
      if (!f.zwak) return f;
      const p = pos.get(li)!;
      const bs: number[] = [];
      const es: number[] = [];
      for (const richting of [-1, 1]) {
        let gevonden = 0;
        for (let q = p + richting; q >= 0 && q < volgorde.length && gevonden < 2; q += richting) {
          const fb = fits[volgorde[q]];
          if (fb.zwak) continue;
          // verschuiving van de buur t.o.v. zijn eigen ligging, op t0/t1 van deze rij
          const lb = lijnen[volgorde[q]];
          bs.push(offsetFit(fb, lb, lijnen[li].t0));
          es.push(offsetFit(fb, lb, lijnen[li].t1));
          gevonden++;
        }
      }
      if (bs.length === 0) return f;
      return { ...f, eB: mediaan(bs), eE: mediaan(es) };
    });

    // begrenzen (rond de trend uit ronde 1; altijd binnen de veiligheidsgrens)
    fits = fits.map((f, li) => {
      const eB = klem(f.eB, grenzen[li], 'B');
      const eE = klem(f.eE, grenzen[li], 'E');
      return { ...f, eB, eE, begrensd: Math.abs(eB - f.eB) > 1e-9 || Math.abs(eE - f.eE) > 1e-9 };
    });

    if (ronde === 0) {
      // trend = lopende mediaan (5 rijen) van begin/eind-offsets → grenzen + evt. tweede ronde
      const trendB: number[] = [];
      const trendE: number[] = [];
      let maxTrend = 0;
      volgorde.forEach((li, p) => {
        const bs: number[] = [];
        const es: number[] = [];
        for (let q = Math.max(0, p - 2); q <= Math.min(volgorde.length - 1, p + 2); q++) {
          const f = fits[volgorde[q]];
          if (f.zwak) continue;
          const lb = lijnen[volgorde[q]];
          bs.push(offsetFit(f, lb, lijnen[li].t0));
          es.push(offsetFit(f, lb, lijnen[li].t1));
        }
        trendB[li] = bs.length ? mediaan(bs) : 0;
        trendE[li] = es.length ? mediaan(es) : 0;
        maxTrend = Math.max(maxTrend, Math.abs(trendB[li]), Math.abs(trendE[li]));
      });
      diag.maxTrendM = Number(maxTrend.toFixed(3));
      grenzen = lijnen.map((_, li) => ({ cB: trendB[li], cE: trendE[li] }));
      if (maxTrend <= 0.15) {
        fits = fits.map((f, li) => {
          const eB = klem(f.eB, grenzen[li], 'B');
          const eE = klem(f.eE, grenzen[li], 'E');
          return { ...f, eB, eE, begrensd: f.begrensd || Math.abs(eB - f.eB) > 1e-9 || Math.abs(eE - f.eE) > 1e-9 };
        });
        break;
      }
      // tweede ronde: zoekvenster centreren op de trend
      const klemC = 0.8 * veilig;
      lijnen.forEach((l, li) => {
        const bB = Math.max(-klemC, Math.min(klemC, trendB[li]));
        const bE = Math.max(-klemC, Math.min(klemC, trendE[li]));
        const dt = l.t1 - l.t0;
        const b = Math.abs(dt) > 1e-9 ? (bE - bB) / dt : 0;
        centra[li] = { a: bB - b * l.t0, b };
      });
    }
  }

  // ---- oordeel per perceel
  const nZwak = fits.filter(f => f.zwak).length;
  const midden = fits.map(f => (f.eB + f.eE) / 2);
  const sprong = fits.map((f, li) => {
    const p = pos.get(li)!;
    const buren: number[] = [];
    for (let q = Math.max(0, p - 2); q <= Math.min(volgorde.length - 1, p + 2); q++) {
      if (q === p) continue;
      const lb = lijnen[volgorde[q]];
      const l = lijnen[li];
      // midden van de buur in absolute offset, vergeleken met dit midden (beide t.o.v. hun basis)
      buren.push(midden[volgorde[q]] + (lb.o0 + lb.o1) / 2 - (l.o0 + l.o1) / 2 -
        Math.round(((lb.o0 + lb.o1) / 2 - (l.o0 + l.o1) / 2) / s) * s);
    }
    return buren.length > 0 && Math.abs(midden[li] - mediaan(buren)) > sprongM;
  });
  const nSprong = sprong.filter((v, i) => v && !fits[i].zwak).length;
  const redenen: string[] = [];
  const diepteRatio = Number(diag.diepteRatio ?? 0);
  if (!(diepteRatio >= 0.35)) redenen.push('de boomstroken zijn op de luchtfoto te zwak zichtbaar');
  if (nZwak > 0.25 * fits.length) redenen.push(`${nZwak} van de ${fits.length} rijen zijn op de foto niet goed te zien`);
  if (nSprong > 0.25 * fits.length) redenen.push(`${nSprong} rijen wijken sterk af van hun buren`);
  const betrouwbaar = redenen.length === 0;

  // ---- fijnafgesteld regelmatig raster: O = f + s'·k + ω·(t − tRef), robuust over alle segmentmetingen
  const oMid = lijnen.map(l => (l.o0 + l.o1) / 2);
  const oMin = Math.min(...oMid);
  const ks = oMid.map(om => Math.round((om - oMin) / s));
  const alleT = lijnen.flatMap(l => [l.t0, l.t1]);
  const tRef = (Math.min(...alleT) + Math.max(...alleT)) / 2;
  const meting: { k: number; t: number; O: number; w: number }[] = [];
  fits.forEach((f, li) => {
    if (f.zwak) return;
    const l = lijnen[li];
    for (const sg of f.segs) {
      if (!sg.gebruikt || sg.e === null) continue;
      meting.push({ k: ks[li], t: sg.tM - tRef, O: offsetOp(l, sg.tM) + sg.e, w: Math.max(0.1, sg.r) });
    }
  });
  let rf = oMin, rs = s, rw = 0;
  if (meting.length >= 6) {
    // start: kleinste kwadraten, daarna Huber-IRLS
    for (let iter = 0; iter < 8; iter++) {
      const res = meting.map(m => m.O - (rf + rs * m.k + rw * m.t));
      const sig = Math.max(0.02, robuusteStd(res));
      const kH = 1.345 * sig;
      // normaalvergelijkingen 3×3
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const bv = [0, 0, 0];
      meting.forEach((m, i) => {
        const hw = iter === 0 || Math.abs(res[i]) <= kH ? 1 : kH / Math.abs(res[i]);
        const w = hw * m.w;
        const x = [1, m.k, m.t];
        for (let a = 0; a < 3; a++) {
          bv[a] += w * x[a] * m.O;
          for (let b = 0; b < 3; b++) A[a][b] += w * x[a] * x[b];
        }
      });
      const opl = los3(A, bv);
      if (!opl) break;
      const klaar = Math.abs(opl[0] - rf) < 1e-5 && Math.abs(opl[1] - rs) < 1e-6 && Math.abs(opl[2] - rw) < 1e-8;
      [rf, rs, rw] = opl;
      if (klaar) break;
    }
  }
  // rest per rij rond het fijnafgestelde raster (midden)
  const rasterOffset = (li: number, t: number) => rf + rs * ks[li] + rw * (t - tRef);
  const restPerRij = fits.map((f, li) => {
    const l = lijnen[li];
    const tm = (l.t0 + l.t1) / 2;
    return offsetOp(l, tm) + offsetFit(f, l, tm) - rasterOffset(li, tm);
  });
  const restStd = robuusteStd(restPerRij.filter((_, i) => !fits[i].zwak));
  const thetaNieuw = ((inv.richtingGraden + Math.atan(rw) / RAD) % 180 + 180) % 180;
  const cosW = Math.cos(Math.atan(rw));
  const sLoodrecht = rs * cosW;
  // fase t.o.v. het zwaartepunt langs de nieuwe normaal (t = 0 ⇒ offset rf − rw·tRef)
  const faseRuw = (rf - rw * tRef) * cosW;
  const fase = ((faseRuw % sLoodrecht) + sLoodrecht) % sLoodrecht;

  // ---- meetruis per segment (perceel): uit tweede differenties van de segmentresiduen, zodat een
  // geleidelijke bocht niet als ruis telt. Een rij is pas krom als de uitbuiging daar duidelijk boven ligt.
  const tweedeDiff: number[] = [];
  fits.forEach((f, li) => {
    if (f.zwak) return;
    const l = lijnen[li];
    const gs = f.segs.filter(sg => sg.gebruikt && sg.e !== null).sort((a, b) => a.tM - b.tM);
    const res = gs.map(sg => (sg.e as number) - offsetFit(f, l, sg.tM));
    for (let i = 1; i < res.length - 1; i++) tweedeDiff.push(res[i] - (res[i - 1] + res[i + 1]) / 2);
  });
  const ruisM = tweedeDiff.length >= 8 ? robuusteStd(tweedeDiff) / Math.sqrt(1.5) : 0.05;
  const krommeGrens = Math.max(krommeDrempel, (3 * ruisM) / Math.sqrt(3));
  const vereenvoudigGrens = Math.max(vereenvoudigTol, ruisM / Math.sqrt(3));
  diag.ruisSegmentM = Number(ruisM.toFixed(3));
  diag.krommeGrensM = Number(krommeGrens.toFixed(3));

  const punt = (t: number, oAbs: number): XY => [c[0] + t * d[0] + oAbs * n[0], c[1] + t * d[1] + oAbs * n[1]];

  // ---- uiteinden uit de foto: tot waar de bomen echt staan, nooit buiten het perceel.
  // Bomen = het rijpatroon is aanwezig in de zomerfoto (kronen het duidelijkst; sjabloon geleerd op de
  // middenstukken van de gevonden rijen). Rijen die nog niet op de zomerfoto staan (jonge aanplant): de
  // 8 cm-voorjaarsfoto. Vanaf het huidige uiteinde naar buiten zolang er
  // bomen staan (2 lege meters achter elkaar = einde); staat er bij het uiteinde niets, dan naar binnen inkorten.
  const eindenAan = (o.eindenUitFoto ?? true) && betrouwbaar && sjabloon !== null;
  const eindVenster = o.eindVensterM ?? 3;
  const eindStap = 1;
  /** Stap bij het volgen van een rij naar zijn uiteinden (m) */
  const LOOP_STAP = 2;
  const eindMinR = o.eindMinCorrelatie ?? 0.45;
  const maxVerlenging = o.maxVerlengingM ?? 30;
  const dwarsZoek = Math.min(venster, 0.6);
  const zomer = inv.aanwezigheid ?? null;
  let zomerSjabloon: Float64Array | null = null;
  if (eindenAan && zomer) {
    const som = new Float64Array(2 * S + 1);
    const tel = new Float64Array(2 * S + 1);
    lijnen.forEach((l, li) => {
      const f = fits[li];
      if (f.zwak) return;
      const g = segGrenzen[li];
      g.forEach(([ta, tb], si) => {
        if (g.length > 2 && (si === 0 || si === g.length - 1)) return; // middenstukken: daar staan zeker bomen
        const pr = segmentProfiel(zomer, c, d, n, l, ta, tb, t => offsetFit(f, l, t), halfProfiel, Math.max(zomer.pixelM, 0.08));
        for (let i = -S; i <= S; i++) {
          const v = pr.p[pr.B + i];
          if (v === v) { som[i + S] += v; tel[i + S]++; }
        }
      });
    });
    const sj = new Float64Array(2 * S + 1);
    for (let i = 0; i < sj.length; i++) sj[i] = tel[i] > 0 ? som[i] / tel[i] : 0;
    const bereik = Math.max(...sj) - Math.min(...sj);
    if (bereik > 1e-6) zomerSjabloon = sj;
    diag.zomerSjabloonBereik = Number(bereik.toFixed(3));
  }
  const patroonOp = (raster: VerfijnRaster, sj: Float64Array, li: number, t: number) => {
    const l = lijnen[li];
    const f = fits[li];
    const pr = segmentProfiel(raster, c, d, n, l, t - eindVenster / 2, t + eindVenster / 2, tt => offsetFit(f, l, tt), halfProfiel,
      Math.max(raster.pixelM, 0.08));
    return rijAanwezig(pr, sj, S, dwarsZoek, eindMinR, 0.4);
  };
  // Per rij: is de rij op de zomerfoto goed te zien (middenstukken)? Dan bepaalt alléén de zomerfoto waar de
  // bomen staan (kronen; voorjaarsstrook loopt soms door in een pad of tussen geparkeerde wagens). Anders
  // (jonge aanplant, nog niet op de zomerfoto) de voorjaarsfoto.
  const zomerLeidend = lijnen.map((l, li) => {
    if (!eindenAan || zomer === null || zomerSjabloon === null || fits[li].zwak) return false;
    const g = segGrenzen[li];
    const midden = g.length > 2 ? g.slice(1, -1) : g;
    const ok = midden.filter(([ta, tb]) => patroonOp(zomer, zomerSjabloon!, li, (ta + tb) / 2)).length;
    return midden.length > 0 && ok >= 0.5 * midden.length;
  });
  diag.rijenZomerLeidend = zomerLeidend.filter(Boolean).length;
  const bomenOp = (li: number, t: number) =>
    zomerLeidend[li] ? patroonOp(zomer!, zomerSjabloon!, li, t) : patroonOp(inv, sjabloon!, li, t);
  const binnenOp = (li: number, t: number) =>
    !inv.perceel || puntInPerceel(punt(t, offsetOp(lijnen[li], t) + offsetFit(fits[li], lijnen[li], t)), inv.perceel);
  // Ruwe uiteinden per rij (lo = kleinste t, hi = grootste t), als verlenging t.o.v. de huidige uiteinden
  // (positief = langer). Zwakke rijen en rijen zonder uiteindebepaling: 0.
  const ruw = lijnen.map((l, li) => {
    const f = fits[li];
    const lo = Math.min(l.t0, l.t1);
    const hi = Math.max(l.t0, l.t1);
    if (!eindenAan || f.zwak) return { lo: 0, hi: 0, meten: false };
    const geldig = (cc: number) => binnenOp(li, cc) && bomenOp(li, cc);
    // Fijn: vanaf een geldig punt in stappen van 25 cm naar buiten tot het laatste geldige punt, zodat
    // verlengen en inkorten op hetzelfde uiteinde uitkomen (het midden van het laatste venster met bomen).
    const fijn = (laatste: number, uit: 1 | -1): number => {
      let t = laatste;
      for (let k = 1; k <= 7; k++) {
        const cc = laatste + uit * 0.25 * k;
        if (!geldig(cc)) break;
        t = cc;
      }
      return t;
    };
    // Van het midden van de rij (daar staan zeker bomen) naar buiten tot de perceelgrens: per 2 m 'staan hier
    // bomen?'. Het uiteinde ligt waar 'meestal bomen' overgaat in 'meestal niet': het maximum van de cumulatieve
    // som van (aanwezig − ½). Ontbrekende bomen, een vlekkerig beeld (jonge aanplant) of wielsporen in de kopakker
    // verschuiven dat punt nauwelijks, en het hangt niet af van de kopakker waarmee gegenereerd is. Daarna fijn (25 cm).
    const gebruiktT = f.segs.filter(sg => sg.gebruikt && sg.e !== null).map(sg => sg.tM);
    const midden = gebruiktT.length ? gebruiktT.reduce((a, b) => a + b, 0) / gebruiktT.length : (lo + hi) / 2;
    const zoek = (tEind: number, uit: 1 | -1): number => {
      const posities: number[] = [];
      const aanwezig: number[] = [];
      const maxT = Math.abs(tEind - midden) + maxVerlenging;
      for (let k = 0; k * LOOP_STAP <= maxT; k++) {
        const cc = midden + uit * k * LOOP_STAP;
        if (!binnenOp(li, cc)) break;
        posities.push(cc);
        aanwezig.push(bomenOp(li, cc) ? 1 : 0);
      }
      if (posities.length === 0) return tEind;
      // te weinig bomen gezien in de binnenste helft: onbetrouwbaar, huidig uiteinde houden
      const helft = aanwezig.slice(0, Math.max(1, Math.ceil(aanwezig.length / 2)));
      if (helft.reduce((a, v) => a + v, 0) < 0.3 * helft.length) return tEind;
      let som = 0;
      let besteSom = -Infinity;
      let beste = 0;
      aanwezig.forEach((v, i) => {
        som += v - 0.5;
        if (som > besteSom) {
          besteSom = som;
          beste = i;
        }
      });
      let eind = fijn(posities[beste], uit);
      // Bomen tot (bijna) de perceelgrens: het meetvenster valt daar half buiten het perceel en stopt ~1,5 m te
      // vroeg. Ligt de grens binnen 2,5 m, dan lopen de bomen door tot de grens (uiteinde 0,5 m binnen de grens).
      if (inv.perceel) {
        for (let stap = 0.25; stap <= 2.5; stap += 0.25) {
          if (!binnenOp(li, eind + uit * stap)) {
            eind = eind + uit * Math.max(0, stap - 0.5);
            break;
          }
        }
      }
      return eind;
    };
    return { lo: lo - zoek(lo, -1), hi: zoek(hi, 1) - hi, meten: true };
  });

  // Samenhang met de buren: een echt einde (kopakker, laadplek, inham, pad) geldt voor een groep buurrijen.
  // Een rij houdt zijn eigen (preciezere) uiteinde als de verlenging binnen ±2,5 m klopt met de lopende mediaan
  // over 5 rijen, of met de mediaan van 3 buren aan één kant (rand van een laadplek/inham van ≥ 3 rijen), of
  // (alleen bij de buitenste rijen) met de directe buur. Anders is het ruis (bv. jonge aanplant met een zwakke
  // strook; ook twee ruisrijen naast elkaar) en krijgt de rij de mediaan van 5. Zwakke rijen: mediaan van hun buren.
  const EIND_TOL = 2.5;
  const regulariseer = (kant: 'lo' | 'hi'): number[] => {
    const gemeten = volgorde.filter(li => ruw[li].meten);
    const plek = new Map(gemeten.map((li, i) => [li, i] as const));
    return lijnen.map((_, li) => {
      const eigen = ruw[li][kant];
      let i = plek.get(li);
      if (i === undefined) {
        // niet gemeten (zwak): dichtstbijzijnde gemeten rij in de volgorde als middelpunt
        if (!eindenAan || !fits[li].zwak || gemeten.length === 0) return eigen;
        const p = pos.get(li)!;
        let beste = 0;
        let afst = Infinity;
        gemeten.forEach((g, gi) => {
          const dd = Math.abs(pos.get(g)! - p);
          if (dd < afst) { afst = dd; beste = gi; }
        });
        i = beste;
        const venster = gemeten.slice(Math.max(0, i - 2), Math.min(gemeten.length, i + 3)).map(g => ruw[g][kant]);
        return mediaan(venster);
      }
      const venster = gemeten.slice(Math.max(0, i - 2), Math.min(gemeten.length, i + 3)).map(g => ruw[g][kant]);
      const m = mediaan(venster);
      const links = gemeten.slice(Math.max(0, i - 3), i).reverse().map(g => ruw[g][kant]);
      const rechts = gemeten.slice(i + 1, i + 4).map(g => ruw[g][kant]);
      const klopt = (v: number) => Math.abs(eigen - v) <= EIND_TOL;
      // rand van een groep (laadplek): klopt met de mediaan van 3 buren aan één kant
      const kantKlopt = [links, rechts].some(b => b.length === 3 && klopt(mediaan(b)));
      // buitenste rijen (minder dan 3 buren aan een kant): de directe buur telt ook
      const rand = links.length < 3 || rechts.length < 3;
      const buurKlopt = rand && [links, rechts].some(b => b.length > 0 && klopt(b[0]));
      return klopt(m) || kantKlopt || buurKlopt ? eigen : m;
    });
  };
  const regLo = eindenAan ? regulariseer('lo') : ruw.map(() => 0);
  const regHi = eindenAan ? regulariseer('hi') : ruw.map(() => 0);
  diag.eindenGeregulariseerd = ruw.filter((r, li) => r.meten && (Math.abs(r.lo - regLo[li]) > 1e-6 || Math.abs(r.hi - regHi[li]) > 1e-6)).length;

  const einden = lijnen.map((l, li) => {
    const lo = Math.min(l.t0, l.t1);
    const hi = Math.max(l.t0, l.t1);
    let nLo = lo - regLo[li];
    let nHi = hi + regHi[li];
    // uiteinden binnen het perceel houden
    for (let i = 0; i < 80 && inv.perceel && nHi - nLo > 5 && !binnenOp(li, nHi); i++) nHi -= 0.25;
    for (let i = 0; i < 80 && inv.perceel && nHi - nLo > 5 && !binnenOp(li, nLo); i++) nLo += 0.25;
    if (!(nHi - nLo >= 5)) {
      nLo = lo;
      nHi = hi;
    }
    return l.t0 <= l.t1 ? { t0: nLo, t1: nHi } : { t0: nHi, t1: nLo };
  });

  // ---- uitvoer per rij
  let nKrom = 0;
  const rijen: VerfijndeRij[] = fits.map((f, li) => {
    const l = lijnen[li];
    const tm = (l.t0 + l.t1) / 2;
    const { t0: e0, t1: e1 } = einden[li];
    // per rij: recht, of een gladde boog als de rij aantoonbaar buigt. Toets: parabool-fit door de
    // segmentposities; krom als de kromming significant is (t ≥ 3, met minstens de meetruis als σ) én de
    // uitbuiging t.o.v. de koorde ≥ krommeGrens. De boog komt bovenop de (geregulariseerde) rechte lijn,
    // zonder die te verschuiven (alleen het kromme deel van de parabool, gemiddeld 0 over de metingen).
    let coords: XY[] = [punt(e0, offsetOp(l, e0) + offsetFit(f, l, e0)), punt(e1, offsetOp(l, e1) + offsetFit(f, l, e1))];
    let kromming = 0;
    if (!f.zwak) {
      const gebruikt = f.segs.filter(sg => sg.gebruikt && sg.e !== null);
      if (gebruikt.length >= 5) {
        const xs = gebruikt.map(sg => sg.tM - tm);
        const es = gebruikt.map(sg => sg.e as number);
        const kw = kwadratischeFit(xs, es);
        if (kw) {
          const L = Math.abs(e1 - e0);
          const sigma = Math.max(ruisM, kw.sigma);
          const tWaarde = Math.abs(kw.c) / (sigma * Math.sqrt(kw.varC));
          const uitbuiging = (Math.abs(kw.c) * L * L) / 4;
          if (tWaarde >= 3 && uitbuiging >= krommeGrens) {
            // kromme component: c·(x² − (A + B·x)) met A, B de kleinste-kwadratenlijn van x² over de metingen
            const n2 = xs.length;
            const mx = xs.reduce((p, x) => p + x, 0) / n2;
            const mx2 = xs.reduce((p, x) => p + x * x, 0) / n2;
            const sxx = xs.reduce((p, x) => p + (x - mx) ** 2, 0);
            const sxx2 = xs.reduce((p, x) => p + (x - mx) * (x * x - mx2), 0);
            const B = sxx > 0 ? sxx2 / sxx : 0;
            const A = mx2 - B * mx;
            const grens = s / 4;
            const boog = (t: number) => {
              const x = t - tm;
              return Math.max(-grens, Math.min(grens, kw.c * (x * x - (A + B * x))));
            };
            const stappen = 8;
            const pts: [number, number][] = [];
            for (let i = 0; i <= stappen; i++) {
              const t = e0 + ((e1 - e0) * i) / stappen;
              pts.push([t, offsetFit(f, l, t) + boog(t)]);
            }
            const eenvoud = vereenvoudig(pts, vereenvoudigGrens);
            if (eenvoud.length > 2) {
              coords = eenvoud.map(([t, e]) => punt(t, offsetOp(l, t) + Math.max(-veilig, Math.min(veilig, e))));
              kromming = uitbuiging;
              nKrom++;
            }
          }
        }
      }
    }
    const rasterCoords: XY[] = [punt(e0, rasterOffset(li, e0)), punt(e1, rasterOffset(li, e1))];
    const verschuiving = offsetFit(f, l, tm);
    const rasterVerschuiving = rasterOffset(li, tm) - offsetOp(l, tm);
    const dt = l.t1 - l.t0;
    const hoek = Math.abs(dt) > 1e-9 ? Math.atan((f.eE - f.eB) / dt + (l.o1 - l.o0) / dt) / RAD : 0;
    const nauwkeurig = f.zwak || f.sigma === null || f.gebruikt === 0 ? null : Math.max(0.02, f.sigma / Math.sqrt(f.gebruikt));
    return {
      id: l.id,
      nummer: l.nummer,
      coordsRD: coords,
      rasterCoordsRD: rasterCoords,
      verschuivingM: verschuiving,
      rasterVerschuivingM: rasterVerschuiving,
      afwijkingRasterM: restPerRij[li],
      hoekAfwijkingGraden: Math.round(hoek * 1000) / 1000,
      krommingM: Math.round(kromming * 1000) / 1000,
      punten: coords.length,
      nauwkeurigheidM: nauwkeurig === null ? null : Math.round(nauwkeurig * 1000) / 1000,
      zwak: f.zwak,
      controleren: f.zwak || f.begrensd || sprong[li],
      segmentenGebruikt: f.gebruikt,
      segmentenTotaal: f.segs.length,
      lengteVerschilM: Math.round((Math.abs(e1 - e0) - Math.abs(l.t1 - l.t0)) * 100) / 100,
    };
  });
  const verschillen = rijen.map(r => r.lengteVerschilM);

  diag.restStdM = Number(restStd.toFixed(3));
  diag.metingen = meting.length;
  const aanbevolen: VerfijnModus = restStd <= rasterGrens ? 'raster' : 'per-rij';
  return {
    rijen,
    aanbevolen,
    betrouwbaar,
    reden: betrouwbaar ? null : `Niet betrouwbaar: ${redenen.join('; ')}.`,
    raster: {
      richtingGraden: Math.round(thetaNieuw * 10000) / 10000,
      rijafstandM: Math.round(sLoodrecht * 10000) / 10000,
      faseM: Math.round(fase * 10000) / 10000,
      restStdM: Math.round(restStd * 1000) / 1000,
    },
    perRij: statistiek(rijen.map(r => r.verschuivingM)),
    rasterStat: statistiek(rijen.map(r => r.rasterVerschuivingM)),
    zwak: nZwak,
    controleren: rijen.filter(r => r.controleren).length,
    krom: nKrom,
    einden: {
      bepaald: eindenAan,
      metZomerfoto: zomerSjabloon !== null,
      verlengd: verschillen.filter(v => v > 1).length,
      ingekort: verschillen.filter(v => v < -1).length,
      gemVerlengingM: verschillen.length ? Math.round((verschillen.reduce((a, b) => a + b, 0) / verschillen.length) * 10) / 10 : 0,
    },
    duurMs: Math.round(nu() - start),
    diagnostiek: diag,
  };
}

/**
 * Kleinste-kwadraten parabool e = a + b·x + c·x²; geeft c, de residu-σ en (XᵀX)⁻¹[2][2] (voor de
 * standaardfout van c). null bij te weinig punten of een singulier stelsel.
 */
function kwadratischeFit(xs: number[], es: number[]): { c: number; sigma: number; varC: number } | null {
  const n = xs.length;
  if (n < 4) return null;
  const schaal = Math.max(1, ...xs.map(Math.abs));
  const u = xs.map(x => x / schaal);
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [0, 0, 0];
  u.forEach((x, i) => {
    const r = [1, x, x * x];
    for (let p = 0; p < 3; p++) {
      b[p] += r[p] * es[i];
      for (let q = 0; q < 3; q++) A[p][q] += r[p] * r[q];
    }
  });
  const opl = los3(A, b);
  if (!opl) return null;
  // (AᵀA)⁻¹[2][2] via de derde kolom van de inverse
  const kolom = los3(A, [0, 0, 1]);
  if (!kolom) return null;
  const res = u.map((x, i) => es[i] - (opl[0] + opl[1] * x + opl[2] * x * x));
  const sigma = Math.sqrt(res.reduce((p, r) => p + r * r, 0) / Math.max(1, n - 3));
  const c = opl[2] / (schaal * schaal);
  const varC = kolom[2] / (schaal * schaal * schaal * schaal);
  return { c, sigma, varC };
}

/** 3×3 stelsel oplossen (Gauss met pivot) */
function los3(A: number[][], b: number[]): [number, number, number] | null {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < 3; k++) {
    let p = k;
    for (let i = k + 1; i < 3; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-12) return null;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < 3; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j < 4; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let som = M[i][3];
    for (let j = i + 1; j < 3; j++) som -= M[i][j] * x[j];
    x[i] = som / M[i][i];
  }
  return [x[0], x[1], x[2]];
}
