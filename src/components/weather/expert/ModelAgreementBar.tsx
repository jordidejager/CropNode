'use client';

import { useMemo } from 'react';
import type { MultiModelData } from '@/hooks/use-weather';
import type { WeatherVariable } from './VariableSelector';

interface ModelAgreementBarProps {
  data: MultiModelData;
  variable: WeatherVariable;
}

type AgreementLevel = 'high' | 'medium' | 'low';

interface DayAgreement {
  label: string;
  level: AgreementLevel;
  avgSD: number;
}

const AGREEMENT_CONFIG: Record<
  AgreementLevel,
  { label: string; color: string; bg: string; ring: string }
> = {
  high: {
    label: 'Hoog',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    ring: 'ring-emerald-500/30',
  },
  medium: {
    label: 'Redelijk',
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    ring: 'ring-amber-500/30',
  },
  low: {
    label: 'Laag',
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    ring: 'ring-red-500/30',
  },
};

// Thresholds depend on variable (temperature uses °C, precipitation uses mm, etc.)
function getThresholds(variable: WeatherVariable): { high: number; medium: number } {
  switch (variable) {
    case 'temperature_c':
      return { high: 1.5, medium: 3 };
    case 'precipitation_mm':
      return { high: 0.5, medium: 1.5 };
    case 'wind_speed_ms':
      return { high: 1, medium: 2.5 };
    case 'humidity_pct':
      return { high: 5, medium: 12 };
    default:
      return { high: 1.5, medium: 3 };
  }
}

function classifyAgreement(sd: number, variable: WeatherVariable): AgreementLevel {
  const t = getThresholds(variable);
  if (sd < t.high) return 'high';
  if (sd < t.medium) return 'medium';
  return 'low';
}

export function ModelAgreementBar({ data, variable }: ModelAgreementBarProps) {
  const dayAgreements = useMemo(() => {
    // Collect all unique timestamps with their model values
    const timeValues = new Map<string, number[]>();

    for (const [, modelData] of Object.entries(data.models)) {
      if (!modelData) continue;
      const values = modelData[variable];
      if (!values) continue;

      for (let i = 0; i < modelData.time.length; i++) {
        const time = modelData.time[i]!;
        const val = values[i];
        if (val === null || val === undefined) continue;
        if (!timeValues.has(time)) timeValues.set(time, []);
        timeValues.get(time)!.push(val);
      }
    }

    // Group by date
    const dayGroups = new Map<string, number[][]>();
    for (const [time, vals] of timeValues) {
      if (vals.length < 2) continue; // Need at least 2 models to compare
      const dateKey = time.split('T')[0]!;
      if (!dayGroups.has(dateKey)) dayGroups.set(dateKey, []);
      dayGroups.get(dateKey)!.push(vals);
    }

    // Calculate standard deviation per timestep, then average per day
    const results: DayAgreement[] = [];
    // Only show from today onwards
    const todayKey = new Date().toISOString().split('T')[0]!;
    const sortedDays = Array.from(dayGroups.entries())
      .filter(([dateKey]) => dateKey >= todayKey)
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [dateKey, hourlyVals] of sortedDays) {
      const sds = hourlyVals.map((vals) => {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance =
          vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
        return Math.sqrt(variance);
      });

      const avgSD = sds.reduce((a, b) => a + b, 0) / sds.length;
      const d = new Date(dateKey);
      const label = d.toLocaleDateString('nl-NL', {
        weekday: 'short',
        day: 'numeric',
      });

      results.push({
        label,
        level: classifyAgreement(avgSD, variable),
        avgSD: Math.round(avgSD * 10) / 10,
      });
    }

    return results;
  }, [data, variable]);

  if (dayAgreements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40 uppercase tracking-wider font-bold">
          Model Overeenstemming
        </span>
        <div className="flex items-center gap-3 text-[10px] text-white/30">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
            Hoog
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500/60" />
            Redelijk
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500/60" />
            Laag
          </span>
        </div>
      </div>

      <div className="flex gap-1">
        {dayAgreements.map((day) => {
          const config = AGREEMENT_CONFIG[day.level];
          return (
            <div
              key={day.label}
              className={`flex-1 rounded-lg ${config.bg} ring-1 ${config.ring} px-2 py-2 text-center min-w-0`}
              title={`SD: ${day.avgSD}`}
            >
              <div className={`text-[10px] font-bold ${config.color} truncate`}>
                {day.label}
              </div>
              <div className={`text-[10px] ${config.color} opacity-60 mt-0.5`}>
                {config.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
