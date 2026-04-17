'use client';

import * as React from 'react';
import Link from 'next/link';
import { Factory, Boxes, Loader2, ExternalLink } from 'lucide-react';
import { CardTitle, CardDescription } from '@/components/ui/card';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useBatchEventsByType, useBatchSeasons } from '@/hooks/use-data';
import {
    EVENT_TYPE_ICONS,
    EVENT_TYPE_LABELS,
    EVENT_TYPE_COLORS,
    formatDateNL,
    formatEuro,
    formatKg,
} from '@/components/afzetstromen/constants';
import type { BatchEventType } from '@/lib/types';
import { cn } from '@/lib/utils';

const ALL_SEASONS = '__all_seasons__';

export default function SorteringPage() {
    const [tab, setTab] = React.useState<'extern' | 'eigen'>('extern');
    const [season, setSeason] = React.useState<string>(ALL_SEASONS);

    const { data: seasons = [] } = useBatchSeasons();

    const eventType: BatchEventType =
        tab === 'extern' ? 'sortering_extern' : 'sortering_eigen';

    const { data: events = [], isLoading } = useBatchEventsByType(eventType, {
        season: season !== ALL_SEASONS ? season : undefined,
    });

    const totals = React.useMemo(
        () =>
            events.reduce(
                (acc, e) => ({
                    count: acc.count + 1,
                    kg: acc.kg + (e.kg ?? 0),
                    cost: acc.cost + (e.costEur ?? 0),
                }),
                { count: 0, kg: 0, cost: 0 }
            ),
        [events]
    );

    return (
        <div className="space-y-6">
            <div>
                <CardTitle>Sortering</CardTitle>
                <CardDescription>
                    Overzicht van externe en eigen sorteerevents per seizoen.
                </CardDescription>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <Tabs value={tab} onValueChange={(v) => setTab(v as 'extern' | 'eigen')}>
                    <TabsList>
                        <TabsTrigger value="extern">
                            <Factory className="h-4 w-4 mr-2" />
                            Extern
                        </TabsTrigger>
                        <TabsTrigger value="eigen">
                            <Boxes className="h-4 w-4 mr-2" />
                            Eigen
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <Select value={season} onValueChange={setSeason}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Seizoen" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_SEASONS}>Alle seizoenen</SelectItem>
                        {seasons.map((s) => (
                            <SelectItem key={s} value={s}>
                                {s}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {events.length > 0 && (
                    <div className="ml-auto flex items-center gap-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[12px]">
                        <StatPill label="Events" value={String(totals.count)} />
                        <div className="h-8 w-px bg-white/10" />
                        <StatPill label="Totaal kg" value={formatKg(totals.kg)} />
                        <div className="h-8 w-px bg-white/10" />
                        <StatPill
                            label="Totaal kosten"
                            value={formatEuro(totals.cost)}
                            accent="text-amber-400"
                        />
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : events.length === 0 ? (
                <EmptyState type={eventType} />
            ) : (
                <div className="space-y-2">
                    {events.map((event) => (
                        <SorteringRow key={event.id} event={event} />
                    ))}
                </div>
            )}
        </div>
    );
}

function StatPill({
    label,
    value,
    accent,
}: {
    label: string;
    value: string;
    accent?: string;
}) {
    return (
        <div>
            <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                {label}
            </span>
            <div className={cn('font-semibold', accent || 'text-white')}>{value}</div>
        </div>
    );
}

function SorteringRow({
    event,
}: {
    event: {
        id: string;
        batchId: string;
        batchLabel: string | null;
        variety: string | null;
        eventType: BatchEventType;
        eventDate: Date | null;
        kg: number | null;
        costEur: number | null;
        details: Record<string, any>;
    };
}) {
    const Icon = EVENT_TYPE_ICONS[event.eventType];
    const colorClass = EVENT_TYPE_COLORS[event.eventType];
    const sorterOrKlant =
        (event.details.sorter_name as string | undefined) ||
        (event.details.klant_order as string | undefined) ||
        '—';
    const sizeCount = Array.isArray(event.details.sizes) ? event.details.sizes.length : 0;

    return (
        <Link
            href={`/afzetstromen/${event.batchId}`}
            className="group flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-card/30 backdrop-blur-md hover:border-emerald-500/30 transition-colors"
        >
            <div
                className={cn(
                    'shrink-0 h-10 w-10 rounded-lg border flex items-center justify-center',
                    colorClass
                )}
            >
                <Icon className="h-4 w-4" />
            </div>

            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-1">
                <div className="md:col-span-2">
                    <div className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                        {event.batchLabel || 'Partij zonder label'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{sorterOrKlant}</div>
                </div>
                <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                        Datum
                    </span>
                    <div className="text-[12px] text-slate-300">{formatDateNL(event.eventDate)}</div>
                </div>
                <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                        Kg
                    </span>
                    <div className="text-[12px] text-white font-semibold">{formatKg(event.kg)}</div>
                </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
                {sizeCount > 0 && (
                    <div className="text-[11px] text-slate-400">
                        <span className="font-semibold text-white">{sizeCount}</span> maten
                    </div>
                )}
                {event.costEur !== null && event.costEur > 0 && (
                    <div className="text-[13px] text-amber-400 font-semibold">
                        {formatEuro(event.costEur)}
                    </div>
                )}
                <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </div>
        </Link>
    );
}

function EmptyState({ type }: { type: BatchEventType }) {
    const Icon = EVENT_TYPE_ICONS[type];
    const text =
        type === 'sortering_extern'
            ? 'Voeg sorteerevents toe op een partij om hier het overzicht te zien.'
            : 'Registreer eigen sortering (maten, klassen, rot) op een partij om hier te verschijnen.';

    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-white/10 rounded-lg">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <Icon className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
                Geen {EVENT_TYPE_LABELS[type].toLowerCase()}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">{text}</p>
        </div>
    );
}
