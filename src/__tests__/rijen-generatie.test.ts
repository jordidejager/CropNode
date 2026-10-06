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
  puntInPerceel,
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
  rijLangs,
  rijOffset,
  rijOppervlakHa,
  rijTussen,
  startzijdeGraden,
  vindStartIndex,
} from '../lib/rijen/generatie';
import type { GegenereerdeRij, LngLat, PerceelRD, Rij, RijInstellingen, RijParameters, XY } from '../lib/rijen/types';
import { maakOpslaanPlan } from '../components/rijenkaart/rijen-hulp';

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

// ---- Onderbroken rijen: alle stukken ----

console.log("\nOnderbroken rijen (stukken 'alle'):");

/** U-vorm 60 × 100 m, inham x 30..40 van y 40 tot 100 (linkerpoot 30 m, rechterpoot 20 m) */
function uVorm(): PerceelRD {
  return polygoon(lokaal([
    [0, 0], [60, 0], [60, 100], [40, 100], [40, 40], [30, 40], [30, 100], [0, 100],
  ]));
}

/** Lokale x/y (t.o.v. CENTRUM) van begin en eind */
function lok(r: GegenereerdeRij): { bx: number; by: number; ex: number; ey: number } {
  return {
    bx: r.coordsRD[0][0] - CENTRUM[0],
    by: r.coordsRD[0][1] - CENTRUM[1],
    ex: r.coordsRD[1][0] - CENTRUM[0],
    ey: r.coordsRD[1][1] - CENTRUM[1],
  };
}

/** Gesorteerd op offset oplopend, daarna langsM oplopend */
function controleerSortering(rijen: GegenereerdeRij[]) {
  for (let i = 1; i < rijen.length; i++) {
    const a = rijen[i - 1];
    const b = rijen[i];
    assert.ok(a.offsetM <= b.offsetM, `offset ${a.offsetM} > ${b.offsetM}`);
    if (a.offsetM === b.offsetM) assert.ok(a.langsM! < b.langsM!, `langs ${a.langsM} ≥ ${b.langsM} bij gelijke offset`);
  }
}

/** Stukken per rijlijn (sleutel = offset) */
function perLijn(rijen: GegenereerdeRij[]): Map<number, GegenereerdeRij[]> {
  const m = new Map<number, GegenereerdeRij[]>();
  for (const r of rijen) m.set(r.offsetM, [...(m.get(r.offsetM) ?? []), r]);
  return m;
}

/** Zoals v_rijen de geometrie teruggeeft: GeoJSON met 7 decimalen */
function rond7(c: LngLat): LngLat {
  return [Math.round(c[0] * 1e7) / 1e7, Math.round(c[1] * 1e7) / 1e7];
}

test('U-vorm, θ = 90: elke lijn door de inham geeft 2 stukken, beide controleren, kopakker aan beide uiteinden', () => {
  const perceel = uVorm();
  const rijen = genereerRijen(perceel, params({ richtingGraden: 90 }), { stukken: 'alle' });
  controleerSortering(rijen);
  const lijnen = perLijn(rijen);
  let doorInham = 0;
  let heel = 0;
  for (const stukken of lijnen.values()) {
    const y = lok(stukken[0]).by;
    if (y > 40) {
      doorInham++;
      assert.strictEqual(stukken.length, 2, `lijn y=${y.toFixed(2)}`);
      const [west, oost] = stukken;
      // θ = 90: begin aan de oostkant (+d), dus begin x > eind x
      dichtbij(west.lengteM, 30 - 12, CM, 'lengte linkerpoot');
      dichtbij(lok(west).bx, 30 - 6, CM, 'begin linkerpoot (kopakker aan de inham)');
      dichtbij(lok(west).ex, 6, CM, 'eind linkerpoot');
      dichtbij(oost.lengteM, 20 - 12, CM, 'lengte rechterpoot');
      dichtbij(lok(oost).bx, 60 - 6, CM, 'begin rechterpoot');
      dichtbij(lok(oost).ex, 40 + 6, CM, 'eind rechterpoot (kopakker aan de inham)');
      for (const [i, r] of [west, oost].entries()) {
        assert.strictEqual(r.controleren, true);
        assert.strictEqual(r.stukIndex, i);
        assert.strictEqual(r.aantalStukken, 2);
      }
      // langsM = x van het midden t.o.v. het zwaartepunt (d = oost)
      dichtbij(west.langsM!, CENTRUM[0] + 15 - perceel.zwaartepunt[0], CM, 'langsM west');
      dichtbij(oost.langsM!, CENTRUM[0] + 50 - perceel.zwaartepunt[0], CM, 'langsM oost');
    } else {
      heel++;
      assert.strictEqual(stukken.length, 1);
      const [r] = stukken;
      assert.strictEqual(r.controleren, false);
      assert.strictEqual(r.stukIndex, 0);
      assert.strictEqual(r.aantalStukken, 1);
      dichtbij(r.lengteM, 60 - 12, CM, 'lengte hele breedte');
    }
  }
  assert.strictEqual(doorInham, 20, 'lijnen door de inham');
  assert.ok(heel === 13 || heel === 14, `lijnen onder de inham: ${heel}`);
  assert.strictEqual(rijen.length, 2 * doorInham + heel);
});

test("U-vorm: 'langste' (standaard) blijft het oude resultaat en vult langsM/stukIndex/aantalStukken", () => {
  const perceel = uVorm();
  const standaard = genereerRijen(perceel, params({ richtingGraden: 90 }));
  const langste = genereerRijen(perceel, params({ richtingGraden: 90 }), { stukken: 'langste' });
  const onzin = genereerRijen(perceel, params({ richtingGraden: 90 }), { stukken: 'onzin' as unknown as 'alle' });
  assert.deepStrictEqual(langste, standaard);
  assert.deepStrictEqual(onzin, standaard);
  const alle = genereerRijen(perceel, params({ richtingGraden: 90 }), { stukken: 'alle' });
  for (const r of standaard) {
    assert.strictEqual(r.stukIndex, 0);
    dichtbij(r.langsM!, rijLangs(perceel, 90, r.coordsRD), 1e-9, 'langsM = rijLangs');
    // het langste stuk is precies de westelijke rij van 'alle' op dezelfde lijn
    const zelfde = alle.filter(a => a.offsetM === r.offsetM);
    assert.strictEqual(r.aantalStukken, zelfde.length);
    const west = zelfde[0];
    assert.deepStrictEqual(r.coordsRD, west.coordsRD);
    assert.strictEqual(r.controleren, west.controleren);
  }
  assert.strictEqual(standaard.filter(r => r.aantalStukken === 2).length, 20);
});

test("U-vorm: minLengteM laat het korte stuk vallen; bij 'alle' dan geen controleren meer", () => {
  const perceel = uVorm();
  // rechterpoot: 20 − 12 = 8 m < 10 m
  const alle = genereerRijen(perceel, params({ richtingGraden: 90 }), { stukken: 'alle', minLengteM: 10 });
  const langste = genereerRijen(perceel, params({ richtingGraden: 90 }), { minLengteM: 10 });
  assert.strictEqual(alle.length, langste.length);
  for (const r of alle) {
    assert.strictEqual(r.controleren, false);
    assert.strictEqual(r.aantalStukken, 1);
    if (lok(r).by > 40) dichtbij(lok(r).bx, 24, CM, 'boven de inham alleen de linkerpoot');
    else dichtbij(r.lengteM, 48, CM, 'onder de inham de hele breedte');
  }
  // 'langste' blijft (zoals altijd) markeren dat de lijn onderbroken is
  assert.strictEqual(langste.filter(r => r.controleren).length, 20);
  for (const r of langste) assert.strictEqual(r.aantalStukken, 1);
});

test("U-vorm 'alle': asymmetrische kopakker en beginkant west gelden per stuk", () => {
  const perceel = uVorm();
  const rijen = genereerRijen(
    perceel,
    params({ richtingGraden: 90, kopakkerBeginM: 2, kopakkerEindM: 4, beginkantGraden: 270 }),
    { stukken: 'alle' },
  );
  const lijn = [...perLijn(rijen).values()].find(st => lok(st[0]).by > 40)!;
  const [west, oost] = lijn;
  // begin aan de westkant: 2 m kopakker aan de west-uiteinden, 4 m aan de oost-uiteinden
  dichtbij(lok(west).bx, 2, CM, 'begin west');
  dichtbij(lok(west).ex, 30 - 4, CM, 'eind west');
  dichtbij(lok(oost).bx, 40 + 2, CM, 'begin oost');
  dichtbij(lok(oost).ex, 60 - 4, CM, 'eind oost');
  dichtbij(west.lengteM, 24, CM, 'lengte west');
  dichtbij(oost.lengteM, 14, CM, 'lengte oost');
  // volgorde langs d (oost) blijft: west eerst, ook met de beginkant omgedraaid
  assert.strictEqual(west.stukIndex, 0);
  assert.strictEqual(oost.stukIndex, 1);
  assert.ok(west.langsM! < oost.langsM!);
});

test("MultiPolygon achter elkaar 'alle': beide delen een rij, beide controleren", () => {
  const perceel = multiPolygoon(
    [lokaal([[0, 0], [30, 0], [30, 100], [0, 100]])],
    [lokaal([[0, 120], [30, 120], [30, 150], [0, 150]])],
  );
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }), { stukken: 'alle' });
  controleerSortering(rijen);
  assert.strictEqual(rijen.length, 20);
  const lijnen = perLijn(rijen);
  assert.strictEqual(lijnen.size, 10);
  for (const [zuid, noord] of lijnen.values()) {
    for (const r of [zuid, noord]) {
      assert.strictEqual(r.controleren, true);
      assert.strictEqual(r.aantalStukken, 2);
    }
    assert.strictEqual(zuid.stukIndex, 0);
    assert.strictEqual(noord.stukIndex, 1);
    dichtbij(zuid.lengteM, 88, CM, 'lengte zuidelijk deel');
    dichtbij(lok(zuid).by, 94, CM, 'begin zuid');
    dichtbij(lok(zuid).ey, 6, CM, 'eind zuid');
    dichtbij(noord.lengteM, 18, CM, 'lengte noordelijk deel');
    dichtbij(lok(noord).by, 144, CM, 'begin noord');
    dichtbij(lok(noord).ey, 126, CM, 'eind noord');
    dichtbij(noord.langsM! - zuid.langsM!, 135 - 50, CM, 'afstand tussen de middens');
  }
  // rij-oppervlak: 10 × (88 + 18) × 3 m
  dichtbij(rijOppervlakHa(rijen.map(r => ({ lengteM: r.lengteM, rijafstandM: 3 }))), 0.318, 1e-4, 'oppervlak');
});

test("polygoon met gat 'alle': rijen door het gat worden twee stukken", () => {
  // 60 × 100 m met gat x 20..40, y 30..50 → stukken [0,30] en [50,100]
  const perceel = polygoon(
    lokaal([[0, 0], [60, 0], [60, 100], [0, 100]]),
    lokaal([[20, 30], [40, 30], [40, 50], [20, 50]]),
  );
  const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }), { stukken: 'alle' });
  controleerSortering(rijen);
  const lijnen = perLijn(rijen);
  assert.strictEqual(lijnen.size, 20);
  let doorGat = 0;
  for (const stukken of lijnen.values()) {
    const x = lok(stukken[0]).bx;
    if (x > 20 && x < 40) {
      doorGat++;
      assert.strictEqual(stukken.length, 2);
      const [zuid, noord] = stukken;
      assert.ok(zuid.controleren && noord.controleren);
      dichtbij(zuid.lengteM, 30 - 12, CM, 'zuidelijk stuk');
      dichtbij(lok(zuid).by, 24, CM, 'begin zuid (kopakker aan het gat)');
      dichtbij(noord.lengteM, 50 - 12, CM, 'noordelijk stuk');
      dichtbij(lok(noord).ey, 56, CM, 'eind noord (kopakker aan het gat)');
    } else {
      assert.strictEqual(stukken.length, 1);
      assert.strictEqual(stukken[0].controleren, false);
      dichtbij(stukken[0].lengteM, 88, CM, 'lengte');
    }
  }
  assert.strictEqual(doorGat, 6);
  assert.strictEqual(rijen.length, 26);
  // 'alle' levert precies de zuidelijke stukken extra op t.o.v. 'langste'
  const langste = genereerRijen(perceel, params({ richtingGraden: 0 }));
  const som = (rs: GegenereerdeRij[]) => rs.reduce((t, r) => t + r.lengteM, 0);
  dichtbij(som(rijen) - som(langste), 6 * 18, CM, 'extra rijlengte');
});

test("openingen < 1 m blijven overbrugd, ook bij 'alle'", () => {
  const paal = polygoon(
    lokaal([[0, 0], [60, 0], [60, 100], [0, 100]]),
    lokaal([[31.2, 49.7], [31.8, 49.7], [31.8, 50.3], [31.2, 50.3]]),
  );
  const naad = multiPolygoon(
    [lokaal([[0, 0], [30, 0], [30, 100], [0, 100]])],
    [lokaal([[0, 100.005], [30, 100.005], [30, 150], [0, 150]])],
  );
  for (const [perceel, aantal, lengte] of [[paal, 20, 88], [naad, 10, 138]] as const) {
    const rijen = genereerRijen(perceel, params({ richtingGraden: 0 }), { stukken: 'alle' });
    assert.strictEqual(rijen.length, aantal);
    for (const r of rijen) {
      assert.strictEqual(r.controleren, false);
      assert.strictEqual(r.aantalStukken, 1);
      dichtbij(r.lengteM, lengte, CM, 'lengte');
    }
  }
});

test("'langste' blijft identiek op alle bestaande vormen (met en zonder opties)", () => {
  const vormen: [PerceelRD, number][] = [
    [polygoon(rechthoek(30, 100, 60)), 30],
    [uVorm(), 90],
    [uVorm(), 0],
    [multiPolygoon(
      [lokaal([[0, 0], [30, 0], [30, 100], [0, 100]])],
      [lokaal([[0, 102], [30, 102], [30, 150], [0, 150]])],
    ), 0],
    [polygoon(
      lokaal([[0, 0], [60, 0], [60, 100], [0, 100]]),
      lokaal([[20, 30], [40, 30], [40, 50], [20, 50]]),
    ), 17],
  ];
  for (const [perceel, theta] of vormen) {
    const p = params({ richtingGraden: theta });
    const a = genereerRijen(perceel, p);
    assert.deepStrictEqual(genereerRijen(perceel, p, { stukken: 'langste' }), a);
    assert.deepStrictEqual(genereerRijen(perceel, p, { minLengteM: 5 }), a);
    // langste = per lijn het langste stuk van 'alle'
    const alle = perLijn(genereerRijen(perceel, p, { stukken: 'alle' }));
    assert.strictEqual(alle.size, a.length);
    for (const r of a) {
      const stukken = alle.get(r.offsetM)!;
      const max = Math.max(...stukken.map(x => x.lengteM));
      dichtbij(r.lengteM, max, 1e-9, 'langste stuk');
      assert.strictEqual(r.aantalStukken, stukken.length);
    }
  }
});

test('rijLangs: midden langs d, gelijk aan langsM (ook na de WGS-omweg)', () => {
  const perceel = polygoon(rechthoek(30, 100, 60));
  const rijen = genereerRijen(perceel, params({ richtingGraden: 30, kopakkerBeginM: 2, kopakkerEindM: 10 }));
  for (const r of rijen) {
    // begin aan de +d-kant: 2 m eraf aan de +d-kant, 10 m aan de −d-kant → midden 4 m langs d
    dichtbij(r.langsM!, 4, CM, 'langsM');
    dichtbij(rijLangs(perceel, 30, r.coordsRD), r.langsM!, 1e-9, 'rijLangs RD');
    dichtbij(rijLangs(perceel, 210, [r.coordsRD[1], r.coordsRD[0]]), r.langsM!, 1e-9, 'θ + 180 en omgedraaid');
    dichtbij(rijLangs(perceel, 30, r.coordinates.map(naarRD)), r.langsM!, 0.002, 'rijLangs via WGS');
  }
  assert.throws(() => rijLangs(perceel, 30, []));
});

// ---- Koppelen met stukken ----

console.log('\nKoppelen met stukken:');

/** Bestaande rijen zoals de UI ze aanlevert: offset/langs van de opgeslagen geometrie (7 decimalen) */
function alsBestaand(perceel: PerceelRD, theta: number, rijen: GegenereerdeRij[], ruis = false) {
  return rijen.map((r, i) => {
    const rd = ruis ? r.coordinates.map(rond7).map(naarRD) : r.coordsRD;
    return {
      id: `rij-${i}`,
      offsetM: rijOffset(perceel, theta, rd),
      langsM: rijLangs(perceel, theta, rd),
      lengteM: r.lengteM,
    };
  });
}

test("verschuiving 0,1 m behoudt alle id's, ook als twee stukken dezelfde offset hebben", () => {
  const perceel = uVorm();
  const oud = genereerRijen(perceel, params({ richtingGraden: 90, faseM: 1.5 }), { stukken: 'alle' });
  const nieuw = genereerRijen(perceel, params({ richtingGraden: 90, faseM: 1.6 }), { stukken: 'alle' });
  assert.strictEqual(nieuw.length, oud.length);
  assert.ok(oud.some(r => r.aantalStukken === 2));
  for (const ruis of [false, true]) {
    // omgekeerd aanleveren: de invoervolgorde mag niet uitmaken
    const bestaand = alsBestaand(perceel, 90, oud, ruis).reverse();
    const k = koppelRijenOpPositie(bestaand, nieuw, 1.5);
    assert.strictEqual(k.paren.length, oud.length, `paren (ruis ${ruis})`);
    assert.deepStrictEqual(k.nieuweIndexen, []);
    assert.deepStrictEqual(k.vervallenIds, []);
    k.paren.forEach(p => assert.strictEqual(p.id, `rij-${p.index}`, `kruiskoppeling (ruis ${ruis})`));
  }
});

test('zonder langsM/lengteM: oud gedrag, met kruiskoppeling bij stukken op dezelfde offset', () => {
  const perceel = uVorm();
  const oud = genereerRijen(perceel, params({ richtingGraden: 90, faseM: 1.5 }), { stukken: 'alle' });
  const nieuw = genereerRijen(perceel, params({ richtingGraden: 90, faseM: 1.6 }), { stukken: 'alle' });
  const bestaand = alsBestaand(perceel, 90, oud).reverse().map(({ id, offsetM }) => ({ id, offsetM }));
  const k = koppelRijenOpPositie(bestaand, nieuw.map(r => ({ offsetM: r.offsetM })), 1.5);
  assert.strictEqual(k.paren.length, oud.length);
  assert.ok(k.paren.some(p => p.id !== `rij-${p.index}`), 'zonder langs is er kruiskoppeling');
  // langs aan maar één kant: ook oud gedrag
  const eenKant = koppelRijenOpPositie(bestaand, nieuw, 1.5);
  assert.deepStrictEqual(eenKant, k);
});

test("van 'langste' naar 'alle': het bestaande langste stuk houdt zijn id, de rest is nieuw", () => {
  const perceel = uVorm();
  const oud = genereerRijen(perceel, params({ richtingGraden: 90 }));
  const nieuw = genereerRijen(perceel, params({ richtingGraden: 90 }), { stukken: 'alle' });
  const k = koppelRijenOpPositie(alsBestaand(perceel, 90, oud, true), nieuw, 1.5);
  assert.strictEqual(k.paren.length, oud.length);
  assert.deepStrictEqual(k.vervallenIds, []);
  for (const p of k.paren) assert.strictEqual(nieuw[p.index].stukIndex, 0, 'gekoppeld aan het westelijke stuk');
  assert.strictEqual(k.nieuweIndexen.length, 20);
  for (const i of k.nieuweIndexen) assert.strictEqual(nieuw[i].stukIndex, 1);
  // en terug: de oostelijke stukken vervallen
  const terug = koppelRijenOpPositie(alsBestaand(perceel, 90, nieuw, true), oud, 1.5);
  assert.strictEqual(terug.paren.length, oud.length);
  assert.strictEqual(terug.vervallenIds.length, 20);
});

test('overlap < 50% van het kortste stuk → geen paar', () => {
  const b = [{ id: 'a', offsetM: 0, langsM: 0, lengteM: 10 }];
  const weinig = koppelRijenOpPositie(b, [{ offsetM: 0.1, langsM: 6, lengteM: 10 }], 1.5);
  assert.deepStrictEqual(weinig.paren, []);
  assert.deepStrictEqual(weinig.vervallenIds, ['a']);
  assert.deepStrictEqual(weinig.nieuweIndexen, [0]);
  const genoeg = koppelRijenOpPositie(b, [{ offsetM: 0.1, langsM: 5, lengteM: 10 }], 1.5);
  assert.deepStrictEqual(genoeg.paren, [{ id: 'a', index: 0 }]);
  // kort stuk helemaal binnen een lang stuk: 100% van het kortste
  const binnen = koppelRijenOpPositie(b, [{ offsetM: 0, langsM: -40, lengteM: 100 }], 1.5);
  assert.deepStrictEqual(binnen.paren, [{ id: 'a', index: 0 }]);
  // lang stuk dat het korte niet raakt
  const ernaast = koppelRijenOpPositie(b, [{ offsetM: 0, langsM: 60, lengteM: 100 }], 1.5);
  assert.deepStrictEqual(ernaast.paren, []);
  // |Δoffset| > max blijft uitsluiten
  assert.deepStrictEqual(koppelRijenOpPositie(b, [{ offsetM: 1.6, langsM: 0, lengteM: 10 }], 1.5).paren, []);
});

test('lange bestaande rij over twee nieuwe stukken: het stuk met de kleinste |Δlangs| wint', () => {
  const k = koppelRijenOpPositie(
    [{ id: 'lang', offsetM: 0, langsM: 0, lengteM: 100 }],
    [{ offsetM: 0.1, langsM: -30, lengteM: 40 }, { offsetM: 0.1, langsM: 25, lengteM: 50 }],
    1.5,
  );
  assert.deepStrictEqual(k.paren, [{ id: 'lang', index: 1 }]);
  assert.deepStrictEqual(k.nieuweIndexen, [0]);
});

test('twee bestaande stukken met afrondingsruis op één lijn: |Δlangs| beslist, niet de ruis', () => {
  // 'a' ligt 3 mm dichterbij, maar 'b' past langs de rij beter
  const k = koppelRijenOpPositie(
    [{ id: 'a', offsetM: 0.003, langsM: -30, lengteM: 40 }, { id: 'b', offsetM: -0.004, langsM: 25, lengteM: 50 }],
    [{ offsetM: 0, langsM: 0, lengteM: 100 }],
    1.5,
  );
  assert.deepStrictEqual(k.paren, [{ id: 'b', index: 0 }]);
  assert.deepStrictEqual(k.vervallenIds, ['a']);
});

// ---- Nummering met stukken ----

console.log('\nNummering met stukken:');

test('bepaalNummers met langs: stukken op dezelfde offset op langs oplopend', () => {
  const offsets = [0, 0, 3, 3];
  const langs = [10, -10, -10, 10];
  assert.deepStrictEqual(bepaalNummers(offsets, 1, 1, langs), [2, 1, 3, 4]);
  // zonder langs: op invoerindex (index 0 komt dan vóór de startrij)
  assert.deepStrictEqual(bepaalNummers(offsets, 1, 1), [0, 1, 2, 3]);
  // ongeldige start → laagste lijn, kleinste langs
  assert.deepStrictEqual(bepaalNummers(offsets, -1, 1, langs), [2, 1, 3, 4]);
  // afrondingsruis (< 10 cm) telt als dezelfde lijn
  assert.deepStrictEqual(bepaalNummers([0.004, -0.003, 3.002, 2.996], 1, 1, langs), [2, 1, 3, 4]);
});

test('bepaalNummers met langs: start aan de hoge kant, vanaf beide stukken', () => {
  const offsets = [0, 0, 3, 3];
  const langs = [10, -10, -10, 10];
  // startrij = grootste langs van zijn lijn → op elke lijn eerst de grote langs
  assert.deepStrictEqual(bepaalNummers(offsets, 3, 1, langs), [3, 4, 2, 1]);
  // startrij = kleinste langs → die krijgt 1, geen nummer 0 voor het andere stuk
  assert.deepStrictEqual(bepaalNummers(offsets, 2, 1, langs), [4, 3, 1, 2]);
  assert.deepStrictEqual(bepaalNummers(offsets, 2, 10, langs), [13, 12, 10, 11]);
});

test('bepaalNummers met langs: zonder gelijke offsets identiek aan zonder langs', () => {
  for (const [offsets, start, nr] of [
    [[5, -1, 3, 1], 1, 1],
    [[5, -1, 3, 1], 0, 1],
    [[0, 3, 6, 9, 12], 2, 10],
    [[0, 3, 6, 9, 12], 3, 10],
  ] as [number[], number, number][]) {
    const langs = offsets.map((_, i) => (i * 37) % 11);
    assert.deepStrictEqual(bepaalNummers(offsets, start, nr, langs), bepaalNummers(offsets, start, nr));
  }
  // langs met een andere lengte wordt genegeerd
  assert.deepStrictEqual(bepaalNummers([0, 0, 3], 1, 1, [5]), bepaalNummers([0, 0, 3], 1, 1));
  assert.deepStrictEqual(bepaalNummers([], 0, 1, []), []);
});

test('vindStartIndex met langs: kleinste langs op de uiterste lijn', () => {
  const offsets = [0, 0.004, 3, 3];
  const langs = [5, -5, 8, -8];
  assert.strictEqual(vindStartIndex(offsets, 0, 270), 0);
  assert.strictEqual(vindStartIndex(offsets, 0, 270, langs), 1);
  assert.strictEqual(vindStartIndex(offsets, 0, 90), 2);
  assert.strictEqual(vindStartIndex(offsets, 0, 90, langs), 3);
  assert.strictEqual(vindStartIndex(offsets, 0, 90, [1]), 2);
});

test("'alle' op de U-vorm: nummers 1..N uniek vanaf beide kanten, elke lijn in dezelfde richting", () => {
  const perceel = uVorm();
  const theta = 90;
  const rijen = genereerRijen(perceel, params({ richtingGraden: theta }), { stukken: 'alle' });
  // zoals opgeslagen (ruis) en in willekeurige volgorde
  const bestaand = alsBestaand(perceel, theta, rijen, true).reverse();
  const offsets = bestaand.map(r => r.offsetM);
  const langs = bestaand.map(r => r.langsM);
  for (const oplopend of [true, false]) {
    const start = vindStartIndex(offsets, theta, startzijdeGraden(theta, oplopend), langs);
    const nummers = bepaalNummers(offsets, start, 1, langs);
    assert.strictEqual(nummers[start], 1);
    assert.deepStrictEqual([...nummers].sort((a, b) => a - b), rijen.map((_, i) => i + 1));
    // op elke onderbroken lijn heeft het westelijke stuk het lagere nummer
    const opId = new Map(bestaand.map((r, i) => [r.id, nummers[i]]));
    for (const stukken of perLijn(rijen).values()) {
      if (stukken.length < 2) continue;
      const [west, oost] = stukken.map(r => opId.get(`rij-${rijen.indexOf(r)}`)!);
      assert.strictEqual(oost - west, 1, `west ${west}, oost ${oost}`);
    }
  }
});

test('bepaalNummers met langs: drie stukken, start op het middelste stuk', () => {
  const offsets = [0, 0, 0, 3];
  const langs = [-50, 0, 50, 0];
  // middelste stuk = start: lijn oplopend op langs, het eerste stuk krijgt startnummer − 1
  assert.deepStrictEqual(bepaalNummers(offsets, 1, 1, langs), [0, 1, 2, 3]);
  // buitenste stuk aan de hoge-langskant: die lijn (en elke lijn) telt aflopend op langs
  assert.deepStrictEqual(bepaalNummers(offsets, 2, 1, langs), [3, 2, 1, 4]);
});

// ---- Robuustheid: willekeurige vormen (vaste seed) ----

console.log('\nRobuustheid stukken (willekeurige vormen):');

test("willekeurige vormen: 'alle' binnen het perceel, 'langste' ⊂ 'alle', koppelen en nummeren zonder kruisingen", () => {
  let seed = 20261007;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const vormen: (() => PerceelRD)[] = [
    () => {
      // stervorm met inhammen
      const n = 6 + Math.floor(rnd() * 10);
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const r = 30 + rnd() * 90;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return polygoon(lokaal(pts));
    },
    () => {
      const w = 40 + rnd() * 80;
      const h = 60 + rnd() * 120;
      const x0 = w * (0.2 + rnd() * 0.3);
      const x1 = x0 + 3 + rnd() * w * 0.3;
      const y0 = h * (0.1 + rnd() * 0.6);
      return polygoon(lokaal([[0, 0], [w, 0], [w, h], [x1, h], [x1, y0], [x0, y0], [x0, h], [0, h]]));
    },
    () => {
      const w = 60 + rnd() * 80;
      const h = 60 + rnd() * 120;
      const gx = 5 + rnd() * (w - 30);
      const gy = 5 + rnd() * (h - 30);
      const gw = 2 + rnd() * 20;
      const gh = 2 + rnd() * 20;
      return polygoon(
        lokaal([[0, 0], [w, 0], [w, h], [0, h]]),
        lokaal([[gx, gy], [gx + gw, gy], [gx + gw, gy + gh], [gx, gy + gh]]),
      );
    },
    () => {
      const w = 30 + rnd() * 60;
      const h1 = 30 + rnd() * 80;
      const gat = rnd() < 0.3 ? rnd() * 1.5 : 1 + rnd() * 10;
      const h2 = 10 + rnd() * 50;
      const dx = (rnd() - 0.5) * 20;
      return multiPolygoon(
        [lokaal([[0, 0], [w, 0], [w, h1], [0, h1]])],
        [lokaal([[dx, h1 + gat], [dx + w, h1 + gat], [dx + w, h1 + gat + h2], [dx, h1 + gat + h2]])],
      );
    },
  ];
  let onderbroken = 0;
  for (let it = 0; it < 120; it++) {
    const perceel = vormen[it % vormen.length]();
    const theta = rnd() * 180;
    const s = 2.5 + rnd() * 2;
    const p = params({
      richtingGraden: theta,
      rijafstandM: s,
      faseM: rnd() * s,
      kopakkerBeginM: rnd() * 8,
      kopakkerEindM: rnd() * 8,
      beginkantGraden: rnd() < 0.5 ? null : rnd() * 360,
    });
    const langste = genereerRijen(perceel, p);
    const alle = genereerRijen(perceel, p, { stukken: 'alle' });
    controleerSortering(alle);
    const lijnen = perLijn(alle);
    assert.strictEqual(lijnen.size, langste.length, `lijnen (it ${it})`);
    for (const stukken of lijnen.values()) {
      stukken.forEach((r, i) => {
        assert.strictEqual(r.stukIndex, i);
        assert.strictEqual(r.aantalStukken, stukken.length);
        assert.strictEqual(r.controleren, stukken.length > 1);
        // midden (of, in een overbrugde opening < 1 m, een punt 0,6 m ernaast) ligt in het perceel
        const op = (f: number): XY => [
          r.coordsRD[0][0] + f * (r.coordsRD[1][0] - r.coordsRD[0][0]),
          r.coordsRD[0][1] + f * (r.coordsRD[1][1] - r.coordsRD[0][1]),
        ];
        const f = 0.6 / r.lengteM;
        assert.ok(
          [0.5, 0.5 - f, 0.5 + f].some(x => puntInPerceel(op(x), perceel)),
          `midden buiten het perceel (it ${it})`,
        );
        if (i > 0) {
          const v = stukken[i - 1];
          assert.ok(v.langsM! + v.lengteM / 2 <= r.langsM! - r.lengteM / 2 + 1e-6, `stukken overlappen (it ${it})`);
        }
      });
      if (stukken.length > 1) onderbroken++;
    }
    for (const r of langste) {
      const stukken = lijnen.get(r.offsetM)!;
      assert.ok(stukken.some(x => x.coordsRD[0][0] === r.coordsRD[0][0] && x.coordsRD[1][1] === r.coordsRD[1][1]));
      assert.strictEqual(r.aantalStukken, stukken.length);
    }

    // Opnieuw genereren na een kleine verschuiving, bestaande rijen met afrondingsruis en geschud
    const delta = 0.02 + rnd() * 0.3;
    const verschoven = genereerRijen(perceel, { ...p, faseM: p.faseM + delta }, { stukken: 'alle' });
    const bestaand = alsBestaand(perceel, theta, alle, true);
    for (let i = bestaand.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bestaand[i], bestaand[j]] = [bestaand[j], bestaand[i]];
    }
    const k = koppelRijenOpPositie(bestaand, verschoven, s / 2);
    const opId = new Map(bestaand.map(b => [b.id, b] as const));
    for (const paar of k.paren) {
      const b = opId.get(paar.id)!;
      const x = verschoven[paar.index];
      const overlap =
        Math.min(b.langsM + b.lengteM / 2, x.langsM! + x.lengteM / 2) -
        Math.max(b.langsM - b.lengteM / 2, x.langsM! - x.lengteM / 2);
      assert.ok(overlap >= 0.5 * Math.min(b.lengteM, x.lengteM) - 1e-6, `kruiskoppeling (it ${it})`);
    }
    const vorm = (rs: GegenereerdeRij[], d0: number) =>
      rs.map(r => `${(r.offsetM - d0).toFixed(4)}:${r.stukIndex}/${r.aantalStukken}`).join(',');
    if (vorm(alle, 0) === vorm(verschoven, delta)) {
      assert.strictEqual(k.paren.length, alle.length, `alle id's behouden (it ${it})`);
      for (const paar of k.paren) {
        assert.strictEqual(verschoven[paar.index].stukIndex, alle[Number(paar.id.slice(4))].stukIndex);
      }
    }

    // Nummering op de opgeslagen rijen: 1..N, stukken van één lijn opeenvolgend en in één richting
    if (bestaand.length === 0) continue;
    const offs = bestaand.map(b => b.offsetM);
    const langs = bestaand.map(b => b.langsM);
    for (const oplopend of [true, false]) {
      const start = vindStartIndex(offs, theta, startzijdeGraden(theta, oplopend), langs);
      const nummers = bepaalNummers(offs, start, 1, langs);
      assert.strictEqual(nummers[start], 1);
      assert.deepStrictEqual([...nummers].sort((a, b) => a - b), bestaand.map((_, i) => i + 1));
      const richtingen = new Set<number>();
      const perOffset = new Map<number, number[]>();
      bestaand.forEach((b, i) => {
        const o = alle[Number(b.id.slice(4))].offsetM;
        perOffset.set(o, [...(perOffset.get(o) ?? []), i]);
      });
      for (const idx of perOffset.values()) {
        if (idx.length < 2) continue;
        idx.sort((a, b) => langs[a] - langs[b]);
        for (let j = 1; j < idx.length; j++) {
          const stap = nummers[idx[j]] - nummers[idx[j - 1]];
          assert.strictEqual(Math.abs(stap), 1, `stukken van één lijn opeenvolgend (it ${it})`);
          richtingen.add(stap);
        }
      }
      assert.ok(richtingen.size <= 1, `alle lijnen in dezelfde richting (it ${it})`);
    }
  }
  assert.ok(onderbroken > 100, `te weinig onderbroken lijnen getest: ${onderbroken}`);
});

// ---- Opslaan-plan na opnieuw genereren (maakOpslaanPlan) ----

console.log('\nOpslaan-plan (ID-mapping, nummering, opties):');

const BRON = { methode: 'handmatig' as const, confidence: null, bronBeeld: null };

/** Plan → opgeslagen rijen (zoals rijen_toepassen ze teruggeeft), met vaste id's per concept-index */
function slaPlanOp(
  plan: ReturnType<typeof maakOpslaanPlan>,
  concept: GegenereerdeRij[],
  oud: Rij[],
): { rijen: Rij[]; indexVan: Map<string, number> } {
  const perId = new Map(oud.map(r => [r.id, r] as const));
  const indexVan = new Map<string, number>();
  const rijen: Rij[] = [];
  for (const w of plan.rijen) {
    const index = w.coordinates ? concept.findIndex(c => c.coordinates === w.coordinates) : -1;
    const basis = w.id ? perId.get(w.id)! : null;
    const id = w.id ?? `nieuw-${w.sleutel}`;
    const coordinates = w.coordinates ?? basis!.coordinates;
    rijen.push({
      id, perceelId: 'p', blokId: null, blokNaam: null, nummer: w.nummer ?? basis!.nummer, label: null, rol: 'hoofd',
      ras: null, rasEffectief: null, plantjaar: null, plantjaarEffectief: null, onderstam: null, rijafstandM: 3,
      boomafstandM: null, lengteM: index >= 0 ? concept[index].lengteM : basis!.lengteM, aantalBomen: null,
      aantalBomenEffectief: null, geomBron: w.geomBron ?? basis?.geomBron ?? 'gegenereerd', nauwkeurigheidM: null,
      controleren: false, status: 'actief', geplantOp: null, gerooidOp: null, opmerking: null, coordinates, subParcelId: null,
    });
    if (index >= 0) indexVan.set(id, index);
  }
  return { rijen, indexVan };
}

function instellingenVan(plan: ReturnType<typeof maakOpslaanPlan>, startRijId: string | null = null): RijInstellingen {
  const i = plan.instellingen;
  return {
    perceelId: 'p', rijrichtingGraden: i.rijrichtingGraden ?? null, rijafstandM: i.rijafstandM ?? null, boomafstandM: null,
    faseM: i.faseM ?? null, kopakkerBeginM: i.kopakkerBeginM ?? 6, kopakkerEindM: i.kopakkerEindM ?? 6,
    beginkantGraden: i.beginkantGraden ?? null, nummeringStartzijdeGraden: i.nummeringStartzijdeGraden ?? null,
    nummeringStartRijId: startRijId, startnummer: i.startnummer ?? 1, bronBeeld: null, detectieMethode: 'handmatig',
    detectieConfidence: null, laatstGegenereerdOp: null,
  };
}

function eersteOpslag(perceel: PerceelRD, p: RijParameters) {
  const concept = genereerRijen(perceel, p);
  const plan = maakOpslaanPlan({ perceel, params: p, conceptRijen: concept, bestaand: [], instellingen: null, gekoppeld: new Set(), bron: BRON });
  return { concept, plan, ...slaPlanOp(plan, concept, []) };
}

test('draaien om het zwaartepunt: elke rij houdt zijn eigen rijlijn (geen koppeling aan de buurrij)', () => {
  // Lang, smal perceel (400 m langs de rij): rijen ver van het zwaartepunt verschoven bij het midden al bij 0,5°
  const theta = 12.3;
  const perceel = polygoon(rechthoek(theta + 7, 400, 150));
  const s = 3;
  const fase = 0.7;
  const p0 = params({ richtingGraden: theta, rijafstandM: s, faseM: fase });
  const eerst = eersteOpslag(perceel, p0);
  const kVan = (offset: number) => Math.round((offset - fase) / s);
  for (const delta of [0.5, 1, 2, 3]) {
    const p1 = { ...p0, richtingGraden: theta + delta };
    const concept = genereerRijen(perceel, p1);
    const plan = maakOpslaanPlan({
      perceel, params: p1, conceptRijen: concept, bestaand: eerst.rijen, instellingen: instellingenVan(eerst.plan),
      gekoppeld: new Set(), bron: BRON,
    });
    let verkeerd = 0;
    for (const w of plan.rijen) {
      if (!w.id) continue;
      const kOud = kVan(eerst.concept[eerst.indexVan.get(w.id)!].offsetM);
      const kNieuw = kVan(concept[concept.findIndex(c => c.coordinates === w.coordinates)].offsetM);
      if (kOud !== kNieuw) verkeerd++;
    }
    assert.strictEqual(verkeerd, 0, `δ=${delta}°: ${verkeerd} rijen aan de buurrij gekoppeld`);
  }
});

/** 100 × 61 m, θ = 0, s = 3, fase 1,5 → 20 rijen; fase 2,6 → 21 rijen (extra rij aan de lage kant) */
function randrijScenario() {
  const perceel = polygoon(rechthoek(0, 100, 61));
  const p0 = params({ richtingGraden: 0, rijafstandM: 3, faseM: 1.5 });
  const eerst = eersteOpslag(perceel, p0);
  const p1 = { ...p0, faseM: 2.6 };
  const concept = genereerRijen(perceel, p1);
  return { perceel, p1, concept, eerst };
}

test('extra rij aan de startzijde zonder vaste startrij: hernummering wordt geteld (bevestiging)', () => {
  const { perceel, p1, concept, eerst } = randrijScenario();
  assert.strictEqual(eerst.rijen.length, 20);
  assert.strictEqual(concept.length, 21);
  const plan = maakOpslaanPlan({
    perceel, params: p1, conceptRijen: concept, bestaand: eerst.rijen, instellingen: instellingenVan(eerst.plan),
    gekoppeld: new Set(), bron: BRON,
  });
  assert.strictEqual(plan.aantalNieuw, 1);
  assert.strictEqual(plan.aantalVervallen, 0);
  assert.strictEqual(plan.aantalHernummerd, 20);
  assert.deepStrictEqual(plan.voorbeeldHernummerd, { van: 1, naar: 2 });
  assert.strictEqual(plan.aantalOnderStart, 0);
});

test('extra rij vóór de aangewezen rij 1: nummer onder het startnummer wordt geteld (bevestiging)', () => {
  const { perceel, p1, concept, eerst } = randrijScenario();
  const rij1 = eerst.rijen.find(r => r.nummer === 1)!;
  const plan = maakOpslaanPlan({
    perceel, params: p1, conceptRijen: concept, bestaand: eerst.rijen, instellingen: instellingenVan(eerst.plan, rij1.id),
    gekoppeld: new Set(), bron: BRON,
  });
  assert.strictEqual(plan.aantalHernummerd, 0);
  assert.strictEqual(plan.aantalOnderStart, 1);
  assert.ok(plan.rijen.some(w => !w.id && w.nummer === 0), 'nieuwe rij krijgt nummer 0');
});

test('alleenBestaande: geen nieuwe rijen, nummers blijven, alleen de ligging verandert', () => {
  const { perceel, p1, concept, eerst } = randrijScenario();
  const plan = maakOpslaanPlan({
    perceel, params: p1, conceptRijen: concept, bestaand: eerst.rijen, instellingen: instellingenVan(eerst.plan),
    gekoppeld: new Set(), bron: BRON, alleenBestaande: true,
  });
  assert.strictEqual(plan.aantalNieuw, 0);
  assert.strictEqual(plan.aantalNieuwOvergeslagen, 1);
  assert.strictEqual(plan.aantalHernummerd, 0);
  assert.strictEqual(plan.rijen.length, 20);
  const perId = new Map(eerst.rijen.map(r => [r.id, r] as const));
  for (const w of plan.rijen) {
    assert.ok(w.id, 'alleen bestaande rijen');
    assert.strictEqual(w.nummer, perId.get(w.id!)!.nummer);
    assert.ok(w.coordinates, 'ligging wordt bijgewerkt');
  }
});

test('behoudGetekend: versleepte rij houdt haar ligging; zonder optie wordt ze overschreven', () => {
  const { perceel, p1, concept, eerst } = randrijScenario();
  const bestaand = eerst.rijen.map((r, i) => (i === 5 ? { ...r, geomBron: 'getekend' as const } : r));
  const gewoon = maakOpslaanPlan({
    perceel, params: p1, conceptRijen: concept, bestaand, instellingen: instellingenVan(eerst.plan), gekoppeld: new Set(), bron: BRON,
  });
  assert.strictEqual(gewoon.aantalGetekendOverschreven, 1);
  assert.strictEqual(gewoon.aantalGetekendBehouden, 0);
  const behoud = maakOpslaanPlan({
    perceel, params: p1, conceptRijen: concept, bestaand, instellingen: instellingenVan(eerst.plan), gekoppeld: new Set(), bron: BRON,
    behoudGetekend: true,
  });
  assert.strictEqual(behoud.aantalGetekendOverschreven, 0);
  assert.strictEqual(behoud.aantalGetekendBehouden, 1);
  const w = behoud.rijen.find(x => x.id === bestaand[5].id)!;
  assert.strictEqual(w.coordinates, undefined);
  assert.strictEqual(w.geomBron, undefined);
  assert.strictEqual(typeof w.nummer, 'number');
});

test('verschuiven zonder randeffect: niets hernummerd, geen bevestiging nodig', () => {
  const perceel = polygoon(rechthoek(0, 100, 60));
  const p0 = params({ richtingGraden: 0, rijafstandM: 3, faseM: 1.5 });
  const eerst = eersteOpslag(perceel, p0);
  const p1 = { ...p0, faseM: 1.6 };
  const plan = maakOpslaanPlan({
    perceel, params: p1, conceptRijen: genereerRijen(perceel, p1), bestaand: eerst.rijen, instellingen: instellingenVan(eerst.plan),
    gekoppeld: new Set(), bron: BRON,
  });
  assert.strictEqual(plan.aantalGekoppeld, 20);
  assert.strictEqual(plan.aantalHernummerd, 0);
  assert.strictEqual(plan.aantalOnderStart, 0);
  assert.strictEqual(plan.aantalVervallen, 0);
});

// ---- Summary ----

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
