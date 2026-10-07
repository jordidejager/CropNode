/**
 * test-rijen-store.ts — integratietest van de rijenkaart-opslaglaag tegen de database.
 *
 * Werkt op perceel Steketee van de test-gebruiker (Jordi) en weigert te starten als
 * dat perceel al rijen, blokken of rij-instellingen heeft. Maakt ±5 rijen, een blok,
 * instellingen en attributen aan, leest alles terug (kaart, overzicht, selectie →
 * plots, GeoJSON) en ruimt aan het eind ALLES weer op (ook bij een fout).
 * Maakt geen spuitschrift- of field_notes-records; koppelt testrijen wel tijdelijk aan
 * een BESTAANDE bespuiting van de test-gebruiker (schrijft alleen in bespuiting_rijen,
 * verdwijnt via ON DELETE CASCADE met de testrijen en wordt na afloop gecontroleerd).
 *
 * Gebruik: npx tsx scripts/test-rijen-store.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../.env.local') });

const USER_ID = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617';
const PERCEEL_ID = '5cbb8f6c-9736-49e5-8604-d3cc71e86ed0'; // Steketee (Tessa, 3,0 m / 0,66 m)
const ANDERE_USER = randomUUID();

let geslaagd = 0;
function ok(naam: string) {
  geslaagd++;
  console.log(`  ✓ ${naam}`);
}

async function verwachtFout(werk: () => Promise<unknown>, bevat: string | RegExp, naam: string) {
  let fout: unknown = null;
  try {
    await werk();
  } catch (e) {
    fout = e;
  }
  assert.ok(fout instanceof Error, `${naam}: verwachtte een fout`);
  const msg = (fout as Error).message;
  if (typeof bevat === 'string') assert.ok(msg.includes(bevat), `${naam}: melding "${msg}" bevat niet "${bevat}"`);
  else assert.match(msg, bevat, `${naam}: melding "${msg}"`);
  ok(`${naam} → "${msg}"`);
}

async function main() {
  const store = await import('../src/lib/rijen/store');
  const koppelingen = await import('../src/lib/rijen/koppelingen');
  const geo = await import('../src/lib/rijen/geo');
  const { getSupabaseAdmin } = await import('../src/lib/supabase-client');
  const admin = getSupabaseAdmin();

  async function tel(tabel: string, kolom = 'perceel_id'): Promise<number> {
    const { count, error } = await admin.from(tabel).select('*', { count: 'exact', head: true }).eq(kolom, PERCEEL_ID);
    if (error) throw new Error(`${tabel}: ${error.message}`);
    return count ?? 0;
  }

  let testRijIds: string[] = [];
  async function telKoppelingen(): Promise<number> {
    if (testRijIds.length === 0) return 0;
    const { count, error } = await admin.from('bespuiting_rijen').select('*', { count: 'exact', head: true }).in('rij_id', testRijIds);
    if (error) throw new Error(`bespuiting_rijen: ${error.message}`);
    return count ?? 0;
  }

  // ── Pure hulpjes (zonder database) ───────────────────────────────────────
  {
    const bron = Array.from({ length: 14 }, (_, i) => ({ i }));
    let aanroepen = 0;
    const alles = await store.allePaginas<{ i: number }>(async (van, tot) => {
      aanroepen++;
      return { data: bron.slice(van, tot + 1), error: null };
    }, 'test', 7);
    assert.deepEqual(alles.map(x => x.i), bron.map(x => x.i));
    assert.equal(aanroepen, 3, 'precies veelvoud van de paginagrootte → nog één (lege) pagina');
    await verwachtFout(
      () => store.allePaginas(async () => ({ data: null, error: { message: 'kapot' } }), 'Testen'),
      'Testen mislukt: kapot',
      'allePaginas: fout wordt doorgegeven',
    );
    const volgorde = await store.beperktParallel([30, 5, 15, 0].map(ms => () => new Promise<number>(r => setTimeout(() => r(ms), ms))), 2);
    assert.deepEqual(volgorde, [30, 5, 15, 0]);
    ok('allePaginas (14 regels in pagina\'s van 7 → 3 verzoeken) en beperktParallel (volgorde behouden)');
  }

  async function opruimen() {
    // Volgorde: instellingen (verwijzen naar een rij), koppelingen, rijen, blokken
    await admin.from('perceel_rijinstellingen').delete().eq('perceel_id', PERCEEL_ID).eq('user_id', USER_ID);
    await admin.from('rijen').delete().eq('perceel_id', PERCEEL_ID).eq('user_id', USER_ID);
    await admin.from('blokken').delete().eq('perceel_id', PERCEEL_ID).eq('user_id', USER_ID);
  }

  // ── Voorwaarde: perceel is leeg ─────────────────────────────────────────
  const vooraf = { rijen: await tel('rijen'), blokken: await tel('blokken'), instellingen: await tel('perceel_rijinstellingen') };
  if (vooraf.rijen + vooraf.blokken + vooraf.instellingen > 0) {
    console.error(`Steketee heeft al rijenkaart-data (${JSON.stringify(vooraf)}) — test geweigerd, er wordt niets aangeraakt.`);
    process.exit(2);
  }

  console.log('\nRijenkaart store-test op Steketee\n');
  try {
    // ── Perceel + subperceel ───────────────────────────────────────────────
    const { data: perceelRij } = await admin.from('parcels').select('geometry, area').eq('id', PERCEEL_ID).single();
    const geometrie = geo.parseGeometrie((perceelRij as { geometry: unknown }).geometry);
    assert.ok(geometrie, 'Steketee heeft geometrie');
    const perceelRD = geo.perceelNaarRD(geometrie);
    const [cx, cy] = perceelRD.zwaartepunt;
    const { data: subs } = await admin.from('sub_parcels').select('id, area, variety').eq('parcel_id', PERCEEL_ID);
    assert.equal(subs?.length, 1, 'Steketee heeft precies één subperceel');
    const sub = (subs as { id: string; area: number; variety: string }[])[0];

    // 5 evenwijdige noord-zuidrijen van 40 m, 3 m uit elkaar, rond het zwaartepunt (begin = zuid)
    const lijnen = [-2, -1, 0, 1, 2].map(k => {
      const x = cx + k * 3;
      const a: [number, number] = [x, cy - 20];
      const b: [number, number] = [x, cy + 20];
      assert.ok(geo.puntInPerceel(a, perceelRD) && geo.puntInPerceel(b, perceelRD), 'testrij ligt binnen het perceel');
      return [geo.naarWGS(a), geo.naarWGS(b)];
    });

    // ── rijenToepassen: invoegen + instellingen ────────────────────────────
    const res = await store.rijenToepassen(USER_ID, PERCEEL_ID, {
      rijen: lijnen.map((coordinates, i) => ({ sleutel: `k${i + 1}`, nummer: i + 1, coordinates, geomBron: 'getekend' as const })),
      instellingen: {
        rijrichtingGraden: 0,
        rijafstandM: 3,
        boomafstandM: 0.66,
        faseM: 0,
        startnummer: 1,
        detectieMethode: 'handmatig',
        bronBeeld: 'test-rijen-store',
        laatstGegenereerdOp: new Date().toISOString(),
      },
    });
    assert.equal(res.ingevoegd.length, 5);
    assert.deepEqual(res.ingevoegd.map(r => r.sleutel), ['k1', 'k2', 'k3', 'k4', 'k5']);
    assert.deepEqual(res.ingevoegd.map(r => r.nummer), [1, 2, 3, 4, 5]);
    const ids = res.ingevoegd.map(r => r.id);
    testRijIds = ids;
    ok('rijenToepassen: 5 rijen ingevoegd met sleutels, instellingen gezet');

    await verwachtFout(
      () => store.rijenToepassen(USER_ID, PERCEEL_ID, { rijen: [{ nummer: 3, coordinates: lijnen[0] }] }),
      'hetzelfde nummer',
      'dubbel rijnummer geweigerd',
    );
    assert.equal(await tel('rijen'), 5, 'mislukte transactie liet niets achter');
    await verwachtFout(
      () => store.rijenToepassen(ANDERE_USER, PERCEEL_ID, { rijen: [{ nummer: 9, coordinates: lijnen[0] }] }),
      'Perceel niet gevonden',
      'rijenToepassen voor andere gebruiker geweigerd',
    );
    await verwachtFout(
      () => store.rijenToepassen(USER_ID, PERCEEL_ID, { rijen: [{ nummer: 9 }] }),
      'nummer en coördinaten',
      'nieuwe rij zonder coördinaten geweigerd',
    );
    await verwachtFout(
      () => store.rijenToepassen(USER_ID, PERCEEL_ID, { instellingen: { rijafstandM: 0 } }),
      'rijafstand moet groter dan 0',
      'rijafstand 0 geweigerd',
    );
    await verwachtFout(
      () => store.rijenToepassen(USER_ID, PERCEEL_ID, { rijen: [{ id: ids[0], rol: 'x' as never }] }),
      'Ongeldige rol',
      'ongeldige rol geweigerd',
    );

    // ── Blok + attributen ──────────────────────────────────────────────────
    const blok = await store.slaBlokOp(USER_ID, PERCEEL_ID, { naam: 'Testblok', subParcelId: sub.id, ras: 'Tessa', plantjaar: 2015 }, ids.slice(0, 3));
    assert.equal(blok.naam, 'Testblok');
    assert.equal(blok.subParcelId, sub.id);
    assert.equal(blok.perceelId, PERCEEL_ID);
    ok('slaBlokOp: blok aangemaakt met 3 rijen');

    const blokBijgewerkt = await store.slaBlokOp(USER_ID, PERCEEL_ID, { id: blok.id, opmerking: 'bijgewerkt' }, [ids[3]]);
    assert.equal(blokBijgewerkt.opmerking, 'bijgewerkt');
    assert.equal(blokBijgewerkt.ras, 'Tessa');
    ok('slaBlokOp: blok bijgewerkt (alleen meegegeven velden) en rij 4 toegevoegd');

    await verwachtFout(
      () => store.rijenToepassen(USER_ID, PERCEEL_ID, { rijen: [{ id: ids[0], blokId: randomUUID() }] }),
      'Blok niet gevonden',
      'rij aan onbekend/vreemd blok geweigerd',
    );
    await verwachtFout(
      () => store.slaBlokOp(USER_ID, PERCEEL_ID, { naam: 'x', subParcelId: 'bestaat-niet' }),
      'Subperceel hoort niet bij dit perceel',
      'blok met vreemd subperceel geweigerd',
    );

    assert.equal(await store.zetRijAttributen(USER_ID, PERCEEL_ID, [ids[4]], { rol: 'bestuiver', label: 'B1', opmerking: 'test' }), 1);
    assert.equal(await store.zetRijAttributen(USER_ID, PERCEEL_ID, [ids[3]], { blokId: null }), 1);
    assert.equal(await store.zetRijAttributen(ANDERE_USER, PERCEEL_ID, [ids[0]], { label: 'x' }).catch(() => -1), -1);
    ok('zetRijAttributen: bestuiver gezet, rij 4 uit blok gehaald, andere gebruiker geweigerd');
    await verwachtFout(
      () => store.zetRijAttributen(USER_ID, PERCEEL_ID, [ids[0]], { geplantOp: '2026-02-31' }),
      'Ongeldige plantdatum',
      'niet-bestaande datum geweigerd (JS zou er 3 maart van maken)',
    );
    await verwachtFout(
      () => store.zetRijAttributen(USER_ID, PERCEEL_ID, [ids[0]], { plantjaar: 15 }),
      'Plantjaar',
      'plantjaar 15 geweigerd',
    );
    assert.equal(await store.zetRijAttributen(USER_ID, PERCEEL_ID, [ids[4]], { geplantOp: '2016-03-15T00:00:00Z' }), 1);

    // ── Beginkant + nummeringstart ─────────────────────────────────────────
    assert.equal(await store.zetBeginkant(USER_ID, PERCEEL_ID, 180), 0, 'begin ligt al zuid');
    assert.equal(await store.zetBeginkant(USER_ID, PERCEEL_ID, 0), 5, 'alle rijen omgedraaid naar noord');
    ok('zetBeginkant: 180° → 0 omgedraaid, 0° → 5 omgedraaid');

    await store.zetNummeringStart(USER_ID, PERCEEL_ID, ids[2]);
    await verwachtFout(() => store.zetNummeringStart(USER_ID, PERCEEL_ID, randomUUID()), 'Rij niet gevonden', 'nummeringstart met onbekende rij geweigerd');

    // ── laadRijenkaart ─────────────────────────────────────────────────────
    const kaart = await store.laadRijenkaart(USER_ID, PERCEEL_ID);
    assert.ok(kaart, 'kaart geladen');
    assert.equal(kaart.perceel.naam, 'Steketee');
    assert.ok(kaart.perceel.geometry && (kaart.perceel.geometry.type === 'Polygon' || kaart.perceel.geometry.type === 'MultiPolygon'));
    assert.equal(kaart.perceel.subpercelen.length, 1);
    assert.equal(kaart.perceel.subpercelen[0].rijafstandM, 3);
    assert.equal(kaart.perceel.subpercelen[0].boomafstandM, 0.66);
    assert.ok(kaart.instellingen);
    assert.equal(kaart.instellingen.rijafstandM, 3);
    assert.equal(kaart.instellingen.boomafstandM, 0.66);
    assert.equal(kaart.instellingen.beginkantGraden, 0);
    assert.equal(kaart.instellingen.nummeringStartRijId, ids[2]);
    assert.equal(kaart.instellingen.detectieMethode, 'handmatig');
    assert.equal(kaart.instellingen.kopakkerBeginM, 6);
    assert.equal(kaart.blokken.length, 1);
    assert.equal(kaart.rijen.length, 5);
    assert.deepEqual(kaart.rijen.map(r => r.nummer), [1, 2, 3, 4, 5]);
    for (const r of kaart.rijen) {
      assert.equal(typeof r.lengteM, 'number');
      assert.ok(Math.abs(r.lengteM - 40) < 0.05, `lengte ${r.lengteM} ≈ 40 m`);
      assert.equal(r.rijafstandM, 3);
      assert.equal(r.boomafstandM, 0.66);
      assert.equal(r.subParcelId, sub.id);
      assert.equal(r.coordinates.length, 2);
      assert.ok(r.coordinates[0][1] > r.coordinates[1][1], 'begin ligt noord na beginkant 0°');
      assert.equal(r.status, 'actief');
      assert.equal(r.geomBron, 'getekend');
      assert.ok(kaart.status[r.id], 'status per rij');
      assert.equal(kaart.status[r.id].aantalNotities, 0);
    }
    const [r1, , , r4, r5] = kaart.rijen;
    assert.equal(r1.blokId, blok.id);
    assert.equal(r1.blokNaam, 'Testblok');
    assert.equal(r1.rasEffectief, 'Tessa');
    assert.equal(r1.plantjaarEffectief, 2015);
    assert.equal(r4.blokId, null);
    assert.equal(r5.rol, 'bestuiver');
    assert.equal(r5.label, 'B1');
    assert.equal(r1.aantalBomenEffectief, Math.floor(r1.lengteM / 0.66) + 1);
    assert.deepEqual(kaart.notities, []);
    assert.ok(Array.isArray(kaart.bespuitingen) && kaart.bespuitingen.length <= 25);
    for (const b of kaart.bespuitingen) {
      assert.equal(b.rijIds, null, 'geen rijkoppelingen in deze test');
      assert.deepEqual(b.subParcelIds, [sub.id]);
    }
    ok(`laadRijenkaart: perceel, instellingen, blok, 5 rijen, status, ${kaart.bespuitingen.length} recente bespuitingen`);

    assert.equal(await store.laadRijenkaart(ANDERE_USER, PERCEEL_ID), null);
    assert.equal(await store.laadRijenkaart(USER_ID, 'bestaat-niet'), null);
    ok('laadRijenkaart: null voor andere gebruiker / onbekend perceel');

    const blokken = await store.laadBlokken(USER_ID, PERCEEL_ID);
    assert.equal(blokken.length, 1);
    assert.equal((await store.laadRijenVanPerceel(USER_ID, PERCEEL_ID, { inclGerooid: false })).length, 5);

    // ── laadRijenOverzicht ─────────────────────────────────────────────────
    const overzicht = await store.laadRijenOverzicht(USER_ID);
    const st = overzicht.find(o => o.perceelId === PERCEEL_ID);
    assert.ok(st, 'Steketee in overzicht');
    assert.equal(st.aantalActief, 5);
    assert.equal(st.aantalGerooid, 0);
    assert.equal(st.aantalBestuivers, 1);
    assert.equal(st.aantalBlokken, 1);
    assert.equal(st.minNummer, 1);
    assert.equal(st.maxNummer, 5);
    assert.equal(st.heeftGeometrie, true);
    assert.ok(Math.abs(st.totaleLengteM - 200) < 0.5);
    assert.ok(Math.abs(st.rijOppervlakHa - 0.06) < 0.001);
    assert.equal(st.detectieMethode, 'handmatig');
    const zonderRijen = overzicht.find(o => o.perceelId !== PERCEEL_ID && o.aantalActief === 0);
    assert.ok(zonderRijen && zonderRijen.minNummer === null && zonderRijen.totaleLengteM === 0, 'percelen zonder rijen staan erin met nullen');
    assert.ok(overzicht.length >= 14);
    ok(`laadRijenOverzicht: ${overzicht.length} percelen, Steketee 5 rijen / 0,06 ha`);

    // ── rijSelectieNaarPlots ───────────────────────────────────────────────
    const selectie = await koppelingen.rijSelectieNaarPlots(USER_ID, ids);
    const somM2 = kaart.rijen.reduce((s, r) => s + r.lengteM * 3, 0);
    assert.deepEqual(selectie.plots, [sub.id]);
    assert.ok(Math.abs(selectie.plotAreas[sub.id] - somM2 / 10000) < 0.0001);
    assert.equal(selectie.oppervlakHa, selectie.plotAreas[sub.id]);
    assert.equal(selectie.rijIds.length, 5);
    assert.equal(selectie.perPerceel.length, 1);
    assert.equal(selectie.perPerceel[0].perceelNaam, 'Steketee');
    assert.equal(selectie.perPerceel[0].omschrijving, 'rij 1–5');
    assert.equal(selectie.perPerceel[0].rvoOppervlakHa, 6.98);
    assert.deepEqual(selectie.perPerceel[0].plots, [sub.id]);
    ok(`rijSelectieNaarPlots: plots=[Tessa], ${selectie.oppervlakHa} ha, "${selectie.perPerceel[0].omschrijving}"`);

    const deel = await koppelingen.rijSelectieNaarPlots(USER_ID, [ids[0], ids[2], ids[3]]);
    assert.equal(deel.perPerceel[0].omschrijving, 'rij 1, 3–4');
    assert.deepEqual(await koppelingen.rijSelectieNaarPlots(USER_ID, []), { rijIds: [], plots: [], plotAreas: {}, oppervlakHa: 0, perPerceel: [] });
    await verwachtFout(() => koppelingen.rijSelectieNaarPlots(ANDERE_USER, ids), 'bestaan', 'selectie van andere gebruiker geweigerd');

    // Zonder ingestelde rijafstand (blok én perceel): de werkelijke afstand volgt uit de ligging van de
    // buurrijen (verfijning) → zelfde oppervlak als met 3 m ingesteld (de testrijen liggen 3 m uit elkaar)
    await store.rijenToepassen(USER_ID, PERCEEL_ID, { instellingen: { rijafstandM: null } });
    const zonderAfstand = await koppelingen.rijSelectieNaarPlots(USER_ID, ids);
    assert.ok(Math.abs(zonderAfstand.oppervlakHa - selectie.oppervlakHa) < 0.0002, `${zonderAfstand.oppervlakHa} vs ${selectie.oppervlakHa}`);
    ok(`selectie zonder ingestelde rijafstand: afstand uit de buren → ${zonderAfstand.oppervlakHa} ha`);
    // (een losse rij zonder buren en zonder rijafstand geeft een fout: zie src/__tests__/rijen-verfijning.test.ts)
    await store.rijenToepassen(USER_ID, PERCEEL_ID, { instellingen: { rijafstandM: 3 } });

    // ── Koppel-lookups zonder koppelingen ──────────────────────────────────
    assert.deepEqual(await koppelingen.rijenVoorBespuitingen(USER_ID, ['bestaat-niet']), {});
    assert.deepEqual(await koppelingen.rijenVoorNotities(USER_ID, [randomUUID(), 'geen-uuid']), {});
    await verwachtFout(() => koppelingen.koppelBespuitingAanRijen(USER_ID, 'bestaat-niet', ids), 'Bespuiting niet gevonden', 'koppel aan onbekende bespuiting');
    await verwachtFout(() => koppelingen.koppelNotitieAanRijen(USER_ID, randomUUID(), [{ rijId: ids[0] }]), 'Notitie niet gevonden', 'koppel aan onbekende notitie');
    await verwachtFout(
      () => koppelingen.maakRijNotitie(USER_ID, { perceelId: PERCEEL_ID, tekst: '  ', rijen: [{ rijId: ids[0] }] }),
      'leeg',
      'lege rijnotitie geweigerd (niets aangemaakt)',
    );

    // ── GeoJSON ────────────────────────────────────────────────────────────
    const fc = await store.rijenGeoJSON(USER_ID, PERCEEL_ID);
    assert.ok(fc);
    assert.equal(fc.type, 'FeatureCollection');
    assert.equal(fc.features.length, 5);
    const f0 = fc.features[0];
    assert.equal(f0.geometry.type, 'LineString');
    assert.equal((f0.properties as Record<string, unknown>).nummer, 1);
    assert.equal((f0.properties as Record<string, unknown>).ras, 'Tessa');
    assert.equal(await store.rijenGeoJSON(ANDERE_USER, PERCEEL_ID), null);
    ok('rijenGeoJSON: 5 LineString-features; null voor andere gebruiker');

    // ── Bijwerken, verwijderen, rooien ─────────────────────────────────────
    const verplaatst = [kaart.rijen[4].coordinates[0], geo.naarWGS([cx + 6, cy - 25])];
    const upd = await store.rijenToepassen(USER_ID, PERCEEL_ID, {
      rijen: [{ id: ids[4], coordinates: verplaatst, geomBron: 'getekend', nauwkeurigheidM: 0.5 }],
      verwijderen: [ids[3]],
    });
    assert.equal(upd.bijgewerkt, 1);
    assert.equal(upd.verwijderd, 1);
    assert.equal(upd.gerooid, 0);
    assert.equal(await tel('rijen'), 4);
    ok('rijenToepassen: eindpunt verplaatst + rij zonder koppelingen echt verwijderd');

    assert.equal(await store.zetRijAttributen(USER_ID, PERCEEL_ID, [ids[1]], { status: 'gerooid' }), 1);
    const naRooien = await store.laadRijenVanPerceel(USER_ID, PERCEEL_ID);
    const gerooid = naRooien.find(r => r.id === ids[1]);
    assert.equal(gerooid?.status, 'gerooid');
    assert.equal(gerooid?.gerooidOp, store.vandaag());
    assert.equal((await store.rijenGeoJSON(USER_ID, PERCEEL_ID, false))?.features.length, 3);
    assert.equal((await store.rijenGeoJSON(USER_ID, PERCEEL_ID, true))?.features.length, 4);
    await verwachtFout(() => koppelingen.rijSelectieNaarPlots(USER_ID, [ids[1]]), 'geen actieve rijen', 'selectie met alleen gerooide rij');
    ok('rooien: status gerooid + datum, GeoJSON ?gerooid=0 laat hem weg');

    // ── Blok verwijderen ───────────────────────────────────────────────────
    await store.verwijderBlok(USER_ID, PERCEEL_ID, blok.id);
    assert.equal(await tel('blokken'), 0);
    const naBlok = await store.laadRijenVanPerceel(USER_ID, PERCEEL_ID);
    assert.ok(naBlok.every(r => r.blokId === null));
    assert.equal(naBlok.find(r => r.id === ids[4])?.geplantOp, '2016-03-15');
    ok('verwijderBlok: blok weg, rijen zonder blok');

    // ── Koppeling met een BESTAANDE bespuiting (alleen bespuiting_rijen) ──────
    // Rijen nu: 1 (actief), 2 (gerooid), 3 (actief), 5 (actief, bestuiver); 4 is verwijderd.
    const spray = kaart.bespuitingen[0];
    if (!spray) {
      console.log('  – geen bestaande bespuiting op Steketee: koppeltest overgeslagen');
    } else {
      await koppelingen.koppelBespuitingAanRijen(USER_ID, spray.id, [ids[0], ids[2]]);
      await koppelingen.koppelBespuitingAanRijen(USER_ID, spray.id, [ids[2]]); // dubbel → genegeerd
      assert.equal(await telKoppelingen(), 2);
      await verwachtFout(
        () => koppelingen.koppelBespuitingAanRijen(ANDERE_USER, spray.id, [ids[0]]),
        'Bespuiting niet gevonden',
        'koppelen door andere gebruiker geweigerd',
      );

      const perSpray = await koppelingen.rijenVoorBespuitingen(USER_ID, [spray.id, 'bestaat-niet']);
      assert.deepEqual(Object.keys(perSpray), [spray.id]);
      assert.equal(perSpray[spray.id].length, 1);
      assert.equal(perSpray[spray.id][0].perceelNaam, 'Steketee');
      assert.equal(perSpray[spray.id][0].omschrijving, 'rij 1, 3');
      assert.deepEqual(perSpray[spray.id][0].nummers, [1, 3]);
      assert.deepEqual(await koppelingen.rijenVoorBespuitingen(ANDERE_USER, [spray.id]), {});

      const kaart2 = await store.laadRijenkaart(USER_ID, PERCEEL_ID);
      assert.ok(kaart2);
      const b2 = kaart2.bespuitingen.find(b => b.id === spray.id);
      assert.ok(b2, 'gekoppelde bespuiting staat in de kaart');
      assert.deepEqual([...(b2.rijIds ?? [])].sort(), [ids[0], ids[2]].sort());
      assert.equal(kaart2.status[ids[0]].laatsteBespuitingId, spray.id);
      assert.equal(kaart2.status[ids[0]].laatsteBespuitingViaRijen, true);
      assert.notEqual(kaart2.status[ids[4]].laatsteBespuitingId, spray.id, 'ongekoppelde rij telt de rij-bespuiting niet');
      ok(`koppelBespuitingAanRijen + rijenVoorBespuitingen ("${perSpray[spray.id][0].omschrijving}") + kaart.rijIds + status via rijen`);

      const weg = await store.rijenToepassen(USER_ID, PERCEEL_ID, { verwijderen: [ids[0]] });
      assert.equal(weg.verwijderd, 0);
      assert.equal(weg.gerooid, 1);
      const nogDaar = (await store.laadRijenVanPerceel(USER_ID, PERCEEL_ID)).find(r => r.id === ids[0]);
      assert.equal(nogDaar?.status, 'gerooid');
      assert.equal(await telKoppelingen(), 2, 'koppelingen blijven bewaard');
      ok('verwijderen van een gekoppelde rij → gerooid (historie blijft)');
    }
  } finally {
    await opruimen();
    const na = {
      rijen: await tel('rijen'),
      blokken: await tel('blokken'),
      instellingen: await tel('perceel_rijinstellingen'),
      koppelingen: await telKoppelingen(),
    };
    assert.deepEqual(na, { rijen: 0, blokken: 0, instellingen: 0, koppelingen: 0 }, `opruimen mislukt: ${JSON.stringify(na)}`);
    console.log('  ✓ opgeruimd: geen rijen, blokken, instellingen of bespuitingskoppelingen meer op Steketee');
  }
  console.log(`\n${geslaagd + 1} controles geslaagd.\n`);
}

main().catch(e => {
  console.error('\n✗ Test mislukt:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
