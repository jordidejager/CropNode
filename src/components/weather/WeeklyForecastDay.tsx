'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WeatherIcon } from './WeatherIcon';
import { calculateSprayWindowScore } from '@/lib/weather/weather-calculations';
import { AnimatePresence, motion } from 'framer-motion';

interface DayData {
  date: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  precipitationSum: number | null;
  windSpeedMaxMs: number | null;
  humidityAvgPct: number | null;
  cloudCoverAvg: number | null;
}

interface WeeklyForecastDayProps {
  day: DayData;
  hourlyForDay: Array<Record<string, unknown>>;
  isExpanded: boolean;
  onToggle: () => void;
}

type SprayLabel = 'Groen' | 'Oranje' | 'Rood';

function getDaySprayWindow(hourlyData: Array<Record<string, unknown>>): {
  label: SprayLabel;
  bestWindow: string | null;
} {
  if (hourlyData.length === 0) return { label: 'Rood', bestWindow: null };

  let bestScore = 0;
  let bestHour = -1;

  // Check morning (6-10) and evening (17-21) windows
  for (let i = 0; i < hourlyData.length; i++) {
    const d = hourlyData[i]!;
    const hour = new Date(d.timestamp as string).getHours();
    if ((hour >= 6 && hour <= 10) || (hour >= 17 && hour <= 21)) {
      const windSpeed =
        (d.windSpeedMs as number | null) ?? (d.wind_speed_ms as number | null);
      const temp =
        (d.temperatureC as number | null) ?? (d.temperature_c as number | null);
      const dewPoint =
        (d.dewPointC as number | null) ?? (d.dew_point_c as number | null);
      const precip =
        (d.precipitationMm as number | null) ?? (d.precipitation_mm as number | null);

      const nextItems = hourlyData.slice(i + 1, i + 3);
      const precipNext2h = nextItems.reduce((sum, n) => {
        const p =
          (n.precipitationMm as number | null) ??
          (n.precipitation_mm as number | null) ??
          0;
        return sum + p;
      }, 0);

      const score = calculateSprayWindowScore(
        windSpeed,
        temp,
        dewPoint,
        precip,
        precipNext2h
      );
      if (score.score > bestScore) {
        bestScore = score.score;
        bestHour = hour;
      }
    }
  }

  const label: SprayLabel =
    bestScore > 70 ? 'Groen' : bestScore >= 40 ? 'Oranje' : 'Rood';
  const bestWindow =
    bestHour >= 0
      ? bestHour < 12
        ? 'ochtend'
        : 'avond'
      : null;

  return { label, bestWindow };
}

const sprayColors: Record<SprayLabel, string> = {
  Groen: 'bg-emerald-500/20 text-emerald-400',
  Oranje: 'bg-amber-500/20 text-amber-400',
  Rood: 'bg-red-500/20 text-red-400',
};

const sprayDotColors: Record<SprayLabel, string> = {
  Groen: 'bg-emerald-400',
  Oranje: 'bg-amber-400',
  Rood: 'bg-red-400',
};

export function WeeklyForecastDay({
  day,
  hourlyForDay,
  isExpanded,
  onToggle,
}: WeeklyForecastDayProps) {
  const date = new Date(day.date + 'T12:00:00');
  const dayName = date.toLocaleDateString('nl-NL', { weekday: 'short' });
  const dateStr = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

  const spray = getDaySprayWindow(hourlyForDay);

  // Temperature bar range (relative to week range)
  const tempRange = { min: -5, max: 35 };
  const barLeft =
    day.tempMinC !== null
      ? ((day.tempMinC - tempRange.min) / (tempRange.max - tempRange.min)) * 100
      : 0;
  const barRight =
    day.tempMaxC !== null
      ? ((day.tempMaxC - tempRange.min) / (tempRange.max - tempRange.min)) * 100
      : 0;

  return (
    <div className="border-b border-white/5 last:border-0">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
      >
        {/* Day name */}
        <div className="w-16 shrink-0">
          <div className="text-sm font-bold text-white capitalize">{dayName}</div>
          <div className="text-[10px] text-white/30">{dateStr}</div>
        </div>

        {/* Weather icon */}
        <WeatherIcon
          cloudCover={day.cloudCoverAvg}
          precipitationMm={day.precipitationSum}
          temperatureC={day.tempMinC}
          className="h-5 w-5 text-white/50 shrink-0"
        />

        {/* Temperature bar */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs text-white/40 w-8 text-right">
            {day.tempMinC !== null ? `${Math.round(day.tempMinC)}°` : '—'}
          </span>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full relative">
            <div
              className="absolute h-full rounded-full"
              style={{
                left: `${Math.max(0, barLeft)}%`,
                width: `${Math.max(2, barRight - barLeft)}%`,
                background: 'linear-gradient(90deg, #3b82f6, #f59e0b)',
              }}
            />
          </div>
          <span className="text-xs text-white/60 w-8">
            {day.tempMaxC !== null ? `${Math.round(day.tempMaxC)}°` : '—'}
          </span>
        </div>

        {/* Precipitation */}
        <div className="w-14 text-right shrink-0">
          <span className="text-xs text-sky-400/70">
            {day.precipitationSum !== null && day.precipitationSum > 0
              ? `${day.precipitationSum.toFixed(1)} mm`
              : ''}
          </span>
        </div>

        {/* Wind */}
        <div className="w-10 text-right shrink-0 hidden md:block">
          <span className="text-xs text-white/30">
            {day.windSpeedMaxMs !== null
              ? `${Math.round(day.windSpeedMaxMs)}`
              : '—'}
          </span>
        </div>

        {/* Spray window indicator */}
        <div className="shrink-0 flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', sprayDotColors[spray.label])} />
        </div>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-white/20 transition-transform shrink-0',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && hourlyForDay.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              {/* Spray window badge */}
              <div className="mb-2">
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', sprayColors[spray.label])}>
                  {spray.label === 'Groen'
                    ? `Goed spuitvenster (${spray.bestWindow})`
                    : spray.label === 'Oranje'
                      ? `Matig (${spray.bestWindow ?? 'beperkt'})`
                      : 'Geen goed spuitvenster'}
                </span>
              </div>

              {/* Hourly mini strip */}
              <div className="flex gap-0 overflow-x-auto custom-scrollbar">
                {hourlyForDay.map((h) => {
                  const hour = new Date(h.timestamp as string).getHours();
                  const temp =
                    (h.temperatureC as number | null) ??
                    (h.temperature_c as number | null);
                  const precip =
                    (h.precipitationMm as number | null) ??
                    (h.precipitation_mm as number | null);
                  const wind =
                    (h.windSpeedMs as number | null) ??
                    (h.wind_speed_ms as number | null);

                  return (
                    <div
                      key={h.timestamp as string}
                      className="flex flex-col items-center px-1.5 py-1 min-w-[36px]"
                    >
                      <span className="text-[9px] text-white/30">{hour}:00</span>
                      <span className="text-[11px] font-bold text-white/60">
                        {temp !== null ? `${Math.round(temp)}°` : '—'}
                      </span>
                      <span className="text-[9px] text-sky-400/50">
                        {precip !== null && precip > 0 ? `${precip.toFixed(1)}` : ''}
                      </span>
                      <span className="text-[9px] text-white/20">
                        {wind !== null ? `${wind.toFixed(0)}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
