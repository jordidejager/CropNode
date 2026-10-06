/**
 * Rijenkaart (beta) — server-side opslaglaag.
 *
 * Alle functies krijgen een expliciete userId en gebruiken de admin-client
 * (omzeilt RLS), dus er wordt ALTIJD expliciet op user_id gefilterd en het
 * eigendom van het perceel gecontroleerd. Gebruikt door de server actions
 * (src/app/rijen-actions.ts), de GeoJSON-route en de MCP-server.
 *
 * Mapping: database (snake_case, numerics soms als string) → types.ts (camelCase).
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { parseGeometrie } from './geo';
import type {
  Blok,
  BlokInvoer,
  DetectieMethode,
  GeomBron,
  LngLat,
  Rij,
  RijAttributen,
  RijenkaartBespuiting,
  RijenkaartSubperceel,
  RijenSamenvatting,
  RijenToepassenResultaat,
  Rijenkaart,
  RijInstellingen,
  RijInstellingenUpdate,
  RijNotitie,
  RijRol,
  RijStatus,
  RijStatusInfo,
  RijWijziging,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbRij = Record<string, any>;

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

export function db() {
  return getSupabaseAdmin();
}

/** numeric/int uit de database (kan als string binnenkomen) → number | null */
export function getal(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getalOf(v: unknown, standaard: number): number {
  return getal(v) ?? standaard;
}

function rondAf(n: number, decimalen: number): number {
  const f = 10 ** decimalen;
  return Math.round(n * f) / f;
}

/** Datum van vandaag in Nederland, 'YYYY-MM-DD' */
export function vandaag(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

/** Splits een lijst in stukken (houdt `in.(…)`-filters in de URL kort). */
export function inStukken<T>(lijst: T[], grootte = 100): T[][] {
  const uit: T[][] = [];
  for (let i = 0; i < lijst.length; i += grootte) uit.push(lijst.slice(i, i + grootte));
  return uit;
}

export function uniek<T>(lijst: T[]): T[] {
  return Array.from(new Set(lijst));
}

/** PostgREST levert maximaal zoveel rijen per verzoek (Supabase max_rows); meer wordt stil afgekapt. */
export const PAGINA_GROOTTE = 1000;

/**
 * Haalt alle pagina's van een query op. `bouw(van, tot)` moet de query met een
 * STABIELE volgorde (.order op unieke sleutel) en `.range(van, tot)` teruggeven.
 */
export async function allePaginas<T = DbRij>(
  bouw: (van: number, tot: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  wat: string,
  paginaGrootte = PAGINA_GROOTTE,
): Promise<T[]> {
  const uit: T[] = [];
  for (let van = 0; ; van += paginaGrootte) {
    const { data, error } = await bouw(van, van + paginaGrootte - 1);
    if (error) throw dbFout(error, wat);
    const rijen = (Array.isArray(data) ? data : []) as T[];
    uit.push(...rijen);
    if (rijen.length < paginaGrootte) break;
  }
  return uit;
}

/** Voert taken uit met beperkte gelijktijdigheid (volgorde van de uitkomst = volgorde van de taken). */
export async function beperktParallel<T>(taken: (() => Promise<T>)[], max = 6): Promise<T[]> {
  const uit: T[] = new Array(taken.length);
  let volgende = 0;
  async function werker() {
    while (volgende < taken.length) {
      const i = volgende++;
      uit[i] = await taken[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(max, taken.length) }, werker));
  return uit;
}

/** Database-fout → nette Nederlandse melding. */
export function dbFout(error: { message?: string } | null | undefined, wat: string): Error {
  const msg = error?.message ?? 'onbekende fout';
  if (msg.includes('rijen_nummer_uniek_actief')) {
    return new Error('Twee actieve rijen in dit perceel krijgen hetzelfde nummer. Controleer de nummering.');
  }
  const doorgeven = [
    'Perceel niet gevonden',
    'Geen toegang tot dit perceel',
    'Blok overlapt met een ander blok',
    'Nieuwe rij heeft nummer en coordinates nodig',
  ];
  if (doorgeven.some(d => msg.includes(d))) return new Error(msg);
  if (msg.includes('invalid input syntax for type uuid')) return new Error(`${wat} mislukt: ongeldige id.`);
  return new Error(`${wat} mislukt: ${msg}`);
}

function vereisId(id: unknown, wat: string): string {
  if (typeof id !== 'string' || id.trim() === '') throw new Error(`${wat} ontbreekt.`);
  return id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtert op geldige uuid's (rij-, blok- en veldnotitie-id's); gooit bij ongeldige invoer. */
export function vereisUuids(ids: unknown, wat = 'rij-id'): string[] {
  if (!Array.isArray(ids)) throw new Error(`Ongeldige lijst met ${wat}'s.`);
  const uit: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Error(`Ongeldige ${wat}: ${String(id)}`);
    uit.push(id);
  }
  return uniek(uit);
}

/** Controleert dat het (hoofd)perceel van deze gebruiker is. */
export async function vereisPerceel(userId: string, perceelId: string): Promise<{ id: string; naam: string; oppervlakHa: number }> {
  vereisId(userId, 'Gebruiker');
  vereisId(perceelId, 'Perceel');
  const { data, error } = await db()
    .from('parcels')
    .select('id, name, area')
    .eq('id', perceelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw dbFout(error, 'Perceel ophalen');
  if (!data) throw new Error('Perceel niet gevonden.');
  const p = data as DbRij;
  return { id: p.id, naam: p.name ?? '', oppervlakHa: getalOf(p.area, 0) };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function coordinatenUit(geometrie: unknown): LngLat[] {
  let g: any = geometrie;
  if (typeof g === 'string') {
    try {
      g = JSON.parse(g);
    } catch {
      return [];
    }
  }
  const coords = Array.isArray(g?.coordinates) ? g.coordinates : [];
  return coords
    .map((c: unknown) => (Array.isArray(c) ? ([Number(c[0]), Number(c[1])] as LngLat) : null))
    .filter((c: LngLat | null): c is LngLat => !!c && Number.isFinite(c[0]) && Number.isFinite(c[1]));
}

export function mapRij(r: DbRij): Rij {
  return {
    id: r.id,
    perceelId: r.perceel_id,
    blokId: r.blok_id ?? null,
    blokNaam: r.blok_naam ?? null,
    nummer: getalOf(r.nummer, 0),
    label: r.label ?? null,
    rol: (r.rol === 'bestuiver' ? 'bestuiver' : 'hoofd') as RijRol,
    ras: r.ras ?? null,
    rasEffectief: r.ras_effectief ?? null,
    plantjaar: getal(r.plantjaar),
    plantjaarEffectief: getal(r.plantjaar_effectief),
    onderstam: r.onderstam ?? null,
    rijafstandM: getal(r.rijafstand_m),
    boomafstandM: getal(r.boomafstand_m),
    lengteM: getalOf(r.lengte_m, 0),
    aantalBomen: getal(r.aantal_bomen),
    aantalBomenEffectief: getal(r.aantal_bomen_effectief),
    geomBron: (r.geom_bron ?? 'gegenereerd') as GeomBron,
    nauwkeurigheidM: getal(r.nauwkeurigheid_m),
    controleren: !!r.controleren,
    status: (r.status === 'gerooid' ? 'gerooid' : 'actief') as RijStatus,
    geplantOp: r.geplant_op ?? null,
    gerooidOp: r.gerooid_op ?? null,
    opmerking: r.opmerking ?? null,
    coordinates: coordinatenUit(r.geometrie),
    subParcelId: r.sub_parcel_id ?? null,
  };
}

export function mapBlok(b: DbRij): Blok {
  const geo = b.geometrie;
  let geometry: GeoJSON.Polygon | null = null;
  if (geo && typeof geo === 'object' && geo.type === 'Polygon') geometry = geo as GeoJSON.Polygon;
  else if (typeof geo === 'string') {
    try {
      const p = JSON.parse(geo);
      if (p?.type === 'Polygon') geometry = p;
    } catch {
      geometry = null;
    }
  }
  return {
    id: b.id,
    perceelId: b.perceel_id,
    subParcelId: b.sub_parcel_id ?? null,
    naam: b.naam ?? null,
    ras: b.ras ?? null,
    plantjaar: getal(b.plantjaar),
    onderstam: b.onderstam ?? null,
    rijafstandM: getal(b.rijafstand_m),
    boomafstandM: getal(b.boomafstand_m),
    teeltsysteem: b.teeltsysteem ?? null,
    opmerking: b.opmerking ?? null,
    geometry,
  };
}

export function mapInstellingen(i: DbRij): RijInstellingen {
  const methode = i.detectie_methode;
  return {
    perceelId: i.perceel_id,
    rijrichtingGraden: getal(i.rijrichting_graden),
    rijafstandM: getal(i.rijafstand_m),
    boomafstandM: getal(i.boomafstand_m),
    faseM: getal(i.fase_m),
    kopakkerBeginM: getalOf(i.kopakker_begin_m, 6),
    kopakkerEindM: getalOf(i.kopakker_eind_m, 6),
    beginkantGraden: getal(i.beginkant_graden),
    nummeringStartzijdeGraden: getal(i.nummering_startzijde_graden),
    nummeringStartRijId: i.nummering_start_rij_id ?? null,
    startnummer: getalOf(i.startnummer, 1),
    bronBeeld: i.bron_beeld ?? null,
    detectieMethode: methode === 'auto' || methode === 'handmatig' ? (methode as DetectieMethode) : null,
    detectieConfidence: getal(i.detectie_confidence),
    laatstGegenereerdOp: i.laatst_gegenereerd_op ?? null,
  };
}

/** Gewogen rij-/boomafstand uit sub_parcels.planting_distances [{value:{row,tree},percentage}]. */
export function gewogenPlantafstanden(s: DbRij): { rijafstandM: number | null; boomafstandM: number | null } {
  let lijst: any = s.planting_distances;
  if (typeof lijst === 'string') {
    try {
      lijst = JSON.parse(lijst);
    } catch {
      lijst = [];
    }
  }
  if (!Array.isArray(lijst)) lijst = [];
  let sr = 0, wr = 0, sb = 0, wb = 0;
  for (const e of lijst) {
    const pct = getal(e?.percentage);
    const w = pct !== null && pct > 0 ? pct : 1;
    const rij = getal(e?.value?.row);
    const boom = getal(e?.value?.tree);
    if (rij !== null && rij > 0) { sr += rij * w; wr += w; }
    if (boom !== null && boom > 0) { sb += boom * w; wb += w; }
  }
  const losRij = getal(s.planting_distance_row);
  const losBoom = getal(s.planting_distance_tree);
  return {
    rijafstandM: wr > 0 ? rondAf(sr / wr, 3) : losRij !== null && losRij > 0 ? losRij : null,
    boomafstandM: wb > 0 ? rondAf(sb / wb, 3) : losBoom !== null && losBoom > 0 ? losBoom : null,
  };
}

function mapSubperceel(s: DbRij): RijenkaartSubperceel {
  const { rijafstandM, boomafstandM } = gewogenPlantafstanden(s);
  return {
    id: s.id,
    naam: s.name ? String(s.name) : null,
    ras: s.variety ?? null,
    oppervlakHa: getalOf(s.area, 0),
    rijafstandM,
    boomafstandM,
  };
}

function middelenUit(products: unknown): string {
  const lijst = Array.isArray(products) ? products : [];
  return uniek(
    lijst
      .map((p: any) => (typeof p?.product === 'string' ? p.product.trim() : ''))
      .filter(Boolean),
  ).join(', ');
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/** Rijen van één perceel uit v_rijen, gesorteerd op nummer (standaard inclusief gerooide). */
export async function laadRijenVanPerceel(
  userId: string,
  perceelId: string,
  opties?: { inclGerooid?: boolean },
): Promise<Rij[]> {
  vereisId(userId, 'Gebruiker');
  vereisId(perceelId, 'Perceel');
  const inclGerooid = opties?.inclGerooid ?? true;
  const rijen = await allePaginas((van, tot) => {
    let q = db()
      .from('v_rijen')
      .select('*')
      .eq('user_id', userId)
      .eq('perceel_id', perceelId);
    if (!inclGerooid) q = q.eq('status', 'actief');
    return q
      .order('nummer', { ascending: true })
      .order('id', { ascending: true })
      .range(van, tot);
  }, 'Rijen ophalen');
  return rijen.map(mapRij);
}

export async function laadBlokken(userId: string, perceelId: string): Promise<Blok[]> {
  vereisId(userId, 'Gebruiker');
  vereisId(perceelId, 'Perceel');
  const { data, error } = await db()
    .from('v_blokken')
    .select('*')
    .eq('user_id', userId)
    .eq('perceel_id', perceelId)
    .order('created_at', { ascending: true });
  if (error) throw dbFout(error, 'Blokken ophalen');
  return ((data ?? []) as DbRij[]).map(mapBlok);
}

async function laadInstellingen(userId: string, perceelId: string): Promise<RijInstellingen | null> {
  const { data, error } = await db()
    .from('perceel_rijinstellingen')
    .select('*')
    .eq('user_id', userId)
    .eq('perceel_id', perceelId)
    .maybeSingle();
  if (error) throw dbFout(error, 'Rij-instellingen ophalen');
  return data ? mapInstellingen(data as DbRij) : null;
}

async function laadStatus(userId: string, perceelId: string): Promise<Record<string, RijStatusInfo>> {
  const { data, error } = await db().rpc('rijen_status', { p_user_id: userId, p_perceel_id: perceelId });
  if (error) throw dbFout(error, 'Rijstatus ophalen');
  const uit: Record<string, RijStatusInfo> = {};
  for (const r of ((data ?? []) as DbRij[])) {
    uit[r.rij_id] = {
      rijId: r.rij_id,
      laatsteBespuitingId: r.laatste_bespuiting_id ?? null,
      laatsteBespuitingDatum: r.laatste_bespuiting_datum ?? null,
      laatsteBespuitingMiddelen: r.laatste_bespuiting_middelen ?? null,
      laatsteBespuitingViaRijen: typeof r.laatste_bespuiting_via_rijen === 'boolean' ? r.laatste_bespuiting_via_rijen : null,
      aantalBespuitingen: getalOf(r.aantal_bespuitingen, 0),
      aantalNotities: getalOf(r.aantal_notities, 0),
    };
  }
  return uit;
}

async function laadNotities(userId: string, perceelId: string): Promise<RijNotitie[]> {
  const data = await allePaginas((van, tot) =>
    db()
      .from('veldnotitie_rijen')
      .select('veldnotitie_id, rij_id, positie_m, field_notes!inner(content, status, created_at, user_id), rijen!inner(perceel_id, user_id)')
      .eq('user_id', userId)
      .eq('rijen.perceel_id', perceelId)
      .eq('rijen.user_id', userId)
      .eq('field_notes.user_id', userId)
      .order('veldnotitie_id', { ascending: true })
      .order('rij_id', { ascending: true })
      .range(van, tot),
  'Notities ophalen');
  const uit: RijNotitie[] = [];
  for (const r of data) {
    const fn = Array.isArray(r.field_notes) ? r.field_notes[0] : r.field_notes;
    if (!fn) continue;
    uit.push({
      veldnotitieId: r.veldnotitie_id,
      rijId: r.rij_id,
      positieM: getal(r.positie_m),
      tekst: fn.content ?? '',
      status: fn.status ?? 'open',
      createdAt: fn.created_at ?? '',
    });
  }
  uit.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return uit;
}

const BESPUITING_KOLOMMEN = 'id, date, products, registration_type, plots';

async function laadBespuitingen(userId: string, perceelId: string, subIds: string[]): Promise<RijenkaartBespuiting[]> {
  const MAX = 25;
  // 1. Expliciete rijkoppelingen op rijen van dit perceel (kan > 1000 regels zijn → pagineren)
  const koppel = await allePaginas((van, tot) =>
    db()
      .from('bespuiting_rijen')
      .select('bespuiting_id, rij_id, rijen!inner(perceel_id, user_id)')
      .eq('user_id', userId)
      .eq('rijen.perceel_id', perceelId)
      .eq('rijen.user_id', userId)
      .order('bespuiting_id', { ascending: true })
      .order('rij_id', { ascending: true })
      .range(van, tot),
  'Bespuitingskoppelingen ophalen');
  const rijenPerBespuiting = new Map<string, string[]>();
  for (const k of koppel) {
    const lijst = rijenPerBespuiting.get(k.bespuiting_id) ?? [];
    lijst.push(k.rij_id);
    rijenPerBespuiting.set(k.bespuiting_id, lijst);
  }

  // 2. Bespuitingen waarvan plots overlapt met de subpercelen van dit perceel
  const rijen = new Map<string, DbRij>();
  if (subIds.length > 0) {
    const { data, error } = await db()
      .from('spuitschrift')
      .select(BESPUITING_KOLOMMEN)
      .eq('user_id', userId)
      .overlaps('plots', subIds)
      .order('date', { ascending: false })
      .limit(MAX);
    if (error) throw dbFout(error, 'Bespuitingen ophalen');
    for (const s of ((data ?? []) as DbRij[])) rijen.set(s.id, s);
  }

  // 3. Gekoppelde bespuitingen die (nog) niet in de lijst staan
  const ontbrekend = Array.from(rijenPerBespuiting.keys()).filter(id => !rijen.has(id));
  for (const stuk of inStukken(ontbrekend)) {
    const { data, error } = await db()
      .from('spuitschrift')
      .select(BESPUITING_KOLOMMEN)
      .eq('user_id', userId)
      .in('id', stuk)
      .order('date', { ascending: false })
      .limit(MAX);
    if (error) throw dbFout(error, 'Bespuitingen ophalen');
    for (const s of ((data ?? []) as DbRij[])) rijen.set(s.id, s);
  }

  const subSet = new Set(subIds);
  return Array.from(rijen.values())
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    .slice(0, MAX)
    .map(s => ({
      id: s.id,
      datum: s.date ?? '',
      middelen: middelenUit(s.products),
      registrationType: s.registration_type ?? null,
      rijIds: rijenPerBespuiting.get(s.id) ?? null,
      subParcelIds: (Array.isArray(s.plots) ? (s.plots as string[]) : []).filter(p => subSet.has(p)),
    }));
}

/** Alles voor de perceelpagina "Rijen" in één keer. null = perceel niet gevonden (of niet van deze gebruiker). */
export async function laadRijenkaart(userId: string, perceelId: string): Promise<Rijenkaart | null> {
  vereisId(userId, 'Gebruiker');
  vereisId(perceelId, 'Perceel');
  const { data: perceel, error: perceelFout } = await db()
    .from('parcels')
    .select('id, name, area, geometry')
    .eq('id', perceelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (perceelFout) throw dbFout(perceelFout, 'Perceel ophalen');
  if (!perceel) return null;
  const p = perceel as DbRij;

  const { data: subs, error: subFout } = await db()
    .from('sub_parcels')
    .select('id, name, variety, area, planting_distances, planting_distance_row, planting_distance_tree')
    .eq('parcel_id', perceelId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (subFout) throw dbFout(subFout, 'Subpercelen ophalen');
  const subpercelen = ((subs ?? []) as DbRij[]).map(mapSubperceel);

  const [instellingen, blokken, rijen, status, notities, bespuitingen] = await Promise.all([
    laadInstellingen(userId, perceelId),
    laadBlokken(userId, perceelId),
    laadRijenVanPerceel(userId, perceelId, { inclGerooid: true }),
    laadStatus(userId, perceelId),
    laadNotities(userId, perceelId),
    laadBespuitingen(userId, perceelId, subpercelen.map(s => s.id)),
  ]);

  return {
    perceel: {
      id: p.id,
      naam: p.name ?? '',
      oppervlakHa: getalOf(p.area, 0),
      geometry: parseGeometrie(p.geometry),
      subpercelen,
    },
    instellingen,
    blokken,
    rijen,
    status,
    notities,
    bespuitingen,
  };
}

/** Overzicht van alle hoofdpercelen van de gebruiker, met rijtellingen (nullen als er geen rijen zijn). */
export async function laadRijenOverzicht(userId: string): Promise<RijenSamenvatting[]> {
  vereisId(userId, 'Gebruiker');
  const [percelen, perPerceel, instellingen] = await Promise.all([
    // geometry meelezen: alleen een echt (Multi)Polygon telt (jsonb kan ook 'null' of rommel bevatten)
    db().from('parcels').select('id, name, area, geometry').eq('user_id', userId),
    db().from('v_rijen_per_perceel').select('*').eq('user_id', userId),
    db()
      .from('perceel_rijinstellingen')
      .select('perceel_id, detectie_confidence, detectie_methode, laatst_gegenereerd_op')
      .eq('user_id', userId),
  ]);
  if (percelen.error) throw dbFout(percelen.error, 'Percelen ophalen');
  if (perPerceel.error) throw dbFout(perPerceel.error, 'Rijenoverzicht ophalen');
  if (instellingen.error) throw dbFout(instellingen.error, 'Rij-instellingen ophalen');

  const geoSet = new Set(
    ((percelen.data ?? []) as DbRij[]).filter(r => parseGeometrie(r.geometry) !== null).map(r => r.id as string),
  );
  const tellingen = new Map(((perPerceel.data ?? []) as DbRij[]).map(r => [r.perceel_id as string, r]));
  const inst = new Map(((instellingen.data ?? []) as DbRij[]).map(r => [r.perceel_id as string, r]));

  return ((percelen.data ?? []) as DbRij[])
    .map((p): RijenSamenvatting => {
      const t = tellingen.get(p.id);
      const i = inst.get(p.id);
      const methode = i?.detectie_methode;
      return {
        perceelId: p.id,
        perceelNaam: p.name ?? '',
        oppervlakHa: getalOf(p.area, 0),
        heeftGeometrie: geoSet.has(p.id),
        aantalActief: getalOf(t?.aantal_actief, 0),
        aantalGerooid: getalOf(t?.aantal_gerooid, 0),
        aantalBestuivers: getalOf(t?.aantal_bestuivers, 0),
        aantalControleren: getalOf(t?.aantal_controleren, 0),
        minNummer: getal(t?.min_nummer),
        maxNummer: getal(t?.max_nummer),
        totaleLengteM: getalOf(t?.totale_lengte_m, 0),
        rijOppervlakHa: getalOf(t?.rij_oppervlak_ha, 0),
        aantalBlokken: getalOf(t?.aantal_blokken, 0),
        detectieConfidence: getal(i?.detectie_confidence),
        detectieMethode: methode === 'auto' || methode === 'handmatig' ? (methode as DetectieMethode) : null,
        laatstGegenereerdOp: i?.laatst_gegenereerd_op ?? null,
      };
    })
    .sort((a, b) => a.perceelNaam.localeCompare(b.perceelNaam, 'nl', { sensitivity: 'base', numeric: true }));
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------

function geldigeCoordinaten(coords: unknown): LngLat[] {
  if (!Array.isArray(coords) || coords.length < 2) throw new Error('Een rij heeft minstens twee punten nodig.');
  return coords.map(c => {
    const lng = Number(Array.isArray(c) ? c[0] : NaN);
    const lat = Number(Array.isArray(c) ? c[1] : NaN);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      throw new Error('Ongeldige coördinaten in een rij.');
    }
    return [lng, lat] as LngLat;
  });
}

const GEOM_BRONNEN: readonly GeomBron[] = ['gegenereerd', 'getekend', 'gemeten'];
const INT_MAX = 2147483647;

function rijWijzigingNaarDb(w: RijWijziging): Record<string, unknown> {
  if (!w || typeof w !== 'object') throw new Error('Ongeldige rijwijziging.');
  const uit: Record<string, unknown> = {};
  if (w.id !== undefined && w.id !== null && w.id !== '') uit.id = vereisUuids([w.id])[0];
  if (w.sleutel !== undefined) uit.sleutel = w.sleutel;
  if (w.nummer !== undefined) {
    if (!Number.isInteger(w.nummer) || Math.abs(w.nummer) > INT_MAX) throw new Error('Rijnummer moet een geheel getal zijn.');
    uit.nummer = w.nummer;
  }
  if (w.coordinates !== undefined) uit.coordinates = geldigeCoordinaten(w.coordinates);
  if (w.geomBron !== undefined) {
    if (!GEOM_BRONNEN.includes(w.geomBron)) throw new Error(`Ongeldige geometriebron: ${String(w.geomBron)}.`);
    uit.geom_bron = w.geomBron;
  }
  if (w.nauwkeurigheidM !== undefined) {
    const n = w.nauwkeurigheidM;
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0)) throw new Error('Ongeldige nauwkeurigheid.');
    uit.nauwkeurigheid_m = n;
  }
  if (w.controleren !== undefined) uit.controleren = !!w.controleren;
  if (w.blokId !== undefined) uit.blok_id = w.blokId;
  if (w.rol !== undefined) {
    if (w.rol !== 'hoofd' && w.rol !== 'bestuiver') throw new Error('Ongeldige rol.');
    uit.rol = w.rol;
  }
  if (w.ras !== undefined) uit.ras = w.ras;
  if (!uit.id && (uit.nummer === undefined || uit.coordinates === undefined)) {
    throw new Error('Een nieuwe rij heeft een nummer en coördinaten nodig.');
  }
  return uit;
}

const INSTELLING_KOLOMMEN: Record<keyof RijInstellingenUpdate, string> = {
  rijrichtingGraden: 'rijrichting_graden',
  rijafstandM: 'rijafstand_m',
  boomafstandM: 'boomafstand_m',
  faseM: 'fase_m',
  kopakkerBeginM: 'kopakker_begin_m',
  kopakkerEindM: 'kopakker_eind_m',
  beginkantGraden: 'beginkant_graden',
  nummeringStartzijdeGraden: 'nummering_startzijde_graden',
  startnummer: 'startnummer',
  bronBeeld: 'bron_beeld',
  detectieMethode: 'detectie_methode',
  detectieConfidence: 'detectie_confidence',
  laatstGegenereerdOp: 'laatst_gegenereerd_op',
};

function instellingenNaarDb(u: RijInstellingenUpdate | undefined): Record<string, unknown> | null {
  if (!u) return null;
  if (typeof u !== 'object') throw new Error('Ongeldige rij-instellingen.');
  const uit: Record<string, unknown> = {};
  for (const [sleutel, kolom] of Object.entries(INSTELLING_KOLOMMEN) as [keyof RijInstellingenUpdate, string][]) {
    const v = u[sleutel];
    if (v === undefined) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`Ongeldige waarde voor ${sleutel}.`);
    uit[kolom] = v;
  }
  // Afstanden moeten positief zijn (0 m rijafstand geeft 0 ha en deling door nul bij bomen)
  for (const [sleutel, naam] of [['rijafstandM', 'rijafstand'], ['boomafstandM', 'boomafstand']] as const) {
    const v = u[sleutel];
    if (v !== undefined && v !== null && (typeof v !== 'number' || v <= 0)) throw new Error(`De ${naam} moet groter dan 0 zijn.`);
  }
  if (u.startnummer !== undefined && u.startnummer !== null && (!Number.isInteger(u.startnummer) || Math.abs(u.startnummer) > INT_MAX)) {
    throw new Error('Startnummer moet een geheel getal zijn.');
  }
  for (const sleutel of ['kopakkerBeginM', 'kopakkerEindM'] as const) {
    const v = u[sleutel];
    if (v !== undefined && v !== null && (typeof v !== 'number' || v < 0)) throw new Error('Kopakker kan niet negatief zijn.');
  }
  return Object.keys(uit).length > 0 ? uit : null;
}

/**
 * Wijzigingen aan de rijen van één perceel in één transactie (rpc rijen_toepassen):
 * nieuwe rijen invoegen, bestaande bijwerken/hernummeren, verwijderen (of rooien als
 * er koppelingen aan hangen) en instellingen bijwerken.
 */
export async function rijenToepassen(
  userId: string,
  perceelId: string,
  w: { rijen?: RijWijziging[]; verwijderen?: string[]; instellingen?: RijInstellingenUpdate },
): Promise<RijenToepassenResultaat> {
  vereisId(userId, 'Gebruiker');
  vereisId(perceelId, 'Perceel');
  if (w.rijen !== undefined && !Array.isArray(w.rijen)) throw new Error('Ongeldige lijst met rijen.');
  const pRijen = (w.rijen ?? []).map(rijWijzigingNaarDb);
  const pVerwijderen = vereisUuids(w.verwijderen ?? []);
  const pInstellingen = instellingenNaarDb(w.instellingen);

  // Blokken moeten bij dit perceel (en deze gebruiker) horen; de rpc controleert alleen of ze bestaan
  const blokIds = vereisUuids(uniek(pRijen.map(r => r.blok_id).filter((b): b is string => typeof b === 'string' && b !== '')), 'blok-id');
  for (const blokId of blokIds) await vereisBlok(userId, perceelId, blokId);

  const { data, error } = await db().rpc('rijen_toepassen', {
    p_user_id: userId,
    p_perceel_id: perceelId,
    p_rijen: pRijen,
    p_verwijderen: pVerwijderen,
    p_instellingen: pInstellingen,
  });
  if (error) throw dbFout(error, 'Rijen opslaan');
  const r = (data ?? {}) as DbRij;
  return {
    ingevoegd: (Array.isArray(r.ingevoegd) ? r.ingevoegd : []).map((x: DbRij) => ({
      id: String(x.id),
      nummer: getalOf(x.nummer, 0),
      sleutel: x.sleutel == null ? null : String(x.sleutel),
    })),
    bijgewerkt: getalOf(r.bijgewerkt, 0),
    verwijderd: getalOf(r.verwijderd, 0),
    gerooid: getalOf(r.gerooid, 0),
  };
}

/** Beginkant (kompasgraden) zetten; draait rijen om en spiegelt notitieposities. Geeft het aantal omgedraaide rijen. */
export async function zetBeginkant(userId: string, perceelId: string, graden: number): Promise<number> {
  vereisId(userId, 'Gebruiker');
  vereisId(perceelId, 'Perceel');
  if (typeof graden !== 'number' || !Number.isFinite(graden)) throw new Error('Ongeldige beginkant.');
  const genormaliseerd = ((graden % 360) + 360) % 360;
  const { data, error } = await db().rpc('rijen_zet_beginkant', {
    p_user_id: userId,
    p_perceel_id: perceelId,
    p_beginkant_graden: genormaliseerd,
  });
  if (error) throw dbFout(error, 'Beginkant opslaan');
  return getalOf(data, 0);
}

/** Rij waar de nummering begint (null = standaard). */
export async function zetNummeringStart(userId: string, perceelId: string, startRijId: string | null): Promise<void> {
  await vereisPerceel(userId, perceelId);
  if (startRijId !== null) {
    vereisUuids([startRijId]);
    const { data, error } = await db()
      .from('rijen')
      .select('id')
      .eq('id', startRijId)
      .eq('user_id', userId)
      .eq('perceel_id', perceelId)
      .maybeSingle();
    if (error) throw dbFout(error, 'Rij ophalen');
    if (!data) throw new Error('Rij niet gevonden in dit perceel.');
  }
  const { error } = await db()
    .from('perceel_rijinstellingen')
    .upsert(
      { perceel_id: perceelId, user_id: userId, nummering_start_rij_id: startRijId },
      { onConflict: 'perceel_id' },
    );
  if (error) throw dbFout(error, 'Nummering opslaan');
}

/** 'YYYY-MM-DD' (of leeg → null); ISO-tijdstempels worden ingekort tot de datum. */
function geldigeDatum(v: unknown, wat: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'string' ? v.trim().slice(0, 10) : '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  // Rondreis-check: '2026-02-31' wordt door JS stil 3 maart, Postgres weigert hem
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new Error(`Ongeldige ${wat}: gebruik JJJJ-MM-DD.`);
  }
  return s;
}

function geldigPlantjaar(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1900 || v > 2100) {
    throw new Error('Plantjaar moet een jaartal zijn (bv. 2015).');
  }
  return v;
}

async function vereisBlok(userId: string, perceelId: string, blokId: string): Promise<void> {
  vereisUuids([blokId], 'blok-id');
  const { data, error } = await db()
    .from('blokken')
    .select('id')
    .eq('id', blokId)
    .eq('user_id', userId)
    .eq('perceel_id', perceelId)
    .maybeSingle();
  if (error) throw dbFout(error, 'Blok ophalen');
  if (!data) throw new Error('Blok niet gevonden in dit perceel.');
}

/**
 * Attributen zetten op een selectie rijen (alleen meegegeven velden).
 * status 'gerooid' zonder gerooidOp → vandaag; status 'actief' zonder gerooidOp → gerooid_op leeg.
 * Geeft het aantal bijgewerkte rijen.
 */
export async function zetRijAttributen(
  userId: string,
  perceelId: string,
  rijIds: string[],
  attrs: RijAttributen,
): Promise<number> {
  await vereisPerceel(userId, perceelId);
  const ids = vereisUuids(rijIds);
  if (ids.length === 0) return 0;
  if (!attrs || typeof attrs !== 'object') throw new Error('Ongeldige rij-attributen.');

  const upd: Record<string, unknown> = {};
  if (attrs.label !== undefined) upd.label = attrs.label === '' ? null : attrs.label;
  if (attrs.rol !== undefined) {
    if (attrs.rol !== 'hoofd' && attrs.rol !== 'bestuiver') throw new Error('Ongeldige rol.');
    upd.rol = attrs.rol;
  }
  if (attrs.ras !== undefined) upd.ras = attrs.ras === '' ? null : attrs.ras;
  if (attrs.plantjaar !== undefined) upd.plantjaar = geldigPlantjaar(attrs.plantjaar);
  if (attrs.aantalBomen !== undefined) {
    const n = attrs.aantalBomen;
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > INT_MAX)) throw new Error('Aantal bomen moet een geheel getal van 0 of meer zijn.');
    upd.aantal_bomen = n;
  }
  if (attrs.geplantOp !== undefined) upd.geplant_op = geldigeDatum(attrs.geplantOp, 'plantdatum');
  if (attrs.opmerking !== undefined) upd.opmerking = attrs.opmerking === '' ? null : attrs.opmerking;
  if (attrs.blokId !== undefined) {
    if (attrs.blokId !== null) await vereisBlok(userId, perceelId, attrs.blokId);
    upd.blok_id = attrs.blokId;
  }
  if (attrs.status !== undefined) {
    if (attrs.status !== 'actief' && attrs.status !== 'gerooid') throw new Error('Ongeldige status.');
    upd.status = attrs.status;
    if (attrs.gerooidOp === undefined) {
      upd.gerooid_op = attrs.status === 'gerooid' ? vandaag() : null;
    }
  }
  if (attrs.gerooidOp !== undefined) upd.gerooid_op = geldigeDatum(attrs.gerooidOp, 'rooidatum');
  if (Object.keys(upd).length === 0) return 0;

  let aantal = 0;
  for (const stuk of inStukken(ids)) {
    const { data, error } = await db()
      .from('rijen')
      .update(upd)
      .eq('user_id', userId)
      .eq('perceel_id', perceelId)
      .in('id', stuk)
      .select('id');
    if (error) throw dbFout(error, 'Rijen bijwerken');
    aantal += (data ?? []).length;
  }
  return aantal;
}

/**
 * Blok aanmaken (zonder id) of bijwerken (met id). Met rijIds worden die rijen aan
 * het blok toegewezen (rijen uit een ander blok verhuizen; andere rijen van dit
 * blok blijven staan — uit een blok halen gaat via zetRijAttributen({ blokId: null })).
 */
export async function slaBlokOp(userId: string, perceelId: string, blok: BlokInvoer, rijIds?: string[]): Promise<Blok> {
  await vereisPerceel(userId, perceelId);
  const ids = rijIds ? vereisUuids(rijIds) : [];

  if (blok.subParcelId) {
    const { data, error } = await db()
      .from('sub_parcels')
      .select('id')
      .eq('id', blok.subParcelId)
      .eq('parcel_id', perceelId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw dbFout(error, 'Subperceel ophalen');
    if (!data) throw new Error('Subperceel hoort niet bij dit perceel.');
  }

  const rij: Record<string, unknown> = {};
  const leegNaarNull = (v: string | null | undefined) => (v === '' ? null : v);
  if (blok.naam !== undefined) rij.naam = leegNaarNull(blok.naam);
  if (blok.subParcelId !== undefined) rij.sub_parcel_id = leegNaarNull(blok.subParcelId);
  if (blok.ras !== undefined) rij.ras = leegNaarNull(blok.ras);
  if (blok.plantjaar !== undefined) rij.plantjaar = geldigPlantjaar(blok.plantjaar);
  if (blok.onderstam !== undefined) rij.onderstam = leegNaarNull(blok.onderstam);
  if (blok.rijafstandM !== undefined) rij.rijafstand_m = blok.rijafstandM;
  if (blok.boomafstandM !== undefined) rij.boomafstand_m = blok.boomafstandM;
  if (blok.teeltsysteem !== undefined) rij.teeltsysteem = leegNaarNull(blok.teeltsysteem);
  if (blok.opmerking !== undefined) rij.opmerking = leegNaarNull(blok.opmerking);
  for (const [k, naam] of [['rijafstand_m', 'rijafstand'], ['boomafstand_m', 'boomafstand']] as const) {
    const v = rij[k];
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
      throw new Error(`De ${naam} van het blok moet groter dan 0 zijn.`);
    }
  }

  let blokId: string;
  let nieuwBlok = false;
  if (blok.id) {
    vereisUuids([blok.id], 'blok-id');
    if (Object.keys(rij).length > 0) {
      const { data, error } = await db()
        .from('blokken')
        .update(rij)
        .eq('id', blok.id)
        .eq('user_id', userId)
        .eq('perceel_id', perceelId)
        .select('id');
      if (error) throw dbFout(error, 'Blok opslaan');
      if (!data || data.length === 0) throw new Error('Blok niet gevonden in dit perceel.');
    } else {
      await vereisBlok(userId, perceelId, blok.id);
    }
    blokId = blok.id;
  } else {
    const { data, error } = await db()
      .from('blokken')
      .insert({ ...rij, user_id: userId, perceel_id: perceelId })
      .select('id')
      .single();
    if (error) throw dbFout(error, 'Blok opslaan');
    blokId = (data as DbRij).id;
    nieuwBlok = true;
  }

  for (const stuk of inStukken(ids)) {
    const { error } = await db()
      .from('rijen')
      .update({ blok_id: blokId })
      .eq('user_id', userId)
      .eq('perceel_id', perceelId)
      .in('id', stuk);
    if (error) {
      // Geen leeg blok achterlaten als het toewijzen van een nieuw blok mislukt
      if (nieuwBlok) await db().from('blokken').delete().eq('id', blokId).eq('user_id', userId);
      throw dbFout(error, 'Rijen aan blok toewijzen');
    }
  }

  const { data: opgeslagen, error: leesFout } = await db()
    .from('v_blokken')
    .select('*')
    .eq('id', blokId)
    .eq('user_id', userId)
    .single();
  if (leesFout) throw dbFout(leesFout, 'Blok ophalen');
  return mapBlok(opgeslagen as DbRij);
}

/** Blok verwijderen; de rijen blijven bestaan (zonder blok). */
export async function verwijderBlok(userId: string, perceelId: string, blokId: string): Promise<void> {
  await vereisPerceel(userId, perceelId);
  await vereisBlok(userId, perceelId, blokId);
  const { error: rijFout } = await db()
    .from('rijen')
    .update({ blok_id: null })
    .eq('user_id', userId)
    .eq('perceel_id', perceelId)
    .eq('blok_id', blokId);
  if (rijFout) throw dbFout(rijFout, 'Rijen loskoppelen');
  const { error } = await db()
    .from('blokken')
    .delete()
    .eq('id', blokId)
    .eq('user_id', userId)
    .eq('perceel_id', perceelId);
  if (error) throw dbFout(error, 'Blok verwijderen');
}

/** GeoJSON-export van de rijen (na eigendomscheck; de admin-client omzeilt RLS). null = perceel niet gevonden. */
export async function rijenGeoJSON(
  userId: string,
  perceelId: string,
  inclGerooid = true,
): Promise<GeoJSON.FeatureCollection | null> {
  vereisId(userId, 'Gebruiker');
  vereisId(perceelId, 'Perceel');
  const { data: perceel, error: perceelFout } = await db()
    .from('parcels')
    .select('id')
    .eq('id', perceelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (perceelFout) throw dbFout(perceelFout, 'Perceel ophalen');
  if (!perceel) return null;

  // rijen_geojson filtert onder de admin-client (auth.uid() = null) niet op user_id. Rijen van een
  // ander account op dit perceel (via RLS-insert met een vreemd perceel_id) dus expliciet weglaten.
  const [{ data, error }, eigen] = await Promise.all([
    db().rpc('rijen_geojson', { p_perceel_id: perceelId, p_incl_gerooid: inclGerooid !== false }),
    allePaginas<{ id: string }>((van, tot) =>
      db()
        .from('rijen')
        .select('id')
        .eq('user_id', userId)
        .eq('perceel_id', perceelId)
        .order('id', { ascending: true })
        .range(van, tot),
    'Rijen ophalen'),
  ]);
  if (error) throw dbFout(error, 'GeoJSON maken');
  const fc = (typeof data === 'string' ? JSON.parse(data) : data) as GeoJSON.FeatureCollection | null;
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return { type: 'FeatureCollection', features: [] };
  const eigenIds = new Set(eigen.map(r => r.id));
  return { ...fc, features: fc.features.filter(f => eigenIds.has(String(f.id))) };
}
