'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Timer, ArrowRight, Inbox, Users } from 'lucide-react';
import { useTaskLogs } from '@/hooks/use-data';
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

function formatHours(total: number): string {
    if (!total || total <= 0) return '0 u';
    if (total < 10) return `${total.toFixed(1)} u`;
    return `${Math.round(total)} u`;
}

export function RecentHours() {
    const { data, isLoading } = useTaskLogs();

    const recent = useMemo(() => {
        const entries = data ?? [];
        // Exclude spuit-gerelateerde taken — die staan al bij Recente bespuitingen
        // en zouden anders de overige urenregistraties overwoekeren.
        const isSprayTask = (name: string) => /spuit/i.test(name);
        return entries
            .filter((log) => !isSprayTask(log.taskTypeName ?? ''))
            .slice()
            .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
            .slice(0, 4);
    }, [data]);

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-400">
                        <Timer className="h-3.5 w-3.5" />
                    </span>
                    Recente urenregistraties
                </h2>
                {recent.length > 0 && (
                    <Link
                        href="/urenregistratie"
                        className="text-xs font-medium text-white/50 hover:text-indigo-400 transition-colors flex items-center gap-1.5 group dashboard-focusable"
                        aria-label="Bekijk alle urenregistraties"
                    >
                        Alles bekijken
                        <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                )}
            </div>

            <div
                className="card-spotlight-host dashboard-card dashboard-shimmer rounded-2xl overflow-hidden relative"
                style={{ '--spot-color': 'rgba(129, 140, 248, 0.14)', '--gb-color': 'rgba(129, 140, 248, 0.45)' } as React.CSSProperties}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
                }}
            >
                <div className="card-glow-orb bg-indigo-500" />
                <div className="card-noise" />
                <div className="card-gradient-border" />
                <div className="card-spotlight" />

                <div className="relative">
                    {isLoading ? (
                        <div className="divide-y divide-white/[0.05]">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-5 py-4">
                                    <Skeleton className="h-3 w-3 rounded-full flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-44" />
                                        <Skeleton className="h-3 w-32" />
                                    </div>
                                    <Skeleton className="h-4 w-14" />
                                </div>
                            ))}
                        </div>
                    ) : recent.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-3">
                                <Inbox className="h-7 w-7 text-white/30" />
                            </div>
                            <p className="text-sm text-white/60 font-medium">Nog geen urenregistraties</p>
                            <p className="text-xs text-white/35 mt-1">
                                <Link href="/urenregistratie" className="text-indigo-400 hover:underline">
                                    Start je eerste registratie
                                </Link>
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-white/[0.05]">
                            {recent.map((log) => {
                                const parcelDisplay = log.subParcelName
                                    ?? log.parcelName
                                    ?? 'Algemeen';
                                return (
                                    <li
                                        key={log.id}
                                        className="group flex items-start gap-4 px-5 py-4 hover:bg-indigo-500/[0.03] transition-all duration-300"
                                    >
                                        <div className="relative flex-shrink-0 mt-1.5">
                                            <div className="h-2.5 w-2.5 rounded-full bg-indigo-400 activity-dot text-indigo-400" />
                                            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-indigo-400 opacity-30 blur-sm" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-[15px] font-semibold text-white/95 truncate">
                                                {log.taskTypeName}
                                            </p>
                                            <div className="flex items-center gap-2 text-[13px] text-white/60 mt-0.5">
                                                <span className="truncate">{parcelDisplay}</span>
                                                {log.peopleCount > 1 && (
                                                    <span className="inline-flex items-center gap-1 text-white/45 flex-shrink-0">
                                                        <Users className="h-3 w-3" />
                                                        {log.peopleCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                            <span className="text-[13px] font-semibold text-indigo-300 tabular-nums">
                                                {formatHours(log.totalHours)}
                                            </span>
                                            <span className="text-[11px] text-white/45 tabular-nums">
                                                {formatRelativeDate(log.startDate)}
                                            </span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
