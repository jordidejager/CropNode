/**
 * Rijenkaart — PDOK-luchtfoto ophalen en rijdetectie per perceel (browser).
 *
 * WMS 1.3.0 in RD New (EPSG:28992). Volgens GetCapabilities
 * (https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?request=GetCapabilities&service=WMS):
 *  - EPSG:28992 heeft as-volgorde x (oost), y (noord), dus BBOX=minx,miny,maxx,maxy;
 *  - MaxWidth = MaxHeight = 2500 px; grotere percelen krijgen daarom een grotere pixel;
 *  - CORS staat open (Access-Control-Allow-Origin: *), dus geen proxy nodig.
 * Er wordt alleen op PDOK-beeld gedetecteerd (open data, CC-BY), nooit op commerciële tegels.
 *
 * Mobiel (iPhone): ophalen stopt na PDOK_TIMEOUT_MS met een nette melding en is af te breken via een
 * AbortSignal; decoderen gaat via createImageBitmap + OffscreenCanvas (iOS 16.4+) met <img> + canvas als
 * vangnet; het canvas wordt na het uitlezen direct op 0 × 0 gezet (Safari geeft canvasgeheugen anders pas
 * bij de garbage collector vrij en weigert dan nieuwe canvassen); vóór het rekenwerk wordt een frame
 * afgewacht zodat de voortgangstekst echt in beeld staat.
 */

import { PDOK_ATTRIBUTIE, PDOK_LAGEN, PDOK_WMS_URL, pdokWmtsUrl } from './pdok-lagen';
import type { PdokLaag } from './pdok-lagen';
import { detecteerRijen, maakMasker, naarGrijs, naarGroenindex } from './detectie';
import type { RijKenmerk } from './detectie';
import type { DetectieResultaat, LngLat, PerceelRD, XY } from './types';
import { naarRD } from './geo';
import { verfijnRijen } from './verfijning';
import type { VerfijnResultaat } from './verfijning';

export { PDOK_ATTRIBUTIE, PDOK_LAGEN, pdokWmtsUrl };
export type { PdokLaag };

/** Maximale WIDTH/HEIGHT van de PDOK-luchtfoto-WMS (GetCapabilities) */
export const PDOK_WMS_MAX_PIXELS = 2500;

export interface BeeldVenster {
  /** [minX, minY, maxX, maxY] in RD; precies breedte × pixelM bij hoogte × pixelM */
  bbox: [number, number, number, number];
  breedte: number;
  hoogte: number;
  pixelM: number;
  /** Linkerbovenhoek [minX, maxY] */
  origineRD: XY;
}

export interface Luchtfoto {
  rgba: Uint8ClampedArray;
  breedte: number;
  hoogte: number;
}

/**
 * Beeldvenster rond een perceel: bbox + marge, doelresolutie 0,25 m/px. Is het perceel groter dan
 * maxPixels × doelPixelM, dan wordt de pixel groter (de WMS levert maximaal 2500 px per zijde).
 */
export function beeldVenster(
  perceel: PerceelRD,
  opties?: { margeM?: number; doelPixelM?: number; maxPixels?: number },
): BeeldVenster {
  const marge = opties?.margeM ?? 10;
  const doel = opties?.doelPixelM ?? 0.25;
  const maxPx = Math.min(opties?.maxPixels ?? PDOK_WMS_MAX_PIXELS, PDOK_WMS_MAX_PIXELS);
  const [minX0, minY0, maxX0, maxY0] = perceel.bbox;
  if (![minX0, minY0, maxX0, maxY0].every(Number.isFinite)) throw new Error('Perceel heeft geen geldige geometrie');
  const minX = minX0 - marge;
  const maxY = maxY0 + marge;
  const b = maxX0 + marge - minX;
  const h = maxY - (minY0 - marge);
  let pixelM = Math.max(doel, Math.max(b, h) / maxPx);
  // nette waarde (op mm naar boven), zodat URL en rekenwerk reproduceerbaar zijn
  pixelM = Math.ceil(pixelM * 1000 - 1e-9) / 1000;
  const breedte = Math.max(1, Math.min(maxPx, Math.ceil(b / pixelM - 1e-9)));
  const hoogte = Math.max(1, Math.min(maxPx, Math.ceil(h / pixelM - 1e-9)));
  const bbox: [number, number, number, number] = [minX, maxY - hoogte * pixelM, minX + breedte * pixelM, maxY];
  return { bbox, breedte, hoogte, pixelM, origineRD: [minX, maxY] };
}

function getal(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** WMS 1.3.0 GetMap-URL (EPSG:28992, JPEG) voor een RD-bbox [minx, miny, maxx, maxy] */
export function pdokWmsUrl(
  bbox: [number, number, number, number],
  breedte: number,
  hoogte: number,
  laag: PdokLaag | string = PDOK_LAGEN.orthoHR,
): string {
  const params = [
    'SERVICE=WMS',
    'VERSION=1.3.0',
    'REQUEST=GetMap',
    `LAYERS=${encodeURIComponent(laag)}`,
    'STYLES=',
    'CRS=EPSG:28992',
    `BBOX=${bbox.map(getal).join(',')}`,
    `WIDTH=${Math.round(breedte)}`,
    `HEIGHT=${Math.round(hoogte)}`,
    'FORMAT=image/jpeg',
  ];
  return `${PDOK_WMS_URL}?${params.join('&')}`;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 2D-context van breedte × hoogte, plus een functie die het canvasgeheugen direct vrijgeeft (iOS Safari). */
function maakContext(breedte: number, hoogte: number): { ctx: Context2D; vrijgeven: () => void } {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(breedte, hoogte);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        return {
          ctx: ctx as OffscreenCanvasRenderingContext2D,
          vrijgeven: () => {
            canvas.width = 0;
            canvas.height = 0;
          },
        };
      }
    } catch {
      // val terug op een gewoon canvas
    }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = breedte;
    canvas.height = hoogte;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      return {
        ctx,
        vrijgeven: () => {
          canvas.width = 0;
          canvas.height = 0;
        },
      };
    }
  }
  throw new Error('Deze browser kan de luchtfoto niet verwerken (geen canvas beschikbaar).');
}

/** Decodeer via een <img> (vangnet als createImageBitmap ontbreekt of faalt) */
async function laadAlsImage(blob: Blob): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Deze omgeving kan geen afbeeldingen decoderen.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeer(blob: Blob, breedte: number, hoogte: number): Promise<Uint8ClampedArray> {
  let bron: CanvasImageSource | null = null;
  let opruimen = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      bron = bitmap;
      opruimen = () => bitmap.close();
    } catch {
      bron = null; // sommige (oudere) Safari-versies: via <img> proberen
    }
  }
  if (!bron) bron = await laadAlsImage(blob);
  const { ctx, vrijgeven } = maakContext(breedte, hoogte);
  try {
    // de WMS levert exact breedte × hoogte; schalen is alleen een vangnet
    (ctx as CanvasRenderingContext2D).drawImage(bron, 0, 0, breedte, hoogte);
    const data = ctx.getImageData(0, 0, breedte, hoogte).data;
    if (data.length < breedte * hoogte * 4) throw new Error('onvolledige pixels');
    return data;
  } finally {
    opruimen();
    vrijgeven();
  }
}

/** Standaard maximale wachttijd voor de WMS (een mobiele verbinding kan traag zijn, maar niet eindeloos) */
export const PDOK_TIMEOUT_MS = 30000;

function afgebroken(): Error {
  return new Error('Rijdetectie afgebroken.');
}

/** Haal de luchtfoto voor een venster op en geef de RGBA-pixels terug (browser). */
export async function haalLuchtfotoOp(
  venster: BeeldVenster,
  laag: PdokLaag | string = PDOK_LAGEN.orthoHR,
  opties?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<Luchtfoto> {
  const url = pdokWmsUrl(venster.bbox, venster.breedte, venster.hoogte, laag);
  const extern = opties?.signal;
  if (extern?.aborted) throw afgebroken();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let verlopen = false;
  const timer = setTimeout(() => {
    verlopen = true;
    controller?.abort();
  }, opties?.timeoutMs ?? PDOK_TIMEOUT_MS);
  const doorgeven = () => controller?.abort();
  extern?.addEventListener('abort', doorgeven);
  try {
    let antwoord: Response;
    try {
      antwoord = await fetch(url, { mode: 'cors', signal: controller?.signal });
    } catch {
      if (extern?.aborted) throw afgebroken();
      if (verlopen) throw new Error('Luchtfoto ophalen duurde te lang. Controleer je verbinding en probeer het opnieuw.');
      throw new Error('Luchtfoto ophalen mislukt: geen verbinding met PDOK. Controleer je internet en probeer het opnieuw.');
    }
    if (!antwoord.ok) {
      throw new Error(`Luchtfoto ophalen mislukt: PDOK gaf foutcode ${antwoord.status}. Probeer het later opnieuw.`);
    }
    const type = antwoord.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) {
      // een WMS meldt fouten als XML (ServiceException) met status 200
      throw new Error('PDOK gaf geen luchtfoto terug voor dit perceel. Probeer het later opnieuw.');
    }
    let blob: Blob;
    try {
      blob = await antwoord.blob();
    } catch {
      if (extern?.aborted) throw afgebroken();
      if (verlopen) throw new Error('Luchtfoto ophalen duurde te lang. Controleer je verbinding en probeer het opnieuw.');
      throw new Error('Luchtfoto ophalen mislukt: de verbinding werd onderbroken.');
    }
    if (blob.size === 0) throw new Error('PDOK gaf een leeg beeld terug. Probeer het later opnieuw.');
    let rgba: Uint8ClampedArray;
    try {
      rgba = await decodeer(blob, venster.breedte, venster.hoogte);
    } catch (e) {
      const reden = e instanceof Error && e.message.startsWith('Deze ') ? e.message : 'het beeld kon niet worden gelezen.';
      throw new Error(`Luchtfoto verwerken mislukt: ${reden}`);
    }
    return { rgba, breedte: venster.breedte, hoogte: venster.hoogte };
  } finally {
    clearTimeout(timer);
    extern?.removeEventListener('abort', doorgeven);
  }
}

/**
 * Welk kenmerk de boomrij in een PDOK-laag markeert (gemeten op echte percelen, zie
 * docs/rijenkaart/detectie-resultaten.md).
 * Voorjaar (orthoHR, bladloos): de herbicidestrook onder de bomen is bruin/beige en het gras groen, dus de
 * minst groene strook is de boomrij (alle gecontroleerde percelen goed).
 * Zomer (ortho25): onder hagelnet is de rij (net + witte palen) de minst groene, lichte strook; zonder net
 * (peren) is de kroon juist de groenste, donkere strook. 'minstGroen' was op 5/6 percelen goed — daarom
 * detecteert detecteerVoorPerceel standaard op orthoHR.
 */
export function standaardRijKenmerk(_laag: PdokLaag | string): RijKenmerk {
  return 'minstGroen';
}

/**
 * Geef de browser de kans de voortgangstekst te tekenen vóór het zware (synchrone) rekenwerk: wacht op het
 * volgende frame en dan nog één taak (na de paint). Valt terug op setTimeout als er geen frames komen
 * (tabblad op de achtergrond, node).
 */
function pauze(): Promise<void> {
  return new Promise(resolve => {
    let klaar = false;
    const door = () => {
      if (klaar) return;
      klaar = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(door, 0));
      setTimeout(door, 100);
    } else {
      setTimeout(door, 0);
    }
  });
}

function nu(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Volledige detectie voor één perceel (browser): venster → luchtfoto → grijs/groen → masker → detectie.
 * Standaard op orthoHR (voorjaar, bladloos): daarop klopt de fase het best; laat `laag` dus bij voorkeur weg,
 * ook als de basiskaart de zomerlaag toont. duurMs is de totale tijd (ophalen + rekenen); de delen staan in
 * `diagnostiek` (ophaalMs, rekenMs, beeldBreedte, beeldHoogte, pixelM). Met `signal` kan de UI afbreken
 * (fout 'Rijdetectie afgebroken.').
 */
export async function detecteerVoorPerceel(
  perceel: PerceelRD,
  opties?: {
    laag?: PdokLaag | string;
    verwachteRijafstandM?: number | null;
    onVoortgang?: (stap: string) => void;
    rijKenmerk?: RijKenmerk;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<DetectieResultaat> {
  const start = nu();
  const laag = opties?.laag ?? PDOK_LAGEN.orthoHR;
  const signal = opties?.signal;
  const venster = beeldVenster(perceel);

  opties?.onVoortgang?.('Luchtfoto ophalen…');
  await pauze();
  if (signal?.aborted) throw afgebroken();
  const foto = await haalLuchtfotoOp(venster, laag, { signal, timeoutMs: opties?.timeoutMs });
  const ophaalMs = nu() - start;

  opties?.onVoortgang?.('Rijen zoeken…');
  await pauze();
  if (signal?.aborted) throw afgebroken();
  const tReken = nu();
  const kenmerk = opties?.rijKenmerk ?? standaardRijKenmerk(laag);
  const grijs = naarGrijs(foto.rgba, foto.breedte, foto.hoogte);
  const groen = kenmerk === 'minstGroen' ? naarGroenindex(foto.rgba, foto.breedte, foto.hoogte) : null;
  const masker = maakMasker(perceel, foto.breedte, foto.hoogte, venster.pixelM, venster.origineRD, 3);
  const resultaat = detecteerRijen({
    grijs,
    groen,
    rijKenmerk: kenmerk,
    breedte: foto.breedte,
    hoogte: foto.hoogte,
    pixelM: venster.pixelM,
    origineRD: venster.origineRD,
    masker,
    zwaartepuntRD: perceel.zwaartepunt,
    verwachteRijafstandM: opties?.verwachteRijafstandM ?? null,
    bronBeeld: `PDOK ${laag}`,
  });
  const eind = nu();
  return {
    ...resultaat,
    duurMs: Math.round(eind - start),
    diagnostiek: {
      ...(resultaat.diagnostiek ?? {}),
      ophaalMs: Math.round(ophaalMs),
      rekenMs: Math.round(eind - tReken),
      beeldBreedte: foto.breedte,
      beeldHoogte: foto.hoogte,
      pixelM: venster.pixelM,
    },
  };
}


// ---------------------------------------------------------------------------
// Verfijning: fijn beeld (±10 cm/px, in tegels) en rijen per rij op de foto leggen
// ---------------------------------------------------------------------------

/** Rijkenmerk-raster (groenindex) voor de verfijning */
export interface FijnBeeld {
  waarden: Float32Array;
  breedte: number;
  hoogte: number;
  pixelM: number;
  origineRD: XY;
}

/** Tegelgrootte voor de WMS (onder de limiet van 2500 px) */
const TEGEL_PX = 2000;
/** Maximaal aantal pixels voor de verfijning (geheugen op de iPhone: ±4 bytes per pixel) */
const MAX_FIJN_PIXELS = 16_000_000;

/** Venster rond een RD-bbox op ±doelPixelM (standaard 0,10 m/px), groter pixel als het te groot wordt. */
export function fijnVenster(
  bbox: [number, number, number, number],
  opties?: { margeM?: number; doelPixelM?: number; maxPixels?: number },
): BeeldVenster {
  const marge = opties?.margeM ?? 6;
  const doel = opties?.doelPixelM ?? 0.1;
  const maxPx = opties?.maxPixels ?? MAX_FIJN_PIXELS;
  const minX = bbox[0] - marge;
  const maxY = bbox[3] + marge;
  const b = bbox[2] + marge - minX;
  const h = maxY - (bbox[1] - marge);
  let pixelM = Math.max(doel, Math.sqrt((b * h) / maxPx));
  pixelM = Math.ceil(pixelM * 1000 - 1e-9) / 1000;
  const breedte = Math.max(1, Math.ceil(b / pixelM - 1e-9));
  const hoogte = Math.max(1, Math.ceil(h / pixelM - 1e-9));
  return {
    bbox: [minX, maxY - hoogte * pixelM, minX + breedte * pixelM, maxY],
    breedte,
    hoogte,
    pixelM,
    origineRD: [minX, maxY],
  };
}

/** Haal de luchtfoto voor een (groot) venster in tegels op en geef direct de groenindex terug (browser). */
export async function haalGroenBeeldOp(
  venster: BeeldVenster,
  opties?: {
    laag?: PdokLaag | string;
    signal?: AbortSignal;
    timeoutMs?: number;
    onTegel?: (klaar: number, totaal: number) => void;
  },
): Promise<FijnBeeld> {
  const laag = opties?.laag ?? PDOK_LAGEN.orthoHR;
  const { breedte, hoogte, pixelM, origineRD } = venster;
  const waarden = new Float32Array(breedte * hoogte);
  const tegels: { x0: number; y0: number; b: number; h: number }[] = [];
  for (let y0 = 0; y0 < hoogte; y0 += TEGEL_PX) {
    for (let x0 = 0; x0 < breedte; x0 += TEGEL_PX) {
      tegels.push({ x0, y0, b: Math.min(TEGEL_PX, breedte - x0), h: Math.min(TEGEL_PX, hoogte - y0) });
    }
  }
  let klaar = 0;
  let volgende = 0;
  const werker = async () => {
    while (volgende < tegels.length) {
      const tg = tegels[volgende++];
      if (opties?.signal?.aborted) throw afgebroken();
      const minX = origineRD[0] + tg.x0 * pixelM;
      const maxY = origineRD[1] - tg.y0 * pixelM;
      const sub: BeeldVenster = {
        bbox: [minX, maxY - tg.h * pixelM, minX + tg.b * pixelM, maxY],
        breedte: tg.b,
        hoogte: tg.h,
        pixelM,
        origineRD: [minX, maxY],
      };
      const foto = await haalLuchtfotoOp(sub, laag, { signal: opties?.signal, timeoutMs: opties?.timeoutMs });
      const groen = naarGroenindex(foto.rgba, foto.breedte, foto.hoogte);
      for (let j = 0; j < tg.h; j++) {
        waarden.set(groen.subarray(j * tg.b, (j + 1) * tg.b), (tg.y0 + j) * breedte + tg.x0);
      }
      klaar++;
      opties?.onTegel?.(klaar, tegels.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, tegels.length) }, () => werker()));
  return { waarden, breedte, hoogte, pixelM, origineRD };
}

export interface VerfijnInvoerRij {
  id: string;
  nummer: number;
  coordinates: LngLat[];
}

/**
 * Rijen van een perceel per rij precies op de luchtfoto leggen (browser): fijn beeld (±10 cm/px, voorjaar
 * 8 cm-laag) rond de rijen ophalen → groenindex → verfijnRijen. Met `beeld` kan een eerder opgehaald beeld
 * hergebruikt worden (bv. om één rij opnieuw te leggen); het gebruikte beeld komt terug in de uitkomst.
 */
export async function verfijnVoorPerceel(
  perceel: PerceelRD,
  rijen: VerfijnInvoerRij[],
  opties: {
    richtingGraden: number;
    rijafstandM: number;
    beeld?: FijnBeeld | null;
    onVoortgang?: (stap: string) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<{ resultaat: VerfijnResultaat; beeld: FijnBeeld; bronBeeld: string; ophaalMs: number }> {
  const start = nu();
  const coordsRD = rijen.map(r => r.coordinates.map(c => naarRD(c)));
  let beeld = opties.beeld ?? null;
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const lijn of coordsRD) {
    for (const [x, y] of lijn) {
      bbox[0] = Math.min(bbox[0], x);
      bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x);
      bbox[3] = Math.max(bbox[3], y);
    }
  }
  if (!bbox.every(Number.isFinite)) throw new Error('Geen rijen om op de foto te leggen.');
  const marge = opties.rijafstandM + 3;
  const dekt = (b: FijnBeeld) =>
    b.origineRD[0] <= bbox[0] - marge + 0.5 &&
    b.origineRD[1] >= bbox[3] + marge - 0.5 &&
    b.origineRD[0] + b.breedte * b.pixelM >= bbox[2] + marge - 0.5 &&
    b.origineRD[1] - b.hoogte * b.pixelM <= bbox[1] - marge + 0.5;
  if (!beeld || !dekt(beeld)) {
    const venster = fijnVenster(bbox, { margeM: marge });
    opties.onVoortgang?.('Scherpe luchtfoto ophalen…');
    await pauze();
    if (opties.signal?.aborted) throw afgebroken();
    beeld = await haalGroenBeeldOp(venster, {
      signal: opties.signal,
      timeoutMs: opties.timeoutMs,
      onTegel: (k, t) => {
        if (t > 1) opties.onVoortgang?.(`Scherpe luchtfoto ophalen… (${k}/${t})`);
      },
    });
  }
  const ophaalMs = nu() - start;
  opties.onVoortgang?.('Rijen op de foto leggen…');
  await pauze();
  if (opties.signal?.aborted) throw afgebroken();
  const resultaat = verfijnRijen({
    waarden: beeld.waarden,
    breedte: beeld.breedte,
    hoogte: beeld.hoogte,
    pixelM: beeld.pixelM,
    origineRD: beeld.origineRD,
    richtingGraden: opties.richtingGraden,
    rijafstandM: opties.rijafstandM,
    zwaartepunt: perceel.zwaartepunt,
    rijen: rijen.map((r, i) => ({ id: r.id, nummer: r.nummer, coordsRD: coordsRD[i] })),
  });
  return { resultaat, beeld, bronBeeld: `PDOK ${PDOK_LAGEN.orthoHR}`, ophaalMs: Math.round(ophaalMs) };
}
