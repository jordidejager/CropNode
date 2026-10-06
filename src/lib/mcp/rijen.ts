/**
 * Rijenkaart (beta) in de CropNode MCP.
 *
 * - Rijen en blokken van de gebruiker lezen zonder geometrie (v_rijen / v_blokken, admin-client + user_id).
 * - Samenvatting per hoofdperceel voor de tool percelen ("rijen 1–84 (84) · blokken: … · rij-opp 6,21 ha").
 * - resolveRijen: rijselectie uit tekst ("1-20, 24", "blok Conference 2018", "bestuivers") → rij-id's.
 * - Tool 'rijen': blokken, bereiken, bestuivers, rijen om te controleren, gerooide rijen en totalen.
 *
 * Alles is additief: zonder rijen geven deze helpers niets terug en verandert de uitvoer van
 * de bestaande tools niet.
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { allePaginas, getal, getalOf, inStukken, uniek } from '@/lib/rijen/store';
import { formatteerBereiken, parseRijSelectie } from '@/lib/rijen/selectie';
import { boomnummer } from '@/lib/rijen/generatie';
import {
  rijenVoorBespuitingen,
  rijenVoorNotities,
  rijSelectieNaarPlots,
  type BespuitingRijenInfo,
  type NotitieRijInfo,
} from '@/lib/rijen/koppelingen';
import type { RijRol, RijStatus } from '@/lib/rijen/types';
import type { SprayableParcel } from '@/lib/supabase-store';
import type { McpContext } from './context';
import { f, percelenVanNaam, str, type Args, type ToolDefinitie, type ToolResultaat } from './util';

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbRij = Record<string, any>;

// ── Types ───────────────────────────────────────────────────────────────

/** Rij uit v_rijen zonder geometrie (effectieve waarden). */
export interface McpRij {
  id: string;
  perceelId: string;
  blokId: string | null;
  nummer: number;
  label: string | null;
  rol: RijRol;
  status: RijStatus;
  rasEffectief: string | null;
  plantjaarEffectief: number | null;
  rijafstandM: number | null;
  boomafstandM: number | null;
  lengteM: number;
  aantalBomen: number | null;
  controleren: boolean;
  gerooidOp: string | null;
  subParcelId: string | null;
}

/** Blok uit v_blokken zonder geometrie. */
export interface McpBlok {
  id: string;
  perceelId: string;
  subParcelId: string | null;
  naam: string | null;
  ras: string | null;
  plantjaar: number | null;
  onderstam: string | null;
  rijafstandM: number | null;
  boomafstandM: number | null;
  teeltsysteem: string | null;
  /** Weergavenaam: naam, anders "ras plantjaar", anders null */
  label: string | null;
}

export interface RijenResolutie {
  perceelId: string;
  perceelNaam: string;
  /** Geselecteerde actieve rijen, oplopend op nummer */
  rijIds: string[];
  nummers: number[];
  /** "rijen 1–20, 24" of "rij 3" */
  omschrijving: string;
  fouten: string[];
  /** De geselecteerde rijen zelf */
  rijen: McpRij[];
}

/** Rijselectie omgerekend naar spuitschrift-plots (voor registreer_bespuiting). */
export interface RijenKeuze {
  perceelId: string;
  perceelNaam: string;
  /** Actieve rijen die in bespuiting_rijen komen */
  rijIds: string[];
  nummers: number[];
  plots: string[];
  plotAreas: Record<string, number>;
  oppervlakHa: number;
}

// ── Lezen ───────────────────────────────────────────────────────────────

const RIJ_KOLOMMEN =
  'id, perceel_id, blok_id, nummer, label, rol, status, ras_effectief, plantjaar_effectief, rijafstand_m, boomafstand_m, lengte_m, aantal_bomen_effectief, controleren, gerooid_op, sub_parcel_id';
const BLOK_KOLOMMEN = 'id, perceel_id, sub_parcel_id, naam, ras, plantjaar, onderstam, rijafstand_m, boomafstand_m, teeltsysteem, created_at';

function db() {
  return getSupabaseAdmin();
}

function mapRij(r: DbRij): McpRij {
  return {
    id: String(r.id),
    perceelId: String(r.perceel_id),
    blokId: r.blok_id ?? null,
    nummer: getalOf(r.nummer, 0),
    label: r.label ?? null,
    rol: r.rol === 'bestuiver' ? 'bestuiver' : 'hoofd',
    status: r.status === 'gerooid' ? 'gerooid' : 'actief',
    rasEffectief: r.ras_effectief ?? null,
    plantjaarEffectief: getal(r.plantjaar_effectief),
    rijafstandM: getal(r.rijafstand_m),
    boomafstandM: getal(r.boomafstand_m),
    lengteM: getalOf(r.lengte_m, 0),
    aantalBomen: getal(r.aantal_bomen_effectief),
    controleren: !!r.controleren,
    gerooidOp: r.gerooid_op ?? null,
    subParcelId: r.sub_parcel_id ?? null,
  };
}

export function blokLabel(b: { naam: string | null; ras: string | null; plantjaar: number | null }): string | null {
  const naam = b.naam?.trim();
  if (naam) return naam;
  const samengesteld = [b.ras?.trim(), b.plantjaar != null ? String(b.plantjaar) : ''].filter(Boolean).join(' ');
  return samengesteld || null;
}

function mapBlok(b: DbRij): McpBlok {
  const blok = {
    id: String(b.id),
    perceelId: String(b.perceel_id),
    subParcelId: b.sub_parcel_id ?? null,
    naam: b.naam ?? null,
    ras: b.ras ?? null,
    plantjaar: getal(b.plantjaar),
    onderstam: b.onderstam ?? null,
    rijafstandM: getal(b.rijafstand_m),
    boomafstandM: getal(b.boomafstand_m),
    teeltsysteem: b.teeltsysteem ?? null,
  };
  return { ...blok, label: blokLabel(blok) };
}

/** Rijen (incl. gerooide) van de gebruiker, optioneel alleen voor deze hoofdpercelen. */
export async function laadMcpRijen(userId: string, perceelIds?: string[]): Promise<McpRij[]> {
  const bouw = (ids: string[] | null) => (van: number, tot: number) => {
    let q = db().from('v_rijen').select(RIJ_KOLOMMEN).eq('user_id', userId);
    if (ids) q = q.in('perceel_id', ids);
    return q
      .order('perceel_id', { ascending: true })
      .order('nummer', { ascending: true })
      .order('id', { ascending: true })
      .range(van, tot);
  };
  if (!perceelIds) return (await allePaginas(bouw(null), 'Rijen ophalen')).map(mapRij);
  const uit: McpRij[] = [];
  for (const stuk of inStukken(uniek(perceelIds))) uit.push(...(await allePaginas(bouw(stuk), 'Rijen ophalen')).map(mapRij));
  return uit;
}

/** Blokken van de gebruiker, optioneel alleen voor deze hoofdpercelen. */
export async function laadMcpBlokken(userId: string, perceelIds?: string[]): Promise<McpBlok[]> {
  const haal = async (ids: string[] | null) => {
    let q = db().from('v_blokken').select(BLOK_KOLOMMEN).eq('user_id', userId);
    if (ids) q = q.in('perceel_id', ids);
    const { data, error } = await q.order('created_at', { ascending: true }).order('id', { ascending: true });
    if (error) throw new Error(`Blokken ophalen mislukt: ${error.message}`);
    return ((data ?? []) as DbRij[]).map(mapBlok);
  };
  if (!perceelIds) return haal(null);
  const uit: McpBlok[] = [];
  for (const stuk of inStukken(uniek(perceelIds))) uit.push(...(await haal(stuk)));
  return uit;
}

async function laadInstellingen(userId: string, perceelId: string): Promise<{ rijafstandM: number | null; boomafstandM: number | null; richtingGraden: number | null } | null> {
  const { data, error } = await db()
    .from('perceel_rijinstellingen')
    .select('rijafstand_m, boomafstand_m, rijrichting_graden')
    .eq('user_id', userId)
    .eq('perceel_id', perceelId)
    .maybeSingle();
  if (error) throw new Error(`Rij-instellingen ophalen mislukt: ${error.message}`);
  if (!data) return null;
  const i = data as DbRij;
  return { rijafstandM: getal(i.rijafstand_m), boomafstandM: getal(i.boomafstand_m), richtingGraden: getal(i.rijrichting_graden) };
}

// ── Opmaak ──────────────────────────────────────────────────────────────

/** [1..20, 24] → "rijen 1–20, 24"; [3] → "rij 3" */
export function rijenBereik(nummers: number[]): string {
  const uniekeNummers = uniek(nummers);
  return `${uniekeNummers.length === 1 ? 'rij' : 'rijen'} ${formatteerBereiken(uniekeNummers)}`;
}

/** Compacte nummerlijst met "r": [1..20, 25] → "r1–20,25" */
function rBereik(nummers: number[]): string {
  return `r${formatteerBereiken(nummers).replace(/, /g, ',')}`;
}

function rLijst(nummers: number[]): string {
  const n = uniek(nummers).sort((a, b) => a - b);
  return n.length <= 10 ? n.map(x => `r${x}`).join(', ') : `${n.length} rijen (${rBereik(n)})`;
}

function rijOppervlakHa(rijen: McpRij[]): number | null {
  if (rijen.length === 0 || rijen.some(r => !(r.rijafstandM != null && r.rijafstandM > 0))) return null;
  return rijen.reduce((s, r) => s + r.lengteM * (r.rijafstandM as number), 0) / 10000;
}

const meters = (m: number) => `${Math.round(m).toLocaleString('nl-NL')} m`;

/** Eén regel per hoofdperceel: "rijen 1–84 (84) · blokken: Conference 2018 r1–20, … · bestuivers: r7, r15 · rij-opp 6,21 ha". */
export function rijenSamenvatting(rijen: McpRij[], blokken: McpBlok[]): string | null {
  if (rijen.length === 0) return null;
  const actief = rijen.filter(r => r.status === 'actief');
  const gerooid = rijen.length - actief.length;
  if (actief.length === 0) return `geen actieve rijen (${gerooid} gerooid)`;
  const delen = [`rijen ${formatteerBereiken(actief.map(r => r.nummer))} (${actief.length})`];

  if (blokken.length > 0) {
    const perBlok = blokken
      .map(b => ({ b, nummers: actief.filter(r => r.blokId === b.id).map(r => r.nummer) }))
      .filter(x => x.nummers.length > 0)
      .sort((a, b) => Math.min(...a.nummers) - Math.min(...b.nummers));
    const blokDelen = perBlok.map(x => `${x.b.label ?? 'zonder naam'} ${rBereik(x.nummers)}`);
    const losse = actief.filter(r => !r.blokId || !blokken.some(b => b.id === r.blokId)).map(r => r.nummer);
    if (losse.length && blokDelen.length) blokDelen.push(`zonder blok ${rBereik(losse)}`);
    if (blokDelen.length) delen.push(`blokken: ${blokDelen.join(', ')}`);
  }
  const bestuivers = actief.filter(r => r.rol === 'bestuiver').map(r => r.nummer);
  if (bestuivers.length) delen.push(`bestuivers: ${rLijst(bestuivers)}`);
  const opp = rijOppervlakHa(actief);
  if (opp != null) delen.push(`rij-opp ${f(opp, 2)} ha`);
  if (gerooid > 0) delen.push(`${gerooid} gerooid`);
  return delen.join(' · ');
}

/**
 * Samenvatting per hoofdperceel (parcels.id) voor de opgegeven percelen; percelen zonder rijen
 * ontbreken. Gooit niet: bij een fout komt er een lege map terug (percelen blijft dan exact als
 * zonder rijen).
 */
export async function rijenSamenvattingPerPerceel(userId: string, perceelIds: string[]): Promise<Map<string, string>> {
  const uit = new Map<string, string>();
  if (perceelIds.length === 0) return uit;
  try {
    const rijen = await laadMcpRijen(userId, perceelIds);
    if (rijen.length === 0) return uit;
    const metRijen = uniek(rijen.map(r => r.perceelId));
    const blokken = await laadMcpBlokken(userId, metRijen);
    for (const pid of metRijen) {
      const s = rijenSamenvatting(rijen.filter(r => r.perceelId === pid), blokken.filter(b => b.perceelId === pid));
      if (s) uit.set(pid, s);
    }
  } catch (e) {
    console.warn('[mcp] rijen-samenvatting mislukt:', e instanceof Error ? e.message : e);
    uit.clear();
  }
  return uit;
}

/** Rijen per bespuiting ("rijen 1–20 (Steketee)"); bespuitingen zonder rijen ontbreken. Gooit niet. */
export async function rijenTekstVoorBespuitingen(userId: string, spuitschriftIds: string[]): Promise<Record<string, string>> {
  const uit: Record<string, string> = {};
  if (spuitschriftIds.length === 0) return uit;
  try {
    const info: Record<string, BespuitingRijenInfo[]> = await rijenVoorBespuitingen(userId, spuitschriftIds);
    for (const [id, lijst] of Object.entries(info)) {
      if (lijst.length) uit[id] = lijst.map(i => `${rijenBereik(i.nummers)} (${i.perceelNaam || 'perceel'})`).join(', ');
    }
  } catch (e) {
    console.warn('[mcp] rijen bij bespuitingen ophalen mislukt:', e instanceof Error ? e.message : e);
  }
  return uit;
}

/** Rijen per veldnotitie ("rij 12 (34 m, boom 52)"); notities zonder rijen ontbreken. Gooit niet. */
export async function rijenTekstVoorNotities(userId: string, veldnotitieIds: string[]): Promise<Record<string, string>> {
  const uit: Record<string, string> = {};
  if (veldnotitieIds.length === 0) return uit;
  try {
    const info: Record<string, NotitieRijInfo[]> = await rijenVoorNotities(userId, veldnotitieIds);
    for (const [id, lijst] of Object.entries(info)) {
      if (!lijst.length) continue;
      uit[id] = lijst
        .map(i => {
          const r = i.rijen.length === 1 ? i.rijen[0] : null;
          const tekst = r && r.positieM != null
            ? `rij ${r.nummer} (${f(r.positieM, 1)} m${r.boomnummer != null ? `, boom ${r.boomnummer}` : ''})`
            : rijenBereik(i.nummers);
          return lijst.length > 1 ? `${i.perceelNaam} ${tekst}` : tekst;
        })
        .join('; ');
    }
  } catch (e) {
    console.warn('[mcp] rijen bij veldnotities ophalen mislukt:', e instanceof Error ? e.message : e);
  }
  return uit;
}

// ── Hoofdperceel en rijselectie ─────────────────────────────────────────

export const geenRijenTekst = (perceelNaam: string) => `Nog geen rijen voor ${perceelNaam} — teken ze in CropNode › Percelen › Rijen (beta).`;

/** Hoofdpercelen (parcels.id → naam) van een lijst subpercelen, in volgorde van voorkomen. */
export function hoofdpercelenVan(ps: SprayableParcel[]): { id: string; naam: string }[] {
  const uit = new Map<string, string>();
  for (const p of ps) if (p.parcelId && !uit.has(p.parcelId)) uit.set(p.parcelId, p.parcelName || p.name);
  return [...uit.entries()].map(([id, naam]) => ({ id, naam }));
}

/** "Thuis (Thuis Appels, Thuis Coleswei)" — onderscheidt hoofdpercelen met dezelfde naam. */
function hoofdperceelOmschrijving(ctx: McpContext, perceelId: string, naam: string): string {
  const subs = ctx.parcels.filter(p => p.parcelId === perceelId).map(p => p.name);
  return subs.length ? `${naam} (${subs.join(', ')})` : naam;
}

/** Eén hoofdperceel bij een (slordige) naam, of een foutmelding. */
export function vindHoofdperceel(ctx: McpContext, naam: string): { id: string; naam: string } | { fout: string } {
  const ps = percelenVanNaam(ctx, naam);
  if (ps.length === 0) {
    const namen = uniek(ctx.parcels.map(p => p.parcelName || p.name)).sort((a, b) => a.localeCompare(b, 'nl'));
    return { fout: `Perceel "${naam}" niet gevonden. Bekende percelen: ${namen.join(', ')}.` };
  }
  const hoofd = hoofdpercelenVan(ps);
  if (hoofd.length > 1) {
    return { fout: `"${naam}" past op meerdere percelen: ${hoofd.map(h => hoofdperceelOmschrijving(ctx, h.id, h.naam)).join(' / ')}. Noem één perceel.` };
  }
  return hoofd[0];
}

/** Rijselectie als tekst (ook een getal of lijst van buitenaf). */
export function rijenArg(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) return v.map(x => (typeof x === 'number' || typeof x === 'string' ? String(x).trim() : '')).filter(Boolean).join(', ');
  return str(v);
}

/**
 * Rijselectie uit tekst voor één hoofdperceel: "1-20, 24", "1 t/m 20", "blok Conference 2018",
 * "bestuivers", "ras Tessa", "alle behalve 5". Bloknamen zonder naam heten "ras plantjaar".
 * Alleen actieve rijen; fouten (onbekende rij, blok …) komen in `fouten`.
 */
export async function resolveRijen(userId: string, perceelId: string, tekst: string, perceelNaam?: string): Promise<RijenResolutie> {
  let naam = perceelNaam ?? '';
  if (!naam) {
    const { data } = await db().from('parcels').select('name').eq('id', perceelId).eq('user_id', userId).maybeSingle();
    naam = ((data as DbRij | null)?.name as string | undefined) || 'dit perceel';
  }
  const leeg: RijenResolutie = { perceelId, perceelNaam: naam, rijIds: [], nummers: [], omschrijving: 'geen rijen', fouten: [], rijen: [] };
  const invoer = tekst.trim();
  if (!invoer) return { ...leeg, fouten: ['Geen rijen opgegeven.'] };

  const [rijen, blokken] = await Promise.all([laadMcpRijen(userId, [perceelId]), laadMcpBlokken(userId, [perceelId])]);
  if (rijen.length === 0) return { ...leeg, fouten: [geenRijenTekst(naam)] };

  const labelVan = new Map(blokken.map(b => [b.id, b.label]));
  const sel = parseRijSelectie(
    invoer,
    rijen.map(r => ({
      id: r.id,
      nummer: r.nummer,
      label: r.label,
      blokId: r.blokId,
      blokNaam: r.blokId ? labelVan.get(r.blokId) ?? null : null,
      rol: r.rol,
      status: r.status,
      rasEffectief: r.rasEffectief,
    })),
    blokken.map(b => ({ id: b.id, naam: b.label })),
  );
  if (sel.fouten.length) return { ...leeg, fouten: sel.fouten };
  if (sel.leeg) return { ...leeg, fouten: [`Met "${invoer}" is geen enkele actieve rij geselecteerd.`] };
  const gekozen = new Set(sel.rijIds);
  const geselecteerd = rijen.filter(r => gekozen.has(r.id)).sort((a, b) => a.nummer - b.nummer);
  return {
    perceelId,
    perceelNaam: naam,
    rijIds: geselecteerd.map(r => r.id),
    nummers: uniek(geselecteerd.map(r => r.nummer)),
    omschrijving: rijenBereik(geselecteerd.map(r => r.nummer)),
    fouten: [],
    rijen: geselecteerd,
  };
}

/** Rijselectie → spuitschrift-plots en gespoten oppervlak (rijSelectieNaarPlots), met nette fouten. */
export async function rijenNaarPlots(
  userId: string,
  perceel: { id: string; naam: string },
  tekst: string,
): Promise<{ keuze: RijenKeuze; fouten?: undefined } | { keuze?: undefined; fouten: string[] }> {
  const res = await resolveRijen(userId, perceel.id, tekst, perceel.naam);
  if (res.fouten.length) {
    const geenRijen = res.fouten.length === 1 && res.fouten[0] === geenRijenTekst(perceel.naam);
    return { fouten: geenRijen ? res.fouten : res.fouten.map(x => `Rijen "${tekst}" op ${perceel.naam}: ${x.replace(/\.?$/, '.')}`) };
  }
  try {
    const sel = await rijSelectieNaarPlots(userId, res.rijIds);
    const gekozen = new Set(sel.rijIds);
    return {
      keuze: {
        perceelId: perceel.id,
        perceelNaam: perceel.naam,
        rijIds: sel.rijIds,
        nummers: res.rijen.filter(r => gekozen.has(r.id)).map(r => r.nummer),
        plots: sel.plots,
        plotAreas: sel.plotAreas,
        oppervlakHa: sel.oppervlakHa,
      },
    };
  } catch (e) {
    return { fouten: [`Rijen op ${perceel.naam}: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** "Steketee rijen 1–20 (20 rijen · 0,61 ha)" */
export function rijenKeuzeTekst(k: RijenKeuze): string {
  const n = k.rijIds.length;
  return `${k.perceelNaam} ${rijenBereik(k.nummers)} (${n} ${n === 1 ? 'rij' : 'rijen'} · ${f(k.oppervlakHa, 2)} ha)`;
}

// ── Rijen in vrije tekst (registreer_bespuiting met alleen tekst) ───────

const MAANDEN = String.raw`(?:jan|feb|mrt|maa|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\b`;
/** Getal dat geen dosering, oppervlak, tijd ("20:00", "8.30") of datum ("2 september") is. */
const TEKST_GETAL = String.raw`\d+(?!\d)(?![.,:]\d)(?!\s*(?:kg|kilo|l\b|ltr|liter|g\b|gr\b|gram|ml|cc|%|ha\b|hectare|uur\b|u\b))(?!\s*${MAANDEN})`;
const TEKST_BEREIK = String.raw`${TEKST_GETAL}(?:\s*(?:-|–|—|t\s*\/\s*m|tm|tot\s+en\s+met|tot)\s*(?:rij\s+)?${TEKST_GETAL})?`;
/**
 * "rij 1 t/m 20", "rijen 3-7 en 12", "op rij 5" — niet "3Rijen" of "3 rijen" (subperceelnamen als
 * "Jachthoek 3Rijen" worden in spraak "jachthoek 3 rijen"): direct vóór rij/rijen mag geen getal staan.
 */
const TEKST_RIJEN = new RegExp(
  String.raw`(?:\b(?:alleen\s+)?(?:op|van|in)\s+(?:de\s+)?)?(?<!\d\s*)\b(?:rijen|rijnummers?|rij)\s+(?:nr\.?\s*)?(${TEKST_BEREIK}(?:\s*(?:,|\+|&|\ben\b)\s*(?:rij\s+)?${TEKST_BEREIK})*)`,
  'gi',
);

/**
 * Haalt rijnummers uit de vrije tekst ("rij 1 t/m 20", "rijen 3-7 en 12") zodat de pipeline ze niet
 * als dosering of datum leest. Alleen "rij(en) + nummer"; "blok …" nooit (de MCP noemt subpercelen ook
 * blokken). Alleen voor gebruikers met actieve rijen; of het genoemde perceel zelf rijen heeft, controleert
 * registreer_bespuiting na het parsen (perceelHeeftActieveRijen) — anders geldt de oorspronkelijke tekst.
 * null = niets gevonden (tekst blijft ongewijzigd).
 */
export async function rijenUitTekst(ctx: McpContext, tekst: string): Promise<{ rest: string; selectie: string; gevonden: string[] } | null> {
  if (!/\b(?:rij|rijen|rijnummers?)\b/i.test(tekst)) return null;
  const delen: string[] = [];
  const gevonden: string[] = [];
  const rest = tekst.replace(TEKST_RIJEN, (geheel: string, nummers: string) => {
    delen.push(nummers.trim());
    gevonden.push(geheel.trim());
    return ' ';
  });
  if (delen.length === 0) return null;
  const { count, error } = await db()
    .from('rijen')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .eq('status', 'actief');
  if (error || !count) return null;
  return { rest: rest.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim(), selectie: delen.join(', '), gevonden };
}

/** Heeft dit hoofdperceel actieve rijen? (fout → false: dan blijft alles zoals zonder rijen) */
export async function perceelHeeftActieveRijen(userId: string, perceelId: string): Promise<boolean> {
  const { count, error } = await db()
    .from('rijen')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('perceel_id', perceelId)
    .eq('status', 'actief');
  return !error && !!count;
}

// ── Rijkoppelingen van één bespuiting (bespuiting_aanpassen) ────────────

export interface BespuitingRijKoppeling {
  rijId: string;
  nummer: number;
  perceelId: string;
  subParcelId: string | null;
}

/** Rijen die aan deze bespuiting gekoppeld zijn (leeg als er geen zijn). */
export async function rijKoppelingenVanBespuiting(userId: string, spuitschriftId: string): Promise<BespuitingRijKoppeling[]> {
  const koppelingen = await allePaginas((van, tot) =>
    db()
      .from('bespuiting_rijen')
      .select('rij_id')
      .eq('user_id', userId)
      .eq('bespuiting_id', spuitschriftId)
      .order('rij_id', { ascending: true })
      .range(van, tot),
  'Rijkoppelingen ophalen');
  if (koppelingen.length === 0) return [];
  const uit: BespuitingRijKoppeling[] = [];
  for (const stuk of inStukken(uniek(koppelingen.map(k => String(k.rij_id))))) {
    const { data, error } = await db().from('v_rijen').select('id, perceel_id, nummer, sub_parcel_id').eq('user_id', userId).in('id', stuk);
    if (error) throw new Error(`Rijen ophalen mislukt: ${error.message}`);
    for (const r of (data ?? []) as DbRij[]) {
      uit.push({ rijId: String(r.id), nummer: getalOf(r.nummer, 0), perceelId: String(r.perceel_id), subParcelId: r.sub_parcel_id ?? null });
    }
  }
  return uit.sort((a, b) => a.perceelId.localeCompare(b.perceelId) || a.nummer - b.nummer);
}

/** "rijen 1–20 (Steketee)" voor een lijst koppelingen. */
export function koppelingenTekst(ctx: McpContext, koppelingen: BespuitingRijKoppeling[]): string {
  const perPerceel = new Map<string, number[]>();
  for (const k of koppelingen) perPerceel.set(k.perceelId, [...(perPerceel.get(k.perceelId) ?? []), k.nummer]);
  return [...perPerceel.entries()]
    .map(([pid, nummers]) => {
      const naam = ctx.parcels.find(p => p.parcelId === pid)?.parcelName || 'perceel';
      return `${rijenBereik(nummers)} (${naam})`;
    })
    .join(', ');
}

/** Koppelingen tussen een bespuiting en deze rijen verwijderen. */
export async function ontkoppelRijenVanBespuiting(userId: string, spuitschriftId: string, rijIds: string[]): Promise<void> {
  for (const stuk of inStukken(uniek(rijIds))) {
    const { error } = await db()
      .from('bespuiting_rijen')
      .delete()
      .eq('user_id', userId)
      .eq('bespuiting_id', spuitschriftId)
      .in('rij_id', stuk);
    if (error) throw new Error(`Rijkoppeling verwijderen mislukt: ${error.message}`);
  }
}

// ── Tool 'rijen' ────────────────────────────────────────────────────────

export const RIJEN_TOOLS: ToolDefinitie[] = [
  {
    name: 'rijen',
    description:
      'Rijen (beta) van één perceel: blokken met rijbereik, ras, plantjaar en rij-/boomafstand, bestuiverrijen, rijen om te controleren, gerooide rijen en totalen (rij-oppervlak, lengte, bomen). details=true geeft ook per rij nummer, ras, lengte en geschat aantal bomen. Gebruik de rijnummers en bloknamen hieruit bij registreer_bespuiting (rijen) en veldnotitie (rijen, positie_m).',
    inputSchema: {
      type: 'object',
      properties: {
        perceel: { type: 'string', description: 'Naam van het perceel (slordig mag), bijv. "steketee".' },
        details: { type: 'boolean', description: 'true = ook een regel per rij.' },
      },
      required: ['perceel'],
      additionalProperties: false,
    },
  },
];

function afstandTekst(rij: number | null, boom: number | null): string | null {
  if (rij != null && boom != null) return `${f(rij, 2)} × ${f(boom, 2)} m`;
  if (rij != null) return `rijafstand ${f(rij, 2)} m`;
  if (boom != null) return `boomafstand ${f(boom, 2)} m`;
  return null;
}

export async function rijenTool(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const naam = str(args.perceel);
  if (!naam) return { tekst: 'Geef het perceel op (bijv. perceel "Steketee").', fout: true };
  const hoofd = vindHoofdperceel(ctx, naam);
  if ('fout' in hoofd) return { tekst: hoofd.fout, fout: true };

  const [rijen, blokken, inst] = await Promise.all([
    laadMcpRijen(ctx.userId, [hoofd.id]),
    laadMcpBlokken(ctx.userId, [hoofd.id]),
    laadInstellingen(ctx.userId, hoofd.id),
  ]);
  if (rijen.length === 0) return { tekst: geenRijenTekst(hoofd.naam) };

  const subs = ctx.parcels.filter(p => p.parcelId === hoofd.id);
  const subHa = subs.reduce((s, p) => s + (p.area || 0), 0);
  const actief = rijen.filter(r => r.status === 'actief');
  const gerooid = rijen.filter(r => r.status === 'gerooid');
  const regels: string[] = [`${hoofd.naam} — rijen (beta)`];

  if (actief.length === 0) {
    regels.push(`Geen actieve rijen (${gerooid.length} gerooid).`);
  } else {
    const opp = rijOppervlakHa(actief);
    const lengte = actief.reduce((s, r) => s + r.lengteM, 0);
    const metBomen = actief.filter(r => r.aantalBomen != null);
    const bomen = metBomen.reduce((s, r) => s + (r.aantalBomen as number), 0);
    regels.push(
      [
        `${actief.length} actieve ${actief.length === 1 ? 'rij' : 'rijen'}: ${rijenBereik(actief.map(r => r.nummer))}`,
        opp != null ? `rij-opp ${f(opp, 2)} ha${subHa > 0 ? ` (subpercelen ${f(subHa, 2)} ha)` : ''}` : 'rij-opp onbekend (rijafstand ontbreekt)',
        `totale lengte ${meters(lengte)}`,
        metBomen.length ? `~${bomen.toLocaleString('nl-NL')} bomen${metBomen.length < actief.length ? ` (van ${metBomen.length} rijen)` : ''}` : null,
      ].filter(Boolean).join(' · '),
    );
  }
  if (inst) {
    const delen = [
      inst.rijafstandM != null ? `rijafstand ${f(inst.rijafstandM, 2)} m` : null,
      inst.boomafstandM != null ? `boomafstand ${f(inst.boomafstandM, 2)} m` : null,
      inst.richtingGraden != null ? `rijrichting ${f(inst.richtingGraden, 0)}°` : null,
    ].filter(Boolean);
    if (delen.length) regels.push(`Standaard: ${delen.join(' · ')}`);
  }

  // Blokken
  if (blokken.length > 0) {
    regels.push('', 'Blokken:');
    const gesorteerd = blokken
      .map(b => ({ b, nummers: actief.filter(r => r.blokId === b.id).map(r => r.nummer) }))
      .sort((a, b) => (a.nummers.length ? Math.min(...a.nummers) : Infinity) - (b.nummers.length ? Math.min(...b.nummers) : Infinity));
    for (const { b, nummers } of gesorteerd) {
      const sub = b.subParcelId ? ctx.parcels.find(p => p.id === b.subParcelId)?.name : null;
      const delen = [
        nummers.length ? `${rijenBereik(nummers)} (${nummers.length})` : 'geen actieve rijen',
        // Zonder bloknaam staan ras en plantjaar al in de naam ("Conference 2018")
        b.naam?.trim() && b.ras ? `ras ${b.ras}` : null,
        b.naam?.trim() && b.plantjaar != null ? `plantjaar ${b.plantjaar}` : null,
        b.onderstam ? `onderstam ${b.onderstam}` : null,
        afstandTekst(b.rijafstandM ?? inst?.rijafstandM ?? null, b.boomafstandM ?? inst?.boomafstandM ?? null),
        b.teeltsysteem ? b.teeltsysteem : null,
        sub ? `subperceel ${sub}` : null,
      ].filter(Boolean);
      regels.push(`- ${b.label ?? 'Blok zonder naam'}: ${delen.join(' · ')}`);
    }
    const losse = actief.filter(r => !r.blokId || !blokken.some(b => b.id === r.blokId)).map(r => r.nummer);
    if (losse.length) regels.push(`- zonder blok: ${rijenBereik(losse)} (${losse.length})`);
  } else if (actief.length) {
    regels.push('', 'Blokken: nog geen (rijen zonder blok krijgen ras/plantjaar niet mee).');
  }

  const bestuivers = actief.filter(r => r.rol === 'bestuiver').map(r => r.nummer);
  regels.push('', `Bestuiverrijen: ${bestuivers.length ? rLijst(bestuivers) : 'geen'}`);
  const controleren = actief.filter(r => r.controleren).map(r => r.nummer);
  if (controleren.length) regels.push(`Controleren (rij door inham geknipt): ${rLijst(controleren)}`);
  if (gerooid.length) {
    regels.push(`Gerooid: ${gerooid.map(r => `r${r.nummer}${r.gerooidOp ? ` (${r.gerooidOp})` : ''}`).join(', ')}`);
  }

  if (args.details === true && actief.length) {
    regels.push('', 'Per rij:');
    for (const r of actief) {
      const delen = [
        `r${r.nummer}${r.label ? ` (${r.label})` : ''}`,
        r.rasEffectief || 'ras onbekend',
        meters(r.lengteM),
        r.aantalBomen != null ? `~${r.aantalBomen} bomen` : null,
        r.rol === 'bestuiver' ? 'bestuiver' : null,
        r.controleren ? 'controleren' : null,
      ].filter(Boolean);
      regels.push(`- ${delen.join(' · ')}`);
    }
  }
  regels.push('', 'Rijen kiezen kan met nummers ("1-20, 24"), bloknamen ("blok …"), "bestuivers" of "alle behalve 5".');
  return { tekst: regels.join('\n') };
}

/** Boomnummer bij een positie (zelfde regel als de database en generatie.ts). */
export function boomBijPositie(positieM: number | null, boomafstandM: number | null): number | null {
  return boomnummer(positieM, boomafstandM);
}
