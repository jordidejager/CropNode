'use client';

import { Clock, Wind, Thermometer, CloudRain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateSprayWindowScore } from '@/lib/weather/weather-calculations';

interface UpcomingSprayWindowsProps {
  hourlyData: Array<Record<string, unknown>>;
}

type SprayWindow = {
  startTime: Date;
  endTime: Date;
  avgScore: number;
  avgWindSpeed: number;
  avgTemp: number;
  label: 'Groen' | 'Oranje';
  warning: string | null;
};

const windowColors = {
  Groen: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  Oranje: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
};

export function UpcomingSprayWindows({ hourlyData }: UpcomingSprayWindowsProps) {
  // Filter to future hours only (next 7 days)
  const now = Date.now();
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

  // Calculate spray score per hour
  const scored = futureData.map((d, i) => {
    const windSpeed =
      (d.windSpeedMs as number | null) ?? (d.wind_speed_ms as number | null);
    const temp =
      (d.temperatureC as number | null) ?? (d.temperature_c as number | null);
    const dewPoint =
      (d.dewPointC as number | null) ?? (d.dew_point_c as number | null);
    const precip =
      (d.precipitationMm as number | null) ?? (d.precipitation_mm as number | null);

    const nextItems = futureData.slice(i + 1, i + 3);
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

    return {
      timestamp: new Date(d.timestamp as string),
      score: score.score,
      label: score.label,
      windSpeed: windSpeed ?? 0,
      temp: temp ?? 0,
      precip: precip ?? 0,
      factors: score.factors,
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

    let warning: string | null = null;
    if (avgWindSpeed > 3.5) warning = 'Let op wind';
    else if (avgTemp < 8) warning = 'Koel';
    else if (avgTemp > 28) warning = 'Warm';

    windows.push({
      startTime: currentWindow[0]!.timestamp,
      endTime: currentWindow[currentWindow.length - 1]!.timestamp,
      avgScore,
      avgWindSpeed,
      avgTemp,
      label: avgScore > 70 ? 'Groen' : 'Oranje',
      warning,
    });
    currentWindow = [];
  }

  for (const hour of scored) {
    if (hour.score >= 40) {
      // Split at day boundary
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

  // Sort by score (best first), take top 5
  const topWindows = windows
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  if (topWindows.length === 0) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
          Komende spuitvensters
        </h3>
        <div className="flex items-center justify-center py-6 text-white/20 text-sm">
          <CloudRain className="h-4 w-4 mr-2" />
          Geen goede spuitvensters in de komende 7 dagen
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
        Komende spuitvensters
      </h3>

      <div className="space-y-2">
        {topWindows.map((window, i) => {
          const colors = windowColors[window.label];
          const isToday =
            window.startTime.toDateString() === new Date().toDateString();
          const isTomorrow =
            window.startTime.toDateString() ===
            new Date(Date.now() + 86400000).toDateString();

          const dayLabel = isToday
            ? 'Vandaag'
            : isTomorrow
              ? 'Morgen'
              : window.startTime.toLocaleDateString('nl-NL', {
                  weekday: 'long',
                });

          const durationHours =
            Math.round(
              (window.endTime.getTime() - window.startTime.getTime()) /
                (60 * 60 * 1000)
            ) + 1;
          const isWholeDay = durationHours >= 18;

          const startHour = window.startTime.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const endHour = new Date(
            window.endTime.getTime() + 60 * 60 * 1000
          ).toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
          });

          const startH = window.startTime.getHours();
          const period = isWholeDay
            ? 'hele dag'
            : startH < 12
              ? 'ochtend'
              : startH < 18
                ? 'middag'
                : 'avond';

          return (
            <div
              key={i}
              className={cn(
                'rounded-xl border px-4 py-3',
                colors.bg,
                colors.border
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('w-2 h-2 rounded-full', colors.dot)} />
                <span className={cn('text-sm font-bold', colors.text)}>
                  {dayLabel} {period}{!isWholeDay && ` (${startHour}–${endHour})`}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-white/40 ml-4">
                <span className="flex items-center gap-1">
                  <Wind className="h-3 w-3" />
                  {Math.round(window.avgWindSpeed * 3.6)}km/u
                </span>
                <span className="flex items-center gap-1">
                  <Thermometer className="h-3 w-3" />
                  {Math.round(window.avgTemp)}°C
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {Math.round(
                    (window.endTime.getTime() -
                      window.startTime.getTime()) /
                      (60 * 60 * 1000) +
                      1
                  )}{' '}
                  uur
                </span>
                {window.warning && (
                  <span className="text-amber-400/60">
                    — {window.warning}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
