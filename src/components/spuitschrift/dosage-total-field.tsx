'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const UNIT_OPTIONS = ['L/ha', 'kg/ha', 'ml/ha', 'g/ha'] as const;
const stripPerHa = (unit: string) => unit.replace('/ha', '');

interface DosageTotalFieldProps {
    /** Dosering per ha — source of truth (how it's saved to DB) */
    dosage: number;
    /** Per-ha unit (e.g. "kg/ha") */
    unit: string;
    /** Total hectares of selected parcels — required for "total" mode */
    totalArea: number;
    onDosageChange: (dosage: number) => void;
    onUnitChange: (unit: string) => void;
    disabled?: boolean;
    className?: string;
    /** Palette tint for the active toggle */
    tint?: 'emerald' | 'lime';
}

const formatNumber = (n: number) => {
    if (n === 0) return '';
    // Up to 4 decimal digits, drop trailing zeros
    const s = n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
};

/**
 * Dosage input with toggle between "Per ha" and "Totaal" modes.
 *
 * - Per ha: user types 0.12 kg/ha → stored as dosage=0.12
 * - Totaal: user types 0.941 kg (on 7.84 ha) → dosage auto-computed as 0.12 kg/ha
 *
 * The stored `dosage` is always per-ha (unchanged data model).
 * The displayed unit strips "/ha" in total mode (kg/ha → kg).
 * Live helper text shows the "other" value.
 */
export function DosageTotalField({
    dosage,
    unit,
    totalArea,
    onDosageChange,
    onUnitChange,
    disabled,
    className,
    tint = 'emerald',
}: DosageTotalFieldProps) {
    const [mode, setMode] = React.useState<'perHa' | 'total'>('perHa');
    const [localDisplay, setLocalDisplay] = React.useState<string | null>(null);
    const canUseTotal = totalArea > 0;

    // If total mode becomes unavailable (no parcels), fallback to per-ha
    React.useEffect(() => {
        if (!canUseTotal && mode === 'total') setMode('perHa');
    }, [canUseTotal, mode]);

    const storedDisplay = React.useMemo(() => {
        if (!dosage) return '';
        const value = mode === 'total' ? dosage * totalArea : dosage;
        return formatNumber(value);
    }, [dosage, mode, totalArea]);

    const display = localDisplay ?? storedDisplay;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9.,]/g, '');
        setLocalDisplay(raw);
        const parsed = parseFloat(raw.replace(',', '.'));
        if (isNaN(parsed)) {
            onDosageChange(0);
            return;
        }
        if (mode === 'total' && totalArea > 0) {
            const perHa = Math.round((parsed / totalArea) * 10000) / 10000;
            onDosageChange(perHa);
        } else {
            onDosageChange(parsed);
        }
    };

    const handleBlur = () => setLocalDisplay(null);

    const switchMode = (next: 'perHa' | 'total') => {
        if (next === mode) return;
        setMode(next);
        setLocalDisplay(null);
    };

    const totalValue = dosage * totalArea;
    const activeTint =
        tint === 'lime'
            ? 'bg-lime-500/15 text-lime-400 border-lime-500/40'
            : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40';

    return (
        <div className={cn('space-y-2', className)}>
            {/* Toggle — only show when there are hectares to compute against */}
            {canUseTotal && (
                <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => switchMode('perHa')}
                        className={cn(
                            'h-8 px-3 rounded-md text-sm font-medium transition-all',
                            mode === 'perHa'
                                ? cn('border', activeTint)
                                : 'text-slate-400 hover:text-slate-200',
                        )}
                    >
                        Per ha
                    </button>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => switchMode('total')}
                        className={cn(
                            'h-8 px-3 rounded-md text-sm font-medium transition-all',
                            mode === 'total'
                                ? cn('border', activeTint)
                                : 'text-slate-400 hover:text-slate-200',
                        )}
                    >
                        Totaal
                    </button>
                </div>
            )}

            {/* Input + unit */}
            <div className="flex gap-2">
                <Input
                    type="text"
                    inputMode="decimal"
                    value={display}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={disabled}
                    placeholder="0,00"
                    className="h-11 text-base font-semibold text-right tabular-nums flex-1"
                />
                <div className="grid grid-cols-2 gap-1 w-28 shrink-0">
                    {UNIT_OPTIONS.map(u => (
                        <button
                            key={u}
                            type="button"
                            disabled={disabled}
                            onClick={() => onUnitChange(u)}
                            className={cn(
                                'h-[22px] rounded text-[11px] font-medium transition-all border',
                                unit === u
                                    ? cn(activeTint, 'border-current')
                                    : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/[0.04]',
                            )}
                        >
                            {mode === 'total' ? stripPerHa(u) : u}
                        </button>
                    ))}
                </div>
            </div>

            {/* Helper — shows the "other" computed value */}
            {canUseTotal && dosage > 0 && (
                <p className="text-xs text-slate-500 leading-relaxed">
                    {mode === 'total' ? (
                        <>= <span className="text-slate-300 font-medium tabular-nums">{formatNumber(dosage)} {unit.includes('/ha') ? unit : `${unit}/ha`}</span> op {totalArea.toFixed(2)} ha</>
                    ) : (
                        <>= <span className="text-slate-300 font-medium tabular-nums">{formatNumber(totalValue)} {stripPerHa(unit)}</span> totaal op {totalArea.toFixed(2)} ha</>
                    )}
                </p>
            )}
        </div>
    );
}

/** Helper to format total usage for display (used in entry bullet lists) */
export function formatTotalUsage(dosage: number, totalArea: number, unit: string): string {
    const total = dosage * totalArea;
    if (total <= 0) return '';
    const displayUnit = stripPerHa(unit);
    const decimals = total >= 100 ? 0 : total >= 10 ? 1 : total >= 1 ? 2 : 3;
    return `${total.toFixed(decimals).replace('.', ',')} ${displayUnit}`;
}

/** Ensure unit has "/ha" suffix for per-ha display (handles legacy data where unit was stored as "L" / "kg") */
export function perHaUnit(unit: string): string {
    if (!unit) return '';
    return unit.includes('/ha') ? unit : `${unit}/ha`;
}

/** Strip "/ha" suffix for absolute total display */
export function totalUnit(unit: string): string {
    return unit ? unit.replace('/ha', '') : '';
}
