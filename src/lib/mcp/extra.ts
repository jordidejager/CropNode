/**
 * Overige registraties via de CropNode MCP: uren (task_logs), voorraad (leveringen/correcties)
 * en veldnotities aanpassen. Schrijven via voorstel → bevestig=true (veldnotities aanpassen
 * direct, verwijderen wel met bevestig).
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { getStockForUser } from '@/lib/inventory-stock';
import type { McpContext } from './context';
import { resolvePercelenInvoer, vindProduct, bepaalMoment } from './spray';
import { getUserProductNames } from '@/lib/supabase-store';
import { dd, ddt, f, normaliseer, num, percelenVanNaam, str, zoek, type Args, type ToolDefinitie, type ToolResultaat } from './util';

const isoDag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Werkdagen zoals de app rekent: ma–vr 1, za 0,5, zo 0 (minimaal 1). */
function werkdagen(van: Date, tot: Date): number {
  let n = 0;
  const c = new Date(van); c.setHours(0, 0, 0, 0);
  const e = new Date(tot); e.setHours(0, 0, 0, 0);
  while (c <= e) { const w = c.getDay(); n += w === 0 ? 0 : w === 6 ? 0.5 : 1; c.setDate(c.getDate() + 1); }
  return n || 1;
}

export const EXTRA_TOOLS: ToolDefinitie[] = [
  {
    name: 'uren',
    description: 'Urenregistratie van een periode: totaal per taak en de regels (code, datum, taak, personen × uren, perceel, opmerking). Ook de lijst met taaktypes.',
    inputSchema: {
      type: 'object',
      properties: {
        dagen: { type: 'number', description: 'Aantal dagen terug (standaard 14).' },
        taak: { type: 'string', description: 'Alleen deze taak.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'uren_registreren',
    description:
      'Registreert gewerkte uren. uren = uren PER PERSOON per dag; personen standaard 1. Meerdere dagen: datum = eerste dag, tot_datum = laatste dag (werkdagen: ma–vr 1, za 0,5, zo 0). Optioneel één perceel. Taak moet een bestaand taaktype zijn (zie uren), of nieuwe_taak=true om het aan te maken. Spuituren worden automatisch uit het spuitschrift berekend; die hoef je niet apart te registreren. Eerst VOORSTEL, opslaan met bevestig=true.',
    inputSchema: {
      type: 'object',
      properties: {
        taak: { type: 'string', description: 'Bijv. "snoeien", "dunnen", "plukken".' },
        uren: { type: 'number', description: 'Uren per persoon per dag.' },
        personen: { type: 'number' },
        datum: { type: 'string', description: '"vandaag" (standaard), "gisteren", YYYY-MM-DD.' },
        tot_datum: { type: 'string', description: 'Laatste dag bij een meerdaagse klus.' },
        perceel: { type: 'string' },
        opmerking: { type: 'string' },
        nieuwe_taak: { type: 'boolean', description: 'true = taaktype aanmaken als het nog niet bestaat.' },
        bevestig: { type: 'boolean' },
      },
      required: ['taak', 'uren'],
      additionalProperties: false,
    },
  },
  {
    name: 'uren_aanpassen',
    description: 'Corrigeert of verwijdert een urenregel (code uit de tool uren). Wijzig uren, personen, datum, taak, perceel of opmerking, of verwijderen=true. Eerst VOORSTEL, dan bevestig=true.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        uren: { type: 'number' },
        personen: { type: 'number' },
        datum: { type: 'string' },
        taak: { type: 'string' },
        perceel: { type: 'string', description: 'Lege string = geen perceel.' },
        opmerking: { type: 'string' },
        verwijderen: { type: 'boolean' },
        bevestig: { type: 'boolean' },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'voorraad_bijwerken',
    description:
      'Voorraad van een middel of meststof bijwerken. soort "levering" (standaard): hoeveelheid erbij. soort "telling": de getelde voorraad wordt de nieuwe stand (er wordt een correctie geboekt). Verbruik door bespuitingen gaat automatisch; dat hoef je hier niet te boeken. Eerst VOORSTEL, dan bevestig=true.',
    inputSchema: {
      type: 'object',
      properties: {
        middel: { type: 'string' },
        hoeveelheid: { type: 'number', description: 'Geleverde hoeveelheid, of bij telling de getelde voorraad.' },
        eenheid: { type: 'string', description: '"L", "kg", "g" of "ml".' },
        soort: { type: 'string', enum: ['levering', 'telling'] },
        datum: { type: 'string' },
        opmerking: { type: 'string', description: 'Bijv. leverancier of pakbonnummer.' },
        bevestig: { type: 'boolean' },
      },
      required: ['middel', 'hoeveelheid'],
      additionalProperties: false,
    },
  },
  {
    name: 'veldnotitie_aanpassen',
    description: 'Past een veldnotitie aan (code uit veldnotities): tekst, status (open/done = afgehandeld), percelen; of verwijderen=true (alleen met bevestig=true). Tekst/status/percelen worden direct opgeslagen.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        tekst: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done'] },
        percelen: { type: 'array', items: { type: 'string' } },
        verwijderen: { type: 'boolean' },
        bevestig: { type: 'boolean' },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
];

// ── Uren ────────────────────────────────────────────────────────────────

async function taakTypes(userId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await (getSupabaseAdmin() as any).from('task_types').select('id, name').or(`user_id.eq.${userId},user_id.is.null`).order('name');
  return data || [];
}

function urenRegel(ctx: McpContext, r: any, taken: Array<{ id: string; name: string }>): string {
  const taak = taken.find(t => t.id === r.task_type_id)?.name ?? '?';
  const perceel = r.sub_parcel_id ? ctx.parcels.find(p => p.id === r.sub_parcel_id)?.name ?? '?' : null;
  const periode = r.start_date === r.end_date ? dd(new Date(r.start_date)) : `${dd(new Date(r.start_date))} t/m ${dd(new Date(r.end_date))} (${f(Number(r.days), 1)} werkdagen)`;
  return `[${String(r.id).slice(0, 8)}] ${periode} · ${taak} · ${r.people_count} × ${f(Number(r.hours_per_person), 2)} u = ${f(Number(r.total_hours ?? r.people_count * r.hours_per_person * r.days), 2)} u${perceel ? ` · ${perceel}` : ''}${r.notes ? ` · ${r.notes}` : ''}`;
}

export async function uren(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const dagen = Math.max(1, Math.round(num(args.dagen) ?? 14));
  const sinds = isoDag(new Date(Date.now() - dagen * 86_400_000));
  const taken = await taakTypes(ctx.userId);
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('task_logs')
    .select('id, start_date, end_date, days, sub_parcel_id, task_type_id, people_count, hours_per_person, total_hours, notes')
    .eq('user_id', ctx.userId)
    .gte('end_date', sinds)
    .order('start_date', { ascending: false })
    .limit(200);
  if (error) return { tekst: `Uren ophalen mislukt: ${error.message}`, fout: true };
  let rows = data || [];
  if (str(args.taak)) {
    const m = zoek(str(args.taak), taken, t => t.name);
    rows = m.beste ? rows.filter((r: any) => r.task_type_id === m.beste!.id) : [];
  }
  const perTaak = new Map<string, number>();
  for (const r of rows) {
    const naam = taken.find(t => t.id === r.task_type_id)?.name ?? '?';
    perTaak.set(naam, (perTaak.get(naam) || 0) + Number(r.total_hours || 0));
  }
  return {
    tekst: [
      `Uren laatste ${dagen} dagen: ${f([...perTaak.values()].reduce((a, b) => a + b, 0), 1)} u`,
      ...[...perTaak.entries()].sort((a, b) => b[1] - a[1]).map(([t, u]) => `- ${t}: ${f(u, 1)} u`),
      '',
      rows.length ? 'Regels:' : 'Geen regels.',
      ...rows.slice(0, 40).map((r: any) => `- ${urenRegel(ctx, r, taken)}`),
      '',
      `Taaktypes: ${taken.map(t => t.name).join(', ')}`,
    ].join('\n'),
  };
}

function enkelPerceel(ctx: McpContext, naam: string): { id: string | null; probleem?: string } {
  if (!naam) return { id: null };
  const ps = percelenVanNaam(ctx, naam);
  if (ps.length === 1) return { id: ps[0].id };
  if (ps.length === 0) return { id: null, probleem: `Perceel "${naam}" niet gevonden.` };
  return { id: null, probleem: `"${naam}" zijn ${ps.length} blokken (${ps.map(p => p.name).join(', ')}); uren kunnen aan één blok of zonder perceel. Kies één blok of laat perceel weg.` };
}

export async function urenRegistreren(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const problemen: string[] = [];
  const taken = await taakTypes(ctx.userId);
  const taakNaam = str(args.taak);
  const m = zoek(taakNaam, taken, t => t.name);
  let taak = m.beste && m.zekerheid >= 60 ? m.beste : null;
  const nieuw = !taak && args.nieuwe_taak === true;
  if (!taak && !nieuw) problemen.push(`Taak "${taakNaam}" bestaat niet. Bestaande taken: ${taken.map(t => t.name).join(', ')}. Gebruik er één, of nieuwe_taak=true.`);
  const urenPP = num(args.uren);
  if (!urenPP || urenPP <= 0 || urenPP > 24) problemen.push('Geef uren per persoon per dag (0–24).');
  const personen = Math.max(1, Math.round(num(args.personen) ?? 1));
  const van = bepaalMoment(args.datum, '12:00', '');
  const tot = str(args.tot_datum) ? bepaalMoment(args.tot_datum, '12:00', '') : van;
  if (tot < van) problemen.push('tot_datum ligt vóór datum.');
  const dagen = isoDag(van) === isoDag(tot) ? 1 : werkdagen(van, tot);
  const perceel = enkelPerceel(ctx, str(args.perceel));
  if (perceel.probleem) problemen.push(perceel.probleem);
  const opmerking = str(args.opmerking) || null;

  const naamTaak = taak?.name ?? taakNaam;
  const voorstel = [
    `Uren: ${naamTaak}${nieuw ? ' (NIEUW taaktype)' : ''}`,
    `- ${isoDag(van) === isoDag(tot) ? dd(van) : `${dd(van)} t/m ${dd(tot)} (${f(dagen, 1)} werkdagen)`}`,
    `- ${personen} ${personen === 1 ? 'persoon' : 'personen'} × ${f(urenPP || 0, 2)} u${dagen !== 1 ? ` × ${f(dagen, 1)} dagen` : ''} = ${f(personen * (urenPP || 0) * dagen, 2)} u`,
    ...(perceel.id ? [`- Perceel: ${ctx.parcels.find(p => p.id === perceel.id)?.name}`] : []),
    ...(opmerking ? [`- Opmerking: ${opmerking}`] : []),
  ];
  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...problemen.map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met bevestig=true.'].join('\n') };

  const admin = getSupabaseAdmin() as any;
  if (nieuw) {
    const { data, error } = await admin.from('task_types').insert({ user_id: ctx.userId, name: taakNaam.charAt(0).toUpperCase() + taakNaam.slice(1) }).select('id, name').single();
    if (error) return { tekst: `Taaktype aanmaken mislukt: ${error.message}`, fout: true };
    taak = data;
  }
  const { data: row, error } = await admin.from('task_logs').insert({
    user_id: ctx.userId,
    start_date: isoDag(van),
    end_date: isoDag(tot),
    days: dagen,
    sub_parcel_id: perceel.id,
    task_type_id: taak!.id,
    people_count: personen,
    hours_per_person: urenPP,
    notes: opmerking,
  }).select('id').single();
  if (error) return { tekst: `Opslaan mislukt: ${error.message}`, fout: true };
  return { tekst: [`Opgeslagen ✓ (code ${String(row.id).slice(0, 8)})`, ...voorstel].join('\n') };
}

export async function urenAanpassen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const code = str(args.code).toLowerCase().replace(/[\[\]\s]/g, '');
  const admin = getSupabaseAdmin() as any;
  const { data } = await admin.from('task_logs').select('*').eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(2000);
  const matches = (data || []).filter((r: any) => String(r.id).startsWith(code));
  const taken = await taakTypes(ctx.userId);
  if (!code || matches.length === 0) return { tekst: `Urenregel "${code}" niet gevonden. Gebruik de tool uren voor codes.`, fout: true };
  if (matches.length > 1) return { tekst: ['Meerdere regels met die code:', ...matches.slice(0, 10).map((r: any) => `- ${urenRegel(ctx, r, taken)}`)].join('\n') };
  const was = matches[0];

  if (args.verwijderen === true) {
    if (args.bevestig !== true) return { tekst: ['VOORSTEL — urenregel VERWIJDEREN (nog niet gedaan):', `- ${urenRegel(ctx, was, taken)}`, '', 'Zeker weten? Roep opnieuw aan met verwijderen=true en bevestig=true.'].join('\n') };
    const { error } = await admin.from('task_logs').delete().eq('id', was.id).eq('user_id', ctx.userId);
    return error ? { tekst: `Verwijderen mislukt: ${error.message}`, fout: true } : { tekst: `Verwijderd ✓ ${urenRegel(ctx, was, taken)}` };
  }

  const problemen: string[] = [];
  const wordt: any = { ...was };
  if (num(args.uren) != null) wordt.hours_per_person = num(args.uren);
  if (num(args.personen) != null) wordt.people_count = Math.max(1, Math.round(num(args.personen)!));
  if (str(args.datum)) {
    const d = isoDag(bepaalMoment(args.datum, '12:00', ''));
    const lengte = Math.round((new Date(was.end_date).getTime() - new Date(was.start_date).getTime()) / 86_400_000);
    wordt.start_date = d;
    const e = new Date(d); e.setDate(e.getDate() + lengte);
    wordt.end_date = isoDag(e);
  }
  if (str(args.taak)) {
    const m = zoek(str(args.taak), taken, t => t.name);
    if (m.beste && m.zekerheid >= 60) wordt.task_type_id = m.beste.id;
    else problemen.push(`Taak "${str(args.taak)}" bestaat niet (${taken.map(t => t.name).join(', ')}).`);
  }
  if (typeof args.perceel === 'string') {
    const p = enkelPerceel(ctx, str(args.perceel));
    if (p.probleem) problemen.push(p.probleem);
    wordt.sub_parcel_id = p.id;
  }
  if (typeof args.opmerking === 'string') wordt.notes = str(args.opmerking) || null;
  wordt.total_hours = wordt.people_count * wordt.hours_per_person * wordt.days;

  const voorstel = ['WAS:', `- ${urenRegel(ctx, was, taken)}`, 'WORDT:', `- ${urenRegel(ctx, wordt, taken)}`];
  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...problemen.map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met bevestig=true.'].join('\n') };
  const { error } = await admin.from('task_logs').update({
    start_date: wordt.start_date, end_date: wordt.end_date, task_type_id: wordt.task_type_id, sub_parcel_id: wordt.sub_parcel_id,
    people_count: wordt.people_count, hours_per_person: wordt.hours_per_person, notes: wordt.notes, updated_at: new Date().toISOString(),
  }).eq('id', was.id).eq('user_id', ctx.userId);
  return error ? { tekst: `Opslaan mislukt: ${error.message}`, fout: true } : { tekst: ['Aangepast ✓', `- ${urenRegel(ctx, wordt, taken)}`].join('\n') };
}

// ── Voorraad ────────────────────────────────────────────────────────────

export async function voorraadBijwerken(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const historie = await getUserProductNames(ctx.userId);
  const stock = await getStockForUser(ctx.userId);
  const v = vindProduct(ctx, str(args.middel), [...stock.map(s => s.productName), ...historie]);
  const hoeveelheid = num(args.hoeveelheid);
  const soort = str(args.soort) === 'telling' ? 'telling' : 'levering';
  const problemen: string[] = [];
  if (hoeveelheid == null || hoeveelheid < 0 || (soort === 'levering' && hoeveelheid === 0)) problemen.push('Geef een geldige hoeveelheid.');
  if (v.twijfel) problemen.push(v.twijfel);
  const huidig = stock.find(s => normaliseer(s.productName) === normaliseer(v.naam));
  const eenheid = str(args.eenheid) || huidig?.unit || 'L';
  if (huidig?.unit && str(args.eenheid) && huidig.unit.toLowerCase() !== eenheid.toLowerCase()) problemen.push(`Voorraad van ${v.naam} staat in ${huidig.unit}, niet in ${eenheid}. Reken om of gebruik ${huidig.unit}.`);
  const nu = huidig?.stock ?? 0;
  const mutatie = soort === 'levering' ? (hoeveelheid ?? 0) : (hoeveelheid ?? 0) - nu;
  const datum = bepaalMoment(args.datum, '', '');
  const opmerking = str(args.opmerking);
  const voorstel = [
    `${soort === 'levering' ? 'Levering' : 'Voorraadtelling'} ${v.naam}${v.onbekend ? ' (niet in database, eigen naam)' : ''} · ${dd(datum)}`,
    `- Huidige stand: ${f(nu, 2)} ${eenheid}`,
    `- Mutatie: ${mutatie >= 0 ? '+' : ''}${f(mutatie, 2)} ${eenheid}`,
    `- Nieuwe stand: ${f(nu + mutatie, 2)} ${eenheid}`,
    ...(opmerking ? [`- Opmerking: ${opmerking}`] : []),
  ];
  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...problemen.map(p => `- ${p}`), '', ...voorstel].join('\n') };
  if (soort === 'telling' && Math.abs(mutatie) < 1e-9) return { tekst: `Voorraad ${v.naam} staat al op ${f(nu, 2)} ${eenheid}; niets te boeken.` };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep opnieuw aan met bevestig=true.'].join('\n') };
  const { error } = await (getSupabaseAdmin() as any).from('inventory_movements').insert({
    id: crypto.randomUUID(),
    user_id: ctx.userId,
    product_name: huidig?.productName ?? v.naam,
    quantity: Math.round(mutatie * 1000) / 1000,
    unit: eenheid,
    type: soort === 'levering' ? 'addition' : 'correction',
    date: datum.toISOString(),
    description: `${soort === 'levering' ? 'Levering' : 'Voorraadtelling'} via Claude${opmerking ? ` — ${opmerking}` : ''}`,
  });
  return error ? { tekst: `Opslaan mislukt: ${error.message}`, fout: true } : { tekst: ['Opgeslagen ✓', ...voorstel].join('\n') };
}

// ── Veldnotities aanpassen ──────────────────────────────────────────────

export async function veldnotitieAanpassen(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const code = str(args.code).toLowerCase().replace(/[\[\]\s]/g, '');
  const admin = getSupabaseAdmin() as any;
  const { data } = await admin.from('field_notes').select('id, content, status, parcel_ids, created_at').eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(2000);
  const matches = (data || []).filter((n: any) => String(n.id).startsWith(code));
  if (!code || matches.length !== 1) return { tekst: matches.length > 1 ? 'Code is niet uniek; geef meer tekens.' : `Veldnotitie "${code}" niet gevonden. Gebruik veldnotities voor codes.`, fout: true };
  const n = matches[0];
  const label = `[${String(n.id).slice(0, 8)}] ${ddt(new Date(n.created_at))}: ${n.content}`;
  if (args.verwijderen === true) {
    if (args.bevestig !== true) return { tekst: `VOORSTEL — veldnotitie VERWIJDEREN (nog niet gedaan):\n- ${label}\n\nZeker weten? Roep opnieuw aan met verwijderen=true en bevestig=true.` };
    const { error } = await admin.from('field_notes').delete().eq('id', n.id).eq('user_id', ctx.userId);
    return error ? { tekst: `Verwijderen mislukt: ${error.message}`, fout: true } : { tekst: `Verwijderd ✓ ${label}` };
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const meldingen: string[] = [];
  if (str(args.tekst)) update.content = str(args.tekst);
  if (str(args.status) === 'open' || str(args.status) === 'done') update.status = str(args.status);
  if (Array.isArray(args.percelen)) {
    const r = resolvePercelenInvoer(ctx, (args.percelen as unknown[]).map(x => ({ naam: str(x) })));
    meldingen.push(...r.problemen);
    update.parcel_ids = r.plots.length ? r.plots : null;
  }
  if (Object.keys(update).length === 1) return { tekst: `Gevonden: ${label}\nGeef tekst, status of percelen op, of verwijderen=true.` };
  const { error } = await admin.from('field_notes').update(update).eq('id', n.id).eq('user_id', ctx.userId);
  if (error) return { tekst: `Opslaan mislukt: ${error.message}`, fout: true };
  return { tekst: [`Bijgewerkt ✓ [${String(n.id).slice(0, 8)}]${update.status === 'done' ? ' — afgehandeld' : ''}`, ...meldingen.map(m => `- let op: ${m}`)].join('\n') };
}
