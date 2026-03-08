'use client';

import { useState } from 'react';
import { WeeklyForecastDay } from './WeeklyForecastDay';

interface WeeklyForecastProps {
  dailyData: Array<Record<string, unknown>>;
  hourlyData: Array<Record<string, unknown>>;
}

export function WeeklyForecast({ dailyData, hourlyData }: WeeklyForecastProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Get 7 days starting from today
  const today = new Date().toISOString().split('T')[0]!;
  const days = dailyData
    .filter((d) => {
      const date = (d.date as string) ?? '';
      return date >= today;
    })
    .slice(0, 7);

  if (days.length === 0) return null;

  // Group hourly data by date
  const hourlyByDate = new Map<string, Array<Record<string, unknown>>>();
  for (const h of hourlyData) {
    const ts = (h.timestamp as string) ?? '';
    const date = ts.split('T')[0] ?? '';
    if (!hourlyByDate.has(date)) hourlyByDate.set(date, []);
    hourlyByDate.get(date)!.push(h);
  }

  // Compute average cloud cover per day from hourly data
  const cloudCoverByDate = new Map<string, number>();
  for (const [date, hours] of hourlyByDate) {
    const covers = hours
      .map(
        (h) =>
          (h.cloudCoverPct as number | null) ?? (h.cloud_cover_pct as number | null)
      )
      .filter((c): c is number => c !== null);
    if (covers.length > 0) {
      cloudCoverByDate.set(
        date,
        Math.round(covers.reduce((a, b) => a + b, 0) / covers.length)
      );
    }
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
          7-daagse forecast
        </h3>
      </div>

      {days.map((d) => {
        const date = d.date as string;
        return (
          <WeeklyForecastDay
            key={date}
            day={{
              date,
              tempMinC: (d.tempMinC as number | null) ?? (d.temp_min_c as number | null),
              tempMaxC: (d.tempMaxC as number | null) ?? (d.temp_max_c as number | null),
              precipitationSum:
                (d.precipitationSum as number | null) ??
                (d.precipitation_sum as number | null),
              windSpeedMaxMs:
                (d.windSpeedMaxMs as number | null) ??
                (d.wind_speed_max_ms as number | null),
              humidityAvgPct:
                (d.humidityAvgPct as number | null) ??
                (d.humidity_avg_pct as number | null),
              cloudCoverAvg: cloudCoverByDate.get(date) ?? null,
            }}
            hourlyForDay={hourlyByDate.get(date) ?? []}
            isExpanded={expandedDay === date}
            onToggle={() =>
              setExpandedDay((prev) => (prev === date ? null : date))
            }
          />
        );
      })}
    </div>
  );
}
