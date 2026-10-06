'use client';

/**
 * Rijenkaart (beta) — kleine UI-bouwstenen voor de panelen: duimvriendelijke knoppen (≥ 44 px),
 * getalvelden met komma, meldingen en een segmented control. Donkere glass-stijl, emerald-accent.
 */

import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmt, parseGetal } from './rijen-hulp';

// ---------------------------------------------------------------------------
// Knoppen
// ---------------------------------------------------------------------------

type KnopSoort = 'primair' | 'secundair' | 'gevaar' | 'stil' | 'accent';

export interface KnopProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  soort?: KnopSoort;
  bezig?: boolean;
  icoon?: ReactNode;
  klein?: boolean;
  vol?: boolean;
}

const KNOP_STIJL: Record<KnopSoort, string> = {
  primair: 'bg-emerald-500 text-black hover:bg-emerald-400 active:bg-emerald-600 border-emerald-400/40 shadow-lg shadow-emerald-500/10',
  accent: 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border-emerald-500/30',
  secundair: 'bg-white/[0.05] text-white/85 hover:bg-white/[0.09] active:bg-white/[0.12] border-white/10',
  gevaar: 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border-red-500/30',
  stil: 'bg-transparent text-white/60 hover:text-white hover:bg-white/[0.05] border-transparent',
};

export const Knop = forwardRef<HTMLButtonElement, KnopProps>(function Knop(
  { soort = 'secundair', bezig = false, icoon, klein = false, vol = false, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || bezig}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl border font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
        // ook 'klein' blijft ≥ 44 px hoog (duimbediening op de iPhone); alleen smaller en kleinere tekst
        klein ? 'min-h-[44px] px-3 text-[13px]' : 'min-h-[44px] px-4 text-sm',
        vol && 'w-full',
        KNOP_STIJL[soort],
        className,
      )}
      {...rest}
    >
      {bezig ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icoon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Secties en meldingen
// ---------------------------------------------------------------------------

export function Sectie({
  titel,
  uitleg,
  actie,
  children,
  className,
}: {
  titel: string;
  uitleg?: ReactNode;
  actie?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-white/50">{titel}</h3>
          {uitleg && <p className="mt-1 text-[13px] leading-snug text-white/45">{uitleg}</p>}
        </div>
        {actie && <div className="shrink-0">{actie}</div>}
      </div>
      {children}
    </section>
  );
}

type MeldingSoort = 'info' | 'waarschuwing' | 'fout' | 'succes';

const MELDING_STIJL: Record<MeldingSoort, { kader: string; icoon: ReactNode }> = {
  info: { kader: 'border-sky-400/20 bg-sky-500/[0.07] text-sky-100/90', icoon: <Info className="h-4 w-4 text-sky-300" /> },
  waarschuwing: {
    kader: 'border-amber-400/30 bg-amber-500/[0.08] text-amber-100/90',
    icoon: <AlertTriangle className="h-4 w-4 text-amber-300" />,
  },
  fout: { kader: 'border-red-400/30 bg-red-500/[0.08] text-red-100/90', icoon: <XCircle className="h-4 w-4 text-red-300" /> },
  succes: {
    kader: 'border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-100/90',
    icoon: <CheckCircle2 className="h-4 w-4 text-emerald-300" />,
  },
};

export function Melding({
  soort = 'info',
  titel,
  children,
  className,
}: {
  soort?: MeldingSoort;
  titel?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const s = MELDING_STIJL[soort];
  return (
    <div role={soort === 'fout' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-xl border p-3 text-[13px] leading-snug', s.kader, className)}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {s.icoon}
      </span>
      <div className="min-w-0 space-y-1">
        {titel && <p className="font-semibold">{titel}</p>}
        {children && <div className="text-current/90">{children}</div>}
      </div>
    </div>
  );
}

export function Chip({ children, className, toon = 'neutraal' }: { children: ReactNode; className?: string; toon?: 'neutraal' | 'emerald' | 'amber' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium tabular-nums',
        toon === 'emerald' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        toon === 'amber' && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
        toon === 'neutraal' && 'border-white/10 bg-white/[0.04] text-white/70',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export function Segment<T extends string>({
  opties,
  waarde,
  onChange,
  label,
  className,
}: {
  opties: readonly { waarde: T; label: ReactNode; badge?: ReactNode }[];
  waarde: T;
  onChange: (w: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex rounded-2xl border border-white/10 bg-black/30 p-1', className)}>
      {opties.map(o => {
        const actief = o.waarde === waarde;
        return (
          <button
            key={o.waarde}
            type="button"
            role="tab"
            aria-selected={actief}
            onClick={() => onChange(o.waarde)}
            className={cn(
              'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold transition-colors',
              actief ? 'bg-emerald-500 text-black shadow' : 'text-white/60 hover:text-white',
            )}
          >
            {o.label}
            {o.badge}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Getallen
// ---------------------------------------------------------------------------

/**
 * Getalinvoer met komma. Houdt de tekst lokaal bij en meldt alleen geldige getallen (of null bij
 * leeg) via onChange; een externe waarde-wijziging (bv. via −/+) wordt overgenomen.
 */
export function GetalVeld({
  waarde,
  onChange,
  decimalen = 2,
  achtervoegsel,
  placeholder,
  min,
  max,
  label,
  className,
  id,
  invoerModus = 'decimal',
}: {
  waarde: number | null;
  onChange: (n: number | null) => void;
  decimalen?: number;
  achtervoegsel?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
  id?: string;
  invoerModus?: 'decimal' | 'numeric';
}) {
  const eigenId = useId();
  const veldId = id ?? eigenId;
  const naarTekst = (n: number | null) => (n === null || !Number.isFinite(n) ? '' : fmt(n, decimalen).replace(/\./g, ''));
  const [tekst, setTekst] = useState(() => naarTekst(waarde));
  const laatsteGemeld = useRef<number | null>(waarde);

  useEffect(() => {
    // Alleen overnemen als de waarde van buitenaf veranderde (niet tijdens typen)
    if (waarde !== laatsteGemeld.current) {
      laatsteGemeld.current = waarde;
      setTekst(naarTekst(waarde));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waarde, decimalen]);

  const geparsed = parseGetal(tekst);
  const ongeldig =
    geparsed !== null &&
    (Number.isNaN(geparsed) || (min !== undefined && geparsed < min) || (max !== undefined && geparsed > max));

  return (
    <div className={cn('relative', className)}>
      <input
        id={veldId}
        aria-label={label}
        aria-invalid={ongeldig || undefined}
        inputMode={invoerModus}
        autoComplete="off"
        value={tekst}
        placeholder={placeholder}
        onChange={e => {
          const t = e.target.value;
          setTekst(t);
          const n = parseGetal(t);
          if (n === null) {
            laatsteGemeld.current = null;
            onChange(null);
          } else if (!Number.isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) {
            laatsteGemeld.current = n;
            onChange(n);
          }
        }}
        onBlur={() => {
          // Na het verlaten van het veld toont het altijd de waarde die echt geldt: een leeg,
          // ongeldig of door de ouder geweigerd getal (bv. kopakker leeg, startnummer 1,5) springt
          // terug, zodat veld en berekening niet uiteenlopen.
          laatsteGemeld.current = waarde;
          setTekst(naarTekst(waarde));
        }}
        className={cn(
          'h-11 w-full rounded-xl border bg-black/30 px-3 text-base tabular-nums text-white placeholder:text-white/30',
          'focus:outline-none focus:ring-2 focus:ring-emerald-400/50 md:text-sm',
          achtervoegsel && 'pr-9',
          ongeldig ? 'border-red-400/60' : 'border-white/10',
        )}
      />
      {achtervoegsel && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-white/40">
          {achtervoegsel}
        </span>
      )}
    </div>
  );
}

/** Label + [− waarde +] met grote knoppen; optioneel een invoerveld in het midden. */
export function Stapper({
  label,
  waarde,
  onMin,
  onPlus,
  minLabel,
  plusLabel,
  midden,
  onderschrift,
}: {
  label: string;
  waarde?: ReactNode;
  onMin: () => void;
  onPlus: () => void;
  minLabel: ReactNode;
  plusLabel: ReactNode;
  midden?: ReactNode;
  onderschrift?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-white/70">{label}</span>
        {waarde !== undefined && <span className="text-[13px] tabular-nums text-white/90">{waarde}</span>}
      </div>
      <div className="flex items-stretch gap-2">
        <Knop className="min-w-[72px] flex-1 tabular-nums" onClick={onMin}>
          {minLabel}
        </Knop>
        {midden && <div className="w-28 shrink-0">{midden}</div>}
        <Knop className="min-w-[72px] flex-1 tabular-nums" onClick={onPlus}>
          {plusLabel}
        </Knop>
      </div>
      {onderschrift && <p className="text-[12px] text-white/40">{onderschrift}</p>}
    </div>
  );
}

/** Veld met label erboven. */
export function Veld({
  label,
  htmlFor,
  hint,
  fout,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  fout?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-white/70">
        {label}
      </label>
      {children}
      {fout ? (
        <p className="text-[12px] text-red-300">{fout}</p>
      ) : hint ? (
        <p className="text-[12px] text-white/40">{hint}</p>
      ) : null}
    </div>
  );
}

export const tekstVeldStijl =
  'h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-base text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 md:text-sm';
