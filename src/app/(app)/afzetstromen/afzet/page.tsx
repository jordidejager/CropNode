'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShoppingCart, Loader2, ExternalLink, TrendingUp, Users, Package } from 'lucide-react';
import { CardTitle, CardDescription } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useBatchEventsByType, useBatchSeasons } from '@/hooks/use-data';
import {
    formatDateNL,
    formatEuro,
    formatKg,
} from '@/components/afzetstromen/constants';
import { cn } from '@/lib/utils';

const ALL_SEASONS = '__all_seasons__';

export default function AfzetPage() {
    const [season, setSeason] = React.useState<string>(ALL_SEASONS);

    const { data: seasons = [] } = useBatchSeasons();
    const { data: events = [], isLoading } = useBatchEventsByType('afzet', {
        season: season !== ALL_SEASONS ? season : undefined,
    });

    const stats = React.useMemo(() => {
        const totals = events.reduce(
            (acc, e) => ({
                count: acc.count + 1,
                kg: acc.kg + (e.kg ?? 0),
                revenue: acc.revenue + (e.revenueEur ?? 0),
            }),
            { count: 0, kg: 0, revenue: 0 }
        );
        const avgPrice = totals.kg > 0 ? totals.revenue / totals.kg : 0;
        // Per-afnemer aggregatie
        const byBuyer = new Map<string, { kg: number; revenue: number; count: number }>();
        for (const e of events) {
            const buyer = (e.details as any)?.buyer ?? 'Onbekend';
            const cur = byBuyer.get(buyer) ?? { kg: 0, revenue: 0, count: 0 };
            cur.kg += e.kg ?? 0;
            cur.revenue += e.revenueEur ?? 0;
            cur.count += 1;
            byBuyer.set(buyer, cur);
        }
        const buyers = Array.from(byBuyer.entries())
            .map(([buyer, v]) => ({ buyer, ...v }))
            .sort((a, b) => b.revenue - a.revenue);

        return { totals, avgPrice, buyers };
    }, [events]);

    return (
        <div className="space-y-6">
            <div>
                <CardTitle>Afzet</CardTitle>
                <CardDescription>
                    Alle verkopen en uitbetalingen per partij. Bekijk opbrengst, afnemers en gemiddelde prijs.
                </CardDescription>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
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
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-white/10 rounded-lg">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                        <ShoppingCart className="h-8 w-8 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Nog geen afzet</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                        Registreer afzet-events op een partij om hier opbrengsten en afnemer-verdeling te zien.
                    </p>
                </div>
            ) : (
                <>
                    {/* KPI cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiCard
                            icon={<ShoppingCart className="h-5 w-5" />}
                            label="Afzet-events"
                            value={String(stats.totals.count)}
                            color="emerald"
                        />
                        <KpiCard
                            icon={<Package className="h-5 w-5" />}
                            label="Totaal verkocht"
                            value={formatKg(stats.totals.kg)}
                            color="sky"
                        />
                        <KpiCard
                            icon={<TrendingUp className="h-5 w-5" />}
                            label="Totaal opbrengst"
                            value={formatEuro(stats.totals.revenue)}
                            color="emerald"
                        />
                        <KpiCard
                            icon={<Users className="h-5 w-5" />}
                            label="Gem. prijs/kg"
                            value={formatEuro(stats.avgPrice)}
                            color="amber"
                        />
                    </div>

                    {/* Buyer breakdown */}
                    {stats.buyers.length > 0 && (
                        <div className="rounded-2xl border border-white/5 bg-card/30 backdrop-blur-md p-5">
                            <h3 className="text-[13px] font-bold text-white uppercase tracking-wider mb-4">
                                Afnemers
                            </h3>
                            <div className="space-y-2">
                                {stats.buyers.map(({ buyer, kg, revenue, count }) => {
                                    const pct = (revenue / stats.totals.revenue) * 100;
                                    return (
                                        <div key={buyer} className="space-y-1">
                                            <div className="flex items-center justify-between text-[12px]">
                                                <span className="font-semibold text-white truncate max-w-[50%]">
                                                    {buyer}
                                                </span>
                                                <div className="flex items-center gap-4 text-slate-400">
                                                    <span>{count} levering{count !== 1 ? 'en' : ''}</span>
                                                    <span>{formatKg(kg)}</span>
                                                    <span className="text-emerald-400 font-semibold w-24 text-right">
                                                        {formatEuro(revenue)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-emerald-500/60"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Events list */}
                    <div>
                        <h3 className="text-[13px] font-bold text-white uppercase tracking-wider mb-3">
                            Alle afzet-events
                        </h3>
                        <div className="space-y-2">
                            {events.map((event) => {
                                const buyer = (event.details as any)?.buyer ?? '—';
                                const pricePerKg = (event.details as any)?.price_per_kg;
                                return (
                                    <Link
                                        key={event.id}
                                        href={`/afzetstromen/${event.batchId}`}
                                        className="group flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-card/30 backdrop-blur-md hover:border-emerald-500/30 transition-colors"
                                    >
                                        <div className="shrink-0 h-10 w-10 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                                            <ShoppingCart className="h-4 w-4 text-emerald-400" />
                                        </div>

                                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-1">
                                            <div className="md:col-span-2">
                                                <div className="text-[13px] font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                                                    {event.batchLabel || 'Partij zonder label'}
                                                </div>
                                                <div className="text-[11px] text-slate-500 truncate">
                                                    {buyer}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                                                    Datum
                                                </span>
                                                <div className="text-[12px] text-slate-300">
                                                    {formatDateNL(event.eventDate)}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                                                    Kg / prijs
                                                </span>
                                                <div className="text-[12px] text-white font-semibold">
                                                    {formatKg(event.kg)}
                                                    {pricePerKg ? (
                                                        <span className="text-slate-500 ml-1">
                                                            · {formatEuro(pricePerKg)}/kg
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="text-[13px] text-emerald-400 font-semibold">
                                                {formatEuro(event.revenueEur)}
                                            </div>
                                            <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function KpiCard({
    icon,
    label,
    value,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    color: 'emerald' | 'sky' | 'amber';
}) {
    const colorMap = {
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        sky: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
        amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    };
    return (
        <div className="rounded-2xl border border-white/5 bg-card/30 backdrop-blur-md p-4">
            <div className="flex items-center gap-3 mb-2">
                <div
                    className={cn(
                        'shrink-0 h-8 w-8 rounded-lg border flex items-center justify-center',
                        colorMap[color]
                    )}
                >
                    {icon}
                </div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {label}
                </div>
            </div>
            <div className="text-xl font-bold text-white">{value}</div>
        </div>
    );
}
