'use client';

import { Thermometer, CloudRain, Wind, Droplets, Gauge } from 'lucide-react';
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

  // Helper to get numeric values from either camelCase or snake_case
  const getNum = (d: Record<string, unknown>, ...keys: string[]): number | null => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === 'number') return v;
    }
    return null;
  };

  // Compute aggregates
  const temps = todayData.map(d => getNum(d, 'temperatureC', 'temperature_c')).filter((t): t is number => t !== null);
  const winds = todayData.map(d => getNum(d, 'windSpeedMs', 'wind_speed_ms')).filter((w): w is number => w !== null);
  const gusts = todayData.map(d => getNum(d, 'windGustsMs', 'wind_gusts_ms')).filter((g): g is number => g !== null);
  const humidities = todayData.map(d => getNum(d, 'humidityPct', 'humidity_pct')).filter((h): h is number => h !== null);
  const precips = todayData.map(d => getNum(d, 'precipitationMm', 'precipitation_mm')).filter((p): p is number => p !== null);
  const dewPoints = todayData.map(d => getNum(d, 'dewPointC', 'dew_point_c')).filter((dp): dp is number => dp !== null);

  const tempMin = temps.length > 0 ? Math.min(...temps) : null;
  const tempMax = temps.length > 0 ? Math.max(...temps) : null;
  const precipSum = precips.length > 0 ? precips.reduce((a, b) => a + b, 0) : null;
  const windMax = winds.length > 0 ? Math.max(...winds) : null;
  const gustMax = gusts.length > 0 ? Math.max(...gusts) : null;
  const humidityAvg = humidities.length > 0
    ? Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length)
    : null;
  const dewPointAvg = dewPoints.length > 0
    ? Math.round(dewPoints.reduce((a, b) => a + b, 0) / dewPoints.length * 10) / 10
    : null;

  // Convert wind m/s to km/h
  const windMaxKmh = windMax !== null ? Math.round(windMax * 3.6) : null;
  const gustMaxKmh = gustMax !== null ? Math.round(gustMax * 3.6) : null;

  // Wind display: "max km/u (vlagen gustmax)"
  let windValue = windMaxKmh !== null ? `${windMaxKmh}km/u` : '—';
  if (gustMaxKmh !== null && gustMaxKmh > (windMaxKmh ?? 0) + 5) {
    windValue += ` (${gustMaxKmh})`;
  }

  const stats = [
    {
      icon: Thermometer,
      label: 'Temperatuur',
      shortLabel: 'Temp',
      value: tempMin !== null && tempMax !== null
        ? `${Math.round(tempMin)}° / ${Math.round(tempMax)}°`
        : '—',
      sub: 'min / max',
      color: 'text-orange-400',
    },
    {
      icon: CloudRain,
      label: 'Neerslag',
      shortLabel: 'Neerslag',
      value: precipSum !== null ? `${precipSum.toFixed(1)} mm` : '—',
      sub: 'totaal vandaag',
      color: 'text-sky-400',
    },
    {
      icon: Wind,
      label: 'Wind',
      shortLabel: 'Wind',
      value: windValue,
      sub: gustMaxKmh ? 'max (vlagen)' : 'max snelheid',
      color: 'text-slate-300',
    },
    {
      icon: Droplets,
      label: 'Luchtvochtigheid',
      shortLabel: 'RV',
      value: humidityAvg !== null ? `${humidityAvg}%` : '—',
      sub: 'gemiddeld',
      color: 'text-cyan-400',
    },
    {
      icon: Gauge,
      label: 'Dauwpunt',
      shortLabel: 'Dauwpunt',
      value: dewPointAvg !== null ? `${dewPointAvg}°C` : '—',
      sub: 'gemiddeld',
      color: 'text-emerald-400',
    },
  ];

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-start gap-2">
            <div className={cn('mt-0.5 p-1.5 rounded-lg bg-white/5', stat.color)}>
              <stat.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 leading-none mb-1">
                <span className="hidden sm:inline">{stat.label}</span>
                <span className="sm:hidden">{stat.shortLabel}</span>
              </div>
              <div className="text-sm font-bold text-white leading-tight whitespace-nowrap">
                {stat.value}
              </div>
              <div className="text-[10px] text-white/20 mt-0.5">{stat.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
