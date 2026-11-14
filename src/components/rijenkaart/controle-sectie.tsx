'use client';

/**
 * Rijenkaart (beta) — controle van de rijen (src/lib/rijen/controle.ts) bovenaan het tabblad Rijen: nummers,
 * richting, perceelgrens, kruisingen en rijafstand. "Toon" selecteert de betrokken rijen op de kaart; bij een
 * nummerprobleem zet "Nummers op volgorde" een hernummering klaar (tab Indeling, met bevestiging; id's blijven).
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, ListOrdered } from 'lucide-react';
import { controleerRijen, type ControleBevinding } from '@/lib/rijen/controle';
import { cn } from '@/lib/utils';
import { useRijenkaartCtx } from './rijenkaart-context';
import { Knop, Sectie } from './ui';

const VOLGORDE: Record<ControleBevinding['soort'], number> = { let_op: 0, ok: 1, info: 2 };

export function ControleSectie() {
  const ctx = useRijenkaartCtx();
  const { actieveRijen, perceelRD } = ctx;
  const [allesTonen, setAllesTonen] = useState(false);

  const bevindingen = useMemo(() => {
    try {
      return controleerRijen(
        actieveRijen.map(r => ({ id: r.id, nummer: r.nummer, coordinates: r.coordinates, rasEffectief: ctx.rasInfo(r).ras, controleren: r.controleren })),
        perceelRD,
      ).sort((a, b) => VOLGORDE[a.soort] - VOLGORDE[b.soort]);
    } catch {
      return [];
    }
  }, [actieveRijen, perceelRD, ctx]);

  if (actieveRijen.length === 0 || bevindingen.length === 0) return null;
  const aantalLetOp = bevindingen.filter(b => b.soort === 'let_op').length;
  const nummerProbleem = bevindingen.some(b => b.soort === 'let_op' && (b.regel === 'nummers' || b.regel === 'volgorde'));
  const zichtbaar = allesTonen || aantalLetOp === 0 ? bevindingen : bevindingen.filter(b => b.soort === 'let_op');

  const nummersOpVolgorde = () => {
    const eerste = [...actieveRijen].sort((a, b) => a.nummer - b.nummer)[0];
    ctx.zetStartnummerInvoer(1);
    ctx.zetRij1Kandidaat(eerste.id);
    ctx.zetTab('indeling');
  };

  return (
    <Sectie
      titel="Controle"
      uitleg={
        aantalLetOp === 0
          ? 'De rijen voldoen aan de regels waar Jager Fleet op rekent.'
          : `${aantalLetOp} ${aantalLetOp === 1 ? 'punt' : 'punten'} om na te kijken voordat Jager Fleet ermee rijdt.`
      }
    >
      <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02]">
        {zichtbaar.map((b, i) => (
          <li key={`${b.regel}-${i}`} className="flex items-start gap-2.5 px-3 py-2.5 text-[13px] leading-snug">
            {b.soort === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-label="In orde" />
            ) : b.soort === 'let_op' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-label="Let op" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-label="Ter info" />
            )}
            <span className={cn('min-w-0 flex-1', b.soort === 'ok' ? 'text-white/60' : 'text-white/85')}>{b.tekst}</span>
            {b.rijIds.length > 0 && b.soort !== 'ok' && (
              <button
                type="button"
                className="-my-2 min-h-[44px] shrink-0 px-1 text-[13px] font-semibold text-emerald-300 hover:underline"
                onClick={() => ctx.zetSelectie(b.rijIds)}
              >
                Toon
              </button>
            )}
          </li>
        ))}
      </ul>
      {aantalLetOp > 0 && (
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-1 text-[13px] text-white/55 hover:text-white/80"
          onClick={() => setAllesTonen(v => !v)}
          aria-expanded={allesTonen}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', allesTonen && 'rotate-180')} aria-hidden="true" />
          {allesTonen ? 'Alleen de punten om na te kijken' : `Ook wat in orde is (${bevindingen.length - aantalLetOp})`}
        </button>
      )}
      {nummerProbleem && (
        <Knop vol icoon={<ListOrdered className="h-4 w-4" />} onClick={nummersOpVolgorde}>
          Nummers op volgorde zetten
        </Knop>
      )}
    </Sectie>
  );
}
