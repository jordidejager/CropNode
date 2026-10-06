/**
 * Rijenkaart — rijselectie uit vrije tekst (puur).
 *
 * Voorbeelden: "1-20, 24", "1–20", "1 t/m 20", "1 tot en met 20", "rij 3", "rijen 3 en 5",
 * "nr 4", "1A" (label), "blok A", "Noordkant" (bloknaam), "bestuivers", "alle", "hele perceel",
 * "ras Conference", "alle behalve 5". Alleen actieve rijen zijn selecteerbaar.
 */

import type { RijRol, RijStatus } from './types';

export interface SelecteerbareRij {
  id: string;
  nummer: number;
  label?: string | null;
  blokId?: string | null;
  blokNaam?: string | null;
  rol?: RijRol;
  status?: RijStatus;
  rasEffectief?: string | null;
}

export interface RijSelectieResultaat {
  /** Geselecteerde rij-id's, gesorteerd op nummer */
  rijIds: string[];
  /** Unieke nummers, oplopend */
  nummers: number[];
  fouten: string[];
  leeg: boolean;
  /** bv. "rij 1–20, 24 (21 rijen)" */
  omschrijving: string;
}

interface BlokRef {
  id: string;
  naam: string | null;
}

interface Context {
  actief: SelecteerbareRij[];
  actiefPerNummer: Map<number, SelecteerbareRij[]>;
  gerooidNummers: Set<number>;
  actiefPerLabel: Map<string, SelecteerbareRij[]>;
  gerooidLabels: Set<string>;
  minNummer: number | null;
  maxNummer: number | null;
  bereikTekst: string;
  blokken: BlokRef[];
}

/** [1,2,3,5,7,8] → "1–3, 5, 7–8" (en-dash) */
export function formatteerBereiken(nummers: number[]): string {
  const uniek = [...new Set(nummers.filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
  const delen: string[] = [];
  let i = 0;
  while (i < uniek.length) {
    let j = i;
    while (j + 1 < uniek.length && uniek[j + 1] === uniek[j] + 1) j++;
    delen.push(j > i ? `${uniek[i]}–${uniek[j]}` : `${uniek[i]}`);
    i = j + 1;
  }
  return delen.join(', ');
}

function isActief(r: SelecteerbareRij): boolean {
  return !r.status || r.status === 'actief';
}

/** Kleine letters, streepjes gelijkgetrokken, witruimte samengevoegd */
function normaliseerNaam(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseerLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function zonderBlokVoorvoegsel(s: string): string {
  return s.replace(/^blok\s+/, '');
}

function voegToe<K>(map: Map<K, SelecteerbareRij[]>, k: K, r: SelecteerbareRij) {
  const lijst = map.get(k);
  if (lijst) lijst.push(r);
  else map.set(k, [r]);
}

function maakContext(rijen: SelecteerbareRij[], blokken: BlokRef[]): Context {
  const actief = rijen.filter(isActief);
  const actiefPerNummer = new Map<number, SelecteerbareRij[]>();
  const actiefPerLabel = new Map<string, SelecteerbareRij[]>();
  const gerooidNummers = new Set<number>();
  const gerooidLabels = new Set<string>();
  for (const r of rijen) {
    const label = r.label ? normaliseerLabel(r.label) : '';
    if (isActief(r)) {
      voegToe(actiefPerNummer, r.nummer, r);
      if (label) voegToe(actiefPerLabel, label, r);
    } else {
      gerooidNummers.add(r.nummer);
      if (label) gerooidLabels.add(label);
    }
  }
  const nummers = [...actiefPerNummer.keys()];
  const minNummer = nummers.length ? Math.min(...nummers) : null;
  const maxNummer = nummers.length ? Math.max(...nummers) : null;
  const bereikTekst = nummers.length === 0
    ? 'dit perceel heeft nog geen rijen'
    : `dit perceel heeft ${nummers.length === 1 ? 'rij' : 'rijen'} ${formatteerBereiken(nummers)}`;

  // Blokken uit de meegegeven lijst, aangevuld met blokken die alleen via de rijen bekend zijn
  const alleBlokken: BlokRef[] = [...blokken];
  const bekend = new Set(blokken.map(b => b.id));
  for (const r of rijen) {
    if (r.blokId && !bekend.has(r.blokId)) {
      bekend.add(r.blokId);
      alleBlokken.push({ id: r.blokId, naam: r.blokNaam ?? null });
    }
  }

  return {
    actief,
    actiefPerNummer,
    gerooidNummers,
    actiefPerLabel,
    gerooidLabels,
    minNummer,
    maxNummer,
    bereikTekst,
    blokken: alleBlokken,
  };
}

// ---------------------------------------------------------------------------
// Onderdelen
// ---------------------------------------------------------------------------

function selecteerNummer(n: number, ctx: Context, fouten: string[], uit: Map<string, SelecteerbareRij>) {
  const rs = ctx.actiefPerNummer.get(n);
  if (rs) {
    for (const r of rs) uit.set(r.id, r);
  } else if (ctx.gerooidNummers.has(n)) {
    fouten.push(`Rij ${n} is gerooid`);
  } else {
    fouten.push(`Rij ${n} bestaat niet (${ctx.bereikTekst})`);
  }
}

function selecteerBereik(a: number, b: number, ctx: Context, fouten: string[], uit: Map<string, SelecteerbareRij>) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let gevonden = 0;
  for (const r of ctx.actief) {
    if (r.nummer >= lo && r.nummer <= hi) {
      uit.set(r.id, r);
      gevonden++;
    }
  }

  // Gaten binnen het bestaande bereik (bv. een gerooide rij) zijn geen fout;
  // nummers buiten het bereik van het perceel wel.
  const ontbrekend: [number, number][] = [];
  if (ctx.minNummer === null || ctx.maxNummer === null) {
    ontbrekend.push([lo, hi]);
  } else {
    if (lo < ctx.minNummer) ontbrekend.push([lo, Math.min(hi, ctx.minNummer - 1)]);
    if (hi > ctx.maxNummer) ontbrekend.push([Math.max(lo, ctx.maxNummer + 1), hi]);
  }

  if (ontbrekend.length > 0) {
    const enkel = ontbrekend.length === 1 && ontbrekend[0][0] === ontbrekend[0][1];
    if (enkel && ctx.gerooidNummers.has(ontbrekend[0][0])) {
      fouten.push(`Rij ${ontbrekend[0][0]} is gerooid`);
    } else if (enkel) {
      fouten.push(`Rij ${ontbrekend[0][0]} bestaat niet (${ctx.bereikTekst})`);
    } else {
      const tekst = ontbrekend.map(([x, y]) => (x === y ? `${x}` : `${x}–${y}`)).join(', ');
      fouten.push(`Rijen ${tekst} bestaan niet (${ctx.bereikTekst})`);
    }
  } else if (gevonden === 0) {
    fouten.push(`Geen actieve rijen in ${lo}–${hi}`);
  }
}

/** Probeert een label; true als het een (actief of gerooid) label is. */
function selecteerLabel(tekst: string, ctx: Context, fouten: string[], uit: Map<string, SelecteerbareRij>): boolean {
  const sleutel = normaliseerLabel(tekst);
  if (!sleutel) return false;
  const rs = ctx.actiefPerLabel.get(sleutel);
  if (rs) {
    for (const r of rs) uit.set(r.id, r);
    return true;
  }
  if (ctx.gerooidLabels.has(sleutel)) {
    fouten.push(`Rij ${tekst} is gerooid`);
    return true;
  }
  return false;
}

type BlokMatch = { soort: 'gevonden'; blok: BlokRef } | { soort: 'meerdere'; blokken: BlokRef[] } | { soort: 'geen' };

function zoekBlok(naam: string, ctx: Context, minLengteDeelMatch: number): BlokMatch {
  const q = zonderBlokVoorvoegsel(normaliseerNaam(naam));
  if (!q) return { soort: 'geen' };
  const metNaam = ctx.blokken.filter(b => b.naam && normaliseerNaam(b.naam));
  const vergelijk = (b: BlokRef) => {
    const v = normaliseerNaam(b.naam ?? '');
    return [v, zonderBlokVoorvoegsel(v)];
  };

  const exact = metNaam.filter(b => vergelijk(b).includes(q));
  if (exact.length === 1) return { soort: 'gevonden', blok: exact[0] };
  if (exact.length > 1) return { soort: 'meerdere', blokken: exact };

  if (q.length < minLengteDeelMatch) return { soort: 'geen' };
  const deels = metNaam.filter(b => vergelijk(b).some(v => v.includes(q)));
  if (deels.length === 1) return { soort: 'gevonden', blok: deels[0] };
  if (deels.length > 1) return { soort: 'meerdere', blokken: deels };
  return { soort: 'geen' };
}

function blokNamenTekst(blokken: BlokRef[]): string {
  return blokken.map(b => b.naam ?? '(zonder naam)').join(', ');
}

function selecteerBlok(blok: BlokRef, ctx: Context, fouten: string[], uit: Map<string, SelecteerbareRij>) {
  const rs = ctx.actief.filter(r => r.blokId === blok.id);
  if (rs.length === 0) {
    fouten.push(`Blok '${blok.naam ?? '(zonder naam)'}' heeft geen actieve rijen`);
    return;
  }
  for (const r of rs) uit.set(r.id, r);
}

type RasMatch = { soort: 'gevonden'; ras: string } | { soort: 'meerdere'; rassen: string[] } | { soort: 'geen' };

function rassen(ctx: Context): string[] {
  const perSleutel = new Map<string, string>();
  for (const r of ctx.actief) {
    const ras = r.rasEffectief?.trim();
    if (ras && !perSleutel.has(ras.toLowerCase())) perSleutel.set(ras.toLowerCase(), ras);
  }
  return [...perSleutel.values()];
}

function zoekRas(naam: string, ctx: Context, deelMatch: boolean): RasMatch {
  const q = normaliseerNaam(naam);
  if (!q) return { soort: 'geen' };
  const alle = rassen(ctx);
  const exact = alle.find(r => normaliseerNaam(r) === q);
  if (exact) return { soort: 'gevonden', ras: exact };
  if (!deelMatch) return { soort: 'geen' };
  const deels = alle.filter(r => normaliseerNaam(r).includes(q));
  if (deels.length === 1) return { soort: 'gevonden', ras: deels[0] };
  if (deels.length > 1) return { soort: 'meerdere', rassen: deels };
  return { soort: 'geen' };
}

function selecteerRas(ras: string, ctx: Context, uit: Map<string, SelecteerbareRij>) {
  const sleutel = ras.toLowerCase();
  for (const r of ctx.actief) {
    if (r.rasEffectief?.trim().toLowerCase() === sleutel) uit.set(r.id, r);
  }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const ALLE = /^(?:alle(?:\s+rijen)?|alles|allemaal|(?:ge)?he(?:le|el)\s+perceel|volledige?\s+perceel)$/i;
const BESTUIVERS = /^(?:alle\s+)?bestuiver(?:s|rij|rijen|s\s*rijen)?$/i;
const VULWOORDEN = /^(?:(?:op|de|het|in|alleen|ook|van(?=\s+(?:(?:rij(?:en)?|nr\.?)\s*)?\d))\s+)+/i;
/** "alle rijen van blok A", "rijen in blok A", "heel blok A", "alle rijen met ras Elstar" → "blok A" / "ras Elstar" */
const BLOK_RAS_INLEIDING = /^(?:(?:alle|(?:ge)?he(?:le|el))\s+)?(?:rijen\s+)?(?:(?:van|in|uit|met)\s+)?(?=blok|ras\s)/i;
/** Eén of meer voorvoegsels: "rij 3", "rijen: 1-3", "nr. 4", "#6", "rij nr 5" */
const RIJ_VOORVOEGSEL = /^(?:(?:rijen|rijnummers?|rij|nummers?|nrs?\.?|#)(?:\s*:\s*|\s+|(?=\d)))+/i;
const NUMMER_OF_BEREIK = /^(\d+)(?:-(\d+))?$/;
const LABEL_VORM = /^\d+[a-z]+$/i;

function verwerkDeel(deel: string, ctx: Context, fouten: string[], uit: Map<string, SelecteerbareRij>) {
  const origineel = deel
    .replace(/["'\u2018\u2019\u201c\u201d]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
  const tekst = origineel
    .replace(VULWOORDEN, '')
    .replace(BLOK_RAS_INLEIDING, '')
    .trim();
  if (!tekst) return;

  if (ALLE.test(tekst)) {
    if (ctx.actief.length === 0) fouten.push('Dit perceel heeft nog geen rijen');
    for (const r of ctx.actief) uit.set(r.id, r);
    return;
  }

  if (BESTUIVERS.test(tekst)) {
    const rs = ctx.actief.filter(r => r.rol === 'bestuiver');
    if (rs.length === 0) fouten.push('Dit perceel heeft geen bestuiverrijen');
    for (const r of rs) uit.set(r.id, r);
    return;
  }

  const blokM = tekst.match(/^blok(?:ken)?\s+(.+)$/i);
  if (blokM) {
    const naam = blokM[1].trim();
    const m = zoekBlok(naam, ctx, 1);
    if (m.soort === 'gevonden') selecteerBlok(m.blok, ctx, fouten, uit);
    else if (m.soort === 'meerdere') fouten.push(`Blok '${naam}' is niet eenduidig: ${blokNamenTekst(m.blokken)}`);
    else if (ctx.blokken.length === 0) fouten.push(`Blok '${naam}' niet gevonden. Dit perceel heeft geen blokken`);
    else fouten.push(`Blok '${naam}' niet gevonden. Blokken: ${blokNamenTekst(ctx.blokken)}`);
    return;
  }

  const rasM = tekst.match(/^ras\s+(.+)$/i);
  if (rasM) {
    const naam = rasM[1].trim();
    const m = zoekRas(naam, ctx, true);
    if (m.soort === 'gevonden') selecteerRas(m.ras, ctx, uit);
    else if (m.soort === 'meerdere') fouten.push(`Ras '${naam}' is niet eenduidig: ${m.rassen.join(', ')}`);
    else {
      const alle = rassen(ctx);
      fouten.push(alle.length
        ? `Ras '${naam}' niet gevonden. Rassen: ${alle.join(', ')}`
        : `Ras '${naam}' niet gevonden. Op dit perceel is geen ras bij de rijen bekend`);
    }
    return;
  }

  // Nummers, bereiken en labels (eventueel na "rij", "rijen", "nr")
  const zonderVoorvoegsel = tekst.replace(RIJ_VOORVOEGSEL, '').trim();
  const metVoorvoegsel = zonderVoorvoegsel !== tekst;
  if (!zonderVoorvoegsel) {
    fouten.push(`'${origineel}' niet herkend`);
    return;
  }
  const tokens = zonderVoorvoegsel.split(' ').filter(Boolean);
  const allesNummerOfLabel = tokens.length > 0 && tokens.every(t =>
    NUMMER_OF_BEREIK.test(t) || ctx.actiefPerLabel.has(normaliseerLabel(t)) || ctx.gerooidLabels.has(normaliseerLabel(t)),
  );
  if (allesNummerOfLabel) {
    for (const t of tokens) {
      const m = t.match(NUMMER_OF_BEREIK);
      if (m) {
        const a = parseInt(m[1], 10);
        if (m[2] === undefined) selecteerNummer(a, ctx, fouten, uit);
        else selecteerBereik(a, parseInt(m[2], 10), ctx, fouten, uit);
      } else {
        selecteerLabel(t, ctx, fouten, uit);
      }
    }
    return;
  }

  // Label met spaties ("rij 1 A") of na voorvoegsel
  if (selecteerLabel(zonderVoorvoegsel, ctx, fouten, uit)) return;
  if (metVoorvoegsel || LABEL_VORM.test(zonderVoorvoegsel)) {
    fouten.push(`Rij '${zonderVoorvoegsel}' niet gevonden (${ctx.bereikTekst})`);
    return;
  }

  // Kale naam: eerst exact blok, dan exact ras, dan een uniek deel van een bloknaam
  const blokExact = zoekBlok(tekst, ctx, Infinity);
  if (blokExact.soort === 'gevonden') {
    selecteerBlok(blokExact.blok, ctx, fouten, uit);
    return;
  }
  const ras = zoekRas(tekst, ctx, false);
  if (ras.soort === 'gevonden') {
    selecteerRas(ras.ras, ctx, uit);
    return;
  }
  const blokDeels = zoekBlok(tekst, ctx, 2);
  if (blokDeels.soort === 'gevonden') {
    selecteerBlok(blokDeels.blok, ctx, fouten, uit);
    return;
  }
  if (blokDeels.soort === 'meerdere') {
    fouten.push(`Blok '${tekst}' is niet eenduidig: ${blokNamenTekst(blokDeels.blokken)}`);
    return;
  }
  fouten.push(`'${origineel}' niet herkend`);
}

function verwerkTekst(tekst: string, ctx: Context, fouten: string[]): Map<string, SelecteerbareRij> {
  const uit = new Map<string, SelecteerbareRij>();
  const genormaliseerd = tekst
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    // "1 t/m 20", "1 tot en met 20", "1 tot 20", "1 tm 20", "1 t/m rij 20", "1 - rij 20" → "1-20"
    .replace(/(\d)\s*(?:t\s*\/\s*m|t\.\s*m\.?|tm|tot\s+en\s+met|tot|-)\s*(?:(?:rij|nr\.?)\s*)?(?=\d)/gi, '$1-')
    .replace(/\s*-\s*/g, '-');
  const delen = genormaliseerd.split(/[,;+&\n]|\s+en\s+/i);
  for (const deel of delen) verwerkDeel(deel, ctx, fouten, uit);
  return uit;
}

/**
 * Parse een rijselectie. Alleen actieve rijen (status ontbreekt of 'actief') worden geselecteerd.
 * Fouten (onbekend nummer, blok, ras …) worden verzameld; wat wel herkend is, blijft geselecteerd.
 * "… behalve …" / "… zonder …" haalt rijen uit de selectie.
 */
export function parseRijSelectie(
  tekst: string,
  rijen: SelecteerbareRij[],
  blokken?: { id: string; naam: string | null }[],
): RijSelectieResultaat {
  const ctx = maakContext(rijen ?? [], blokken ?? []);
  const fouten: string[] = [];

  // Robuust voor niet-string invoer van buitenaf (MCP/JSON): [1, 2, 3] → "1, 2, 3", 5 → "5"
  const invoer: unknown = tekst;
  const tekstStr = Array.isArray(invoer) ? invoer.join(', ') : invoer == null ? '' : String(invoer);

  const [insluiten, ...uitsluiten] = tekstStr.split(
    /(?:^|\s)(?:behalve|zonder|uitgezonderd|exclusief|excl\.?)(?=\s|$)/i,
  );
  // "zonder bestuivers" (alleen een uitsluiting) = alle rijen behalve de bestuivers
  const geselecteerd = !insluiten.trim() && uitsluiten.length > 0
    ? new Map(ctx.actief.map(r => [r.id, r] as const))
    : verwerkTekst(insluiten, ctx, fouten);
  for (const deel of uitsluiten) {
    for (const id of verwerkTekst(deel, ctx, fouten).keys()) geselecteerd.delete(id);
  }

  const lijst = [...geselecteerd.values()].sort((a, b) => a.nummer - b.nummer || a.id.localeCompare(b.id));
  const rijIds = lijst.map(r => r.id);
  const nummers = [...new Set(lijst.map(r => r.nummer))];
  const omschrijving = rijIds.length === 0
    ? 'geen rijen'
    : rijIds.length === 1
      ? `rij ${formatteerBereiken(nummers)}`
      : `rij ${formatteerBereiken(nummers)} (${rijIds.length} rijen)`;

  return {
    rijIds,
    nummers,
    fouten: [...new Set(fouten)],
    leeg: rijIds.length === 0,
    omschrijving,
  };
}
