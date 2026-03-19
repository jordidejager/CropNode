'use client';

import Link from 'next/link';
import {
    CloudSun,
    Wind,
    Droplets,
    CloudOff,
    ArrowRight,
} from 'lucide-react';
import { useWeatherStations, useWeatherHourly } from '@/hooks/use-weather';
import { calculateSprayWindowScore } from '@/lib/weather/weather-calculations';
import { Skeleton } from '@/components/ui/skeleton';

// ---- Types ----

interface DaySummary {
    label: string;
    date: string;
    tempMin: number | null;
    tempMax: number | null;
    precipSum: number;
    windMaxKmh: number;
    sprayWindow: {
        status: 'good' | 'limited' | 'none';
        label: string;
        startHour: number | null;
        endHour: number | null;
    };
}

// ---- Helpers ----

function getDayLabel(dateStr: string): string {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Vandaag';
    if (dateStr === tomorrowStr) return 'Morgen';

    const d = new Date(dateStr + 'T12:00:00');
    const name = d.toLocaleDateString('nl-NL', { weekday: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function processHourlyData(hourlyData: Array<Record<string, unknown>>): DaySummary[] {
    const byDate = new Map<string, Array<Record<string, unknown>>>();

    for (const row of hourlyData) {
        const ts = row.timestamp as string;
        if (!ts) continue;
        const dateStr = ts.split('T')[0];
        if (!dateStr) continue;
        if (!byDate.has(dateStr)) byDate.set(dateStr, []);
        byDate.get(dateStr)!.push(row);
    }

    const today = new Date();
    const days: string[] = [];
    for (let i = 0; i < 3; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().split('T')[0]!);
    }

    return days.map(dateStr => {
        const hours = byDate.get(dateStr) ?? [];

        const temps = hours
            .map(h => h.temperature_c as number | null ?? h.temperatureC as number | null)
            .filter((t): t is number => t !== null);
        const tempMin = temps.length > 0 ? Math.round(Math.min(...temps)) : null;
        const tempMax = temps.length > 0 ? Math.round(Math.max(...temps)) : null;

        const precips = hours
            .map(h => h.precipitation_mm as number | null ?? h.precipitationMm as number | null)
            .filter((p): p is number => p !== null);
        const precipSum = Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10;

        const winds = hours
            .map(h => h.wind_speed_ms as number | null ?? h.windSpeedMs as number | null)
            .filter((w): w is number => w !== null);
        const windMaxMs = winds.length > 0 ? Math.max(...winds) : 0;
        const windMaxKmh = Math.round(windMaxMs * 3.6);

        const sprayHours = hours.filter(h => {
            const ts = h.timestamp as string;
            if (!ts) return false;
            const hour = new Date(ts).getHours();
            return hour >= 6 && hour <= 20;
        });

        let bestStartHour: number | null = null;
        let bestEndHour: number | null = null;
        let bestLength = 0;
        let currentStart: number | null = null;
        let currentLength = 0;
        let totalGreenHours = 0;
        let totalOrangeHours = 0;

        for (const h of sprayHours) {
            const windMs = h.wind_speed_ms as number | null ?? h.windSpeedMs as number | null;
            const temp = h.temperature_c as number | null ?? h.temperatureC as number | null;
            const dewPoint = h.dew_point_c as number | null ?? h.dewPointC as number | null;
            const precip = h.precipitation_mm as number | null ?? h.precipitationMm as number | null;

            const score = calculateSprayWindowScore(windMs, temp, dewPoint, precip, null);
            const ts = h.timestamp as string;
            const hour = new Date(ts).getHours();

            if (score.label === 'Groen') {
                totalGreenHours++;
                if (currentStart === null) currentStart = hour;
                currentLength++;
                if (currentLength > bestLength) {
                    bestLength = currentLength;
                    bestStartHour = currentStart;
                    bestEndHour = hour + 1;
                }
            } else {
                if (score.label === 'Oranje') totalOrangeHours++;
                currentStart = null;
                currentLength = 0;
            }
        }

        let sprayWindow: DaySummary['sprayWindow'];
        if (totalGreenHours >= 2 && bestStartHour !== null && bestEndHour !== null) {
            sprayWindow = {
                status: 'good',
                label: `Spuitvenster ${bestStartHour}:00–${bestEndHour}:00`,
                startHour: bestStartHour,
                endHour: bestEndHour,
            };
        } else if (totalGreenHours > 0 || totalOrangeHours >= 3) {
            sprayWindow = {
                status: 'limited',
                label: 'Beperkt spuitvenster',
                startHour: null,
                endHour: null,
            };
        } else {
            sprayWindow = {
                status: 'none',
                label: 'Geen spuitvenster',
                startHour: null,
                endHour: null,
            };
        }

        return {
            label: getDayLabel(dateStr),
            date: dateStr,
            tempMin,
            tempMax,
            precipSum,
            windMaxKmh,
            sprayWindow,
        };
    });
}

// ---- Badge styles ----

const sprayBadgeStyles = {
    good: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 spray-glow-good',
    limited: 'bg-amber-500/10 text-amber-400 border-amber-500/25 spray-glow-limited',
    none: 'bg-red-500/10 text-red-400 border-red-500/20 spray-glow-none',
} as const;

const cardAccentStyles = {
    good: 'from-emerald-500/10 via-transparent',
    limited: 'from-amber-500/8 via-transparent',
    none: 'from-red-500/5 via-transparent',
} as const;

// ---- Component ----

export function WeatherSprayStrip() {
    const { data: stations, isLoading: stationsLoading } = useWeatherStations();
    const stationId = stations?.[0]?.id ?? null;

    const today = new Date().toISOString().split('T')[0]!;
    const threeDaysLater = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]!;

    const { data: hourlyData, isLoading: weatherLoading } = useWeatherHourly(
        stationId,
        today,
        threeDaysLater
    );

    const isLoading = stationsLoading || weatherLoading;

    if (!stationsLoading && !stationId) {
        return (
            <div>
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <CloudSun className="h-3.5 w-3.5" />
                    Weer & spuitvenster
                </h2>
                <div className="dashboard-card rounded-2xl p-8 text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] mb-3">
                        <CloudOff className="h-7 w-7 text-white/15" />
                    </div>
                    <p className="text-sm text-white/30 mb-2">Geen weerstation gekoppeld</p>
                    <Link
                        href="/weather/dashboard"
                        className="text-xs text-emerald-400/60 hover:text-emerald-400 inline-flex items-center gap-1.5 transition-colors"
                    >
                        Stel een weerstation in
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div>
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <CloudSun className="h-3.5 w-3.5" />
                    Weer & spuitvenster
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-[180px] rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    const days = processHourlyData(hourlyData ?? []);

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest flex items-center gap-2">
                    <CloudSun className="h-3.5 w-3.5" />
                    Weer & spuitvenster
                </h2>
                <Link
                    href="/weather/dashboard"
                    className="text-xs text-white/25 hover:text-emerald-400 transition-colors flex items-center gap-1.5 group"
                >
                    Weerdashboard
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {days.map((day, idx) => (
                    <div
                        key={day.date}
                        className="group relative dashboard-card dashboard-shimmer rounded-2xl overflow-hidden"
                    >
                        {/* Top gradient accent based on spray status */}
                        <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${cardAccentStyles[day.sprayWindow.status]} to-transparent pointer-events-none`} />

                        <div className="relative p-5">
                            {/* Day label */}
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-semibold text-white/80">{day.label}</p>
                                {idx === 0 && (
                                    <span className="text-[10px] text-emerald-400/40 font-semibold uppercase tracking-wider">Nu</span>
                                )}
                            </div>

                            {/* Temperature hero with glow */}
                            <div className="flex items-baseline gap-1 mb-4">
                                <span className="text-3xl font-bold text-white/90 tabular-nums tracking-tight temp-glow">
                                    {day.tempMax !== null ? `${day.tempMax}°` : '–'}
                                </span>
                                <span className="text-lg text-white/30 tabular-nums">
                                    {day.tempMin !== null ? `${day.tempMin}°` : ''}
                                </span>
                            </div>

                            {/* Spray window badge */}
                            <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border mb-4 ${sprayBadgeStyles[day.sprayWindow.status]}`}>
                                {day.sprayWindow.label}
                            </div>

                            {/* Weather details */}
                            <div className="flex items-center gap-4 pt-3 border-t border-white/[0.04]">
                                <div className="flex items-center gap-1.5 text-xs text-white/30">
                                    <Droplets className="h-3 w-3 text-blue-400/40" />
                                    <span className="tabular-nums">{day.precipSum} mm</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-white/30">
                                    <Wind className="h-3 w-3 text-cyan-400/40" />
                                    <span className="tabular-nums">{day.windMaxKmh} km/u</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
