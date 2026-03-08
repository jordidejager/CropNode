'use client';

import { Thermometer, CloudRain, Wind, Sun, Droplets, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodaySummaryProps {
  currentData: Array<Record<string, unknown>>;
}

export function TodaySummary({ currentData }: TodaySummaryProps) {
  // Filter to today's data
  const today = new Date().toISOString().split('T')[0]!;
  const todayData = currentData.filter((d) => {
    const ts = (d.timestamp as string) ?? '';
    return ts.startsWith(today);
  });

  if (todayData.length === 0) return null;

  // Compute aggregates
  const temps = todayData
    .map((d) => (d.temperatureC as number | null) ?? (d.temperature_c as number | null))
    .filter((t): t is number => t !== null);
  const winds = todayData
    .map((d) => (d.windSpeedMs as number | null) ?? (d.wind_speed_ms as number | null))
    .filter((w): w is number => w !== null);
  const humidities = todayData
    .map((d) => (d.humidityPct as number | null) ?? (d.humidity_pct as number | null))
    .filter((h): h is number => h !== null);
  const precips = todayData
    .map((d) => (d.precipitationMm as number | null) ?? (d.precipitation_mm as number | null))
    .filter((p): p is number => p !== null);
  const cloudCovers = todayData
    .map((d) => (d.cloudCoverPct as number | null) ?? (d.cloud_cover_pct as number | null))
    .filter((c): c is number => c !== null);

  const tempMin = temps.length > 0 ? Math.min(...temps) : null;
  const tempMax = temps.length > 0 ? Math.max(...temps) : null;
  const precipSum = precips.length > 0 ? precips.reduce((a, b) => a + b, 0) : null;
  const windMax = winds.length > 0 ? Math.max(...winds) : null;
  const humidityAvg =
    humidities.length > 0
      ? Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length)
      : null;

  // Estimate sun hours: hours with cloud cover < 50%
  const sunHours = cloudCovers.filter((c) => c < 50).length;

  // GDD base 5
  const gddBase5 =
    tempMin !== null && tempMax !== null
      ? Math.max(0, (tempMax + tempMin) / 2 - 5)
      : null;

  // Convert wind m/s to km/h for display
  const windMaxKmh = windMax !== null ? Math.round(windMax * 3.6) : null;

  const stats = [
    {
      icon: Thermometer,
      label: 'Temp',
      value:
        tempMin !== null && tempMax !== null
          ? `${Math.round(tempMin)}°/${Math.round(tempMax)}°`
          : '—',
      color: 'text-blue-400',
    },
    {
      icon: CloudRain,
      label: 'Neerslag',
      value: precipSum !== null ? `${precipSum.toFixed(1)}mm` : '—',
      color: 'text-sky-400',
    },
    {
      icon: Wind,
      label: 'Wind',
      value: windMaxKmh !== null ? `${windMaxKmh}km/u` : '—',
      color: 'text-slate-400',
    },
    {
      icon: Sun,
      label: 'Zon',
      value: `~${sunHours}u`,
      color: 'text-amber-400',
    },
    {
      icon: Droplets,
      label: 'RV',
      value: humidityAvg !== null ? `${humidityAvg}%` : '—',
      color: 'text-cyan-400',
    },
    {
      icon: Sprout,
      label: 'GDD',
      value: gddBase5 !== null ? gddBase5.toFixed(1) : '—',
      color: 'text-emerald-400',
    },
  ];

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-1.5">
            <stat.icon className={cn('h-3.5 w-3.5 shrink-0', stat.color)} />
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 leading-none mb-0.5">
                {stat.label}
              </div>
              <div className="text-[13px] font-bold text-white leading-tight whitespace-nowrap">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
