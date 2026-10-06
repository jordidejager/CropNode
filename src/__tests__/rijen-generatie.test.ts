/**
 * Rijenkaart — generatie tests
 * Run with: npx tsx src/__tests__/rijen-generatie.test.ts
 *
 * Synthetische percelen, gebouwd in RD rond Amersfoort [155000, 463000], via WGS84 als
 * GeoJSON → perceelNaarRD (zoals echte percelen binnenkomen).
 */

import assert from 'node:assert';
import {
  afstand,
  kompasRichting,
  naarRD,
  naarWGS,
  normaalVector,
  perceelNaarRD,
  richtingVector,
} from '../lib/rijen/geo';
import {
  bepaalNummers,
  boomnummer,
  genereerRijen,
  koppelRijenOpPositie,
  normaliseerFase,
  positieOpRij,
  puntOpRij,
  referentielijnNaarParameters,
  rijAanRand,
  rijOffset,
  rijOppervlakHa,
  rijTussen,
  startzijdeGraden,
  vindStartIndex,
} from '../lib/rijen/generatie';
import type { LngLat, PerceelRD, RijParameters, XY } from '../lib/rijen/types';

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

// ---- Hulpjes ----

const CENTRUM: XY = [155000, 463000];
const CM = 0.01;

function dichtbij(werkelijk: number, verwacht: number, marge: number, wat = 'waarde') {
  assert.ok(
    Math.abs(werkelijk - verwacht) <= marge,
    `${wat}: verwacht ${verwacht} ± ${marge}, kreeg ${werkelijk}`,
  );
}

function hoekDichtbij(werkelijk: number, verwacht: number, marge: number, wat = 'hoek') {
  const d = Math.abs((((werkelijk - verwacht) % 360) + 540) % 360 - 180);
  assert.ok(d <= marge, `${wat}: verwacht ${verwacht}° ± ${marge}, kreeg ${werkelijk}°`);
}

/** Ring in RD → GeoJSON-ring in WGS84 (gesloten) */
function ringNaarWGS(ring: XY[]): number[][] {
  return [...ring, ring[0]].map(p => naarWGS(p));
}

function polygoon(...ringen: XY[][]): PerceelRD {
  return perceelNaarRD({ type: 'Polygon', coordinates: ringen.map(ringNaarWGS) });
}

function multiPolygoon(...polys: XY[][][]): PerceelRD {
  return perceelNaarRD({ type: 'MultiPolygon', coordinates: polys.map(p => p.map(ringNaarWGS)) });
}

/** Lokale coördinaten (meters, x = oost, y = noord) t.o.v. CENTRUM → RD */
function lokaal(pts: [number, number][]): XY[] {
  return pts.map(([x, y]) => [CENTRUM[0] + x, CENTRUM[1] + y]);
}

/** Rechthoek: `lengte` langs richting θ, `breedte` langs de normaal, gecentreerd op CENTRUM */
function rechthoek(theta: number, lengte: number, breedte: number): XY[] {
  const d = richtingVector(theta);
  const n = normaalVector(theta);
  const hoek = (a: number, b: number): XY => [
    CENTRUM[0] + a * (lengte / 2) * d[0] + b * (breedte / 2) * n[0],
    CENTRUM[1] + a * (lengte / 2) * d[1] + b * (breedte / 2) * n[1],
  ];
  return [hoek(1, 1), hoek(1, -1), hoek(-1, -1), hoek(-1, 1)];
}

function params(p: Partial<RijParameters>): RijParameters {
  return {
    richtingGraden: 0,
    rijafstandM: 3,
    faseM: 1.5,
    kopakkerBeginM: 6,
    kopakkerEindM: 6,
    beginkantGraden: null,
    ...p,
  };
}

// ---- Rechthoek 100 × 60 m ----

console.log('\nRechthoek 100 × 60 m, rijafstand 3 m:');

for (const theta of [0, 90, 30]) {
  test(`θ = ${theta}°: 20 rijen van 88 m, gesorteerd op offset, begin aan de +d-kant`, () => {
    const perceel = polygoon(rechthoek(theta, 100, 60));
    dichtbij(perceel.zwaartepunt[0], CENTRUM[0], 0.001, 'zwaartepunt x');
    dichtbij(perceel.zwaartepunt[1], CENTRUM[1], 0.001, 'zwaartepunt y');
    dichtbij(perceel.oppervlakM2, 6000, 0.5, 'oppervlak');

    const rijen = genereerRijen(perceel, params({ richtingGraden: theta }));
    assert.strictEqual(rijen.length, 20);
    rijen.forEach((r, i) => {
      dichtbij(r.lengteM, 88, CM, `lengte rij ${i}`);
      dichtbij(r.offsetM, -28.5 + 3 * i, 1e-9, `offset rij ${i}`);
      assert.strictEqual(r.controleren, false);
      assert.strictEqual(r.coordsRD.length, 2);
      assert.strictEqual(r.coordinates.length, 2);
      // eind → begin wijst naar θ (begin aan de +d-kant)
      hoekDichtbij(kompasRichting(r.coordsRD[1], r.coordsRD[0]), theta, 0.01, 'richting eind→begin');
      // het midden ligt op de verwachte offset
      dichtbij(rijOffset(perceel, theta, r.coordsRD), r.offsetM, 1e-6, 'rijOffset');
      // WGS-coördinaten horen bij de RD-coördinaten
      dichtbij(afstand(naarRD(r.coordinates[0]), r.coordsRD[0]), 0, 0.002, 'WGS begin');
    });
  });
}

test('θ = 0° over de breedte (100 m oost-west × 60 m noord-zuid): 34 rijen van 48 m', () => {
  // lange zijde langs de normaal: offsets in [−50, 50], fase 1,5 → −49,5 … 49,5
  const perceel = polygoon(rechthoek(90, 100, 60));
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  assert.strictEqual(rijen.length, 34);
  for (const r of rijen) dichtbij(r.lengteM, 48, CM, 'lengte');
  dichtbij(rijen[0].offsetM, -49.5, 1e-9, 'eerste offset');
  dichtbij(rijen[33].offsetM, 49.5, 1e-9, 'laatste offset');
});

test('θ = 180 wordt behandeld als θ = 0', () => {
  const perceel = polygoon(rechthoek(0, 100, 60));
  const a = genereerRijen(perceel, params({ richtingGraden: 0 }));
  const b = genereerRijen(perceel, params({ richtingGraden: 180 }));
  assert.strictEqual(b.length, a.length);
  b.forEach((r, i) => dichtbij(afstand(r.coordsRD[0], a[i].coordsRD[0]), 0, 1e-6, 'begin'));
});

test('fase buiten [0, s) wordt genormaliseerd (fase 4,5 en −1,5 = fase 1,5)', () => {
  const perceel = polygoon(rechthoek(30, 100, 60));
  const a = genereerRijen(perceel, params({ richtingGraden: 30, faseM: 1.5 }));
  for (const faseM of [4.5, -1.5]) {
    const b = genereerRijen(perceel, params({ richtingGraden: 30, faseM }));
    assert.strictEqual(b.length, a.length);
    b.forEach((r, i) => dichtbij(r.offsetM, a[i].offsetM, 1e-9, 'offset'));
  }
});

test('minLengteM: rijen korter dan de grens vervallen', () => {
  const perceel = polygoon(rechthoek(0, 100, 60));
  assert.strictEqual(genereerRijen(perceel, params({}), { minLengteM: 88.5 }).length, 0);
  assert.strictEqual(genereerRijen(perceel, params({}), { minLengteM: 87.5 }).length, 20);
  // kopakkers groter dan de rij → niets
  assert.strictEqual(genereerRijen(perceel, params({ kopakkerBeginM: 50, kopakkerEindM: 50 })).length, 0);
});

test('ongeldige rijafstand → geen rijen', () => {
  const perceel = polygoon(rechthoek(0, 100, 60));
  assert.deepStrictEqual(genereerRijen(perceel, params({ rijafstandM: 0 })), []);
  assert.deepStrictEqual(genereerRijen(perceel, params({ rijafstandM: NaN })), []);
});

// ---- Kopakker en beginkant ----

console.log('\nKopakker en beginkant:');

test('asymmetrische kopakker 6/10: 6 m aan de beginkant (noord), 10 m aan het eind', () => {
  const perceel = polygoon(rechthoek(0, 100, 60)); // y van −50 tot 50
  const rijen = genereerRijen(perceel, params({ kopakkerBeginM: 6, kopakkerEindM: 10 }));
  assert.strictEqual(rijen.length, 20);
  for (const r of rijen) {
    dichtbij(r.lengteM, 84, CM, 'lengte');
    dichtbij(r.coordsRD[0][1], CENTRUM[1] + 50 - 6, CM, 'begin y');
    dichtbij(r.coordsRD[1][1], CENTRUM[1] - 50 + 10, CM, 'eind y');
  }
});

test('beginkant zuid (180°) bij θ = 0: begin in het zuiden, kopakkers gaan mee', () => {
  const perceel = polygoon(rechthoek(0, 100, 60));
  const rijen = genereerRijen(perceel, params({ kopakkerBeginM: 6, kopakkerEindM: 10, beginkantGraden: 180 }));
  for (const r of rijen) {
    dichtbij(r.coordsRD[0][1], CENTRUM[1] - 50 + 6, CM, 'begin y');
    dichtbij(r.coordsRD[1][1], CENTRUM[1] + 50 - 10, CM, 'eind y');
    hoekDichtbij(kompasRichting(r.coordsRD[1], r.coordsRD[0]), 180, 0.01, 'eind→begin');
  }
});

test('beginkant omdraaien draait coordsRD om (θ = 30°)', () => {
  const perceel = polygoon(rechthoek(30, 100, 60));
  const a = genereerRijen(perceel, params({ richtingGraden: 30 }));
  const b = genereerRijen(perceel, params({ richtingGraden: 30, beginkantGraden: 210 }));
  assert.strictEqual(b.length, a.length);
  a.forEach((r, i) => {
    dichtbij(afstand(r.coordsRD[0], b[i].coordsRD[1]), 0, 1e-6, 'begin a = eind b');
    dichtbij(afstand(r.coordsRD[1], b[i].coordsRD[0]), 0, 1e-6, 'eind a = begin b');
    dichtbij(afstand(naarRD(r.coordinates[0]), naarRD(b[i].coordinates[1])), 0, 0.002, 'WGS omgedraaid');
  });
});

test('beginkant schuin: < 90° van θ → +d-kant, > 90° → −d-kant', () => {
  const perceel = polygoon(rechthoek(0, 100, 60));
  const plus = genereerRijen(perceel, params({ beginkantGraden: 80 }));
  const min = genereerRijen(perceel, params({ beginkantGraden: 100 }));
  assert.ok(plus[0].coordsRD[0][1] > plus[0].coordsRD[1][1], 'begin noord');
  assert.ok(min[0].coordsRD[0][1] < min[0].coordsRD[1][1], 'begin zuid');
});

// ---- Inham, MultiPolygon, gat ----

console.log('\nInham, MultiPolygon en gat:');

test('U-vormig perceel (inham): rijen door de inham → controleren + langste stuk', () => {
  // 60 × 100 m, inham x 30..40 van y 40 tot 100 (linkerpoot 30 m, rechterpoot 20 m)
  const perceel = polygoon(lokaal([
    [0, 0], [60, 0], [60, 100], [40, 100], [40, 40], [30, 40], [30, 100], [0, 100],
  ]));
  // θ = 90: rijen oost-west, begin aan de oostkant
  const rijen = genereerRijen(perceel, params({ richtingGraden: 90 }));
  let doorInham = 0;
  let heel = 0;
  for (const r of rijen) {
    const y = r.coordsRD[0][1] - CENTRUM[1];
    if (y > 40) {
      doorInham++;
      assert.strictEqual(r.controleren, true, `rij y=${y.toFixed(2)} moet gecontroleerd worden`);
      dichtbij(r.lengteM, 30 - 12, CM, 'lengte linkerpoot');
      dichtbij(r.coordsRD[0][0] - CENTRUM[0], 30 - 6, CM, 'begin x (oostkant linkerpoot)');
      dichtbij(r.coordsRD[1][0] - CENTRUM[0], 6, CM, 'eind x');
    } else {
      heel++;
      assert.strictEqual(r.controleren, false);
      dichtbij(r.lengteM, 60 - 12, CM, 'lengte hele breedte');
    }
  }
  assert.strictEqual(doorInham + heel, rijen.length);
  assert.strictEqual(doorInham, 20, 'rijen door de inham (60 m / 3 m)');
  assert.ok(heel === 13 || heel === 14, `rijen onder de inham: ${heel}`);
});

test('U-vormig perceel met rijen langs de poten (θ = 0): geen controleren', () => {
  const perceel = polygoon(lokaal([
    [0, 0], [60, 0], [60, 100], [40, 100], [40, 40], [30, 40], [30, 100], [0, 100],
  ]));
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  assert.strictEqual(rijen.length, 20);
  for (const r of rijen) {
    assert.strictEqual(r.controleren, false);
    const x = r.coordsRD[0][0] - CENTRUM[0];
    dichtbij(r.lengteM, x > 30 && x < 40 ? 40 - 12 : 100 - 12, CM, `lengte x=${x.toFixed(2)}`);
  }
});

test('MultiPolygon naast elkaar: rijen in beide delen, geen controleren', () => {
  const perceel = multiPolygoon(
    [lokaal([[0, 0], [30, 0], [30, 100], [0, 100]])],
    [lokaal([[50, 0], [80, 0], [80, 100], [50, 100]])],
  );
  dichtbij(perceel.zwaartepunt[0] - CENTRUM[0], 40, 0.001, 'zwaartepunt x');
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  // x = 41,5 + 3k → 2,5 … 29,5 (10) en 50,5 … 77,5 (10)
  assert.strictEqual(rijen.length, 20);
  for (const r of rijen) {
    assert.strictEqual(r.controleren, false);
    dichtbij(r.lengteM, 88, CM, 'lengte');
  }
  const xs = rijen.map(r => r.coordsRD[0][0] - CENTRUM[0]);
  assert.strictEqual(xs.filter(x => x < 30).length, 10);
  assert.strictEqual(xs.filter(x => x > 50).length, 10);
});

test('MultiPolygon achter elkaar: lijn snijdt twee delen → langste + controleren', () => {
  const perceel = multiPolygoon(
    [lokaal([[0, 0], [30, 0], [30, 100], [0, 100]])],
    [lokaal([[0, 120], [30, 120], [30, 150], [0, 150]])],
  );
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  assert.strictEqual(rijen.length, 10);
  for (const r of rijen) {
    assert.strictEqual(r.controleren, true);
    dichtbij(r.lengteM, 88, CM, 'lengte (langste deel)');
    dichtbij(r.coordsRD[0][1] - CENTRUM[1], 94, CM, 'begin y');
  }
});

test('polygoon met gat: rijen door het gat → langste stuk + controleren', () => {
  // 60 × 100 m met gat x 20..40, y 30..50 → stukken [0,30] en [50,100]
  const perceel = polygoon(
    lokaal([[0, 0], [60, 0], [60, 100], [0, 100]]),
    lokaal([[20, 30], [40, 30], [40, 50], [20, 50]]),
  );
  dichtbij(perceel.oppervlakM2, 6000 - 400, 0.5, 'oppervlak zonder gat');
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  assert.strictEqual(rijen.length, 20);
  let doorGat = 0;
  for (const r of rijen) {
    const x = r.coordsRD[0][0] - CENTRUM[0];
    if (x > 20 && x < 40) {
      doorGat++;
      assert.strictEqual(r.controleren, true);
      dichtbij(r.lengteM, 50 - 12, CM, 'lengte noordelijk stuk');
      dichtbij(r.coordsRD[0][1] - CENTRUM[1], 94, CM, 'begin y');
      dichtbij(r.coordsRD[1][1] - CENTRUM[1], 56, CM, 'eind y');
    } else {
      assert.strictEqual(r.controleren, false);
      dichtbij(r.lengteM, 88, CM, 'lengte');
    }
  }
  assert.ok(doorGat >= 6 && doorGat <= 7, `rijen door het gat: ${doorGat}`);
});

test('paal-uitsparing (gat 0,6 × 0,6 m, zoals in echte BRP-percelen) wordt overbrugd', () => {
  // 60 × 100 m; het gat ligt precies op de rij x ≈ 31,5 (fase 1,5)
  const perceel = polygoon(
    lokaal([[0, 0], [60, 0], [60, 100], [0, 100]]),
    lokaal([[31.2, 49.7], [31.8, 49.7], [31.8, 50.3], [31.2, 50.3]]),
  );
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  assert.strictEqual(rijen.length, 20);
  const doorPaal = rijen.find(r => Math.abs(r.coordsRD[0][0] - CENTRUM[0] - 31.5) < 0.01);
  assert.ok(doorPaal, 'rij door de paal');
  for (const r of rijen) {
    assert.strictEqual(r.controleren, false);
    dichtbij(r.lengteM, 88, CM, 'lengte (opening overbrugd)');
  }
});

test('naad van 5 mm tussen aangrenzende delen (MultiPolygon) wordt overbrugd', () => {
  const perceel = multiPolygoon(
    [lokaal([[0, 0], [30, 0], [30, 100], [0, 100]])],
    [lokaal([[0, 100.005], [30, 100.005], [30, 150], [0, 150]])],
  );
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  assert.strictEqual(rijen.length, 10);
  for (const r of rijen) {
    assert.strictEqual(r.controleren, false);
    dichtbij(r.lengteM, 150 - 12, CM, 'lengte over beide delen');
    dichtbij(r.coordsRD[0][1] - CENTRUM[1], 150 - 6, CM, 'begin y');
    dichtbij(r.coordsRD[1][1] - CENTRUM[1], 6, CM, 'eind y');
  }
});

test('opening van 2 m (pad) blijft een onderbreking: langste stuk + controleren', () => {
  const perceel = multiPolygoon(
    [lokaal([[0, 0], [30, 0], [30, 100], [0, 100]])],
    [lokaal([[0, 102], [30, 102], [30, 150], [0, 150]])],
  );
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }));
  assert.strictEqual(rijen.length, 10);
  for (const r of rijen) {
    assert.strictEqual(r.controleren, true);
    dichtbij(r.lengteM, 88, CM, 'lengte zuidelijk deel');
  }
});

test('ongeldige percelen en absurde rijafstand → [] zonder exception', () => {
  const leeg = perceelNaarRD({ type: 'Polygon', coordinates: [] });
  assert.deepStrictEqual(genereerRijen(leeg, params({})), []);
  const perceel = polygoon(rechthoek(0, 100, 60));
  // 60 m / 1 mm = 60 000 rijen: boven de veiligheidsgrens
  assert.deepStrictEqual(genereerRijen(perceel, params({ rijafstandM: 0.001 })), []);
  assert.deepStrictEqual(genereerRijen(perceel, params({ richtingGraden: NaN })), []);
  assert.deepStrictEqual(genereerRijen(perceel, params({ rijafstandM: -3 })), []);
});

test('hoekpunten precies op een rijlijn: half-open regel, geen dubbele snijpunten', () => {
  // Direct in RD (zonder WGS-omweg), zodat de hoekpunten exact op de lijnen x = 3k liggen.
  // Rechthoek x −30..30, y −50..50 met een inkeping van rechts (punt raakt x = 0)
  // en een inkeping van boven (punt op x = −15, de lijn loopt er doorheen).
  const ring: XY[] = lokaal([
    [-30, -50], [30, -50], [30, -10], [0, 0], [30, 10], [30, 50],
    [-10, 50], [-15, 20], [-20, 50], [-30, 50],
  ]);
  const perceel: PerceelRD = {
    polygonen: [[ring]],
    zwaartepunt: CENTRUM,
    bbox: [CENTRUM[0] - 30, CENTRUM[1] - 50, CENTRUM[0] + 30, CENTRUM[1] + 50],
    oppervlakM2: 0,
  };
  const rijen = genereerRijen(
    perceel,
    params({ richtingGraden: 0, faseM: 0, kopakkerBeginM: 0, kopakkerEindM: 0 }),
  );
  const opX = (x: number) => rijen.find(r => Math.abs(r.offsetM - x) < 1e-9);

  // x = 0: de punt van de inkeping raakt de lijn → één stuk van 100 m
  const raak = opX(0);
  assert.ok(raak, 'rij x = 0');
  assert.strictEqual(raak.controleren, false);
  dichtbij(raak.lengteM, 100, 1e-9, 'lengte x = 0');

  // x = −15: de lijn gaat door het hoekpunt (buren aan weerszijden) → [−50, 20]
  const door = opX(-15);
  assert.ok(door, 'rij x = −15');
  assert.strictEqual(door.controleren, false);
  dichtbij(door.lengteM, 70, 1e-9, 'lengte x = −15');
  dichtbij(door.coordsRD[0][1] - CENTRUM[1], 20, 1e-9, 'begin y');

  // rijen door de rechterinkeping zijn echt gesplitst
  const gesplitst = opX(15);
  assert.ok(gesplitst, 'rij x = 15');
  assert.strictEqual(gesplitst.controleren, true);
  dichtbij(gesplitst.lengteM, 45, 1e-9, 'lengte x = 15 (stukken −50..−5 en 5..50)');

  // geen enkele rij met een oneven aantal snijpunten / rare lengte
  for (const r of rijen) assert.ok(r.lengteM <= 100 + 1e-9);
});

// ---- Referentielijn ----

console.log('\nReferentielijn:');

test('lijn door een gegenereerde rij geeft dezelfde richting en fase terug', () => {
  for (const [theta, fase] of [[30, 1.5], [137, 0.7], [0, 2.2], [90, 0]] as const) {
    const perceel = polygoon(rechthoek(theta, 100, 60));
    const rijen = genereerRijen(perceel, params({ richtingGraden: theta, faseM: fase }));
    const r = rijen[5];
    // in beide tekenrichtingen
    for (const [a, b] of [[r.coordsRD[0], r.coordsRD[1]], [r.coordsRD[1], r.coordsRD[0]]] as const) {
      const p = referentielijnNaarParameters(perceel, a, b, 3);
      hoekDichtbij(p.richtingGraden, theta, 1e-6, 'richting');
      assert.ok(p.richtingGraden >= 0 && p.richtingGraden < 180);
      const df = Math.abs(p.faseM - fase);
      assert.ok(Math.min(df, 3 - df) < 1e-6, `fase ${p.faseM} ≠ ${fase}`);
      assert.ok(p.faseM >= 0 && p.faseM < 3);
    }
    // een lijn langs dezelfde rij maar buiten het perceel verlengd
    const d = richtingVector(theta);
    const a: XY = [r.coordsRD[0][0] + 500 * d[0], r.coordsRD[0][1] + 500 * d[1]];
    const p = referentielijnNaarParameters(perceel, a, r.coordsRD[1], 3);
    const df = Math.abs(p.faseM - fase);
    assert.ok(Math.min(df, 3 - df) < 1e-6, `verlengde lijn: fase ${p.faseM} ≠ ${fase}`);
  }
});

test('normaliseerFase', () => {
  assert.strictEqual(normaliseerFase(4.5, 3), 1.5);
  assert.strictEqual(normaliseerFase(-1, 3), 2);
  assert.strictEqual(normaliseerFase(-1e-12, 3), 0);
  assert.strictEqual(normaliseerFase(6, 3), 0);
  assert.strictEqual(normaliseerFase(1, 0), 0);
  assert.strictEqual(normaliseerFase(NaN, 3), 0);
});

// ---- Opnieuw genereren: koppelen ----

console.log('\nKoppelen op positie:');

test('verschuiving 0,1 m behoudt alle id\'s', () => {
  const perceel = polygoon(rechthoek(30, 100, 60));
  const oud = genereerRijen(perceel, params({ richtingGraden: 30, faseM: 1.5 }));
  const nieuw = genereerRijen(perceel, params({ richtingGraden: 30, faseM: 1.6 }));
  const bestaand = oud.map((r, i) => ({ id: `rij-${i}`, offsetM: r.offsetM }));
  const k = koppelRijenOpPositie(bestaand, nieuw, 1.5);
  assert.strictEqual(k.paren.length, 20);
  assert.deepStrictEqual(k.nieuweIndexen, []);
  assert.deepStrictEqual(k.vervallenIds, []);
  k.paren.forEach(p => assert.strictEqual(p.id, `rij-${p.index}`));
});

test('extra randrij → nieuw; weggevallen randrij → vervallen', () => {
  const bestaand = [0, 3, 6, 9].map((o, i) => ({ id: `r${i}`, offsetM: o }));
  const metExtra = koppelRijenOpPositie(bestaand, [0.1, 3.1, 6.1, 9.1, 12.1].map(offsetM => ({ offsetM })), 1.5);
  assert.deepStrictEqual(metExtra.nieuweIndexen, [4]);
  assert.deepStrictEqual(metExtra.vervallenIds, []);
  assert.strictEqual(metExtra.paren.length, 4);

  const zonderRand = koppelRijenOpPositie(bestaand, [3.1, 6.1, 9.1].map(offsetM => ({ offsetM })), 1.5);
  assert.deepStrictEqual(zonderRand.vervallenIds, ['r0']);
  assert.deepStrictEqual(zonderRand.nieuweIndexen, []);
  assert.deepStrictEqual(zonderRand.paren, [
    { id: 'r1', index: 0 },
    { id: 'r2', index: 1 },
    { id: 'r3', index: 2 },
  ]);
});

test('conflict: het dichtstbijzijnde paar wint, de ander vervalt', () => {
  const k = koppelRijenOpPositie([{ id: 'a', offsetM: 0 }, { id: 'b', offsetM: 2.9 }], [{ offsetM: 1.5 }], 1.5);
  assert.deepStrictEqual(k.paren, [{ id: 'b', index: 0 }]);
  assert.deepStrictEqual(k.vervallenIds, ['a']);
  assert.deepStrictEqual(k.nieuweIndexen, []);
});

test('verder dan maxAfstand → geen paar', () => {
  const k = koppelRijenOpPositie([{ id: 'a', offsetM: 0 }], [{ offsetM: 1.51 }], 1.5);
  assert.deepStrictEqual(k.paren, []);
  assert.deepStrictEqual(k.vervallenIds, ['a']);
  assert.deepStrictEqual(k.nieuweIndexen, [0]);
});

// ---- Nummering ----

console.log('\nNummering:');

test('bepaalNummers: start aan de lage kant → oplopend met offset', () => {
  // ongesorteerde invoer; laagste offset (−1) staat op index 1
  assert.deepStrictEqual(bepaalNummers([5, -1, 3, 1], 1, 1), [4, 1, 3, 2]);
});

test('bepaalNummers: start aan de hoge kant → aflopend met offset', () => {
  assert.deepStrictEqual(bepaalNummers([5, -1, 3, 1], 0, 1), [1, 4, 2, 3]);
});

test('bepaalNummers: middenrij en achterkant', () => {
  // precies in het midden → oplopend; achterkant krijgt 9, 8
  assert.deepStrictEqual(bepaalNummers([0, 3, 6, 9, 12], 2, 10), [8, 9, 10, 11, 12]);
  // meer rijen aan de lage kant → aflopend
  assert.deepStrictEqual(bepaalNummers([0, 3, 6, 9, 12], 3, 10), [13, 12, 11, 10, 9]);
  assert.deepStrictEqual(bepaalNummers([], 0, 1), []);
});

test('startzijdeGraden en vindStartIndex', () => {
  assert.strictEqual(startzijdeGraden(0, true), 270);
  assert.strictEqual(startzijdeGraden(0, false), 90);
  assert.strictEqual(startzijdeGraden(30, true), 300);
  assert.strictEqual(startzijdeGraden(120, true), 30);
  assert.strictEqual(startzijdeGraden(120, false), 210);

  assert.strictEqual(vindStartIndex([5, -1, 3], 0, 270), 1);
  assert.strictEqual(vindStartIndex([5, -1, 3], 0, 90), 0);
  assert.strictEqual(vindStartIndex([], 0, 90), -1);

  // geometrisch: θ = 0, startzijde west → westelijkste rij; oost → oostelijkste
  const perceel = polygoon(rechthoek(0, 100, 60));
  const rijen = genereerRijen(perceel, params({}));
  const offsets = rijen.map(r => r.offsetM);
  const xs = rijen.map(r => r.coordsRD[0][0]);
  assert.strictEqual(xs[vindStartIndex(offsets, 0, 270)], Math.min(...xs));
  assert.strictEqual(xs[vindStartIndex(offsets, 0, 90)], Math.max(...xs));
  // standaardnummering: rij 1 westelijk, oplopend naar het oosten
  const nummers = bepaalNummers(offsets, vindStartIndex(offsets, 0, startzijdeGraden(0, true)), 1);
  assert.strictEqual(nummers[xs.indexOf(Math.min(...xs))], 1);
  assert.strictEqual(nummers[xs.indexOf(Math.max(...xs))], 20);
  // θ = 30: startzijde θ + 90 → rij 1 aan de +n-kant
  const p30 = polygoon(rechthoek(30, 100, 60));
  const o30 = genereerRijen(p30, params({ richtingGraden: 30 })).map(r => r.offsetM);
  assert.strictEqual(vindStartIndex(o30, 30, startzijdeGraden(30, false)), o30.length - 1);
});

// ---- Oppervlak, posities, bomen ----

console.log('\nOppervlak, positie en bomen:');

test('rijOppervlakHa', () => {
  const rijen = [
    { lengteM: 100, rijafstandM: 3 },
    { lengteM: 50, rijafstandM: null },
  ];
  dichtbij(rijOppervlakHa(rijen, 4), 0.05, 1e-12, 'met standaard');
  dichtbij(rijOppervlakHa(rijen), 0.03, 1e-12, 'zonder standaard');
  dichtbij(rijOppervlakHa(rijen, null), 0.03, 1e-12, 'standaard null');
  assert.strictEqual(rijOppervlakHa([]), 0);
  // 20 rijen × 88 m × 3 m = 0,528 ha
  const perceel = polygoon(rechthoek(0, 100, 60));
  const gen = genereerRijen(perceel, params({})).map(r => ({ lengteM: r.lengteM, rijafstandM: null }));
  dichtbij(rijOppervlakHa(gen, 3), 0.528, 1e-5, 'gegenereerd');
});

test('positieOpRij / puntOpRij roundtrip', () => {
  const perceel = polygoon(rechthoek(30, 100, 60));
  const rij = genereerRijen(perceel, params({ richtingGraden: 30 }))[7];
  const coords: LngLat[] = rij.coordinates;
  for (const s of [0, 12.34, 37.5, 88]) {
    const p = puntOpRij(coords, s);
    const r = positieOpRij(coords, p);
    dichtbij(r.positieM, s, CM, `positie ${s}`);
    dichtbij(r.afstandTotRijM, 0, CM, 'afstand');
  }
  // punt 1 m naast de rij
  const n = normaalVector(30);
  const opRij = naarRD(puntOpRij(coords, 37.5));
  const naast = naarWGS([opRij[0] + n[0], opRij[1] + n[1]]);
  const r = positieOpRij(coords, naast);
  dichtbij(r.positieM, 37.5, CM, 'positie naast');
  dichtbij(r.afstandTotRijM, 1, CM, 'afstand naast');
  // buiten de rij wordt begrensd
  dichtbij(afstand(naarRD(puntOpRij(coords, 500)), rij.coordsRD[1]), 0, 0.002, 'voorbij eind');
  dichtbij(afstand(naarRD(puntOpRij(coords, -5)), rij.coordsRD[0]), 0, 0.002, 'voor begin');
});

test('boomnummer', () => {
  assert.strictEqual(boomnummer(0, 0.66), 1);
  assert.strictEqual(boomnummer(0.65, 0.66), 1);
  assert.strictEqual(boomnummer(0.66, 0.66), 2);
  assert.strictEqual(boomnummer(1.32, 0.66), 3);
  assert.strictEqual(boomnummer(66, 0.66), 101);
  assert.strictEqual(boomnummer(null, 0.66), null);
  assert.strictEqual(boomnummer(5, null), null);
  assert.strictEqual(boomnummer(5, 0), null);
});

// ---- Rij toevoegen ----

console.log('\nRij toevoegen:');

test('rijTussen: midden tussen twee rijen, ook als b andersom loopt', () => {
  const a: LngLat[] = [naarWGS([CENTRUM[0], CENTRUM[1] + 40]), naarWGS([CENTRUM[0], CENTRUM[1] - 40])];
  const b: LngLat[] = [naarWGS([CENTRUM[0] + 3, CENTRUM[1] - 40]), naarWGS([CENTRUM[0] + 3, CENTRUM[1] + 40])];
  const m = rijTussen(a, b).map(naarRD);
  dichtbij(afstand(m[0], [CENTRUM[0] + 1.5, CENTRUM[1] + 40]), 0, 0.002, 'begin');
  dichtbij(afstand(m[1], [CENTRUM[0] + 1.5, CENTRUM[1] - 40]), 0, 0.002, 'eind');
});

test('rijAanRand: rand + (rand − buur)', () => {
  const rand: LngLat[] = [naarWGS([CENTRUM[0], CENTRUM[1] + 40]), naarWGS([CENTRUM[0], CENTRUM[1] - 40])];
  const buur: LngLat[] = [naarWGS([CENTRUM[0] + 3, CENTRUM[1] - 38]), naarWGS([CENTRUM[0] + 3, CENTRUM[1] + 42])];
  const r = rijAanRand(rand, buur).map(naarRD);
  dichtbij(afstand(r[0], [CENTRUM[0] - 3, CENTRUM[1] + 38]), 0, 0.002, 'begin');
  dichtbij(afstand(r[1], [CENTRUM[0] - 3, CENTRUM[1] - 42]), 0, 0.002, 'eind');
});

// ---- Summary ----

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
