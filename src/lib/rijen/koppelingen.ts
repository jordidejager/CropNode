/**
 * Rijenkaart (beta) — koppelingen tussen rijen en bestaande registraties
 * (spuitschrift, field_notes). Server-side, admin-client + expliciete userId.
 *
 * Een bespuiting op rijen schrijft de subpercelen van die rijen in
 * spuitschrift.plots en het gespoten oppervlak in plot_areas (zie PLAN.md §2.10);
 * daarvoor levert rijSelectieNaarPlots de waarden. Daarna legt
 * koppelBespuitingAanRijen de rijen vast in bespuiting_rijen.
 */

import { formatteerBereiken } from './selectie';
import { allePaginas, beperktParallel, db, dbFout, getal, getalOf, inStukken, uniek, vereisUuids } from './store';
import type { RijStatus } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbRij = Record<string, any>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Rijselectie omgerekend naar spuitschrift-plots en gespoten oppervlak. */
export interface RijSelectieOppervlak {
  /** Actieve rijen die zijn meegeteld (gerooide rijen in de selectie worden genegeerd) */
  rijIds: string[];
  /** sub_parcel-id's voor spuitschrift.plots */
  plots: string[];
  /** Gespoten ha per subperceel: min(Σ lengte × rijafstand / 10 000, subperceeloppervlak) */
  plotAreas: Record<string, number>;
  /** Σ plotAreas */
  oppervlakHa: number;
  perPerceel: RijSelectieOppervlakPerceel[];
}

export interface RijSelectieOppervlakPerceel {
  perceelId: string;
  perceelNaam: string;
  rijIds: string[];
  /** Oplopend */
  nummers: number[];
  /** Bv. "rij 1–20, 25" */
  omschrijving: string;
  /** sub_parcel-id's van deze rijen */
  plots: string[];
  /** Gespoten ha binnen dit perceel (Σ plotAreas van zijn subpercelen) */
  oppervlakHa: number;
  /** RVO-perceeloppervlak (parcels.area) ter vergelijking */
  rvoOppervlakHa: number;
}

/** Rijen van één bespuiting, per perceel. */
export interface BespuitingRijenInfo {
  perceelId: string;
  perceelNaam: string;
  rijIds: string[];
  /** Oplopend */
  nummers: number[];
  /** Bv. "rij 1–20" */
  omschrijving: string;
}

export interface NotitieRij {
  rijId: string;
  nummer: number;
  status: RijStatus;
  /** Meters vanaf het begin van de rij */
  positieM: number | null;
  /** floor(positie / boomafstand) + 1 */
  boomnummer: number | null;
}

/** Rijen van één veldnotitie, per perceel. */
export interface NotitieRijInfo extends BespuitingRijenInfo {
  /** Bv. "rij 12 · 34 m · boom 52" (één rij met positie) of "rij 1–20" */
  omschrijving: string;
  rijen: NotitieRij[];
}

export interface RijKoppeling {
  rijId: string;
  positieM?: number | null;
}

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

const RIJ_KOLOMMEN = 'id, perceel_id, nummer, status, sub_parcel_id, rijafstand_m, boomafstand_m, lengte_m';

/** Rijen (v_rijen) van deze gebruiker voor de gegeven id's. */
async function laadRijenOpId(userId: string, ids: string[]): Promise<DbRij[]> {
  // Stukken van 100 id's (≤ 100 rijen per verzoek, dus onder de PostgREST-limiet), een paar tegelijk
  const stukken = await beperktParallel(
    inStukken(uniek(ids)).map(stuk => async () => {
      const { data, error } = await db().from('v_rijen').select(RIJ_KOLOMMEN).eq('user_id', userId).in('id', stuk);
      if (error) throw dbFout(error, 'Rijen ophalen');
      return (data ?? []) as DbRij[];
    }),
  );
  return stukken.flat();
}

async function perceelNamen(userId: string, perceelIds: string[]): Promise<Map<string, { naam: string; area: number }>> {
  const uit = new Map<string, { naam: string; area: number }>();
  for (const stuk of inStukken(uniek(perceelIds))) {
    const { data, error } = await db().from('parcels').select('id, name, area').eq('user_id', userId).in('id', stuk);
    if (error) throw dbFout(error, 'Percelen ophalen');
    for (const p of ((data ?? []) as DbRij[])) uit.set(p.id, { naam: p.name ?? '', area: getalOf(p.area, 0) });
  }
  return uit;
}

function rijTekst(nummers: number[]): string {
  return `rij ${formatteerBereiken(nummers)}`;
}

/** "Rij 12 hoort" / "Rijen 12–14 horen" (+ perceelnaam als de selectie meerdere percelen raakt). */
function rijenOnderwerp(nummers: number[], perceelNaam: string | null): { tekst: string; meervoud: boolean } {
  const gesorteerd = [...nummers].sort((a, b) => a - b);
  const meervoud = gesorteerd.length > 1;
  const tekst = `${meervoud ? 'Rijen' : 'Rij'} ${formatteerBereiken(gesorteerd)}${perceelNaam ? ` (${perceelNaam})` : ''}`;
  return { tekst, meervoud };
}

function positie(v: unknown): number | null {
  const n = getal(v);
  return n === null ? null : Math.max(0, n);
}

function boomnummerVan(positieM: number | null, boomafstandM: number | null): number | null {
  if (positieM === null || boomafstandM === null || !(boomafstandM > 0)) return null;
  // zelfde marge als generatie.boomnummer (3,30 / 0,66 mag niet op 4,999… uitkomen)
  return Math.max(1, Math.floor(positieM / boomafstandM + 1e-9) + 1);
}

function formatMeters(m: number): string {
  return `${Math.round(m).toLocaleString('nl-NL')} m`;
}

// ---------------------------------------------------------------------------
// Rijselectie → spuitschrift-plots
// ---------------------------------------------------------------------------

/**
 * Zet een rijselectie om naar spuitschrift-plots en gespoten oppervlak per subperceel.
 * Gooit een Nederlandse fout als een rij niet eenduidig bij een subperceel hoort of
 * geen rijafstand heeft.
 */
export async function rijSelectieNaarPlots(userId: string, rijIds: string[]): Promise<RijSelectieOppervlak> {
  const ids = vereisUuids(rijIds);
  const leeg: RijSelectieOppervlak = { rijIds: [], plots: [], plotAreas: {}, oppervlakHa: 0, perPerceel: [] };
  if (ids.length === 0) return leeg;

  const gevonden = await laadRijenOpId(userId, ids);
  if (gevonden.length < ids.length) {
    const n = ids.length - gevonden.length;
    throw new Error(`${n === 1 ? 'Eén rij bestaat' : `${n} rijen bestaan`} niet (meer) — ververs de rijenkaart.`);
  }
  const actief = gevonden.filter(r => r.status === 'actief');
  if (actief.length === 0) throw new Error('De selectie bevat geen actieve rijen.');

  const perceelIds = uniek(actief.map(r => r.perceel_id as string));
  const percelen = await perceelNamen(userId, perceelIds);
  const meerderePercelen = perceelIds.length > 1;
  const naamVan = (pid: string) => (meerderePercelen ? percelen.get(pid)?.naam || 'onbekend perceel' : null);

  // Controle: elke rij moet een subperceel en een rijafstand hebben
  const fouten: string[] = [];
  for (const pid of perceelIds) {
    const vanPerceel = actief.filter(r => r.perceel_id === pid);
    const zonderSub = vanPerceel.filter(r => !r.sub_parcel_id).map(r => getalOf(r.nummer, 0));
    if (zonderSub.length > 0) {
      const { tekst, meervoud } = rijenOnderwerp(zonderSub, naamVan(pid));
      fouten.push(`${tekst} ${meervoud ? 'horen' : 'hoort'} niet eenduidig bij een subperceel — koppel het blok aan een subperceel.`);
    }
    const zonderAfstand = vanPerceel
      .filter(r => { const a = getal(r.rijafstand_m); return a === null || a <= 0; })
      .map(r => getalOf(r.nummer, 0));
    if (zonderAfstand.length > 0) {
      const { tekst, meervoud } = rijenOnderwerp(zonderAfstand, naamVan(pid));
      fouten.push(`${tekst} ${meervoud ? 'hebben' : 'heeft'} geen rijafstand — stel de rijafstand van het perceel of blok in.`);
    }
  }
  if (fouten.length > 0) throw new Error(fouten.join(' '));

  // Subperceeloppervlak (bovengrens)
  const subIds = uniek(actief.map(r => r.sub_parcel_id as string));
  const subOppervlak = new Map<string, number>();
  for (const stuk of inStukken(subIds)) {
    const { data, error } = await db().from('sub_parcels').select('id, area').eq('user_id', userId).in('id', stuk);
    if (error) throw dbFout(error, 'Subpercelen ophalen');
    for (const s of ((data ?? []) as DbRij[])) subOppervlak.set(s.id, getalOf(s.area, 0));
  }
  const onbekend = subIds.filter(s => !subOppervlak.has(s));
  if (onbekend.length > 0) throw new Error('Subperceel van de rijen niet gevonden — ververs de rijenkaart.');

  const plotAreas: Record<string, number> = {};
  for (const sub of subIds) {
    const m2 = actief
      .filter(r => r.sub_parcel_id === sub)
      .reduce((som, r) => som + getalOf(r.lengte_m, 0) * getalOf(r.rijafstand_m, 0), 0);
    // Begrens op het subperceeloppervlak; een subperceel zonder (geldig) oppervlak begrenst niet
    const max = subOppervlak.get(sub) ?? 0;
    const ha = max > 0 ? Math.min(m2 / 10000, max) : m2 / 10000;
    plotAreas[sub] = Math.round(ha * 10000) / 10000;
  }

  const perPerceel: RijSelectieOppervlakPerceel[] = perceelIds.map(pid => {
    const vanPerceel = actief.filter(r => r.perceel_id === pid);
    const nummers = vanPerceel.map(r => getalOf(r.nummer, 0)).sort((a, b) => a - b);
    const plots = uniek(vanPerceel.map(r => r.sub_parcel_id as string));
    const ha = plots.reduce((s, p) => s + (plotAreas[p] ?? 0), 0);
    return {
      perceelId: pid,
      perceelNaam: percelen.get(pid)?.naam ?? '',
      rijIds: vanPerceel.map(r => r.id as string),
      nummers,
      omschrijving: rijTekst(nummers),
      plots,
      oppervlakHa: Math.round(ha * 10000) / 10000,
      rvoOppervlakHa: percelen.get(pid)?.area ?? 0,
    };
  });
  perPerceel.sort((a, b) => a.perceelNaam.localeCompare(b.perceelNaam, 'nl', { numeric: true }));

  const oppervlakHa = Object.values(plotAreas).reduce((s, v) => s + v, 0);
  return {
    rijIds: actief.map(r => r.id as string),
    plots: subIds,
    plotAreas,
    oppervlakHa: Math.round(oppervlakHa * 10000) / 10000,
    perPerceel,
  };
}

// ---------------------------------------------------------------------------
// Koppelen
// ---------------------------------------------------------------------------

async function vereisRijen(userId: string, ids: string[]): Promise<DbRij[]> {
  const gevonden = await laadRijenOpId(userId, ids);
  if (gevonden.length < ids.length) throw new Error('Niet alle rijen gevonden — ververs de rijenkaart.');
  return gevonden;
}

/** Legt vast welke rijen een bespuiting raakte (dubbele koppelingen worden genegeerd). */
export async function koppelBespuitingAanRijen(userId: string, spuitschriftId: string, rijIds: string[]): Promise<void> {
  if (typeof spuitschriftId !== 'string' || !spuitschriftId) throw new Error('Bespuiting ontbreekt.');
  const ids = vereisUuids(rijIds);
  if (ids.length === 0) return;

  const { data: spray, error: sprayFout } = await db()
    .from('spuitschrift')
    .select('id')
    .eq('id', spuitschriftId)
    .eq('user_id', userId)
    .maybeSingle();
  if (sprayFout) throw dbFout(sprayFout, 'Bespuiting ophalen');
  if (!spray) throw new Error('Bespuiting niet gevonden.');

  await vereisRijen(userId, ids);

  for (const stuk of inStukken(ids, 500)) {
    const { error } = await db()
      .from('bespuiting_rijen')
      .upsert(
        stuk.map(rijId => ({ bespuiting_id: spuitschriftId, rij_id: rijId, user_id: userId })),
        { onConflict: 'bespuiting_id,rij_id', ignoreDuplicates: true },
      );
    if (error) throw dbFout(error, 'Rijen aan bespuiting koppelen');
  }
}

/** Koppelt een veldnotitie aan rijen (met optionele positie in meters vanaf het begin van de rij). */
export async function koppelNotitieAanRijen(userId: string, veldnotitieId: string, rijen: RijKoppeling[]): Promise<void> {
  vereisUuids([veldnotitieId], 'veldnotitie-id');
  if (!Array.isArray(rijen)) throw new Error('Ongeldige rijen.');
  // Laatste positie per rij wint
  const perRij = new Map<string, number | null>();
  for (const k of rijen) {
    const [id] = vereisUuids([k?.rijId]);
    perRij.set(id, positie(k?.positieM));
  }
  if (perRij.size === 0) return;

  const { data: notitie, error: notitieFout } = await db()
    .from('field_notes')
    .select('id')
    .eq('id', veldnotitieId)
    .eq('user_id', userId)
    .maybeSingle();
  if (notitieFout) throw dbFout(notitieFout, 'Notitie ophalen');
  if (!notitie) throw new Error('Notitie niet gevonden.');

  const lengte = new Map(
    (await vereisRijen(userId, Array.from(perRij.keys()))).map(r => [r.id as string, getalOf(r.lengte_m, 0)]),
  );

  // Positie binnen de rij houden (0 … lengte), zodat boomnummer en spiegelen bij beginkant kloppen
  const records = Array.from(perRij.entries()).map(([rijId, positieM]) => {
    const max = lengte.get(rijId) ?? 0;
    return {
      veldnotitie_id: veldnotitieId,
      rij_id: rijId,
      positie_m: positieM === null ? null : Math.round((max > 0 ? Math.min(positieM, max) : positieM) * 100) / 100,
      user_id: userId,
    };
  });
  for (const stuk of inStukken(records, 500)) {
    const { error } = await db()
      .from('veldnotitie_rijen')
      .upsert(stuk, { onConflict: 'veldnotitie_id,rij_id' });
    if (error) throw dbFout(error, 'Notitie aan rijen koppelen');
  }
}

/**
 * Nieuwe veldnotitie op rijen: field_notes-record (parcel_ids = subpercelen van de
 * rijen; als geen enkele rij eenduidig bij een subperceel hoort: alle subpercelen van
 * het perceel) + koppeling in veldnotitie_rijen.
 */
export async function maakRijNotitie(
  userId: string,
  invoer: { perceelId: string; tekst: string; rijen: RijKoppeling[]; bron?: 'web' | 'claude' },
): Promise<{ id: string }> {
  const tekst = typeof invoer?.tekst === 'string' ? invoer.tekst.trim() : '';
  if (!tekst) throw new Error('De notitie is leeg.');
  if (typeof invoer.perceelId !== 'string' || !invoer.perceelId) throw new Error('Perceel ontbreekt.');
  if (!Array.isArray(invoer.rijen) || invoer.rijen.length === 0) throw new Error('Kies minstens één rij.');
  const ids = vereisUuids(invoer.rijen.map(r => r?.rijId));
  const bron = invoer.bron === 'claude' ? 'claude' : 'web';

  const rijen = await vereisRijen(userId, ids);
  if (rijen.some(r => r.perceel_id !== invoer.perceelId)) throw new Error('Niet alle rijen horen bij dit perceel.');

  let parcelIds = uniek(rijen.map(r => r.sub_parcel_id as string | null).filter((s): s is string => !!s));
  if (parcelIds.length === 0) {
    const { data, error } = await db()
      .from('sub_parcels')
      .select('id')
      .eq('parcel_id', invoer.perceelId)
      .eq('user_id', userId);
    if (error) throw dbFout(error, 'Subpercelen ophalen');
    parcelIds = ((data ?? []) as DbRij[]).map(s => s.id as string);
  }

  const { data, error } = await db()
    .from('field_notes')
    .insert({
      user_id: userId,
      content: tekst,
      status: 'open',
      source: bron,
      is_pinned: false,
      parcel_ids: parcelIds,
    })
    .select('id')
    .single();
  if (error) throw dbFout(error, 'Notitie opslaan');
  const id = (data as DbRij).id as string;

  try {
    await koppelNotitieAanRijen(userId, id, invoer.rijen);
  } catch (e) {
    // Geen half werk achterlaten: notitie zonder rijkoppeling weer weghalen
    await db().from('field_notes').delete().eq('id', id).eq('user_id', userId);
    throw e;
  }
  return { id };
}

// ---------------------------------------------------------------------------
// Rijen bij bestaande registraties (lijsten, MCP)
// ---------------------------------------------------------------------------

function groepeerPerPerceel<T>(items: T[], perceelVan: (item: T) => string): Map<string, T[]> {
  const uit = new Map<string, T[]>();
  for (const item of items) {
    const pid = perceelVan(item);
    const lijst = uit.get(pid) ?? [];
    lijst.push(item);
    uit.set(pid, lijst);
  }
  return uit;
}

/** Per bespuiting-id: de gekoppelde rijen, gegroepeerd per perceel. Bespuitingen zonder rijen ontbreken. */
export async function rijenVoorBespuitingen(
  userId: string,
  spuitschriftIds: string[],
): Promise<Record<string, BespuitingRijenInfo[]>> {
  const ids = uniek((Array.isArray(spuitschriftIds) ? spuitschriftIds : []).filter(id => typeof id === 'string' && id));
  if (ids.length === 0) return {};

  // Eén bespuiting kan honderden rijen hebben → per stuk id's alle pagina's ophalen
  const koppelingen: DbRij[] = [];
  for (const stuk of inStukken(ids)) {
    koppelingen.push(...(await allePaginas((van, tot) =>
      db()
        .from('bespuiting_rijen')
        .select('bespuiting_id, rij_id')
        .eq('user_id', userId)
        .in('bespuiting_id', stuk)
        .order('bespuiting_id', { ascending: true })
        .order('rij_id', { ascending: true })
        .range(van, tot),
    'Rijkoppelingen ophalen')));
  }
  if (koppelingen.length === 0) return {};

  const rijen = new Map((await laadRijenOpId(userId, uniek(koppelingen.map(k => k.rij_id as string)))).map(r => [r.id as string, r]));
  const percelen = await perceelNamen(userId, Array.from(rijen.values()).map(r => r.perceel_id as string));

  const perBespuiting = new Map<string, DbRij[]>();
  for (const k of koppelingen) {
    const rij = rijen.get(k.rij_id);
    if (!rij) continue;
    const lijst = perBespuiting.get(k.bespuiting_id) ?? [];
    lijst.push(rij);
    perBespuiting.set(k.bespuiting_id, lijst);
  }

  const uit: Record<string, BespuitingRijenInfo[]> = {};
  for (const [bespuitingId, lijst] of perBespuiting) {
    uit[bespuitingId] = Array.from(groepeerPerPerceel(lijst, r => r.perceel_id as string).entries())
      .map(([perceelId, vanPerceel]): BespuitingRijenInfo => {
        const gesorteerd = vanPerceel.slice().sort((a, b) => getalOf(a.nummer, 0) - getalOf(b.nummer, 0));
        const nummers = gesorteerd.map(r => getalOf(r.nummer, 0));
        return {
          perceelId,
          perceelNaam: percelen.get(perceelId)?.naam ?? '',
          rijIds: gesorteerd.map(r => r.id as string),
          nummers,
          omschrijving: rijTekst(nummers),
        };
      })
      .sort((a, b) => a.perceelNaam.localeCompare(b.perceelNaam, 'nl', { numeric: true }));
  }
  return uit;
}

/** Per veldnotitie-id: de gekoppelde rijen (met positie/boomnummer), gegroepeerd per perceel. */
export async function rijenVoorNotities(
  userId: string,
  veldnotitieIds: string[],
): Promise<Record<string, NotitieRijInfo[]>> {
  const ids = uniek((Array.isArray(veldnotitieIds) ? veldnotitieIds : []).filter(id => typeof id === 'string' && id));
  if (ids.length === 0) return {};
  // veldnotitie_id is een uuid: ongeldige id's (bv. tijdelijke client-id's) overslaan
  const geldig = ids.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (geldig.length === 0) return {};

  const koppelingen: DbRij[] = [];
  for (const stuk of inStukken(geldig)) {
    koppelingen.push(...(await allePaginas((van, tot) =>
      db()
        .from('veldnotitie_rijen')
        .select('veldnotitie_id, rij_id, positie_m')
        .eq('user_id', userId)
        .in('veldnotitie_id', stuk)
        .order('veldnotitie_id', { ascending: true })
        .order('rij_id', { ascending: true })
        .range(van, tot),
    'Rijkoppelingen ophalen')));
  }
  if (koppelingen.length === 0) return {};

  const rijen = new Map((await laadRijenOpId(userId, uniek(koppelingen.map(k => k.rij_id as string)))).map(r => [r.id as string, r]));
  const percelen = await perceelNamen(userId, Array.from(rijen.values()).map(r => r.perceel_id as string));

  const perNotitie = new Map<string, { rij: DbRij; positieM: number | null }[]>();
  for (const k of koppelingen) {
    const rij = rijen.get(k.rij_id);
    if (!rij) continue;
    const lijst = perNotitie.get(k.veldnotitie_id) ?? [];
    lijst.push({ rij, positieM: positie(k.positie_m) });
    perNotitie.set(k.veldnotitie_id, lijst);
  }

  const uit: Record<string, NotitieRijInfo[]> = {};
  for (const [notitieId, lijst] of perNotitie) {
    uit[notitieId] = Array.from(groepeerPerPerceel(lijst, item => item.rij.perceel_id as string).entries())
      .map(([perceelId, items]): NotitieRijInfo => {
        const notitieRijen: NotitieRij[] = items
          .map(({ rij, positieM }) => ({
            rijId: rij.id as string,
            nummer: getalOf(rij.nummer, 0),
            status: (rij.status === 'gerooid' ? 'gerooid' : 'actief') as RijStatus,
            positieM,
            boomnummer: boomnummerVan(positieM, getal(rij.boomafstand_m)),
          }))
          .sort((a, b) => a.nummer - b.nummer);
        const nummers = notitieRijen.map(r => r.nummer);
        let omschrijving = rijTekst(nummers);
        if (notitieRijen.length === 1 && notitieRijen[0].positieM !== null) {
          const r = notitieRijen[0];
          omschrijving = `rij ${r.nummer} · ${formatMeters(r.positieM as number)}${r.boomnummer !== null ? ` · boom ${r.boomnummer}` : ''}`;
        }
        return {
          perceelId,
          perceelNaam: percelen.get(perceelId)?.naam ?? '',
          rijIds: notitieRijen.map(r => r.rijId),
          nummers,
          omschrijving,
          rijen: notitieRijen,
        };
      })
      .sort((a, b) => a.perceelNaam.localeCompare(b.perceelNaam, 'nl', { numeric: true }));
  }
  return uit;
}
