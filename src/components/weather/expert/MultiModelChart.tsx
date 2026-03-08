'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { MultiModelData } from '@/hooks/use-weather';
import type { WeatherVariable } from './VariableSelector';
import { getVariableUnit } from './VariableSelector';

// Model display configuration
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

interface MultiModelChartProps {
  data: MultiModelData;
  variable: WeatherVariable;
}

export function MultiModelChart({ data, variable }: MultiModelChartProps) {
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

  // Transform parallel arrays into Recharts-compatible format
  const chartData = useMemo(() => {
    const timeMap = new Map<string, Record<string, number | null>>();

    for (const [modelName, modelData] of Object.entries(data.models)) {
      if (!modelData) continue;
      const values = modelData[variable];
      if (!values) continue;

      for (let i = 0; i < modelData.time.length; i++) {
        const time = modelData.time[i]!;
        if (!timeMap.has(time)) {
          timeMap.set(time, { _ts: new Date(time).getTime() as unknown as null });
        }
        const row = timeMap.get(time)!;
        row[modelName] = values[i] ?? null;
      }
    }

    // Filter to today onwards only
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return Array.from(timeMap.entries())
      .filter(([time]) => new Date(time).getTime() >= todayMs)
      .map(([time, values]) => ({ time, ...values }))
      .sort(
        (a, b) =>
          new Date(a.time).getTime() - new Date(b.time).getTime()
      );
  }, [data, variable]);

  // Available models (that have data)
  const availableModels = useMemo(() => {
    return Object.keys(data.models).filter(
      (m) => m in MODEL_CONFIG && data.models[m]
    );
  }, [data]);

  const unit = getVariableUnit(variable);
  const isPrecipitation = variable === 'precipitation_mm';

  // Today marker
  const todayStr = new Date().toISOString().split('T')[0]! + 'T12:00';

  // X-axis tick formatter
  const formatXAxis = (time: string) => {
    const d = new Date(time);
    const hour = d.getHours();
    if (hour === 0 || hour === 12) {
      return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
    }
    return '';
  };

  // Legend click handler
  const handleLegendClick = (entry: { dataKey?: string; value?: string }) => {
    const modelKey = entry.dataKey ?? entry.value ?? '';
    if (!modelKey || !MODEL_CONFIG[modelKey]) return;
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelKey)) {
        next.delete(modelKey);
      } else {
        next.add(modelKey);
      }
      return next;
    });
  };

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number | null; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload || !label) return null;

    const d = new Date(label);
    const dateStr = d.toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const timeStr = d.toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div className="bg-[#0f172a]/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
        <div className="text-white/40 mb-1.5">
          {dateStr} {timeStr}
        </div>
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => {
            const config = MODEL_CONFIG[p.dataKey];
            return (
              <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
                <div
                  className="w-2.5 h-0.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-white/60">{config?.label ?? p.dataKey}:</span>
                <span className="text-white font-bold ml-auto">
                  {typeof p.value === 'number' ? p.value.toFixed(1) : '—'} {unit}
                </span>
              </div>
            );
          })}
      </div>
    );
  };

  // Custom legend renderer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLegend = (props: any) => {
    const { payload } = props;
    if (!payload) return null;

    return (
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {payload.map((entry: { dataKey?: string; value?: string; color?: string }) => {
          const key = entry.dataKey ?? entry.value ?? '';
          const config = MODEL_CONFIG[key];
          if (!config) return null;
          const isHidden = hiddenModels.has(key);

          return (
            <button
              key={key}
              onClick={() => handleLegendClick(entry)}
              className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
                isHidden ? 'opacity-30' : 'opacity-100'
              }`}
            >
              <div
                className="w-4 h-0.5 rounded-full"
                style={{
                  backgroundColor: config.color,
                  borderStyle: config.dashed ? 'dashed' : 'solid',
                }}
              />
              <span className="text-white/60">{config.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-white/20 text-sm">
        Geen multi-model data beschikbaar
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
        >
          <XAxis
            dataKey="time"
            tickFormatter={formatXAxis}
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}${unit}`}
            width={55}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <Legend content={renderLegend} />
          <ReferenceLine
            x={todayStr}
            stroke="rgba(255,255,255,0.15)"
            strokeDasharray="3 3"
            label={{
              value: 'Nu',
              position: 'insideTopRight',
              fill: 'rgba(255,255,255,0.2)',
              fontSize: 10,
            }}
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
                  radius={[2, 2, 0, 0]}
                  barSize={3}
                  animationDuration={300}
                />
              );
            }

            return (
              <Line
                key={modelKey}
                dataKey={modelKey}
                stroke={config.color}
                strokeWidth={modelKey === 'ecmwf_ifs' ? 2.5 : 2}
                strokeDasharray={config.dashed ? '6 3' : undefined}
                dot={false}
                type="monotone"
                connectNulls
                hide={isHidden}
                animationDuration={300}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
