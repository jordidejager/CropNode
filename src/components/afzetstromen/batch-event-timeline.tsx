'use client';

import * as React from 'react';
import { Pencil, Trash2, FileText, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { BatchEvent, BatchEventType } from '@/lib/types';
import {
    EVENT_TYPE_COLORS,
    EVENT_TYPE_ICONS,
    EVENT_TYPE_LABELS,
    formatDateNL,
    formatEuro,
    formatKg,
} from './constants';
import { SorteringBreakdown } from './sortering-breakdown';

interface BatchEventTimelineProps {
    events: BatchEvent[];
    onEdit: (event: BatchEvent) => void;
    onDelete: (event: BatchEvent) => void;
}

export function BatchEventTimeline({ events, onEdit, onDelete }: BatchEventTimelineProps) {
    if (events.length === 0) {
        return (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                <p className="text-sm text-slate-400">
                    Nog geen events. Voeg een transport, sortering, afzet of koelcel-bewegingen toe.
                </p>
            </div>
        );
    }

    return (
        <div className="relative pl-8">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-white/[0.08]" />

            <div className="space-y-3">
                {events.map((event) => (
                    <BatchEventCard
                        key={event.id}
                        event={event}
                        onEdit={() => onEdit(event)}
                        onDelete={() => onDelete(event)}
                    />
                ))}
            </div>
        </div>
    );
}

function BatchEventCard({
    event,
    onEdit,
    onDelete,
}: {
    event: BatchEvent;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const Icon = EVENT_TYPE_ICONS[event.eventType];
    const label = EVENT_TYPE_LABELS[event.eventType];
    const colorClass = EVENT_TYPE_COLORS[event.eventType];

    return (
        <div className="relative">
            {/* Dot */}
            <div
                className={cn(
                    'absolute -left-8 top-4 h-6 w-6 rounded-full border-4 border-[#020617] flex items-center justify-center',
                    colorClass.replace('text-', 'bg-').replace('/10', '').split(' ')[0]
                )}
            />

            {/* Card */}
            <div className="rounded-xl border border-white/[0.06] bg-card/30 backdrop-blur-md p-4 hover:border-white/[0.12] transition-colors">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={cn('shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center', colorClass)}>
                            <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h4 className="text-[13px] font-bold text-white">{label}</h4>
                                <span className="text-[11px] text-slate-500 font-mono">
                                    {formatDateNL(event.eventDate) || 'geen datum'}
                                </span>
                            </div>
                            <EventSummary event={event} />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onEdit}
                            className="h-7 w-7 text-slate-400 hover:text-white"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={onDelete}
                            className="h-7 w-7 text-slate-400 hover:text-red-400"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Financial/kg stats row */}
                <EventStats event={event} />

                {/* Type-specific details */}
                <EventDetails event={event} />

                {event.notes && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] text-[12px] text-slate-300">
                        {event.notes}
                    </div>
                )}
            </div>
        </div>
    );
}

function EventSummary({ event }: { event: BatchEvent }) {
    const d = event.details as Record<string, any>;
    let summary: string | null = null;

    switch (event.eventType) {
        case 'transport':
            if (d.carrier || d.to) {
                summary = [d.carrier, d.to ? `→ ${d.to}` : null].filter(Boolean).join(' ');
            }
            break;
        case 'sortering_extern':
            if (d.sorter_name) summary = d.sorter_name;
            break;
        case 'afzet':
            if (d.buyer) summary = d.buyer;
            break;
        case 'inslag':
        case 'verplaatsing':
            if (event.storageCellName) summary = `naar ${event.storageCellName}`;
            break;
    }

    if (!summary) return null;
    return <p className="text-[12px] text-slate-400 mt-0.5 truncate">{summary}</p>;
}

function EventStats({ event }: { event: BatchEvent }) {
    const d = event.details as Record<string, any>;
    const crates = typeof d?.crates === 'number' ? d.crates : null;
    const kgPerCrate = typeof d?.kg_per_crate === 'number' ? d.kg_per_crate : null;
    const hasCrateInfo = crates !== null && kgPerCrate !== null;

    const hasStats =
        (event.kg !== null && event.kg !== undefined) ||
        (event.costEur !== null && event.costEur !== undefined) ||
        (event.revenueEur !== null && event.revenueEur !== undefined);

    if (!hasStats) return null;

    return (
        <div className="flex items-center gap-4 mt-3 text-[12px] flex-wrap">
            {event.kg !== null && event.kg !== undefined && (
                <div>
                    <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Kg</span>
                    <span className="text-white font-semibold ml-1.5">{formatKg(event.kg)}</span>
                    {hasCrateInfo && (
                        <span className="text-slate-500 ml-1.5 text-[11px]">
                            ({crates} × {kgPerCrate} kg)
                        </span>
                    )}
                </div>
            )}
            {event.costEur !== null && event.costEur !== undefined && event.costEur > 0 && (
                <div>
                    <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Kosten</span>
                    <span className="text-amber-400 font-semibold ml-1.5">{formatEuro(event.costEur)}</span>
                </div>
            )}
            {event.revenueEur !== null && event.revenueEur !== undefined && event.revenueEur > 0 && (
                <div>
                    <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Opbrengst</span>
                    <span className="text-emerald-400 font-semibold ml-1.5">
                        {formatEuro(event.revenueEur)}
                    </span>
                </div>
            )}
        </div>
    );
}

function EventDetails({ event }: { event: BatchEvent }) {
    const d = event.details as Record<string, any>;

    // Events met size-verdeling: sortering_extern, sortering_eigen, én afzet
    // (AI-extractie slaat sizes soms ook op afzet-event op).
    const hasSizes =
        (event.eventType === 'sortering_extern' ||
            event.eventType === 'sortering_eigen' ||
            event.eventType === 'afzet') &&
        Array.isArray(d.sizes) &&
        d.sizes.length > 0;

    if (hasSizes) {
        return (
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">
                    Sorteerverdeling
                </div>
                <SorteringBreakdown sizes={d.sizes} />
                {d.rot_percentage !== undefined && (
                    <div className="mt-2 text-[11px] text-slate-400">
                        Rot: <span className="text-red-400 font-semibold">{d.rot_percentage}%</span>
                    </div>
                )}
            </div>
        );
    }

    if (event.eventType === 'kwaliteitsmeting') {
        const entries = Object.entries(d).filter(
            ([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'notes'
        );
        if (entries.length === 0) return null;
        return (
            <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap gap-3 text-[11px]">
                {entries.map(([k, v]) => (
                    <div key={k}>
                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                            {k.replace(/_/g, ' ')}
                        </span>
                        <span className="text-white font-semibold ml-1.5">{String(v)}</span>
                    </div>
                ))}
            </div>
        );
    }

    return null;
}
