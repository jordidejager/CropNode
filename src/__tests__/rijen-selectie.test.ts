/**
 * Rijenkaart — rijselectie tests
 * Run with: npx tsx src/__tests__/rijen-selectie.test.ts
 */

import assert from 'node:assert';
import { formatteerBereiken, parseRijSelectie, type SelecteerbareRij } from '../lib/rijen/selectie';

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

// ---- Testperceel ----
// 84 actieve rijen. Blok A = 1–30 (Conference), B = 31–60 (Elstar), Noordkant = 61–84 (Elstar,
// rij 70 Jonagold). Bestuivers: 10, 20, 30. Rij 2 heeft label "1A". Gerooid: een oude rij 5
// (er is ook een actieve rij 5) en rij 90.

const BLOKKEN = [
  { id: 'bA', naam: 'A' },
  { id: 'bB', naam: 'B' },
  { id: 'bN', naam: 'Noordkant' },
];

function maakRijen(): SelecteerbareRij[] {
  const rijen: SelecteerbareRij[] = [];
  for (let n = 1; n <= 84; n++) {
    const blok = n <= 30 ? BLOKKEN[0] : n <= 60 ? BLOKKEN[1] : BLOKKEN[2];
    rijen.push({
      id: `r${n}`,
      nummer: n,
      label: n === 2 ? '1A' : null,
      blokId: blok.id,
      blokNaam: blok.naam,
      rol: n % 10 === 0 && n <= 30 ? 'bestuiver' : 'hoofd',
      status: 'actief',
      rasEffectief: n === 70 ? 'Jonagold' : n <= 30 ? 'Conference' : 'Elstar',
    });
  }
  rijen.push({ id: 'oud5', nummer: 5, status: 'gerooid', blokId: 'bA', blokNaam: 'A', rasEffectief: 'Conference' });
  rijen.push({ id: 'g90', nummer: 90, status: 'gerooid', label: '7B', rasEffectief: 'Elstar' });
  return rijen;
}

const RIJEN = maakRijen();

function bereik(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function sel(tekst: string, rijen = RIJEN, blokken: { id: string; naam: string | null }[] | undefined = BLOKKEN) {
  return parseRijSelectie(tekst, rijen, blokken);
}

function verwacht(tekst: string, nummers: number[], rijen = RIJEN) {
  const r = sel(tekst, rijen);
  assert.deepStrictEqual(r.fouten, [], `"${tekst}": onverwachte fouten ${JSON.stringify(r.fouten)}`);
  assert.deepStrictEqual(r.nummers, nummers, `"${tekst}": nummers`);
  assert.strictEqual(r.rijIds.length, nummers.length, `"${tekst}": aantal id's`);
  assert.strictEqual(r.leeg, nummers.length === 0);
  return r;
}

// ---- Nummers en bereiken ----

console.log('\nNummers en bereiken:');

test('"1-20, 24" → 21 rijen met omschrijving', () => {
  const r = verwacht('1-20, 24', [...bereik(1, 20), 24]);
  assert.strictEqual(r.omschrijving, 'rij 1–20, 24 (21 rijen)');
  assert.deepStrictEqual(r.rijIds, [...bereik(1, 20), 24].map(n => `r${n}`));
});

test('en-dash, em-dash en spaties rond het streepje', () => {
  verwacht('1–20', bereik(1, 20));
  verwacht('1—20', bereik(1, 20));
  verwacht('1 - 20', bereik(1, 20));
  verwacht('1 – 20', bereik(1, 20));
});

test('"t/m", "tot en met", "tot", "tm"', () => {
  verwacht('1 t/m 20', bereik(1, 20));
  verwacht('1t/m20', bereik(1, 20));
  verwacht('1 tot en met 20', bereik(1, 20));
  verwacht('1 tot 20', bereik(1, 20));
  verwacht('rij 1 tm 20', bereik(1, 20));
  verwacht('rijen 1 T/M 20', bereik(1, 20));
});

test('"rij" herhaald in een bereik: "rij 1 tot rij 5", "van rij 1 t/m rij 5", "rij 1 - rij 5"', () => {
  verwacht('rij 1 tot rij 5', bereik(1, 5));
  verwacht('rij 1 t/m rij 5', bereik(1, 5));
  verwacht('van rij 1 tot rij 5', bereik(1, 5));
  verwacht('van 1 tot 5', bereik(1, 5));
  verwacht('rij 1 - rij 5', bereik(1, 5));
  verwacht('rijen 1 tm rij 3, rij 7', [1, 2, 3, 7]);
});

test('omgekeerd bereik "20-1" = 1–20', () => {
  verwacht('20-1', bereik(1, 20));
  verwacht('rij 20 t/m 1', bereik(1, 20));
});

test('"rij 3", "rijen 3 en 5", "nr 4", "nr. 4", "#6", "rij3"', () => {
  const r = verwacht('rij 3', [3]);
  assert.strictEqual(r.omschrijving, 'rij 3');
  assert.deepStrictEqual(r.rijIds, ['r3']);
  verwacht('rijen 3 en 5', [3, 5]);
  verwacht('Rijen 3 en 5', [3, 5]);
  verwacht('nr 4', [4]);
  verwacht('nr. 4', [4]);
  verwacht('#6', [6]);
  verwacht('rij3', [3]);
  verwacht('rijnummer 12', [12]);
  verwacht('rij nr 5', [5]);
  verwacht('rij nr. 5', [5]);
});

test('scheidingstekens ";", "+", "en", "&", spaties', () => {
  verwacht('3; 5 + 7 en 9 & 11', [3, 5, 7, 9, 11]);
  verwacht('rij 3 5 7', [3, 5, 7]);
  verwacht('rij 1 t/m 3 en rij 8', [1, 2, 3, 8]);
});

test('dubbelen weg, nummers gesorteerd', () => {
  const r = verwacht('5, 1-5, 3, 4, 5', bereik(1, 5));
  assert.strictEqual(r.omschrijving, 'rij 1–5 (5 rijen)');
  verwacht('30, 2, 17', [2, 17, 30]);
});

test('actieve rij gaat voor een gerooide rij met hetzelfde nummer', () => {
  const r = verwacht('rij 5', [5]);
  assert.deepStrictEqual(r.rijIds, ['r5']);
});

// ---- Labels ----

console.log('\nLabels:');

test('label "1A" (hoofdletterongevoelig, ook na "rij")', () => {
  const r = verwacht('1A', [2]);
  assert.deepStrictEqual(r.rijIds, ['r2']);
  verwacht('rij 1a', [2]);
  verwacht('rijen 1-3 en 1A', [1, 2, 3]);
  verwacht('1a, 7', [2, 7]);
});

test('onbekend label en gerooid label', () => {
  const r = sel('rij 1B');
  assert.ok(r.leeg);
  assert.deepStrictEqual(r.fouten, ["Rij '1B' niet gevonden (dit perceel heeft rijen 1–84)"]);
  assert.deepStrictEqual(sel('2C').fouten, ["Rij '2C' niet gevonden (dit perceel heeft rijen 1–84)"]);
  assert.deepStrictEqual(sel('7B').fouten, ['Rij 7B is gerooid']);
});

// ---- Blokken ----

console.log('\nBlokken:');

test('"blok A", "blok a", kale bloknaam "A" en "B"', () => {
  verwacht('blok A', bereik(1, 30));
  verwacht('blok a', bereik(1, 30));
  verwacht('A', bereik(1, 30));
  verwacht('b', bereik(31, 60));
  verwacht('blokken A en B', bereik(1, 60));
  verwacht('in blok B', bereik(31, 60));
});

test('gedeeltelijke unieke bloknaam', () => {
  verwacht('blok Noordkant', bereik(61, 84));
  verwacht('blok noord', bereik(61, 84));
  verwacht('noordkant', bereik(61, 84));
  verwacht('Noord', bereik(61, 84));
});

test('"alle rijen van blok B", "heel blok A", "de rijen in blok A", "rijen uit blok B"', () => {
  verwacht('alle rijen van blok B', bereik(31, 60));
  verwacht('heel blok A', bereik(1, 30));
  verwacht('hele blok A', bereik(1, 30));
  verwacht('de rijen van blok A', bereik(1, 30));
  verwacht('rijen in blok A', bereik(1, 30));
  verwacht('alle rijen uit blok B', bereik(31, 60));
  verwacht('rijen met ras Jonagold', [70]);
});

test('blokken worden ook uit de rijen afgeleid (zonder blokkenlijst)', () => {
  const r = parseRijSelectie('blok B', RIJEN);
  assert.deepStrictEqual(r.fouten, []);
  assert.deepStrictEqual(r.nummers, bereik(31, 60));
});

test('bloknaam met cijfer: "blok 3" vindt het blok, kaal "3" is een rijnummer', () => {
  const blokken = [{ id: 'x', naam: 'Blok 3' }, { id: 'y', naam: 'Blok 4' }];
  const rijen: SelecteerbareRij[] = [
    { id: 'a', nummer: 1, blokId: 'x' },
    { id: 'b', nummer: 2, blokId: 'x' },
    { id: 'c', nummer: 3, blokId: 'y' },
  ];
  assert.deepStrictEqual(parseRijSelectie('blok 3', rijen, blokken).rijIds, ['a', 'b']);
  assert.deepStrictEqual(parseRijSelectie('3', rijen, blokken).rijIds, ['c']);
});

test('onbekend blok → foutmelding met de bloknamen', () => {
  const r = sel('blok X', RIJEN, [{ id: 'bA', naam: 'A' }, { id: 'bB', naam: 'B' }]);
  assert.ok(r.leeg);
  // blok Noordkant is via de rijen bekend en hoort ook in de lijst
  assert.deepStrictEqual(r.fouten, ["Blok 'X' niet gevonden. Blokken: A, B, Noordkant"]);

  const tweeBlokken: SelecteerbareRij[] = [
    { id: 'a', nummer: 1, blokId: 'bA', blokNaam: 'A' },
    { id: 'b', nummer: 2, blokId: 'bB', blokNaam: 'B' },
  ];
  assert.deepStrictEqual(
    parseRijSelectie('blok X', tweeBlokken, [{ id: 'bA', naam: 'A' }, { id: 'bB', naam: 'B' }]).fouten,
    ["Blok 'X' niet gevonden. Blokken: A, B"],
  );
  assert.deepStrictEqual(
    parseRijSelectie('blok X', [{ id: 'a', nummer: 1 }]).fouten,
    ["Blok 'X' niet gevonden. Dit perceel heeft geen blokken"],
  );
});

test('dubbelzinnige gedeeltelijke bloknaam → fout', () => {
  const blokken = [{ id: 'n1', naam: 'Noord 1' }, { id: 'n2', naam: 'Noord 2' }];
  const rijen: SelecteerbareRij[] = [
    { id: 'a', nummer: 1, blokId: 'n1' },
    { id: 'b', nummer: 2, blokId: 'n2' },
  ];
  const r = parseRijSelectie('blok noord', rijen, blokken);
  assert.ok(r.leeg);
  assert.deepStrictEqual(r.fouten, ["Blok 'noord' is niet eenduidig: Noord 1, Noord 2"]);
  assert.deepStrictEqual(parseRijSelectie('noord 2', rijen, blokken).rijIds, ['b']);
});

// ---- Bestuivers, alle, ras ----

console.log('\nBestuivers, alle en ras:');

test('"bestuivers" / "bestuiverrijen" / "de bestuivers"', () => {
  verwacht('bestuivers', [10, 20, 30]);
  verwacht('bestuiverrijen', [10, 20, 30]);
  verwacht('Bestuiverrijen', [10, 20, 30]);
  verwacht('de bestuivers', [10, 20, 30]);
  verwacht('alle bestuivers', [10, 20, 30]);
  const geen = parseRijSelectie('bestuivers', [{ id: 'a', nummer: 1, rol: 'hoofd' }]);
  assert.deepStrictEqual(geen.fouten, ['Dit perceel heeft geen bestuiverrijen']);
});

test('"alle", "alles", "hele perceel", "het hele perceel" → alleen actieve rijen', () => {
  for (const t of ['alle', 'alles', 'Alle rijen', 'hele perceel', 'het hele perceel', 'heel perceel']) {
    const r = verwacht(t, bereik(1, 84));
    assert.ok(!r.rijIds.includes('g90') && !r.rijIds.includes('oud5'), `${t}: geen gerooide rijen`);
    assert.strictEqual(r.omschrijving, 'rij 1–84 (84 rijen)');
  }
});

test('"ras <naam>" selecteert op effectief ras', () => {
  verwacht('ras Elstar', [...bereik(31, 69), ...bereik(71, 84)]);
  verwacht('ras elstar', [...bereik(31, 69), ...bereik(71, 84)]);
  verwacht('ras jonagold', [70]);
  verwacht('ras conf', bereik(1, 30));
  verwacht('Conference', bereik(1, 30));
  verwacht('alle rijen met ras Jonagold', [70]);
});

test('onbekend ras → foutmelding met de rassen', () => {
  const r = sel('ras Golden');
  assert.ok(r.leeg);
  assert.deepStrictEqual(r.fouten, ["Ras 'Golden' niet gevonden. Rassen: Conference, Elstar, Jonagold"]);
});

test('"behalve" / "zonder" haalt rijen uit de selectie', () => {
  verwacht('alle behalve bestuivers', bereik(1, 84).filter(n => ![10, 20, 30].includes(n)));
  verwacht('blok A zonder 1-5', bereik(6, 30));
  verwacht('1-10 behalve 3 en 4', [1, 2, 5, 6, 7, 8, 9, 10]);
  verwacht('zonder bestuivers', bereik(1, 84).filter(n => ![10, 20, 30].includes(n)));
});

test('leestekens en aanhalingstekens', () => {
  verwacht('rij 3.', [3]);
  verwacht('rijen: 1-3', [1, 2, 3]);
  verwacht('blok "A"', bereik(1, 30));
  verwacht("blok 'Noordkant'!", bereik(61, 84));
});

// ---- Fouten ----

console.log('\nFoutmeldingen:');

test('onbekend nummer → "Rij 85 bestaat niet (dit perceel heeft rijen 1–84)"', () => {
  const r = sel('rij 85');
  assert.ok(r.leeg);
  assert.deepStrictEqual(r.rijIds, []);
  assert.deepStrictEqual(r.fouten, ['Rij 85 bestaat niet (dit perceel heeft rijen 1–84)']);
  assert.strictEqual(r.omschrijving, 'geen rijen');
});

test('bereik deels buiten het perceel: bestaande rijen geselecteerd + fout', () => {
  const r = sel('80-90');
  assert.deepStrictEqual(r.nummers, bereik(80, 84));
  assert.deepStrictEqual(r.fouten, ['Rijen 85–90 bestaan niet (dit perceel heeft rijen 1–84)']);
  assert.deepStrictEqual(sel('0-2').fouten, ['Rij 0 bestaat niet (dit perceel heeft rijen 1–84)']);
});

test('gerooide rij → "Rij 90 is gerooid"', () => {
  const r = sel('rij 90');
  assert.ok(r.leeg);
  assert.deepStrictEqual(r.fouten, ['Rij 90 is gerooid']);
});

test('gat in een bereik (gerooide rij) is geen fout', () => {
  const rijen: SelecteerbareRij[] = bereik(1, 10).map(n => ({
    id: `r${n}`,
    nummer: n,
    status: n === 5 ? 'gerooid' : 'actief',
  }));
  const r = parseRijSelectie('1-10', rijen);
  assert.deepStrictEqual(r.fouten, []);
  assert.deepStrictEqual(r.nummers, [1, 2, 3, 4, 6, 7, 8, 9, 10]);
  assert.strictEqual(r.omschrijving, 'rij 1–4, 6–10 (9 rijen)');
  assert.deepStrictEqual(parseRijSelectie('rij 5', rijen).fouten, ['Rij 5 is gerooid']);
  assert.deepStrictEqual(parseRijSelectie('rij 11', rijen).fouten, [
    'Rij 11 bestaat niet (dit perceel heeft rijen 1–4, 6–10)',
  ]);
});

test('perceel zonder rijen', () => {
  assert.deepStrictEqual(parseRijSelectie('1', []).fouten, ['Rij 1 bestaat niet (dit perceel heeft nog geen rijen)']);
  assert.deepStrictEqual(parseRijSelectie('alle', []).fouten, ['Dit perceel heeft nog geen rijen']);
});

test('onherkenbare tekst en lege invoer', () => {
  const r = sel('xyz');
  assert.ok(r.leeg);
  assert.deepStrictEqual(r.fouten, ["'xyz' niet herkend"]);
  const leeg = sel('   ');
  assert.ok(leeg.leeg);
  assert.deepStrictEqual(leeg.fouten, []);
  assert.strictEqual(leeg.omschrijving, 'geen rijen');
  assert.deepStrictEqual(sel('rij').fouten, ["'rij' niet herkend"]);
  assert.deepStrictEqual(sel('blok').fouten, ["'blok' niet herkend"]);
});

test('niet-string invoer van buitenaf (MCP/JSON) crasht niet', () => {
  const p = parseRijSelectie as (t: unknown, r: SelecteerbareRij[]) => ReturnType<typeof parseRijSelectie>;
  assert.deepStrictEqual(p(5, RIJEN).nummers, [5]);
  assert.deepStrictEqual(p([1, 2, 3], RIJEN).nummers, [1, 2, 3]);
  assert.ok(p(null, RIJEN).leeg);
  assert.ok(p(undefined, RIJEN).leeg);
});

test('fouten en geldige delen samen; dubbele fouten één keer', () => {
  const r = sel('1-3, 85, 85, blok A');
  assert.deepStrictEqual(r.nummers, bereik(1, 30));
  assert.deepStrictEqual(r.fouten, ['Rij 85 bestaat niet (dit perceel heeft rijen 1–84)']);
});

// ---- formatteerBereiken ----

console.log('\nformatteerBereiken:');

test('[1,2,3,5,7,8] → "1–3, 5, 7–8"', () => {
  assert.strictEqual(formatteerBereiken([1, 2, 3, 5, 7, 8]), '1–3, 5, 7–8');
});

test('ongesorteerd, dubbel, enkel, leeg', () => {
  assert.strictEqual(formatteerBereiken([5, 3, 4, 3]), '3–5');
  assert.strictEqual(formatteerBereiken([4]), '4');
  assert.strictEqual(formatteerBereiken([]), '');
  assert.strictEqual(formatteerBereiken([10, 1, 2, 12]), '1–2, 10, 12');
});

// ---- Summary ----

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
