'use client';

import { useState } from 'react';
import { Wind, Thermometer, Droplets, CloudRain, Info, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  calculateSprayWindowScore,
  calculateSprayWindowScoreForProduct,
  calculateDeltaT,
  SPRAY_PROFILES,
} from '@/lib/weather/weather-calculations';
import type { SprayProductType } from '@/lib/weather/weather-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SprayWindowHeroProps {
  currentData: Array<Record<string, unknown>>;
  hourlyData: Array<Record<string, unknown>>;
}

const PRODUCT_TABS: Array<{ type: SprayProductType | 'standaard'; label: string; short: string }> = [
  { type: 'standaard', label: 'Standaard', short: 'Std' },
  { type: 'contact', label: 'Contact', short: 'Con' },
  { type: 'systemisch', label: 'Systemisch', short: 'Sys' },
  { type: 'groeistof', label: 'Groeistof', short: 'Grs' },
  { type: 'meststof', label: 'Bladvoeding', short: 'Blv' },
];

type FactorStatus = 'good' | 'warning' | 'bad';

const statusConfig = {
  Groen: {
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_30px_-5px_rgba(52,211,153,0.2)]',
    label: 'Goed spuitvenster',
    sublabel: 'Condities zijn geschikt om te spuiten',
    emoji: '\u{1F7E2}',
  },
  Oranje: {
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    glow: 'shadow-[0_0_30px_-5px_rgba(251,191,36,0.2)]',
    label: 'Matig spuitvenster',
    sublabel: 'Let op condities voordat je spuit',
    emoji: '\u{1F7E1}',
  },
  Rood: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    text: 'text-red-400',
    glow: 'shadow-[0_0_30px_-5px_rgba(239,68,68,0.2)]',
    label: 'Niet geschikt',
    sublabel: 'Condities zijn niet geschikt om te spuiten',
    emoji: '\u{1F534}',
  },
};

const windowColors = {
  Groen: {
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    emoji: '\u{1F7E2}',
  },
  Oranje: {
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    emoji: '\u{1F7E1}',
  },
};

function getFactorStatus(score: number): FactorStatus {
  if (score >= 70) return 'good';
  if (score >= 40) return 'warning';
  return 'bad';
}

const factorStatusColors: Record<FactorStatus, string> = {
  good: 'text-emerald-400 bg-emerald-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  bad: 'text-red-400 bg-red-500/10',
};

// --- Helpers ---

function getField(row: Record<string, unknown>, camel: string, snake: string): number | null {
  return (row[camel] as number | null) ?? (row[snake] as number | null);
}

function computeScore(
  row: Record<string, unknown>,
  futureRows: Array<Record<string, unknown>>,
  product: SprayProductType | 'standaard'
) {
  const windSpeed = getField(row, 'windSpeedMs', 'wind_speed_ms');
  const temp = getField(row, 'temperatureC', 'temperature_c');
  const dewPoint = getField(row, 'dewPointC', 'dew_point_c');
  const precip = getField(row, 'precipitationMm', 'precipitation_mm');

  const precipNext2h = futureRows.reduce((sum, d) => {
    const p = getField(d, 'precipitationMm', 'precipitation_mm') ?? 0;
    return sum + p;
  }, 0);

  return product === 'standaard'
    ? calculateSprayWindowScore(windSpeed, temp, dewPoint, precip, precipNext2h)
    : calculateSprayWindowScoreForProduct(windSpeed, temp, dewPoint, precip, precipNext2h, product);
}

/** Calculate how many hours from now the current window stays open (score >= 40). */
function calculateRemainingHours(
  hourlyData: Array<Record<string, unknown>>,
  product: SprayProductType | 'standaard'
): number | null {
  const now = Date.now();
  const sorted = [...hourlyData]
    .filter((d) => new Date(d.timestamp as string).getTime() >= now - 60 * 60 * 1000)
    .sort(
      (a, b) =>
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
    );

  let count = 0;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const ts = new Date(row.timestamp as string).getTime();
    if (ts < now - 60 * 60 * 1000) continue;

    const future = sorted.slice(i + 1, i + 3);
    const score = computeScore(row, future, product);
    if (score.score >= 40) {
      count++;
    } else {
      break;
    }
  }

  return count > 0 ? count : null;
}

/** Find the next hour when precipitation > 0, or null if dry in the window. */
function findRainTiming(hourlyData: Array<Record<string, unknown>>): string {
  const now = Date.now();
  const upcoming = [...hourlyData]
    .filter((d) => new Date(d.timestamp as string).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
    );

  // Look ahead up to 12 hours
  const lookAhead = upcoming.slice(0, 12);

  for (const row of lookAhead) {
    const precip = getField(row, 'precipitationMm', 'precipitation_mm') ?? 0;
    if (precip > 0) {
      const time = new Date(row.timestamp as string).toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `Regen verwacht om ${time}`;
    }
  }

  // All dry — find how far the dry period extends
  if (lookAhead.length > 0) {
    const lastDry = lookAhead[lookAhead.length - 1]!;
    const time = new Date(lastDry.timestamp as string).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Droog tot ${time}`;
  }

  return 'Droog';
}

// --- Upcoming windows logic ---

type SprayWindow = {
  startTime: Date;
  endTime: Date;
  avgScore: number;
  avgWindSpeed: number;
  avgTemp: number;
  label: 'Groen' | 'Oranje';
};

function findUpcomingWindows(hourlyData: Array<Record<string, unknown>>): SprayWindow[] {
  const now = Date.now();
  // Skip the current window — start from at least 1 hour in the future after a gap
  const sevenDaysLater = now + 7 * 24 * 60 * 60 * 1000;
  const futureData = hourlyData
    .filter((d) => {
      const ts = new Date(d.timestamp as string).getTime();
      return ts > now && ts < sevenDaysLater;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
    );

  const scored = futureData.map((d, i) => {
    const windSpeed = getField(d, 'windSpeedMs', 'wind_speed_ms');
    const temp = getField(d, 'temperatureC', 'temperature_c');
    const dewPoint = getField(d, 'dewPointC', 'dew_point_c');
    const precip = getField(d, 'precipitationMm', 'precipitation_mm');

    const nextItems = futureData.slice(i + 1, i + 3);
    const precipNext2h = nextItems.reduce((sum, n) => {
      const p = getField(n, 'precipitationMm', 'precipitation_mm') ?? 0;
      return sum + p;
    }, 0);

    const score = calculateSprayWindowScore(windSpeed, temp, dewPoint, precip, precipNext2h);

    return {
      timestamp: new Date(d.timestamp as string),
      score: score.score,
      label: score.label,
      windSpeed: windSpeed ?? 0,
      temp: temp ?? 0,
    };
  });

  // Group consecutive hours with score >= 40 into windows, split at day boundaries
  const windows: SprayWindow[] = [];
  let currentWindow: typeof scored = [];

  function flushWindow() {
    if (currentWindow.length < 2) {
      currentWindow = [];
      return;
    }
    const avgScore =
      currentWindow.reduce((s, h) => s + h.score, 0) / currentWindow.length;
    const avgWindSpeed =
      currentWindow.reduce((s, h) => s + h.windSpeed, 0) / currentWindow.length;
    const avgTemp =
      currentWindow.reduce((s, h) => s + h.temp, 0) / currentWindow.length;

    windows.push({
      startTime: currentWindow[0]!.timestamp,
      endTime: currentWindow[currentWindow.length - 1]!.timestamp,
      avgScore,
      avgWindSpeed,
      avgTemp,
      label: avgScore > 70 ? 'Groen' : 'Oranje',
    });
    currentWindow = [];
  }

  for (const hour of scored) {
    if (hour.score >= 40) {
      if (
        currentWindow.length > 0 &&
        hour.timestamp.toDateString() !==
          currentWindow[currentWindow.length - 1]!.timestamp.toDateString()
      ) {
        flushWindow();
      }
      currentWindow.push(hour);
    } else {
      flushWindow();
    }
  }
  flushWindow();

  // Skip the first window if it starts within 1 hour (that is the "current" window)
  const filtered = windows.filter(
    (w) => w.startTime.getTime() - now > 60 * 60 * 1000
  );

  return filtered
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 3);
}

function formatWindowLine(w: SprayWindow): {
  emoji: string;
  dayLabel: string;
  period: string;
  timeRange: string;
  duration: number;
  temp: number;
  windBft: number;
  colors: typeof windowColors.Groen;
} {
  const colors = windowColors[w.label];
  const isToday = w.startTime.toDateString() === new Date().toDateString();
  const isTomorrow =
    w.startTime.toDateString() ===
    new Date(Date.now() + 86400000).toDateString();

  const dayLabel = isToday
    ? 'Vandaag'
    : isTomorrow
      ? 'Morgen'
      : w.startTime.toLocaleDateString('nl-NL', { weekday: 'long' });

  const durationHours =
    Math.round(
      (w.endTime.getTime() - w.startTime.getTime()) / (60 * 60 * 1000)
    ) + 1;

  const startH = w.startTime.getHours();
  const isWholeDay = durationHours >= 18;
  const period = isWholeDay
    ? 'hele dag'
    : startH < 12
      ? 'ochtend'
      : startH < 18
        ? 'middag'
        : 'avond';

  const startHour = w.startTime.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endHour = new Date(
    w.endTime.getTime() + 60 * 60 * 1000
  ).toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const timeRange = isWholeDay ? '' : `${startHour}\u2013${endHour}`;

  // Convert avg wind m/s to Beaufort (approximate)
  const msToBeaufort = (ms: number): number => {
    if (ms < 0.3) return 0;
    if (ms < 1.6) return 1;
    if (ms < 3.4) return 2;
    if (ms < 5.5) return 3;
    if (ms < 8.0) return 4;
    if (ms < 10.8) return 5;
    return 6;
  };

  return {
    emoji: colors.emoji,
    dayLabel,
    period,
    timeRange,
    duration: durationHours,
    temp: Math.round(w.avgTemp),
    windBft: msToBeaufort(w.avgWindSpeed),
    colors,
  };
}

// --- Main component ---

export function SprayWindowHero({ currentData, hourlyData }: SprayWindowHeroProps) {
  const [selectedProduct, setSelectedProduct] = useState<SprayProductType | 'standaard'>('standaard');

  // Find current/most recent hour from currentData
  const now = Date.now();
  const sorted = [...currentData].sort(
    (a, b) =>
      Math.abs(new Date(a.timestamp as string).getTime() - now) -
      Math.abs(new Date(b.timestamp as string).getTime() - now)
  );

  const current = sorted[0];
  if (!current) return null;

  const windSpeed = getField(current, 'windSpeedMs', 'wind_speed_ms');
  const windGusts = getField(current, 'windGustsMs', 'wind_gusts_ms');
  const temp = getField(current, 'temperatureC', 'temperature_c');
  const dewPoint = getField(current, 'dewPointC', 'dew_point_c');
  const precip = getField(current, 'precipitationMm', 'precipitation_mm');

  // Precip next 2h
  const currentTime = new Date(current.timestamp as string).getTime();
  const next2hData = currentData.filter((d) => {
    const t = new Date(d.timestamp as string).getTime();
    return t > currentTime && t <= currentTime + 2 * 60 * 60 * 1000;
  });
  const precipNext2h = next2hData.reduce((sum, d) => {
    const p = getField(d, 'precipitationMm', 'precipitation_mm') ?? 0;
    return sum + p;
  }, 0);

  const score =
    selectedProduct === 'standaard'
      ? calculateSprayWindowScore(windSpeed, temp, dewPoint, precip, precipNext2h)
      : calculateSprayWindowScoreForProduct(windSpeed, temp, dewPoint, precip, precipNext2h, selectedProduct);

  const config = statusConfig[score.label];
  const deltaT = calculateDeltaT(temp, dewPoint);

  // Wind in km/h
  const windKmh = windSpeed !== null ? Math.round(windSpeed * 3.6) : null;
  const gustsKmh = windGusts !== null ? Math.round(windGusts * 3.6) : null;

  // Remaining hours in the current window
  const remainingHours = calculateRemainingHours(hourlyData, selectedProduct);

  // Rain timing
  const rainTiming = findRainTiming(hourlyData);

  // Upcoming windows
  const upcomingWindows = findUpcomingWindows(hourlyData);

  // Precipitation display text
  const precipText =
    precip !== null && precip > 0
      ? `${precip.toFixed(1)}mm/u`
      : precipNext2h > 0
        ? `${precipNext2h.toFixed(1)}mm 2u`
        : 'Droog 2u';

  // Wind display with gusts
  const windDisplay =
    windKmh !== null
      ? gustsKmh !== null && gustsKmh > windKmh
        ? `${windKmh}km/u (vlagen ${gustsKmh})`
        : `${windKmh}km/u`
      : '\u2014';

  const factors = [
    {
      icon: Wind,
      label: 'Wind',
      value: windDisplay,
      status: getFactorStatus(score.factors.wind),
    },
    {
      icon: Thermometer,
      label: 'Temp',
      value: temp !== null ? `${Math.round(temp)}\u00B0C` : '\u2014',
      status: getFactorStatus(score.factors.temperature),
    },
    {
      icon: Droplets,
      label: 'Delta-T',
      value: deltaT ? `${deltaT.value.toFixed(1)}\u00B0C` : '\u2014',
      status: getFactorStatus(score.factors.deltaT),
      info: true,
    },
    {
      icon: CloudRain,
      label: 'Neerslag',
      value: precipText,
      status: getFactorStatus(score.factors.precipitation),
    },
  ];

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 md:p-6 transition-all',
        config.bg,
        config.border,
        config.glow
      )}
    >
      {/* Product type selector */}
      <div className="flex items-center justify-center gap-1 mb-4">
        {PRODUCT_TABS.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setSelectedProduct(tab.type)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all',
              selectedProduct === tab.type
                ? 'bg-white/15 text-white'
                : 'text-white/30 hover:text-white/50 hover:bg-white/5'
            )}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.short}</span>
          </button>
        ))}
      </div>

      {/* Main indicator with remaining time */}
      <div className="text-center mb-4">
        <h2 className={cn('text-2xl md:text-3xl font-black', config.text)}>
          {config.label}
          {remainingHours !== null && score.label !== 'Rood' && (
            <span className="text-lg md:text-xl font-bold opacity-70">
              {' '}&mdash; nog {remainingHours} uur
            </span>
          )}
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {selectedProduct === 'standaard'
            ? config.sublabel
            : `${SPRAY_PROFILES[selectedProduct].label}: ${config.sublabel.toLowerCase()}`}
        </p>
      </div>

      {/* Conditions summary line */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-white/50 mb-4">
        <span>
          Wind {windDisplay}
        </span>
        <span className="text-white/20">&bull;</span>
        <span>
          {temp !== null ? `${Math.round(temp)}\u00B0C` : '\u2014'}
        </span>
        {deltaT && (
          <>
            <span className="text-white/20">&bull;</span>
            <span>
              \u0394T {deltaT.value.toFixed(1)}\u00B0C
            </span>
          </>
        )}
        <span className="text-white/20">&bull;</span>
        <span>{rainTiming}</span>
      </div>

      {/* Factor chips */}
      <TooltipProvider delayDuration={0}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {factors.map((factor) => {
            const chip = (
              <div
                key={factor.label}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-2.5 py-2',
                  factorStatusColors[factor.status]
                )}
              >
                <factor.icon className="h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60 leading-none">
                      {factor.label}
                    </span>
                    {factor.info && (
                      <Info className="h-2.5 w-2.5 opacity-40 shrink-0" />
                    )}
                  </div>
                  <div className="text-[13px] font-bold leading-tight whitespace-nowrap mt-0.5">
                    {factor.value}
                  </div>
                </div>
              </div>
            );

            if (!factor.info) return chip;

            return (
              <Tooltip key={factor.label}>
                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-[260px] bg-zinc-900 border-white/10 p-3"
                >
                  <p className="text-[11px] font-bold text-white/90 mb-1.5">
                    Delta-T = temperatuur &minus; dauwpunt
                  </p>
                  <p className="text-[10px] text-white/50 mb-2">
                    Meet hoe snel druppels verdampen na het spuiten
                  </p>
                  <div className="space-y-1">
                    {[
                      { range: '< 2\u00B0C', label: 'Te vochtig', color: 'text-blue-400' },
                      { range: '2\u20138\u00B0C', label: 'Ideaal', color: 'text-emerald-400' },
                      { range: '8\u201310\u00B0C', label: 'Acceptabel', color: 'text-amber-400' },
                      { range: '> 10\u00B0C', label: 'Te droog', color: 'text-red-400' },
                    ].map((row) => (
                      <div key={row.range} className="flex items-center gap-2 text-[10px]">
                        <span className="text-white/40 w-[42px] font-mono">{row.range}</span>
                        <span className={cn('font-semibold', row.color)}>{row.label}</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Upcoming windows section */}
      {upcomingWindows.length > 0 && (
        <div className="mt-5">
          {/* Separator */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/25">
              Komende vensters
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="space-y-1.5">
            {upcomingWindows.map((w, i) => {
              const info = formatWindowLine(w);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm text-white/60 py-1"
                >
                  <span className="shrink-0">{info.emoji}</span>
                  <span className={cn('font-semibold', info.colors.text)}>
                    {info.dayLabel} {info.period}
                  </span>
                  {info.timeRange && (
                    <span className="text-white/30">
                      {info.timeRange}
                    </span>
                  )}
                  <span className="text-white/30">
                    ({info.duration}u)
                  </span>
                  <span className="text-white/20">&bull;</span>
                  <span className="text-white/40 flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      <Thermometer className="h-3 w-3" />
                      {info.temp}&deg;C
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Wind className="h-3 w-3" />
                      {info.windBft} Bft
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upcomingWindows.length === 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/25">
              Komende vensters
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex items-center justify-center py-3 text-white/20 text-xs">
            <CloudRain className="h-3.5 w-3.5 mr-1.5" />
            Geen goede spuitvensters in de komende 7 dagen
          </div>
        </div>
      )}
    </div>
  );
}
