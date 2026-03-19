'use client';

import Link from 'next/link';
import { Clock, ArrowRight, Inbox } from 'lucide-react';
import { useParcelHistory } from '@/hooks/use-data';
import { Skeleton } from '@/components/ui/skeleton';

function formatRelativeDate(date: Date): string {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((todayStart.getTime() - dateStart.getTime()) / 86400000);

    if (diffDays === 0) return 'Vandaag';
    if (diffDays === 1) return 'Gisteren';
    if (diffDays < 7) {
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
        return dayName.charAt(0).toUpperCase() + dayName.slice(1);
    }
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function getActivityDotColor(productSource?: string): string {
    if (productSource === 'fertilizer') return 'text-amber-400';
    return 'text-emerald-400';
}

function getActivityGlow(productSource?: string): string {
    if (productSource === 'fertilizer') return 'bg-amber-400';
    return 'bg-emerald-400';
}

export function RecentActivity() {
    const { data, isLoading } = useParcelHistory();
    const recentItems = (data ?? []).slice(0, 5);

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    Recente activiteit
                </h2>
                {recentItems.length > 0 && (
                    <Link
                        href="/crop-care/logs"
                        className="text-xs text-white/25 hover:text-emerald-400 transition-colors flex items-center gap-1.5 group"
                    >
                        Bekijk alles
                        <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                )}
            </div>

            <div className="dashboard-card dashboard-shimmer rounded-2xl overflow-hidden">
                {isLoading ? (
                    <div className="divide-y divide-white/[0.04]">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                                <Skeleton className="h-2.5 w-2.5 rounded-full flex-shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                                <Skeleton className="h-3 w-16" />
                            </div>
                        ))}
                    </div>
                ) : recentItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-3">
                            <Inbox className="h-7 w-7 text-white/15" />
                        </div>
                        <p className="text-sm text-white/30">Nog geen registraties</p>
                        <p className="text-xs text-white/15 mt-1">Begin hierboven met een registratie!</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.04]">
                        {recentItems.map((item) => (
                            <div
                                key={item.id}
                                className="group flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-all duration-300"
                            >
                                {/* Animated dot with glow */}
                                <div className="relative flex-shrink-0">
                                    <div className={`h-2 w-2 rounded-full ${getActivityGlow(item.productSource)} activity-dot ${getActivityDotColor(item.productSource)}`} />
                                    <div className={`absolute inset-0 h-2 w-2 rounded-full ${getActivityGlow(item.productSource)} opacity-30 blur-sm`} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white/70 truncate group-hover:text-white/90 transition-colors">
                                        <span className="font-semibold text-white/85 group-hover:text-white transition-colors">
                                            {item.product}
                                        </span>
                                        {item.dosage ? (
                                            <span className="text-white/40"> — {item.dosage} {item.unit || ''}</span>
                                        ) : ''}
                                    </p>
                                    <p className="text-xs text-white/25 truncate mt-0.5">
                                        {item.parcelName}
                                    </p>
                                </div>
                                <span className="text-[11px] text-white/20 flex-shrink-0 tabular-nums">
                                    {formatRelativeDate(item.date)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
