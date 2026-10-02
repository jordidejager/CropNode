/**
 * Klussen (lopende ploegen), werkschema en oogstvoortgang voor de CropNode MCP.
 *
 * Een klus = active_task_sessions: taak × (deel)perceel × aantal man, vanaf een starttijd.
 * Uren tellen automatisch volgens het werkschema (eerste dag vanaf starttijd, vandaag tot nu);
 * day_overrides [{date, hoursPerPerson, peopleCount}] gaan per dag voor (zelfde formaat als de
 * web-app). Stoppen zet de klus om in task_logs per dag. Alle tijden in Europe/Amsterdam.
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { calcNettoHoursWithBreaks, DEFAULT_WORK_SCHEDULE, type BreakPeriod } from '@/lib/types';
import type { McpContext } from './context';
import { dd, f, normaliseer, num, percelenVanNaam, str, zoek, type Args, type ToolDefinitie, type ToolResultaat } from './util';

// ── Tijd in Nederland ───────────────────────────────────────────────────

const TZ = 'Europe/Amsterdam';
const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const DAGNAMEN: Record<string, number> = { zo: 0, zondag: 0, ma: 1, maandag: 1, di: 2, dinsdag: 2, wo: 3, woensdag: 3, do: 4, donderdag: 4, vr: 5, vrijdag: 5, za: 6, zaterdag: 6 };

export function nl(d: Date): { datum: string; tijd: string; dow: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  const datum = `${p.year}-${p.month}-${p.day}`;
  return { datum, tijd: `${p.hour}:${p.minute}`, dow: new Date(`${datum}T12:00:00Z`).getUTCDay() };
}

/** Lokale NL-datum + tijd → Date (UTC-moment). */
export function vanNl(datum: string, tijd = '12:00'): Date {
  const guess = new Date(`${datum}T${tijd}:00Z`);
  const t = nl(guess);
  const diffMin = (Date.parse(`${t.datum}T${t.tijd}:00Z`) - guess.getTime()) / 60000;
  return new Date(guess.getTime() - diffMin * 60000);
}

const plusDag = (datum: string, n: number) => { const d = new Date(`${datum}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dagLabel = (datum: string) => `${DAGEN[new Date(`${datum}T12:00:00Z`).getUTCDay()]} ${datum.slice(8)}-${datum.slice(5, 7)}`;

/** "vandaag", "gisteren", "maandag", "28-9", YYYY-MM-DD → YYYY-MM-DD (NL). */
export function dagArg(v: unknown, standaard?: string): string | null {
  const s = str(v).toLowerCase();
  const vandaag = nl(new Date()).datum;
  if (!s) return standaard ?? null;
  if (s === 'vandaag' || s === 'nu') return vandaag;
  if (s === 'gisteren') return plusDag(vandaag, -1);
  if (s === 'eergisteren') return plusDag(vandaag, -2);
  if (s === 'morgen') return plusDag(vandaag, 1);
  if (s === 'overmorgen') return plusDag(vandaag, 2);
  const dn = s.replace(/^(afgelopen|vorige)\s+/, '');
  if (dn in DAGNAMEN) {
    const vandaagDow = nl(new Date()).dow;
    let terug = (vandaagDow - DAGNAMEN[dn] + 7) % 7;
    if (/^(afgelopen|vorige)\s/.test(s) && terug === 0) terug = 7;
    return plusDag(vandaag, -terug);
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?$/.exec(s);
  if (m) return `${m[3] ?? vandaag.slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const maanden = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  m = /^(\d{1,2})\s+([a-z]+)/.exec(s);
  if (m) {
    const idx = maanden.findIndex(x => m![2].startsWith(x) || (x === 'mrt' && m![2].startsWith('maa')));
    if (idx >= 0) return `${vandaag.slice(0, 4)}-${String(idx + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export function tijdArg(v: unknown): string | null {
  const s = str(v).toLowerCase();
  if (!s) return null;
  let m = /^(\d{1,2})[:.](\d{2})$/.exec(s);
  if (m && +m[1] < 24 && +m[2] < 60) return `${m[1].padStart(2, '0')}:${m[2]}`;
  m = /^(\d{1,2})\s*(?:uur|u)?$/.exec(s);
  if (m && +m[1] < 24) return `${m[1].padStart(2, '0')}:00`;
  return null;
}

// ── Werkschema ──────────────────────────────────────────────────────────

interface SchemaDag { isWorkday: boolean; start: string | null; end: string | null; breaks: BreakPeriod[] }

export async function laadWerkschema(userId: string): Promise<Map<number, SchemaDag>> {
  const { data } = await (getSupabaseAdmin() as any)
    .from('work_schedules')
    .select('day_of_week, is_workday, start_time, end_time, breaks, break_minutes')
    .eq('user_id', userId);
  const map = new Map<number, SchemaDag>();
  for (const d of DEFAULT_WORK_SCHEDULE) map.set(d.dayOfWeek, { isWorkday: d.isWorkday, start: d.startTime, end: d.endTime, breaks: d.breaks });
  for (const r of data || []) {
    const breaks: BreakPeriod[] = Array.isArray(r.breaks) && r.breaks.length
      ? r.breaks
      : r.break_minutes > 0 ? [{ start: '12:00', end: `${String(12 + Math.floor(r.break_minutes / 60)).padStart(2, '0')}:${String(r.break_minutes % 60).padStart(2, '0')}` }] : [];
    map.set(r.day_of_week, { isWorkday: !!r.is_workday, start: r.start_time?.slice(0, 5) ?? null, end: r.end_time?.slice(0, 5) ?? null, breaks });
  }
  return map;
}

/** Netto uren per persoon op een dag volgens schema, optioneel tussen van/tot. Afgerond op 0,5. */
export function schemaUren(schema: Map<number, SchemaDag>, datum: string, van?: string | null, tot?: string | null): number {
  const s = schema.get(new Date(`${datum}T12:00:00Z`).getUTCDay());
  if (!s || !s.isWorkday || !s.start || !s.end) return 0;
  const start = van && van > s.start ? van : s.start;
  const eind = tot && tot < s.end ? tot : s.end;
  if (eind <= start) return 0;
  return Math.round(calcNettoHoursWithBreaks(start, s.end, s.breaks, true, eind) * 2) / 2;
}

// ── Klussen ─────────────────────────────────────────────────────────────

interface Override { date: string; hoursPerPerson: number; peopleCount: number }
interface Klus {
  id: string;
  taskTypeId: string;
  taak: string;
  subParcelId: string | null;
  parcelId: string | null;
  start: Date;
  personen: number;
  notes: string | null;
  overrides: Override[];
}
interface Dag { datum: string; urenPP: number; personen: number; afwijking: boolean }

async function laadKlussen(userId: string): Promise<Klus[]> {
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('active_task_sessions')
    .select('id, task_type_id, sub_parcel_id, parcel_id, start_time, people_count, notes, day_overrides, task_types(name)')
    .eq('user_id', userId)
    .order('start_time');
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: r.id,
    taskTypeId: r.task_type_id,
    taak: r.task_types?.name ?? '?',
    subParcelId: r.sub_parcel_id,
    parcelId: r.parcel_id,
    start: new Date(r.start_time),
    personen: r.people_count,
    notes: r.notes,
    overrides: Array.isArray(r.day_overrides) ? r.day_overrides : [],
  }));
}

/** Dagen van een klus t/m einddatum (standaard vandaag), met uren volgens schema of afwijking. */
export function klusDagen(k: Klus, schema: Map<number, SchemaDag>, eindDatum?: string, eindTijd?: string | null): Dag[] {
  const nu = nl(new Date());
  const st = nl(k.start);
  const eind = eindDatum ?? nu.datum;
  const overrides = new Map(k.overrides.map(o => [o.date, o]));
  const dagen: Dag[] = [];
  for (let d = st.datum; d <= eind; d = plusDag(d, 1)) {
    const o = overrides.get(d);
    if (o) { dagen.push({ datum: d, urenPP: Number(o.hoursPerPerson), personen: Number(o.peopleCount), afwijking: true }); continue; }
    const van = d === st.datum ? st.tijd : null;
    const tot = d === eind ? (eindTijd ?? (d === nu.datum ? nu.tijd : null)) : null;
    dagen.push({ datum: d, urenPP: schemaUren(schema, d, van, tot), personen: k.personen, afwijking: false });
  }
  return dagen;
}

function perceelNaam(ctx: McpContext, k: { subParcelId: string | null; parcelId: string | null }): string {
  if (k.subParcelId) return ctx.parcels.find(p => p.id === k.subParcelId)?.name ?? 'onbekend blok';
  if (k.parcelId) return `${ctx.parcels.find(p => p.parcelId === k.parcelId)?.parcelName ?? 'onbekend perceel'} (heel perceel)`;
  return 'geen perceel';
}

function klusKop(ctx: McpContext, k: Klus): string {
  const st = nl(k.start);
  return `[${k.id.slice(0, 8)}] ${k.taak} · ${perceelNaam(ctx, k)} · ${k.personen} man · sinds ${dagLabel(st.datum)} ${st.tijd}${k.notes ? ` · ${k.notes}` : ''}`;
}

function dagenTabel(dagen: Dag[], max = 14): string[] {
  const tonen = dagen.filter(d => d.urenPP > 0 || d.afwijking);
  const regels = tonen.slice(-max).map(d => `  - ${dagLabel(d.datum)}: ${d.personen} × ${f(d.urenPP, 1)} u = ${f(d.personen * d.urenPP, 1)} u${d.afwijking ? ' (afwijking)' : ''}`);
  if (tonen.length > max) regels.unshift(`  … ${tonen.length - max} eerdere dagen`);
  return regels;
}

const manuren = (dagen: Dag[]) => dagen.reduce((s, d) => s + d.personen * d.urenPP, 0);

/** Perceelinvoer → sub_parcel_id of (hele) parcel_id. */
function perceelKeuze(ctx: McpContext, naam: string): { subParcelId: string | null; parcelId: string | null; probleem?: string } {
  if (!naam) return { subParcelId: null, parcelId: null };
  const ps = percelenVanNaam(ctx, naam);
  if (ps.length === 0) return { subParcelId: null, parcelId: null, probleem: `Perceel "${naam}" niet gevonden. Bekende percelen: ${ctx.parcels.map(p => p.name).join(', ')}.` };
  if (ps.length === 1) return { subParcelId: ps[0].id, parcelId: ps[0].parcelId };
  const hoofd = new Set(ps.map(p => p.parcelId));
  if (hoofd.size === 1) return { subParcelId: null, parcelId: ps[0].parcelId };
  return { subParcelId: null, parcelId: null, probleem: `"${naam}" past op meerdere percelen (${ps.map(p => p.name).join(', ')}). Kies één blok of hoofdperceel.` };
}

async function taakTypes(userId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await (getSupabaseAdmin() as any).from('task_types').select('id, name').or(`user_id.eq.${userId},user_id.is.null`).order('name');
  return data || [];
}

async function vindKlus(ctx: McpContext, args: Args): Promise<{ klus?: Klus; lijst?: Klus[]; fout?: string }> {
  const klussen = await laadKlussen(ctx.userId);
  if (klussen.length === 0) return { fout: 'Er loopt nu geen enkele klus.' };
  const code = str(args.klus).toLowerCase().replace(/[\[\]\s]/g, '');
  if (/^[0-9a-f]{4,}$/.test(code)) {
    const m = klussen.filter(k => k.id.startsWith(code));
    if (m.length === 1) return { klus: m[0] };
  }
  const zoekterm = str(args.klus);
  if (!zoekterm) return klussen.length === 1 ? { klus: klussen[0] } : { lijst: klussen };
  const n = normaliseer(zoekterm);
  const gescoord = klussen.filter(k => {
    const tekst = normaliseer(`${k.taak} ${perceelNaam(ctx, k)}`);
    return n.split(' ').every(w => tekst.includes(w));
  });
  if (gescoord.length === 1) return { klus: gescoord[0] };
  return { lijst: gescoord.length ? gescoord : klussen };
}

// ── Oogst uit StoreNode ─────────────────────────────────────────────────

function huidigSeizoen(): string {
  const { datum } = nl(new Date());
  const y = +datum.slice(0, 4);
  const m = +datum.slice(5, 7);
  const start = m >= 7 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

interface Pluk { perceelId: string; perceelNaam: string; ras: string; datum: string; kisten: number; kg: number | null }

async function laadPluk(ctx: McpContext, seizoen = huidigSeizoen()): Promise<Pluk[]> {
  const sn = (getSupabaseAdmin() as any).schema('storenode');
  const { data: partijen, error } = await sn.from('partijen').select('id, perceel_id, perceel_naam, ras').eq('user_id', ctx.userId).eq('seizoen', seizoen).eq('eigendom', 'eigen');
  if (error || !partijen?.length) return [];
  const byId = new Map<string, any>(partijen.map((p: any) => [p.id, p]));
  const { data: regels } = await sn.from('oogstregels').select('partij_id, datum, aantal_kisten, kisttype, kg_gewogen').in('partij_id', [...byId.keys()]);
  return (regels || []).map((r: any) => {
    const p = byId.get(r.partij_id);
    const blok = ctx.parcels.find(x => x.id === p.perceel_id) ?? ctx.parcels.find(x => x.parcelId === p.perceel_id);
    const peer = /peer/i.test(blok?.crop || '') || /conference|doyenn|lucas|xenia|wildeman|sweet sensation|comice/i.test(p.ras || '');
    const kg = r.kg_gewogen != null ? Number(r.kg_gewogen) : /1,14\s*×\s*1,14/.test(r.kisttype || '') ? r.aantal_kisten * (peer ? 400 : 325) : null;
    return { perceelId: p.perceel_id, perceelNaam: p.perceel_naam, ras: p.ras, datum: String(r.datum).slice(0, 10), kisten: Number(r.aantal_kisten) || 0, kg };
  });
}

/** Hoort een plukregel bij een klus/perceel (deelperceel, of hoofdperceel met al zijn blokken)? */
function hoortBij(ctx: McpContext, perceelId: string, k: { subParcelId: string | null; parcelId: string | null }): boolean {
  if (k.subParcelId) {
    if (perceelId === k.subParcelId) return true;
    const blok = ctx.parcels.find(p => p.id === k.subParcelId);
    return !!blok && perceelId === blok.parcelId; // partij op het hele perceel
  }
  if (k.parcelId) return perceelId === k.parcelId || ctx.parcels.some(p => p.id === perceelId && p.parcelId === k.parcelId);
  return false;
}

function oogstSamenvatting(pluk: Pluk[]): { eerste: string; laatste: string; dagen: number; kisten: number; kg: number; kgOnbekend: boolean } | null {
  if (!pluk.length) return null;
  const datums = [...new Set(pluk.map(p => p.datum))].sort();
  return {
    eerste: datums[0],
    laatste: datums[datums.length - 1],
    dagen: datums.length,
    kisten: pluk.reduce((s, p) => s + p.kisten, 0),
    kg: pluk.reduce((s, p) => s + (p.kg ?? 0), 0),
    kgOnbekend: pluk.some(p => p.kg == null),
  };
}

const isPluk = (taak: string) => /pluk|oogst/i.test(taak);

// ── Tools ───────────────────────────────────────────────────────────────

export const KLUS_TOOLS: ToolDefinitie[] = [
  {
    name: 'klussen',
    description: 'Wat loopt er nu? Alle lopende klussen (ploeg op een perceel): code, taak, perceel, aantal man, sinds wanneer, uren per dag (werkschema of afwijking) en manuren tot nu. Bij pluk/oogst ook de oogst uit StoreNode sinds de start en kg per manuur.',
    inputSchema: { type: 'object', properties: { details: { type: 'boolean', description: 'Toon alle dagen (standaard laatste 7).' } }, additionalProperties: false },
  },
  {
    name: 'klus_starten',
    description:
      'Start een lopende klus: een ploeg begint ergens ("vanaf vandaag met 6 man Jonagold plukken op Spoor"). Uren tellen daarna automatisch per werkdag volgens het werkschema; afwijkingen (iemand ziek, eerder gestopt) via klus_wijzigen; klaar → klus_stoppen. Kan ook met terugwerkende kracht (datum in het verleden). Eerst VOORSTEL, dan bevestig=true.',
    inputSchema: {
      type: 'object',
      properties: {
        taak: { type: 'string', description: 'Bijv. "plukken", "snoeien", "dunnen", "sorteren".' },
        perceel: { type: 'string', description: 'Blok (bijv. "spoor jonagold") of hoofdperceel; leeg = geen perceel.' },
        personen: { type: 'number' },
        datum: { type: 'string', description: 'Startdag: "vandaag" (standaard), "gisteren", "maandag", "15-9", YYYY-MM-DD.' },
        tijd: { type: 'string', description: 'Starttijd, bijv. "7:30". Standaard: nu (vandaag) of begin werkdag (andere dag).' },
        opmerking: { type: 'string' },
        nieuwe_taak: { type: 'boolean', description: 'true = taaktype aanmaken als het niet bestaat.' },
        bevestig: { type: 'boolean' },
      },
      required: ['taak', 'personen'],
      additionalProperties: false,
    },
  },
  {
    name: 'klus_wijzigen',
    description:
      'Past een lopende klus aan. (1) Afwijking voor één dag of een reeks dagen: datum (+ tot_datum) met personen, uren (per persoon), begin/eind (tijden) of niet_gewerkt=true — bijv. "vandaag 1 man ziek", "dinsdag pas om 10:00 begonnen", "zaterdag niet gewerkt". (2) Ploeg wijzigt blijvend: personen_vanaf + personen ("vanaf morgen nog 4 man"). (3) start corrigeren: startdatum/starttijd. (4) opmerking. Eerst VOORSTEL, dan bevestig=true.',
    inputSchema: {
      type: 'object',
      properties: {
        klus: { type: 'string', description: 'Code (uit klussen) of zoekterm zoals "plukken spoor". Leeg als er maar één klus loopt.' },
        datum: { type: 'string', description: 'Dag van de afwijking.' },
        tot_datum: { type: 'string', description: 'Laatste dag als de afwijking meerdere dagen geldt.' },
        personen: { type: 'number', description: 'Aantal man op die dag(en), of bij personen_vanaf het nieuwe aantal.' },
        uren: { type: 'number', description: 'Uren per persoon op die dag(en).' },
        begin: { type: 'string', description: 'Begintijd op die dag(en), bijv. "10:00".' },
        eind: { type: 'string', description: 'Eindtijd op die dag(en), bijv. "15:00".' },
        niet_gewerkt: { type: 'boolean' },
        personen_vanaf: { type: 'string', description: 'Vanaf deze dag geldt het nieuwe aantal personen blijvend.' },
        startdatum: { type: 'string' },
        starttijd: { type: 'string' },
        opmerking: { type: 'string' },
        bevestig: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'klus_stoppen',
    description:
      'Rondt een lopende klus af ("Spoor is klaar"): de uren worden per dag vastgelegd in de urenregistratie (en zijn dan ook zichtbaar in StoreNode). datum = laatste werkdag (standaard vandaag), tijd = eindtijd die dag (standaard nu bij vandaag, anders einde werkdag). Bij pluk: oogst en kg per manuur uit StoreNode. weggooien=true verwijdert de klus ZONDER uren (alleen voor per ongeluk gestarte/blijven lopen timers). Eerst VOORSTEL, dan bevestig=true.',
    inputSchema: {
      type: 'object',
      properties: {
        klus: { type: 'string' },
        datum: { type: 'string' },
        tijd: { type: 'string' },
        weggooien: { type: 'boolean' },
        bevestig: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'werkschema',
    description: 'Het werkschema per weekdag (begin, eind, pauzes, netto uren). Hiermee rekenen klussen en uren zonder opgegeven uren.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'werkschema_wijzigen',
    description: 'Wijzigt het vaste werkschema voor een of meer weekdagen: begin, eind, pauzes, of werkdag ja/nee. Voor een afwijking op één dag van één klus: klus_wijzigen. Eerst VOORSTEL, dan bevestig=true.',
    inputSchema: {
      type: 'object',
      properties: {
        dagen: { type: 'array', items: { type: 'string' }, description: 'Bijv. ["ma","di","wo","vr"], ["werkdagen"] (ma–vr), ["alle"] (ma–za), ["za"].' },
        begin: { type: 'string', description: 'Bijv. "7:00".' },
        eind: { type: 'string', description: 'Bijv. "17:30".' },
        pauzes: { type: 'array', items: { type: 'object', properties: { start: { type: 'string' }, eind: { type: 'string' } }, required: ['start', 'eind'] }, description: 'Vervangt de pauzes, bijv. [{"start":"12:00","eind":"12:30"}].' },
        werkdag: { type: 'boolean', description: 'false = vrije dag.' },
        bevestig: { type: 'boolean' },
      },
      required: ['dagen'],
      additionalProperties: false,
    },
  },
  {
    name: 'oogst_voortgang',
    description:
      'Waar zijn we met de oogst? Per perceel uit StoreNode (eigen teelt, dit seizoen): eerste en laatste plukdag, plukdagen, kisten, kg; plus de geregistreerde pluk-manuren in CropNode, kg per manuur, en of er nu een plukklus loopt. Gebruik dit om uren achteraf voor te stellen ("op Spoor is geplukt van 12-9 t/m 20-9; met hoeveel man?").',
    inputSchema: {
      type: 'object',
      properties: {
        perceel: { type: 'string' },
        seizoen: { type: 'string', description: 'Bijv. "2026/27" (standaard huidig).' },
      },
      additionalProperties: false,
    },
  },
];

// ── klussen ─────────────────────────────────────────────────────────────

export async function klussen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const [lijst, schema] = await Promise.all([laadKlussen(ctx.userId), laadWerkschema(ctx.userId)]);
  if (lijst.length === 0) return { tekst: 'Er loopt nu geen enkele klus. Start er een met klus_starten.' };
  const pluk = lijst.some(k => isPluk(k.taak)) ? await laadPluk(ctx) : [];
  const out: string[] = [`${lijst.length} lopende klus(sen):`];
  for (const k of lijst) {
    const dagen = klusDagen(k, schema);
    const totaal = manuren(dagen);
    out.push('', `- ${klusKop(ctx, k)}`, `  manuren tot nu: ${f(totaal, 1)} u over ${dagen.filter(d => d.urenPP > 0).length} werkdagen`);
    const oud = (Date.now() - k.start.getTime()) / 86_400_000;
    if (oud > 21) out.push(`  ⚠️ loopt al ${Math.floor(oud)} dagen — nog bezig, of vergeten te stoppen?`);
    out.push(...dagenTabel(dagen, args.details === true ? 400 : 7));
    if (isPluk(k.taak)) {
      const vanaf = nl(k.start).datum;
      const s = oogstSamenvatting(pluk.filter(p => p.datum >= vanaf && hoortBij(ctx, p.perceelId, k)));
      out.push(s ? `  oogst (StoreNode) sinds start: ${s.kisten} kisten${s.kg ? ` ≈ ${f(s.kg, 0)} kg` : ''} op ${s.dagen} plukdagen (laatst ${dagLabel(s.laatste)})${s.kg && totaal ? ` → ${f(s.kg / totaal, 0)} kg/manuur` : ''}` : '  oogst (StoreNode): nog niets geregistreerd op dit perceel sinds de start');
    }
  }
  return { tekst: out.join('\n') };
}

// ── klus_starten ────────────────────────────────────────────────────────

export async function klusStarten(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const problemen: string[] = [];
  const taken = await taakTypes(ctx.userId);
  const taakNaam = str(args.taak);
  const m = zoek(taakNaam, taken, t => t.name);
  let taak = m.beste && m.zekerheid >= 60 ? m.beste : null;
  const nieuw = !taak && args.nieuwe_taak === true;
  if (!taak && !nieuw) problemen.push(`Taak "${taakNaam}" bestaat niet. Bestaande taken: ${taken.map(t => t.name).join(', ')}. Gebruik er één, of nieuwe_taak=true.`);
  const personen = Math.round(num(args.personen) ?? 0);
  if (personen < 1) problemen.push('Geef het aantal personen.');
  const perceel = perceelKeuze(ctx, str(args.perceel));
  if (perceel.probleem) problemen.push(perceel.probleem);
  const schema = await laadWerkschema(ctx.userId);
  const nu = nl(new Date());
  const datum = dagArg(args.datum, nu.datum);
  if (!datum) problemen.push(`Datum "${str(args.datum)}" begrijp ik niet.`);
  const sched = datum ? schema.get(new Date(`${datum}T12:00:00Z`).getUTCDay()) : undefined;
  const tijd = tijdArg(args.tijd) ?? (datum === nu.datum ? nu.tijd : sched?.start ?? '07:30');
  if (datum && datum > nu.datum) problemen.push('Een klus kan niet in de toekomst starten; start hem op de dag zelf.');
  const lopend = (await laadKlussen(ctx.userId)).find(k => taak && k.taskTypeId === taak.id && k.subParcelId === perceel.subParcelId && k.parcelId === (perceel.subParcelId ? k.parcelId : perceel.parcelId));
  if (lopend) problemen.push(`Er loopt al een klus ${klusKop(ctx, lopend)}. Pas die aan met klus_wijzigen.`);
  const opmerking = str(args.opmerking) || null;
  const naam = perceelNaam(ctx, perceel);
  const voorstel = [
    `Klus starten: ${taak?.name ?? taakNaam}${nieuw ? ' (NIEUW taaktype)' : ''} · ${naam} · ${personen} man`,
    `- vanaf ${datum ? dagLabel(datum) : '?'} ${tijd}`,
    ...(datum && sched?.isWorkday ? [`- per volle werkdag: ${personen} × ${f(schemaUren(schema, datum), 1)} u volgens werkschema`] : []),
    ...(opmerking ? [`- opmerking: ${opmerking}`] : []),
  ];
  if (datum && datum < nu.datum) {
    const proef: Klus = { id: 'nieuw', taskTypeId: '', taak: '', subParcelId: null, parcelId: null, start: vanNl(datum, tijd), personen, notes: null, overrides: [] };
    voorstel.push(`- met terugwerkende kracht: ${f(manuren(klusDagen(proef, schema)), 1)} manuren t/m nu`);
  }
  if (problemen.length) return { tekst: ['Nog niet gestart. Controleer:', ...problemen.map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet gestart):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met bevestig=true.'].join('\n') };

  const admin = getSupabaseAdmin() as any;
  if (nieuw) {
    const { data, error } = await admin.from('task_types').insert({ user_id: ctx.userId, name: taakNaam.charAt(0).toUpperCase() + taakNaam.slice(1) }).select('id, name').single();
    if (error) return { tekst: `Taaktype aanmaken mislukt: ${error.message}`, fout: true };
    taak = data;
  }
  const { data, error } = await admin.from('active_task_sessions').insert({
    user_id: ctx.userId,
    task_type_id: taak!.id,
    sub_parcel_id: perceel.subParcelId,
    parcel_id: perceel.subParcelId ? null : perceel.parcelId,
    start_time: vanNl(datum!, tijd).toISOString(),
    people_count: personen,
    notes: opmerking,
    day_overrides: [],
  }).select('id').single();
  if (error) return { tekst: `Starten mislukt: ${error.message}`, fout: true };
  return { tekst: [`Gestart ✓ (code ${String(data.id).slice(0, 8)})`, ...voorstel].join('\n') };
}

// ── klus_wijzigen ───────────────────────────────────────────────────────

export async function klusWijzigen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const gevonden = await vindKlus(ctx, args);
  if (gevonden.fout) return { tekst: gevonden.fout, fout: true };
  if (!gevonden.klus) return { tekst: ['Welke klus? Geef de code of een zoekterm:', ...gevonden.lijst!.map(k => `- ${klusKop(ctx, k)}`)].join('\n') };
  const k = gevonden.klus;
  const schema = await laadWerkschema(ctx.userId);
  const nu = nl(new Date());
  const problemen: string[] = [];
  const overrides = new Map(k.overrides.map(o => [o.date, { ...o }]));
  let personen = k.personen;
  let start = k.start;
  let notes = k.notes;
  const wijzigingen: string[] = [];
  const st = nl(k.start);

  // (3) start corrigeren
  if (str(args.startdatum) || str(args.starttijd)) {
    const d = dagArg(args.startdatum, st.datum);
    const t = tijdArg(args.starttijd) ?? (str(args.startdatum) ? schema.get(new Date(`${d}T12:00:00Z`).getUTCDay())?.start ?? st.tijd : st.tijd);
    if (!d) problemen.push('Startdatum niet begrepen.');
    else { start = vanNl(d, t); wijzigingen.push(`start → ${dagLabel(d)} ${t}`); }
  }

  // (2) blijvend ander aantal personen vanaf een dag
  if (str(args.personen_vanaf)) {
    const vanaf = dagArg(args.personen_vanaf);
    const nieuw = Math.round(num(args.personen) ?? 0);
    if (!vanaf) problemen.push('personen_vanaf: dag niet begrepen.');
    if (nieuw < 1) problemen.push('Geef het nieuwe aantal personen.');
    if (vanaf && nieuw >= 1) {
      // Dagen vóór 'vanaf' zonder afwijking vastzetten op het oude aantal (met schema-uren)
      for (const d of klusDagen({ ...k, start }, schema, plusDag(vanaf, -1))) {
        if (!overrides.has(d.datum) && d.datum < vanaf) overrides.set(d.datum, { date: d.datum, hoursPerPerson: d.urenPP, peopleCount: d.personen });
      }
      // Afwijkingen vanaf die dag die alleen het oude aantal hadden: aantal bijwerken
      for (const o of overrides.values()) if (o.date >= vanaf && o.peopleCount === k.personen) o.peopleCount = nieuw;
      personen = nieuw;
      wijzigingen.push(`vanaf ${dagLabel(vanaf)}: ${nieuw} man (was ${k.personen})`);
    }
  }

  // (1) afwijking voor dag(en)
  if (str(args.datum)) {
    const van = dagArg(args.datum);
    const tot = str(args.tot_datum) ? dagArg(args.tot_datum) : van;
    if (!van || !tot) problemen.push('Datum niet begrepen.');
    else if (tot < van) problemen.push('tot_datum ligt vóór datum.');
    else if (van < nl(start).datum) problemen.push(`De klus loopt pas vanaf ${dagLabel(nl(start).datum)}; corrigeer eerst de start (startdatum).`);
    else {
      const begin = tijdArg(args.begin);
      const eind = tijdArg(args.eind);
      if (str(args.begin) && !begin) problemen.push('Begintijd niet begrepen.');
      if (str(args.eind) && !eind) problemen.push('Eindtijd niet begrepen.');
      const uren = num(args.uren);
      const p = num(args.personen) != null && !str(args.personen_vanaf) ? Math.round(num(args.personen)!) : null;
      if (args.niet_gewerkt !== true && uren == null && p == null && !begin && !eind) problemen.push('Geef personen, uren, begin/eind of niet_gewerkt=true voor die dag(en).');
      for (let d = van; d <= tot; d = plusDag(d, 1)) {
        if (d > nu.datum) { problemen.push(`${dagLabel(d)} ligt in de toekomst; geef afwijkingen op de dag zelf of achteraf door.`); break; }
        const basisPersonen = overrides.get(d)?.peopleCount ?? personen;
        const vanTijd = begin ?? (d === nl(start).datum ? nl(start).tijd : null);
        const totTijd = eind ?? (d === nu.datum ? nu.tijd : null);
        const urenPP = args.niet_gewerkt === true ? 0 : uren ?? schemaUren(schema, d, vanTijd, totTijd);
        overrides.set(d, { date: d, hoursPerPerson: urenPP, peopleCount: args.niet_gewerkt === true ? 0 : p ?? basisPersonen });
      }
      wijzigingen.push(van === tot ? `afwijking ${dagLabel(van)}` : `afwijking ${dagLabel(van)} t/m ${dagLabel(tot)}`);
    }
  }

  if (typeof args.opmerking === 'string') { notes = str(args.opmerking) || null; wijzigingen.push('opmerking'); }
  if (!wijzigingen.length && !problemen.length) return { tekst: `Gevonden: ${klusKop(ctx, k)}\nGeef aan wat er verandert (datum + personen/uren/begin/eind/niet_gewerkt, personen_vanaf, startdatum/starttijd of opmerking).` };

  const nieuweK: Klus = { ...k, start, personen, notes, overrides: [...overrides.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  const was = klusDagen(k, schema);
  const wordt = klusDagen(nieuweK, schema);
  const gewijzigdeDagen = wordt.filter(d => { const w = was.find(x => x.datum === d.datum); return !w || w.urenPP !== d.urenPP || w.personen !== d.personen; });
  const voorstel = [
    klusKop(ctx, nieuweK),
    ...wijzigingen.map(w => `- ${w}`),
    gewijzigdeDagen.length ? 'Gewijzigde dagen:' : 'Geen dagen met andere uren (tot vandaag).',
    ...gewijzigdeDagen.slice(-14).map(d => { const w = was.find(x => x.datum === d.datum); return `  - ${dagLabel(d.datum)}: ${w ? `${w.personen} × ${f(w.urenPP, 1)}` : '—'} → ${d.personen} × ${f(d.urenPP, 1)} u`; }),
    `Manuren tot nu: ${f(manuren(was), 1)} → ${f(manuren(wordt), 1)} u`,
  ];
  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...[...new Set(problemen)].map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met dezelfde argumenten en bevestig=true.'].join('\n') };
  const { error } = await (getSupabaseAdmin() as any).from('active_task_sessions').update({
    start_time: start.toISOString(), people_count: personen, notes, day_overrides: nieuweK.overrides,
  }).eq('id', k.id).eq('user_id', ctx.userId);
  return error ? { tekst: `Opslaan mislukt: ${error.message}`, fout: true } : { tekst: ['Bijgewerkt ✓', ...voorstel].join('\n') };
}

// ── klus_stoppen ────────────────────────────────────────────────────────

export async function klusStoppen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const gevonden = await vindKlus(ctx, args);
  if (gevonden.fout) return { tekst: gevonden.fout, fout: true };
  if (!gevonden.klus) return { tekst: ['Welke klus? Geef de code of een zoekterm:', ...gevonden.lijst!.map(k => `- ${klusKop(ctx, k)}`)].join('\n') };
  const k = gevonden.klus;
  const admin = getSupabaseAdmin() as any;

  if (args.weggooien === true) {
    if (args.bevestig !== true) return { tekst: `VOORSTEL — klus WEGGOOIEN zonder uren vast te leggen (nog niet gedaan):\n- ${klusKop(ctx, k)}\n\nAlleen bedoeld voor een klus die per ongeluk is gestart of is blijven lopen. Zeker weten? Roep opnieuw aan met weggooien=true en bevestig=true.` };
    const { error } = await admin.from('active_task_sessions').delete().eq('id', k.id).eq('user_id', ctx.userId);
    return error ? { tekst: `Mislukt: ${error.message}`, fout: true } : { tekst: `Weggegooid ✓ ${klusKop(ctx, k)} — er zijn geen uren vastgelegd.` };
  }

  const schema = await laadWerkschema(ctx.userId);
  const nu = nl(new Date());
  const eind = dagArg(args.datum, nu.datum);
  const problemen: string[] = [];
  if (!eind) problemen.push(`Datum "${str(args.datum)}" begrijp ik niet.`);
  else if (eind > nu.datum) problemen.push('De laatste dag kan niet in de toekomst liggen.');
  else if (eind < nl(k.start).datum) problemen.push(`De klus is pas op ${dagLabel(nl(k.start).datum)} gestart.`);
  const eindTijd = tijdArg(args.tijd) ?? (eind === nu.datum ? nu.tijd : null);
  const dagen = eind ? klusDagen(k, schema, eind, eindTijd).filter(d => d.urenPP > 0 && d.personen > 0) : [];
  if (eind && dagen.length === 0) problemen.push('Er zijn geen werkuren in deze periode. Wil je de klus zonder uren weggooien? Gebruik weggooien=true.');
  const totaal = manuren(dagen);

  const voorstel = [klusKop(ctx, k), `- vastleggen t/m ${eind ? dagLabel(eind) : '?'}${eindTijd && eind ? ` ${eindTijd}` : ''}: ${dagen.length} dagen, ${f(totaal, 1)} manuren`, ...dagenTabel(dagen, 40)];
  if (isPluk(k.taak) && eind) {
    const s = oogstSamenvatting((await laadPluk(ctx)).filter(p => p.datum >= nl(k.start).datum && p.datum <= eind && hoortBij(ctx, p.perceelId, k)));
    voorstel.push(s ? `- oogst (StoreNode) in deze periode: ${s.kisten} kisten${s.kg ? ` ≈ ${f(s.kg, 0)} kg` : ''}, plukdagen ${dagLabel(s.eerste)} t/m ${dagLabel(s.laatste)}${s.kg && totaal ? ` → ${f(s.kg / totaal, 0)} kg/manuur` : ''}` : '- oogst (StoreNode): geen pluk geregistreerd op dit perceel in deze periode');
  }
  if ((Date.now() - k.start.getTime()) / 86_400_000 > 21) voorstel.push(`⚠️ Deze klus loopt al sinds ${dagLabel(nl(k.start).datum)}. Klopt die periode echt? Anders: datum = de echte laatste dag, of weggooien=true.`);
  if (problemen.length) return { tekst: ['Nog niet gestopt. Controleer:', ...problemen.map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet gestopt):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met bevestig=true.'].join('\n') };

  const rows = dagen.map(d => ({
    user_id: ctx.userId,
    start_date: d.datum,
    end_date: d.datum,
    days: 1,
    sub_parcel_id: k.subParcelId,
    parcel_id: k.parcelId,
    task_type_id: k.taskTypeId,
    people_count: d.personen,
    hours_per_person: d.urenPP,
    notes: k.notes,
  }));
  const { error } = await admin.from('task_logs').insert(rows);
  if (error) return { tekst: `Vastleggen mislukt: ${error.message}`, fout: true };
  const { error: delError } = await admin.from('active_task_sessions').delete().eq('id', k.id).eq('user_id', ctx.userId);
  if (delError) return { tekst: `Uren zijn vastgelegd, maar de klus kon niet worden gestopt: ${delError.message}. Stop hem in de app (anders tellen de uren dubbel).`, fout: true };
  return { tekst: ['Gestopt ✓ — uren vastgelegd in de urenregistratie.', ...voorstel].join('\n') };
}

// ── werkschema ──────────────────────────────────────────────────────────

function schemaRegel(dow: number, s: SchemaDag): string {
  if (!s.isWorkday || !s.start || !s.end) return `- ${DAGEN[dow]}: vrij`;
  const netto = Math.round(calcNettoHoursWithBreaks(s.start, s.end, s.breaks, true) * 100) / 100;
  return `- ${DAGEN[dow]}: ${s.start}–${s.end}${s.breaks.length ? `, pauzes ${s.breaks.map(b => `${b.start}–${b.end}`).join(', ')}` : ''} → ${f(netto, 2)} u netto`;
}

export async function werkschema(ctx: McpContext): Promise<ToolResultaat> {
  const s = await laadWerkschema(ctx.userId);
  return { tekst: ['Werkschema:', ...[1, 2, 3, 4, 5, 6, 0].map(d => schemaRegel(d, s.get(d)!))].join('\n') };
}

export async function werkschemaWijzigen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const problemen: string[] = [];
  const dagen = new Set<number>();
  for (const x of (Array.isArray(args.dagen) ? args.dagen : []).map(v => str(v).toLowerCase())) {
    if (x === 'werkdagen' || x === 'ma-vr' || x === 'doordeweeks') [1, 2, 3, 4, 5].forEach(d => dagen.add(d));
    else if (x === 'alle' || x === 'ma-za') [1, 2, 3, 4, 5, 6].forEach(d => dagen.add(d));
    else if (x in DAGNAMEN) dagen.add(DAGNAMEN[x]);
    else problemen.push(`Dag "${x}" begrijp ik niet (ma, di, wo, do, vr, za, zo, werkdagen, alle).`);
  }
  if (!dagen.size) problemen.push('Geef de dagen.');
  const begin = tijdArg(args.begin);
  const eind = tijdArg(args.eind);
  if (str(args.begin) && !begin) problemen.push('Begintijd niet begrepen.');
  if (str(args.eind) && !eind) problemen.push('Eindtijd niet begrepen.');
  const pauzes: BreakPeriod[] | null = Array.isArray(args.pauzes)
    ? (args.pauzes as Args[]).map(p => ({ start: tijdArg(p.start) ?? '', end: tijdArg(p.eind) ?? '' }))
    : null;
  if (pauzes?.some(p => !p.start || !p.end || p.end <= p.start)) problemen.push('Pauzes moeten een geldige start en eind hebben, bijv. {"start":"12:00","eind":"12:30"}.');
  if (!begin && !eind && !pauzes && typeof args.werkdag !== 'boolean') problemen.push('Geef begin, eind, pauzes of werkdag.');

  const huidig = await laadWerkschema(ctx.userId);
  const nieuw = new Map(huidig);
  for (const d of dagen) {
    const s = { ...huidig.get(d)! };
    if (typeof args.werkdag === 'boolean') s.isWorkday = args.werkdag;
    if (begin) s.start = begin;
    if (eind) s.end = eind;
    if (pauzes) s.breaks = pauzes;
    if (s.isWorkday && (!s.start || !s.end)) problemen.push(`${DAGEN[d]}: geef ook begin en eind.`);
    if (s.isWorkday && s.start && s.end && s.end <= s.start) problemen.push(`${DAGEN[d]}: eind ligt vóór begin.`);
    nieuw.set(d, s);
  }
  const voorstel = ['WAS:', ...[...dagen].sort().map(d => schemaRegel(d, huidig.get(d)!)), 'WORDT:', ...[...dagen].sort().map(d => schemaRegel(d, nieuw.get(d)!)), '', 'Let op: lopende klussen rekenen ook hun eerdere dagen opnieuw met het nieuwe schema, behalve dagen met een afwijking.'];
  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...[...new Set(problemen)].map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met bevestig=true.'].join('\n') };

  const admin = getSupabaseAdmin() as any;
  for (const d of dagen) {
    const s = nieuw.get(d)!;
    const row = {
      user_id: ctx.userId, day_of_week: d, is_workday: s.isWorkday,
      start_time: s.isWorkday ? s.start : null, end_time: s.isWorkday ? s.end : null,
      breaks: s.isWorkday ? s.breaks : [], break_minutes: 0, updated_at: new Date().toISOString(),
    };
    const { data: bestaand } = await admin.from('work_schedules').select('id').eq('user_id', ctx.userId).eq('day_of_week', d).maybeSingle();
    const { error } = bestaand ? await admin.from('work_schedules').update(row).eq('id', bestaand.id) : await admin.from('work_schedules').insert(row);
    if (error) return { tekst: `Opslaan mislukt (${DAGEN[d]}): ${error.message}`, fout: true };
  }
  return { tekst: ['Werkschema bijgewerkt ✓', ...[...dagen].sort().map(d => schemaRegel(d, nieuw.get(d)!))].join('\n') };
}

// ── oogst_voortgang ─────────────────────────────────────────────────────

export async function oogstVoortgang(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const seizoen = str(args.seizoen) || huidigSeizoen();
  const pluk = await laadPluk(ctx, seizoen);
  if (!pluk.length) return { tekst: `Geen pluk (eigen teelt) gevonden in StoreNode voor seizoen ${seizoen}.` };
  let filter: { subParcelId: string | null; parcelId: string | null } | null = null;
  if (str(args.perceel)) {
    const p = perceelKeuze(ctx, str(args.perceel));
    if (p.probleem) return { tekst: p.probleem, fout: true };
    filter = p;
  }
  const seizoenStart = `${seizoen.slice(0, 4)}-07-01`;
  const { data: uren } = await (getSupabaseAdmin() as any)
    .from('v_storenode_uren')
    .select('datum, parcel_id, sub_parcel_id, taak, uren, lopend')
    .eq('user_id', ctx.userId)
    .gte('datum', seizoenStart);
  const plukUren = (uren || []).filter((u: any) => isPluk(u.taak));
  const lopende = (await laadKlussen(ctx.userId)).filter(k => isPluk(k.taak));

  // Groepeer per partij-perceel (zoals StoreNode: meestal blok = ras)
  const groepen = new Map<string, Pluk[]>();
  for (const p of pluk) {
    if (filter && !hoortBij(ctx, p.perceelId, filter)) continue;
    groepen.set(p.perceelId, [...(groepen.get(p.perceelId) || []), p]);
  }
  const out: string[] = [`Oogst ${seizoen} (eigen teelt, uit StoreNode) — per perceel:`];
  const regels = [...groepen.entries()].map(([perceelId, ps]) => ({ perceelId, ps, s: oogstSamenvatting(ps)! })).sort((a, b) => a.s.eerste.localeCompare(b.s.eerste));
  const vandaag = nl(new Date()).datum;
  for (const { perceelId, ps, s } of regels) {
    const blok = ctx.parcels.find(x => x.id === perceelId);
    const sel = blok ? { subParcelId: blok.id, parcelId: null } : { subParcelId: null, parcelId: perceelId };
    const manuren = plukUren
      .filter((u: any) => (sel.subParcelId ? u.sub_parcel_id === sel.subParcelId || (!u.sub_parcel_id && u.parcel_id === blok?.parcelId) : u.parcel_id === perceelId))
      .filter((u: any) => String(u.datum).slice(0, 10) >= s.eerste && String(u.datum).slice(0, 10) <= s.laatste)
      .reduce((a: number, u: any) => a + Number(u.uren || 0), 0);
    const klus = lopende.find(k => hoortBij(ctx, perceelId, k));
    const status = klus ? `🟢 plukklus loopt (${klus.personen} man, code ${klus.id.slice(0, 8)})` : s.laatste >= plusDag(vandaag, -2) ? 'recent geplukt' : `laatste pluk ${dagLabel(s.laatste)}`;
    out.push(`- ${ps[0].perceelNaam}${ps[0].ras && !normaliseer(ps[0].perceelNaam).includes(normaliseer(ps[0].ras)) ? ` · ${ps[0].ras}` : ''}: ${dagLabel(s.eerste)} t/m ${dagLabel(s.laatste)} (${s.dagen} plukdagen) · ${s.kisten} kisten${s.kg ? ` ≈ ${f(s.kg, 0)} kg` : ''}${s.kgOnbekend ? ' (deels onbekend kg)' : ''}`);
    out.push(`    ${status} · pluk-manuren in die periode: ${manuren ? `${f(manuren, 1)} u${s.kg ? ` → ${f(s.kg / manuren, 0)} kg/manuur` : ''}` : 'nog geen uren geregistreerd'}`);
  }
  out.push('', 'Uren achteraf vastleggen: uren_registreren met taak "plukken", perceel, datum/tot_datum en personen (uren weglaten = volgens werkschema), of een klus starten met terugwerkende kracht.');
  return { tekst: out.join('\n') };
}

