'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { EnsembleStatsData } from '@/hooks/use-weather';
import type { WeatherVariable } from './VariableSelector';
import { getVariableUnit } from './VariableSelector';
import type { EnsembleModel } from './ModelSelector';

const MODEL_COLORS: Record<EnsembleModel, string> = {
  ecmwf_ifs: '#2563eb',
  gfs: '#dc2626',
};

const COMBINED_COLOR = '#8b5cf6'; // purple for combined

interface EnsemblePlumeChartProps {
  data: EnsembleStatsData;
  variable: WeatherVariable;
  model: EnsembleModel;
  isCombined?: boolean;
}

export function EnsemblePlumeChart({
  data,
  variable,
  model,
  isCombined = false,
}: EnsemblePlumeChartProps) {
  const color = isCombined ? COMBINED_COLOR : MODEL_COLORS[model];
  const unit = getVariableUnit(variable);

  // Transform stats into Recharts-compatible format
  // For Area ranges we need [lower, upper] arrays
  const chartData = useMemo(() => {
    // Filter to today onwards only
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return data.stats
      .filter((row) => new Date(row.timestamp).getTime() >= todayMs)
      .map((row) => ({
        time: row.timestamp,
        _ts: new Date(row.timestamp).getTime(),
        min: row.min,
        max: row.max,
        p10: row.p10,
        p90: row.p90,
        p25: row.p25,
        p75: row.p75,
        median: row.median,
        // Ranges for stacked area rendering
        rangeMinMax: [row.min, row.max],
        rangeP10P90: [row.p10, row.p90],
        rangeP25P75: [row.p25, row.p75],
      }));
  }, [data]);

  // Today marker
  const todayStr = new Date().toISOString().split('T')[0]! + 'T12:00';

  // X-axis formatter
  const formatXAxis = (time: string) => {
    const d = new Date(time);
    const hour = d.getHours();
    if (hour === 0 || hour === 12) {
      return d.toLocaleDateString('nl-NL', {
        weekday: 'short',
        day: 'numeric',
      });
    }
    return '';
  };

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: unknown }>;
    label?: string;
  }) => {
    if (!active || !payload || !label) return null;

    // Extract the actual stat values from the first payload entry's full row
    const row = chartData.find((r) => r.time === label);
    if (!row) return null;

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
      <div className="bg-[#0f172a]/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl min-w-[160px]">
        <div className="text-white/40 mb-1.5">
          {dateStr} {timeStr}
        </div>
        <div className="space-y-0.5">
          <Row label="Max" value={row.max} />
          <Row label="P90" value={row.p90} />
          <Row label="P75" value={row.p75} />
          <Row label="Mediaan" value={row.median} bold />
          <Row label="P25" value={row.p25} />
          <Row label="P10" value={row.p10} />
          <Row label="Min" value={row.min} />
        </div>
      </div>
    );
  };

  const Row = ({
    label,
    value,
    bold,
  }: {
    label: string;
    value: number;
    bold?: boolean;
  }) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/50">{label}</span>
      <span className={`text-white ${bold ? 'font-bold' : 'font-medium'}`}>
        {typeof value === 'number' ? value.toFixed(1) : '—'} {unit}
      </span>
    </div>
  );

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-white/20 text-sm">
        Geen ensemble data beschikbaar
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

          {/* Band 1: Min – Max (outermost, lightest) */}
          <Area
            dataKey="min"
            stackId="minmax"
            fill="transparent"
            stroke="none"
            type="monotone"
            animationDuration={300}
          />
          <Area
            dataKey={(row: Record<string, number>) =>
              row.max - row.min
            }
            stackId="minmax"
            fill={color}
            fillOpacity={0.08}
            stroke="none"
            type="monotone"
            animationDuration={300}
          />

          {/* Band 2: P10 – P90 */}
          <Area
            dataKey="p10"
            stackId="p10p90"
            fill="transparent"
            stroke="none"
            type="monotone"
            animationDuration={300}
          />
          <Area
            dataKey={(row: Record<string, number>) =>
              row.p90 - row.p10
            }
            stackId="p10p90"
            fill={color}
            fillOpacity={0.15}
            stroke="none"
            type="monotone"
            animationDuration={300}
          />

          {/* Band 3: P25 – P75 (innermost, darkest) */}
          <Area
            dataKey="p25"
            stackId="p25p75"
            fill="transparent"
            stroke="none"
            type="monotone"
            animationDuration={300}
          />
          <Area
            dataKey={(row: Record<string, number>) =>
              row.p75 - row.p25
            }
            stackId="p25p75"
            fill={color}
            fillOpacity={0.25}
            stroke="none"
            type="monotone"
            animationDuration={300}
          />

          {/* Median line */}
          <Line
            dataKey="median"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            type="monotone"
            connectNulls
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-white/40">
        <span className="flex items-center gap-1.5">
          <div
            className="w-8 h-2 rounded-sm"
            style={{ backgroundColor: color, opacity: 0.08 }}
          />
          Min–Max
        </span>
        <span className="flex items-center gap-1.5">
          <div
            className="w-8 h-2 rounded-sm"
            style={{ backgroundColor: color, opacity: 0.15 }}
          />
          P10–P90
        </span>
        <span className="flex items-center gap-1.5">
          <div
            className="w-8 h-2 rounded-sm"
            style={{ backgroundColor: color, opacity: 0.25 }}
          />
          P25–P75
        </span>
        <span className="flex items-center gap-1.5">
          <div
            className="w-4 h-0.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          Mediaan
        </span>
      </div>
    </div>
  );
}
