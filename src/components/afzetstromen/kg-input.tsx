'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ============================================================================
// KgInput — twee invoermodes voor gewicht:
//   - 'direct' : één veld met totaal-kg
//   - 'crates' : aantal kisten × kg per kist → automatisch berekend totaal-kg
//
// De parent houdt de volledige state bij (mode + 3 strings), zodat zowel
// tussenwaarden als mode-keuze behouden blijven bij bewerken.
// ============================================================================

export type KgInputMode = 'direct' | 'crates';

export interface KgInputValue {
    mode: KgInputMode;
    kg: string;          // Raw string; valid/parseable via computeTotalKg()
    crates: string;
    kgPerCrate: string;
}

export function emptyKgInputValue(): KgInputValue {
    return { mode: 'direct', kg: '', crates: '', kgPerCrate: '' };
}

/**
 * Haal het effectieve kg-totaal op uit een KgInputValue.
 * Returns null als niet genoeg info is ingevuld.
 */
export function computeTotalKg(v: KgInputValue): number | null {
    if (v.mode === 'crates') {
        const c = parseFloat(v.crates.replace(',', '.'));
        const kpc = parseFloat(v.kgPerCrate.replace(',', '.'));
        if (!Number.isFinite(c) || !Number.isFinite(kpc)) return null;
        return Math.round(c * kpc * 100) / 100;
    }
    const kg = parseFloat(v.kg.replace(',', '.'));
    return Number.isFinite(kg) ? kg : null;
}

/**
 * Factory voor initiële state bij bewerken.
 * Als `crates`/`kgPerCrate` aanwezig zijn → kisten-mode; anders direct.
 */
export function kgInputValueFrom({
    kg,
    crates,
    kgPerCrate,
}: {
    kg?: number | null;
    crates?: number | null;
    kgPerCrate?: number | null;
}): KgInputValue {
    const hasCrates = crates !== null && crates !== undefined;
    const hasKpc = kgPerCrate !== null && kgPerCrate !== undefined;
    if (hasCrates || hasKpc) {
        return {
            mode: 'crates',
            kg: kg != null ? String(kg) : '',
            crates: hasCrates ? String(crates) : '',
            kgPerCrate: hasKpc ? String(kgPerCrate) : '',
        };
    }
    return {
        mode: 'direct',
        kg: kg != null ? String(kg) : '',
        crates: '',
        kgPerCrate: '',
    };
}

interface KgInputProps {
    id?: string;
    label?: string;
    value: KgInputValue;
    onChange: (next: KgInputValue) => void;
    placeholder?: string;
    /** Extra tekst onder het veld (bv. "Optioneel"). */
    hint?: string;
    className?: string;
}

export function KgInput({
    id,
    label,
    value,
    onChange,
    placeholder,
    hint,
    className,
}: KgInputProps) {
    const totalKg = computeTotalKg(value);

    const setMode = (mode: KgInputMode) => {
        onChange({ ...value, mode });
    };

    return (
        <div className={cn('space-y-2', className)}>
            {label && <Label htmlFor={id}>{label}</Label>}

            {/* Mode-toggle */}
            <div className="inline-flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <button
                    type="button"
                    onClick={() => setMode('direct')}
                    className={cn(
                        'px-3 py-1 text-[11px] font-semibold rounded-md transition-colors',
                        value.mode === 'direct'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'text-slate-400 hover:text-slate-200'
                    )}
                >
                    Directe kg
                </button>
                <button
                    type="button"
                    onClick={() => setMode('crates')}
                    className={cn(
                        'px-3 py-1 text-[11px] font-semibold rounded-md transition-colors',
                        value.mode === 'crates'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'text-slate-400 hover:text-slate-200'
                    )}
                >
                    Kisten × kg/kist
                </button>
            </div>

            {value.mode === 'direct' ? (
                <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={value.kg}
                    onChange={(e) => onChange({ ...value, kg: e.target.value })}
                    placeholder={placeholder ?? 'kg'}
                />
            ) : (
                <div>
                    <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                        <Input
                            type="number"
                            inputMode="numeric"
                            step="1"
                            min={0}
                            value={value.crates}
                            onChange={(e) => onChange({ ...value, crates: e.target.value })}
                            placeholder="Aantal"
                            aria-label="Aantal kisten"
                        />
                        <span className="text-slate-500 text-sm font-medium">×</span>
                        <Input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            value={value.kgPerCrate}
                            onChange={(e) => onChange({ ...value, kgPerCrate: e.target.value })}
                            placeholder="kg/kist"
                            aria-label="Geschat gewicht per kist"
                        />
                        <span className="text-slate-500 text-sm font-medium">kg</span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-400">
                        {totalKg !== null ? (
                            <>
                                <span className="text-slate-500">Totaal: </span>
                                <span className="text-emerald-400 font-semibold">
                                    {totalKg.toLocaleString('nl-NL')} kg
                                </span>
                            </>
                        ) : (
                            <span className="italic text-slate-500">
                                Vul aantal kisten én kg per kist in om het totaal te zien.
                            </span>
                        )}
                    </div>
                </div>
            )}

            {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
        </div>
    );
}
