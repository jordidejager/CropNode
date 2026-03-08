'use client';

import { useMemo } from 'react';
import type { MultiModelData } from '@/hooks/use-weather';
import { calculateSprayWindowScore } from '@/lib/weather/weather-calculations';

interface SprayWindowForecastBandProps {
  data: MultiModelData;
}

interface DayForecast {
  dateKey: string;
  label: string;
  amScore: number | null;
  pmScore: number | null;
  bestPeriod: 'AM' | 'PM' | 'Beide' | null;
}

type ScoreLevel = 'green' | 'orange' | 'red';

function getLevel(score: number | null): ScoreLevel {
  if (score === null) return 'red';
  if (score > 70) return 'green';
  if (score >= 40) return 'orange';
  return 'red';
}

const LEVEL_STYLES: Record<ScoreLevel, { dot: string; text: string }> = {
  green: { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  orange: { dot: 'bg-amber-400', text: 'text-amber-400' },
  red: { dot: 'bg-red-400', text: 'text-red-400' },
};

export function SprayWindowForecastBand({ data }: SprayWindowForecastBandProps) {
  const dayForecasts = useMemo(() => {
    // Use ECMWF as primary model, fallback to first available
    const primaryModel =
      data.models['ecmwf_ifs'] ??
      data.models[Object.keys(data.models)[0] ?? ''];
    if (!primaryModel) return [];

    // Group hourly timestamps by date
    const dayGroups = new Map<
      string,
      Array<{
        hour: number;
        temp: number | null;
        wind: number | null;
        precip: number | null;
        humidity: number | null;
      }>
    >();

    for (let i = 0; i < primaryModel.time.length; i++) {
      const time = primaryModel.time[i]!;
      const dateKey = time.split('T')[0]!;
      const hour = new Date(time).getHours();

      if (!dayGroups.has(dateKey)) dayGroups.set(dateKey, []);
      dayGroups.get(dateKey)!.push({
        hour,
        temp: primaryModel.temperature_c[i] ?? null,
        wind: primaryModel.wind_speed_ms[i] ?? null,
        precip: primaryModel.precipitation_mm[i] ?? null,
        humidity: primaryModel.humidity_pct[i] ?? null,
      });
    }

    const results: DayForecast[] = [];
    // Only show from today onwards (not historical data)
    const todayKey = new Date().toISOString().split('T')[0]!;
    const sortedDays = Array.from(dayGroups.entries())
      .filter(([dateKey]) => dateKey >= todayKey)
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [dateKey, hours] of sortedDays) {
      const amHours = hours.filter((h) => h.hour >= 6 && h.hour < 12);
      const pmHours = hours.filter((h) => h.hour >= 12 && h.hour < 18);

      const calcAvgScore = (
        subset: typeof hours
      ): number | null => {
        if (subset.length === 0) return null;
        const scores = subset.map((h) => {
          // Estimate precip next 2h by summing subsequent hours
          const precipNext2h =
            subset
              .filter((sh) => sh.hour > h.hour && sh.hour <= h.hour + 2)
              .reduce((sum, sh) => sum + (sh.precip ?? 0), 0) || 0;

          // Estimate dew point from temperature and humidity
          // Using Magnus formula approximation
          const dewPoint =
            h.temp !== null && h.humidity !== null
              ? h.temp - (100 - h.humidity) / 5
              : null;

          return calculateSprayWindowScore(
            h.wind,
            h.temp,
            dewPoint,
            h.precip,
            precipNext2h
          ).score;
        });

        return Math.round(
          scores.reduce((a, b) => a + b, 0) / scores.length
        );
      };

      const amScore = calcAvgScore(amHours);
      const pmScore = calcAvgScore(pmHours);

      let bestPeriod: DayForecast['bestPeriod'] = null;
      if (amScore !== null && pmScore !== null) {
        if (amScore > 70 && pmScore > 70) bestPeriod = 'Beide';
        else if (amScore >= pmScore) bestPeriod = 'AM';
        else bestPeriod = 'PM';
      } else if (amScore !== null) {
        bestPeriod = 'AM';
      } else if (pmScore !== null) {
        bestPeriod = 'PM';
      }

      const d = new Date(dateKey);
      const label = d.toLocaleDateString('nl-NL', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

      results.push({ dateKey, label, amScore, pmScore, bestPeriod });
    }

    return results;
  }, [data]);

  if (dayForecasts.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <h3 className="text-[11px] text-white/40 uppercase tracking-wider font-bold mb-3">
        Spuitvenster Prognose
      </h3>

      <div className="space-y-1.5">
        {dayForecasts.map((day) => {
          const bestLevel = getLevel(
            day.amScore !== null && day.pmScore !== null
              ? Math.max(day.amScore, day.pmScore)
              : day.amScore ?? day.pmScore
          );
          const bestStyles = LEVEL_STYLES[bestLevel];

          return (
            <div
              key={day.dateKey}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              {/* Day label */}
              <span className="text-white/60 text-xs font-medium w-20 shrink-0">
                {day.label}
              </span>

              {/* Overall dot */}
              <div
                className={`w-2.5 h-2.5 rounded-full ${bestStyles.dot} shrink-0`}
              />

              {/* AM/PM sections */}
              <div className="flex gap-2 flex-1">
                <DayHalf
                  label="Ochtend"
                  score={day.amScore}
                  isBest={day.bestPeriod === 'AM' || day.bestPeriod === 'Beide'}
                />
                <DayHalf
                  label="Middag"
                  score={day.pmScore}
                  isBest={day.bestPeriod === 'PM' || day.bestPeriod === 'Beide'}
                />
              </div>

              {/* Best period badge */}
              {day.bestPeriod && (
                <span
                  className={`text-[10px] font-bold ${bestStyles.text} shrink-0`}
                >
                  {day.bestPeriod === 'Beide'
                    ? 'Hele dag'
                    : day.bestPeriod === 'AM'
                      ? 'Best: ochtend'
                      : 'Best: middag'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayHalf({
  label,
  score,
  isBest,
}: {
  label: string;
  score: number | null;
  isBest: boolean;
}) {
  const level = getLevel(score);
  const styles = LEVEL_STYLES[level];

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${
        isBest ? 'bg-white/[0.05]' : ''
      }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
      <span className="text-white/30 text-[10px]">{label}</span>
      <span className={`text-[10px] font-bold ${styles.text}`}>
        {score !== null ? score : '—'}
      </span>
    </div>
  );
}
