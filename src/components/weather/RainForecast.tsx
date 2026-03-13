'use client';

import { useState, useMemo } from 'react';
import { CloudRain, Sun, ExternalLink } from 'lucide-react';
import { useRainForecast } from '@/hooks/use-weather';
import { Skeleton } from '@/components/ui/data-states';
import { cn } from '@/lib/utils';
import { RadarPlayer } from './RadarPlayer';

type PrecipTimeRange = '2h' | '8h' | '24h';

interface RainForecastProps {
  lat: number;
  lon: number;
  hourlyData?: Array<Record<string, unknown>>;
}

export function RainForecast({ lat, lon, hourlyData }: RainForecastProps) {
  const { data: rainData, isLoading } = useRainForecast(lat, lon);
  const [timeRange, setTimeRange] = useState<PrecipTimeRange>('2h');

  // Build precipitation data from hourly forecast for all time ranges
  const precipData = useMemo(() => {
    if (!hourlyData || hourlyData.length === 0) return { h2: [], h8: [], h24: [] };

    const now = Date.now();
    const h2End = now + 2 * 60 * 60 * 1000;
    const h8End = now + 8 * 60 * 60 * 1000;
    const h24End = now + 24 * 60 * 60 * 1000;

    const allPoints = hourlyData
      .filter((d) => {
        const ts = new Date(d.timestamp as string).getTime();
        return ts >= now && ts <= h24End;
      })
      .map((d) => ({
        time: new Date(d.timestamp as string).toLocaleTimeString('nl-NL', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        timestamp: new Date(d.timestamp as string).getTime(),
        mmPerHour: (d.precipitation_mm as number) ?? 0,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      h2: allPoints.filter((p) => p.timestamp <= h2End),
      h8: allPoints.filter((p) => p.timestamp <= h8End),
      h24: allPoints,
    };
  }, [hourlyData]);

  // For the 2h view, prefer the Buienradar 5-min resolution data if available
  const precipPoints = useMemo(() => {
    if (timeRange === '2h' && rainData && rainData.length > 0) {
      return rainData;
    }
    if (timeRange === '2h') return precipData.h2;
    if (timeRange === '8h') return precipData.h8;
    return precipData.h24;
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

  // Determine time labels for precip chart
  const labelInterval = timeRange === '24h' ? 4 : timeRange === '8h' ? 2 : 1;
  const totalPrecip = precipPoints.reduce((sum, p) => sum + p.mmPerHour, 0);

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:col-span-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
          Neerslag & Buienradar
        </h3>
        <a
          href="https://www.buienradar.nl/nederland/neerslag/buienradar/2uur"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-sky-400/30 hover:text-sky-400/60 flex items-center gap-0.5"
        >
          buienradar.nl
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* Radar animation with player controls */}
      <RadarPlayer />

      {/* ─── Precipitation forecast section ─── */}
      <div className="mt-3 pt-3 border-t border-white/[0.06]">
        {/* Time range tabs + total */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            {(['2h', '8h', '24h'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-bold transition-all',
                  timeRange === range
                    ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30'
                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                )}
              >
                {range}
              </button>
            ))}
          </div>
          {hasAnyRain && (
            <span className="text-[10px] text-white/30">
              Totaal:{' '}
              <span className="text-white/50 font-bold">
                {totalPrecip.toFixed(1)} mm
              </span>
            </span>
          )}
        </div>

        {/* Precipitation bars */}
        {precipPoints.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-white/20 text-xs">
            <CloudRain className="h-3.5 w-3.5 mr-1.5" />
            Geen data beschikbaar
          </div>
        ) : !hasAnyRain ? (
          <div className="flex items-center justify-center py-5 gap-2">
            <Sun className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-white/50">
              Geen neerslag verwacht komende {timeRange}
            </span>
          </div>
        ) : (
          <>
            {/* Bar chart */}
            <div className="flex items-end gap-[2px] h-[60px]">
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
                      className="w-full rounded-t transition-all"
                      style={{
                        height: `${barHeight}%`,
                        backgroundColor: `rgba(56, 189, 248, ${opacity})`,
                        minHeight: point.mmPerHour > 0 ? '3px' : '0px',
                      }}
                    />
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/80 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap z-10">
                      {point.time} — {point.mmPerHour.toFixed(1)} mm/u
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time axis */}
            <div className="flex justify-between mt-1 text-[9px] text-white/20">
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
                    <span key={i} className="min-w-0 truncate">
                      {p.time}
                    </span>
                  ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
