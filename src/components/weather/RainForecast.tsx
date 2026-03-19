'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import { CloudRain, Sun, ExternalLink } from 'lucide-react';
import { useRainForecast } from '@/hooks/use-weather';
import { Skeleton } from '@/components/ui/data-states';
import { cn } from '@/lib/utils';
import { RadarPlayer } from './RadarPlayer';

// Lazy-load MapTiler component (heavy) — only for 8h+ views
const PrecipForecastMap = lazy(() =>
  import('./PrecipForecastMap').then((mod) => ({ default: mod.PrecipForecastMap }))
);

type PrecipTimeRange = '2h' | '8h' | '24h' | '48h' | '96h';

interface RainForecastProps {
  lat: number;
  lon: number;
  hourlyData?: Array<Record<string, unknown>>;
}

export function RainForecast({ lat, lon, hourlyData }: RainForecastProps) {
  const { data: rainData, isLoading } = useRainForecast(lat, lon);
  const [timeRange, setTimeRange] = useState<PrecipTimeRange>('2h');

  const useMapForecast = timeRange !== '2h';

  // Build precipitation data for bar chart
  const precipData = useMemo(() => {
    if (!hourlyData || hourlyData.length === 0)
      return { h2: [], h8: [], h24: [], h48: [], h96: [] };

    const now = Date.now();
    const ranges = {
      h2: now + 2 * 3600000,
      h8: now + 8 * 3600000,
      h24: now + 24 * 3600000,
      h48: now + 48 * 3600000,
      h96: now + 96 * 3600000,
    };

    const allPoints = hourlyData
      .filter((d) => {
        const ts = new Date(d.timestamp as string).getTime();
        return ts >= now && ts <= ranges.h96;
      })
      .map((d) => {
        const ts = new Date(d.timestamp as string);
        return {
          time: ts.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
          dayTime: ts.toLocaleDateString('nl-NL', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
          timestamp: ts.getTime(),
          mmPerHour: (d.precipitation_mm as number) ?? 0,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      h2: allPoints.filter((p) => p.timestamp <= ranges.h2),
      h8: allPoints.filter((p) => p.timestamp <= ranges.h8),
      h24: allPoints.filter((p) => p.timestamp <= ranges.h24),
      h48: allPoints.filter((p) => p.timestamp <= ranges.h48),
      h96: allPoints,
    };
  }, [hourlyData]);

  const precipPoints = useMemo(() => {
    if (timeRange === '2h' && rainData && rainData.length > 0) return rainData;
    if (timeRange === '2h') return precipData.h2;
    if (timeRange === '8h') return precipData.h8;
    if (timeRange === '24h') return precipData.h24;
    if (timeRange === '48h') return precipData.h48;
    return precipData.h96;
  }, [timeRange, rainData, precipData]);

  const hasAnyRain = precipPoints.some((p) => p.mmPerHour > 0);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:col-span-2">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-[280px] w-full mb-3" />
        <Skeleton className="h-[80px] w-full" />
      </div>
    );
  }

  const showPrecipChart = timeRange === '2h' || timeRange === '8h' || timeRange === '24h';
  const totalPrecip = precipPoints.reduce((sum, p) => sum + p.mmPerHour, 0);
  const useDayLabels = timeRange === '48h' || timeRange === '96h';
  const labelInterval =
    timeRange === '96h' ? 12 :
    timeRange === '48h' ? 6 :
    timeRange === '24h' ? 4 :
    timeRange === '8h' ? 2 : 1;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:col-span-2">
      {/* Header with time range tabs */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
          Neerslag & Buienradar
        </h3>
        <div className="flex items-center gap-1">
          {(['2h', '8h', '24h', '48h', '96h'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-2 py-1 rounded-full text-[10px] font-bold transition-all',
                timeRange === range
                  ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Radar / Forecast map */}
      {useMapForecast ? (
        <Suspense
          fallback={
            <div className="h-[220px] md:h-[280px] rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
                <span className="text-[10px] text-white/40">Radar laden...</span>
              </div>
            </div>
          }
        >
          <PrecipForecastMap timeRange={timeRange as '8h' | '24h' | '48h' | '96h'} />
        </Suspense>
      ) : (
        <RadarPlayer />
      )}

      {/* Attribution */}
      <div className="flex items-center justify-between px-1 mt-2">
        <span className="text-[9px] text-white/20">
          {useMapForecast
            ? `Neerslagvoorspelling — komende ${timeRange}`
            : 'Buienradar — neerslagradar ~3 uur'
          }
        </span>
        <a
          href={useMapForecast
            ? 'https://www.maptiler.com/weather/'
            : 'https://www.buienradar.nl/nederland/neerslag/buienradar/2uur'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-sky-400/30 hover:text-sky-400/60 flex items-center gap-0.5"
        >
          {useMapForecast ? 'maptiler.com' : 'buienradar.nl'}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* ─── Precipitation bar chart (2h/8h/24h) ─── */}
      {showPrecipChart && (
        <div className="mt-2 pt-2 border-t border-white/[0.06]">
          {hasAnyRain && (
            <div className="flex justify-end mb-1">
              <span className="text-[10px] text-white/30">
                Totaal:{' '}
                <span className="text-white/50 font-bold">{totalPrecip.toFixed(1)} mm</span>
              </span>
            </div>
          )}

          {precipPoints.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-white/20 text-xs">
              <CloudRain className="h-3.5 w-3.5 mr-1.5" />
              Geen data beschikbaar
            </div>
          ) : !hasAnyRain ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <Sun className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-white/50">
                Geen neerslag verwacht komende {timeRange}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-[1px] h-[50px]">
                {precipPoints.map((point, i) => {
                  const barHeight = Math.min(100, Math.max(2, (point.mmPerHour / 10) * 100));
                  const opacity =
                    point.mmPerHour > 5 ? 1
                      : point.mmPerHour > 2 ? 0.8
                        : point.mmPerHour > 0.5 ? 0.6
                          : point.mmPerHour > 0 ? 0.4
                            : 0.08;

                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    >
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${barHeight}%`,
                          backgroundColor: `rgba(56, 189, 248, ${opacity})`,
                          minHeight: point.mmPerHour > 0 ? '2px' : '0px',
                        }}
                      />
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/80 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap z-10">
                        {useDayLabels ? (point as { dayTime?: string }).dayTime : point.time} — {point.mmPerHour.toFixed(1)} mm/u
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between mt-1 text-[9px] text-white/20 overflow-hidden">
                {timeRange === '2h' ? (
                  <>
                    <span>{precipPoints[0]?.time}</span>
                    <span>{precipPoints[Math.floor(precipPoints.length / 2)]?.time}</span>
                    <span>{precipPoints[precipPoints.length - 1]?.time}</span>
                  </>
                ) : (
                  precipPoints
                    .filter((_, i) => i % labelInterval === 0)
                    .map((p, i) => (
                      <span key={i} className="min-w-0 truncate text-center">
                        {useDayLabels ? (p as { dayTime?: string }).dayTime : p.time}
                      </span>
                    ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
