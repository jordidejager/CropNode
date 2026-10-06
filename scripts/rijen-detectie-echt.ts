/**
 * rijen-detectie-echt.ts — rijdetectie op echte percelen + PDOK-luchtfoto's (node).
 *
 *   npx tsx scripts/rijen-detectie-echt.ts                       # standaardpercelen, beide lagen
 *   npx tsx scripts/rijen-detectie-echt.ts Steketee Spoor         # alleen deze percelen
 *   npx tsx scripts/rijen-detectie-echt.ts --user <uuid> --geen-img --profielen
 *   npx tsx scripts/rijen-detectie-echt.ts Busje --browserpad   # ook detecteerVoorPerceel (browserpad) testen
 *   npx tsx scripts/rijen-detectie-echt.ts --controle             # alleen niet-boomgaardvlakken (negatieve controle)
 *   npx tsx scripts/rijen-detectie-echt.ts Thuis --img-dir /tmp/x  # beelden elders neerzetten (niet in docs/)
 *
 * Per perceel en laag (Actueel_orthoHR, Actueel_ortho25): venster → WMS-JPEG (sharp decodeert) → grijs/
 * groen → masker → detecteerRijen (blind, en met de verwachte rijafstand als die bij de subpercelen staat).
 * Logt richting, afstand, fase, confidence, looptijd en beeldgrootte, en tekent de gevonden rijlijnen over
 * de luchtfoto: docs/rijenkaart/img/<perceel>-<laag>.jpg (overzicht, max 1000 px) en
 * <perceel>-<laag>-zoom.jpg (4 uitsneden van 24 × 18 m op 8 cm/px: midden, beide randen langs de normaal en het
 * verste rij-eind — daar zie je of de lijnen op de boomrijen liggen en of afstand/richting verlopen).
 * Met --browserpad draait daarnaast detecteerVoorPerceel/haalLuchtfotoOp (de browsercode uit pdok.ts) met
 * een minimale node-vervanging voor createImageBitmap/OffscreenCanvas (sharp), plus een foutpad.
 * Alleen lezen uit de database.
 */

import { config } from 'dotenv';
import { relative, resolve } from 'path';
import { mkdirSync } from 'fs';
import { Client } from 'pg';
import sharp from 'sharp';
import { naarWGS, parseGeometrie, perceelNaarRD } from '../src/lib/rijen/geo';
import { detecteerRijen, maakMasker, naarGrijs, naarGroenindex, vouwProfiel } from '../src/lib/rijen/detectie';
import {
  beeldVenster, detecteerVoorPerceel, haalLuchtfotoOp, pdokWmsUrl, PDOK_LAGEN, standaardRijKenmerk,
} from '../src/lib/rijen/pdok';
import { genereerRijen } from '../src/lib/rijen/generatie';
import type { DetectieResultaat, PerceelRD, XY } from '../src/lib/rijen/types';

config({ path: resolve(__dirname, '../.env.local') });

const STANDAARD_USER = '3ec9943a-ccfc-4a1b-b433-90dbd0ae0617';
const STANDAARD_PERCELEN = ['Steketee', 'Spoor', 'Schele', 'Yese', 'Busje', 'Jachthoek'];
const LAGEN = [PDOK_LAGEN.orthoHR, PDOK_LAGEN.ortho25];
const STANDAARD_IMG_DIR = resolve(__dirname, '../docs/rijenkaart/img');
const RAD = Math.PI / 180;

interface PerceelRij {
  id: string;
  name: string;
  geometry: unknown;
  rijafstand: number | null;
}

async function laadPercelen(userId: string, namen: string[]): Promise<PerceelRij[]> {
  const dbUrl = new URL(process.env.SUPABASE_DB_URL!);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const c = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com', port: 5432, user: `postgres.${ref}`,
    password: decodeURIComponent(dbUrl.password), database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    const r = await c.query(
      `select p.id, p.name, p.geometry,
              (select avg((d->'value'->>'row')::numeric)
                 from sub_parcels s, jsonb_array_elements(coalesce(s.planting_distances, '[]'::jsonb)) d
                where s.parcel_id = p.id and (d->'value'->>'row') is not null) as rijafstand
         from parcels p
        where p.user_id = $1 and p.geometry is not null and p.name = any($2)
        order by array_position($2, p.name)`,
      [userId, namen],
    );
    return r.rows.map(row => ({ ...row, rijafstand: row.rijafstand != null ? Number(row.rijafstand) : null }));
  } finally {
    await c.end();
  }
}

async function haalJpeg(bbox: [number, number, number, number], breedte: number, hoogte: number, laag: string) {
  const url = pdokWmsUrl(bbox, breedte, hoogte, laag);
  const res = await fetch(url);
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error(`PDOK ${res.status} ${type}`);
  const jpeg = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== breedte || info.height !== hoogte) throw new Error(`beeld ${info.width}×${info.height}, verwacht ${breedte}×${hoogte}`);
  return { rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), bytes: jpeg.length };
}

/** Perceelrand (geel) tekenen: binnenpixels met een buurpixel buiten */
function tekenRand(rgba: Uint8ClampedArray, w: number, h: number, binnen: Uint8Array) {
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const k = j * w + i;
      if (binnen[k] && (!binnen[k - 1] || !binnen[k + 1] || !binnen[k - w] || !binnen[k + w])) {
        rgba[k * 4] = 255; rgba[k * 4 + 1] = 220; rgba[k * 4 + 2] = 0;
      }
    }
  }
}

/** Gestreepte rijlijnen (magenta) op faseM + k·s, alleen binnen het perceel: laat de boomrij eronder zien */
function tekenFaseLijnen(rgba: Uint8ClampedArray, w: number, h: number, pixelM: number, origine: XY, perceel: PerceelRD,
  r: DetectieResultaat, lijnHalfM: number, streepM: number) {
  const binnen = maakMasker(perceel, w, h, pixelM, origine, 0);
  const nx = Math.cos(r.richtingGraden * RAD);
  const ny = -Math.sin(r.richtingGraden * RAD);
  const dx = Math.sin(r.richtingGraden * RAD);
  const dy = Math.cos(r.richtingGraden * RAD);
  const s = r.rijafstandM;
  const z = perceel.zwaartepunt;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!binnen[k] || !(s > 0)) continue;
      const px = origine[0] + (i + 0.5) * pixelM - z[0];
      const py = origine[1] - (j + 0.5) * pixelM - z[1];
      const t = px * nx + py * ny - r.faseM;
      const delta = t - s * Math.round(t / s);
      if (Math.abs(delta) > lijnHalfM) continue;
      const u = px * dx + py * dy;
      if (u - 2 * streepM * Math.floor(u / (2 * streepM)) > streepM) continue;
      const o = k * 4;
      rgba[o] = 255; rgba[o + 1] = 0; rgba[o + 2] = 200;
    }
  }
  tekenRand(rgba, w, h, binnen);
}

/** Gegenereerde rijen (genereerRijen, zoals de app ze toont) als lijnen tekenen; geeft het aantal rijen */
function tekenGegenereerd(rgba: Uint8ClampedArray, w: number, h: number, pixelM: number, origine: XY, perceel: PerceelRD,
  r: DetectieResultaat): number {
  const rijen = genereerRijen(perceel, {
    richtingGraden: r.richtingGraden, rijafstandM: r.rijafstandM, faseM: r.faseM, kopakkerBeginM: 0, kopakkerEindM: 0,
  });
  // eerst de geraakte pixels verzamelen (1 px breed), dan één keer mengen: 80 % magenta over de foto
  const geraakt = new Uint8Array(w * h);
  const stempel = (x: number, y: number) => {
    const i = Math.round((x - origine[0]) / pixelM - 0.5);
    const j = Math.round((origine[1] - y) / pixelM - 0.5);
    if (i >= 0 && j >= 0 && i < w && j < h) geraakt[j * w + i] = 1;
  };
  for (const rij of rijen) {
    for (let a = 1; a < rij.coordsRD.length; a++) {
      const [x0, y0] = rij.coordsRD[a - 1];
      const [x1, y1] = rij.coordsRD[a];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const stappen = Math.max(1, Math.ceil(len / (pixelM * 0.5)));
      for (let k = 0; k <= stappen; k++) stempel(x0 + ((x1 - x0) * k) / stappen, y0 + ((y1 - y0) * k) / stappen);
    }
  }
  for (let k = 0; k < w * h; k++) {
    if (!geraakt[k]) continue;
    const o = k * 4;
    rgba[o] = Math.round(0.2 * rgba[o] + 0.8 * 255);
    rgba[o + 1] = Math.round(0.2 * rgba[o + 1]);
    rgba[o + 2] = Math.round(0.2 * rgba[o + 2] + 0.8 * 200);
  }
  tekenRand(rgba, w, h, maakMasker(perceel, w, h, pixelM, origine, 0));
  return rijen.length;
}

/**
 * Vier zoomplekken (24 × 18 m): midden, de twee uitersten langs de normaal (daar verloopt een fout in de
 * rijafstand het sterkst) en het verste punt langs de rij (daar telt een richtingsfout het meest).
 */
function zoomPlekken(perceel: PerceelRD, r: DetectieResultaat): { naam: string; p: XY }[] {
  const v = beeldVenster(perceel, { doelPixelM: 1 });
  let m = maakMasker(perceel, v.breedte, v.hoogte, v.pixelM, v.origineRD, 14);
  if (!m.some(x => x)) m = maakMasker(perceel, v.breedte, v.hoogte, v.pixelM, v.origineRD, 4);
  const z = perceel.zwaartepunt;
  const nx = Math.cos(r.richtingGraden * RAD);
  const ny = -Math.sin(r.richtingGraden * RAD);
  const dx = Math.sin(r.richtingGraden * RAD);
  const dy = Math.cos(r.richtingGraden * RAD);
  let midden: XY | null = null;
  let middenD = Infinity;
  let tMin: XY | null = null;
  let tMax: XY | null = null;
  let uVer: XY | null = null;
  let tlo = Infinity;
  let thi = -Infinity;
  let umax = -1;
  for (let j = 0; j < v.hoogte; j++) {
    for (let i = 0; i < v.breedte; i++) {
      if (!m[j * v.breedte + i]) continue;
      const p: XY = [v.origineRD[0] + (i + 0.5) * v.pixelM, v.origineRD[1] - (j + 0.5) * v.pixelM];
      const px = p[0] - z[0];
      const py = p[1] - z[1];
      const t = px * nx + py * ny;
      const u = Math.abs(px * dx + py * dy);
      const d = Math.hypot(px, py);
      if (d < middenD) { middenD = d; midden = p; }
      if (t < tlo) { tlo = t; tMin = p; }
      if (t > thi) { thi = t; tMax = p; }
      if (u > umax) { umax = u; uVer = p; }
    }
  }
  const uit: { naam: string; p: XY }[] = [];
  if (midden) uit.push({ naam: 'midden', p: midden });
  if (tMin) uit.push({ naam: `rand −n (${tlo.toFixed(0)} m)`, p: tMin });
  if (tMax) uit.push({ naam: `rand +n (+${thi.toFixed(0)} m)`, p: tMax });
  if (uVer) uit.push({ naam: `rij-eind (${umax.toFixed(0)} m)`, p: uVer });
  return uit;
}

async function zoomMontage(perceel: PerceelRD, r: DetectieResultaat, laag: string, bestand: string) {
  const zp = 0.08;
  const zb = 300;
  const zh = 225;
  const plekken = zoomPlekken(perceel, r);
  const tegels: { input: Buffer; left: number; top: number }[] = [];
  for (let idx = 0; idx < plekken.length; idx++) {
    const { naam, p } = plekken[idx];
    const zo: XY = [p[0] - (zb * zp) / 2, p[1] + (zh * zp) / 2];
    const foto = await haalJpeg([zo[0], zo[1] - zh * zp, zo[0] + zb * zp, zo[1]], zb, zh, laag);
    tekenFaseLijnen(foto.rgba, zb, zh, zp, zo, perceel, r, 0.05, 1.2);
    const label = Buffer.from(
      `<svg width="${zb}" height="${zh}"><rect x="0" y="0" width="${zb}" height="18" fill="black" fill-opacity="0.55"/>` +
      `<text x="5" y="13" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="white">${naam}</text></svg>`,
    );
    const tegel = await sharp(Buffer.from(foto.rgba.buffer), { raw: { width: zb, height: zh, channels: 4 } })
      .composite([{ input: label, left: 0, top: 0 }])
      .png()
      .toBuffer();
    tegels.push({ input: tegel, left: (idx % 2) * (zb + 4), top: Math.floor(idx / 2) * (zh + 4) });
  }
  const rijenTegels = Math.ceil(tegels.length / 2);
  await sharp({ create: { width: 2 * zb + 4, height: rijenTegels * zh + (rijenTegels - 1) * 4, channels: 3, background: '#ffffff' } })
    .composite(tegels)
    .jpeg({ quality: 70 })
    .toFile(bestand);
}

function sparkline(v: Float64Array): string {
  const tekens = '▁▂▃▄▅▆▇█';
  let min = Infinity;
  let max = -Infinity;
  for (const x of v) { min = Math.min(min, x); max = Math.max(max, x); }
  return Array.from(v, x => tekens[Math.min(7, Math.floor(((x - min) / (max - min || 1)) * 8))]).join('');
}

/**
 * Draai de browsercode (detecteerVoorPerceel → haalLuchtfotoOp → decodeer) in node, met createImageBitmap en
 * OffscreenCanvas nagebootst via sharp. Controleert voortgangsteksten, resultaat en een nette foutmelding.
 */
async function browserpadTest(perceel: PerceelRD, naam: string) {
  const g = globalThis as Record<string, unknown>;
  const oud = { createImageBitmap: g.createImageBitmap, OffscreenCanvas: g.OffscreenCanvas };
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
  try {
    const stappen: string[] = [];
    const r = await detecteerVoorPerceel(perceel, { onVoortgang: stap => stappen.push(stap) });
    const d = r.diagnostiek ?? {};
    console.log(`\n[browserpad] ${naam}: stappen ${JSON.stringify(stappen)} → θ=${r.richtingGraden}° s=${r.rijafstandM} ` +
      `fase=${r.faseM} conf=${r.confidence} bron='${r.bronBeeld}' totaal ${r.duurMs} ms (ophalen ${d.ophaalMs}, rekenen ${d.rekenMs}) ` +
      `beeld ${d.beeldBreedte}×${d.beeldHoogte}`);
    if (stappen[0] !== 'Luchtfoto ophalen…' || stappen[1] !== 'Rijen zoeken…') throw new Error('voortgangsteksten kloppen niet');
    if (r.bronBeeld !== `PDOK ${PDOK_LAGEN.orthoHR}`) throw new Error('bronBeeld klopt niet');
    try {
      await haalLuchtfotoOp(beeldVenster(perceel), 'Bestaatniet');
      throw new Error('foutpad: geen fout gegooid');
    } catch (e) {
      const melding = e instanceof Error ? e.message : String(e);
      console.log(`[browserpad] foutpad (onbekende laag): "${melding}"`);
      if (!melding.startsWith('PDOK gaf geen luchtfoto')) throw e;
    }
  } finally {
    g.createImageBitmap = oud.createImageBitmap;
    g.OffscreenCanvas = oud.OffscreenCanvas;
  }
}

function bestandsnaam(naam: string): string {
  return naam.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Negatieve controles: vlakken zonder boomgaard naast Steketee (RD New), om te zien wat de confidence doet
 * op gras, graan, een akker en een erf. Let op: werkgangen van ~3 m (zaaimachine, maaier, bedden) zijn
 * ook een regelmatig patroon in de rijenband.
 */
const CONTROLE_VLAKKEN: Record<string, XY[]> = {
  'gras (maaibanen)': [[53198.0, 386922.5], [53323.0, 386985.0], [53323.0, 386897.5], [53198.0, 386897.5]],
  'graan': [[52868.0, 387202.5], [53060.5, 387202.5], [52973.0, 387152.5], [52868.0, 387085.0]],
  'akker (bedden)': [[52863.0, 387020.0], [52923.0, 386985.0], [52943.0, 386897.5], [52863.0, 386897.5]],
  'erf': [[53000.5, 387150.0], [53085.5, 387160.0], [53085.5, 387092.5], [53000.5, 387085.0]],
};

async function controles() {
  console.log('\n| Controlevlak | Laag | Richting | Rijafstand (m) | Confidence | autocorr | piek/achtergrond | significantie | streepsterkte |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [naam, ring] of Object.entries(CONTROLE_VLAKKEN)) {
    const coords = ring.map(p => naarWGS(p));
    coords.push(coords[0]);
    const perceel = perceelNaarRD({ type: 'Polygon', coordinates: [coords] });
    const v = beeldVenster(perceel);
    for (const laag of LAGEN) {
      const foto = await haalJpeg(v.bbox, v.breedte, v.hoogte, laag);
      const r = detecteerRijen({
        grijs: naarGrijs(foto.rgba, v.breedte, v.hoogte), groen: naarGroenindex(foto.rgba, v.breedte, v.hoogte),
        breedte: v.breedte, hoogte: v.hoogte, pixelM: v.pixelM, origineRD: v.origineRD,
        masker: maakMasker(perceel, v.breedte, v.hoogte, v.pixelM, v.origineRD, 3), zwaartepuntRD: perceel.zwaartepunt,
      });
      const d = r.diagnostiek ?? {};
      console.log(`| ${naam} | ${laag} | ${r.richtingGraden}° | ${r.rijafstandM} | ${r.confidence} | ${d.autocorrelatie} | ` +
        `${d.piekAchtergrond} | ${d.significantie} | ${d.streepsterkte} |`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const userIdx = args.indexOf('--user');
  const userId = userIdx >= 0 ? args[userIdx + 1] : STANDAARD_USER;
  const dirIdx = args.indexOf('--img-dir');
  const imgDir = dirIdx >= 0 ? resolve(args[dirIdx + 1]) : STANDAARD_IMG_DIR;
  const metImg = !args.includes('--geen-img');
  const browserpad = args.includes('--browserpad');
  const profielen = args.includes('--profielen');
  if (args.includes('--controle')) {
    await controles();
    return;
  }
  const waardeIdx = new Set([userIdx, dirIdx].filter(i => i >= 0).map(i => i + 1));
  const namen = args.filter((a, i) => !a.startsWith('--') && !waardeIdx.has(i));
  const percelen = await laadPercelen(userId, namen.length ? namen : STANDAARD_PERCELEN);
  if (metImg) mkdirSync(imgDir, { recursive: true });
  // dubbele perceelnamen (bv. twee keer 'Thuis') krijgen een stukje id in de bestandsnaam
  const naamTelling = new Map<string, number>();
  for (const p of percelen) naamTelling.set(p.name, (naamTelling.get(p.name) ?? 0) + 1);

  const regels: string[] = [];
  for (const p of percelen) {
    const geom = parseGeometrie(p.geometry);
    if (!geom) {
      console.log(`${p.name}: geen geldige geometrie`);
      continue;
    }
    const perceel = perceelNaarRD(geom);
    if (browserpad) await browserpadTest(perceel, p.name);
    const venster = beeldVenster(perceel);
    console.log(`\n=== ${p.name} (${geom.type}, ${(perceel.oppervlakM2 / 1e4).toFixed(2)} ha, verwacht ${p.rijafstand ?? '?'} m) ` +
      `— beeld ${venster.breedte}×${venster.hoogte} px @ ${venster.pixelM} m`);
    for (const laag of LAGEN) {
      const t0 = Date.now();
      let foto;
      try {
        foto = await haalJpeg(venster.bbox, venster.breedte, venster.hoogte, laag);
      } catch (e) {
        console.log(`  ${laag}: ophalen mislukt — ${e instanceof Error ? e.message : e}`);
        continue;
      }
      const ophaalMs = Date.now() - t0;
      const kenmerk = standaardRijKenmerk(laag);
      const t1 = Date.now();
      const grijs = naarGrijs(foto.rgba, venster.breedte, venster.hoogte);
      const groen = naarGroenindex(foto.rgba, venster.breedte, venster.hoogte);
      const masker = maakMasker(perceel, venster.breedte, venster.hoogte, venster.pixelM, venster.origineRD, 3);
      const voorbereidMs = Date.now() - t1;
      const invoer = {
        grijs, groen, rijKenmerk: kenmerk, breedte: venster.breedte, hoogte: venster.hoogte, pixelM: venster.pixelM,
        origineRD: venster.origineRD, masker, zwaartepuntRD: perceel.zwaartepunt, bronBeeld: `PDOK ${laag}`,
      };
      const blind = detecteerRijen(invoer);
      const metVerwacht = p.rijafstand ? detecteerRijen({ ...invoer, verwachteRijafstandM: p.rijafstand }) : null;
      const d = blind.diagnostiek ?? {};
      console.log(`  ${laag}: θ=${blind.richtingGraden}° s=${blind.rijafstandM} m fase=${blind.faseM} m ` +
        `conf=${blind.confidence} (${blind.voldoende ? 'voldoende' : 'ONVOLDOENDE'}) — ${blind.duurMs} ms rekenen ` +
        `(+${voorbereidMs} ms grijs/masker, ${ophaalMs} ms ophalen, ${(foto.bytes / 1024).toFixed(0)} kB)`);
      console.log(`     autocorr=${d.autocorrelatie} streepsterkte=${d.streepsterkte}/${d.streepsterkteKenmerk} piek/achtergrond=${d.piekAchtergrond} significantie=${d.significantie} rand=${d.opRandZoekbereik} meerdere=${d.meerdereRichtingen} reden=${d.reden} grof=${d.grofRichting}°/${d.grofRijafstandM} ` +
        `contrastRij=${d.contrastRij} halveRij=${d.contrastHalveRij} twijfel=${d.halveRijTwijfel} ` +
        `(voorb ${d.voorbewerkingMs}, grof ${d.grofMs}, fijn ${d.fijnMs}, zoeken+fase+confidence ${d.zoekEnBeoordeelMs} ms)`);
      if (metVerwacht) {
        console.log(`     met verwachte ${p.rijafstand} m: θ=${metVerwacht.richtingGraden}° s=${metVerwacht.rijafstandM} ` +
          `fase=${metVerwacht.faseM} conf=${metVerwacht.confidence}`);
      }
      if (profielen && blind.rijafstandM > 0) {
        const args2 = [venster.breedte, venster.hoogte, venster.pixelM, venster.origineRD, perceel.zwaartepunt, blind.richtingGraden, blind.rijafstandM] as const;
        const vg = vouwProfiel(grijs, masker, ...args2);
        const vgr = vouwProfiel(groen, masker, ...args2);
        console.log(`     grijs  ${sparkline(vg.waarden)} min ${vg.minimumM.toFixed(2)} max ${vg.maximumM.toFixed(2)} bereik ${vg.bereik.toFixed(1)}`);
        console.log(`     groen  ${sparkline(vgr.waarden)} min ${vgr.minimumM.toFixed(2)} max ${vgr.maximumM.toFixed(2)} bereik ${vgr.bereik.toFixed(2)}`);
      }
      regels.push(`| ${p.name} | ${laag} | ${blind.richtingGraden}° | ${blind.rijafstandM} | ${blind.faseM} | ${blind.confidence} | ` +
        `${blind.voldoende ? 'voldoende' : `onvoldoende: ${d.reden}`} | ` +
        `${blind.duurMs} | ${venster.breedte}×${venster.hoogte} | ${p.rijafstand ?? '–'} | ` +
        `${metVerwacht ? `${metVerwacht.richtingGraden}° / ${metVerwacht.rijafstandM} / ${metVerwacht.confidence}` : '–'} |`);

      if (metImg && blind.rijafstandM > 0) {
        const uniek = (naamTelling.get(p.name) ?? 0) > 1 ? `-${p.id.slice(0, 4)}` : '';
        const basis = `${bestandsnaam(p.name)}${uniek}-${laag}`;
        const kopie = new Uint8ClampedArray(foto.rgba);
        const aantal = tekenGegenereerd(kopie, venster.breedte, venster.hoogte, venster.pixelM, venster.origineRD, perceel, blind);
        await sharp(Buffer.from(kopie.buffer), { raw: { width: venster.breedte, height: venster.hoogte, channels: 4 } })
          .resize({ width: Math.min(1000, venster.breedte) })
          .removeAlpha()
          .jpeg({ quality: 62 })
          .toFile(resolve(imgDir, `${basis}.jpg`));
        try {
          await zoomMontage(perceel, blind, laag, resolve(imgDir, `${basis}-zoom.jpg`));
        } catch (e) {
          console.log(`     zoom mislukt: ${e instanceof Error ? e.message : e}`);
        }
        const map = relative(process.cwd(), imgDir) || '.';
        console.log(`     beelden: ${map}/${basis}.jpg (${aantal} gegenereerde rijen), ${map}/${basis}-zoom.jpg`);
      }
    }
  }
  console.log('\n| Perceel | Laag | Richting | Rijafstand (m) | Fase (m) | Confidence | Oordeel | Rekentijd (ms) | Beeld (px) | Verwacht (m) | Met verwachting (θ / s / conf) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of regels) console.log(r);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
