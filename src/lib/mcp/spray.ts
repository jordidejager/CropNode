/**
 * Spuitschrift-tools voor de CropNode MCP: registreren, opzoeken, aanpassen en verwijderen.
 *
 * - Gespoten deel per perceel ("helft", "kwart", "een derde", 0.5, of een aantal ha).
 *   Opgeslagen in spuitschrift.plot_areas; verbruik en historie rekenen met het gespoten oppervlak.
 * - Dosering per ha, of een totaal dat over het gespoten oppervlak wordt verdeeld.
 * - Datum + tijd ("gisteravond", "om 20:00").
 * - Schrijven altijd via voorstel → bevestig=true.
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { runRegistrationPipeline, invalidateContextCache } from '@/lib/registration-pipeline';
import { confirmRegistration, mirrorRegistrationToFieldNotes } from '@/lib/registration-service';
import {
  addParcelHistoryEntries,
  deleteSpuitschriftEntry,
  getLastUsedDosagesForUser,
  getUserProductNames,
  updateSpuitschriftEntry,
} from '@/lib/supabase-store';
import type { SprayableParcel } from '@/lib/supabase-store';
import { validateParsedSprayData } from '@/lib/validation-service';
import { applyUserPreferencesToText, enrichUnit, getUserPreferencesAdmin } from '@/lib/whatsapp/spray-inbox';
import { sprayedArea } from '@/lib/spray-records';
import { createSprayTaskLogs, removeSprayTaskLogs } from '@/lib/spray-hours';
import type { ProductEntry, RegistrationType } from '@/lib/types';
import type { McpContext } from './context';
import {
  hoofdpercelenVan,
  koppelingenTekst,
  ontkoppelRijenVanBespuiting,
  perceelHeeftActieveRijen,
  rijenArg,
  rijenBereik,
  rijenKeuzeTekst,
  rijenNaarPlots,
  rijenTekstVoorBespuitingen,
  rijenUitTekst,
  rijKoppelingenVanBespuiting,
  type BespuitingRijKoppeling,
  type RijenKeuze,
} from './rijen';
import {
  compactWarnings,
  dd,
  ddt,
  f,
  normaliseer,
  num,
  onbekendNotitie,
  opslagMiddel,
  percelenVanNaam,
  splitFlag,
  str,
  zoek,
  type Args,
  type ToolDefinitie,
  type ToolResultaat,
} from './util';

// ── Tijd ────────────────────────────────────────────────────────────────

const DAGDEEL_UUR: Record<string, number> = { ochtend: 8, morgen: 8, middag: 14, avond: 20, nacht: 23 };

function parseTijd(v: string): { h: number; m: number } | null {
  const s = v.toLowerCase().trim();
  let m = /\b(\d{1,2})[:.](\d{2})\b/.exec(s);
  if (m && +m[1] < 24 && +m[2] < 60) return { h: +m[1], m: +m[2] };
  m = /\b(\d{1,2})\s*(?:uur|u)\b/.exec(s);
  if (m && +m[1] < 24) return { h: +m[1], m: 0 };
  m = /^(\d{1,2})$/.exec(s);
  if (m && +m[1] < 24) return { h: +m[1], m: 0 };
  for (const [deel, uur] of Object.entries(DAGDEEL_UUR)) if (new RegExp(`${deel}$`).test(s) || s === deel) return { h: uur, m: 0 };
  return null;
}

/** Dag uit een woord of datum; null als er niets herkenbaars staat. */
function parseDag(v: string): Date | null {
  const s = v.toLowerCase().trim();
  const vandaag = new Date();
  const dagen = (n: number) => { const d = new Date(vandaag); d.setDate(d.getDate() - n); return d; };
  if (/\beergister/.test(s)) return dagen(2);
  if (/\bgister/.test(s)) return dagen(1);
  if (/\b(vandaag|vanavond|vanochtend|vanmiddag|vannacht|vanmorgen)\b/.test(s)) return dagen(0);
  let m = /\b(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  m = /\b(\d{1,2})-(\d{1,2})(?:-(\d{4}))?\b/.exec(s);
  if (m) return new Date(m[3] ? +m[3] : vandaag.getFullYear(), +m[2] - 1, +m[1], 12);
  const maanden = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  m = new RegExp(`\\b(\\d{1,2})\\s+(${maanden.join('|')}|${maanden.map(x => x.slice(0, 3)).join('|')})\\b`).exec(s);
  if (m) {
    const idx = maanden.findIndex(x => x.startsWith(m![2].slice(0, 3)));
    const d = new Date(vandaag.getFullYear(), idx, +m[1], 12);
    if (d.getTime() - vandaag.getTime() > 7 * 86_400_000) d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return null;
}

/**
 * Moment van de bespuiting. Volgorde: args.datum → woorden in de tekst → fallback (pipeline/huidige).
 * Tijd: args.tijd → tijd in args.datum → tijd/dagdeel in de tekst → 12:00 bij een andere dag, anders nu.
 */
export function bepaalMoment(datum: unknown, tijd: unknown, tekst: string, fallback?: Date | null): Date {
  const datumStr = str(datum);
  const dag = (datumStr && parseDag(datumStr)) || parseDag(tekst) || (fallback ? new Date(fallback) : new Date());
  const t =
    (str(tijd) && parseTijd(str(tijd))) ||
    (datumStr && (parseTijd(datumStr.replace(/^\d{4}-\d{2}-\d{2}/, '')) || dagdeelUitTekst(datumStr))) ||
    tijdUitTekst(tekst) ||
    dagdeelUitTekst(tekst);
  const d = new Date(dag);
  if (t) d.setHours(t.h, t.m, 0, 0);
  else if (d.toDateString() !== new Date().toDateString() && !(fallback && datumStr === '')) d.setHours(12, 0, 0, 0);
  return d;
}

function tijdUitTekst(tekst: string): { h: number; m: number } | null {
  const s = tekst.toLowerCase();
  const m = /\bom\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uur|u)?\b/.exec(s) || /\b(\d{1,2})[:.](\d{2})\b/.exec(s) || /\b(\d{1,2})\s*uur\b/.exec(s);
  if (!m || +m[1] > 23) return null;
  return { h: +m[1], m: m[2] ? +m[2] : 0 };
}

function dagdeelUitTekst(tekst: string): { h: number; m: number } | null {
  const s = tekst.toLowerCase();
  for (const [deel, uur] of Object.entries(DAGDEEL_UUR)) {
    if (new RegExp(`\\b(?:gister|eergister|van|vandaag\\s+)?${deel}`).test(s) && new RegExp(`${deel}`).test(s)) {
      if (deel === 'morgen' && !/(gistermorgen|vanmorgen)/.test(s)) continue;
      return { h: uur, m: 0 };
    }
  }
  return null;
}

// ── Gespoten deel ───────────────────────────────────────────────────────

export function deelFactor(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v > 1 && v <= 100 ? v / 100 : v > 0 && v <= 1 ? v : null;
  const s = str(v).toLowerCase().replace(',', '.');
  if (!s) return null;
  if (/^(heel|hele|volledig|alles|100%?)$/.test(s)) return 1;
  if (/twee\s*derde|2\/3/.test(s)) return 2 / 3;
  if (/drie\s*kwart|3\/4/.test(s)) return 0.75;
  if (/helft|halve|half|1\/2/.test(s)) return 0.5;
  if (/kwart|1\/4/.test(s)) return 0.25;
  if (/derde|1\/3/.test(s)) return 1 / 3;
  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (pct) return +pct[1] / 100;
  const n = Number(s);
  if (isFinite(n) && n > 0 && n <= 1) return n;
  return null;
}

/** Spreekt een deel uit in de tekst ("helft van", "3,33 ha")? */
function deelUitTekst(tekst: string): { factor?: number; ha?: number; woord: string } | null {
  const s = tekst.toLowerCase();
  const ha = /\b(\d+(?:[.,]\d+)?)\s*(?:ha|hectare)\b(?!\s*(?:per|\/))/.exec(s);
  if (ha && !/\/\s*ha|per\s+(?:ha|hectare)/.test(s.slice(Math.max(0, ha.index - 6), ha.index + ha[0].length + 1))) {
    return { ha: Number(ha[1].replace(',', '.')), woord: ha[0] };
  }
  const w = /\b(twee\s+derde|drie\s+kwart|helft|halve|kwart|een\s+derde|derde)\b/.exec(s);
  if (w) return { factor: deelFactor(w[1]) ?? undefined, woord: w[1] };
  return null;
}

// ── Percelen- en middeleninvoer ─────────────────────────────────────────

type PlotAreas = Record<string, number>;

function verdeel(ps: SprayableParcel[], opts: { factor?: number | null; ha?: number | null }, out: PlotAreas, problemen: string[], label: string) {
  const vol = ps.reduce((s, p) => s + (p.area || 0), 0);
  if (opts.ha != null) {
    if (opts.ha <= 0) { problemen.push(`Gespoten oppervlak voor ${label} moet groter dan 0 zijn.`); return; }
    if (vol > 0 && opts.ha > vol + 0.005) { problemen.push(`${label} is ${f(vol, 2)} ha; ${f(opts.ha, 2)} ha gespoten kan niet.`); return; }
    if (vol > 0 && opts.ha < vol - 0.0001) for (const p of ps) out[p.id] = Math.round(((p.area || 0) * opts.ha / vol) * 10000) / 10000;
    return;
  }
  if (opts.factor != null && opts.factor < 1) for (const p of ps) out[p.id] = Math.round(((p.area || 0) * opts.factor) * 10000) / 10000;
}

export function resolvePercelenInvoer(ctx: McpContext, invoer: unknown): { plots: string[]; plotAreas: PlotAreas; problemen: string[] } {
  const plots: string[] = [];
  const plotAreas: PlotAreas = {};
  const problemen: string[] = [];
  for (const item of Array.isArray(invoer) ? invoer : []) {
    const r = (typeof item === 'string' ? { naam: item } : item) as Args;
    const naam = str(r.naam);
    if (!naam) continue;
    const ps = percelenVanNaam(ctx, naam);
    if (ps.length === 0) {
      problemen.push(`Perceel "${naam}" niet gevonden. Bekende percelen: ${ctx.parcels.map(p => p.name).join(', ')}.`);
      continue;
    }
    for (const p of ps) if (!plots.includes(p.id)) plots.push(p.id);
    const factor = r.deel !== undefined ? deelFactor(r.deel) : null;
    if (r.deel !== undefined && factor == null) problemen.push(`Deel "${String(r.deel)}" voor ${naam} begrijp ik niet; gebruik helft, kwart, een derde, 0.5 of een aantal ha.`);
    verdeel(ps, { factor, ha: num(r.ha) }, plotAreas, problemen, ps.length === 1 ? ps[0].name : naam);
  }
  return { plots, plotAreas, problemen };
}

function schoneMiddelNaam(naam: string): string {
  return naam
    .replace(/\s*(?:per|p\/|\/)\s*(?:hectare|ha)\b\.?/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo|l|liter|liters|g|gram|ml)\b/gi, ' ')
    .replace(/\b(?:totaal|in totaal)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function vindProduct(ctx: McpContext, rauweNaam: string, historie: string[]): { naam: string; source?: 'ctgb' | 'fertilizer'; twijfel?: string; onbekend?: boolean } {
  const naam = schoneMiddelNaam(rauweNaam) || rauweNaam;
  const n = normaliseer(naam);
  const exact = ctx.products.find(p => normaliseer(p.naam) === n);
  if (exact) return { naam: exact.naam, source: 'ctgb' };
  const fert = ctx.fertilizers.find(fp => normaliseer(fp.name) === n);
  if (fert) return { naam: fert.name, source: 'fertilizer' };
  const eerder = historie.find(h => normaliseer(h) === n);

  // Eerder gebruikt middel waar de genoemde naam in zit ("koper" → ACS-Koper 500)
  const eigenBevat = n.length >= 3 ? historie.find(h => normaliseer(h).split(' ').some(w => w.startsWith(n)) || normaliseer(h).includes(n)) : undefined;
  if (eigenBevat && !eerder) {
    const viaCtgb = ctx.products.find(p => normaliseer(p.naam) === normaliseer(eigenBevat));
    if (viaCtgb) return { naam: viaCtgb.naam, source: 'ctgb' };
    const viaFert = ctx.fertilizers.find(fp => normaliseer(fp.name) === normaliseer(eigenBevat));
    if (viaFert) return { naam: viaFert.name, source: 'fertilizer' };
  }

  // Werkzame stof ("captan") → het merk dat deze teler gebruikt
  const viaStof = ctx.products.filter(p => (p.werkzameStoffen || []).some(ws => normaliseer(ws) === n || normaliseer(ws).startsWith(n)));
  if (viaStof.length) {
    const eigen = historie.map(h => viaStof.find(k => k.naam.toLowerCase() === h.toLowerCase())).find(Boolean);
    if (eigen) return { naam: eigen.naam, source: 'ctgb' };
  }

  // Eerder door de teler gebruikte naam die niet in de database staat (bijv. "huwasan")
  if (eerder) return { naam: eerder, onbekend: true };

  const m = zoek(naam, ctx.products, p => p.naam);
  if (m.beste && m.zekerheid >= 70) {
    const kandidaten = [m.beste, ...m.alternatieven];
    const eigen = historie.map(h => kandidaten.find(k => k.naam.toLowerCase() === h.toLowerCase())).find(Boolean);
    if (eigen) return { naam: eigen.naam, source: 'ctgb' };
    return { naam: m.beste.naam, source: 'ctgb', twijfel: m.alternatieven.length ? `ik neem ${m.beste.naam}, maar ${m.alternatieven.map(a => a.naam).join(' / ')} bestaat ook` : undefined };
  }
  const mf = zoek(naam, ctx.fertilizers, fp => fp.name);
  if (mf.beste && mf.zekerheid >= 70) return { naam: mf.beste.name, source: 'fertilizer' };
  return { naam: eerder || naam, onbekend: true };
}

function eenheidArg(v: unknown, standaard = 'L'): string {
  const s = str(v).toLowerCase().replace('/ha', '').trim();
  if (!s) return standaard;
  if (/^(l|liter|liters|ltr)$/.test(s)) return 'L';
  if (/^(kg|kilo|kilogram|kilos)$/.test(s)) return 'kg';
  if (/^(g|gr|gram)$/.test(s)) return 'g';
  if (/^ml$/.test(s)) return 'ml';
  return s;
}

function standaardEenheid(ctx: McpContext, naam: string): string | null {
  const p = ctx.products.find(x => x.naam === naam) as any;
  const fm = ((p?.formulering || p?.formuleringType || '') as string).toLowerCase();
  if (/wg|wp|dg|sg|granul|poeder|korrel/.test(fm)) return 'kg';
  if (fm) return 'L';
  const fert = ctx.fertilizers.find(x => x.name === naam) as any;
  return fert?.unit || null;
}

export function resolveMiddelenInvoer(ctx: McpContext, invoer: unknown, historie: string[]): { products: ProductEntry[]; problemen: string[] } {
  const products: ProductEntry[] = [];
  const problemen: string[] = [];
  for (const item of Array.isArray(invoer) ? invoer : []) {
    const r = (typeof item === 'string' ? { naam: item } : item) as Args;
    const ruw = str(r.naam);
    if (!ruw) continue;
    const v = vindProduct(ctx, ruw, historie);
    if (v.twijfel) problemen.push(v.twijfel);
    const totaal = num(r.totaal);
    const unit = eenheidArg(r.eenheid, standaardEenheid(ctx, v.naam) || 'L');
    products.push({
      product: v.naam,
      dosage: totaal != null ? 0 : num(r.dosering) ?? 0,
      unit,
      ...(v.source ? { source: v.source } : {}),
      ...(v.onbekend ? { resolved: false } : {}),
      ...(totaal != null ? { totalAmount: totaal } : {}),
    });
  }
  return { products, problemen };
}

/** Totale hoeveelheden verdelen over het gespoten oppervlak → dosering per ha. */
function verdeelTotalen(products: ProductEntry[], gespotenHa: number): ProductEntry[] {
  return products.map(p => (p.totalAmount != null && p.totalAmount > 0 && gespotenHa > 0
    ? { ...p, dosage: Math.round((p.totalAmount / gespotenHa) * 10000) / 10000 }
    : p));
}

// ── Opmaak ──────────────────────────────────────────────────────────────

function oppervlak(ctx: McpContext, plots: string[], plotAreas: PlotAreas | null | undefined) {
  let gespoten = 0;
  let vol = 0;
  const regels: string[] = [];
  for (const id of plots) {
    const p = ctx.parcels.find(x => x.id === id);
    const full = p?.area || 0;
    const sp = sprayedArea(id, full, plotAreas);
    gespoten += sp;
    vol += full;
    const deels = plotAreas?.[id] != null;
    regels.push(`  - ${p?.name ?? `onbekend blok ${id.slice(0, 8)}`} · ${deels ? `${f(sp, 2)} van ${f(full, 2)} ha` : `${f(full, 2)} ha`}`);
  }
  return { regels, gespoten, vol };
}

function middelRegelOpp(p: ProductEntry, gespotenHa: number): string {
  const eenheid = (p.unit || 'L').replace('/ha', '');
  const bron = p.source === 'fertilizer' ? ' [meststof]' : '';
  if (!(p.dosage > 0)) return `${p.product}${bron} — dosering ontbreekt${onbekendNotitie(p)}`;
  const totaal = gespotenHa > 0 ? `${f(p.dosage * gespotenHa, 2)} ${eenheid} totaal` : '';
  const herkomst = p.totalAmount != null ? ` (opgegeven als ${f(p.totalAmount, 2)} ${eenheid} totaal)` : totaal ? ` (${totaal})` : '';
  return `${p.product}${bron} ${f(p.dosage, 3)} ${eenheid}/ha${herkomst}${onbekendNotitie(p)}`;
}

function registratieBlok(ctx: McpContext, r: { date: Date; plots: string[]; products: ProductEntry[]; plotAreas?: PlotAreas | null; registrationType?: string; notes?: string | null; rijen?: string[] }): string[] {
  const opp = oppervlak(ctx, r.plots, r.plotAreas);
  const kop = `${r.registrationType === 'spreading' ? 'Bemesting' : 'Bespuiting'} ${ddt(r.date)} · ${f(opp.gespoten, 2)} ha gespoten${opp.gespoten < opp.vol - 0.0001 ? ` (van ${f(opp.vol, 2)} ha)` : ''}`;
  return [
    kop,
    '- Percelen:',
    ...(opp.regels.length ? opp.regels : ['  - geen']),
    // Rijenkaart (beta): alleen als er rijen bij horen
    ...(r.rijen?.length ? r.rijen.map(x => `  · ${x}`) : []),
    '- Middelen:',
    ...(r.products.length ? r.products.map(p => `  - ${middelRegelOpp(p, opp.gespoten)}`) : ['  - geen']),
    ...(r.notes ? [`- Opmerking: ${r.notes}`] : []),
  ];
}

async function valideer(ctx: McpContext, plots: string[], products: ProductEntry[], date: Date, uitsluitenSpuitschriftId?: string) {
  const ctgb = products.filter(p => p.source !== 'fertilizer' && p.resolved !== false);
  if (!plots.length || !ctgb.length) return { errors: [] as string[], warnings: [] as string[], message: null as string | null };
  const res = await validateParsedSprayData(
    { plots, products: ctgb, date: date.toISOString() },
    ctx.parcels.map(p => ({ id: p.id, name: p.name, area: p.area || 0, crop: p.crop, variety: p.variety })) as any,
    ctx.products,
    (uitsluitenSpuitschriftId ? ctx.parcelHistory.filter((h: any) => h.spuitschriftId !== uitsluitenSpuitschriftId) : ctx.parcelHistory) as any
  ).catch(() => ({ validationMessage: null as string | null, errorCount: 0 }));
  const lines = res.validationMessage ? splitFlag(res.validationMessage) : [];
  const errors = lines.filter(l => l.startsWith('❌')).map(l => l.replace(/^❌\s*/, ''));
  const warnings = compactWarnings(lines.filter(l => l.startsWith('⚠️')));
  const message = [...errors.map(e => `❌ ${e}`), ...warnings.map(w => `⚠️ ${w}`)].join('\n') || null;
  return { errors, warnings, message };
}

// ── Tools ───────────────────────────────────────────────────────────────

const PERCELEN_SCHEMA = {
  type: 'array',
  description:
    'Percelen met optioneel het gespoten deel. Laat deel/ha weg als het hele perceel is gespoten. Voorbeelden: {"naam":"jachthoek nieuwe conference","deel":"helft"}, {"naam":"schele","ha":3.33}.',
  items: {
    type: 'object',
    properties: {
      naam: { type: 'string', description: 'Perceel- of bloknaam (slordig mag), of naam van een hoofdperceel/groep.' },
      deel: { type: 'string', description: '"helft", "kwart", "een derde", "twee derde", "drie kwart", "60%" of een fractie zoals "0.5".' },
      ha: { type: 'number', description: 'Gespoten oppervlak in ha (in plaats van deel).' },
    },
    required: ['naam'],
  },
};

/** Zoals PERCELEN_SCHEMA, plus optioneel 'rijen' per perceel (alleen registreer_bespuiting). */
const PERCELEN_MET_RIJEN_SCHEMA = {
  ...PERCELEN_SCHEMA,
  description: `${PERCELEN_SCHEMA.description} Alleen bepaalde rijen gespoten (rijenkaart, beta): {"naam":"steketee","rijen":"1-20, 24"} — niet samen met deel/ha.`,
  items: {
    ...PERCELEN_SCHEMA.items,
    properties: {
      ...PERCELEN_SCHEMA.items.properties,
      rijen: {
        type: 'string',
        description: 'Optioneel: alleen deze rijen van dit perceel, bijv. "1-20, 24", "1 t/m 20", "blok Conference 2018", "bestuivers" of "alle behalve 5" (zie tool rijen). Het naam-item moet dan precies één perceel zijn.',
      },
    },
  },
};

const MIDDELEN_SCHEMA = {
  type: 'array',
  description: 'Middelen. Geef per middel óf dosering (per ha) óf totaal (totale hoeveelheid; wordt verdeeld over het gespoten oppervlak). Alleen de naam in "naam", zonder dosering.',
  items: {
    type: 'object',
    properties: {
      naam: { type: 'string', description: 'Middelnaam of werkzame stof, zonder dosering (bijv. "huwasan", "captan").' },
      dosering: { type: 'number', description: 'Dosering per hectare.' },
      totaal: { type: 'number', description: 'Totaal verbruikte hoeveelheid voor deze bespuiting.' },
      eenheid: { type: 'string', description: '"L", "kg", "g" of "ml".' },
    },
    required: ['naam'],
  },
};

export const SPRAY_TOOLS: ToolDefinitie[] = [
  {
    name: 'bespuitingen',
    description:
      'Registraties uit het spuitschrift (bespuitingen én bemesting) van een dag of periode: code, datum+tijd, percelen met gespoten ha (van totaal), middelen met dosering/ha en totaal, opmerking. Nieuwste eerst, max 50. Gebruik de code bij bespuiting_aanpassen.',
    inputSchema: {
      type: 'object',
      properties: {
        datum: { type: 'string', description: 'Einddatum: "vandaag" (standaard), "gisteren" of YYYY-MM-DD.' },
        dagen: { type: 'number', description: 'Aantal dagen terug vanaf datum (standaard 14).' },
        perceel: { type: 'string', description: 'Alleen registraties op dit perceel.' },
        middel: { type: 'string', description: 'Alleen registraties met dit middel.' },
        type: { type: 'string', enum: ['alles', 'spuiten', 'strooien'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'registreer_bespuiting',
    description:
      'Registreert een NIEUWE bespuiting of bemesting in het spuitschrift. Voorkeur: geef percelen en middelen gestructureerd (percelen met deel/ha als niet het hele perceel is gespoten; middelen met dosering per ha óf totaal). Alleen "tekst" mag ook (bijv. "gisteravond busje en jachthoek oude met merpan 1,5 kg en 25 kg totaal zwavel"). Een totaal wordt verdeeld over het GESPOTEN oppervlak. Middelen die niet in de database staan mogen gewoon (opgeslagen onder de genoemde naam). Datum en tijd: gebruik datum + tijd (bijv. datum "gisteren", tijd "20:00"). Roep EERST aan zonder bevestig → VOORSTEL; na een expliciet "ja" opnieuw met bevestig=true en exact dezelfde argumenten. Een correctie op een bestaande registratie: gebruik bespuiting_aanpassen, niet deze tool. Alleen een deel van de rijen gespoten (rijenkaart, beta): rijen per perceel (percelen[{naam, rijen}]) of op topniveau bij één perceel; het gespoten oppervlak wordt dan uit de rijen berekend.',
    inputSchema: {
      type: 'object',
      properties: {
        tekst: { type: 'string', description: 'De registratie in gewone woorden (optioneel als percelen én middelen zijn opgegeven; wordt als oorspronkelijke invoer bewaard).' },
        percelen: PERCELEN_MET_RIJEN_SCHEMA,
        middelen: MIDDELEN_SCHEMA,
        rijen: {
          type: 'string',
          description: 'Optioneel (rijenkaart, beta): alleen deze rijen, bijv. "1-20" of "blok Conference 2018". Alleen als de registratie precies één perceel raakt; anders rijen per perceel opgeven.',
        },
        datum: { type: 'string', description: '"vandaag", "gisteren", "eergisteren", YYYY-MM-DD of "12 september".' },
        tijd: { type: 'string', description: 'Tijd, bijv. "20:00", "8 uur", "avond".' },
        type: { type: 'string', enum: ['spuiten', 'strooien'], description: 'Standaard spuiten (ook bladmeststoffen); "strooien" voor gestrooide meststoffen.' },
        opmerking: { type: 'string' },
        bevestig: { type: 'boolean', description: 'true = echt opslaan.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'bespuiting_aanpassen',
    description:
      'Corrigeert of verwijdert een BESTAANDE registratie in het spuitschrift. Zoek met code (uit bespuitingen), of met datum/perceel/middel; zonder zoekterm de laatst ingevoerde registratie. Bij meerdere treffers krijg je een lijst met codes: kies er één en roep opnieuw aan met code. Wijzigingen: middel_toevoegen, middel_weghalen, dosering_wijzigen, percelen (vervangt alle percelen), perceel_toevoegen, perceel_weghalen, nieuwe_datum/nieuwe_tijd, opmerking; of verwijderen=true. Altijd eerst een VOORSTEL (was → wordt); pas met bevestig=true wordt opgeslagen of verwijderd. Voorraad, middelverbruik en perceelhistorie worden automatisch bijgewerkt. Rijkoppelingen (rijenkaart) vervallen voor percelen die eruit gaan of een ander gespoten deel krijgen; dat staat in het voorstel.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code van de registratie (eerste 8 tekens van het id) uit bespuitingen of een eerdere lijst.' },
        datum: { type: 'string', description: 'Zoek: registraties op deze dag.' },
        perceel: { type: 'string', description: 'Zoek: registraties op dit perceel.' },
        middel: { type: 'string', description: 'Zoek: registraties met dit middel.' },
        middel_toevoegen: MIDDELEN_SCHEMA,
        middel_weghalen: { type: 'array', items: { type: 'string' }, description: 'Namen van middelen om weg te halen.' },
        dosering_wijzigen: { ...MIDDELEN_SCHEMA, description: 'Nieuwe dosering (per ha) of totaal voor middelen die er al in staan.' },
        percelen: { ...PERCELEN_SCHEMA, description: 'Vervangt ALLE percelen (met optioneel deel/ha).' },
        perceel_toevoegen: { ...PERCELEN_SCHEMA, description: 'Voegt percelen toe of past het gespoten deel van een bestaand perceel aan (bijv. {"naam":"schele","deel":"helft"}).' },
        perceel_weghalen: { type: 'array', items: { type: 'string' } },
        nieuwe_datum: { type: 'string' },
        nieuwe_tijd: { type: 'string', description: 'Bijv. "20:00".' },
        opmerking: { type: 'string', description: 'Vervangt de opmerking; lege string wist hem.' },
        verwijderen: { type: 'boolean', description: 'true = hele registratie verwijderen.' },
        bevestig: { type: 'boolean', description: 'true = echt opslaan/verwijderen.' },
      },
      additionalProperties: false,
    },
  },
];

// ── bespuitingen ────────────────────────────────────────────────────────

interface Registratie {
  id: string;
  date: Date;
  createdAt: Date;
  plots: string[];
  products: ProductEntry[];
  plotAreas: PlotAreas;
  registrationType: RegistrationType;
  source: string | null;
  status: string | null;
  notes: string | null;
  rawInput: string | null;
  logId: string | null;
}

const KOLOMMEN = 'id, date, created_at, plots, products, plot_areas, registration_type, registration_source, status, notes, original_raw_input, original_logbook_id';

function rij(r: any): Registratie {
  return {
    id: r.id,
    date: new Date(r.date),
    createdAt: new Date(r.created_at),
    plots: r.plots || [],
    products: r.products || [],
    plotAreas: r.plot_areas || {},
    registrationType: r.registration_type || 'spraying',
    source: r.registration_source || null,
    status: r.status || null,
    notes: r.notes || null,
    rawInput: r.original_raw_input || null,
    logId: r.original_logbook_id || null,
  };
}

function regKorte(ctx: McpContext, r: Registratie, rijen?: string): string {
  const opp = oppervlak(ctx, r.plots, r.plotAreas);
  const namen = r.plots.map(id => {
    const p = ctx.parcels.find(x => x.id === id);
    const deels = r.plotAreas[id] != null;
    return `${p?.name ?? '?'}${deels ? ` (${f(r.plotAreas[id], 2)} van ${f(p?.area || 0, 2)} ha)` : ''}`;
  });
  const mids = r.products.map(p => `${p.product} ${p.dosage > 0 ? `${f(p.dosage, 3)} ${(p.unit || '').replace('/ha', '')}/ha` : '?'}`).join('; ');
  return `[${r.id.slice(0, 8)}] ${ddt(r.date)} · ${r.registrationType === 'spreading' ? 'gestrooid' : 'gespoten'} op ${namen.join(', ')} · ${f(opp.gespoten, 2)} ha${rijen ? ` · ${rijen}` : ''}\n    ${mids}${r.notes ? `\n    opmerking: ${r.notes}` : ''}${r.source && r.source !== 'web' ? ` · via ${r.source}` : ''}`;
}

export async function bespuitingen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const tot = str(args.datum) ? bepaalMoment(args.datum, '', '') : new Date();
  tot.setHours(23, 59, 59, 999);
  const dagen = Math.max(1, Math.round(num(args.dagen) ?? 14));
  const van = new Date(tot.getTime() - dagen * 86_400_000);
  van.setHours(0, 0, 0, 0);
  const type = str(args.type) || 'alles';

  let q = getSupabaseAdmin()
    .from('spuitschrift')
    .select(KOLOMMEN)
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
  if (perceelIds && perceelIds.size === 0) return { tekst: `Perceel "${str(args.perceel)}" niet gevonden. Bekende percelen: ${ctx.parcels.map(p => p.name).join(', ')}.` };
  const middel = normaliseer(str(args.middel));
  const rows = (data || []).map(rij).filter(r =>
    (!perceelIds || r.plots.some(id => perceelIds.has(id))) &&
    (!middel || r.products.some(p => normaliseer(p.product).includes(middel)))
  ).slice(0, 50);

  if (rows.length === 0) return { tekst: `Geen registraties tussen ${dd(van)} en ${dd(tot)}${str(args.perceel) ? ` op ${str(args.perceel)}` : ''}${middel ? ` met ${str(args.middel)}` : ''}.` };
  // Rijenkaart (beta): " · rijen 1–20 (Steketee)" bij registraties met rijkoppeling
  const rijenPerRegistratie = await rijenTekstVoorBespuitingen(ctx.userId, rows.map(r => r.id));
  return { tekst: [`${rows.length} registratie(s) ${dd(van)} t/m ${dd(tot)} (code tussen [ ] voor bespuiting_aanpassen):`, ...rows.map(r => `- ${regKorte(ctx, r, rijenPerRegistratie[r.id])}`)].join('\n') };
}

// ── registreer_bespuiting ───────────────────────────────────────────────

interface Eenheid {
  plots: string[];
  plotAreas: PlotAreas;
  products: ProductEntry[];
  label?: string;
  aannames: string[];
}

/**
 * Rijenkaart (beta): 'rijen' per perceel-item of op topniveau. De plots van dat hoofdperceel
 * worden vervangen door de subpercelen van de rijen, met het gespoten oppervlak uit de rijen.
 * Zonder 'rijen' gebeurt er niets (lege lijst, eenheden ongewijzigd).
 */
async function pasRijenToe(ctx: McpContext, args: Args, eenheden: Eenheid[], problemen: string[], notities: string[], uitTekst?: string): Promise<RijenKeuze[]> {
  const items = Array.isArray(args.percelen) ? (args.percelen as unknown[]) : [];
  // Rijen uit de vrije tekst gelden als rijen op topniveau
  const topTekst = rijenArg(args.rijen) || uitTekst || '';
  const info = items.map(item => {
    const r = (typeof item === 'string' ? { naam: item } : item && typeof item === 'object' ? item : {}) as Args;
    const naam = str(r.naam);
    const ps = naam ? percelenVanNaam(ctx, naam) : [];
    return {
      naam,
      plots: ps.map(p => p.id),
      hoofd: hoofdpercelenVan(ps),
      rijen: rijenArg(r.rijen),
      heeftDeel: r.deel !== undefined || r.ha !== undefined,
    };
  });
  const metRijen = info.filter(i => i.rijen);
  if (!topTekst && metRijen.length === 0) return [];
  if (topTekst && metRijen.length) {
    problemen.push('Geef rijen óf op topniveau óf per perceel op, niet allebei.');
    return [];
  }

  /** genoemd = subpercelen van dit hoofdperceel die in de invoer stonden (om tegenspraak met de rijen te melden) */
  const doelen: { perceel: { id: string; naam: string }; tekst: string; genoemd: string[] }[] = [];
  if (topTekst) {
    if (eenheden.length > 1) {
      problemen.push('De tekst bevat meerdere varianten; rijen kunnen alleen bij één variant. Geef rijen per perceel op (percelen [{naam, rijen}]) of registreer per variant.');
      return [];
    }
    const ps = (eenheden[0]?.plots ?? []).map(id => ctx.parcels.find(p => p.id === id)).filter(Boolean) as SprayableParcel[];
    const hoofd = hoofdpercelenVan(ps);
    if (hoofd.length === 0) return []; // "Geen percelen herkend" volgt bij de controles
    if (hoofd.length > 1) {
      problemen.push(`Deze registratie raakt ${hoofd.length} percelen (${hoofd.map(h => h.naam).join(', ')}); geef rijen per perceel op (percelen [{"naam":"…","rijen":"1-20"}]).`);
      return [];
    }
    const metDeel = info.find(i => i.heeftDeel && i.hoofd.some(h => h.id === hoofd[0].id));
    if (metDeel) {
      problemen.push(`Bij ${metDeel.naam}: geef óf rijen óf deel/ha op, niet allebei.`);
      return [];
    }
    doelen.push({ perceel: hoofd[0], tekst: topTekst, genoemd: ps.map(p => p.id) });
  } else {
    for (const i of metRijen) {
      if (i.heeftDeel) { problemen.push(`Bij ${i.naam || 'een perceel'}: geef óf rijen óf deel/ha op, niet allebei.`); continue; }
      if (i.hoofd.length === 0) continue; // "Perceel … niet gevonden" komt uit resolvePercelenInvoer
      if (i.hoofd.length > 1) {
        problemen.push(`"${i.naam}" past op meerdere percelen (${i.hoofd.map(h => h.naam).join(', ')}); rijen horen bij precies één perceel. Noem dat perceel.`);
        continue;
      }
      if (info.filter(x => x.hoofd.some(h => h.id === i.hoofd[0].id)).length > 1) {
        problemen.push(`${i.hoofd[0].naam} staat meer dan eens in percelen; geef alle rijen van dit perceel in één item op (bijv. "1-3, 10-12").`);
        continue;
      }
      doelen.push({ perceel: i.hoofd[0], tekst: i.rijen, genoemd: i.plots });
    }
  }

  const e = eenheden[0];
  const keuzes: RijenKeuze[] = [];
  if (!e) return keuzes;
  const naamVan = (id: string) => ctx.parcels.find(p => p.id === id)?.name ?? `onbekend blok ${id.slice(0, 8)}`;
  for (const d of doelen) {
    const r = await rijenNaarPlots(ctx.userId, d.perceel, d.tekst);
    if (r.fouten) { problemen.push(...r.fouten); continue; }
    const k = r.keuze;
    const subsVanPerceel = ctx.parcels.filter(p => p.parcelId === d.perceel.id).map(p => p.id);
    // Tegenspraak: een bepaald blok (subperceel) genoemd, maar de rijen liggen (deels) in een ander blok
    const genoemd = d.genoemd.filter(id => subsVanPerceel.includes(id));
    const buiten = k.plots.filter(id => !genoemd.includes(id));
    if (genoemd.length > 0 && genoemd.length < subsVanPerceel.length && buiten.length > 0) {
      const bereik = rijenBereik(k.nummers);
      const tekst = `${bereik.charAt(0).toUpperCase()}${bereik.slice(1)} van ${d.perceel.naam} ${k.nummers.length === 1 ? 'ligt' : 'liggen (deels)'} in ${buiten.map(naamVan).join(', ')}, niet in ${genoemd.map(naamVan).join(', ')}`;
      if (items.length > 0) {
        problemen.push(`${tekst}. Noem het hele perceel (${d.perceel.naam}) of kies rijen binnen het genoemde blok.`);
        continue;
      }
      notities.push(`let op: ${tekst.charAt(0).toLowerCase()}${tekst.slice(1)}; de rijen bepalen waar gespoten is`);
    }
    // Plots van dit hoofdperceel vervangen (op dezelfde plek in de lijst) door de subpercelen van de rijen,
    // in de volgorde waarin ze al stonden
    const volgorde = (id: string) => {
      const i = e.plots.indexOf(id);
      return i >= 0 ? i : e.plots.length + ctx.parcels.findIndex(p => p.id === id);
    };
    const rijPlots = [...k.plots].sort((a, b) => volgorde(a) - volgorde(b));
    const vanPerceel = new Set([...subsVanPerceel, ...k.plots]);
    const plots: string[] = [];
    let ingevoegd = false;
    for (const id of e.plots) {
      if (!vanPerceel.has(id)) { plots.push(id); continue; }
      if (!ingevoegd) { plots.push(...rijPlots); ingevoegd = true; }
    }
    if (!ingevoegd) plots.push(...rijPlots);
    e.plots = plots;
    for (const id of Object.keys(e.plotAreas)) if (vanPerceel.has(id)) delete e.plotAreas[id];
    Object.assign(e.plotAreas, k.plotAreas);
    keuzes.push(k);
  }
  return keuzes;
}

export async function registreerBespuiting(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const tekst = str(args.tekst);
  const heeftPercelen = Array.isArray(args.percelen) && (args.percelen as unknown[]).length > 0;
  const heeftMiddelen = Array.isArray(args.middelen) && (args.middelen as unknown[]).length > 0;
  if (!tekst && !(heeftPercelen && heeftMiddelen)) {
    return { tekst: 'Geef de registratie als tekst, of geef percelen én middelen op.', fout: true };
  }

  const problemen: string[] = [];
  const notities: string[] = [];
  const historie = await getUserProductNames(ctx.userId);
  let eenheden: Eenheid[] = [];
  let pipelineDatum: Date | null = null;
  let pipelineType: RegistrationType | undefined;

  // 0. Rijenkaart (beta): rijnummers in de vrije tekst ("rij 1 t/m 20", "rijen 3-7 en 12") eruit halen,
  //    anders leest de pipeline ze als dosering of datum. Alleen als de tekst de percelen bepaalt (geen
  //    gestructureerde percelen: dan is tekst alleen de bewaarde invoer) en de gebruiker rijen heeft.
  //    Zonder rijen: tekst ongewijzigd.
  const explicieteRijen = !!rijenArg(args.rijen)
    || (Array.isArray(args.percelen) && (args.percelen as unknown[]).some(item => !!item && typeof item === 'object' && !!rijenArg((item as Args).rijen)));
  let tekstRijen = tekst && !heeftPercelen ? await rijenUitTekst(ctx, tekst) : null;
  let leesTekst = tekstRijen ? tekstRijen.rest : tekst;

  // 1. Tekst parsen als percelen of middelen niet gestructureerd zijn opgegeven
  const leesTekstIn = async (invoerTekst: string) => {
    const prefs = await getUserPreferencesAdmin(ctx.userId);
    const { text: invoer, substitutions } = applyUserPreferencesToText(invoerTekst, prefs);
    const voorkeurNotities = substitutions.map(s => `${s.to} ← "${s.from}" (jouw voorkeur)`);
    const result = await runRegistrationPipeline(invoer, ctx.userId);
    if (!result.registration) return { voorkeurNotities, registratie: null };
    const lastUsed = await getLastUsedDosagesForUser(
      ctx.userId,
      result.registration.units.flatMap(u => u.products).filter(p => !p.dosage).map(p => p.product)
    );
    const units: Eenheid[] = result.registration.units.map(u => {
      const e = enrichUnit(u.products, ctx.products, historie, lastUsed);
      return {
        plots: u.plots,
        plotAreas: {},
        products: e.products.map(p => ({ ...p, product: p.resolved === false ? schoneMiddelNaam(p.product) || p.product : p.product })),
        label: u.label,
        aannames: e.assumptions.map(a => `${a.field === 'product' ? `${a.to} ← ${a.from}` : `${a.to}`} (${a.reason})`),
      };
    });
    return {
      voorkeurNotities,
      registratie: { datum: new Date(result.registration.date), type: result.registration.registrationType, eenheden: units },
    };
  };
  if (tekst && (!heeftPercelen || !heeftMiddelen)) {
    let gelezen = await leesTekstIn(leesTekst);
    // Rijen uit de tekst gelden alleen als de registratie precies één perceel raakt dat zelf actieve rijen
    // heeft; anders de oorspronkelijke tekst opnieuw lezen, precies zoals zonder rijenkaart (niet blokkeren)
    if (tekstRijen && !explicieteRijen) {
      const units = gelezen.registratie?.eenheden ?? [];
      const ps = units.length === 1 ? (units[0].plots.map(id => ctx.parcels.find(p => p.id === id)).filter(Boolean) as SprayableParcel[]) : [];
      const hoofd = hoofdpercelenVan(ps);
      if (hoofd.length !== 1 || !(await perceelHeeftActieveRijen(ctx.userId, hoofd[0].id))) {
        tekstRijen = null;
        leesTekst = tekst;
        gelezen = await leesTekstIn(tekst);
      }
    }
    notities.push(...gelezen.voorkeurNotities);
    if (gelezen.registratie) {
      pipelineDatum = gelezen.registratie.datum;
      pipelineType = gelezen.registratie.type;
      eenheden = gelezen.registratie.eenheden;
    } else if (!heeftPercelen && !heeftMiddelen) {
      return { tekst: `Dit lees ik niet als een registratie: "${tekst}". Noem percelen én middelen, of geef ze op via percelen/middelen.`, fout: true };
    }
  }

  // 2. Gestructureerde invoer heeft voorrang → één eenheid
  if (heeftPercelen || heeftMiddelen) {
    const p = heeftPercelen ? resolvePercelenInvoer(ctx, args.percelen) : null;
    const m = heeftMiddelen ? resolveMiddelenInvoer(ctx, args.middelen, historie) : null;
    if (p) problemen.push(...p.problemen);
    if (m) problemen.push(...m.problemen);
    const plots = p ? p.plots : [...new Set(eenheden.flatMap(e => e.plots))];
    let products = m ? m.products : eenheden[0]?.products ?? [];
    if (!m && eenheden.length > 1) problemen.push('De tekst bevat meerdere varianten (verschillende middelen per perceel); geef de middelen expliciet op, of registreer per variant.');
    if (!p && plots.length === 0) problemen.push(`Geen percelen herkend${tekst ? ` in "${tekst}"` : ''}. Geef ze op via percelen. Bekende percelen: ${ctx.parcels.map(x => x.name).join(', ')}.`);
    if (!m) products = products.map(x => x);
    eenheden = [{ plots, plotAreas: p ? p.plotAreas : {}, products, aannames: m ? [] : eenheden.flatMap(e => e.aannames) }];
  } else if (tekst) {
    // Alleen tekst: "helft van", "3,33 ha" toepassen als het eenduidig is
    const deel = deelUitTekst(leesTekst);
    if (deel) {
      if (explicieteRijen || tekstRijen) {
        problemen.push(`In de tekst staat een deel ("${deel.woord}") én er zijn rijen opgegeven; kies één van beide.`);
      } else if (eenheden.length === 1) {
        const ps = eenheden[0].plots.map(id => ctx.parcels.find(x => x.id === id)).filter(Boolean) as SprayableParcel[];
        verdeel(ps, { factor: deel.factor ?? null, ha: deel.ha ?? null }, eenheden[0].plotAreas, problemen, ps.length === 1 ? ps[0].name : 'de percelen');
        notities.push(`gespoten deel uit de tekst: "${deel.woord}"`);
      } else {
        problemen.push(`In de tekst staat een deel ("${deel.woord}"), maar niet eenduidig bij welk perceel. Geef het op via percelen met deel of ha.`);
      }
    }
  }

  // 2b. Rijenkaart (beta): rijen → plots + gespoten oppervlak van dat perceel (zonder rijen: niets)
  if (tekstRijen) {
    const woorden = tekstRijen.gevonden.map(g => `"${g}"`).join(', ');
    notities.push(explicieteRijen ? `rijen in de tekst (${woorden}) genegeerd; de opgegeven rijen gelden` : `rijen uit de tekst: ${woorden}`);
  }
  const rijKeuzes = await pasRijenToe(ctx, args, eenheden, problemen, notities, explicieteRijen ? undefined : tekstRijen?.selectie);

  // 3. Controles + totalen verdelen over gespoten oppervlak
  for (const e of eenheden) {
    const opp = oppervlak(ctx, e.plots, e.plotAreas);
    e.products = verdeelTotalen(e.products, opp.gespoten);
    if (e.plots.length === 0 && !problemen.some(x => x.startsWith('Geen percelen'))) problemen.push(`Geen percelen herkend${tekst ? ` in "${tekst}"` : ''}. Bekende percelen: ${ctx.parcels.map(x => x.name).join(', ')}.`);
    if (e.products.length === 0) problemen.push('Geen middelen herkend.');
    for (const p of e.products) if (!(p.dosage > 0)) problemen.push(`Dosering voor ${p.product} ontbreekt (per ha, of totaal).`);
  }

  const moment = bepaalMoment(args.datum, args.tijd, leesTekst, pipelineDatum);
  const type: RegistrationType =
    str(args.type) === 'strooien' ? 'spreading' : str(args.type) === 'spuiten' ? 'spraying'
      : pipelineType ?? (/\b(gestrooid|strooien|uitgereden|kunstmest)\b/i.test(tekst) ? 'spreading' : 'spraying');
  const opmerking = str(args.opmerking) || null;

  const voorstel: string[] = [];
  const validaties: Array<{ message: string | null; warnings: string[] }> = [];
  for (const [i, e] of eenheden.entries()) {
    if (eenheden.length > 1) voorstel.push(`Deel ${i + 1}${e.label ? ` (${e.label})` : ''}:`);
    voorstel.push(...registratieBlok(ctx, { date: moment, plots: e.plots, products: e.products, plotAreas: e.plotAreas, registrationType: type, notes: opmerking, ...(i === 0 && rijKeuzes.length ? { rijen: rijKeuzes.map(rijenKeuzeTekst) } : {}) }));
    for (const a of e.aannames) voorstel.push(`  · aanname: ${a}`);
    const v = await valideer(ctx, e.plots, e.products, moment);
    problemen.push(...v.errors.map(x => `Blokkerend: ${x}`));
    validaties.push(v);
  }
  for (const n of notities) voorstel.push(`  · ${n}`);
  const warnings = [...new Set(validaties.flatMap(v => v.warnings))];
  if (warnings.length) voorstel.push('', 'Waarschuwingen:', ...warnings.map(w => `- ${w}`));

  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...[...new Set(problemen)].map(p => `- ${p}`), '', 'Voorstel tot nu toe:', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep dan opnieuw aan met bevestig=true en exact dezelfde argumenten.'].join('\n') };

  const rawInput = tekst || eenheden.map(e => `${e.plots.map(id => ctx.parcels.find(p => p.id === id)?.name).join(', ')} met ${e.products.map(p => `${p.product} ${f(p.dosage, 3)} ${p.unit}/ha`).join(', ')}`).join('; ')
    + (rijKeuzes.length ? ` (${rijKeuzes.map(k => `${k.perceelNaam} ${rijenBereik(k.nummers)}`).join(', ')})` : '');
  const rijIds = rijKeuzes.flatMap(k => k.rijIds);
  const opgeslagen: string[] = [];
  for (const [i, e] of eenheden.entries()) {
    const r = await confirmRegistration(
      {
        userId: ctx.userId,
        plots: e.plots,
        products: e.products.map(opslagMiddel),
        date: moment,
        rawInput,
        validationMessage: validaties[i]?.message ?? null,
        registrationType: type,
        registrationSource: 'claude',
        plotAreas: e.plotAreas,
        notes: opmerking,
        // Rijenkaart (beta): rijen alleen bij één eenheid (afgedwongen in pasRijenToe)
        ...(i === 0 && rijIds.length ? { rijIds } : {}),
      },
      async ({ logbookEntry, sprayableParcels, isConfirmation, spuitschriftId }) => {
        await addParcelHistoryEntries({ logbookEntry, sprayableParcels, isConfirmation, spuitschriftId, providedUserId: ctx.userId });
      }
    );
    if (!r.success) return { tekst: `Opslaan mislukt: ${r.message}${opgeslagen.length ? ` (al opgeslagen: ${opgeslagen.join(', ')})` : ''}`, fout: true };
    if (r.spuitschriftId) opgeslagen.push(r.spuitschriftId.slice(0, 8));
    await mirrorRegistrationToFieldNotes({ userId: ctx.userId, rawInput, registrationType: type, spuitschriftId: r.spuitschriftId, source: 'claude' });
  }
  invalidateContextCache(ctx.userId);
  return { tekst: [`Opgeslagen in spuitschrift ✓ (code ${opgeslagen.join(', ')})`, ...voorstel].join('\n') };
}

// ── bespuiting_aanpassen ────────────────────────────────────────────────

async function zoekRegistraties(ctx: McpContext, args: Args): Promise<{ rows: Registratie[]; gezocht: boolean }> {
  const admin = getSupabaseAdmin();
  const code = str(args.code).toLowerCase().replace(/[\[\]\s]/g, '');
  if (code) {
    const { data } = await admin.from('spuitschrift').select(KOLOMMEN).eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(1000);
    return { rows: (data || []).filter((r: any) => r.id.toLowerCase().startsWith(code)).map(rij), gezocht: true };
  }
  const gezocht = !!(str(args.datum) || str(args.perceel) || str(args.middel));
  let q = admin.from('spuitschrift').select(KOLOMMEN).eq('user_id', ctx.userId);
  if (str(args.datum)) {
    const d = bepaalMoment(args.datum, '', '');
    const van = new Date(d); van.setHours(0, 0, 0, 0);
    const tot = new Date(d); tot.setHours(23, 59, 59, 999);
    q = q.gte('date', van.toISOString()).lte('date', tot.toISOString());
  }
  const { data } = await q.order(gezocht ? 'date' : 'created_at', { ascending: false }).limit(gezocht ? 300 : 1);
  let rows = (data || []).map(rij);
  if (str(args.perceel)) {
    const ids = new Set(percelenVanNaam(ctx, str(args.perceel)).map(p => p.id));
    rows = rows.filter(r => r.plots.some(id => ids.has(id)));
  }
  if (str(args.middel)) {
    const m = normaliseer(str(args.middel));
    rows = rows.filter(r => r.products.some(p => normaliseer(p.product).includes(m)));
  }
  return { rows: rows.slice(0, 20), gezocht };
}

export async function bespuitingAanpassen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const { rows, gezocht } = await zoekRegistraties(ctx, args);
  if (rows.length === 0) return { tekst: gezocht ? 'Geen registratie gevonden met die zoekgegevens. Gebruik bespuitingen om codes op te zoeken.' : 'Er staan nog geen registraties in het spuitschrift.', fout: true };
  if (rows.length > 1) {
    const rijenPerRegistratie = await rijenTekstVoorBespuitingen(ctx.userId, rows.map(r => r.id));
    return { tekst: [`${rows.length} registraties gevonden — kies er één en roep opnieuw aan met code:`, ...rows.map(r => `- ${regKorte(ctx, r, rijenPerRegistratie[r.id])}`)].join('\n') };
  }
  const was = rows[0];
  const historie = await getUserProductNames(ctx.userId);
  const problemen: string[] = [];
  // Rijenkaart (beta): bestaande rijkoppelingen van deze registratie (meestal geen)
  let koppelingenOnbekend = false;
  const koppelingen: BespuitingRijKoppeling[] = await rijKoppelingenVanBespuiting(ctx.userId, was.id).catch(err => {
    console.warn('[mcp] rijkoppelingen ophalen mislukt:', err instanceof Error ? err.message : err);
    koppelingenOnbekend = true;
    return [];
  });
  const rijenRegel = (lijst: BespuitingRijKoppeling[]) => (lijst.length ? { rijen: [koppelingenTekst(ctx, lijst)] } : {});

  // ── Verwijderen
  if (args.verwijderen === true) {
    const blok = registratieBlok(ctx, { ...was, notes: was.notes, ...rijenRegel(koppelingen) });
    if (args.bevestig !== true) return { tekst: ['VOORSTEL — deze registratie VERWIJDEREN (nog niet gedaan):', `[${was.id.slice(0, 8)}]`, ...blok, '', 'Voorraad en middelverbruik worden teruggeboekt. Zeker weten? Roep opnieuw aan met verwijderen=true, bevestig=true en code.'].join('\n') };
    await deleteSpuitschriftEntry(was.id, ctx.userId);
    await removeSprayTaskLogs({ userId: ctx.userId, date: was.date, plotIds: was.plots, products: was.products });
    await (getSupabaseAdmin() as any).from('field_notes').delete().eq('user_id', ctx.userId).eq('spuitschrift_id', was.id).eq('status', 'transferred');
    invalidateContextCache(ctx.userId);
    return { tekst: [`Verwijderd ✓ [${was.id.slice(0, 8)}] — voorraad en middelverbruik teruggeboekt.`, ...blok].join('\n') };
  }

  // ── Wijzigen
  let plots = [...was.plots];
  let plotAreas: PlotAreas = { ...was.plotAreas };
  let products: ProductEntry[] = was.products.map(p => ({ ...p }));
  let date = new Date(was.date);
  let notes = was.notes;
  const wijzigingen: string[] = [];

  if (Array.isArray(args.percelen) && (args.percelen as unknown[]).length) {
    const r = resolvePercelenInvoer(ctx, args.percelen);
    problemen.push(...r.problemen);
    plots = r.plots;
    plotAreas = r.plotAreas;
    wijzigingen.push('percelen vervangen');
  }
  if (Array.isArray(args.perceel_toevoegen) && (args.perceel_toevoegen as unknown[]).length) {
    const r = resolvePercelenInvoer(ctx, args.perceel_toevoegen);
    problemen.push(...r.problemen);
    for (const id of r.plots) {
      if (!plots.includes(id)) plots.push(id);
      if (r.plotAreas[id] != null) plotAreas[id] = r.plotAreas[id];
      else delete plotAreas[id];
    }
    wijzigingen.push('percelen toegevoegd/deel aangepast');
  }
  if (Array.isArray(args.perceel_weghalen) && (args.perceel_weghalen as unknown[]).length) {
    for (const naam of (args.perceel_weghalen as unknown[]).map(x => str(x)).filter(Boolean)) {
      const ids = percelenVanNaam(ctx, naam).map(p => p.id).filter(id => plots.includes(id));
      if (!ids.length) problemen.push(`Perceel "${naam}" zit niet in deze registratie.`);
      plots = plots.filter(id => !ids.includes(id));
      for (const id of ids) delete plotAreas[id];
    }
    wijzigingen.push('percelen weggehaald');
  }
  if (Array.isArray(args.middel_weghalen) && (args.middel_weghalen as unknown[]).length) {
    for (const naam of (args.middel_weghalen as unknown[]).map(x => str(x)).filter(Boolean)) {
      const n = normaliseer(naam);
      const voor = products.length;
      products = products.filter(p => !normaliseer(p.product).includes(n) && !n.includes(normaliseer(p.product)));
      if (products.length === voor) problemen.push(`Middel "${naam}" zit niet in deze registratie (${was.products.map(p => p.product).join(', ')}).`);
    }
    wijzigingen.push('middelen weggehaald');
  }
  if (Array.isArray(args.dosering_wijzigen) && (args.dosering_wijzigen as unknown[]).length) {
    for (const item of args.dosering_wijzigen as Args[]) {
      const n = normaliseer(str(item.naam));
      const p = products.find(x => normaliseer(x.product).includes(n) || n.includes(normaliseer(x.product)));
      if (!p) { problemen.push(`Middel "${str(item.naam)}" zit niet in deze registratie; gebruik middel_toevoegen.`); continue; }
      const totaal = num(item.totaal);
      if (totaal != null) { p.totalAmount = totaal; p.dosage = 0; }
      else if (num(item.dosering) != null) { p.dosage = num(item.dosering)!; delete p.totalAmount; }
      if (str(item.eenheid)) p.unit = eenheidArg(item.eenheid, p.unit);
    }
    wijzigingen.push('dosering gewijzigd');
  }
  if (Array.isArray(args.middel_toevoegen) && (args.middel_toevoegen as unknown[]).length) {
    const r = resolveMiddelenInvoer(ctx, args.middel_toevoegen, historie);
    problemen.push(...r.problemen);
    for (const p of r.products) {
      if (products.some(x => normaliseer(x.product) === normaliseer(p.product))) problemen.push(`${p.product} zit er al in; gebruik dosering_wijzigen.`);
      else products.push(p);
    }
    wijzigingen.push('middelen toegevoegd');
  }
  if (str(args.nieuwe_datum) || str(args.nieuwe_tijd)) {
    const basis = str(args.nieuwe_datum) ? bepaalMoment(args.nieuwe_datum, '', '') : new Date(was.date);
    const t = str(args.nieuwe_tijd) ? parseTijd(str(args.nieuwe_tijd)) : null;
    if (str(args.nieuwe_tijd) && !t) problemen.push(`Tijd "${str(args.nieuwe_tijd)}" begrijp ik niet (bijv. "20:00").`);
    date = new Date(basis);
    if (t) date.setHours(t.h, t.m, 0, 0);
    else if (!str(args.nieuwe_datum)) date = new Date(was.date);
    else if (str(args.nieuwe_datum) && !/\d{1,2}:\d{2}/.test(str(args.nieuwe_datum))) date.setHours(was.date.getHours(), was.date.getMinutes(), 0, 0);
    wijzigingen.push('datum/tijd gewijzigd');
  }
  if (typeof args.opmerking === 'string') {
    notes = str(args.opmerking) || null;
    wijzigingen.push('opmerking');
  }
  const rijenInPercelen = [args.percelen, args.perceel_toevoegen].some(v =>
    Array.isArray(v) && (v as unknown[]).some(item => !!item && typeof item === 'object' && !!rijenArg((item as Args).rijen)));
  if (rijenInPercelen) {
    problemen.push('Rijen kun je niet via bespuiting_aanpassen wijzigen. Verwijder de registratie en registreer hem opnieuw met rijen, of pas de rijen aan in CropNode.');
  }

  const wasBlok = registratieBlok(ctx, { ...was, ...rijenRegel(koppelingen) });
  if (wijzigingen.length === 0) {
    return { tekst: [`Gevonden [${was.id.slice(0, 8)}] — geen wijziging opgegeven:`, ...wasBlok, '', 'Geef aan wat er moet veranderen (middel_toevoegen, middel_weghalen, dosering_wijzigen, percelen, perceel_toevoegen, perceel_weghalen, nieuwe_datum, nieuwe_tijd, opmerking) of verwijderen=true.'].join('\n') };
  }

  // Totalen opnieuw over het (nieuwe) gespoten oppervlak verdelen
  for (const id of Object.keys(plotAreas)) if (!plots.includes(id)) delete plotAreas[id];
  const opp = oppervlak(ctx, plots, plotAreas);
  products = verdeelTotalen(products, opp.gespoten);
  if (plots.length === 0) problemen.push('Na deze wijziging blijven er geen percelen over; gebruik verwijderen=true om de hele registratie te verwijderen.');
  // Rijenkaart (beta): konden de rijkoppelingen niet gelezen worden, dan geen percelen of perceel-delen wijzigen
  // (anders blijven koppelingen naar rijen staan die er niet meer bij horen); middel/datum/opmerking mag wel
  const plotsGewijzigd = plots.length !== was.plots.length || plots.some(id => !was.plots.includes(id) || plotAreas[id] !== was.plotAreas[id]);
  if (koppelingenOnbekend && plotsGewijzigd) problemen.push('De rijkoppelingen (rijenkaart) konden niet worden gecontroleerd; probeer het zo opnieuw.');
  if (products.length === 0) problemen.push('Na deze wijziging blijven er geen middelen over; gebruik verwijderen=true om de hele registratie te verwijderen.');
  for (const p of products) if (!(p.dosage > 0)) problemen.push(`Dosering voor ${p.product} ontbreekt (per ha, of totaal).`);

  // Rijkoppeling blijft alleen als het subperceel van de rij er nog in staat met hetzelfde gespoten deel
  const rijBlijft = (k: BespuitingRijKoppeling) => {
    const subs = k.subParcelId ? [k.subParcelId] : ctx.parcels.filter(p => p.parcelId === k.perceelId).map(p => p.id);
    return subs.some(id => plots.includes(id) && plotAreas[id] === was.plotAreas[id]);
  };
  const blijvendeRijen = koppelingen.filter(rijBlijft);
  const vervallenRijen = koppelingen.filter(k => !rijBlijft(k));

  const v = await valideer(ctx, plots, products, date, was.id);
  problemen.push(...v.errors.map(x => `Blokkerend: ${x}`));
  const wordtBlok = registratieBlok(ctx, { date, plots, products, plotAreas, registrationType: was.registrationType, notes, ...rijenRegel(blijvendeRijen) });
  const rijMelding = vervallenRijen.length
    ? ['', `Rijkoppeling vervalt: ${koppelingenTekst(ctx, vervallenRijen)} — dat subperceel staat er niet meer (met hetzelfde gespoten deel) in.`]
    : [];
  const voorstel = [`Registratie [${was.id.slice(0, 8)}]`, '', 'WAS:', ...wasBlok, '', 'WORDT:', ...wordtBlok, ...rijMelding, ...(v.warnings.length ? ['', 'Waarschuwingen:', ...v.warnings.map(w => `- ${w}`)] : [])];

  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...[...new Set(problemen)].map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met dezelfde argumenten + code en bevestig=true.'].join('\n') };

  await updateSpuitschriftEntry(
    was.id,
    {
      date,
      plots,
      products: products.map(opslagMiddel),
      plotAreas,
      notes,
      validationMessage: v.message,
      status: v.warnings.length ? 'Waarschuwing' : 'Akkoord',
    },
    ctx.userId
  );
  // Automatische spuituren opnieuw berekenen (met gespoten oppervlak)
  await removeSprayTaskLogs({ userId: ctx.userId, date: was.date, plotIds: was.plots, products: was.products });
  if (was.registrationType === 'spraying') {
    await createSprayTaskLogs({
      userId: ctx.userId,
      plotIds: plots,
      date,
      products,
      sprayableParcels: ctx.parcels.filter(p => plots.includes(p.id)).map(p => (plotAreas[p.id] != null ? { ...p, area: plotAreas[p.id] } : p)),
    }).catch(err => console.warn('[mcp] spuituren herberekenen mislukt:', err));
  }
  invalidateContextCache(ctx.userId);
  if (vervallenRijen.length) {
    try {
      await ontkoppelRijenVanBespuiting(ctx.userId, was.id, vervallenRijen.map(k => k.rijId));
    } catch (err) {
      return {
        tekst: [`Aangepast ✓ [${was.id.slice(0, 8)}], maar de rijkoppeling (${koppelingenTekst(ctx, vervallenRijen)}) kon niet worden verwijderd: ${err instanceof Error ? err.message : String(err)}`, ...wordtBlok].join('\n'),
        fout: true,
      };
    }
  }
  return {
    tekst: [
      `Aangepast ✓ [${was.id.slice(0, 8)}] — voorraad, middelverbruik, perceelhistorie en spuituren bijgewerkt.`,
      ...wordtBlok,
      ...(vervallenRijen.length ? [`Rijkoppeling verwijderd: ${koppelingenTekst(ctx, vervallenRijen)}`] : []),
    ].join('\n'),
  };
}
