/**
 * Rijenkaart — rijdetectie-tests (synthetische streepbeelden)
 * Run with: npx tsx src/__tests__/rijen-detectie.test.ts
 *
 * Tests for: naarGrijs, naarGroenindex, maakMasker (oppervlak + erosie), detecteerRijen (richting ±1°,
 * rijafstand ±5 cm, fase ±0,25 m mod s, ruis onder de drempel — ook op kleine percelen met korrelige textuur —,
 * twee rijrichtingen, rijafstand buiten het bereik, foute verwachting, looptijd), samenhang met genereerRijen,
 * beeldVenster, pdokWmsUrl en het browserpad detecteerVoorPerceel/haalLuchtfotoOp (fetch, createImageBitmap
 * en OffscreenCanvas nagebootst; succes, foutcodes, XML-fout, geen verbinding, timeout, afbreken).
 */

import assert from 'node:assert';
import {
  DETECTIE_DREMPEL,
  detecteerRijen,
  maakMasker,
  naarGrijs,
  naarGroenindex,
  vouwProfiel,
} from '../lib/rijen/detectie';
import { beeldVenster, detecteerVoorPerceel, haalLuchtfotoOp, pdokWmsUrl, PDOK_LAGEN } from '../lib/rijen/pdok';
import type { BeeldVenster } from '../lib/rijen/pdok';
import { genereerRijen } from '../lib/rijen/generatie';
import { naarWGS, perceelNaarRD, puntInPerceel } from '../lib/rijen/geo';
import type { PerceelRD, XY } from '../lib/rijen/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

const asyncTests: { name: string; fn: () => Promise<void> }[] = [];
function testAsync(name: string, fn: () => Promise<void>) {
  asyncTests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

/** Deterministische PRNG (mulberry32) */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd: () => number): () => number {
  return () => {
    const u = Math.max(1e-12, rnd());
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** Perceel in RD via WGS84-GeoJSON → perceelNaarRD (zoals de app het doet) */
function perceelUitRD(ring: XY[]): PerceelRD {
  const coords = ring.map(p => naarWGS(p));
  coords.push(coords[0]);
  return perceelNaarRD({ type: 'Polygon', coordinates: [coords] });
}

/** Kleinste verschil tussen twee rij-assen (180°-periodiek) */
function asVerschil(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

/** Faseverschil modulo s, rekening houdend met een omgeklapte normaal als θ over 0/180 wikkelt */
function faseVerschil(det: { richtingGraden: number; faseM: number }, waarHoek: number, waarFase: number, s: number): number {
  const d = Math.abs(det.richtingGraden - waarHoek) % 360;
  const omgeklapt = d > 90 && d < 270;
  const fase = omgeklapt ? -det.faseM : det.faseM;
  const r = (((fase - waarFase) % s) + s) % s;
  return Math.min(r, s - r);
}

interface Synthetisch {
  grijs: Float32Array;
  rgba: Uint8ClampedArray;
  breedte: number;
  hoogte: number;
  pixelM: number;
  origineRD: XY;
  perceel: PerceelRD;
}

const ORIGINE: XY = [150000, 400000];
const PIXEL = 0.25;
const W = 1200;
const H = 900;

/** Scheve vierhoek binnen het beeld (≥ 15 m van de rand) */
const SCHEVE_RING: XY[] = [
  [ORIGINE[0] + 22, ORIGINE[1] - 30],
  [ORIGINE[0] + 270, ORIGINE[1] - 17],
  [ORIGINE[0] + 283, ORIGINE[1] - 200],
  [ORIGINE[0] + 40, ORIGINE[1] - 208],
];

/**
 * Streepbeeld: donkere boomstroken (σ 0,45 m) op `fase + k·s` langs de normaal, bomen elke 0,9 m,
 * een helderheidsgradiënt, gaussische ruis, een felle schuur binnen het perceel en buiten het perceel een
 * sterk storend streeppatroon in een andere richting (moet door het masker wegvallen).
 */
function maakStrepen(hoek: number, s: number, fase: number, seed: number, ruisSigma = 25): Synthetisch {
  const perceel = perceelUitRD(SCHEVE_RING);
  const z = perceel.zwaartepunt;
  const nx = Math.cos(hoek * RAD);
  const ny = -Math.sin(hoek * RAD);
  const dx = Math.sin(hoek * RAD);
  const dy = Math.cos(hoek * RAD);
  const storingHoek = hoek + 50;
  const snx = Math.cos(storingHoek * RAD);
  const sny = -Math.sin(storingHoek * RAD);
  const g = gauss(prng(seed));
  const grijs = new Float32Array(W * H);
  const rgba = new Uint8ClampedArray(W * H * 4);
  const schuur = [ORIGINE[0] + 120, ORIGINE[1] - 110, ORIGINE[0] + 135, ORIGINE[1] - 98]; // x0,y0,x1,y1
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = ORIGINE[0] + (i + 0.5) * PIXEL;
      const y = ORIGINE[1] - (j + 0.5) * PIXEL;
      const px = x - z[0];
      const py = y - z[1];
      const t = px * nx + py * ny;
      const u = px * dx + py * dy;
      const k = Math.round((t - fase) / s);
      const delta = t - fase - k * s;
      const du = u - 0.9 * Math.round(u / 0.9);
      let v = 140 - 50 * Math.exp(-(delta * delta) / (2 * 0.45 * 0.45));
      v -= 25 * Math.exp(-(du * du + delta * delta) / (2 * 0.2 * 0.2));
      v += 0.04 * (i - W / 2);
      // buiten het perceel: storende strepen (2,8 m, andere richting)
      if (!puntInPerceel([x, y], perceel)) {
        const ts = px * snx + py * sny;
        v = 120 + 60 * Math.cos((2 * Math.PI * ts) / 2.8);
      }
      if (x > schuur[0] && x < schuur[2] && y > schuur[1] && y < schuur[3]) v = 250;
      v += ruisSigma * g();
      const c = Math.max(0, Math.min(255, v));
      const idx = j * W + i;
      grijs[idx] = c;
      rgba[idx * 4] = c;
      rgba[idx * 4 + 1] = c;
      rgba[idx * 4 + 2] = c;
      rgba[idx * 4 + 3] = 255;
    }
  }
  return { grijs, rgba, breedte: W, hoogte: H, pixelM: PIXEL, origineRD: ORIGINE, perceel };
}

function detecteer(beeld: Synthetisch, verwacht?: number | null) {
  const masker = maakMasker(beeld.perceel, beeld.breedte, beeld.hoogte, beeld.pixelM, beeld.origineRD, 3);
  return detecteerRijen({
    grijs: beeld.grijs,
    breedte: beeld.breedte,
    hoogte: beeld.hoogte,
    pixelM: beeld.pixelM,
    origineRD: beeld.origineRD,
    masker,
    zwaartepuntRD: beeld.perceel.zwaartepunt,
    verwachteRijafstandM: verwacht ?? null,
    bronBeeld: 'synthetisch',
  });
}

// ---------------------------------------------------------------------------
// Beeldhulpjes
// ---------------------------------------------------------------------------

console.log('\nBeeldhulpjes:');

test('naarGrijs: Rec. 601-helderheid', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 100, 100, 100, 255]);
  const g = naarGrijs(rgba, 4, 1);
  assert.ok(Math.abs(g[0] - 76.245) < 0.01);
  assert.ok(Math.abs(g[1] - 149.685) < 0.01);
  assert.ok(Math.abs(g[2] - 29.07) < 0.01);
  assert.ok(Math.abs(g[3] - 100) < 0.01);
});

test('naarGroenindex: gras positief, beige/grijs ≤ 0', () => {
  const rgba = new Uint8ClampedArray([90, 130, 70, 255, 160, 150, 130, 255, 100, 100, 100, 255]);
  const g = naarGroenindex(rgba, 3, 1);
  assert.ok(g[0] > 15, `gras ${g[0]}`);
  assert.ok(g[1] < 5 && g[1] < g[0] / 3, `beige ${g[1]}`);
  assert.ok(Math.abs(g[2]) < 1e-6);
});

console.log('\nMasker:');

test('maakMasker zonder erosie: oppervlak ≈ perceeloppervlak', () => {
  const perceel = perceelUitRD(SCHEVE_RING);
  const m = maakMasker(perceel, W, H, PIXEL, ORIGINE, 0);
  let n = 0;
  for (let k = 0; k < m.length; k++) n += m[k];
  const opp = n * PIXEL * PIXEL;
  assert.ok(Math.abs(opp - perceel.oppervlakM2) / perceel.oppervlakM2 < 0.005, `${opp} vs ${perceel.oppervlakM2}`);
});

test('maakMasker met erosie 3 m: geen pixel binnen 3 m van de rand, binnenkant intact', () => {
  const perceel = perceelUitRD(SCHEVE_RING);
  const m = maakMasker(perceel, W, H, PIXEL, ORIGINE, 3);
  const ring = perceel.polygonen[0][0];
  const afstRand = (p: XY) => {
    let best = Infinity;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [x0, y0] = ring[b];
      const [x1, y1] = ring[a];
      const vx = x1 - x0;
      const vy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((p[0] - x0) * vx + (p[1] - y0) * vy) / (vx * vx + vy * vy)));
      best = Math.min(best, Math.hypot(p[0] - x0 - t * vx, p[1] - y0 - t * vy));
    }
    return best;
  };
  let fout = 0;
  let gemist = 0;
  for (let j = 0; j < H; j += 3) {
    for (let i = 0; i < W; i += 3) {
      const p: XY = [ORIGINE[0] + (i + 0.5) * PIXEL, ORIGINE[1] - (j + 0.5) * PIXEL];
      const binnen = puntInPerceel(p, perceel);
      const d = afstRand(p);
      if (m[j * W + i] && (!binnen || d < 3 - 1e-6)) fout++;
      if (!m[j * W + i] && binnen && d > 3 * Math.SQRT2 + PIXEL) gemist++;
    }
  }
  assert.strictEqual(fout, 0, `${fout} pixels te dicht bij de rand`);
  assert.strictEqual(gemist, 0, `${gemist} binnenpixels onterecht weg`);
});

test('maakMasker: MultiPolygon met gat', () => {
  const o = ORIGINE;
  const vierkant = (x: number, y: number, z: number): number[][] => [
    naarWGS([o[0] + x, o[1] - y]), naarWGS([o[0] + x + z, o[1] - y]),
    naarWGS([o[0] + x + z, o[1] - y - z]), naarWGS([o[0] + x, o[1] - y - z]), naarWGS([o[0] + x, o[1] - y]),
  ];
  const perceel = perceelNaarRD({
    type: 'MultiPolygon',
    coordinates: [[vierkant(10, 10, 100), vierkant(40, 40, 20)], [vierkant(150, 50, 50)]],
  });
  const m = maakMasker(perceel, W, H, PIXEL, ORIGINE, 0);
  let n = 0;
  for (let k = 0; k < m.length; k++) n += m[k];
  const opp = n * PIXEL * PIXEL;
  assert.ok(Math.abs(opp - (10000 - 400 + 2500)) < 30, `oppervlak ${opp}`);
  // middelpunt van het gat is leeg
  const i = Math.floor(50 / PIXEL);
  const j = Math.floor(50 / PIXEL);
  assert.strictEqual(m[j * W + i], 0);
});

test('maakMasker 2000×2000 < 1 s', () => {
  const perceel = perceelUitRD([[ORIGINE[0] + 5, ORIGINE[1] - 5], [ORIGINE[0] + 495, ORIGINE[1] - 20], [ORIGINE[0] + 480, ORIGINE[1] - 490], [ORIGINE[0] + 10, ORIGINE[1] - 470]]);
  const t = Date.now();
  maakMasker(perceel, 2000, 2000, 0.25, ORIGINE, 3);
  const ms = Date.now() - t;
  console.log(`    (masker 2000×2000: ${ms} ms)`);
  assert.ok(ms < 1000, `${ms} ms`);
});

// ---------------------------------------------------------------------------
// Detectie
// ---------------------------------------------------------------------------

console.log('\nDetectie (synthetisch, 1200×900 px, 0,25 m/px, ruis σ=25):');

const gevallen: { hoek: number; s: number; fase: number; verwacht?: number }[] = [
  { hoek: 0, s: 3.0, fase: 0.7 },
  { hoek: 37.5, s: 3.25, fase: 2.1 },
  { hoek: 90, s: 3.0, fase: 1.4 },
  { hoek: 123.4, s: 3.25, fase: 0.2 },
  { hoek: 162, s: 3.5, fase: 3.1 },
  { hoek: 64.3, s: 3.0, fase: 2.95, verwacht: 3.0 },
];

const duren: number[] = [];
gevallen.forEach((g, idx) => {
  test(`θ=${g.hoek}°, s=${g.s} m, fase=${g.fase} m${g.verwacht ? ' (verwacht 3,0)' : ''}`, () => {
    const beeld = maakStrepen(g.hoek, g.s, g.fase, 1000 + idx);
    const r = detecteer(beeld, g.verwacht);
    duren.push(r.duurMs);
    const dHoek = asVerschil(r.richtingGraden, g.hoek);
    const dS = Math.abs(r.rijafstandM - g.s);
    const dF = faseVerschil(r, g.hoek, g.fase, g.s);
    console.log(`    → θ=${r.richtingGraden}° s=${r.rijafstandM} fase=${r.faseM} conf=${r.confidence} ` +
      `(Δθ=${dHoek.toFixed(3)}° Δs=${(dS * 100).toFixed(2)} cm Δfase=${dF.toFixed(3)} m, ${r.duurMs} ms)`);
    assert.ok(dHoek <= 1, `hoek ${r.richtingGraden} vs ${g.hoek}`);
    assert.ok(dS <= 0.05, `rijafstand ${r.rijafstandM} vs ${g.s}`);
    assert.ok(dF <= 0.25, `fase ${r.faseM} vs ${g.fase} (Δ ${dF})`);
    assert.ok(r.richtingGraden >= 0 && r.richtingGraden < 180, 'richting in [0,180)');
    assert.ok(r.faseM >= 0 && r.faseM < r.rijafstandM, 'fase in [0,s)');
    assert.ok(r.confidence >= DETECTIE_DREMPEL, `confidence ${r.confidence} < drempel`);
    assert.strictEqual(r.voldoende, true);
    assert.strictEqual(r.bronBeeld, 'synthetisch');
  });
});

test('zwakke strepen in zware ruis (σ=60) worden nog gevonden', () => {
  const beeld = maakStrepen(17, 3.25, 1.0, 77, 60);
  const r = detecteer(beeld);
  console.log(`    → θ=${r.richtingGraden}° s=${r.rijafstandM} conf=${r.confidence}`);
  assert.ok(asVerschil(r.richtingGraden, 17) <= 1);
  assert.ok(Math.abs(r.rijafstandM - 3.25) <= 0.05);
});

test('pure ruis (+ gradiënt + vlekken) → confidence onder de drempel', () => {
  const perceel = perceelUitRD(SCHEVE_RING);
  for (const seed of [5, 6, 7]) {
    const g = gauss(prng(seed));
    const grijs = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const vlek = Math.sin(i / 37) * Math.cos(j / 23) * 20; // laagfrequente structuur
        grijs[j * W + i] = 128 + 0.05 * i + vlek + 30 * g();
      }
    }
    const masker = maakMasker(perceel, W, H, PIXEL, ORIGINE, 3);
    const r = detecteerRijen({ grijs, breedte: W, hoogte: H, pixelM: PIXEL, origineRD: ORIGINE, masker, zwaartepuntRD: perceel.zwaartepunt });
    console.log(`    → ruis seed ${seed}: conf=${r.confidence} (autocorr ${r.diagnostiek?.autocorrelatie}, piek/achtergrond ${r.diagnostiek?.piekAchtergrond})`);
    assert.ok(r.confidence < DETECTIE_DREMPEL, `confidence ${r.confidence}`);
    assert.strictEqual(r.voldoende, false);
  }
});

test('lege/te kleine maskers geven een nette onvoldoende-uitslag', () => {
  const grijs = new Float32Array(100 * 100).fill(100);
  const r = detecteerRijen({ grijs, breedte: 100, hoogte: 100, pixelM: 0.25, origineRD: ORIGINE, masker: new Uint8Array(100 * 100), zwaartepuntRD: ORIGINE });
  assert.strictEqual(r.voldoende, false);
  assert.strictEqual(r.confidence, 0);
});

test('fase-diagnostiek: halve-rij-contrast is negatief bij één donkere strook', () => {
  const beeld = maakStrepen(45, 3.0, 1.0, 4242);
  const r = detecteer(beeld);
  const c = Number(r.diagnostiek?.contrastRij);
  const ch = Number(r.diagnostiek?.contrastHalveRij);
  assert.ok(c > 0.3, `contrastRij ${c}`);
  assert.ok(ch < 0, `contrastHalveRij ${ch}`);
  assert.strictEqual(r.diagnostiek?.halveRijTwijfel, false);
  const alt = Number(r.diagnostiek?.faseAlternatiefM);
  const verschil = Math.abs(((alt - r.faseM + r.rijafstandM) % r.rijafstandM) - r.rijafstandM / 2);
  assert.ok(verschil < 1e-3);
});

test('vouwProfiel: minimum op de donkere strook', () => {
  const beeld = maakStrepen(110, 3.25, 2.4, 99, 10);
  const m = maakMasker(beeld.perceel, W, H, PIXEL, ORIGINE, 3);
  const v = vouwProfiel(beeld.grijs, m, W, H, PIXEL, ORIGINE, beeld.perceel.zwaartepunt, 110, 3.25);
  const d = Math.abs(v.minimumM - 2.4);
  assert.ok(Math.min(d, 3.25 - d) < 0.1, `minimum ${v.minimumM}`);
});

test('voorjaarsbeeld (RGB): beige herbicidestrook lichter dan gras → minstGroen vindt de rij, donker niet', () => {
  // boomstrook beige (licht, niet groen), gras ertussen groen en donkerder — zoals PDOK orthoHR
  const hoek = 72;
  const s = 3.25;
  const fase = 1.1;
  const perceel = perceelUitRD(SCHEVE_RING);
  const z = perceel.zwaartepunt;
  const nx = Math.cos(hoek * RAD);
  const ny = -Math.sin(hoek * RAD);
  const g = gauss(prng(31));
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const t = (ORIGINE[0] + (i + 0.5) * PIXEL - z[0]) * nx + (ORIGINE[1] - (j + 0.5) * PIXEL - z[1]) * ny;
      const delta = t - fase - s * Math.round((t - fase) / s);
      const strook = Math.exp(-(delta * delta) / (2 * 0.35 * 0.35)); // 1 op de boomrij
      const o = (j * W + i) * 4;
      rgba[o] = 95 + 70 * strook + 12 * g();
      rgba[o + 1] = 125 + 30 * strook + 12 * g();
      rgba[o + 2] = 75 + 60 * strook + 12 * g();
      rgba[o + 3] = 255;
    }
  }
  const grijs = naarGrijs(rgba, W, H);
  const groen = naarGroenindex(rgba, W, H);
  const masker = maakMasker(perceel, W, H, PIXEL, ORIGINE, 3);
  const basis = { grijs, groen, breedte: W, hoogte: H, pixelM: PIXEL, origineRD: ORIGINE, masker, zwaartepuntRD: z };
  const voorjaar = detecteerRijen({ ...basis, rijKenmerk: 'minstGroen' });
  const donker = detecteerRijen({ ...basis, rijKenmerk: 'donker' });
  const zonderGroen = detecteerRijen({ ...basis, groen: null, rijKenmerk: 'minstGroen' });
  assert.ok(asVerschil(voorjaar.richtingGraden, hoek) <= 1);
  assert.ok(faseVerschil(voorjaar, hoek, fase, s) <= 0.25, `minstGroen fase ${voorjaar.faseM}`);
  assert.ok(faseVerschil(donker, hoek, fase, s) >= s / 2 - 0.25, `donker zou een halve rij ernaast moeten liggen: ${donker.faseM}`);
  assert.strictEqual(voorjaar.diagnostiek?.rijKenmerk, 'minstGroen');
  assert.strictEqual(zonderGroen.diagnostiek?.rijKenmerk, 'donker', 'zonder groenindex valt minstGroen terug op donker');
});

// ---------------------------------------------------------------------------
// Robuustheid (gevonden in de review op echte percelen)
// ---------------------------------------------------------------------------

console.log('\nRobuustheid:');

/** Ruis, optioneel gladgestreken met een box van straal r px (korrelige textuur zonder rijen) */
function ruisBeeld(w: number, h: number, seed: number, r: number): Float32Array {
  const g = gauss(prng(seed));
  const a = new Float32Array(w * h);
  for (let k = 0; k < a.length; k++) a[k] = 128 + 30 * g();
  if (r <= 0) return a;
  const t = new Float32Array(w * h);
  const u = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let som = 0;
      let n = 0;
      for (let d = -r; d <= r; d++) if (i + d >= 0 && i + d < w) { som += a[j * w + i + d]; n++; }
      t[j * w + i] = som / n;
    }
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let som = 0;
      let n = 0;
      for (let d = -r; d <= r; d++) if (j + d >= 0 && j + d < h) { som += t[(j + d) * w + i]; n++; }
      u[j * w + i] = som / n;
    }
  }
  return u;
}

test('kleine percelen (0,08–0,16 ha) met korrelige textuur zonder rijen → onder de drempel', () => {
  // vóór de significantie-factor scoorden 6 van deze 24 gevallen 0,32–0,64 ('voldoende')
  let hoogste = 0;
  const teHoog: string[] = [];
  let zonderReden = 0;
  for (const [b, hh] of [[30, 25], [45, 35]] as const) {
    const w = Math.ceil((b + 20) / PIXEL);
    const h = Math.ceil((hh + 20) / PIXEL);
    const perceel = perceelUitRD([[ORIGINE[0] + 10, ORIGINE[1] - 10], [ORIGINE[0] + 10 + b, ORIGINE[1] - 10],
      [ORIGINE[0] + 10 + b, ORIGINE[1] - 10 - hh], [ORIGINE[0] + 10, ORIGINE[1] - 10 - hh]]);
    const masker = maakMasker(perceel, w, h, PIXEL, ORIGINE, 3);
    for (const r of [0, 2, 4, 8]) {
      for (const seed of [1, 2, 3]) {
        const grijs = ruisBeeld(w, h, seed * 31 + r, r);
        const res = detecteerRijen({ grijs, breedte: w, hoogte: h, pixelM: PIXEL, origineRD: ORIGINE, masker, zwaartepuntRD: perceel.zwaartepunt });
        hoogste = Math.max(hoogste, res.confidence);
        if (res.voldoende) teHoog.push(`${b}×${hh} m blur ${r} seed ${seed}: ${res.confidence}`);
        else if (typeof res.diagnostiek?.reden !== 'string') zonderReden++;
      }
    }
  }
  console.log(`    (hoogste confidence ${hoogste})`);
  assert.strictEqual(teHoog.length, 0, `ruis als 'voldoende': ${teHoog.join('; ')}`);
  assert.strictEqual(zonderReden, 0, `${zonderReden} keer onvoldoende zonder reden voor de UI`);
});

test('twee blokken met verschillende rijrichting → onvoldoende + meerdereRichtingen', () => {
  // links rijen op 30°, rechts op 120° (zoals perceel 'Thuis'): één richting past maar op de helft
  const perceel = perceelUitRD(SCHEVE_RING);
  const z = perceel.zwaartepunt;
  const g = gauss(prng(55));
  const grijs = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = ORIGINE[0] + (i + 0.5) * PIXEL - z[0];
      const y = ORIGINE[1] - (j + 0.5) * PIXEL - z[1];
      const hoek = x < 0 ? 30 : 120;
      const s = x < 0 ? 3.0 : 3.25;
      const t = x * Math.cos(hoek * RAD) - y * Math.sin(hoek * RAD);
      const d = t - s * Math.round(t / s);
      grijs[j * W + i] = 140 - 50 * Math.exp(-(d * d) / (2 * 0.45 * 0.45)) + 25 * g();
    }
  }
  const masker = maakMasker(perceel, W, H, PIXEL, ORIGINE, 3);
  const r = detecteerRijen({ grijs, breedte: W, hoogte: H, pixelM: PIXEL, origineRD: ORIGINE, masker, zwaartepuntRD: z });
  console.log(`    → θ=${r.richtingGraden}° conf=${r.confidence} significantie=${r.diagnostiek?.significantie} ` +
    `tweede=${r.diagnostiek?.tweedeRichtingGraden}° reden='${r.diagnostiek?.reden}'`);
  assert.ok(asVerschil(r.richtingGraden, 30) <= 1 || asVerschil(r.richtingGraden, 120) <= 1, `richting ${r.richtingGraden}`);
  assert.strictEqual(r.voldoende, false, `voldoende met confidence ${r.confidence} terwijl de rijen maar op de helft passen`);
  assert.strictEqual(r.diagnostiek?.meerdereRichtingen, true);
  const tweede = Number(r.diagnostiek?.tweedeRichtingGraden);
  assert.ok(asVerschil(tweede, asVerschil(r.richtingGraden, 30) <= 1 ? 120 : 30) <= 2, `tweede richting ${tweede}`);
  assert.ok(String(r.diagnostiek?.reden).startsWith('Meerdere rijrichtingen'));
});

test('rijafstand 4,3 m (oudere boomgaard) zonder verwachting wordt gevonden', () => {
  const beeld = maakStrepen(64, 4.3, 1.2, 8);
  const r = detecteer(beeld);
  console.log(`    → θ=${r.richtingGraden}° s=${r.rijafstandM} fase=${r.faseM} conf=${r.confidence}`);
  assert.ok(asVerschil(r.richtingGraden, 64) <= 1);
  assert.ok(Math.abs(r.rijafstandM - 4.3) <= 0.05, `s ${r.rijafstandM}`);
  assert.ok(faseVerschil(r, 64, 1.2, 4.3) <= 0.25);
  assert.strictEqual(r.voldoende, true);
});

test('rijafstand buiten het bereik (2,2 m en 5,4 m) → nooit voldoende met een verkeerde afstand', () => {
  for (const s of [2.2, 5.4]) {
    const r = detecteer(maakStrepen(41, s, 0.9, 12));
    console.log(`    → echt ${s} m: s=${r.rijafstandM} conf=${r.confidence} opRand=${r.diagnostiek?.opRandZoekbereik} reden='${r.diagnostiek?.reden}'`);
    if (r.voldoende) assert.ok(Math.abs(r.rijafstandM - s) <= 0.05, `voldoende met s=${r.rijafstandM} (echt ${s})`);
    // met de juiste verwachting lukt het wel
    const v = detecteer(maakStrepen(41, s, 0.9, 12), s);
    assert.ok(v.voldoende && Math.abs(v.rijafstandM - s) <= 0.05, `met verwachting: s=${v.rijafstandM} conf=${v.confidence}`);
  }
});

test('echte top precies op de rand van het bereik (2,50 m) wordt niet afgekeurd', () => {
  const r = detecteer(maakStrepen(12, 2.5, 0.4, 21));
  assert.ok(Math.abs(r.rijafstandM - 2.5) <= 0.05, `s ${r.rijafstandM}`);
  assert.strictEqual(r.diagnostiek?.opRandZoekbereik, false);
  assert.strictEqual(r.voldoende, true);
});

test('foute of onzinnige verwachte rijafstand: geen NaN, terugval op het standaardbereik', () => {
  const beeld = maakStrepen(33, 3.6, 1.0, 9);
  const zonder = detecteer(beeld);
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0.66, 50]) {
    const r = detecteer(beeld, v);
    assert.ok(Number.isFinite(r.rijafstandM) && Number.isFinite(r.faseM) && Number.isFinite(r.richtingGraden), `verwacht ${v}`);
    assert.strictEqual(r.rijafstandM, zonder.rijafstandM, `verwacht ${v}: ${r.rijafstandM}`);
    assert.strictEqual(r.diagnostiek?.verwachtGenegeerd, true);
  }
  // plausibel maar fout (2,8 m terwijl het 3,6 is; ±15 % = 2,38–3,22): toch de echte afstand
  const fout = detecteer(beeld, 2.8);
  console.log(`    → verwacht 2,8, echt 3,6: s=${fout.rijafstandM} conf=${fout.confidence} verlaten=${fout.diagnostiek?.verwachtVerlaten}`);
  assert.ok(Math.abs(fout.rijafstandM - 3.6) <= 0.05, `s ${fout.rijafstandM}`);
  assert.strictEqual(fout.diagnostiek?.verwachtVerlaten, true);
  assert.strictEqual(fout.voldoende, true);
});

test('samenhang met genereerRijen: gegenereerde rijen liggen op de boomstroken (ook bij θ ≈ 180°)', () => {
  for (const [hoek, s, fase] of [[123.4, 3.25, 0.2], [179.7, 3.0, 2.2], [0.3, 3.5, 1.0]] as const) {
    const beeld = maakStrepen(hoek, s, fase, 300 + hoek);
    const r = detecteer(beeld);
    const rijen = genereerRijen(beeld.perceel, {
      richtingGraden: r.richtingGraden, rijafstandM: r.rijafstandM, faseM: r.faseM, kopakkerBeginM: 0, kopakkerEindM: 0,
    });
    assert.ok(rijen.length > 40, `${rijen.length} rijen`);
    const z = beeld.perceel.zwaartepunt;
    const nx = Math.cos(hoek * RAD);
    const ny = -Math.sin(hoek * RAD);
    let slechtste = 0;
    for (const rij of rijen) {
      for (const p of [rij.coordsRD[0], rij.coordsRD[rij.coordsRD.length - 1]]) {
        // positie t.o.v. de ECHTE (gesimuleerde) strook, met de echte normaal
        const t = (p[0] - z[0]) * nx + (p[1] - z[1]) * ny - fase;
        slechtste = Math.max(slechtste, Math.abs(t - s * Math.round(t / s)));
      }
    }
    console.log(`    → θ=${hoek}°: ${rijen.length} rijen, grootste afwijking ${slechtste.toFixed(3)} m`);
    assert.ok(slechtste <= 0.25, `rij ${slechtste.toFixed(3)} m naast de strook`);
  }
});

test(`looptijd synthetisch < 3 s per beeld`, () => {
  const max = Math.max(...duren);
  const gem = duren.reduce((a, b) => a + b, 0) / Math.max(1, duren.length);
  console.log(`    (detectie: gemiddeld ${gem.toFixed(0)} ms, max ${max} ms)`);
  assert.ok(max < 3000, `${max} ms`);
});

// ---------------------------------------------------------------------------
// PDOK-venster en URL
// ---------------------------------------------------------------------------

console.log('\nPDOK:');

test('beeldVenster: marge 10 m, 0,25 m/px, origine linksboven', () => {
  const perceel = perceelUitRD(SCHEVE_RING);
  const v = beeldVenster(perceel);
  const [minX, minY, maxX, maxY] = perceel.bbox;
  assert.ok(v.bbox[0] <= minX - 10 + 1e-6 && v.bbox[2] >= maxX + 10 - 1e-6);
  assert.ok(v.bbox[1] <= minY - 10 + 1e-6 && v.bbox[3] >= maxY + 10 - 1e-6);
  assert.strictEqual(v.pixelM, 0.25);
  assert.ok(Math.abs((v.bbox[2] - v.bbox[0]) / v.breedte - v.pixelM) < 1e-9);
  assert.ok(Math.abs((v.bbox[3] - v.bbox[1]) / v.hoogte - v.pixelM) < 1e-9);
  assert.deepStrictEqual(v.origineRD, [v.bbox[0], v.bbox[3]]);
});

test('beeldVenster: groot perceel → grotere pixel, max 2500 px (WMS-limiet)', () => {
  const groot = perceelUitRD([[ORIGINE[0], ORIGINE[1]], [ORIGINE[0] + 1200, ORIGINE[1]], [ORIGINE[0] + 1200, ORIGINE[1] - 300], [ORIGINE[0], ORIGINE[1] - 300]]);
  const v = beeldVenster(groot);
  assert.ok(v.breedte <= 2500 && v.hoogte <= 2500, `${v.breedte}×${v.hoogte}`);
  assert.ok(v.pixelM > 0.25);
  assert.ok(Math.abs((v.bbox[2] - v.bbox[0]) / v.breedte - v.pixelM) < 1e-9);
});

test('pdokWmsUrl: WMS 1.3.0, EPSG:28992, BBOX x,y-volgorde, JPEG', () => {
  const url = new URL(pdokWmsUrl([1000, 2000, 1100, 2050], 400, 200, PDOK_LAGEN.ortho25));
  const p = url.searchParams;
  assert.strictEqual(url.origin + url.pathname, 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0');
  assert.strictEqual(p.get('SERVICE'), 'WMS');
  assert.strictEqual(p.get('VERSION'), '1.3.0');
  assert.strictEqual(p.get('REQUEST'), 'GetMap');
  assert.strictEqual(p.get('LAYERS'), 'Actueel_ortho25');
  assert.strictEqual(p.get('STYLES'), '');
  assert.strictEqual(p.get('CRS'), 'EPSG:28992');
  assert.strictEqual(p.get('BBOX'), '1000,2000,1100,2050');
  assert.strictEqual(p.get('WIDTH'), '400');
  assert.strictEqual(p.get('HEIGHT'), '200');
  assert.strictEqual(p.get('FORMAT'), 'image/jpeg');
  assert.ok(new URL(pdokWmsUrl([1, 2, 3, 4], 10, 10)).searchParams.get('LAYERS') === 'Actueel_orthoHR');
});

// ---------------------------------------------------------------------------
// Browserpad (detecteerVoorPerceel / haalLuchtfotoOp) met nagebootste browser-API's
// ---------------------------------------------------------------------------

/** Voorjaarsbeeld (RGBA) voor een WMS-venster: beige herbicidestrook op de rij, groen gras ertussen */
function voorjaarRgba(v: BeeldVenster, perceel: PerceelRD, hoek: number, s: number, fase: number, seed: number): Uint8ClampedArray {
  const z = perceel.zwaartepunt;
  const nx = Math.cos(hoek * RAD);
  const ny = -Math.sin(hoek * RAD);
  const g = gauss(prng(seed));
  const rgba = new Uint8ClampedArray(v.breedte * v.hoogte * 4);
  for (let j = 0; j < v.hoogte; j++) {
    for (let i = 0; i < v.breedte; i++) {
      const t = (v.origineRD[0] + (i + 0.5) * v.pixelM - z[0]) * nx + (v.origineRD[1] - (j + 0.5) * v.pixelM - z[1]) * ny;
      const delta = t - fase - s * Math.round((t - fase) / s);
      const strook = Math.exp(-(delta * delta) / (2 * 0.35 * 0.35));
      const o = (j * v.breedte + i) * 4;
      rgba[o] = 95 + 70 * strook + 12 * g();
      rgba[o + 1] = 125 + 30 * strook + 12 * g();
      rgba[o + 2] = 75 + 60 * strook + 12 * g();
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

type NepFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** Zet fetch/createImageBitmap/OffscreenCanvas tijdelijk op een nagebootste versie (de 'JPEG' is ruwe RGBA). */
async function metNepBrowser(nepFetch: NepFetch, fn: (canvassen: { width: number; height: number }[]) => Promise<void>,
  opties?: { bitmapFaalt?: boolean }): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  const oud = { fetch: g.fetch, createImageBitmap: g.createImageBitmap, OffscreenCanvas: g.OffscreenCanvas };
  const canvassen: { width: number; height: number }[] = [];
  g.fetch = nepFetch;
  g.createImageBitmap = async (blob: Blob) => {
    if (opties?.bitmapFaalt) throw new Error('InvalidStateError');
    return { data: new Uint8ClampedArray(await blob.arrayBuffer()), close() {} };
  };
  g.OffscreenCanvas = class {
    constructor(public width: number, public height: number) {
      canvassen.push(this);
    }
    getContext() {
      let bron: { data: Uint8ClampedArray } | null = null;
      return {
        drawImage(b: { data: Uint8ClampedArray }) { bron = b; },
        getImageData() { return { data: bron!.data }; },
      };
    }
  };
  try {
    await fn(canvassen);
  } finally {
    g.fetch = oud.fetch;
    g.createImageBitmap = oud.createImageBitmap;
    g.OffscreenCanvas = oud.OffscreenCanvas;
  }
}

async function verwachtFout(p: Promise<unknown>, begin: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert.ok(m.startsWith(begin), `fout '${m}' begint niet met '${begin}'`);
    return;
  }
  assert.fail(`geen fout, verwacht '${begin}…'`);
}

const BP_PERCEEL = perceelUitRD(SCHEVE_RING);
const BP_VENSTER = beeldVenster(BP_PERCEEL);

testAsync('detecteerVoorPerceel: voortgang, URL, resultaat, bronBeeld en vrijgegeven canvas', async () => {
  const rgba = voorjaarRgba(BP_VENSTER, BP_PERCEEL, 72, 3.25, 1.1, 404);
  const urls: string[] = [];
  await metNepBrowser(async url => {
    urls.push(url);
    return new Response(rgba.buffer as ArrayBuffer, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }, async canvassen => {
    const stappen: string[] = [];
    const r = await detecteerVoorPerceel(BP_PERCEEL, { onVoortgang: stap => stappen.push(stap) });
    console.log(`    → θ=${r.richtingGraden}° s=${r.rijafstandM} fase=${r.faseM} conf=${r.confidence} (${r.duurMs} ms, ` +
      `ophalen ${r.diagnostiek?.ophaalMs}, rekenen ${r.diagnostiek?.rekenMs})`);
    assert.deepStrictEqual(stappen, ['Luchtfoto ophalen…', 'Rijen zoeken…']);
    assert.strictEqual(urls.length, 1);
    const p = new URL(urls[0]).searchParams;
    assert.strictEqual(p.get('LAYERS'), 'Actueel_orthoHR');
    assert.strictEqual(p.get('WIDTH'), String(BP_VENSTER.breedte));
    assert.strictEqual(p.get('HEIGHT'), String(BP_VENSTER.hoogte));
    assert.strictEqual(r.bronBeeld, 'PDOK Actueel_orthoHR');
    assert.strictEqual(r.diagnostiek?.rijKenmerk, 'minstGroen');
    assert.ok(asVerschil(r.richtingGraden, 72) <= 1);
    assert.ok(Math.abs(r.rijafstandM - 3.25) <= 0.05);
    assert.ok(faseVerschil(r, 72, 1.1, 3.25) <= 0.25, `fase ${r.faseM}`);
    assert.strictEqual(r.voldoende, true);
    assert.strictEqual(r.diagnostiek?.beeldBreedte, BP_VENSTER.breedte);
    assert.ok(canvassen.length === 1 && canvassen[0].width === 0 && canvassen[0].height === 0, 'canvasgeheugen niet vrijgegeven');
  });
});

testAsync('haalLuchtfotoOp: nette NL-fouten (foutcode, XML, geen verbinding, leeg, decoderen)', async () => {
  await metNepBrowser(async () => new Response('x', { status: 503 }), async () => {
    await verwachtFout(haalLuchtfotoOp(BP_VENSTER), 'Luchtfoto ophalen mislukt: PDOK gaf foutcode 503');
  });
  await metNepBrowser(async () => new Response('<ServiceExceptionReport/>', { status: 200, headers: { 'content-type': 'text/xml' } }), async () => {
    await verwachtFout(haalLuchtfotoOp(BP_VENSTER), 'PDOK gaf geen luchtfoto terug');
  });
  await metNepBrowser(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    await verwachtFout(haalLuchtfotoOp(BP_VENSTER), 'Luchtfoto ophalen mislukt: geen verbinding met PDOK');
  });
  await metNepBrowser(async () => new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'image/jpeg' } }), async () => {
    await verwachtFout(haalLuchtfotoOp(BP_VENSTER), 'PDOK gaf een leeg beeld terug');
  });
  // createImageBitmap faalt en er is geen <img> (node): nette melding i.p.v. een ruwe exception
  await metNepBrowser(async () => new Response(new Uint8Array(16), { status: 200, headers: { 'content-type': 'image/jpeg' } }), async () => {
    await verwachtFout(haalLuchtfotoOp(BP_VENSTER), 'Luchtfoto verwerken mislukt: Deze omgeving kan geen afbeeldingen decoderen.');
  }, { bitmapFaalt: true });
});

/** fetch die pas eindigt als hij wordt afgebroken */
const hangendeFetch: NepFetch = (_url, init) => new Promise((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});

testAsync('haalLuchtfotoOp: timeout en afbreken via signal', async () => {
  await metNepBrowser(hangendeFetch, async () => {
    const t = Date.now();
    await verwachtFout(haalLuchtfotoOp(BP_VENSTER, PDOK_LAGEN.orthoHR, { timeoutMs: 50 }), 'Luchtfoto ophalen duurde te lang');
    assert.ok(Date.now() - t < 2000);
  });
  await metNepBrowser(hangendeFetch, async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    const stappen: string[] = [];
    await verwachtFout(detecteerVoorPerceel(BP_PERCEEL, { signal: ac.signal, onVoortgang: s => stappen.push(s) }), 'Rijdetectie afgebroken.');
    assert.deepStrictEqual(stappen, ['Luchtfoto ophalen…']);
  });
});

testAsync('detecteerVoorPerceel: perceel zonder geometrie → nette fout', async () => {
  const leeg: PerceelRD = { polygonen: [], zwaartepunt: [0, 0], bbox: [Infinity, Infinity, -Infinity, -Infinity], oppervlakM2: 0 };
  await verwachtFout(detecteerVoorPerceel(leeg), 'Perceel heeft geen geldige geometrie');
});

// ---- Async tests + summary ----

(async () => {
  console.log('\nBrowserpad (nagebootste fetch/createImageBitmap/OffscreenCanvas):');
  for (const { name, fn } of asyncTests) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
