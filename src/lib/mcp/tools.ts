/**
 * CropNode MCP tools. Lezen: percelen, spuitschrift, historie, middelen, voorraad,
 * weer, notities, spuit-inbox. Schrijven: voorstel-en-bevestig (eerst VOORSTEL,
 * pas opslaan met bevestig=true) — zelfde werkwijze als de StoreNode-MCP.
 * Alles draait met een expliciete userId op de admin-client (geen cookies).
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { runRegistrationPipeline, invalidateContextCache, type AnalysisResult } from '@/lib/registration-pipeline';
import { confirmRegistration, mirrorRegistrationToFieldNotes } from '@/lib/registration-service';
import { addParcelHistoryEntries, getLastUsedDosagesForUser, getUserProductNames } from '@/lib/supabase-store';
import type { SprayableParcel } from '@/lib/supabase-store';
import { applyUserPreferencesToText, enrichUnit, getUserPreferencesAdmin } from '@/lib/whatsapp/spray-inbox';
import { buildForecastText } from '@/lib/whatsapp/weather-query-handler';
import { buildLiveSnapshotText } from '@/lib/whatsapp/live-snapshot-handler';
import { buildProductInfoText, buildOrganismText } from '@/lib/whatsapp/product-query-handler';
import { getStockForUser } from '@/lib/inventory-stock';
import {
  approveSprayDraftForUser,
  deleteSprayDraftForUser,
  getSprayInboxEntriesForUser,
  type SprayDraftEdit,
} from '@/lib/spray-inbox-approve';
import { laadContext, type McpContext } from './context';
import type { LogbookEntry, ProductEntry, RegistrationType, SprayReviewAssumption } from '@/lib/types';

export interface ToolDefinitie {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResultaat {
  tekst: string;
  fout?: boolean;
}

type Args = Record<string, unknown>;

// ── Fuzzy zoeken (zelfde als StoreNode) ─────────────────────────────────

function normaliseer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(zoek: string, kandidaat: string): number {
  const z = normaliseer(zoek);
  const k = normaliseer(kandidaat);
  if (!z || !k) return 0;
  if (z === k) return 100;
  if (k.startsWith(z) || z.startsWith(k)) return 85;
  if (k.includes(z) || z.includes(k)) return 70;
  const zw = z.split(' ');
  const kw = k.split(' ');
  const gedeeld = zw.filter(w => kw.some(x => x.startsWith(w) || w.startsWith(x))).length;
  if (gedeeld === 0) return 0;
  return Math.round((gedeeld / Math.max(zw.length, kw.length)) * 60);
}

interface Match<T> {
  beste: T | null;
  zekerheid: number;
  alternatieven: T[];
}

function zoek<T>(zoekterm: string, lijst: T[], naam: (x: T) => string): Match<T> {
  const gescoord = lijst
    .map(x => ({ x, s: score(zoekterm, naam(x)) }))
    .filter(m => m.s > 0)
    .sort((a, b) => b.s - a.s);
  if (gescoord.length === 0) return { beste: null, zekerheid: 0, alternatieven: [] };
  const top = gescoord[0];
  const twijfel = gescoord.filter(m => m.s >= top.s - 10 && m.x !== top.x).map(m => m.x);
  return { beste: top.x, zekerheid: top.s, alternatieven: twijfel.slice(0, 4) };
}

/** All parcels matching a (sloppy) name: exact/prefix hits, else the top fuzzy hit. */
function percelenVanNaam(ctx: McpContext, naam: string): SprayableParcel[] {
  const n = normaliseer(naam);
  if (!n) return [];
  const groep = ctx.groups.find(g => normaliseer(g.name) === n);
  if (groep) return ctx.parcels.filter(p => groep.subParcelIds.includes(p.id));
  // Exact main-parcel name ("jachthoek") → all its blocks; otherwise strong matches on the block name.
  const hoofd = ctx.parcels.filter(p => normaliseer((p as any).parcelName || '') === n);
  if (hoofd.length) return hoofd;
  const sterk = ctx.parcels.filter(p => score(naam, p.name) >= 85);
  if (sterk.length) return sterk;
  const m = zoek(naam, ctx.parcels, p => p.name);
  return m.beste && m.zekerheid >= 60 ? [m.beste, ...m.alternatieven.filter(a => score(naam, a.name) === m.zekerheid)] : [];
}

// ── Tekst-hulpjes ────────────────────────────────────────────────────────

const str = (v: unknown, standaard = '') => (typeof v === 'string' ? v.trim() : standaard);
const num = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : null;
const f = (n: number, d = 1) => n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: d });

function datumArg(v: unknown, fallback = new Date()): Date {
  const s = str(v).toLowerCase();
  if (!s || s === 'vandaag') return fallback;
  if (s === 'gisteren') return new Date(Date.now() - 86_400_000);
  if (s === 'eergisteren') return new Date(Date.now() - 2 * 86_400_000);
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  m = /^(\d{1,2})-(\d{1,2})(?:-(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) return new Date(m[3] ? +m[3] : new Date().getFullYear(), +m[2] - 1, +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

const dd = (d: Date) => d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
const ddt = (d: Date) => d.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dagenGeleden = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

function perceelLabel(p: SprayableParcel): string {
  return `${p.name}${p.area ? ` (${f(p.area, 2)} ha)` : ''}`;
}

function perceelNamen(ctx: McpContext, ids: string[]): { tekst: string; ha: number } {
  const ps = ids.map(id => ctx.parcels.find(p => p.id === id)).filter(Boolean) as SprayableParcel[];
  const ha = ps.reduce((s, p) => s + (p.area || 0), 0);
  const namen = ps.map(p => p.name);
  const onbekend = ids.length - ps.length;
  return { tekst: `${namen.join(', ')}${onbekend ? ` (+${onbekend} onbekend)` : ''}${ha ? ` · ${f(ha, 2)} ha` : ''}`, ha };
}

function middelRegel(p: ProductEntry, ha: number): string {
  const eenheid = (p.unit || 'L').replace('/ha', '');
  const totaal = ha > 0 && p.dosage > 0 ? ` (${f(p.dosage * ha, 2)} ${eenheid} totaal)` : '';
  const bron = p.source === 'fertilizer' ? ' [meststof]' : '';
  return `${p.product}${bron} ${p.dosage > 0 ? `${f(p.dosage, 3)} ${eenheid}/ha${totaal}` : '— dosering ontbreekt'}`;
}


/** Pipeline flags can be one multi-line message; split into lines. */
function splitFlag(message: string): string[] {
  return message.split('\n').map(l => l.trim()).filter(Boolean);
}

/** Collapse per-parcel "Eerste toepassing van X" lines into one line per product; cap the rest. */
function compactWarnings(messages: string[]): string[] {
  const lines = messages.flatMap(splitFlag).filter(l => l.startsWith('⚠️'));
  const eerste = new Map<string, { n: number; interval: string }>();
  const overig: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(/^⚠️\s*/, '');
    const m = /^(.+?): Eerste toepassing van (.+?) op dit perceel\. Minimaal (\d+) dagen/.exec(l);
    if (m) {
      const cur = eerste.get(m[2]) || { n: 0, interval: m[3] };
      cur.n += 1;
      eerste.set(m[2], cur);
    } else if (!overig.includes(l)) {
      overig.push(l);
    }
  }
  const out = [...eerste.entries()].map(([product, v]) => `${product}: eerste toepassing dit seizoen op ${v.n} ${v.n === 1 ? 'perceel' : 'percelen'} (min. ${v.interval} dagen interval)`);
  out.push(...overig.slice(0, 10));
  if (overig.length > 10) out.push(`… en ${overig.length - 10} andere waarschuwingen`);
  return out;
}

// ── Tools ────────────────────────────────────────────────────────────────

const DATUM_DESC = '"vandaag" (standaard), "gisteren" of YYYY-MM-DD, optioneel met tijd (bijv. "2026-09-22 07:30").';

export const TOOLS: ToolDefinitie[] = [
  {
    name: 'percelen',
    description:
      'Alle spuitbare percelen (blokken) van de teler: naam, gewas, ras, hectares, hoofdperceel en perceelgroepen. Gebruik dit om slordige perceelnamen van de gebruiker te herkennen vóór je registreert.',
    inputSchema: { type: 'object', properties: { gewas: { type: 'string', description: 'Alleen dit gewas, bijv. "appel" of "peer".' } }, additionalProperties: false },
  },
  {
    name: 'percelen_status',
    description:
      'Per perceel de laatste bespuiting/bemesting: datum, middelen, dagen geleden. Beantwoordt "welke percelen heb ik (nog niet) gedaan" — optioneel voor één middel en binnen een venster van N dagen.',
    inputSchema: {
      type: 'object',
      properties: {
        middel: { type: 'string', description: 'Alleen toepassingen met dit middel (merknaam of werkzame stof, slordig mag).' },
        dagen: { type: 'number', description: 'Venster in dagen (standaard 21): percelen zonder toepassing in dit venster worden als "nog niet gedaan" gemarkeerd.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'bespuitingen',
    description:
      'Registraties uit het spuitschrift (bespuitingen én bemesting) van een dag of periode, met percelen, middelen en doseringen. Nieuwste eerst, max 50.',
    inputSchema: {
      type: 'object',
      properties: {
        datum: { type: 'string', description: `Einddatum: ${DATUM_DESC}` },
        dagen: { type: 'number', description: 'Aantal dagen terug vanaf datum (standaard 14).' },
        perceel: { type: 'string', description: 'Alleen registraties op dit perceel (slordige naam mag).' },
        middel: { type: 'string', description: 'Alleen registraties met dit middel.' },
        type: { type: 'string', enum: ['alles', 'spuiten', 'strooien'], description: 'Standaard alles.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'middel_info',
    description: 'CTGB-/meststofinformatie over één middel: werkzame stof, dosering per gewas, doelorganismen, interval, veiligheidstermijn, max. toepassingen.',
    inputSchema: {
      type: 'object',
      properties: { naam: { type: 'string' }, gewas: { type: 'string', description: '"appel" of "peer" (standaard beide).' } },
      required: ['naam'],
      additionalProperties: false,
    },
  },
  {
    name: 'middelen_tegen',
    description: 'Welke middelen zijn toegelaten tegen een ziekte of plaag (bijv. schurft, meeldauw, luis) op appel of peer.',
    inputSchema: {
      type: 'object',
      properties: { ziekte: { type: 'string' }, gewas: { type: 'string', description: '"appel" (standaard) of "peer".' } },
      required: ['ziekte'],
      additionalProperties: false,
    },
  },
  {
    name: 'voorraad',
    description: 'Huidige voorraad per middel/meststof (saldo van alle voorraadmutaties), optioneel gefilterd op naam.',
    inputSchema: { type: 'object', properties: { middel: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'weer',
    description: 'Weersverwachting voor het weerstation bij de percelen: samenvatting plus per dag min/max temperatuur, neerslag en wind. Standaard 7 dagen, max 14.',
    inputSchema: { type: 'object', properties: { dagen: { type: 'number' } }, additionalProperties: false },
  },
  {
    name: 'nu',
    description: 'Live metingen van de eigen weerstations/sensoren (temperatuur, RV, regen vandaag/gisteren, bodemvocht/EC, bladnat, Delta-T spuitindicatie).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'veldnotities',
    description: 'Recente veldnotities (observaties, herinneringen, notities uit WhatsApp/app/Claude), nieuwste eerst.',
    inputSchema: {
      type: 'object',
      properties: {
        dagen: { type: 'number', description: 'Standaard 14.' },
        status: { type: 'string', enum: ['alles', 'open', 'done', 'transferred'], description: 'Standaard alles.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'veldnotitie',
    description: 'Slaat een veldnotitie op (observatie, herinnering, opmerking), optioneel gekoppeld aan percelen. Slaat direct op — geen bevestiging nodig.',
    inputSchema: {
      type: 'object',
      properties: {
        tekst: { type: 'string' },
        percelen: { type: 'array', items: { type: 'string' }, description: 'Perceelnamen zoals de gebruiker ze noemt.' },
        datum: { type: 'string', description: DATUM_DESC },
      },
      required: ['tekst'],
      additionalProperties: false,
    },
  },
  {
    name: 'spuit_inbox',
    description:
      'Openstaande spuitconcepten die via WhatsApp zijn binnengekomen (nog niet goedgekeurd): de ruwe notitie, de interpretatie (percelen, middelen, doseringen), aannames en onzekere velden. Goedkeuren kan met keur_concept_goed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'keur_concept_goed',
    description:
      'Keurt een spuitconcept uit spuit_inbox goed en zet het in het spuitschrift, optioneel met correcties. Roep EERST aan zonder bevestig: je krijgt een voorstel; na een expliciet "ja" van de gebruiker opnieuw aanroepen met bevestig=true en dezelfde gegevens.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Concept-id (of de eerste 8 tekens) uit spuit_inbox.' },
        datum: { type: 'string', description: `Correctie: ${DATUM_DESC}` },
        percelen: { type: 'array', items: { type: 'string' }, description: 'Correctie: vervangt de percelen (namen).' },
        middelen: {
          type: 'array',
          items: {
            type: 'object',
            properties: { naam: { type: 'string' }, dosering: { type: 'number', description: 'Per hectare.' }, eenheid: { type: 'string', description: '"L" of "kg".' } },
            required: ['naam'],
          },
          description: 'Correctie: vervangt de middelenlijst.',
        },
        bevestig: { type: 'boolean', description: 'true = echt opslaan.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'verwijder_concept',
    description: 'Verwijdert een spuitconcept uit de inbox zonder te registreren.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'registreer_bespuiting',
    description:
      'Registreert een bespuiting of bemesting in het spuitschrift. Geef de registratie als gewone zin met percelen, middelen en doseringen (bijv. "busje en jachthoek oude met merpan 1,5 kg, soriale 0,5 en 25 kg totaal zwavel"). Dosering is per hectare tenzij er "totaal" bij staat. Roep EERST aan zonder bevestig: je krijgt een VOORSTEL met herkende percelen, middelen, doseringen en waarschuwingen; leg dat aan de gebruiker voor en roep na een expliciet "ja" opnieuw aan met bevestig=true en exact dezelfde tekst.',
    inputSchema: {
      type: 'object',
      properties: {
        tekst: { type: 'string', description: 'Percelen + middelen + doseringen in gewone woorden. Gebruik bij twijfel de exacte perceelnamen uit de tool percelen.' },
        datum: { type: 'string', description: DATUM_DESC },
        bevestig: { type: 'boolean', description: 'true = echt opslaan.' },
      },
      required: ['tekst'],
      additionalProperties: false,
    },
  },
];

// ── Uitvoering ───────────────────────────────────────────────────────────

export async function voerToolUit(userId: string, naam: string, args: Args): Promise<ToolResultaat> {
  switch (naam) {
    case 'percelen': return percelen(await laadContext(userId), args);
    case 'percelen_status': return percelenStatus(await laadContext(userId), args);
    case 'bespuitingen': return bespuitingen(await laadContext(userId), args);
    case 'middel_info': return { tekst: await buildProductInfoText(str(args.naam), str(args.gewas) || undefined) };
    case 'middelen_tegen': return { tekst: await buildOrganismText(str(args.ziekte), str(args.gewas) || undefined) };
    case 'voorraad': return voorraad(userId, args);
    case 'weer': {
      const r = await buildForecastText(userId, num(args.dagen) ?? 7);
      return { tekst: r.text, fout: !r.ok };
    }
    case 'nu': {
      const t = await buildLiveSnapshotText(userId);
      return t ? { tekst: t } : { tekst: 'Geen fysieke weerstations gekoppeld. Gebruik de tool weer voor de verwachting.' };
    }
    case 'veldnotities': return veldnotities(await laadContext(userId), args);
    case 'veldnotitie': return veldnotitie(await laadContext(userId), args);
    case 'spuit_inbox': return spuitInbox(await laadContext(userId));
    case 'keur_concept_goed': return keurConceptGoed(await laadContext(userId), args);
    case 'verwijder_concept': return verwijderConcept(userId, args);
    case 'registreer_bespuiting': return registreerBespuiting(await laadContext(userId), args);
    default:
      return { tekst: `Onbekende tool: ${naam}`, fout: true };
  }
}

// ── Lezen ────────────────────────────────────────────────────────────────

function percelen(ctx: McpContext, args: Args): ToolResultaat {
  const gewas = normaliseer(str(args.gewas));
  const lijst = ctx.parcels.filter(p => !gewas || normaliseer(p.crop || '').includes(gewas));
  if (lijst.length === 0) return { tekst: gewas ? `Geen percelen met gewas "${str(args.gewas)}".` : 'Geen spuitbare percelen gevonden. Voeg percelen toe in CropNode.' };
  const perHoofd = new Map<string, SprayableParcel[]>();
  for (const p of lijst) {
    const k = (p as any).parcelName || p.name;
    perHoofd.set(k, [...(perHoofd.get(k) || []), p]);
  }
  const regels: string[] = [];
  for (const [hoofd, ps] of [...perHoofd.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl'))) {
    regels.push(`${hoofd}${ps.length > 1 ? ` (${ps.length} blokken)` : ''}`);
    for (const p of ps) regels.push(`  - ${p.name} · ${p.crop || '?'}${p.variety ? ` ${p.variety}` : ''} · ${p.area ? `${f(p.area, 2)} ha` : 'ha onbekend'}`);
  }
  const totaal = lijst.reduce((s, p) => s + (p.area || 0), 0);
  regels.push('', `Totaal ${lijst.length} percelen · ${f(totaal, 2)} ha`);
  if (ctx.groups.length) regels.push('', 'Groepen: ' + ctx.groups.map(g => `${g.name} (${g.subParcelIds.length})`).join(', '));
  return { tekst: regels.join('\n') };
}

async function percelenStatus(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const middel = str(args.middel);
  const venster = Math.max(1, Math.round(num(args.dagen) ?? 21));
  const terug = Math.max(venster * 2, 120);
  const sinds = new Date(Date.now() - terug * 86_400_000).toISOString();
  // Spuitschrift is the source of truth (parcel_history can lag or be empty for older imports).
  const { data, error } = await getSupabaseAdmin()
    .from('spuitschrift')
    .select('date, plots, products, registration_type')
    .eq('user_id', ctx.userId)
    .gte('date', sinds)
    .order('date', { ascending: false })
    .limit(500);
  if (error) return { tekst: `Spuitschrift ophalen mislukt: ${error.message}`, fout: true };

  const m = normaliseer(middel);
  type Laatste = { datum: Date; middelen: string[] };
  const laatstePerPerceel = new Map<string, Laatste>();
  for (const r of data || []) {
    const products = ((r.products as ProductEntry[]) || []).filter(p => !m || normaliseer(p.product).includes(m) || m.includes(normaliseer(p.product)));
    if (products.length === 0) continue;
    const d = new Date(r.date);
    const regels = products.map(p => `${p.product}${p.dosage ? ` ${f(p.dosage, 3)} ${(p.unit || 'L').replace('/ha', '')}/ha` : ''}`);
    for (const pid of (r.plots as string[]) || []) {
      const cur = laatstePerPerceel.get(pid);
      if (!cur) laatstePerPerceel.set(pid, { datum: d, middelen: [...regels] });
      else if (Math.abs(cur.datum.getTime() - d.getTime()) < 12 * 3600_000) for (const x of regels) if (!cur.middelen.includes(x)) cur.middelen.push(x);
    }
  }

  const nietGedaan: string[] = [];
  const welGedaan: string[] = [];
  for (const p of [...ctx.parcels].sort((a, b) => a.name.localeCompare(b.name, 'nl'))) {
    const l = laatstePerPerceel.get(p.id);
    if (!l) { nietGedaan.push(`- ${perceelLabel(p)} — nooit${m ? ` met ${middel}` : ''} (in de laatste ${terug} dagen)`); continue; }
    const geleden = dagenGeleden(l.datum);
    const regel = `- ${perceelLabel(p)} — ${dd(l.datum)} (${geleden} dagen geleden): ${l.middelen.join(', ')}`;
    (geleden > venster ? nietGedaan : welGedaan).push(regel);
  }
  const kop = `Laatste toepassing per perceel${m ? ` met "${middel}"` : ''} · venster ${venster} dagen`;
  return {
    tekst: [
      kop,
      '',
      `NOG NIET GEDAAN (laatste > ${venster} dagen of nooit): ${nietGedaan.length}`,
      ...(nietGedaan.length ? nietGedaan : ['- geen']),
      '',
      `GEDAAN binnen ${venster} dagen: ${welGedaan.length}`,
      ...(welGedaan.length ? welGedaan : ['- geen']),
    ].join('\n'),
  };
}

async function bespuitingen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const tot = datumArg(args.datum);
  tot.setHours(23, 59, 59, 999);
  const dagen = Math.max(1, Math.round(num(args.dagen) ?? 14));
  const van = new Date(tot.getTime() - dagen * 86_400_000);
  van.setHours(0, 0, 0, 0);
  const type = str(args.type) || 'alles';

  let q = getSupabaseAdmin()
    .from('spuitschrift')
    .select('id, date, plots, products, registration_type, registration_source, status, validation_message')
    .eq('user_id', ctx.userId)
    .gte('date', van.toISOString())
    .lte('date', tot.toISOString())
    .order('date', { ascending: false })
    .limit(200);
  if (type === 'spuiten') q = q.eq('registration_type', 'spraying');
  if (type === 'strooien') q = q.eq('registration_type', 'spreading');
  const { data, error } = await q;
  if (error) return { tekst: `Spuitschrift ophalen mislukt: ${error.message}`, fout: true };

  const perceelIds = str(args.perceel) ? new Set(percelenVanNaam(ctx, str(args.perceel)).map(p => p.id)) : null;
  const middel = normaliseer(str(args.middel));
  const rows = (data || []).filter(r => {
    const plots: string[] = r.plots || [];
    const products: ProductEntry[] = r.products || [];
    if (perceelIds && !plots.some(id => perceelIds.has(id))) return false;
    if (middel && !products.some(p => normaliseer(p.product).includes(middel))) return false;
    return true;
  }).slice(0, 50);

  if (perceelIds && perceelIds.size === 0) return { tekst: `Perceel "${str(args.perceel)}" niet gevonden. Bekende percelen: ${ctx.parcels.map(p => p.name).join(', ')}.` };
  if (rows.length === 0) return { tekst: `Geen registraties tussen ${dd(van)} en ${dd(tot)}${str(args.perceel) ? ` op ${str(args.perceel)}` : ''}${middel ? ` met ${str(args.middel)}` : ''}.` };

  const regels = rows.map(r => {
    const { tekst, ha } = perceelNamen(ctx, r.plots || []);
    const mids = (r.products as ProductEntry[]).map(p => middelRegel(p, ha)).join('; ');
    const verb = r.registration_type === 'spreading' ? 'Gestrooid' : 'Gespoten';
    const bron = r.registration_source && r.registration_source !== 'web' ? ` · via ${r.registration_source}` : '';
    const waarschuwing = r.status === 'Waarschuwing' ? ' · ⚠️ met waarschuwing' : '';
    return `- ${ddt(new Date(r.date))} · ${verb} op ${tekst}\n    ${mids}${bron}${waarschuwing}`;
  });
  return { tekst: [`${rows.length} registratie(s) ${dd(van)} t/m ${dd(tot)}:`, ...regels].join('\n') };
}

async function voorraad(userId: string, args: Args): Promise<ToolResultaat> {
  const stock = await getStockForUser(userId);
  const filter = normaliseer(str(args.middel));
  const lijst = stock.filter(s => !filter || normaliseer(s.productName).includes(filter) || filter.includes(normaliseer(s.productName)));
  if (lijst.length === 0) return { tekst: filter ? `Geen voorraad gevonden voor "${str(args.middel)}".` : 'Nog geen voorraadmutaties geregistreerd.' };
  return {
    tekst: lijst
      .map(s => `- ${s.productName}: ${f(s.stock, 2)} ${s.unit}${s.stock <= 0 ? ' (op)' : ''}${s.lastMovement ? ` · laatste mutatie ${dd(s.lastMovement)}` : ''}`)
      .join('\n'),
  };
}

async function veldnotities(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const dagen = Math.max(1, Math.round(num(args.dagen) ?? 14));
  const status = str(args.status) || 'alles';
  let q = getSupabaseAdmin()
    .from('field_notes')
    .select('id, content, status, auto_tag, parcel_ids, source, created_at, due_date')
    .eq('user_id', ctx.userId)
    .gte('created_at', new Date(Date.now() - dagen * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30);
  if (status !== 'alles') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return { tekst: `Notities ophalen mislukt: ${error.message}`, fout: true };
  if (!data?.length) return { tekst: `Geen veldnotities in de laatste ${dagen} dagen.` };
  return {
    tekst: data
      .map(n => {
        const namen = ((n.parcel_ids as string[] | null) || []).map(id => ctx.parcels.find(p => p.id === id)?.name || '?');
        const meta = [n.status !== 'open' ? n.status : null, n.auto_tag, n.source, namen.length ? namen.join(', ') : null, n.due_date ? `herinnering ${dd(new Date(n.due_date))}` : null].filter(Boolean).join(' · ');
        return `- ${ddt(new Date(n.created_at))}: ${n.content}${meta ? `\n    (${meta})` : ''}`;
      })
      .join('\n'),
  };
}

// ── Schrijven ────────────────────────────────────────────────────────────

async function veldnotitie(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const tekst = str(args.tekst);
  if (!tekst) return { tekst: 'Geen tekst.', fout: true };
  const namen = Array.isArray(args.percelen) ? (args.percelen as unknown[]).map(x => str(x)).filter(Boolean) : [];
  const gevonden: SprayableParcel[] = [];
  const nietGevonden: string[] = [];
  for (const n of namen) {
    const ps = percelenVanNaam(ctx, n);
    if (ps.length) gevonden.push(...ps.filter(p => !gevonden.includes(p)));
    else nietGevonden.push(n);
  }
  const datum = str(args.datum) ? datumArg(args.datum) : new Date();
  const { error } = await (getSupabaseAdmin() as any).from('field_notes').insert({
    user_id: ctx.userId,
    content: tekst,
    source: 'claude',
    status: 'open',
    is_pinned: false,
    parcel_ids: gevonden.length ? gevonden.map(p => p.id) : null,
    created_at: datum.toISOString(),
  });
  if (error) return { tekst: `Opslaan mislukt: ${error.message}`, fout: true };
  return {
    tekst: `Genoteerd ✓${gevonden.length ? ` bij ${gevonden.map(p => p.name).join(', ')}` : ''}${nietGevonden.length ? ` (perceel niet gevonden: ${nietGevonden.join(', ')})` : ''}`,
  };
}

function conceptTekst(ctx: McpContext, e: LogbookEntry, index: number): string {
  const plots = e.parsedData?.plots || [];
  const products = e.parsedData?.products || [];
  const { tekst: pTekst, ha } = perceelNamen(ctx, plots);
  const meta = e.reviewMeta || {};
  const regels = [
    `${index}. [${e.id.slice(0, 8)}] ${ddt(e.createdAt)} · status ${e.status}`,
    `   Notitie: "${e.rawInput}"`,
    `   Datum: ${ddt(e.date)} · ${e.registrationType === 'spreading' ? 'strooien' : 'spuiten'}`,
    `   Percelen: ${plots.length ? pTekst : '— geen herkend'}`,
    `   Middelen: ${products.length ? products.map(p => middelRegel(p, ha)).join('; ') : '— geen herkend'}`,
  ];
  const aannames = (meta.assumptions || []) as SprayReviewAssumption[];
  if (aannames.length) regels.push(`   Aannames: ${aannames.map(a => `${a.field === 'product' ? `${a.to} ← ${a.from}` : a.to} (${a.reason})`).join('; ')}`);
  if (meta.uncertainFields?.length) regels.push(`   Onzeker: ${meta.uncertainFields.join(', ')}`);
  const errors = (meta.validationFlags || []).filter(v => v.type === 'error');
  if (errors.length) regels.push(`   Fouten: ${errors.map(v => v.message).join('; ')}`);
  return regels.join('\n');
}

async function spuitInbox(ctx: McpContext): Promise<ToolResultaat> {
  const entries = await getSprayInboxEntriesForUser(ctx.userId);
  if (entries.length === 0) return { tekst: 'Geen openstaande spuitconcepten.' };
  return { tekst: [`${entries.length} concept(en) te controleren:`, '', ...entries.map((e, i) => conceptTekst(ctx, e, i + 1))].join('\n\n') };
}

function vindProduct(ctx: McpContext, naam: string, historie: string[]): { naam: string; source?: 'ctgb' | 'fertilizer'; twijfel?: string } {
  const exact = ctx.products.find(p => normaliseer(p.naam) === normaliseer(naam));
  if (exact) return { naam: exact.naam, source: 'ctgb' };
  const fert = ctx.fertilizers.find(fp => normaliseer(fp.name) === normaliseer(naam));
  if (fert) return { naam: fert.name, source: 'fertilizer' };

  const m = zoek(naam, ctx.products, p => p.naam);
  if (m.beste && m.zekerheid >= 70) {
    // Prefer the brand this grower actually uses (e.g. "merpan" → Merpan Spuitkorrel, not Merpan Flowable).
    const kandidaten = [m.beste, ...m.alternatieven];
    const eigen = historie.map(h => kandidaten.find(k => k.naam.toLowerCase() === h.toLowerCase())).find(Boolean);
    if (eigen) return { naam: eigen.naam, source: 'ctgb' };
    return { naam: m.beste.naam, source: 'ctgb', twijfel: m.alternatieven.length ? `ik neem ${m.beste.naam}, maar ${m.alternatieven.map(a => a.naam).join(' / ')} bestaat ook` : undefined };
  }
  const mf = zoek(naam, ctx.fertilizers, fp => fp.name);
  if (mf.beste && mf.zekerheid >= 70) return { naam: mf.beste.name, source: 'fertilizer' };
  return { naam, twijfel: `"${naam}" niet gevonden in de middelen-/meststoffendatabase` };
}

async function keurConceptGoed(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const id = str(args.id);
  const entries = await getSprayInboxEntriesForUser(ctx.userId);
  const e = entries.find(x => x.id === id || x.id.startsWith(id));
  if (!id || !e) return { tekst: `Concept "${id}" niet gevonden in de inbox.`, fout: true };

  const problemen: string[] = [];
  let plots = e.parsedData?.plots || [];
  if (Array.isArray(args.percelen) && (args.percelen as unknown[]).length) {
    plots = [];
    for (const n of (args.percelen as unknown[]).map(x => str(x)).filter(Boolean)) {
      const ps = percelenVanNaam(ctx, n);
      if (!ps.length) problemen.push(`Perceel "${n}" niet gevonden. Bekende percelen: ${ctx.parcels.map(p => p.name).join(', ')}.`);
      plots.push(...ps.map(p => p.id).filter(pid => !plots.includes(pid)));
    }
  }
  let products: ProductEntry[] = e.parsedData?.products || [];
  if (Array.isArray(args.middelen) && (args.middelen as unknown[]).length) {
    const historie = await getUserProductNames(ctx.userId);
    products = (args.middelen as Args[]).map(m => {
      const v = vindProduct(ctx, str(m.naam), historie);
      if (v.twijfel) problemen.push(v.twijfel);
      return { product: v.naam, dosage: num(m.dosering) ?? 0, unit: str(m.eenheid) || 'L', ...(v.source ? { source: v.source } : {}) };
    });
  }
  const date = str(args.datum) ? datumArg(args.datum, e.date) : e.date;
  const registrationType: RegistrationType = e.registrationType || 'spraying';

  if (plots.length === 0) problemen.push('Geen percelen — geef de percelen op.');
  if (products.length === 0) problemen.push('Geen middelen — geef de middelen op.');
  for (const p of products) if (!p.dosage || p.dosage <= 0) problemen.push(`Dosering voor ${p.product} ontbreekt (per ha).`);
  for (const p of products) if (p.resolved === false) problemen.push(`Middel "${p.product}" is niet herkend${p.suggestions?.length ? `; bedoel je ${p.suggestions.map(s => s.naam).join(' / ')}?` : ''}`);

  const { tekst: pTekst, ha } = perceelNamen(ctx, plots);
  const voorstel = [
    `Concept [${e.id.slice(0, 8)}] → spuitschrift`,
    `- Datum: ${ddt(date)} · ${registrationType === 'spreading' ? 'strooien' : 'spuiten'}`,
    `- Percelen: ${pTekst || '—'}`,
    ...products.map(p => `- ${middelRegel(p, ha)}`),
  ];
  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...problemen.map(p => `- ${p}`), '', 'Voorstel tot nu toe:', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep dan opnieuw aan met bevestig=true.'].join('\n') };

  const edit: SprayDraftEdit = { date, plots, products, registrationType };
  const r = await approveSprayDraftForUser(ctx.userId, e.id, edit, 'claude');
  if (!r.success) return { tekst: `Opslaan mislukt: ${r.message}`, fout: true };
  return { tekst: ['Opgeslagen in spuitschrift ✓', ...voorstel].join('\n') };
}

async function verwijderConcept(userId: string, args: Args): Promise<ToolResultaat> {
  const id = str(args.id);
  const entries = await getSprayInboxEntriesForUser(userId);
  const e = entries.find(x => x.id === id || x.id.startsWith(id));
  if (!e) return { tekst: `Concept "${id}" niet gevonden.`, fout: true };
  const r = await deleteSprayDraftForUser(userId, e.id);
  return r.success ? { tekst: `Concept [${e.id.slice(0, 8)}] verwijderd ✓` } : { tekst: `Verwijderen mislukt: ${r.message}`, fout: true };
}

async function registreerBespuiting(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const tekst = str(args.tekst);
  if (!tekst) return { tekst: 'Geen tekst.', fout: true };

  const prefs = await getUserPreferencesAdmin(ctx.userId);
  const { text: pipelineInput, substitutions } = applyUserPreferencesToText(tekst, prefs);
  const result: AnalysisResult = await runRegistrationPipeline(pipelineInput, ctx.userId);
  if (result.action === 'answer_query' || !result.registration) {
    return { tekst: `Dit lees ik niet als een registratie: "${tekst}". Noem percelen én middelen, bijv. "busje en jachthoek oude met merpan 1,5 kg".`, fout: true };
  }

  const [namen, lastUsed] = await Promise.all([
    getUserProductNames(ctx.userId),
    getLastUsedDosagesForUser(ctx.userId, result.registration.units.flatMap(u => u.products).filter(p => !p.dosage).map(p => p.product)),
  ]);
  const datum = str(args.datum) ? datumArg(args.datum) : result.registration.date;
  const registrationType = result.registration.registrationType || 'spraying';
  const problemen: string[] = [];
  const voorstel: string[] = [`${registrationType === 'spreading' ? 'Bemesting' : 'Bespuiting'} ${ddt(new Date(datum))}`];
  for (const s of substitutions) voorstel.push(`- ${s.to} ← "${s.from}" (jouw voorkeur)`);

  const units = result.registration.units.map(u => ({ ...u, ...enrichUnit(u.products, ctx.products, namen, lastUsed) }));
  units.forEach((u, i) => {
    const { tekst: pTekst, ha } = perceelNamen(ctx, u.plots);
    if (units.length > 1) voorstel.push(`Deel ${i + 1}${u.label ? ` (${u.label})` : ''}:`);
    voorstel.push(`- Percelen: ${u.plots.length ? pTekst : '— geen herkend'}`);
    for (const p of u.products) voorstel.push(`- ${middelRegel(p, ha)}`);
    for (const a of u.assumptions) voorstel.push(`  · aanname: ${a.field === 'product' ? `${a.to} ← ${a.from}` : a.to} (${a.reason})`);
    if (u.plots.length === 0) problemen.push(`Geen percelen herkend in "${tekst}". Bekende percelen: ${ctx.parcels.map(p => p.name).join(', ')}.`);
    if (u.products.length === 0) problemen.push('Geen middelen herkend.');
    for (const p of u.products) {
      if (p.resolved === false) problemen.push(`Middel "${p.product}" niet herkend${p.suggestions?.length ? `; bedoel je ${p.suggestions.map(s => s.naam).join(' / ')}?` : ''}. Vraag de gebruiker.`);
      if (!p.dosage || p.dosage <= 0) problemen.push(`Dosering voor ${p.product} ontbreekt (per ha, of "totaal").`);
    }
    for (const veld of u.uncertainFields) if (veld.endsWith('.product')) {
      const idx = Number(/\[(\d+)\]/.exec(veld)?.[1]);
      const p = u.products[idx];
      if (p?.suggestions?.length) problemen.push(`${p.product} is een gok; alternatieven: ${p.suggestions.map(s => s.naam).join(' / ')}. Vraag de gebruiker welke.`);
    }
  });

  const flags = result.validationFlags || [];
  const errors = flags.filter(v => v.type === 'error');
  const warnings = compactWarnings(flags.filter(v => v.type === 'warning' && !v.message.includes('niet gevonden in CTGB')).map(v => v.message));
  if (errors.length) problemen.push(...errors.flatMap(v => splitFlag(v.message).filter(l => l.startsWith('❌')).map(l => `Blokkerend: ${l.replace(/^❌\s*/, '')}`)));
  if (warnings.length) {
    voorstel.push('', 'Waarschuwingen:');
    voorstel.push(...warnings.map(w => `- ${w}`));
  }

  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...problemen.map(p => `- ${p}`), '', 'Voorstel tot nu toe:', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep dan opnieuw aan met bevestig=true en dezelfde tekst.'].join('\n') };

  const ids: string[] = [];
  for (const u of units) {
    const r = await confirmRegistration(
      {
        userId: ctx.userId,
        plots: u.plots,
        products: u.products,
        date: datum,
        rawInput: tekst,
        validationMessage: warnings.length ? warnings.map(w => `⚠️ ${w}`).join('\n') : null,
        registrationType,
        registrationSource: 'claude',
      },
      async ({ logbookEntry, sprayableParcels, isConfirmation, spuitschriftId }) => {
        await addParcelHistoryEntries({ logbookEntry, sprayableParcels, isConfirmation, spuitschriftId, providedUserId: ctx.userId });
      }
    );
    if (!r.success) return { tekst: `Opslaan mislukt: ${r.message}${ids.length ? ` (deel 1 t/m ${ids.length} zijn wél opgeslagen)` : ''}`, fout: true };
    if (r.spuitschriftId) ids.push(r.spuitschriftId);
    await mirrorRegistrationToFieldNotes({ userId: ctx.userId, rawInput: tekst, registrationType, spuitschriftId: r.spuitschriftId, source: 'claude' });
  }
  invalidateContextCache(ctx.userId);
  return { tekst: ['Opgeslagen in spuitschrift ✓', ...voorstel].join('\n') };
}
