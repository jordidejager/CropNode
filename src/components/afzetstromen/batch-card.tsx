'use client';

import Link from 'next/link';
import {
    Package,
    MapPin,
    Snowflake,
    TrendingUp,
    TrendingDown,
    Calendar,
    Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Batch } from '@/lib/types';
import {
    STATUS_COLORS,
    STATUS_LABELS,
    autoLabelFromHarvest,
    formatDateNL,
    formatEuro,
    formatKg,
} from './constants';

interface BatchCardProps {
    batch: Batch;
}

export function BatchCard({ batch }: BatchCardProps) {
    const displayLabel =
        batch.label ||
        autoLabelFromHarvest({
            variety: batch.variety,
            pickNumber: batch.pickNumber,
            subParcelName: batch.subParcelName,
            parcelName: batch.parcelName,
            year: batch.harvestYear,
        });

    const margin = batch.marginEur ?? 0;
    const hasFinancials = (batch.totalCostEur ?? 0) > 0 || (batch.totalRevenueEur ?? 0) > 0;
    const netPerKg =
        hasFinancials && (batch.totalKgIn ?? 0) > 0
            ? margin / (batch.totalKgIn as number)
            : null;

    return (
        <Link
            href={`/afzetstromen/${batch.id}`}
            className="group block rounded-2xl border border-white/5 bg-card/30 backdrop-blur-md p-5 transition-all hover:border-emerald-500/30 hover:bg-card/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.08)]"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                        {displayLabel}
                    </h3>
                    {batch.variety && (
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mt-0.5">
                            {batch.variety}
                        </p>
                    )}
                </div>
                <span
                    className={cn(
                        'shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border',
                        STATUS_COLORS[batch.status]
                    )}
                >
                    {STATUS_LABELS[batch.status]}
                </span>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate-400 mb-4">
                {(batch.subParcelName || batch.parcelName) && (
                    <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-500" />
                        <span>{batch.subParcelName || batch.parcelName}</span>
                    </div>
                )}
                {batch.harvestDate && (
                    <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-500" />
                        <span>{formatDateNL(batch.harvestDate)}</span>
                    </div>
                )}
                {batch.currentStorageCellName ? (
                    <div className="flex items-center gap-1.5 text-sky-400">
                        <Snowflake className="h-3.5 w-3.5" />
                        <span className="font-semibold">{batch.currentStorageCellName}</span>
                    </div>
                ) : batch.lastStorageEventType === 'uitslag' ? (
                    <div className="flex items-center gap-1.5 text-slate-500">
                        <Snowflake className="h-3.5 w-3.5" />
                        <span>Uitgeslagen</span>
                    </div>
                ) : null}
                {(batch.eventCount ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5 text-slate-500">
                        <Activity className="h-3.5 w-3.5" />
                        <span>{batch.eventCount} events</span>
                    </div>
                )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/[0.06]">
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">
                        Kg in
                    </div>
                    <div className="text-[13px] font-semibold text-white flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-slate-500" />
                        {formatKg(batch.totalKgIn)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">
                        Opbrengst
                    </div>
                    <div className="text-[13px] font-semibold text-white">
                        {formatEuro(batch.totalRevenueEur)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">
                        Marge
                    </div>
                    <div
                        className={cn(
                            'text-[13px] font-semibold flex items-center gap-1',
                            hasFinancials
                                ? margin >= 0
                                    ? 'text-emerald-400'
                                    : 'text-red-400'
                                : 'text-slate-500'
                        )}
                    >
                        {hasFinancials ? (
                            margin >= 0 ? (
                                <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                                <TrendingDown className="h-3.5 w-3.5" />
                            )
                        ) : null}
                        {hasFinancials ? formatEuro(margin) : '—'}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">
                        Netto €/kg
                    </div>
                    <div
                        className={cn(
                            'text-[13px] font-semibold',
                            netPerKg == null
                                ? 'text-slate-500'
                                : netPerKg >= 0
                                  ? 'text-emerald-400'
                                  : 'text-red-400',
                        )}
                    >
                        {netPerKg != null
                            ? `${formatEuro(netPerKg)}/kg`
                            : '—'}
                    </div>
                </div>
            </div>

            {batch.reservedFor && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] text-[11px] text-amber-400">
                    <span className="font-bold">Gereserveerd voor:</span>{' '}
                    <span className="text-amber-300">{batch.reservedFor}</span>
                </div>
            )}
        </Link>
    );
}
