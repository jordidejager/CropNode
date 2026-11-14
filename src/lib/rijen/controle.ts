/**
 * Rijenkaart — controle van de rijen van één perceel (puur, RD). De regels waar Jager Fleet op rekent:
 *  - nummers zonder gaten of dubbele, oplopend vanaf één kant;
 *  - alle rijen in dezelfde richting getekend (begin aan dezelfde kant);
 *  - binnen de perceelgrens (1 m tolerantie), rijen kruisen elkaar niet;
 *  - aannemelijke rijafstand (waarschuwing onder 2 m of boven 6 m, en bij een sprong tussen buurrijen).
 * Ter informatie: rijen zonder ras en rijen op 'controleren'. Het rij-id zelf verandert nooit (database).
 */

import { naarRD, puntInPerceel } from './geo';
import { afstandOp, richtingRD, vindBuren } from './perceelkaart';
import type { LngLat, PerceelRD, XY } from './types';

export type ControleSoort = 'ok' | 'let_op' | 'info';

export interface ControleBevinding {
  soort: ControleSoort;
  /** Vaste sleutel van de regel (nummers, volgorde, richting, grens, kruisen, afstand, sprong, ras, controleren) */
  regel: string;
  tekst: string;
  /** Rijen om te tonen/selecteren */
  rijIds: string[];
}

export interface ControleRij {
  id: string;
  nummer: number;
  coordinates: LngLat[];
  rasEffectief?: string | null;
  controleren?: boolean;
}

export const MIN_RIJAFSTAND_M = 2;
export const MAX_RIJAFSTAND_M = 6;
const GRENS_TOLERANTIE_M = 1;
/** Sprong: buurafstand wijkt meer dan zoveel (relatief én absoluut) af van de gewone rijafstand */
const SPRONG_FACTOR = 0.3;
const SPRONG_MIN_M = 0.5;

const RAD = Math.PI / 180;
const f1 = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
const lijst = (ns: number[]) => {
  const s = [...ns].sort((a, b) => a - b);
  return s.length > 10 ? `${s.slice(0, 10).join(', ')} … (${s.length})` : s.join(', ');
};

function mediaan(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** Afstand van p tot het dichtstbijzijnde punt van de perceelrand */
function afstandTotRand(p: XY, perceel: PerceelRD): number {
  let best = Infinity;
  for (const poly of perceel.polygonen) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j];
        const b = ring[i];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
        best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
      }
    }
  }
  return best;
}

/** Hoe ver (m) de rij op zijn verst buiten de perceelgrens komt; bemonsterd per meter */
function maxBuitenGrens(lijn: XY[], perceel: PerceelRD): number {
  let max = 0;
  for (let i = 1; i < lijn.length; i++) {
    const a = lijn[i - 1];
    const b = lijn[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(l));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const p: XY = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      if (!puntInPerceel(p, perceel)) max = Math.max(max, afstandTotRand(p, perceel));
    }
  }
  return max;
}

function segmentenKruisen(a: XY, b: XY, c: XY, d: XY): boolean {
  const o = (p: XY, q: XY, r: XY) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  // alleen echte kruisingen (raken in een eindpunt telt niet)
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function controleerRijen(invoer: ControleRij[], perceel: PerceelRD | null): ControleBevinding[] {
  const rijen = invoer.filter(r => r.coordinates.length >= 2).map(r => ({ ...r, rd: r.coordinates.map(c => naarRD(c)) }));
  const uit: ControleBevinding[] = [];
  if (rijen.length === 0) return uit;
  const idsVan = (ns: number[]) => rijen.filter(r => ns.includes(r.nummer)).map(r => r.id);

  // ---- Nummers: gaten en dubbele
  const nummers = rijen.map(r => r.nummer);
  const telling = new Map<number, number>();
  for (const n of nummers) telling.set(n, (telling.get(n) ?? 0) + 1);
  const dubbel = [...telling].filter(([, k]) => k > 1).map(([n]) => n);
  const min = Math.min(...nummers);
  const max = Math.max(...nummers);
  const gaten: number[] = [];
  for (let n = min; n <= max; n++) if (!telling.has(n)) gaten.push(n);
  if (dubbel.length) uit.push({ soort: 'let_op', regel: 'nummers', tekst: `Dubbel rijnummer: ${lijst(dubbel)}.`, rijIds: idsVan(dubbel) });
  if (gaten.length) uit.push({ soort: 'let_op', regel: 'nummers', tekst: `Rijnummer ontbreekt: ${lijst(gaten)} (nummers ${min}–${max}).`, rijIds: [] });
  if (!dubbel.length && !gaten.length) uit.push({ soort: 'ok', regel: 'nummers', tekst: `Nummers ${min}–${max} zonder gaten of dubbele.`, rijIds: [] });

  // ---- Richting: as uit de rijen (verdubbelde hoeken), daarna de zin per rij
  const richtingen = rijen.map(r => richtingRD(r.rd[0], r.rd[r.rd.length - 1]));
  const sx = richtingen.reduce((a, g) => a + Math.cos(2 * g * RAD), 0);
  const sy = richtingen.reduce((a, g) => a + Math.sin(2 * g * RAD), 0);
  const as = (Math.atan2(sy, sx) / RAD / 2 + 360) % 360;
  const mee = rijen.filter((_, i) => Math.cos((richtingen[i] - as) * RAD) >= 0);
  const tegen = rijen.filter((_, i) => Math.cos((richtingen[i] - as) * RAD) < 0);
  const [, minderheid] = mee.length >= tegen.length ? [mee, tegen] : [tegen, mee];
  if (minderheid.length) {
    uit.push({
      soort: 'let_op',
      regel: 'richting',
      tekst: `Rij ${lijst(minderheid.map(r => r.nummer))} ${minderheid.length === 1 ? 'is' : 'zijn'} andersom getekend (begin aan de andere kant dan de rest).`,
      rijIds: minderheid.map(r => r.id),
    });
  } else {
    uit.push({ soort: 'ok', regel: 'richting', tekst: 'Alle rijen beginnen aan dezelfde kant.', rijIds: [] });
  }

  // ---- Volgorde: nummers lopen op vanaf één kant (per rijlijn; stukken op één lijn tellen als één)
  const n: XY = [Math.cos(as * RAD), -Math.sin(as * RAD)];
  const c0 = rijen[0].rd[0];
  const offset = (r: (typeof rijen)[number]) => {
    const m = r.rd[Math.floor(r.rd.length / 2)];
    return (m[0] - c0[0]) * n[0] + (m[1] - c0[1]) * n[1];
  };
  const opLijn = [...rijen].map(r => ({ r, o: offset(r) })).sort((a, b) => a.o - b.o);
  const lijnen: { o: number; nummer: number; rijen: typeof rijen }[] = [];
  for (const x of opLijn) {
    const laatste = lijnen[lijnen.length - 1];
    if (laatste && x.o - laatste.o < 0.5) {
      laatste.rijen.push(x.r);
      laatste.nummer = Math.min(laatste.nummer, x.r.nummer);
    } else lijnen.push({ o: x.o, nummer: x.r.nummer, rijen: [x.r] });
  }
  if (lijnen.length >= 3) {
    const oplopend = lijnen[lijnen.length - 1].nummer >= lijnen[0].nummer;
    const verkeerd: (typeof rijen)[number][] = [];
    for (let i = 1; i < lijnen.length; i++) {
      const goed = oplopend ? lijnen[i].nummer > lijnen[i - 1].nummer : lijnen[i].nummer < lijnen[i - 1].nummer;
      if (!goed) verkeerd.push(...lijnen[i - 1].rijen, ...lijnen[i].rijen);
    }
    if (verkeerd.length) {
      const uniek = [...new Map(verkeerd.map(r => [r.id, r])).values()];
      uit.push({
        soort: 'let_op',
        regel: 'volgorde',
        tekst: `Nummers lopen niet op vanaf één kant bij rij ${lijst(uniek.map(r => r.nummer))}.`,
        rijIds: uniek.map(r => r.id),
      });
    }
  }

  // ---- Binnen de perceelgrens
  if (perceel) {
    const buiten = rijen.map(r => ({ r, m: maxBuitenGrens(r.rd, perceel) })).filter(x => x.m > GRENS_TOLERANTIE_M);
    if (buiten.length) {
      for (const x of buiten.slice(0, 8)) {
        uit.push({ soort: 'let_op', regel: 'grens', tekst: `Rij ${x.r.nummer} ligt tot ${f1(x.m)} m buiten de perceelgrens.`, rijIds: [x.r.id] });
      }
      if (buiten.length > 8) uit.push({ soort: 'let_op', regel: 'grens', tekst: `Nog ${buiten.length - 8} rijen buiten de grens.`, rijIds: buiten.slice(8).map(x => x.r.id) });
    } else {
      uit.push({ soort: 'ok', regel: 'grens', tekst: 'Alle rijen liggen binnen de perceelgrens (±1 m).', rijIds: [] });
    }
  }

  // ---- Kruisen
  const kruisingen: [(typeof rijen)[number], (typeof rijen)[number]][] = [];
  for (let i = 0; i < rijen.length; i++) {
    for (let j = i + 1; j < rijen.length; j++) {
      const a = rijen[i].rd;
      const b = rijen[j].rd;
      let kruist = false;
      for (let p = 1; p < a.length && !kruist; p++) {
        for (let q = 1; q < b.length && !kruist; q++) kruist = segmentenKruisen(a[p - 1], a[p], b[q - 1], b[q]);
      }
      if (kruist) kruisingen.push([rijen[i], rijen[j]]);
    }
  }
  for (const [a, b] of kruisingen.slice(0, 8)) {
    uit.push({ soort: 'let_op', regel: 'kruisen', tekst: `Rij ${a.nummer} kruist rij ${b.nummer}.`, rijIds: [a.id, b.id] });
  }
  if (!kruisingen.length) uit.push({ soort: 'ok', regel: 'kruisen', tekst: 'Geen rijen die elkaar kruisen.', rijIds: [] });

  // ---- Rijafstand en sprongen (per buurpaar, hart op hart langs de rij)
  if (rijen.length >= 2) {
    const buren = vindBuren(rijen.map(r => ({ rd: r.rd, nominaalM: null })));
    const paren: { a: number; b: number; d: number }[] = [];
    rijen.forEach((r, i) => {
      const j = buren[i].rechts;
      if (j === null) return;
      const lijn = buren[i].lijnRechts.map(k => rijen[k].rd);
      const lengte = r.rd.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - r.rd[k][0], p[1] - r.rd[k][1]), 0);
      const metingen: number[] = [];
      for (let s = 0; s <= lengte; s += 5) {
        const d = afstandOp(r.rd, s, lijn, -1, 50);
        if (d !== null) metingen.push(d);
      }
      if (metingen.length) paren.push({ a: i, b: j, d: mediaan(metingen) });
    });
    if (paren.length) {
      const gewoon = mediaan(paren.map(p => p.d));
      const melding = (p: { a: number; b: number; d: number }, reden: string) => ({
        soort: 'let_op' as const,
        regel: 'afstand',
        tekst: `Rij ${rijen[p.a].nummer} en ${rijen[p.b].nummer}: ${f1(p.d)} m uit elkaar ${reden}.`,
        rijIds: [rijen[p.a].id, rijen[p.b].id],
      });
      const afwijkend = paren
        .filter(p => p.d < MIN_RIJAFSTAND_M || p.d > MAX_RIJAFSTAND_M || (Math.abs(p.d - gewoon) > SPRONG_MIN_M && Math.abs(p.d - gewoon) > SPRONG_FACTOR * gewoon))
        .sort((x, y) => rijen[x.a].nummer - rijen[y.a].nummer);
      for (const p of afwijkend.slice(0, 8)) {
        const reden =
          p.d < MIN_RIJAFSTAND_M ? `(minder dan ${MIN_RIJAFSTAND_M} m)` : p.d > MAX_RIJAFSTAND_M ? `(meer dan ${MAX_RIJAFSTAND_M} m)` : `(meestal ${f1(gewoon)} m)`;
        uit.push(melding(p, reden));
      }
      if (afwijkend.length > 8) uit.push({ soort: 'let_op', regel: 'afstand', tekst: `Nog ${afwijkend.length - 8} buurparen met een afwijkende afstand.`, rijIds: [] });
      if (!afwijkend.length) uit.push({ soort: 'ok', regel: 'afstand', tekst: `Rijafstand overal aannemelijk (meestal ${f1(gewoon)} m).`, rijIds: [] });
    }
  }

  // ---- Ter informatie
  const zonderRas = rijen.filter(r => !r.rasEffectief);
  if (zonderRas.length) {
    uit.push({
      soort: 'info',
      regel: 'ras',
      tekst: zonderRas.length === rijen.length ? `Ras onbekend bij alle ${rijen.length} rijen.` : `Ras onbekend bij rij ${lijst(zonderRas.map(r => r.nummer))}.`,
      rijIds: zonderRas.map(r => r.id),
    });
  }
  const controleren = rijen.filter(r => r.controleren);
  if (controleren.length) {
    uit.push({
      soort: 'info',
      regel: 'controleren',
      tekst: `Op 'controleren' (rijlijn door een inham geknipt): ${controleren.length === rijen.length ? 'alle rijen' : `rij ${lijst(controleren.map(r => r.nummer))}`}.`,
      rijIds: controleren.map(r => r.id),
    });
  }
  return uit;
}
