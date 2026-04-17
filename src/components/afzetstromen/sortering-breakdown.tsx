'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// SorteringBreakdown — overzichtelijke weergave van sorteerverdeling
//
// Groepeert per klasse (Klasse I / II / III / Industrie), sorteert maten numeriek,
// toont kg + percentage met relatieve staaf + prijs per kg en opbrengst per rij.
// ============================================================================

export interface SorteringRow {
    size?: string | null;
    class?: string | null;
    kg?: number | null;
    percentage?: number | null;
    price_per_kg?: number | null;
    revenue_eur?: number | null;
}

interface SorteringBreakdownProps {
    sizes: SorteringRow[];
    showPrices?: boolean; // default: auto-detect
    compact?: boolean;
}

const CLASS_ORDER: Record<string, number> = {
    'Klasse I': 0,
    'Klasse II': 1,
    'Klasse III': 2,
    Industrie: 3,
};

const CLASS_STYLES: Record<
    string,
    { label: string; badgeClass: string; barClass: string; textClass: string }
> = {
    'Klasse I': {
        label: 'Klasse I',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        barClass: 'bg-emerald-500/70',
        textClass: 'text-emerald-400',
    },
    'Klasse II': {
        label: 'Klasse II',
        badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        barClass: 'bg-sky-500/70',
        textClass: 'text-sky-400',
    },
    'Klasse III': {
        label: 'Klasse III',
        badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        barClass: 'bg-amber-500/70',
        textClass: 'text-amber-400',
    },
    Industrie: {
        label: 'Industrie',
        badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
        barClass: 'bg-orange-500/70',
        textClass: 'text-orange-400',
    },
};

const DEFAULT_STYLE = {
    label: 'Onbekend',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    barClass: 'bg-slate-500/70',
    textClass: 'text-slate-400',
};

function classStyle(className: string | null | undefined) {
    return CLASS_STYLES[className ?? ''] ?? DEFAULT_STYLE;
}

/**
 * Extract eerste numerieke waarde uit een maatstring (bv. "60-70 mm" → 60).
 * Wordt gebruikt voor numerieke sortering binnen een klasse.
 */
function sizeStartMm(size: string | null | undefined): number {
    if (!size) return Number.POSITIVE_INFINITY;
    const match = size.match(/\d+/);
    return match ? parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

function formatKg(kg: number | null | undefined): string {
    if (kg == null) return '—';
    if (kg >= 1000) {
        return `${(kg / 1000).toLocaleString('nl-NL', {
            minimumFractionDigits: kg >= 10000 ? 1 : 2,
            maximumFractionDigits: 2,
        })} t`;
    }
    return `${kg.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kg`;
}

function formatEuro(v: number | null | undefined): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
    }).format(v);
}

function formatPct(p: number | null | undefined): string {
    if (p == null) return '—';
    return `${p.toFixed(p >= 10 ? 1 : 2)}%`;
}

export function SorteringBreakdown({
    sizes,
    showPrices,
    compact = false,
}: SorteringBreakdownProps) {
    const totalKg = React.useMemo(
        () => sizes.reduce((acc, r) => acc + (r.kg ?? 0), 0),
        [sizes],
    );

    const grouped = React.useMemo(() => {
        const map = new Map<string, SorteringRow[]>();
        for (const row of sizes) {
            const key = row.class ?? 'Onbekend';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(row);
        }
        for (const arr of map.values()) {
            arr.sort((a, b) => sizeStartMm(a.size) - sizeStartMm(b.size));
        }
        return Array.from(map.entries())
            .map(([className, items]) => {
                const classKg = items.reduce((sum, r) => sum + (r.kg ?? 0), 0);
                const classRevenue = items.reduce(
                    (sum, r) => sum + (r.revenue_eur ?? 0),
                    0,
                );
                return { className, items, classKg, classRevenue };
            })
            .sort(
                (a, b) =>
                    (CLASS_ORDER[a.className] ?? 99) - (CLASS_ORDER[b.className] ?? 99),
            );
    }, [sizes]);

    const maxKg = Math.max(1, ...sizes.map((r) => r.kg ?? 0));
    const showPriceCol =
        showPrices ??
        sizes.some((r) => r.price_per_kg != null || r.revenue_eur != null);

    if (sizes.length === 0) return null;

    return (
        <div className="space-y-3">
            {grouped.map((group) => {
                const style = classStyle(group.className);
                const classPct = totalKg > 0 ? (group.classKg / totalKg) * 100 : 0;
                return (
                    <div
                        key={group.className}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
                    >
                        {/* Klasse header */}
                        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-white/[0.02] border-b border-white/[0.05]">
                            <div className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
                                        style.badgeClass,
                                    )}
                                >
                                    {style.label}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                    {group.items.length}{' '}
                                    {group.items.length === 1 ? 'maat' : 'maten'}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-[12px]">
                                <div>
                                    <span className={cn('font-bold', style.textClass)}>
                                        {formatKg(group.classKg)}
                                    </span>
                                    <span className="text-slate-500 ml-1.5">
                                        ({formatPct(classPct)})
                                    </span>
                                </div>
                                {showPriceCol && group.classRevenue > 0 && (
                                    <div className="font-semibold text-white">
                                        {formatEuro(group.classRevenue)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Rijen per maat */}
                        <div>
                            {group.items.map((row, i) => {
                                const rowPct =
                                    row.percentage ??
                                    (totalKg > 0 && row.kg != null
                                        ? (row.kg / totalKg) * 100
                                        : null);
                                const barWidth =
                                    row.kg != null ? Math.min(100, (row.kg / maxKg) * 100) : 0;
                                // Zebra: afwisselend even/odd rijen voor snelle visuele scheiding.
                                const isEven = i % 2 === 0;
                                // Bepaal percentage-omvang voor schalen van opvallendheid.
                                const pctSizeClass =
                                    rowPct != null && rowPct >= 10
                                        ? 'text-[18px]'
                                        : rowPct != null && rowPct >= 1
                                          ? 'text-[15px]'
                                          : 'text-[13px]';
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            'relative px-3 border-t border-white/[0.04] first:border-t-0',
                                            compact ? 'py-2' : 'py-2.5',
                                            isEven ? 'bg-white/[0.015]' : 'bg-white/[0.035]',
                                        )}
                                    >
                                        {/* Achtergrond-balk die tot max-kg vult */}
                                        <div
                                            className={cn(
                                                'absolute inset-y-0 left-0 pointer-events-none transition-all',
                                                style.barClass,
                                                'opacity-[0.09]',
                                            )}
                                            style={{ width: `${barWidth}%` }}
                                        />

                                        <div className="relative flex items-center gap-3">
                                            {/* Maat */}
                                            <div className="font-mono text-[13px] font-semibold text-white min-w-[76px]">
                                                {row.size ?? '—'}
                                            </div>

                                            {/* Kg */}
                                            <div className="text-[12px] font-semibold text-white/90 min-w-[82px] text-right tabular-nums">
                                                {formatKg(row.kg)}
                                            </div>

                                            {/* Percentage — prominent */}
                                            <div
                                                className={cn(
                                                    'font-extrabold min-w-[72px] text-right tabular-nums leading-none',
                                                    style.textClass,
                                                    pctSizeClass,
                                                )}
                                            >
                                                {rowPct != null ? formatPct(rowPct) : '—'}
                                            </div>

                                            {showPriceCol && (
                                                <>
                                                    {/* Prijs per kg */}
                                                    <div className="text-[11px] text-slate-400 min-w-[72px] text-right tabular-nums">
                                                        {row.price_per_kg != null
                                                            ? `${formatEuro(row.price_per_kg)}/kg`
                                                            : '—'}
                                                    </div>
                                                    {/* Totaal opbrengst */}
                                                    <div className="text-[12px] font-semibold text-emerald-400/90 ml-auto min-w-[88px] text-right tabular-nums">
                                                        {row.revenue_eur != null
                                                            ? formatEuro(row.revenue_eur)
                                                            : ''}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Totaal-regel */}
            {grouped.length > 1 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/[0.1] bg-white/[0.04]">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Totaal
                    </span>
                    <div className="flex items-center gap-4 text-[12px]">
                        <span className="text-white font-bold tabular-nums">
                            {formatKg(totalKg)}
                        </span>
                        {showPriceCol && (
                            <span className="text-emerald-400 font-bold tabular-nums">
                                {formatEuro(
                                    grouped.reduce((sum, g) => sum + g.classRevenue, 0),
                                )}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
