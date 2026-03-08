'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { WeatherIcon } from './WeatherIcon';
import { Navigation } from 'lucide-react';

interface HourlyForecastStripProps {
  hourlyData: Array<Record<string, unknown>>;
}

interface DaySummary {
  dateKey: string;
  dayLabel: string;
  dateLabel: string;
  minTemp: number;
  maxTemp: number;
  totalPrecip: number;
  avgCloudCover: number;
  avgWindSpeed: number; // m/s
  windDirection: number; // degrees
  hasPrecip: boolean;
  isToday: boolean;
}

// Beaufort scale from m/s
function beaufort(ms: number): number {
  if (ms < 0.3) return 0;
  if (ms < 1.6) return 1;
  if (ms < 3.4) return 2;
  if (ms < 5.5) return 3;
  if (ms < 8.0) return 4;
  if (ms < 10.8) return 5;
  if (ms < 13.9) return 6;
  if (ms < 17.2) return 7;
  return 8;
}

// Wind direction abbreviation
function windDir(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8]!;
}

export function HourlyForecastStrip({ hourlyData }: HourlyForecastStripProps) {
  const days = useMemo(() => {
    if (hourlyData.length === 0) return [];

    // Group by date
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const d of hourlyData) {
      const ts = new Date(d.timestamp as string);
      const dateKey = ts.toISOString().split('T')[0]!;
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(d);
    }

    // Only keep today + next 6 days (7 total)
    const todayKey = new Date().toISOString().split('T')[0]!;
    const sortedKeys = Array.from(groups.keys())
      .filter((k) => k >= todayKey)
      .sort()
      .slice(0, 7);

    const results: DaySummary[] = [];
    for (const dateKey of sortedKeys) {
      const items = groups.get(dateKey)!;
      // Only use daytime hours (6-22) for min/max if possible
      const daytimeItems = items.filter((d) => {
        const h = new Date(d.timestamp as string).getHours();
        return h >= 6 && h <= 22;
      });
      const useItems = daytimeItems.length >= 4 ? daytimeItems : items;

      const temps = useItems
        .map((d) => ((d.temperatureC as number | null) ?? (d.temperature_c as number | null)))
        .filter((t): t is number => t !== null);
      const precips = items
        .map((d) => ((d.precipitationMm as number | null) ?? (d.precipitation_mm as number | null)))
        .filter((p): p is number => p !== null);
      const clouds = items
        .map((d) => ((d.cloudCoverPct as number | null) ?? (d.cloud_cover_pct as number | null)))
        .filter((c): c is number => c !== null);
      const winds = items
        .map((d) => ((d.windSpeedMs as number | null) ?? (d.wind_speed_ms as number | null)))
        .filter((w): w is number => w !== null);
      const windDirs = items
        .map((d) => ((d.windDirection as number | null) ?? (d.windDirectionDeg as number | null)))
        .filter((w): w is number => w !== null);

      if (temps.length === 0) continue;

      const d = new Date(dateKey + 'T12:00:00');
      const totalPrecip = precips.reduce((a, b) => a + b, 0);

      results.push({
        dateKey,
        dayLabel: d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', ''),
        dateLabel: d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }).replace(/\//g, '-'),
        minTemp: Math.round(Math.min(...temps)),
        maxTemp: Math.round(Math.max(...temps)),
        totalPrecip: Math.round(totalPrecip * 10) / 10,
        avgCloudCover: clouds.length > 0 ? clouds.reduce((a, b) => a + b, 0) / clouds.length : 50,
        avgWindSpeed: winds.length > 0 ? winds.reduce((a, b) => a + b, 0) / winds.length : 0,
        windDirection: windDirs.length > 0 ? windDirs.reduce((a, b) => a + b, 0) / windDirs.length : 0,
        hasPrecip: totalPrecip > 0.1,
        isToday: dateKey === todayKey,
      });
    }

    return results;
  }, [hourlyData]);

  if (days.length === 0) return null;

  // Calculate temperature range for graph scaling
  const allTemps = days.flatMap((d) => [d.minTemp, d.maxTemp]);
  const globalMin = Math.min(...allTemps) - 2;
  const globalMax = Math.max(...allTemps) + 2;
  const range = globalMax - globalMin || 1;

  // SVG dimensions
  const colWidth = 100 / days.length; // percentage per column
  const graphHeight = 140;
  const graphPadding = 24; // space for labels

  // Calculate Y position (inverted: low temp = bottom, high temp = top)
  const getY = (temp: number) => {
    return graphPadding + ((globalMax - temp) / range) * (graphHeight - 2 * graphPadding);
  };

  // Build SVG path points
  const maxPoints = days.map((d, i) => ({
    x: (i + 0.5) * colWidth,
    y: getY(d.maxTemp),
    temp: d.maxTemp,
  }));
  const minPoints = days.map((d, i) => ({
    x: (i + 0.5) * colWidth,
    y: getY(d.minTemp),
    temp: d.minTemp,
  }));

  // SVG path string (smooth line)
  function buildPath(points: { x: number; y: number }[]): string {
    if (points.length < 2) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">
        7-daagse verwachting
      </h3>

      <div className="w-full">
        {/* Day headers + icons */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
          {days.map((day) => (
            <div key={day.dateKey} className="flex flex-col items-center px-1">
              <span className={cn(
                'text-xs font-bold capitalize',
                day.isToday ? 'text-white' : 'text-white/50'
              )}>
                {day.isToday ? 'Vandaag' : day.dayLabel}
              </span>
              <span className="text-[10px] text-white/30">{day.dateLabel}</span>
              <div className="my-1.5">
                <WeatherIcon
                  cloudCover={day.avgCloudCover}
                  precipitationMm={day.totalPrecip}
                  temperatureC={day.maxTemp}
                  className={cn(
                    'h-6 w-6',
                    day.hasPrecip ? 'text-sky-400' : 'text-amber-400/80'
                  )}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Temperature graph (SVG) */}
        <div className="relative w-full" style={{ height: graphHeight }}>
          <svg
            viewBox={`0 0 100 ${graphHeight}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Max temp line (orange) */}
            <path
              d={buildPath(maxPoints)}
              fill="none"
              stroke="#f97316"
              strokeWidth="0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Min temp line (blue) */}
            <path
              d={buildPath(minPoints)}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Max temp dots + labels */}
            {maxPoints.map((p, i) => (
              <g key={`max-${i}`}>
                <circle cx={p.x} cy={p.y} r="0.8" fill="#f97316" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {/* Min temp dots */}
            {minPoints.map((p, i) => (
              <g key={`min-${i}`}>
                <circle cx={p.x} cy={p.y} r="0.8" fill="#60a5fa" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>

          {/* Temperature labels (HTML overlay for crisp text) */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full">
              {maxPoints.map((p, i) => (
                <span
                  key={`max-label-${i}`}
                  className="absolute text-[11px] font-bold text-orange-400 -translate-x-1/2"
                  style={{
                    left: `${p.x}%`,
                    top: `${(p.y / graphHeight) * 100 - 14}%`,
                  }}
                >
                  {p.temp}°
                </span>
              ))}
              {minPoints.map((p, i) => (
                <span
                  key={`min-label-${i}`}
                  className="absolute text-[11px] font-bold text-blue-400 -translate-x-1/2"
                  style={{
                    left: `${p.x}%`,
                    top: `${(p.y / graphHeight) * 100 + 4}%`,
                  }}
                >
                  {p.temp}°
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Precipitation bars */}
        <div className="grid mt-1" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
          {days.map((day) => (
            <div key={day.dateKey} className="flex flex-col items-center px-1">
              <div className="w-8 h-5 flex items-end justify-center">
                {day.totalPrecip > 0 && (
                  <div
                    className="w-6 rounded-t bg-sky-400/50"
                    style={{
                      height: `${Math.min(20, Math.max(3, (day.totalPrecip / 10) * 20))}px`,
                    }}
                  />
                )}
              </div>
              <span className={cn(
                'text-[10px] tabular-nums',
                day.totalPrecip > 0 ? 'text-sky-400/60' : 'text-white/20'
              )}>
                {day.totalPrecip.toFixed(1)} mm
              </span>
            </div>
          ))}
        </div>

        {/* Wind row */}
        <div className="grid mt-2 border-t border-white/5 pt-2" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
          {days.map((day) => {
            const bft = beaufort(day.avgWindSpeed);
            return (
              <div key={day.dateKey} className="flex flex-col items-center gap-0.5 px-1">
                <Navigation
                  className="h-3 w-3 text-white/30"
                  style={{ transform: `rotate(${day.windDirection + 180}deg)` }}
                />
                <span className="text-[10px] text-white/30 font-medium">
                  {windDir(day.windDirection)}{bft}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
