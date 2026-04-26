/**
 * Unit tests for groupSprayableParcels helper.
 * Run with: npx tsx src/hooks/__tests__/group-sprayable-parcels.test.ts
 */
import assert from 'node:assert';
// Imports the pure helper from src/lib/parcel-grouping so no React/Supabase
// chain is loaded — keeps the test stand-alone runnable via `npx tsx`.
import { groupSprayableParcels } from '../../lib/parcel-grouping';
import type { GroupableParcel } from '../../lib/parcel-grouping';

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

function makeParcel(p: Partial<GroupableParcel>): GroupableParcel {
  return {
    id: p.id ?? 'sp-default',
    name: p.name ?? 'Default Sub',
    area: p.area ?? 1.0,
    crop: p.crop ?? 'Peer',
    variety: p.variety ?? null,
    parcelId: p.parcelId ?? 'parent-default',
    parcelName: p.parcelName ?? 'Default Parent',
    synonyms: p.synonyms ?? [],
  };
}

console.log('\ngroupSprayableParcels — Hiërarchie + sorteervolgorde:\n');

test('3 parcels met dezelfde parcelName → 1 groep met 3 subs', () => {
  const sps: GroupableParcel[] = [
    makeParcel({ id: 'a', name: 'Jan van W Achter Huis', parcelId: 'p1', parcelName: 'Jan van W', variety: 'Conference' }),
    makeParcel({ id: 'b', name: 'Jan van W Appels', parcelId: 'p2', parcelName: 'Jan van W', variety: 'Tessa' }),
    makeParcel({ id: 'c', name: 'Jan van W Lange Rijen', parcelId: 'p3', parcelName: 'Jan van W', variety: 'Conference' }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups.length, 1, 'Expected exactly 1 group');
  assert.strictEqual(groups[0].parcelName, 'Jan van W');
  assert.strictEqual(groups[0].subParcels.length, 3);
});

test('1 parcel met 3 subs → 1 groep met 3 subs', () => {
  const sps: GroupableParcel[] = [
    makeParcel({ id: 'a', name: 'Jachthoek 4Rijen', parcelId: 'p1', parcelName: 'Jachthoek' }),
    makeParcel({ id: 'b', name: 'Jachthoek Oude', parcelId: 'p1', parcelName: 'Jachthoek' }),
    makeParcel({ id: 'c', name: 'Jachthoek Nieuwe', parcelId: 'p1', parcelName: 'Jachthoek' }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].subParcels.length, 3);
});

test('Mixed: twee groepen met verschillende parcelName', () => {
  const sps: GroupableParcel[] = [
    makeParcel({ id: 'a', parcelId: 'p1', parcelName: 'Foo' }),
    makeParcel({ id: 'b', parcelId: 'p2', parcelName: 'Foo' }),
    makeParcel({ id: 'c', parcelId: 'p3', parcelName: 'Bar' }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups.length, 2);
  // Bar < Foo alfabetisch → eerst
  assert.strictEqual(groups[0].parcelName, 'Bar');
  assert.strictEqual(groups[1].parcelName, 'Foo');
  assert.strictEqual(groups[1].subParcels.length, 2);
});

test('Case-insensitive grouping: "jan van w" en "Jan van W" → 1 groep', () => {
  const sps: GroupableParcel[] = [
    makeParcel({ id: 'a', parcelName: 'Jan van W' }),
    makeParcel({ id: 'b', parcelName: 'jan van w' }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups.length, 1, 'Expected case-insensitive merge');
});

test('shortLabel: strip parent-prefix + trailing (variety)', () => {
  const sps: GroupableParcel[] = [
    makeParcel({
      id: 'a',
      name: 'Jachthoek Oude Conference (Conference)',
      parcelName: 'Jachthoek',
      variety: 'Conference',
    }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups[0].subParcels[0].shortLabel, 'Oude Conference');
});

test('shortLabel fallback naar variety als prefix-strip leeg laat', () => {
  const sps: GroupableParcel[] = [
    makeParcel({
      id: 'a',
      name: 'Jachthoek',
      parcelName: 'Jachthoek',
      variety: 'Conference',
    }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups[0].subParcels[0].shortLabel, 'Conference');
});

test('shortLabel fallback naar volledige name als alles leeg is', () => {
  const sps: GroupableParcel[] = [
    makeParcel({
      id: 'a',
      name: 'Iets Vrij',
      parcelName: 'Geen Match',
      variety: null,
    }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups[0].subParcels[0].shortLabel, 'Iets Vrij');
});

test('Sub-sortering: alfabetisch op shortLabel binnen groep', () => {
  const sps: GroupableParcel[] = [
    makeParcel({ id: 'a', name: 'Foo Zeta', parcelName: 'Foo', variety: 'Zeta' }),
    makeParcel({ id: 'b', name: 'Foo Alpha', parcelName: 'Foo', variety: 'Alpha' }),
    makeParcel({ id: 'c', name: 'Foo Mid', parcelName: 'Foo', variety: 'Mid' }),
  ];
  const groups = groupSprayableParcels(sps);
  const labels = groups[0].subParcels.map(s => s.shortLabel);
  assert.deepStrictEqual(labels, ['Alpha', 'Mid', 'Zeta']);
});

test('Lege array → lege array', () => {
  assert.deepStrictEqual(groupSprayableParcels([]), []);
});

test('parcelName ontbreekt → fallback naar parcel.name', () => {
  const sps: GroupableParcel[] = [
    makeParcel({ id: 'a', name: 'Standalone', parcelName: '' as unknown as string }),
  ];
  const groups = groupSprayableParcels(sps);
  assert.strictEqual(groups[0].parcelName, 'Standalone');
});

console.log(`\nResultaat: ${passed} geslaagd, ${failed} mislukt\n`);
process.exit(failed > 0 ? 1 : 0);
