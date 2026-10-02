/** Gedeelde hulpjes voor de CropNode MCP-tools (fuzzy zoeken, tekst, datums, opmaak). */

import type { SprayableParcel } from '@/lib/supabase-store';
import type { ProductEntry } from '@/lib/types';
import type { McpContext } from './context';

export interface ToolDefinitie {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResultaat {
  tekst: string;
  fout?: boolean;
}

export type Args = Record<string, unknown>;

// ── Fuzzy zoeken (zelfde als StoreNode) ─────────────────────────────────

export function normaliseer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function score(zoek: string, kandidaat: string): number {
  const z = normaliseer(zoek);
  const k = normaliseer(kandidaat);
  if (!z || !k) return 0;
  if (z === k) return 100;
  // Heel korte namen ("N+" → "n") mogen niet via begin/bevat matchen
  const kortste = Math.min(z.length, k.length);
  if (kortste >= 3 && (k.startsWith(z) || z.startsWith(k))) return 85;
  if (kortste >= 3 && (k.includes(z) || z.includes(k))) return 70;
  const zw = z.split(' ');
  const kw = k.split(' ');
  const gedeeld = zw.filter(w => kw.some(x => x.startsWith(w) || w.startsWith(x))).length;
  if (gedeeld === 0) return 0;
  return Math.round((gedeeld / Math.max(zw.length, kw.length)) * 60);
}

export interface Match<T> {
  beste: T | null;
  zekerheid: number;
  alternatieven: T[];
}

export function zoek<T>(zoekterm: string, lijst: T[], naam: (x: T) => string): Match<T> {
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
export function percelenVanNaam(ctx: McpContext, naam: string): SprayableParcel[] {
  const n = normaliseer(naam);
  if (!n) return [];
  const groep = ctx.groups.find(g => normaliseer(g.name) === n);
  if (groep) return ctx.parcels.filter(p => groep.subParcelIds.includes(p.id));
  // Exact main-parcel name ("jachthoek") → all its blocks; otherwise strong matches on the block name.
  const hoofd = ctx.parcels.filter(p => normaliseer((p as any).parcelName || '') === n);
  if (hoofd.length) return hoofd;
  const sterk = ctx.parcels.filter(p => score(naam, p.name) >= 85);
  if (sterk.length) return sterk;
  // Synoniemen (sub_parcels.synonyms), bijv. oude namen van samengevoegde blokken
  const viaSynoniem = ctx.parcels.filter(p => (p.synonyms || []).some(syn => normaliseer(syn) === n));
  if (viaSynoniem.length) return viaSynoniem;
  const m = zoek(naam, ctx.parcels, p => p.name);
  return m.beste && m.zekerheid >= 60 ? [m.beste, ...m.alternatieven.filter(a => score(naam, a.name) === m.zekerheid)] : [];
}

// ── Tekst-hulpjes ────────────────────────────────────────────────────────

export const str = (v: unknown, standaard = '') => (typeof v === 'string' ? v.trim() : standaard);
export const num = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : null;
export const f = (n: number, d = 1) => n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: d });

export function datumArg(v: unknown, fallback = new Date()): Date {
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

export const dd = (d: Date) => d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
export const ddt = (d: Date) => d.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const dagenGeleden = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

export function perceelLabel(p: SprayableParcel): string {
  return `${p.name}${p.area ? ` (${f(p.area, 2)} ha)` : ''}`;
}

export function perceelNamen(ctx: McpContext, ids: string[]): { tekst: string; ha: number } {
  const ps = ids.map(id => ctx.parcels.find(p => p.id === id)).filter(Boolean) as SprayableParcel[];
  const ha = ps.reduce((s, p) => s + (p.area || 0), 0);
  const namen = ps.map(p => p.name);
  const onbekend = ids.length - ps.length;
  return { tekst: `${namen.join(', ')}${onbekend ? ` (+${onbekend} onbekend)` : ''}${ha ? ` · ${f(ha, 2)} ha` : ''}`, ha };
}

export function middelRegel(p: ProductEntry, ha: number): string {
  const eenheid = (p.unit || 'L').replace('/ha', '');
  const totaal = ha > 0 && p.dosage > 0 ? ` (${f(p.dosage * ha, 2)} ${eenheid} totaal)` : '';
  const bron = p.source === 'fertilizer' ? ' [meststof]' : '';
  return `${p.product}${bron} ${p.dosage > 0 ? `${f(p.dosage, 3)} ${eenheid}/ha${totaal}` : '— dosering ontbreekt'}`;
}


/** Pipeline flags can be one multi-line message; split into lines. */
export function splitFlag(message: string): string[] {
  return message.split('\n').map(l => l.trim()).filter(Boolean);
}

/** Collapse per-parcel "Eerste toepassing van X" lines into one line per product; cap the rest. */
export function compactWarnings(messages: string[]): string[] {
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

/**
 * Middelen die niet in de CTGB-/meststoffendatabase staan blokkeren niet: ze worden
 * opgeslagen onder de naam die de gebruiker gaf (bijv. "huwasan"). Wel melden we het,
 * met eventuele suggesties, zodat de gebruiker een tikfout nog kan corrigeren.
 */
export function onbekendNotitie(p: ProductEntry): string {
  if (p.resolved !== false) return '';
  const sugg = p.suggestions?.length ? `; bedoelde je ${p.suggestions.slice(0, 3).map(s => s.naam).join(' / ')}?` : '';
  return ` — staat niet in de database, wordt opgeslagen als "${p.product}"${sugg}`;
}

/** Strip parse-only fields before saving to the spuitschrift. */
export function opslagMiddel(p: ProductEntry): ProductEntry {
  const { suggestions: _s, resolved: _r, availableDoelorganismen: _d, ...rest } = p;
  return rest;
}

