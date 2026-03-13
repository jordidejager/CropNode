'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { MultiModelData } from '@/hooks/use-weather';
import type { WeatherVariable } from './VariableSelector';
import { getVariableUnit, getVariableLabel } from './VariableSelector';

const MODEL_CONFIG: Record<
  string,
  { color: string; label: string; dashed: boolean }
> = {
  ecmwf_ifs: { color: '#2563eb', label: 'ECMWF', dashed: false },
  icon_eu: { color: '#16a34a', label: 'ICON', dashed: false },
  gfs: { color: '#dc2626', label: 'GFS', dashed: false },
  meteofrance_arpege: { color: '#9333ea', label: 'MeteoFrance', dashed: false },
  ecmwf_aifs: { color: '#0891b2', label: 'AIFS (AI)', dashed: true },
};

const VARIABLES: WeatherVariable[] = [
  'temperature_c',
  'precipitation_mm',
  'wind_speed_ms',
  'humidity_pct',
];

interface CombinedMultiModelChartProps {
  data: MultiModelData;
}

export function CombinedMultiModelChart({ data }: CombinedMultiModelChartProps) {
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

  const availableModels = useMemo(
    () => Object.keys(data.models).filter((m) => m in MODEL_CONFIG && data.models[m]),
    [data]
  );

  const todayStr = new Date().toISOString().split('T')[0]! + 'T12:00';

  const handleLegendClick = (modelKey: string) => {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelKey)) next.delete(modelKey);
      else next.add(modelKey);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Shared legend */}
      <div className="flex flex-wrap gap-3 justify-center">
        {availableModels.map((key) => {
          const config = MODEL_CONFIG[key]!;
          const isHidden = hiddenModels.has(key);
          return (
            <button
              key={key}
              onClick={() => handleLegendClick(key)}
              className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
                isHidden ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <div
                className="w-4 h-0.5 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-white/60">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2x2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {VARIABLES.map((variable) => (
          <MiniChart
            key={variable}
            data={data}
            variable={variable}
            availableModels={availableModels}
            hiddenModels={hiddenModels}
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
  hiddenModels,
  todayStr,
}: {
  data: MultiModelData;
  variable: WeatherVariable;
  availableModels: string[];
  hiddenModels: Set<string>;
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
        if (!timeMap.has(time)) {
          timeMap.set(time, {});
        }
        timeMap.get(time)![modelName] = values[i] ?? null;
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return Array.from(timeMap.entries())
      .filter(([time]) => new Date(time).getTime() >= todayMs)
      .map(([time, values]) => ({ time, ...values }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [data, variable]);

  const formatXAxis = (time: string) => {
    const d = new Date(time);
    const hour = d.getHours();
    if (hour === 0) {
      return d.toLocaleDateString('nl-NL', { weekday: 'short' });
    }
    return '';
  };

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
        <div className="text-[10px] font-bold text-white/40 mb-2">{label}</div>
        <div className="flex items-center justify-center h-[140px] text-white/20 text-xs">
          Geen data
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-white/40">{label}</span>
        <span className="text-[9px] text-white/20">{unit}</span>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart
          data={chartData}
          margin={{ top: 2, right: 5, left: -20, bottom: 2 }}
        >
          <XAxis
            dataKey="time"
            tickFormatter={formatXAxis}
            tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={35}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            content={({ active, payload, label: tLabel }) => {
              if (!active || !payload || !tLabel) return null;
              const d = new Date(tLabel as string);
              return (
                <div className="bg-[#0f172a]/95 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] shadow-xl">
                  <div className="text-white/40 mb-1">
                    {d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' })}{' '}
                    {d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {payload
                    .filter((p) => p.value !== null && p.value !== undefined)
                    .map((p) => {
                      const config = MODEL_CONFIG[p.dataKey as string];
                      return (
                        <div key={p.dataKey} className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-0.5 rounded-full"
                            style={{ backgroundColor: p.color as string }}
                          />
                          <span className="text-white/50">{config?.label}:</span>
                          <span className="text-white font-bold ml-auto">
                            {typeof p.value === 'number'
                              ? (p.value as number).toFixed(1)
                              : '—'}{' '}
                            {unit}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            }}
            cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <ReferenceLine
            x={todayStr}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="3 3"
          />

          {availableModels.map((modelKey) => {
            const config = MODEL_CONFIG[modelKey];
            if (!config) return null;
            const isHidden = hiddenModels.has(modelKey);

            if (isPrecipitation) {
              return (
                <Bar
                  key={modelKey}
                  dataKey={modelKey}
                  fill={config.color}
                  fillOpacity={isHidden ? 0 : 0.6}
                  radius={[1, 1, 0, 0]}
                  barSize={2}
                  isAnimationActive={false}
                />
              );
            }

            return (
              <Line
                key={modelKey}
                dataKey={modelKey}
                stroke={config.color}
                strokeWidth={modelKey === 'ecmwf_ifs' ? 2 : 1.5}
                strokeDasharray={config.dashed ? '4 2' : undefined}
                dot={false}
                type="monotone"
                connectNulls
                hide={isHidden}
                isAnimationActive={false}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
