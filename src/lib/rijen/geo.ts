/**
 * Rijenkaart — geometrie-basis: WGS84 ⇄ RD New (EPSG:28992) en vectorhulpjes.
 *
 * De proj4-definitie is exact die van PostGIS (spatial_ref_sys, srid 28992), zodat
 * browser en database hetzelfde rekenen (verschil gemeten: ~5 mm).
 * Alle metrische berekeningen gebeuren in RD; opslag in WGS84.
 */

import proj4 from 'proj4';
import type { LngLat, PerceelRD, XY } from './types';

export const RD_NEW =
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 ' +
  '+x_0=155000 +y_0=463000 +ellps=bessel ' +
  '+towgs84=565.2369,50.0087,465.658,-0.406857,0.350733,-1.87035,4.0812 +units=m +no_defs';

const converter = proj4('EPSG:4326', RD_NEW);

export function naarRD(p: LngLat): XY {
  const [x, y] = converter.forward([p[0], p[1]]);
  return [x, y];
}

export function naarWGS(p: XY): LngLat {
  const [lng, lat] = converter.inverse([p[0], p[1]]);
  return [lng, lat];
}

// ---------------------------------------------------------------------------
// Richtingen
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

/** Normaliseer naar [0, 360) */
export function normaliseerGraden(g: number): number {
  const r = g % 360;
  return r < 0 ? r + 360 : r;
}

/** Rij-as is ongericht: normaliseer naar [0, 180) */
export function asRichting(g: number): number {
  const r = normaliseerGraden(g) % 180;
  return r;
}

/** Eenheidsvector langs een kompasrichting (x = oost, y = noord) */
export function richtingVector(graden: number): XY {
  return [Math.sin(graden * RAD), Math.cos(graden * RAD)];
}

/** Normaal op de rijrichting: n = (cos θ, −sin θ), rechts van d */
export function normaalVector(richtingGraden: number): XY {
  return [Math.cos(richtingGraden * RAD), -Math.sin(richtingGraden * RAD)];
}

/** Kompasrichting van a naar b, [0, 360) */
export function kompasRichting(a: XY, b: XY): number {
  return normaliseerGraden(Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD);
}

/** Kleinste hoekverschil (absoluut) tussen twee kompasrichtingen, [0, 180] */
export function hoekVerschil(a: number, b: number): number {
  const d = Math.abs(normaliseerGraden(a) - normaliseerGraden(b));
  return d > 180 ? 360 - d : d;
}

const WINDSTREKEN = ['noord', 'noordoost', 'oost', 'zuidoost', 'zuid', 'zuidwest', 'west', 'noordwest'];

/** Kompasrichting als woord, bv. 'noordoost' */
export function windstreek(graden: number): string {
  return WINDSTREKEN[Math.round(normaliseerGraden(graden) / 45) % 8];
}

// ---------------------------------------------------------------------------
// Vectoren en lijnen (RD, meters)
// ---------------------------------------------------------------------------

export function aftrekken(a: XY, b: XY): XY {
  return [a[0] - b[0], a[1] - b[1]];
}

export function optellen(a: XY, b: XY): XY {
  return [a[0] + b[0], a[1] + b[1]];
}

export function schaal(a: XY, f: number): XY {
  return [a[0] * f, a[1] * f];
}

export function inproduct(a: XY, b: XY): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function afstand(a: XY, b: XY): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function lijnLengte(coords: XY[]): number {
  let l = 0;
  for (let i = 1; i < coords.length; i++) l += afstand(coords[i - 1], coords[i]);
  return l;
}

/**
 * Projecteer punt p op een polylijn.
 * afstandLangsM = meters vanaf het begin van de lijn tot het voetpunt;
 * loodrechtM = afstand van p tot de lijn.
 */
export function projecteerOpLijn(p: XY, lijn: XY[]): { afstandLangsM: number; loodrechtM: number; punt: XY } {
  let beste = { afstandLangsM: 0, loodrechtM: Infinity, punt: lijn[0] };
  let gelopen = 0;
  for (let i = 1; i < lijn.length; i++) {
    const a = lijn[i - 1];
    const b = lijn[i];
    const ab = aftrekken(b, a);
    const len2 = inproduct(ab, ab);
    const segLen = Math.sqrt(len2);
    const t = len2 > 0 ? Math.max(0, Math.min(1, inproduct(aftrekken(p, a), ab) / len2)) : 0;
    const voet = optellen(a, schaal(ab, t));
    const d = afstand(p, voet);
    if (d < beste.loodrechtM) beste = { afstandLangsM: gelopen + t * segLen, loodrechtM: d, punt: voet };
    gelopen += segLen;
  }
  return beste;
}

/** Punt op afstand s (meters) vanaf het begin van een polylijn */
export function puntOpLijn(lijn: XY[], s: number): XY {
  if (lijn.length === 0) throw new Error('Lege lijn');
  if (s <= 0) return lijn[0];
  let gelopen = 0;
  for (let i = 1; i < lijn.length; i++) {
    const segLen = afstand(lijn[i - 1], lijn[i]);
    if (gelopen + segLen >= s) {
      const t = segLen > 0 ? (s - gelopen) / segLen : 0;
      return optellen(lijn[i - 1], schaal(aftrekken(lijn[i], lijn[i - 1]), t));
    }
    gelopen += segLen;
  }
  return lijn[lijn.length - 1];
}

// ---------------------------------------------------------------------------
// Perceelgeometrie
// ---------------------------------------------------------------------------

type PerceelGeometrie = GeoJSON.Polygon | GeoJSON.MultiPolygon;

/**
 * parcels.geometry is jsonb met (meestal) een JSON-string erin (dubbel gecodeerd).
 * Accepteert string of object; geeft null als het geen (Multi)Polygon is.
 */
export function parseGeometrie(raw: unknown): PerceelGeometrie | null {
  let g: unknown = raw;
  for (let i = 0; i < 2 && typeof g === 'string'; i++) {
    try {
      g = JSON.parse(g);
    } catch {
      return null;
    }
  }
  if (!g || typeof g !== 'object') return null;
  const obj = g as { type?: unknown; coordinates?: unknown };
  if ((obj.type === 'Polygon' || obj.type === 'MultiPolygon') && Array.isArray(obj.coordinates)) {
    return obj as PerceelGeometrie;
  }
  return null;
}

/** Signed area (schoenveter); positief = tegen de klok in */
function ringOppervlak(ring: XY[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return a / 2;
}

function ringZwaartepunt(ring: XY[]): { cx: number; cy: number; a: number } {
  // Rond een lokaal ankerpunt rekenen voor numerieke stabiliteit (RD-getallen zijn groot)
  const [ox, oy] = ring[0];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x0 = ring[j][0] - ox;
    const y0 = ring[j][1] - oy;
    const x1 = ring[i][0] - ox;
    const y1 = ring[i][1] - oy;
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return { cx: ox, cy: oy, a: 0 };
  return { cx: ox + cx / (6 * a), cy: oy + cy / (6 * a), a };
}

/** Zet een GeoJSON (Multi)Polygon om naar RD met zwaartepunt, bbox en oppervlak. */
export function perceelNaarRD(geometry: PerceelGeometrie): PerceelRD {
  const polys: number[][][][] = geometry.type === 'Polygon'
    ? [geometry.coordinates as number[][][]]
    : (geometry.coordinates as number[][][][]);

  const polygonen: XY[][][] = polys.map(poly =>
    poly.map(ring => {
      const pts = ring.map(c => naarRD([c[0], c[1]]));
      // sluitpunt weghalen (eerste == laatste)
      if (pts.length > 1 && afstand(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
      return pts;
    }).filter(ring => ring.length >= 3)
  ).filter(poly => poly.length > 0);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let totA = 0, sx = 0, sy = 0;
  for (const poly of polygonen) {
    poly.forEach((ring, idx) => {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      const { cx, cy, a } = ringZwaartepunt(ring);
      // buitenrand telt positief, gaten negatief — ongeacht de oriëntatie in de bron
      const w = idx === 0 ? Math.abs(a) : -Math.abs(a);
      totA += w;
      sx += cx * w;
      sy += cy * w;
    });
  }

  const zwaartepunt: XY = totA > 0
    ? [sx / totA, sy / totA]
    : [(minX + maxX) / 2, (minY + maxY) / 2];

  return {
    polygonen,
    zwaartepunt,
    bbox: [minX, minY, maxX, maxY],
    oppervlakM2: Math.max(0, totA),
  };
}

/** Punt-in-polygoon (even-odd, met gaten) */
export function puntInPerceel(p: XY, perceel: PerceelRD): boolean {
  let binnen = false;
  for (const poly of perceel.polygonen) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
          binnen = !binnen;
        }
      }
    }
  }
  return binnen;
}

export { ringOppervlak };
