'use client';

/**
 * Rijenkaart — compacte, inklapbare legenda: ras → kleur + aantal rijen, bestuivers
 * gestippeld, gerooid grijs, plus de markeringen die op de kaart in gebruik zijn.
 */

import { useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Rij } from '@/lib/rijen/types';
import {
  KLEUR_CONCEPT,
  KLEUR_CONTROLEREN,
  KLEUR_GEMARKEERD,
  KLEUR_GEROOID,
  KLEUR_NOTITIE,
  KLEUR_SELECTIE,
  rasNaam,
  rasSleutel,
} from './kleuren';

export type LegendaStijl = 'lijn' | 'gestippeld' | 'gerooid';

export interface LegendaItem {
  sleutel: string;
  label: string;
  kleur: string;
  aantal: number;
  stijl: LegendaStijl;
}

/**
 * Legenda-regels uit de rijen: per ras de hoofdrijen, daarna bestuivers per ras
 * (gestippeld), daarna gerooid (alleen als toonGerooid). Sortering: meeste rijen eerst.
 */
export function legendaItems(
  rijen: readonly Rij[],
  kleurVoorRas: (ras: string | null) => string,
  toonGerooid: boolean,
): LegendaItem[] {
  const hoofd = new Map<string, LegendaItem>();
  const bestuivers = new Map<string, LegendaItem>();
  let gerooid = 0;

  for (const rij of rijen) {
    if (rij.status === 'gerooid') {
      gerooid++;
      continue;
    }
    const ras = rij.rasEffectief;
    const k = rasSleutel(ras);
    const isBestuiver = rij.rol === 'bestuiver';
    const doel = isBestuiver ? bestuivers : hoofd;
    const bestaand = doel.get(k);
    if (bestaand) {
      bestaand.aantal++;
    } else {
      doel.set(k, {
        sleutel: `${isBestuiver ? 'b' : 'h'}|${k}`,
        label: isBestuiver ? (k ? `Bestuiver · ${rasNaam(ras)}` : 'Bestuiver') : rasNaam(ras),
        kleur: kleurVoorRas(ras),
        aantal: 1,
        stijl: isBestuiver ? 'gestippeld' : 'lijn',
      });
    }
  }

  const sorteer = (a: LegendaItem, b: LegendaItem) => b.aantal - a.aantal || a.label.localeCompare(b.label, 'nl');
  const items = [...Array.from(hoofd.values()).sort(sorteer), ...Array.from(bestuivers.values()).sort(sorteer)];
  if (toonGerooid && gerooid > 0) {
    items.push({ sleutel: 'gerooid', label: 'Gerooid', kleur: KLEUR_GEROOID, aantal: gerooid, stijl: 'gerooid' });
  }
  return items;
}

/** Middengrijze lijn in de stalen van markeringen (contrasteert met wit en cyaan) */
const STAAL_NEUTRAAL = '#94a3b8';

type Staal = LegendaStijl | 'controleren' | 'selectie' | 'gemarkeerd' | 'concept' | 'notitie';

function LijnStaal({ soort, kleur }: { soort: Staal; kleur: string }) {
  const lijn = (props: { stroke: string; width: number; dash?: string; opacity?: number }) => (
    <line
      x1={props.width > 6 ? 4 : 2}
      y1={6}
      x2={props.width > 6 ? 20 : 22}
      y2={6}
      stroke={props.stroke}
      strokeWidth={props.width}
      strokeDasharray={props.dash}
      strokeOpacity={props.opacity ?? 1}
      strokeLinecap={props.dash ? 'butt' : 'round'}
    />
  );
  return (
    <svg width={24} height={12} viewBox="0 0 24 12" aria-hidden="true" className="shrink-0">
      {soort === 'notitie' ? (
        <circle cx={12} cy={6} r={4.5} fill={KLEUR_NOTITIE} stroke="#ffffff" strokeWidth={1.5} />
      ) : (
        <>
          {soort === 'gemarkeerd' && lijn({ stroke: KLEUR_GEMARKEERD, width: 10, opacity: 0.55 })}
          {soort === 'controleren' && lijn({ stroke: KLEUR_CONTROLEREN, width: 9, dash: '3 3' })}
          {soort === 'selectie' && lijn({ stroke: KLEUR_SELECTIE, width: 8 })}
          {soort === 'concept' ? (
            <>
              {lijn({ stroke: '#ffffff', width: 3 })}
              {lijn({ stroke: KLEUR_CONCEPT, width: 3, dash: '4 4' })}
            </>
          ) : soort === 'gestippeld' ? (
            lijn({ stroke: kleur, width: 3, dash: '5 3' })
          ) : soort === 'gerooid' ? (
            lijn({ stroke: KLEUR_GEROOID, width: 3, dash: '3 5', opacity: 0.8 })
          ) : (
            lijn({ stroke: kleur, width: 3 })
          )}
        </>
      )}
    </svg>
  );
}

export interface RijenkaartLegendaProps {
  rijen: readonly Rij[];
  kleurVoorRas: (ras: string | null) => string;
  toonGerooid?: boolean;
  /** Omschrijving van de gemarkeerde rijen (bv. 'Behandeld 12 mrt · Captan'); null = niet tonen */
  gemarkeerdLabel?: string | null;
  aantalGeselecteerd?: number;
  aantalNotities?: number;
  heeftConcept?: boolean;
  /** Dekkende donkere achtergrond, voor gebruik bovenop de luchtfoto */
  opKaart?: boolean;
  standaardOpen?: boolean;
  className?: string;
}

export function RijenkaartLegenda({
  rijen,
  kleurVoorRas,
  toonGerooid = false,
  gemarkeerdLabel = null,
  aantalGeselecteerd = 0,
  aantalNotities = 0,
  heeftConcept = false,
  opKaart = false,
  standaardOpen = false,
  className,
}: RijenkaartLegendaProps) {
  const [open, setOpen] = useState(standaardOpen);
  const inhoudId = useId();

  const items = useMemo(() => legendaItems(rijen, kleurVoorRas, toonGerooid), [rijen, kleurVoorRas, toonGerooid]);
  const aantalActief = useMemo(() => rijen.filter(r => r.status !== 'gerooid').length, [rijen]);
  const aantalControleren = useMemo(
    () => rijen.filter(r => r.status !== 'gerooid' && r.controleren).length,
    [rijen],
  );

  const markeringen: { sleutel: string; label: string; soort: Staal; aantal?: number }[] = [];
  if (gemarkeerdLabel) markeringen.push({ sleutel: 'gemarkeerd', label: gemarkeerdLabel, soort: 'gemarkeerd' });
  if (aantalGeselecteerd > 0) {
    markeringen.push({ sleutel: 'selectie', label: 'Geselecteerd', soort: 'selectie', aantal: aantalGeselecteerd });
  }
  if (aantalControleren > 0) {
    markeringen.push({ sleutel: 'controleren', label: 'Controleren', soort: 'controleren', aantal: aantalControleren });
  }
  if (heeftConcept) markeringen.push({ sleutel: 'concept', label: 'Voorstel (nog niet opgeslagen)', soort: 'concept' });
  if (aantalNotities > 0) {
    markeringen.push({ sleutel: 'notitie', label: 'Notities', soort: 'notitie', aantal: aantalNotities });
  }

  const kleurStippen = items.filter(i => i.stijl === 'lijn').slice(0, 6);
  const leeg = items.length === 0 && markeringen.length === 0;

  return (
    <div
      // De kaart plaatst geen rijnummers onder elementen met dit attribuut
      data-rk-overlay=""
      className={cn(
        'overflow-hidden rounded-2xl border text-white',
        opKaart ? 'border-white/10 bg-black/70 shadow-lg backdrop-blur-md' : 'border-white/[0.06] bg-white/[0.03]',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={inhoudId}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Legenda</span>
        {!open && kleurStippen.length > 0 && (
          <span className="flex items-center gap-1" aria-hidden="true">
            {kleurStippen.map(i => (
              <span key={i.sleutel} className="h-2.5 w-2.5 rounded-full" style={{ background: i.kleur }} />
            ))}
          </span>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-white/40">
          {aantalActief} {aantalActief === 1 ? 'rij' : 'rijen'}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-white/40 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={inhoudId} className="max-h-[40vh] overflow-y-auto px-3 pb-2.5">
          {leeg ? (
            <p className="py-1 text-[11px] text-white/40">Nog geen rijen op dit perceel.</p>
          ) : (
            <ul className="space-y-1">
              {items.map(i => (
                <li key={i.sleutel} className="flex items-center gap-2 text-[11px] leading-5">
                  <LijnStaal soort={i.stijl} kleur={i.kleur} />
                  <span className="min-w-0 flex-1 truncate text-white/75">{i.label}</span>
                  <span className="tabular-nums text-white/40">{i.aantal}</span>
                </li>
              ))}
              {markeringen.length > 0 && items.length > 0 && <li aria-hidden="true" className="my-1 h-px bg-white/[0.06]" />}
              {markeringen.map(m => (
                <li key={m.sleutel} className="flex items-center gap-2 text-[11px] leading-5">
                  <LijnStaal soort={m.soort} kleur={STAAL_NEUTRAAL} />
                  <span className="min-w-0 flex-1 truncate text-white/75">{m.label}</span>
                  {m.aantal !== undefined && <span className="tabular-nums text-white/40">{m.aantal}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
