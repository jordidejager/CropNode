'use client';

/**
 * Rijenkaart (beta) — paneel "Rijen": selecteren (tekst of tikken), rij toevoegen/tekenen,
 * behandelde rijen van een bespuiting markeren en de sorteerbare rijenlijst.
 */

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Hand, PenLine, Plus, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { rijOppervlakHa } from '@/lib/rijen/generatie';
import type { Rij } from '@/lib/rijen/types';
import { cn } from '@/lib/utils';
import { useRijenkaartCtx } from './rijenkaart-context';
import { fmt, fmtDatum, fmtHa, fmtLengte, volgendNummer } from './rijen-hulp';
import { useRijToevoegen } from './use-rij-toevoegen';
import { Chip, GetalVeld, Knop, Melding, Sectie, Veld, tekstVeldStijl } from './ui';

type SorteerSleutel = 'nummer' | 'ras' | 'blok' | 'lengte';

const SORTEER_LABEL: Record<SorteerSleutel, string> = {
  nummer: 'Nr',
  ras: 'Ras',
  blok: 'Blok',
  lengte: 'Lengte',
};

const GEEN_MARKERING = '__geen__';

export function RijenPaneel() {
  const ctx = useRijenkaartCtx();
  const { kaart, rijen, actieveRijen, geselecteerd } = ctx;
  const [sorteer, setSorteer] = useState<{ sleutel: SorteerSleutel; oplopend: boolean }>({ sleutel: 'nummer', oplopend: true });
  const [tekenNummer, setTekenNummer] = useState<number | null>(null);

  const aantalGerooid = rijen.length - actieveRijen.length;
  const tikSelectieAan = ctx.kaartDoel?.soort === 'tik-selectie';
  const selectieRijen = useMemo(() => rijen.filter(r => geselecteerd.has(r.id)), [rijen, geselecteerd]);
  const selectieHa = useMemo(
    () =>
      rijOppervlakHa(
        selectieRijen
          .filter(r => r.status === 'actief')
          .map(r => ({ lengteM: r.lengteM, rijafstandM: ctx.effectieveAfstand.get(r.id) ?? r.rijafstandM })),
        kaart.instellingen?.rijafstandM ?? null,
      ),
    [selectieRijen, kaart.instellingen?.rijafstandM, ctx.effectieveAfstand],
  );

  // ---- Rij toevoegen ------------------------------------------------------
  const { voorstel, bezig: bezigToevoegen, voegToe } = useRijToevoegen();

  const nummerBezet =
    tekenNummer !== null && actieveRijen.some(r => r.nummer === tekenNummer) ? `Rij ${tekenNummer} bestaat al.` : null;

  const startTekenen = () => {
    if (tekenNummer !== null && (!Number.isInteger(tekenNummer) || nummerBezet)) {
      ctx.meld('Rij tekenen', nummerBezet ?? 'Het rijnummer moet een geheel getal zijn.');
      return;
    }
    ctx.zetKaartDoel({ soort: 'rij-tekenen', nummer: tekenNummer });
  };

  // ---- Bespuiting markeren ------------------------------------------------
  const bespuitingen = kaart.bespuitingen;
  const gemarkeerd = bespuitingen.find(b => b.id === ctx.gemarkeerdeBespuitingId) ?? null;

  // ---- Lijst --------------------------------------------------------------
  const lijst = useMemo(() => {
    const zichtbaar = ctx.toonGerooid ? rijen : actieveRijen;
    const rasInfo = ctx.rasInfo;
    const ras = (r: Rij) => (rasInfo(r).ras ?? '').toLowerCase();
    const factor = sorteer.oplopend ? 1 : -1;
    return [...zichtbaar].sort((a, b) => {
      let d = 0;
      if (sorteer.sleutel === 'ras') d = ras(a).localeCompare(ras(b), 'nl');
      else if (sorteer.sleutel === 'blok') d = (a.blokNaam ?? '').localeCompare(b.blokNaam ?? '', 'nl');
      else if (sorteer.sleutel === 'lengte') d = a.lengteM - b.lengteM;
      return factor * d || a.nummer - b.nummer || (a.status === 'gerooid' ? 1 : 0) - (b.status === 'gerooid' ? 1 : 0);
    });
  }, [rijen, actieveRijen, ctx.toonGerooid, ctx.rasInfo, sorteer]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip toon="emerald">{actieveRijen.length} rijen</Chip>
          {aantalGerooid > 0 && <Chip>{aantalGerooid} gerooid</Chip>}
        </div>
        {aantalGerooid > 0 && (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-white/70">
            <Switch checked={ctx.toonGerooid} onCheckedChange={ctx.zetToonGerooid} aria-label="Gerooide rijen tonen" />
            Gerooid tonen
          </label>
        )}
      </div>

      {actieveRijen.length === 0 && (
        <Melding soort="info" titel="Nog geen rijen">
          Ga naar <button type="button" className="font-semibold underline" onClick={() => ctx.zetTab('genereren')}>Genereren</button> om
          de rijen uit de luchtfoto te halen, of teken hieronder een rij.
        </Melding>
      )}

      <Sectie titel="Selecteren">
        <Veld
          label="Rijen"
          htmlFor="rk-selectie"
          fout={ctx.selectieFouten.length > 0 ? ctx.selectieFouten.join(' · ') : undefined}
          hint={
            geselecteerd.size > 0
              ? `${geselecteerd.size} ${geselecteerd.size === 1 ? 'rij' : 'rijen'} · ${fmtHa(selectieHa)}`
              : 'Bijvoorbeeld 1-20, 24 of een bloknaam'
          }
        >
          <div className="flex gap-2">
            <input
              id="rk-selectie"
              value={ctx.selectieTekst}
              onChange={e => ctx.zetSelectieTekst(e.target.value)}
              placeholder="1-20, 24 of bloknaam"
              autoComplete="off"
              enterKeyHint="done"
              className={tekstVeldStijl}
            />
            {(geselecteerd.size > 0 || ctx.selectieTekst) && (
              <Knop soort="secundair" aria-label="Selectie wissen" onClick={ctx.wisSelectie} className="w-11 shrink-0 px-0">
                <X className="h-4 w-4" />
              </Knop>
            )}
          </div>
        </Veld>
        <Knop
          vol
          soort={tikSelectieAan ? 'accent' : 'secundair'}
          aria-pressed={tikSelectieAan}
          icoon={<Hand className="h-4 w-4" />}
          onClick={() => ctx.zetKaartDoel(tikSelectieAan ? null : { soort: 'tik-selectie', anker: null })}
          disabled={actieveRijen.length === 0}
        >
          {tikSelectieAan ? 'Tik-selectie aan — tik eerste en laatste rij' : 'Tik-selectie op de kaart'}
        </Knop>
      </Sectie>

      <Sectie
        titel="Rij toevoegen"
        uitleg="Selecteer twee naast elkaar gelegen rijen (nieuwe rij ertussen) of één buitenste rij (nieuwe rij ernaast). Of teken een rij: tik begin en eind."
      >
        <Knop
          vol
          icoon={<Plus className="h-4 w-4" />}
          bezig={bezigToevoegen}
          disabled={!voorstel}
          onClick={() => void voegToe()}
        >
          {voorstel?.ok ? `Rij toevoegen ${voorstel.omschrijving}` : 'Rij toevoegen'}
        </Knop>
        {voorstel && !voorstel.ok && <p className="text-[12px] text-amber-200/80">{voorstel.reden}</p>}
        <div className="flex items-end gap-2">
          <Veld label="Nummer (optioneel)" className="w-32 shrink-0" fout={nummerBezet ?? undefined}>
            <GetalVeld
              label="Nummer van de nieuwe rij"
              waarde={tekenNummer}
              onChange={setTekenNummer}
              decimalen={0}
              invoerModus="numeric"
              placeholder={String(volgendNummer(rijen))}
            />
          </Veld>
          <Knop
            className="flex-1"
            soort={ctx.kaartDoel?.soort === 'rij-tekenen' ? 'accent' : 'secundair'}
            icoon={<PenLine className="h-4 w-4" />}
            onClick={startTekenen}
          >
            Rij tekenen
          </Knop>
        </div>
      </Sectie>

      {bespuitingen.length > 0 && (
        <Sectie titel="Markeer bespuiting" uitleg="Laat op de kaart zien welke rijen bij een bespuiting zijn behandeld.">
          <Select
            value={ctx.gemarkeerdeBespuitingId ?? GEEN_MARKERING}
            onValueChange={v => ctx.zetGemarkeerdeBespuiting(v === GEEN_MARKERING ? null : v)}
          >
            <SelectTrigger className="h-11 rounded-xl border-white/10 bg-black/30 text-left">
              <SelectValue placeholder="Kies een bespuiting" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GEEN_MARKERING}>Geen markering</SelectItem>
              {bespuitingen.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {fmtDatum(b.datum)} · {b.middelen || 'onbekend middel'}
                  {b.registrationType === 'spreading' ? ' (strooien)' : ''}
                  {b.rijIds ? ' · op rijen' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {gemarkeerd && (
            <p className="text-[13px] text-cyan-200/90">
              Behandeld op {fmtDatum(gemarkeerd.datum)}: {ctx.gemarkeerdAantal} {ctx.gemarkeerdAantal === 1 ? 'rij' : 'rijen'}
              {gemarkeerd.rijIds ? ' (gekoppeld aan rijen)' : ' (hele subperceel)'}.
            </p>
          )}
        </Sectie>
      )}

      {lijst.length > 0 && (
        <Sectie titel="Rijenlijst">
          <div className="flex gap-1" role="group" aria-label="Sorteren">
            {(Object.keys(SORTEER_LABEL) as SorteerSleutel[]).map(k => {
              const actief = sorteer.sleutel === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSorteer(s => (s.sleutel === k ? { sleutel: k, oplopend: !s.oplopend } : { sleutel: k, oplopend: true }))}
                  className={cn(
                    'flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg text-[12px] font-semibold transition-colors',
                    actief ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white',
                  )}
                >
                  {SORTEER_LABEL[k]}
                  {actief && (sorteer.oplopend ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              );
            })}
          </div>
          <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.06]">
            {lijst.map(r => (
              <RijRegel key={r.id} rij={r} />
            ))}
          </ul>
        </Sectie>
      )}
    </div>
  );
}

function RijRegel({ rij }: { rij: Rij }) {
  const ctx = useRijenkaartCtx();
  const sel = ctx.geselecteerd.has(rij.id);
  const ras = ctx.rasInfo(rij);
  const gerooid = rij.status === 'gerooid';
  const bomen = rij.aantalBomenEffectief;
  return (
    <li>
      <button
        type="button"
        onClick={() => ctx.wisselSelectie(rij.id)}
        aria-pressed={sel}
        className={cn(
          'flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left transition-colors',
          sel ? 'bg-emerald-500/[0.12]' : 'hover:bg-white/[0.03]',
          gerooid && 'opacity-60',
        )}
      >
        <span
          className={cn(
            'flex h-8 min-w-[40px] items-center justify-center rounded-lg px-1.5 text-sm font-bold tabular-nums',
            sel ? 'bg-emerald-500 text-black' : 'bg-white/[0.06] text-white',
            gerooid && 'line-through',
          )}
          style={sel ? undefined : { boxShadow: `inset 0 -2px 0 ${ctx.kleurVoorRas(ras.ras)}` }}
        >
          {rij.label?.trim() || rij.nummer}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-white/85">
            {ras.ras ?? 'Ras onbekend'}
            {ras.vanSubperceel && <span className="text-white/40"> (subperceel)</span>}
            {rij.blokNaam && <span className="text-white/45"> · {rij.blokNaam}</span>}
          </span>
          <span className="block truncate text-[12px] text-white/45">
            {fmtLengte(rij.lengteM)}
            {bomen !== null ? ` · ${fmt(bomen, 0)} bomen` : ''}
            {rij.rol === 'bestuiver' ? ' · bestuiver' : ''}
            {rij.controleren ? ' · controleren' : ''}
            {gerooid ? ` · gerooid${rij.gerooidOp ? ` ${fmtDatum(rij.gerooidOp)}` : ''}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}
