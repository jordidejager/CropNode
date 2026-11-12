/**
 * Tests voor de perceelkaart (src/lib/rijen/perceelkaart.ts): buurrijen, afstanden langs de rij, ruimte tot de
 * perceelgrens, controles en het opknippen voor de MCP — op synthetische percelen met bekende maten (RD).
 *
 * Run: npx tsx src/__tests__/rijen-perceelkaart.test.ts
 */

import assert from 'node:assert';
import { naarWGS } from '../lib/rijen/geo';
import {
  bouwPerceelkaart,
  kopAfstand,
  nummersUitTekst,
  perceelkaartBestandsnaam,
  perceelkaartDeel,
  richtingRD,
  richtingWaar,
  rijStukken,
  ringenUitRd,
  type PerceelkaartInvoer,
} from '../lib/rijen/perceelkaart';
import type { XY } from '../lib/rijen/types';

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

const O: XY = [155000, 463000]; // oorsprong in RD
const p = (x: number, y: number): XY => [O[0] + x, O[1] + y];
const dicht = (a: number | null | undefined, b: number, tol = 0.002) => a != null && Math.abs(a - b) <= tol;

interface TestRij {
  nummer: number;
  punten: [number, number][];
  rijafstand?: number | null;
  boomafstand?: number | null;
  lengte?: number;
  buiten?: number | null;
  blok?: string | null;
  controleren?: boolean;
}

function invoer(rijen: TestRij[], opties?: { ringen?: [number, number][][]; actief?: number; rijafstand?: number | null }): PerceelkaartInvoer {
  const ringen = opties?.ringen ?? [[[0, 0], [40, 0], [40, 100], [0, 100], [0, 0]]];
  const rdRingen = ringen.map(r => r.map(([x, y]) => p(x, y)));
  return {
    exportTijd: '2026-11-12T12:00:00.000Z',
    perceel: {
      id: 'perceel-1',
      naam: 'Test Oost (2)',
      geometrie: { type: 'Polygon', coordinates: rdRingen.map(r => r.map(q => naarWGS(q))) },
      rd: rdRingen,
      oppervlakM2: 4000,
      oppervlakHaGeregistreerd: 0.4,
      grensBron: 'RVO_IMPORT',
      brpId: null,
    },
    instellingen: {
      rijrichtingGraden: 0,
      rijafstandM: opties?.rijafstand === undefined ? 3 : opties.rijafstand,
      boomafstandM: null,
      kopakkerBeginM: 4,
      kopakkerEindM: 4,
      beginkantGraden: 180,
      bronBeeld: 'PDOK Actueel_orthoHR',
      detectieMethode: 'auto',
      laatstGegenereerdOp: null,
    },
    rijen: rijen.map(r => {
      const rd = r.punten.map(([x, y]) => p(x, y));
      const lengte = rd.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - rd[i][0], q[1] - rd[i][1]), 0);
      return {
        feature: {
          type: 'Feature' as const,
          id: `rij-${r.nummer}`,
          geometry: { type: 'LineString' as const, coordinates: rd.map(q => naarWGS(q)) },
          properties: {
            id: `rij-${r.nummer}`,
            perceel_id: 'perceel-1',
            nummer: r.nummer,
            label: null,
            ras: 'Conference',
            plantjaar: 2018,
            onderstam: null,
            blok_id: r.blok ?? null,
            blok: r.blok ?? null,
            rol: 'hoofd',
            status: 'actief',
            lengte_m: r.lengte ?? Math.round(lengte * 100) / 100,
            rijafstand_m: r.rijafstand === undefined ? 3 : r.rijafstand,
            boomafstand_m: r.boomafstand ?? null,
            aantal_bomen: null,
            geom_bron: 'gegenereerd',
            nauwkeurigheid_m: null,
            controleren: r.controleren ?? false,
            geplant_op: null,
            gerooid_op: null,
            sub_parcel_id: null,
          },
        },
        rd,
        buitenGrensM: r.buiten === undefined ? 0 : r.buiten,
      };
    }),
    aantalActiefInCropnode: opties?.actief ?? rijen.length,
    aantalGerooid: 0,
  };
}

const rij = (kaart: ReturnType<typeof bouwPerceelkaart>, nummer: number) => {
  const f = kaart.features.find(x => x.properties.soort === 'rij' && x.properties.nummer === nummer);
  assert.ok(f, `rij ${nummer} ontbreekt`);
  return f.properties as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

console.log('\nPerceelkaart — regelmatig raster (noord-zuid, 3 m, kopakker 4 m):');
{
  // Rijen van zuid (begin) naar noord (eind) op x = 5, 8, 11, 14; perceel 40 × 100 m
  const xs = [5, 8, 11, 14];
  const kaart = bouwPerceelkaart(invoer(xs.map((x, i) => ({ nummer: i + 1, punten: [[x, 4], [x, 96]] }))));

  test('één perceel-feature en de rijen op nummer, met soort', () => {
    assert.strictEqual(kaart.features[0].properties.soort, 'perceel');
    assert.deepStrictEqual(kaart.features.slice(1).map(f => f.properties.nummer), [1, 2, 3, 4]);
    assert.ok(kaart.features.slice(1).every(f => f.properties.soort === 'rij'));
  });

  test('bestaande velden van de rijen-export ongewijzigd, nieuwe velden erbij', () => {
    const r = rij(kaart, 2);
    for (const veld of ['id', 'nummer', 'label', 'ras', 'plantjaar', 'onderstam', 'blok', 'rol', 'status', 'lengte_m', 'rijafstand_m', 'boomafstand_m', 'aantal_bomen', 'geom_bron', 'nauwkeurigheid_m', 'controleren']) {
      assert.ok(veld in r, `veld ${veld} ontbreekt`);
    }
    assert.strictEqual(r.ras, 'Conference');
    assert.strictEqual(r.plantjaar, 2018);
    for (const veld of ['kop_begin_achter', 'kop_eind_achter', 'eerste_boom_m', 'lege_plekken', 'herplant', 'kroonbreedte_m', 'boomhoogte_m', 'hagelnet', 'nethoogte_m', 'paalafstand_m']) {
      assert.ok(veld in r, `veld ${veld} ontbreekt`);
      assert.strictEqual(r[veld], null, `${veld} hoort null te zijn`);
    }
    assert.ok(!('user_id' in r), 'geen user_id in het bestand');
  });

  test('rd = RD-punten met 3 decimalen; richting begin → eind = 0° (noord)', () => {
    const r = rij(kaart, 1);
    assert.deepStrictEqual(r.rd, [p(5, 4), p(5, 96)]);
    assert.ok(dicht(r.richting_graden, 0, 0.01) || dicht(r.richting_graden, 360, 0.01), `${r.richting_graden}`);
    assert.ok(typeof r.richting_graden_ware_noorden === 'number');
  });

  test('buren links/rechts gezien in de rijrichting; rand = null', () => {
    // Naar het noorden kijkend ligt links het westen (kleinere x)
    assert.strictEqual(rij(kaart, 2).buur_links_id, 'rij-1');
    assert.strictEqual(rij(kaart, 2).buur_rechts_id, 'rij-3');
    assert.strictEqual(rij(kaart, 2).buur_links_nummer, 1);
    assert.strictEqual(rij(kaart, 1).buur_links_id, null);
    assert.strictEqual(rij(kaart, 4).buur_rechts_id, null);
    assert.strictEqual(rij(kaart, 1).afstand_links_m, null);
  });

  test('afstand hart op hart: min = mediaan = max = 3,000; profiel om de 10 m', () => {
    const r = rij(kaart, 2);
    for (const a of [r.afstand_links_m, r.afstand_rechts_m]) {
      assert.ok(dicht(a.min, 3) && dicht(a.mediaan, 3) && dicht(a.max, 3), JSON.stringify(a));
    }
    assert.deepStrictEqual(r.afstand_profiel.map((x: number[]) => x[0]), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    assert.ok(r.afstand_profiel.every((x: (number | null)[]) => dicht(x[1], 3) && dicht(x[2], 3)));
  });

  test('kop_begin_m en kop_eind_m = 4 m tot de perceelgrens', () => {
    for (const n of [1, 2, 3, 4]) {
      assert.ok(dicht(rij(kaart, n).kop_begin_m, 4) && dicht(rij(kaart, n).kop_eind_m, 4), `rij ${n}`);
    }
  });

  test('metadata en controles: alles in orde, boomafstand ontbreekt (info)', () => {
    const m = kaart.metadata;
    assert.strictEqual(m.schema_versie, '1.0');
    assert.strictEqual(m.perceel_naam, 'Test Oost (2)');
    assert.strictEqual(m.aantal_rijen_actief, 4);
    assert.strictEqual(m.geplant_op_gps, null);
    assert.strictEqual(m.opnamedatum, null);
    assert.strictEqual(m.brp_jaar, null);
    assert.strictEqual(m.oppervlak_ha, 0.4);
    assert.ok(m.conventies.boomnummering.includes('(n-1) x boomafstand'));
    assert.strictEqual(m.controles.ok, true);
    assert.deepStrictEqual(m.controles.zonder_boomafstand, [1, 2, 3, 4]);
    assert.ok(m.controles.meldingen.some(x => x.soort === 'info' && x.tekst.includes('boomafstand')));
    assert.ok(m.controles.meldingen.filter(x => x.soort !== 'info').every(x => x.soort === 'ok'));
  });
}

console.log('\nPerceelkaart — onregelmatig (gebogen rij, ontbrekende rij, stukken, inham):');
{
  test('gebogen buurrij: afstand loopt op langs de rij (min/max en profiel)', () => {
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[10, 4], [10, 96]] },
      { nummer: 2, punten: [[13, 4], [13, 50], [13.6, 96]] },
    ]));
    const a = rij(kaart, 1).afstand_rechts_m;
    assert.ok(dicht(a.min, 3) && a.max > 3.55 && a.max < 3.61, JSON.stringify(a));
    const prof = rij(kaart, 1).afstand_profiel;
    assert.ok(dicht(prof[2][2], 3) && prof[9][2] > 3.4, JSON.stringify(prof));
  });

  test('ontbrekende rij: buur op 2 × de rijafstand telt nog, op 4 × niet', () => {
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[5, 4], [5, 96]] },
      { nummer: 2, punten: [[11, 4], [11, 96]] }, // rij op x = 8 ontbreekt
      { nummer: 3, punten: [[23, 4], [23, 96]] }, // 12 m verder (pad)
    ]));
    assert.strictEqual(rij(kaart, 1).buur_rechts_id, 'rij-2');
    assert.ok(dicht(rij(kaart, 1).afstand_rechts_m.mediaan, 6));
    assert.strictEqual(rij(kaart, 2).buur_rechts_id, null);
    assert.strictEqual(rij(kaart, 3).buur_links_id, null);
  });

  test('stukken op dezelfde rijlijn zijn geen buren; buur = stuk met de meeste overlap; gat in het profiel', () => {
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[5, 4], [5, 96]] },
      { nummer: 2, punten: [[8, 4], [8, 30]] },
      { nummer: 3, punten: [[8, 40], [8, 96]] },
    ]));
    assert.strictEqual(rij(kaart, 2).buur_rechts_id, null);
    assert.strictEqual(rij(kaart, 3).buur_rechts_id, null);
    assert.strictEqual(rij(kaart, 1).buur_rechts_id, 'rij-3');
    const prof = rij(kaart, 1).afstand_profiel as (number | null)[][];
    assert.ok(dicht(prof[1][2], 3), 'op 10 m (stuk 2)');
    assert.strictEqual(prof[3][2], null, 'op 30 m: tussen de stukken');
    assert.ok(dicht(prof[5][2], 3), 'op 50 m (stuk 3)');
  });

  test('inham: ruimte tot de rand van de inham, niet tot de buitenrand', () => {
    // Bovenrand met een inham van x 10–20 tot y = 80
    const ringen: [number, number][][] = [[[0, 0], [40, 0], [40, 100], [20, 100], [20, 80], [10, 80], [10, 100], [0, 100], [0, 0]]];
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[5, 4], [5, 96]] },
      { nummer: 2, punten: [[15, 4], [15, 76]], controleren: true },
    ], { ringen }));
    assert.ok(dicht(rij(kaart, 1).kop_eind_m, 4));
    assert.ok(dicht(rij(kaart, 2).kop_eind_m, 4));
    assert.deepStrictEqual(kaart.metadata.controles.controleren, [2]);
  });

  test('uiteinde buiten de grens: kop negatief en controle noemt de rij', () => {
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[5, 4], [5, 102]], buiten: 1.0 },
      { nummer: 2, punten: [[8, 4], [8, 96]] },
    ]));
    assert.ok(dicht(rij(kaart, 1).kop_eind_m, -2), `${rij(kaart, 1).kop_eind_m}`);
    const c = kaart.metadata.controles;
    assert.strictEqual(c.binnen_grens.ok, false);
    assert.deepStrictEqual(c.binnen_grens.buiten, [{ nummer: 1, buiten_m: 1 }]);
    assert.strictEqual(c.ok, false);
    assert.ok(c.meldingen.some(m => m.soort === 'let_op' && m.tekst.includes('rij 1')));
  });
}

console.log('\nPerceelkaart — controles:');
{
  test('rij die de andere kant op loopt (zelfde blok) wordt gemeld, niet omgedraaid', () => {
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[5, 4], [5, 96]] },
      { nummer: 2, punten: [[8, 96], [8, 4]] },
      { nummer: 3, punten: [[11, 4], [11, 96]] },
    ]));
    const c = kaart.metadata.controles;
    assert.strictEqual(c.richting.ok, false);
    assert.deepStrictEqual(c.richting.per_blok[0].tegen_de_rest_in, [2]);
    assert.deepStrictEqual(rij(kaart, 2).rd, [p(8, 96), p(8, 4)], 'ligging ongewijzigd');
    // Gezien in zijn eigen richting (naar het zuiden) ligt rij 3 links
    assert.strictEqual(rij(kaart, 2).buur_links_id, 'rij-3');
  });

  test('blokken met elk een eigen richting zijn in orde', () => {
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[5, 4], [5, 96]], blok: 'A' },
      { nummer: 2, punten: [[8, 4], [8, 96]], blok: 'A' },
      { nummer: 3, punten: [[20, 96], [20, 4]], blok: 'B' },
      { nummer: 4, punten: [[23, 96], [23, 4]], blok: 'B' },
    ]));
    assert.strictEqual(kaart.metadata.controles.richting.ok, true);
    assert.strictEqual(kaart.metadata.controles.richting.per_blok.length, 2);
  });

  test('aantal en lengte: afwijkingen worden gemeld', () => {
    const kaart = bouwPerceelkaart(invoer([
      { nummer: 1, punten: [[5, 4], [5, 96]], lengte: 92.2 },
      { nummer: 2, punten: [[8, 4], [8, 96]] },
    ], { actief: 3 }));
    const c = kaart.metadata.controles;
    assert.strictEqual(c.aantal_rijen.ok, false);
    assert.deepStrictEqual(c.lengte.afwijkend, [1]);
    assert.ok(dicht(c.lengte.max_afwijking_m, 0.2));
    assert.strictEqual(c.ok, false);
  });

  test('zonder perceelgrens: niet gecontroleerd, kop = null', () => {
    const inv = invoer([{ nummer: 1, punten: [[5, 4], [5, 96]], buiten: null }]);
    inv.perceel.rd = null;
    inv.perceel.geometrie = null;
    const kaart = bouwPerceelkaart(inv);
    assert.strictEqual(kaart.features[0].geometry, null);
    assert.strictEqual(rij(kaart, 1).kop_begin_m, null);
    assert.strictEqual(kaart.metadata.controles.binnen_grens.gecontroleerd, false);
  });
}

console.log('\nPerceelkaart — hulpfuncties en delen:');
{
  test('richtingRD en richtingWaar', () => {
    assert.ok(dicht(richtingRD([0, 0], [0, 10]), 0));
    assert.ok(dicht(richtingRD([0, 0], [10, 0]), 90));
    assert.ok(dicht(richtingRD([0, 0], [0, -10]), 180));
    assert.ok(dicht(richtingRD([0, 0], [-10, 0]), 270));
    assert.ok(dicht(richtingWaar([4, 52], [4, 52.01]), 0, 0.01));
    assert.ok(dicht(richtingWaar([4, 52], [4.01, 52]), 90, 0.01));
  });

  test('ringenUitRd: Polygon en MultiPolygon; kopAfstand met meerdere polygonen', () => {
    const poly = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
    assert.strictEqual(ringenUitRd(poly).length, 1);
    const multi = [poly, [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]]];
    const ringen = ringenUitRd(multi);
    assert.strictEqual(ringen.length, 2);
    assert.ok(dicht(kopAfstand([[25, 2], [25, 7]], 'eind', ringen), 3));
    assert.ok(dicht(kopAfstand([[25, 2], [25, 7]], 'begin', ringen), 2));
    assert.strictEqual(ringenUitRd(null).length, 0);
  });

  test('nummersUitTekst', () => {
    assert.deepStrictEqual([...(nummersUitTekst('1-3, 7') ?? [])], [1, 2, 3, 7]);
    assert.deepStrictEqual([...(nummersUitTekst('5–3') ?? [])], [3, 4, 5]);
    assert.strictEqual(nummersUitTekst('blok A'), null);
  });

  test('deel en stukken: metadata blijft, features alleen van het deel; stukken passen', () => {
    const xs = Array.from({ length: 20 }, (_, i) => 2 + i * 1.8);
    const kaart = bouwPerceelkaart(invoer(xs.map((x, i) => ({ nummer: i + 1, punten: [[x, 4], [x, 96]], rijafstand: 1.8 }))));
    const grens = perceelkaartDeel(kaart, 'grens');
    assert.deepStrictEqual(grens.features.map(f => f.properties.soort), ['perceel']);
    assert.strictEqual(grens.metadata.deel, 'grens');
    assert.ok(grens.metadata.controles.ok !== undefined);
    const sel = perceelkaartDeel(kaart, 'rijen', { nummers: new Set([2, 3]), tekst: '2-3' });
    assert.deepStrictEqual(sel.features.map(f => f.properties.nummer), [2, 3]);
    assert.strictEqual(sel.metadata.rijen_selectie, '2-3');
    assert.strictEqual(perceelkaartDeel(kaart, 'obstakels').features.length, 0);
    const max = 12_000;
    const stukken = rijStukken(kaart, max);
    assert.ok(stukken.length >= 2, stukken.join(' '));
    const alle = new Set<number>();
    for (const s of stukken) {
      const nummers = nummersUitTekst(s)!;
      nummers.forEach(n => alle.add(n));
      assert.ok(JSON.stringify(perceelkaartDeel(kaart, 'rijen', { nummers, tekst: s })).length <= max, `stuk ${s} te groot`);
    }
    assert.strictEqual(alle.size, 20);
  });

  test('bestandsnaam', () => {
    assert.strictEqual(perceelkaartBestandsnaam('Steketee Oost (2)'), 'perceelkaart-steketee-oost-2.geojson');
    assert.strictEqual(perceelkaartBestandsnaam('Murre'), 'perceelkaart-murre.geojson');
    assert.strictEqual(perceelkaartBestandsnaam(''), 'perceelkaart-perceel.geojson');
  });
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
