/**
 * CropNode MCP tools. Lezen: percelen, spuitschrift, historie, middelen, voorraad,
 * weer, notities, spuit-inbox. Schrijven: voorstel-en-bevestig (eerst VOORSTEL,
 * pas opslaan met bevestig=true) — zelfde werkwijze als de StoreNode-MCP.
 * Alles draait met een expliciete userId op de admin-client (geen cookies).
 */

import { getSupabaseAdmin } from '@/lib/supabase-client';
import { getUserProductNames } from '@/lib/supabase-store';
import type { SprayableParcel } from '@/lib/supabase-store';
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
import { SPRAY_TOOLS, bespuitingen, bespuitingAanpassen, registreerBespuiting, resolvePercelenInvoer, vindProduct } from './spray';
import { sprayedArea } from '@/lib/spray-records';
import { EXTRA_TOOLS, uren, urenAanpassen, urenRegistreren, veldnotitieAanpassen, voorraadBijwerken } from './extra';
import {
  normaliseer,
  percelenVanNaam,
  str,
  num,
  f,
  datumArg,
  dd,
  ddt,
  dagenGeleden,
  perceelLabel,
  perceelNamen,
  middelRegel,
  onbekendNotitie,
  opslagMiddel,
  type Args,
  type ToolDefinitie,
  type ToolResultaat,
} from './util';
import type { LogbookEntry, ProductEntry, RegistrationType, SprayReviewAssumption } from '@/lib/types';

export type { ToolDefinitie, ToolResultaat } from './util';

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
        percelen: {
          type: 'array',
          items: { type: 'object', properties: { naam: { type: 'string' }, deel: { type: 'string', description: '"helft", "kwart", "een derde" of fractie' }, ha: { type: 'number', description: 'gespoten ha' } }, required: ['naam'] },
          description: 'Correctie: vervangt de percelen, optioneel met gespoten deel of ha.',
        },
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
  ...SPRAY_TOOLS,
  ...EXTRA_TOOLS,
];

// ── Uitvoering ───────────────────────────────────────────────────────────

export async function voerToolUit(userId: string, naam: string, args: Args): Promise<ToolResultaat> {
  switch (naam) {
    case 'percelen': return percelen(await laadContext(userId), args);
    case 'percelen_status': return percelenStatus(await laadContext(userId), args);
    case 'bespuitingen': return bespuitingen(await laadContext(userId), args);
    case 'bespuiting_aanpassen': return bespuitingAanpassen(await laadContext(userId), args);
    case 'uren': return uren(await laadContext(userId), args);
    case 'uren_registreren': return urenRegistreren(await laadContext(userId), args);
    case 'uren_aanpassen': return urenAanpassen(await laadContext(userId), args);
    case 'voorraad_bijwerken': return voorraadBijwerken(await laadContext(userId), args);
    case 'veldnotitie_aanpassen': return veldnotitieAanpassen(await laadContext(userId), args);
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
        return `- [${String(n.id).slice(0, 8)}] ${ddt(new Date(n.created_at))}: ${n.content}${meta ? `\n    (${meta})` : ''}`;
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


async function keurConceptGoed(ctx: McpContext, args: Args): Promise<ToolResultaat> {
  const id = str(args.id);
  const entries = await getSprayInboxEntriesForUser(ctx.userId);
  const e = entries.find(x => x.id === id || x.id.startsWith(id));
  if (!id || !e) return { tekst: `Concept "${id}" niet gevonden in de inbox.`, fout: true };

  const problemen: string[] = [];
  let plots = e.parsedData?.plots || [];
  let plotAreas: Record<string, number> = {};
  if (Array.isArray(args.percelen) && (args.percelen as unknown[]).length) {
    const r = resolvePercelenInvoer(ctx, args.percelen);
    problemen.push(...r.problemen);
    plots = r.plots;
    plotAreas = r.plotAreas;
  }
  let products: ProductEntry[] = e.parsedData?.products || [];
  if (Array.isArray(args.middelen) && (args.middelen as unknown[]).length) {
    const historie = await getUserProductNames(ctx.userId);
    products = (args.middelen as Args[]).map(m => {
      const v = vindProduct(ctx, str(m.naam), historie);
      if (v.twijfel) problemen.push(v.twijfel);
      return { product: v.naam, dosage: num(m.dosering) ?? 0, unit: str(m.eenheid) || 'L', ...(v.source ? { source: v.source } : {}), ...(v.onbekend ? { resolved: false } : {}) };
    });
  }
  const date = str(args.datum) ? datumArg(args.datum, e.date) : e.date;
  const registrationType: RegistrationType = e.registrationType || 'spraying';

  if (plots.length === 0) problemen.push('Geen percelen — geef de percelen op.');
  if (products.length === 0) problemen.push('Geen middelen — geef de middelen op.');
  for (const p of products) if (!p.dosage || p.dosage <= 0) problemen.push(`Dosering voor ${p.product} ontbreekt (per ha).`);
  const ha = plots.reduce((sum, id) => sum + sprayedArea(id, ctx.parcels.find(p => p.id === id)?.area, plotAreas), 0);
  const pTekst = plots.map(id => {
    const p = ctx.parcels.find(x => x.id === id);
    return `${p?.name ?? '?'}${plotAreas[id] != null ? ` (${f(plotAreas[id], 2)} van ${f(p?.area || 0, 2)} ha)` : ''}`;
  }).join(', ') + (plots.length ? ` · ${f(ha, 2)} ha gespoten` : '');
  const voorstel = [
    `Concept [${e.id.slice(0, 8)}] → spuitschrift`,
    `- Datum: ${ddt(date)} · ${registrationType === 'spreading' ? 'strooien' : 'spuiten'}`,
    `- Percelen: ${pTekst || '—'}`,
    ...products.map(p => `- ${middelRegel(p, ha)}${onbekendNotitie(p)}`),
  ];
  if (problemen.length) return { tekst: ['Nog niet opgeslagen. Controleer:', ...problemen.map(p => `- ${p}`), '', 'Voorstel tot nu toe:', ...voorstel].join('\n') };
  if (args.bevestig !== true) return { tekst: ['VOORSTEL (nog niet opgeslagen):', ...voorstel, '', 'Klopt dit? Roep dan opnieuw aan met bevestig=true.'].join('\n') };

  const edit: SprayDraftEdit = { date, plots, products: products.map(opslagMiddel), registrationType, plotAreas };
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

