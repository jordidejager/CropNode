'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import type { MultiModelData } from '@/hooks/use-weather';
import type { WeatherVariable } from './expert/VariableSelector';
import { getVariableUnit, getVariableLabel } from './expert/VariableSelector';

const MODEL_CONFIG: Record<string, { color: string; label: string; dashed: boolean }> = {
  ecmwf_ifs: { color: '#2563eb', label: 'ECMWF', dashed: false },
  icon_eu: { color: '#16a34a', label: 'ICON', dashed: false },
  gfs: { color: '#dc2626', label: 'GFS', dashed: false },
  meteofrance_arpege: { color: '#9333ea', label: 'MétéoFr', dashed: false },
  ecmwf_aifs: { color: '#0891b2', label: 'AIFS', dashed: true },
};

const VARIABLES: WeatherVariable[] = [
  'temperature_c',
  'precipitation_mm',
  'wind_speed_ms',
  'humidity_pct',
];

interface MultiModelPreviewProps {
  data: MultiModelData;
}

export function MultiModelPreview({ data }: MultiModelPreviewProps) {
  const availableModels = useMemo(
    () => Object.keys(data.models).filter((m) => m in MODEL_CONFIG && data.models[m]),
    [data]
  );

  const todayStr = new Date().toISOString().split('T')[0]! + 'T12:00';

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
          14-Daagse Voorspelling
        </h3>
        <Link
          href="/weer/forecast"
          className="flex items-center gap-1 text-[10px] text-purple-400/60 hover:text-purple-400 transition-colors"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Expert Forecast
        </Link>
      </div>

      {/* Compact legend */}
      <div className="flex flex-wrap gap-2 mb-2">
        {availableModels.map((key) => {
          const config = MODEL_CONFIG[key]!;
          return (
            <div key={key} className="flex items-center gap-1">
              <div
                className="w-3 h-0.5 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-[9px] text-white/40">{config.label}</span>
            </div>
          );
        })}
      </div>

      {/* 2x2 mini charts */}
      <div className="grid grid-cols-2 gap-2">
        {VARIABLES.map((variable) => (
          <MiniChart
            key={variable}
            data={data}
            variable={variable}
            availableModels={availableModels}
            todayStr={todayStr}
          />
        ))}
      </div>
    </div>
  );
}

function MiniChart({
  data,
  variable,
  availableModels,
  todayStr,
}: {
  data: MultiModelData;
  variable: WeatherVariable;
  availableModels: string[];
  todayStr: string;
}) {
  const unit = getVariableUnit(variable);
  const label = getVariableLabel(variable);
  const isPrecipitation = variable === 'precipitation_mm';

  const chartData = useMemo(() => {
    const timeMap = new Map<string, Record<string, number | null>>();

    for (const [modelName, modelData] of Object.entries(data.models)) {
      if (!modelData) continue;
      const values = modelData[variable];
      if (!values) continue;

      for (let i = 0; i < modelData.time.length; i++) {
        const time = modelData.time[i]!;
        if (!timeMap.has(time)) timeMap.set(time, {});
        timeMap.get(time)![modelName] = values[i] ?? null;
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return Array.from(timeMap.entries())
      .filter(([time]) => new Date(time).getTime() >= todayStart.getTime())
      .map(([time, values]) => ({ time, ...values }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [data, variable]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2">
        <div className="text-[9px] font-bold text-white/30">{label}</div>
        <div className="flex items-center justify-center h-[80px] text-white/15 text-[10px]">
          Geen data
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-bold text-white/30">{label}</span>
        <span className="text-[8px] text-white/15">{unit}</span>
      </div>

      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart
          data={chartData}
          margin={{ top: 2, right: 2, left: -25, bottom: 0 }}
        >
          <XAxis
            dataKey="time"
            tickFormatter={(time: string) => {
              const d = new Date(time);
              if (d.getHours() === 0) {
                return d.toLocaleDateString('nl-NL', { weekday: 'narrow' });
              }
              return '';
            }}
            tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 8 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.15)', fontSize: 8 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <ReferenceLine
            x={todayStr}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="2 2"
          />

          {availableModels.map((modelKey) => {
            const config = MODEL_CONFIG[modelKey];
            if (!config) return null;

            if (isPrecipitation) {
              return (
                <Bar
                  key={modelKey}
                  dataKey={modelKey}
                  fill={config.color}
                  fillOpacity={0.5}
                  radius={[1, 1, 0, 0]}
                  barSize={1.5}
                  isAnimationActive={false}
                />
              );
            }

            return (
              <Line
                key={modelKey}
                dataKey={modelKey}
                stroke={config.color}
                strokeWidth={modelKey === 'ecmwf_ifs' ? 1.5 : 1}
                strokeDasharray={config.dashed ? '3 2' : undefined}
                dot={false}
                type="monotone"
                connectNulls
                isAnimationActive={false}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
