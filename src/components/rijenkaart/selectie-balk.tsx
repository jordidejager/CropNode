'use client';

/**
 * Rijenkaart (beta) — selectiebalk: "{n} rijen · {ha} ha" met de acties op de selectie.
 * Mobiel: vast onderaan het scherm (via een portal, met safe-area); desktop: onderaan het paneel.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Droplets, Flower2, Layers, Plus, StickyNote, Trash2, TreePine, X } from 'lucide-react';
import { rijOppervlakHa } from '@/lib/rijen/generatie';
import { formatteerBereiken } from '@/lib/rijen/selectie';
import { cn } from '@/lib/utils';
import { useRijenkaartCtx } from './rijenkaart-context';
import { fmtHa } from './rijen-hulp';
import { useRijToevoegen } from './use-rij-toevoegen';

function BalkKnop({
  icoon,
  label,
  onClick,
  gevaar,
  disabled,
}: {
  icoon: React.ReactNode;
  label: string;
  onClick: () => void;
  gevaar?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // w-full min-w-0: precies de kolombreedte, zodat 7 knoppen (met 'Rij erbij') niet overlappen op 375–390 px
        'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-xl px-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40',
        gevaar ? 'text-red-300 active:bg-red-500/15' : 'text-white/85 active:bg-white/10 hover:bg-white/[0.06]',
      )}
    >
      {icoon}
      {label}
    </button>
  );
}

function BalkInhoud() {
  const ctx = useRijenkaartCtx();
  const { geselecteerd, rijen } = ctx;
  const selectie = useMemo(() => rijen.filter(r => geselecteerd.has(r.id)), [rijen, geselecteerd]);
  const actief = selectie.filter(r => r.status === 'actief');
  const ids = selectie.map(r => r.id);
  const actiefIds = actief.map(r => r.id);
  const ha = rijOppervlakHa(actief, ctx.kaart.instellingen?.rijafstandM ?? null);
  const { voorstel, bezig, voegToe } = useRijToevoegen();

  return (
    <>
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="min-w-0 flex-1 truncate text-[13px] text-white/90">
          <span className="font-semibold">
            {selectie.length} {selectie.length === 1 ? 'rij' : 'rijen'}
          </span>
          <span className="text-white/50"> · {fmtHa(ha)} · rij {formatteerBereiken(selectie.map(r => r.nummer))}</span>
        </p>
        <button
          type="button"
          onClick={ctx.wisSelectie}
          aria-label="Selectie wissen"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid auto-cols-fr grid-flow-col gap-0.5 overflow-x-auto px-1.5 pb-2 scrollbar-hide">
        <BalkKnop
          icoon={<Layers className="h-4 w-4" />}
          label="Blok"
          disabled={actiefIds.length === 0}
          onClick={() =>
            ctx.openDialoog(
              ctx.kaart.blokken.length > 0
                ? { soort: 'blok-toekennen', rijIds: actiefIds }
                : { soort: 'blok', blokId: null, rijIds: actiefIds },
            )
          }
        />
        <BalkKnop
          icoon={<Flower2 className="h-4 w-4" />}
          label="Bestuiver"
          disabled={actiefIds.length === 0}
          onClick={() => ctx.openDialoog({ soort: 'bestuiver', rijIds: actiefIds })}
        />
        <BalkKnop icoon={<StickyNote className="h-4 w-4" />} label="Notitie" onClick={() => ctx.openDialoog({ soort: 'notitie', rijIds: ids })} />
        <BalkKnop
          icoon={<Droplets className="h-4 w-4" />}
          label="Bespuiting"
          disabled={actiefIds.length === 0}
          onClick={() => ctx.openDialoog({ soort: 'bespuiting', rijIds: actiefIds })}
        />
        {voorstel?.ok && (
          <BalkKnop icoon={<Plus className="h-4 w-4" />} label={bezig ? 'Bezig…' : 'Rij erbij'} disabled={bezig} onClick={() => void voegToe()} />
        )}
        <BalkKnop
          icoon={<TreePine className="h-4 w-4" />}
          label={actief.length === 0 ? 'Herstel' : 'Rooien'}
          onClick={() => ctx.openDialoog({ soort: 'rooien', rijIds: ids })}
        />
        <BalkKnop
          gevaar
          icoon={<Trash2 className="h-4 w-4" />}
          label="Verwijder"
          disabled={actiefIds.length === 0}
          onClick={() => ctx.openDialoog({ soort: 'verwijderen', rijIds: actiefIds })}
        />
      </div>
    </>
  );
}

/** Desktop: onderaan het paneel (lg en breder). */
export function SelectieBalkPaneel({ className }: { className?: string }) {
  return (
    <div className={cn('hidden border-t border-white/10 bg-slate-950/95 lg:block', className)}>
      <BalkInhoud />
    </div>
  );
}

/** Mobiel: vast onderaan het scherm, boven de safe-area (iPhone). z-30: onder de menu-backdrop (z-40). */
export function SelectieBalkMobiel() {
  const [gemount, setGemount] = useState(false);
  useEffect(() => setGemount(true), []);
  if (!gemount) return null;
  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <BalkInhoud />
    </div>,
    document.body,
  );
}
