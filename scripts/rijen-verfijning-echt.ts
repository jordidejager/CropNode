/**
 * Rijverfijning op echte percelen draaien (alleen lezen: database en PDOK).
 *
 *   npx tsx scripts/rijen-verfijning-echt.ts [--user <uuid>] [perceelnaam ...] [--img-dir <map>] [--geen-img]
 *
 * Basis = de opgeslagen rijen van het perceel (v_rijen); zonder opgeslagen rijen de productiedetectie +
 * genereerRijen. Draait de browsercode (verfijnVoorPerceel → haalGroenBeeldOp → haalLuchtfotoOp) met
 * createImageBitmap/OffscreenCanvas nagebootst via sharp. Print per perceel de aanbeveling (raster of per rij),
 * de verschuivingen en de kromme rijen, en maakt uitsneden (8 cm) met huidig (geel), per rij (cyaan) en
 * fijnafgesteld raster (magenta).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { Client } from 'pg';
import sharp from 'sharp';

config({ path: resolve(__dirname, '../.env.local') });

const JORDI = '90a3acab-5aaf-401f-8f8f-8cf1021d7969';

function installeerShim() {
  const g = globalThis as Record<string, unknown>;
  g.createImageBitmap = async (blob: Blob) => {
    const { data, info } = await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), close() {} };
  };
  g.OffscreenCanvas = class {
    constructor(public width: number, public height: number) {}
    getContext() {
      let bron: { data: Uint8ClampedArray } | null = null;
      return {
        drawImage(b: { data: Uint8ClampedArray }) { bron = b; },
        getImageData() { return { data: bron!.data }; },
      };
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const userIdx = args.indexOf('--user');
  const imgIdx = args.indexOf('--img-dir');
  const userId = userIdx >= 0 ? args[userIdx + 1] : JORDI;
  const imgDir = imgIdx >= 0 ? args[imgIdx + 1] : resolve(__dirname, '../docs/rijenkaart/img');
  const geenImg = args.includes('--geen-img');
  const namen = args.filter((a, i) => !a.startsWith('--') && !(userIdx >= 0 && i === userIdx + 1) && !(imgIdx >= 0 && i === imgIdx + 1));
  const percelen = namen.length ? namen : ['Murre', 'Spoor', 'Schele'];
  if (!geenImg) mkdirSync(imgDir, { recursive: true });

  installeerShim();
  const { parseGeometrie, perceelNaarRD, naarRD, naarWGS } = await import('../src/lib/rijen/geo');
  const { verfijnVoorPerceel, pdokWmsUrl, PDOK_LAGEN } = await import('../src/lib/rijen/pdok');
  const { detecteerVoorPerceel } = await import('../src/lib/rijen/pdok');
  const { genereerRijen, effectieveRijafstanden } = await import('../src/lib/rijen/generatie');

  const dbUrl = new URL(process.env.SUPABASE_DB_URL!);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const c = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com', port: 5432, user: `postgres.${ref}`,
    password: decodeURIComponent(dbUrl.password), database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    for (const naam of percelen) {
      const p = (await c.query(`select id, name, geometry from parcels where user_id = $1 and name = $2 and geometry is not null order by area desc limit 1`, [userId, naam])).rows[0];
      if (!p) { console.log(`\n=== ${naam}: niet gevonden`); continue; }
      const perceel = perceelNaarRD(parseGeometrie(p.geometry)!);
      const opgeslagen = (await c.query(`select id, nummer, geometrie, rijafstand_m, lengte_m from v_rijen where perceel_id = $1 and user_id = $2 and status = 'actief' order by nummer`, [p.id, userId])).rows;
      const inst = (await c.query(`select rijrichting_graden, rijafstand_m from perceel_rijinstellingen where perceel_id = $1`, [p.id])).rows[0];
      let rijen: { id: string; nummer: number; coordinates: [number, number][] }[];
      let theta: number, s: number, basis: string;
      if (opgeslagen.length > 0 && inst?.rijrichting_graden != null && inst?.rijafstand_m != null) {
        rijen = opgeslagen.map(r => ({ id: r.id, nummer: r.nummer, coordinates: r.geometrie.coordinates }));
        theta = Number(inst.rijrichting_graden);
        s = Number(inst.rijafstand_m);
        basis = `opgeslagen rijen (${rijen.length})`;
      } else {
        const det = await detecteerVoorPerceel(perceel);
        theta = det.richtingGraden;
        s = det.rijafstandM;
        const gen = genereerRijen(perceel, { richtingGraden: theta, rijafstandM: s, faseM: det.faseM, kopakkerBeginM: 6, kopakkerEindM: 6 });
        rijen = gen.map((g, i) => ({ id: `g${i}`, nummer: i + 1, coordinates: g.coordinates as [number, number][] }));
        basis = `detectie (θ ${theta.toFixed(2)}°, s ${s.toFixed(3)}, conf ${det.confidence.toFixed(2)}) → ${rijen.length} rijen`;
      }
      const stappen: string[] = [];
      const t0 = Date.now();
      const { resultaat: r, beeld, ophaalMs } = await verfijnVoorPerceel(perceel, rijen, {
        richtingGraden: theta, rijafstandM: s, onVoortgang: st => stappen.push(st),
      });
      const totaal = Date.now() - t0;
      console.log(`\n=== ${p.name} — basis: ${basis}`);
      console.log(`  beeld ${beeld.breedte}×${beeld.hoogte} @ ${beeld.pixelM} m · ophalen ${ophaalMs} ms · rekenen ${r.duurMs} ms · totaal ${totaal} ms · stappen ${JSON.stringify(stappen)}`);
      console.log(`  betrouwbaar ${r.betrouwbaar}${r.reden ? ` (${r.reden})` : ''} · aanbevolen: ${r.aanbevolen} · rest rond raster ${(r.raster.restStdM * 100).toFixed(1)} cm`);
      console.log(`  fijnafgesteld raster: θ ${r.raster.richtingGraden}° (was ${theta}) · s ${r.raster.rijafstandM} (was ${s}) · fase ${r.raster.faseM}`);
      console.log(`  per rij:  gem ${r.perRij.gemiddeldCm} cm · std ${r.perRij.stdCm} · max ${r.perRij.maxCm} · >15: ${r.perRij.boven15} · >30: ${r.perRij.boven30}`);
      console.log(`  raster:   gem ${r.rasterStat.gemiddeldCm} cm · std ${r.rasterStat.stdCm} · max ${r.rasterStat.maxCm} · >15: ${r.rasterStat.boven15} · >30: ${r.rasterStat.boven30}`);
      console.log(`  zwak ${r.zwak} · controleren ${r.controleren} · krom ${r.krom} · diag ${JSON.stringify(r.diagnostiek)}`);
      console.log(`  uiteinden: ${JSON.stringify(r.einden)} · per rij Δlengte (m): ${r.rijen.map(v => `${v.nummer}:${v.lengteVerschilM > 0 ? '+' : ''}${v.lengteVerschilM.toFixed(1)}`).join(' ')}`);
      console.log('  per rij (nr: verschuiving cm / punten / kromming cm / ±nauwk cm' + ' / afwijking raster cm):');
      console.log('   ' + r.rijen.map(v => `${v.nummer}:${(v.verschuivingM * 100).toFixed(0)}/${v.punten}${v.krommingM ? `/k${(v.krommingM * 100).toFixed(0)}` : ''}${v.zwak ? 'z' : ''}${v.controleren ? '!' : ''}`).join(' '));

      // werkelijke rijafstand per rij na verfijning (oppervlak)
      const verfijnd = r.rijen.map(v => ({ id: v.id, coordinates: v.coordsRD.map(x => naarWGS(x)), rijafstandM: s }));
      const eff = effectieveRijafstanden(verfijnd, { richtingGraden: r.raster.richtingGraden });
      const lengte = (co: [number, number][]) => { let L = 0; const rd = co.map(x => naarRD(x)); for (let i = 1; i < rd.length; i++) L += Math.hypot(rd[i][0] - rd[i - 1][0], rd[i][1] - rd[i - 1][1]); return L; };
      const oppNom = verfijnd.reduce((a, v) => a + lengte(v.coordinates as [number, number][]) * s, 0) / 1e4;
      const oppEff = verfijnd.reduce((a, v) => a + lengte(v.coordinates as [number, number][]) * (eff.get(v.id) ?? s), 0) / 1e4;
      const eerste10 = verfijnd.slice(0, 10);
      const o10n = eerste10.reduce((a, v) => a + lengte(v.coordinates as [number, number][]) * s, 0) / 1e4;
      const o10e = eerste10.reduce((a, v) => a + lengte(v.coordinates as [number, number][]) * (eff.get(v.id) ?? s), 0) / 1e4;
      console.log(`  oppervlak: nominaal ${oppNom.toFixed(4)} ha → werkelijk ${oppEff.toFixed(4)} ha · rij 1–10: ${o10n.toFixed(4)} → ${o10e.toFixed(4)} ha (${((o10e / o10n - 1) * 100).toFixed(1)} %)`);

      if (geenImg) continue;
      // uitsneden rond de uiteinden van de rijen met de grootste verschuiving + midden
      const kandidaten = [...r.rijen].sort((a, b) => Math.abs(b.lengteVerschilM) - Math.abs(a.lengteVerschilM)).slice(0, 2);
      const krom = r.rijen.find(v => v.punten > 2);
      if (krom) kandidaten.push(krom);
      const tegels: Buffer[] = [];
      const Z = 0.08, B = 560, H = 360;
      for (const v of kandidaten) {
        const basisRij = rijen.find(x => x.id === v.id)!;
        for (const eind of [0, 1]) {
          const mid = naarRD(basisRij.coordinates[eind === 0 ? 0 : basisRij.coordinates.length - 1]);
          const bbox: [number, number, number, number] = [mid[0] - (B * Z) / 2, mid[1] - (H * Z) / 2, mid[0] + (B * Z) / 2, mid[1] + (H * Z) / 2];
          const res = await fetch(pdokWmsUrl(bbox, B, H, PDOK_LAGEN.orthoHR));
          const jpeg = Buffer.from(await res.arrayBuffer());
          const px = (q: [number, number]) => { const rr = naarRD(q); return `${((rr[0] - bbox[0]) / Z).toFixed(1)},${((bbox[3] - rr[1]) / Z).toFixed(1)}`; };
          const pxRD = (rr: [number, number]) => `${((rr[0] - bbox[0]) / Z).toFixed(1)},${((bbox[3] - rr[1]) / Z).toFixed(1)}`;
          const lijnen: string[] = [];
          const grens = (p.geometry && parseGeometrie(p.geometry)) as any;
          const ringen: [number, number][][] = grens?.type === 'Polygon' ? grens.coordinates : grens?.type === 'MultiPolygon' ? grens.coordinates.flat() : [];
          for (const ring of ringen) lijnen.push(`<polyline points="${ring.map(px).join(' ')}" stroke="#34d399" stroke-width="2" fill="none"/>`);
          for (const x of rijen) lijnen.push(`<polyline points="${x.coordinates.map(px).join(' ')}" stroke="#facc15" stroke-width="2" stroke-dasharray="8 6" fill="none"/>`);
          for (const x of r.rijen) lijnen.push(`<polyline points="${x.rasterCoordsRD.map(q => pxRD(q as [number, number])).join(' ')}" stroke="#e879f9" stroke-width="1.5" fill="none"/>`);
          for (const x of r.rijen) lijnen.push(`<polyline points="${x.coordsRD.map(q => pxRD(q as [number, number])).join(' ')}" stroke="#22d3ee" stroke-width="2.5" fill="none"/>`);
          const svg = `<svg width="${B}" height="${H}" xmlns="http://www.w3.org/2000/svg">${lijnen.join('')}<rect x="0" y="0" width="${B}" height="22" fill="rgba(0,0,0,0.65)"/><text x="6" y="16" font-family="Helvetica" font-size="13" fill="#fff">${p.name} rij ${v.nummer} ${eind === 0 ? 'begin' : 'eind'} · ${v.lengteVerschilM > 0 ? '+' : ''}${v.lengteVerschilM.toFixed(1)} m${v.punten > 2 ? ` · ${v.punten} punten` : ''} · geel=huidig cyaan=per rij magenta=raster groen=perceel</text></svg>`;
          tegels.push(await sharp(jpeg).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 72 }).toBuffer());
        }
      }
      const rijenN = Math.ceil(tegels.length / 2);
      const uit = resolve(imgDir, `verfijning-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`);
      await sharp({ create: { width: 2 * B + 4, height: rijenN * H + (rijenN - 1) * 4, channels: 3, background: '#ffffff' } })
        .composite(tegels.map((t, i) => ({ input: t, left: (i % 2) * (B + 4), top: Math.floor(i / 2) * (H + 4) })))
        .jpeg({ quality: 70 })
        .toFile(uit);
      console.log(`  beeld: ${uit}`);
    }
  } finally {
    await c.end();
  }
}

main().catch(e => {
  console.error('FOUT', e);
  process.exit(1);
});
