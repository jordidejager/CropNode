import assert from 'node:assert/strict';
import {
  maakKleurVoorRas, rasSleutel, rasNaam, vasteKleurVoorRas, VASTE_RASKLEUREN, RAS_PALET,
  KLEUR_ONBEKEND, KLEUR_GEROOID, KLEUR_CONCEPT, KLEUR_GEMARKEERD, KLEUR_CONTROLEREN, KLEUR_NOTITIE, KLEUR_SELECTIE,
} from '../components/rijenkaart/kleuren';
import { legendaItems } from '../components/rijenkaart/legenda';
import type { Rij } from '../lib/rijen/types';

let n = 0;
const t = (naam: string, f: () => void) => { f(); n++; console.log('ok', naam); };

t('rasSleutel normaliseert accenten/leestekens', () => {
  assert.equal(rasSleutel('Doyenné du Comice'), 'doyenne du comice');
  assert.equal(rasSleutel('Cox’s Orange Pippin'), 'cox s orange pippin');
  assert.equal(rasSleutel('  '), '');
  assert.equal(rasSleutel(null), '');
  assert.equal(rasNaam(null), 'Onbekend ras');
  assert.equal(rasNaam(' Tessa '), 'Tessa');
});

t('vaste kleuren voor alle rassen in de DB, onderling verschillend', () => {
  const db = ['Conference','Beurré Alexandre Lucas','Doyenné du Comice','Tessa','Jonagold','Kanzi','Greenstar','Migo','Cox’s Orange Pippin','Elstar','Rode Boskoop (Goudreinet)','Golden Delicious'];
  const kleuren = db.map(r => vasteKleurVoorRas(r));
  assert.ok(kleuren.every(k => k !== null), JSON.stringify(kleuren));
  assert.equal(new Set(kleuren).size, db.length, 'dubbele kleur');
  const k = maakKleurVoorRas(db);
  assert.equal(new Set(db.map(k)).size, db.length);
  assert.equal(k('conference'), vasteKleurVoorRas('Conference'));
  assert.equal(k('Comice'), vasteKleurVoorRas('Doyenné du Comice'));
});

t('gereserveerde kleuren komen niet in raskleuren/palet voor', () => {
  const gereserveerd = [KLEUR_ONBEKEND, KLEUR_GEROOID, KLEUR_CONCEPT, KLEUR_GEMARKEERD, KLEUR_CONTROLEREN, KLEUR_NOTITIE, KLEUR_SELECTIE];
  for (const c of [...VASTE_RASKLEUREN.map(v => v.kleur), ...RAS_PALET]) assert.ok(!gereserveerd.includes(c), c);
});

t('onbekend ras → palet, deterministisch, geen botsing', () => {
  const a = maakKleurVoorRas(['Conference', 'Zuidwester', 'Abate Fetel', null]);
  const b = maakKleurVoorRas([null, 'Abate Fetel', 'Zuidwester', 'Conference', 'Conference']);
  for (const r of ['Conference', 'Zuidwester', 'Abate Fetel']) assert.equal(a(r), b(r));
  assert.ok(RAS_PALET.includes(a('Zuidwester')));
  assert.notEqual(a('Zuidwester'), a('Abate Fetel'));
  assert.notEqual(a('Zuidwester'), a('Conference'));
  assert.equal(a(null), KLEUR_ONBEKEND);
  assert.equal(a(''), KLEUR_ONBEKEND);
  // niet in de lijst → toch stabiel
  assert.equal(a('Iets Anders'), maakKleurVoorRas([])('Iets Anders'));
});

t('botsing van vaste kleuren op één perceel wordt opgelost', () => {
  // QTee en Kanzi: verschillende vaste kleuren; forceer botsing via 13 rassen met veel palet
  const veel = [...VASTE_RASKLEUREN.map(v => v.ras), 'X1', 'X2', 'X3'];
  const k = maakKleurVoorRas(veel);
  const kleuren = veel.map(k);
  // zolang er kleuren vrij zijn, uniek
  const totaal = new Set([...VASTE_RASKLEUREN.map(v => v.kleur), ...RAS_PALET]).size;
  assert.equal(new Set(kleuren).size, Math.min(veel.length, totaal));
});

t('prefix-match op woordgrens', () => {
  assert.equal(vasteKleurVoorRas('Elstar Elshof'), vasteKleurVoorRas('Elstar'));
  assert.equal(vasteKleurVoorRas('Elstarx'), null);
});

const rij = (o: Partial<Rij>): Rij => ({
  id: Math.random().toString(36).slice(2), perceelId: 'p', blokId: null, blokNaam: null, nummer: 1, label: null, rol: 'hoofd',
  ras: null, rasEffectief: null, plantjaar: null, plantjaarEffectief: null, onderstam: null, rijafstandM: 3, boomafstandM: 1,
  lengteM: 100, aantalBomen: null, aantalBomenEffectief: null, geomBron: 'gegenereerd', nauwkeurigheidM: null, controleren: false,
  status: 'actief', geplantOp: null, gerooidOp: null, opmerking: null, coordinates: [[4, 51], [4.001, 51]], subParcelId: null, ...o,
});

t('legendaItems: ras-tellingen, bestuivers, gerooid', () => {
  const rijen = [
    rij({ rasEffectief: 'Conference' }), rij({ rasEffectief: 'Conference' }), rij({ rasEffectief: 'Tessa' }),
    rij({ rasEffectief: 'Doyenné du Comice', rol: 'bestuiver' }), rij({ rasEffectief: null }),
    rij({ rasEffectief: 'Conference', status: 'gerooid' }), rij({ rasEffectief: null, rol: 'bestuiver' }),
  ];
  const k = maakKleurVoorRas(rijen.map(r => r.rasEffectief));
  const items = legendaItems(rijen, k, true);
  assert.deepEqual(items.map(i => [i.label, i.aantal, i.stijl]), [
    ['Conference', 2, 'lijn'], ['Onbekend ras', 1, 'lijn'], ['Tessa', 1, 'lijn'],
    ['Bestuiver', 1, 'gestippeld'], ['Bestuiver · Doyenné du Comice', 1, 'gestippeld'],
    ['Gerooid', 1, 'gerooid'],
  ]);
  assert.equal(items[0].kleur, k('Conference'));
  assert.equal(items[1].kleur, KLEUR_ONBEKEND);
  assert.equal(legendaItems(rijen, k, false).some(i => i.stijl === 'gerooid'), false);
  assert.deepEqual(legendaItems([], k, true), []);
});

console.log(`\n${n} tests geslaagd`);
