'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeatherAlertBannerProps {
  hourlyData: Array<Record<string, unknown>>;
  forecastData?: Array<Record<string, unknown>>;
}

type AlertType = 'frost' | 'dry_window' | 'rain' | 'wind';

interface Alert {
  type: AlertType;
  icon: string;
  message: string;
  accent: string;
  bg: string;
  border: string;
  glow: string;
}

const ALERT_PRIORITY: AlertType[] = ['frost', 'dry_window', 'rain', 'wind'];

function getTemp(d: Record<string, unknown>): number | null {
  return (d.temperatureC as number | null) ?? (d.temperature_c as number | null) ?? null;
}

function getPrecip(d: Record<string, unknown>): number {
  return (d.precipitationMm as number | null) ?? (d.precipitation_mm as number | null) ?? 0;
}

function getWindGustsMs(d: Record<string, unknown>): number {
  return (d.windGustsMs as number | null) ?? (d.wind_gusts_ms as number | null) ?? 0;
}

function getWindSpeedMs(d: Record<string, unknown>): number {
  return (d.windSpeedMs as number | null) ?? (d.wind_speed_ms as number | null) ?? 0;
}

function getTimestamp(d: Record<string, unknown>): Date {
  return new Date(d.timestamp as string);
}

function formatDay(date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === now.toDateString()) return 'vandaag';
  if (date.toDateString() === tomorrow.toDateString()) return 'morgen';
  return date.toLocaleDateString('nl-NL', { weekday: 'short' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function detectAlerts(
  hourlyData: Array<Record<string, unknown>>,
  forecastData?: Array<Record<string, unknown>>
): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  const h24 = now + 24 * 60 * 60 * 1000;
  const h48 = now + 48 * 60 * 60 * 1000;

  // Filter hourly data to next 48h
  const next48h = hourlyData.filter((d) => {
    const t = getTimestamp(d).getTime();
    return t >= now && t <= h48;
  });

  const next24h = next48h.filter((d) => getTimestamp(d).getTime() <= h24);

  // 1. Frost warning — any temp < 0 in next 48h
  let minTemp = Infinity;
  let frostEntry: Record<string, unknown> | null = null;
  for (const d of next48h) {
    const temp = getTemp(d);
    if (temp !== null && temp < minTemp) {
      minTemp = temp;
      frostEntry = d;
    }
  }
  if (minTemp < 0 && frostEntry) {
    const ts = getTimestamp(frostEntry);
    alerts.push({
      type: 'frost',
      icon: '❄️',
      message: `Nachtvorst verwacht: ${Math.round(minTemp)}°C ${formatDay(ts)} ${formatTime(ts)}`,
      accent: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/25',
      glow: 'shadow-[0_0_20px_-5px_rgba(34,211,238,0.3)]',
    });
  }

  // 2. Rain incoming — >10mm total in next 24h
  const totalRain24h = next24h.reduce((sum, d) => sum + getPrecip(d), 0);
  if (totalRain24h > 10) {
    alerts.push({
      type: 'rain',
      icon: '🌧️',
      message: `Veel regen verwacht: ${Math.round(totalRain24h)}mm komende 24u`,
      accent: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/25',
      glow: 'shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]',
    });
  }

  // 3. Last dry window — only if rain is coming within 24h
  if (totalRain24h > 10) {
    // Find the first hour with precipitation > 0.2mm (rain start)
    const sortedNext24h = [...next24h].sort(
      (a, b) => getTimestamp(a).getTime() - getTimestamp(b).getTime()
    );

    let rainStartIdx = -1;
    for (let i = 0; i < sortedNext24h.length; i++) {
      if (getPrecip(sortedNext24h[i]) > 0.2) {
        rainStartIdx = i;
        break;
      }
    }

    // Check if there's currently a dry window (first entries are dry)
    if (rainStartIdx > 0) {
      const dryUntil = getTimestamp(sortedNext24h[rainStartIdx]);
      const hoursLeft = Math.round((dryUntil.getTime() - now) / (60 * 60 * 1000));

      if (hoursLeft >= 1) {
        alerts.push({
          type: 'dry_window',
          icon: '🟢',
          message: `Laatste droog venster: tot ${formatTime(dryUntil)} (${hoursLeft}u)`,
          accent: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/25',
          glow: 'shadow-[0_0_20px_-5px_rgba(52,211,153,0.3)]',
        });
      }
    }
  }

  // 4. High wind — gusts > 15 m/s or speed > 10 m/s in next 24h
  let maxWindSpeed = 0;
  let windEntry: Record<string, unknown> | null = null;
  for (const d of next24h) {
    const gusts = getWindGustsMs(d);
    const speed = getWindSpeedMs(d);
    const peak = Math.max(gusts, speed);
    if (peak > maxWindSpeed) {
      maxWindSpeed = peak;
      windEntry = d;
    }
  }
  if (windEntry && (getWindGustsMs(windEntry) > 15 || getWindSpeedMs(windEntry) > 10)) {
    const ts = getTimestamp(windEntry);
    const kmh = Math.round(maxWindSpeed * 3.6);
    alerts.push({
      type: 'wind',
      icon: '💨',
      message: `Harde wind verwacht: ${kmh} km/u ${formatDay(ts)}`,
      accent: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/25',
      glow: 'shadow-[0_0_20px_-5px_rgba(251,191,36,0.3)]',
    });
  }

  // Sort by priority
  alerts.sort(
    (a, b) => ALERT_PRIORITY.indexOf(a.type) - ALERT_PRIORITY.indexOf(b.type)
  );

  return alerts;
}

export function WeatherAlertBanner({ hourlyData, forecastData }: WeatherAlertBannerProps) {
  const [dismissed, setDismissed] = useState<Set<AlertType>>(new Set());

  const allAlerts = useMemo(
    () => detectAlerts(hourlyData, forecastData),
    [hourlyData, forecastData]
  );

  const visibleAlerts = allAlerts
    .filter((a) => !dismissed.has(a.type))
    .slice(0, 2);

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleAlerts.map((alert, idx) => (
        <div
          key={alert.type}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all',
            alert.bg,
            alert.border,
            alert.accent,
            idx === 0 && 'animate-pulse-subtle',
            idx === 0 && alert.glow
          )}
        >
          <span className="text-base leading-none">{alert.icon}</span>
          <span className="whitespace-nowrap">{alert.message}</span>
          <button
            onClick={() =>
              setDismissed((prev) => new Set([...prev, alert.type]))
            }
            className="ml-1 rounded-md p-0.5 opacity-40 transition-opacity hover:opacity-80"
            aria-label="Sluiten"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
