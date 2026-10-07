/**
 * Tests voor de rijverfijning (src/lib/rijen/verfijning.ts) en de werkelijke rijafstand per rij
 * (generatie.effectieveRijafstanden / verschuifRij) op synthetische beelden met bekende ligging.
 *
 * Run: npx tsx src/__tests__/rijen-verfijning.test.ts
 */

import assert from 'node:assert';
import { verfijnRijen } from '../lib/rijen/verfijning';
import { effectieveRijafstanden, verschuifRij } from '../lib/rijen/generatie';
import { naarRD, naarWGS } from '../lib/rijen/geo';
import type { LngLat, XY } from '../lib/rijen/types';

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

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

const RAD = Math.PI / 180;
const C: XY = [155000, 463000];

interface Scenario {
  theta: number;
  s: number;
  rijen: number;
  lengte: number;
  /** echte ligging van rij k (offset t.o.v. C langs n, als functie van t langs d) */
  echt: (k: number, t: number) => number;
  ruis: number;
  seed: number;
  /** rijen zonder zichtbare strook */
  onzichtbaar?: Set<number>;
}

/** Synthetisch groenindex-beeld: strook van 0,8 m breed (waarde 0) rond elke echte rij, gras 15, ruis */
function maakBeeld(sc: Scenario, pixelM = 0.1) {
  const d: XY = [Math.sin(sc.theta * RAD), Math.cos(sc.theta * RAD)];
  const n: XY = [Math.cos(sc.theta * RAD), -Math.sin(sc.theta * RAD)];
  const halfB = (sc.rijen * sc.s) / 2 + 8;
  const halfL = sc.lengte / 2 + 8;
  const hoeken: XY[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    hoeken.push([C[0] + a * halfL * d[0] + b * halfB * n[0], C[1] + a * halfL * d[1] + b * halfB * n[1]]);
  }
  const minX = Math.min(...hoeken.map(h => h[0]));
  const maxX = Math.max(...hoeken.map(h => h[0]));
  const minY = Math.min(...hoeken.map(h => h[1]));
  const maxY = Math.max(...hoeken.map(h => h[1]));
  const breedte = Math.ceil((maxX - minX) / pixelM);
  const hoogte = Math.ceil((maxY - minY) / pixelM);
  const waarden = new Float32Array(breedte * hoogte);
  const r = prng(sc.seed);
  const k0 = -(sc.rijen - 1) / 2;
  for (let j = 0; j < hoogte; j++) {
    for (let i = 0; i < breedte; i++) {
      const x = minX + (i + 0.5) * pixelM;
      const y = maxY - (j + 0.5) * pixelM;
      const t = (x - C[0]) * d[0] + (y - C[1]) * d[1];
      const o = (x - C[0]) * n[0] + (y - C[1]) * n[1];
      let v = 15;
      if (Math.abs(t) <= sc.lengte / 2 + 2) {
        const kGuess = Math.round(o / sc.s - k0);
        for (let kk = kGuess - 1; kk <= kGuess + 1; kk++) {
          if (kk < 0 || kk >= sc.rijen || sc.onzichtbaar?.has(kk)) continue;
          if (Math.abs(o - sc.echt(kk, t)) < 0.4) v = 0;
        }
      }
      waarden[j * breedte + i] = v + sc.ruis * gauss(r);
    }
  }
  // basis = regelmatig raster op de nominale afstand
  const basis = Array.from({ length: sc.rijen }, (_, k) => {
    const o = (k + k0) * sc.s;
    const p = (t: number): XY => [C[0] + t * d[0] + o * n[0], C[1] + t * d[1] + o * n[1]];
    return { id: `r${k}`, nummer: k + 1, coordsRD: [p(-sc.lengte / 2), p(sc.lengte / 2)] };
  });
  return { waarden, breedte, hoogte, pixelM, origineRD: [minX, maxY] as XY, basis, d, n };
}

/** offset (langs n, t.o.v. C) van een polylijn op positie t */
function offsetVan(coords: XY[], d: XY, n: XY, t: number): number {
  const pts = coords.map(p => [(p[0] - C[0]) * d[0] + (p[1] - C[1]) * d[1], (p[0] - C[0]) * n[0] + (p[1] - C[1]) * n[1]]).sort((a, b) => a[0] - b[0]);
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (t - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
  }
  return pts[pts.length - 1][1];
}

console.log('\nVerfijning — met de hand uitgezette rijen (opgetelde afwijking, scheef, krom):');
{
  const s = 3.4;
  const rijen = 24;
  const k0 = -(rijen - 1) / 2;
  const r = prng(7);
  const walk: number[] = [];
  let acc = 0;
  for (let k = 0; k < rijen; k++) {
    acc += 0.15 * gauss(r);
    walk.push(acc);
  }
  const echt = (k: number, t: number) => {
    let o = (k + k0) * s + walk[k];
    if (k === 5) o += t * Math.tan(0.25 * RAD); // scheve rij
    if (k === 9) o += 0.18 * (1 - (2 * t / 160) ** 2); // kromme rij (18 cm uitbuiging)
    return o;
  };
  const sc: Scenario = { theta: 37, s, rijen, lengte: 160, echt, ruis: 3, seed: 11 };
  const b = maakBeeld(sc);
  const res = verfijnRijen({
    waarden: b.waarden, breedte: b.breedte, hoogte: b.hoogte, pixelM: b.pixelM, origineRD: b.origineRD,
    richtingGraden: sc.theta, rijafstandM: s, zwaartepunt: C, rijen: b.basis,
  });
  const fouten = res.rijen.map(v => {
    const k = v.nummer - 1;
    return [-70, 0, 70].map(t => Math.abs(offsetVan(v.coordsRD, b.d, b.n, t) - echt(k, t)));
  });

  test('betrouwbaar en aanbeveling per rij (echte rijen wijken af van het raster)', () => {
    assert.strictEqual(res.betrouwbaar, true, res.reden ?? '');
    assert.strictEqual(res.aanbevolen, 'per-rij');
    assert.ok(res.raster.restStdM > 0.1, `rest ${res.raster.restStdM}`);
  });

  test('elke rij ligt binnen 5 cm van de echte rij (begin, midden, eind)', () => {
    const max = Math.max(...fouten.flat());
    const waar = fouten.findIndex(f => Math.max(...f) === max);
    assert.ok(max < 0.05, `grootste fout ${(max * 100).toFixed(1)} cm (rij ${waar + 1})`);
  });

  test('scheve rij: draaiing gevonden', () => {
    const v = res.rijen[5];
    assert.ok(Math.abs(offsetVan(v.coordsRD, b.d, b.n, 70) - offsetVan(v.coordsRD, b.d, b.n, -70) - 140 * Math.tan(0.25 * RAD)) < 0.06);
  });

  test('kromme rij krijgt extra punten en volgt de bocht; rechte rijen houden 2 punten', () => {
    const krom = res.rijen[9];
    assert.ok(krom.punten > 2, `punten ${krom.punten}`);
    assert.ok(krom.krommingM >= 0.06, `kromming ${krom.krommingM}`);
    const recht = res.rijen.filter((v, i) => i !== 9 && v.punten > 2).length;
    assert.ok(recht <= 1, `${recht} rechte rijen kregen ten onrechte extra punten`);
  });

  test('geen rij springt naar de buurrij (verschuiving < s/2)', () => {
    assert.ok(res.rijen.every(v => Math.abs(v.verschuivingM) < s / 2));
  });

  test('statistiek: verschuivingen gemeten en rekentijd redelijk', () => {
    assert.ok(res.perRij.maxCm > 10);
    assert.ok(res.duurMs < 5000, `${res.duurMs} ms`);
    console.log(`    → max ${res.perRij.maxCm} cm, gem ${res.perRij.gemiddeldCm} cm, ${res.krom} krom, ${res.duurMs} ms`);
  });
}

console.log('\nVerfijning — GPS-aanplant (regelmatig, iets andere rijafstand):');
{
  const s = 3.0;
  const sEcht = 3.004;
  const rijen = 30;
  const k0 = -(rijen - 1) / 2;
  const fase = 0.12;
  const r = prng(3);
  const ruisPerRij = Array.from({ length: rijen }, () => 0.02 * gauss(r));
  const echt = (k: number) => (k + k0) * sEcht + fase + ruisPerRij[k];
  const sc: Scenario = { theta: 112, s, rijen, lengte: 140, echt, ruis: 3, seed: 5 };
  const b = maakBeeld(sc);
  const res = verfijnRijen({
    waarden: b.waarden, breedte: b.breedte, hoogte: b.hoogte, pixelM: b.pixelM, origineRD: b.origineRD,
    richtingGraden: sc.theta, rijafstandM: s, zwaartepunt: C, rijen: b.basis,
  });

  test('aanbeveling raster, rijafstand op ±2 mm', () => {
    assert.strictEqual(res.aanbevolen, 'raster');
    assert.ok(Math.abs(res.raster.rijafstandM - sEcht) < 0.002, `s ${res.raster.rijafstandM}`);
  });

  test('fijnafgesteld raster ligt binnen 2 cm van het echte (ruisvrije) raster', () => {
    const max = Math.max(...res.rijen.map(v => Math.abs(offsetVan(v.rasterCoordsRD, b.d, b.n, 0) - ((v.nummer - 1 + k0) * sEcht + fase))));
    assert.ok(max < 0.02, `max ${(max * 100).toFixed(1)} cm`);
  });

  test('geen rijen ten onrechte krom', () => {
    assert.ok(res.krom <= 1, `${res.krom} krom`);
  });
}

console.log('\nVerfijning — zwakke rijen en onbruikbaar beeld:');
{
  const s = 3.2;
  const rijen = 16;
  const k0 = -(rijen - 1) / 2;
  const echt = (k: number) => (k + k0) * s + 0.2;
  const sc: Scenario = { theta: 0, s, rijen, lengte: 100, echt, ruis: 3, seed: 9, onzichtbaar: new Set([7]) };
  const b = maakBeeld(sc);
  const res = verfijnRijen({
    waarden: b.waarden, breedte: b.breedte, hoogte: b.hoogte, pixelM: b.pixelM, origineRD: b.origineRD,
    richtingGraden: 0, rijafstandM: s, zwaartepunt: C, rijen: b.basis,
  });

  test('onzichtbare rij volgt de buren en krijgt controleren', () => {
    const v = res.rijen[7];
    assert.strictEqual(v.zwak, true);
    assert.strictEqual(v.controleren, true);
    assert.ok(Math.abs(offsetVan(v.coordsRD, b.d, b.n, 0) - echt(7)) < 0.08);
  });

  test('beeld zonder rijen → niet betrouwbaar, met reden', () => {
    const r = prng(1);
    const ruis = new Float32Array(b.waarden.length).map(() => 10 + 3 * gauss(r));
    const res2 = verfijnRijen({
      waarden: ruis, breedte: b.breedte, hoogte: b.hoogte, pixelM: b.pixelM, origineRD: b.origineRD,
      richtingGraden: 0, rijafstandM: s, zwaartepunt: C, rijen: b.basis,
    });
    assert.strictEqual(res2.betrouwbaar, false);
    assert.ok(res2.reden && res2.reden.length > 10);
  });

  test('lege invoer geeft een nette uitkomst', () => {
    const res3 = verfijnRijen({
      waarden: b.waarden, breedte: b.breedte, hoogte: b.hoogte, pixelM: b.pixelM, origineRD: b.origineRD,
      richtingGraden: 0, rijafstandM: s, zwaartepunt: C, rijen: [],
    });
    assert.strictEqual(res3.rijen.length, 0);
    assert.strictEqual(res3.betrouwbaar, false);
  });
}

console.log('\nWerkelijke rijafstand per rij:');
{
  const rijAt = (o: number, t0 = -50, t1 = 50, theta = 20): LngLat[] => {
    const d: XY = [Math.sin(theta * RAD), Math.cos(theta * RAD)];
    const n: XY = [Math.cos(theta * RAD), -Math.sin(theta * RAD)];
    return [t0, t1].map(t => naarWGS([C[0] + t * d[0] + o * n[0], C[1] + t * d[1] + o * n[1]]));
  };

  test('regelmatig raster → precies de rijafstand (ook randrijen)', () => {
    const rijen = [0, 3, 6, 9].map((o, i) => ({ id: `a${i}`, coordinates: rijAt(o), rijafstandM: 3 }));
    const eff = effectieveRijafstanden(rijen);
    for (const r of rijen) assert.ok(Math.abs((eff.get(r.id) ?? 0) - 3) < 0.002, `${r.id}: ${eff.get(r.id)}`);
  });

  test('ongelijke afstanden → gemiddelde van de halve afstanden; randrij = afstand tot de buur', () => {
    const rijen = [0, 3.2, 6.0, 9.4].map((o, i) => ({ id: `b${i}`, coordinates: rijAt(o), rijafstandM: 3 }));
    const eff = effectieveRijafstanden(rijen);
    assert.ok(Math.abs((eff.get('b0') ?? 0) - 3.2) < 0.01);
    assert.ok(Math.abs((eff.get('b1') ?? 0) - 3.0) < 0.01);
    assert.ok(Math.abs((eff.get('b2') ?? 0) - 3.1) < 0.01);
    assert.ok(Math.abs((eff.get('b3') ?? 0) - 3.4) < 0.01);
  });

  test('ontbrekende rij telt hooguit 1,5 × de rijafstand; stukken op één lijn zijn geen buren', () => {
    const rijen = [
      { id: 'c0', coordinates: rijAt(0), rijafstandM: 3 },
      { id: 'c1', coordinates: rijAt(9), rijafstandM: 3 },
      { id: 'c2a', coordinates: rijAt(3, -50, -5), rijafstandM: 3 },
      { id: 'c2b', coordinates: rijAt(3, 5, 50), rijafstandM: 3 },
    ];
    const eff = effectieveRijafstanden(rijen);
    assert.ok(Math.abs((eff.get('c1') ?? 0) - 4.5) < 0.01, `c1 ${eff.get('c1')}`);
    // c2a/c2b liggen op dezelfde lijn (geen buren van elkaar); buren 0 (3 m) en 9 (6 m → 4,5 m)
    assert.ok(Math.abs((eff.get('c2a') ?? 0) - 3.75) < 0.01, `c2a ${eff.get('c2a')}`);
    assert.ok(Math.abs((eff.get('c2b') ?? 0) - 3.75) < 0.01, `c2b ${eff.get('c2b')}`);
  });

  test('zonder buren → opgegeven rijafstand (of null)', () => {
    const eff = effectieveRijafstanden([{ id: 'x', coordinates: rijAt(0), rijafstandM: 3.3 }, { id: 'y', coordinates: rijAt(40), rijafstandM: null }]);
    assert.strictEqual(eff.get('x'), 3.3);
    assert.strictEqual(eff.get('y'), null);
  });

  test('verschuifRij verplaatst 10 cm langs de normaal, ook voor polylijnen', () => {
    const lijn = [...rijAt(0, -50, 0), rijAt(0.3, 50, 50)[0]];
    const nieuw = verschuifRij(lijn, 0.1, 20);
    const n: XY = [Math.cos(20 * RAD), -Math.sin(20 * RAD)];
    nieuw.forEach((p, i) => {
      const a = naarRD(lijn[i]);
      const b = naarRD(p);
      const dd = (b[0] - a[0]) * n[0] + (b[1] - a[1]) * n[1];
      assert.ok(Math.abs(dd - 0.1) < 0.002, `punt ${i}: ${dd}`);
    });
  });
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
