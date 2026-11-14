/**
 * Tests voor de rijencontrole (src/lib/rijen/controle.ts) op synthetische percelen (RD).
 *
 * Run: npx tsx src/__tests__/rijen-controle.test.ts
 */

import assert from 'node:assert';
import { naarWGS, perceelNaarRD } from '../lib/rijen/geo';
import { controleerRijen, type ControleRij } from '../lib/rijen/controle';
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

const O: XY = [155000, 463000];
const p = (x: number, y: number): XY => [O[0] + x, O[1] + y];
const perceel = perceelNaarRD({
  type: 'Polygon',
  coordinates: [[p(0, 0), p(60, 0), p(60, 100), p(0, 100), p(0, 0)].map(q => naarWGS(q))],
});
const rij = (nummer: number, punten: [number, number][], extra?: Partial<ControleRij>): ControleRij => ({
  id: `r${nummer}-${punten[0].join('_')}`,
  nummer,
  coordinates: punten.map(([x, y]) => naarWGS(p(x, y))),
  rasEffectief: 'Conference',
  ...extra,
});
const raster = (aantal: number, s = 3.4, x0 = 5) => Array.from({ length: aantal }, (_, i) => rij(i + 1, [[x0 + i * s, 4], [x0 + i * s, 96]]));
const regels = (b: ReturnType<typeof controleerRijen>, soort: string) => b.filter(x => x.soort === soort).map(x => x.regel);

console.log('\nRijencontrole:');

test('regelmatig raster: alles in orde', () => {
  const b = controleerRijen(raster(10), perceel);
  assert.deepStrictEqual(regels(b, 'let_op'), [], JSON.stringify(b.filter(x => x.soort === 'let_op')));
  for (const r of ['nummers', 'richting', 'grens', 'kruisen', 'afstand']) assert.ok(regels(b, 'ok').includes(r), r);
});

test('gat en dubbel nummer', () => {
  const rs = raster(6);
  rs[2].nummer = 2; // dubbel
  rs[4].nummer = 9; // gat 5–8 (en volgorde blijft oplopend)
  rs[5].nummer = 10;
  const b = controleerRijen(rs, perceel);
  const t = b.filter(x => x.regel === 'nummers').map(x => x.tekst).join(' | ');
  assert.ok(t.includes('Dubbel rijnummer: 2'), t);
  assert.ok(t.includes('ontbreekt: 3, 5, 6, 7, 8'), t);
});

test('rij andersom getekend', () => {
  const rs = raster(6);
  rs[3] = rij(4, [[5 + 3 * 3.4, 96], [5 + 3 * 3.4, 4]]);
  const b = controleerRijen(rs, perceel).find(x => x.regel === 'richting')!;
  assert.strictEqual(b.soort, 'let_op');
  assert.deepStrictEqual(b.rijIds, [rs[3].id]);
});

test('nummers niet oplopend vanaf één kant', () => {
  const rs = raster(6);
  rs[2].nummer = 4;
  rs[3].nummer = 3;
  const b = controleerRijen(rs, perceel).find(x => x.regel === 'volgorde');
  assert.ok(b && b.soort === 'let_op', JSON.stringify(b));
});

test('buiten de grens (> 1 m), maar 0,5 m erbuiten is goed', () => {
  const rs = raster(4);
  rs[0] = rij(1, [[5, 4], [5, 103]]);
  rs[1] = rij(2, [[8.4, 4], [8.4, 100.5]]);
  const b = controleerRijen(rs, perceel).filter(x => x.regel === 'grens');
  assert.strictEqual(b.length, 1, JSON.stringify(b));
  assert.ok(b[0].tekst.startsWith('Rij 1 ligt tot 3 m'), b[0].tekst);
});

test('rijen die elkaar kruisen', () => {
  const rs = raster(4);
  rs[1] = rij(2, [[8.4, 4], [12, 96]]); // kruist rij 3 (x = 11,8)
  const b = controleerRijen(rs, perceel).filter(x => x.regel === 'kruisen');
  assert.ok(b.some(x => x.soort === 'let_op' && x.tekst === 'Rij 2 kruist rij 3.'), JSON.stringify(b));
});

test('rijafstand: te dicht, te ver en een sprong (ontbrekende rij)', () => {
  const dicht = controleerRijen([rij(1, [[5, 4], [5, 96]]), rij(2, [[6.5, 4], [6.5, 96]])], perceel).find(x => x.regel === 'afstand')!;
  assert.ok(dicht.tekst.includes('minder dan 2 m'), dicht.tekst);
  const ver = controleerRijen([rij(1, [[5, 4], [5, 96]]), rij(2, [[12, 4], [12, 96]])], perceel).find(x => x.regel === 'afstand')!;
  assert.ok(ver.tekst.includes('meer dan 6 m'), ver.tekst);
  const rs = raster(8).filter((_, i) => i !== 4).map((r, i) => ({ ...r, nummer: i + 1 }));
  const sprong = controleerRijen(rs, perceel).filter(x => x.regel === 'afstand' && x.soort === 'let_op');
  assert.strictEqual(sprong.length, 1, JSON.stringify(sprong));
  assert.ok(sprong[0].tekst.includes('6,8 m uit elkaar (meer dan 6 m)'), sprong[0].tekst);
});

test('info: ras onbekend en controleren; stukken op één lijn zijn geen fout', () => {
  const rs = [
    rij(1, [[5, 4], [5, 96]], { rasEffectief: null }),
    rij(2, [[8.4, 4], [8.4, 40]], { controleren: true }),
    rij(3, [[8.4, 50], [8.4, 96]], { controleren: true }),
    rij(4, [[11.8, 4], [11.8, 96]]),
  ];
  const b = controleerRijen(rs, perceel);
  assert.deepStrictEqual(regels(b, 'let_op'), [], JSON.stringify(b.filter(x => x.soort === 'let_op')));
  assert.ok(b.some(x => x.regel === 'ras' && x.tekst === 'Ras onbekend bij rij 1.'));
  assert.ok(b.some(x => x.regel === 'controleren' && x.rijIds.length === 2));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
