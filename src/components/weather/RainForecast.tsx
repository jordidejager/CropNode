'use client';

import { useState, useEffect } from 'react';
import { CloudRain, Sun, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useRainForecast } from '@/hooks/use-weather';
import { Skeleton } from '@/components/ui/data-states';
import { cn } from '@/lib/utils';

// Radar image via our proxy to avoid CORS issues
const RADAR_PROXY_URL = '/api/weather/radar-image';

interface RainForecastProps {
  lat: number;
  lon: number;
}

// Precipitation intensity legend matching Buienradar-style colors
const LEGEND_ITEMS = [
  { label: 'Licht', mm: '< 0.5', color: 'bg-sky-400/30' },
  { label: 'Matig', mm: '0.5–2', color: 'bg-sky-400/60' },
  { label: 'Zwaar', mm: '2–5', color: 'bg-sky-400/80' },
  { label: 'Zeer zwaar', mm: '> 5', color: 'bg-sky-400' },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export function RainForecast({ lat, lon }: RainForecastProps) {
  const { data: rainData, isLoading } = useRainForecast(lat, lon);
  const [radarTimestamp, setRadarTimestamp] = useState(Date.now());
  const [radarError, setRadarError] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Refresh radar image every 5 minutes + update clock every minute
  useEffect(() => {
    const radarInterval = setInterval(() => {
      setRadarTimestamp(Date.now());
      setRadarError(false);
    }, 5 * 60 * 1000);

    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    return () => {
      clearInterval(radarInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const radarUrl = `${RADAR_PROXY_URL}?t=${Math.floor(radarTimestamp / 300000)}`;
  const hasRain = rainData && rainData.some((d) => d.mmPerHour > 0);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:col-span-2">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[100px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:col-span-2">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
        Neerslag
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Radar map */}
        <div className="space-y-1.5">
          <div className="relative rounded-xl overflow-hidden bg-white/[0.02] border border-white/[0.06]">
            {radarError ? (
              <div className="flex flex-col items-center justify-center h-[200px] md:h-[250px] text-white/20 text-xs gap-2">
                <CloudRain className="h-6 w-6 opacity-40" />
                <span>Radar niet beschikbaar</span>
                <a
                  href="https://www.buienradar.nl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400/60 hover:text-sky-400 flex items-center gap-1 text-[11px]"
                >
                  Bekijk op buienradar.nl
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={radarUrl}
                  alt="Regenradar Nederland"
                  className="w-full h-[200px] md:h-[250px] object-cover"
                  onError={() => setRadarError(true)}
                  loading="lazy"
                />

                {/* Time overlay top-left */}
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-white/10">
                  <span className="text-white font-bold text-sm tabular-nums">
                    {formatTime(currentTime)}
                  </span>
                </div>

                {/* Legend toggle button bottom-right */}
                <button
                  onClick={() => setShowLegend(!showLegend)}
                  className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/10 flex items-center gap-1 hover:bg-black/80 transition-colors"
                >
                  <span className="text-[10px] text-white/70 font-semibold">Legenda</span>
                  {showLegend ? (
                    <ChevronDown className="h-3 w-3 text-white/50" />
                  ) : (
                    <ChevronUp className="h-3 w-3 text-white/50" />
                  )}
                </button>

                {/* Legend panel */}
                {showLegend && (
                  <div className="absolute bottom-10 right-2 bg-black/80 backdrop-blur-md rounded-lg px-3 py-2.5 border border-white/10 space-y-1.5 min-w-[140px]">
                    <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1">
                      Neerslag (mm/u)
                    </div>
                    {LEGEND_ITEMS.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <div className={cn('w-4 h-2.5 rounded-sm', item.color)} />
                        <span className="text-[10px] text-white/60">{item.label}</span>
                        <span className="text-[9px] text-white/30 ml-auto font-mono">{item.mm}</span>
                      </div>
                    ))}
                    <div className="border-t border-white/10 pt-1.5 mt-1.5">
                      <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1">
                        Bewolking
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-2.5 rounded-sm bg-gray-500/40" />
                        <span className="text-[10px] text-white/60">Bewolkt</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-4 h-2.5 rounded-sm bg-gray-400/20" />
                        <span className="text-[10px] text-white/60">Mist/laagbewolking</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Attribution + link */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] text-white/20">
              Regenradar Nederland — Buienradar
            </span>
            <a
              href="https://www.buienradar.nl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] text-sky-400/30 hover:text-sky-400/60 flex items-center gap-0.5"
            >
              buienradar.nl
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>

        {/* Right: 2-hour precipitation chart */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
            Komende 2 uur
          </div>

          {!rainData || rainData.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-white/20 text-sm">
              <CloudRain className="h-4 w-4 mr-2" />
              Geen data beschikbaar
            </div>
          ) : !hasRain ? (
            <div className="flex items-center justify-center py-10 gap-2">
              <Sun className="h-5 w-5 text-amber-400" />
              <span className="text-sm text-white/50">Geen neerslag</span>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-[2px] h-[100px]">
                {rainData.map((point, i) => {
                  // Scale: 0-10mm/h maps to 0-100px
                  const barHeight = Math.min(100, Math.max(2, (point.mmPerHour / 10) * 100));
                  // Color intensity based on mm/h
                  const opacity =
                    point.mmPerHour > 5
                      ? 1
                      : point.mmPerHour > 2
                        ? 0.8
                        : point.mmPerHour > 0.5
                          ? 0.6
                          : point.mmPerHour > 0
                            ? 0.4
                            : 0.1;

                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Bar */}
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${barHeight}%`,
                          backgroundColor: `rgba(56, 189, 248, ${opacity})`,
                          minHeight: point.mmPerHour > 0 ? '3px' : '0px',
                        }}
                      />

                      {/* Tooltip on hover */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        {point.time} — {point.mmPerHour.toFixed(1)} mm/u
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Time axis */}
              <div className="flex justify-between mt-1 text-[9px] text-white/20">
                <span>{rainData[0]?.time}</span>
                <span>{rainData[Math.floor(rainData.length / 2)]?.time}</span>
                <span>{rainData[rainData.length - 1]?.time}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
