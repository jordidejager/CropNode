'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import type { ForecastAccuracySummary, ForecastAccuracyDay } from '@/lib/weather/forecast-accuracy';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useForecastAccuracy(stationId: string) {
  return useQuery<ForecastAccuracySummary>({
    queryKey: ['weather', 'forecast-accuracy', stationId],
    queryFn: async () => {
      const res = await fetch(
        `/api/weather/forecast-accuracy?stationId=${stationId}&days=7`
      );
      if (!res.ok) throw new Error('Failed to fetch forecast accuracy');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Unknown error');
      return json.data as ForecastAccuracySummary;
    },
    staleTime: 30 * 60 * 1000, // 30 min
    enabled: !!stationId,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ForecastAccuracyWidgetProps {
  stationId: string;
}

export function ForecastAccuracyWidget({ stationId }: ForecastAccuracyWidgetProps) {
  const { data, isLoading, isError } = useForecastAccuracy(stationId);

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="h-5 w-48 rounded bg-white/5 animate-pulse mb-4" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
        <div className="h-[240px] rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <p className="text-white/30 text-sm text-center">
          Forecast accuracy data kon niet geladen worden
        </p>
      </div>
    );
  }

  // No KNMI station linked
  if (!data || !data.knmiStationName) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
            Forecast vs. Werkelijkheid
          </h3>
        </div>
        <div className="flex items-center justify-center gap-2 py-10 text-white/20 text-sm">
          <AlertCircle className="h-4 w-4 opacity-50" />
          Geen KNMI station gekoppeld
        </div>
      </div>
    );
  }

  const { days, metrics } = data;

  // Build chart data
  const chartData = days.map((d) => ({
    ...d,
    label: formatDayLabel(d.date),
    // Area fill between forecast and observed for temp max
    tempMaxRange: buildRange(d.forecastTempMax, d.observedTempMax),
    tempMinRange: buildRange(d.forecastTempMin, d.observedTempMin),
  }));

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
          Forecast vs. Werkelijkheid
        </h3>
      </div>
      <p className="text-[10px] text-white/20 mb-4">
        Verificatie via KNMI station {data.knmiStationName}
      </p>

      {/* KPI Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <MetricCard
          label="Temp nauwkeurigheid"
          value={metrics.tempMaxMAE}
          unit="°C"
          prefix="±"
          thresholds={[2, 4]}
        />
        <MetricCard
          label="Neerslag nauwkeurigheid"
          value={metrics.precipMAE}
          unit="mm"
          prefix="±"
          thresholds={[2, 4]}
        />
        <MetricCard
          label="Temp bias"
          value={metrics.tempMaxBias}
          unit="°C"
          prefix={metrics.tempMaxBias !== null && metrics.tempMaxBias >= 0 ? '+' : ''}
          thresholds={[1, 2]}
          isBias
        />
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[240px] text-white/20 text-sm">
          Geen vergelijkingsdata beschikbaar
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}°`}
                width={35}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={<AccuracyTooltip />}
                cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
              />

              {/* Error fill areas — temp max */}
              <Area
                dataKey="tempMaxRange"
                fill="#ef4444"
                fillOpacity={0.08}
                stroke="none"
                isAnimationActive={false}
                type="monotone"
              />

              {/* Error fill areas — temp min */}
              <Area
                dataKey="tempMinRange"
                fill="#3b82f6"
                fillOpacity={0.08}
                stroke="none"
                isAnimationActive={false}
                type="monotone"
              />

              {/* Observed temp max — solid orange */}
              <Line
                type="monotone"
                dataKey="observedTempMax"
                stroke="#f97316"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
                isAnimationActive={false}
                name="Obs. max"
                connectNulls
              />
              {/* Forecast temp max — dashed orange */}
              <Line
                type="monotone"
                dataKey="forecastTempMax"
                stroke="#f97316"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={{ r: 2, fill: '#f97316', strokeWidth: 0 }}
                isAnimationActive={false}
                name="Fcst. max"
                connectNulls
              />

              {/* Observed temp min — solid blue */}
              <Line
                type="monotone"
                dataKey="observedTempMin"
                stroke="#60a5fa"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }}
                isAnimationActive={false}
                name="Obs. min"
                connectNulls
              />
              {/* Forecast temp min — dashed blue */}
              <Line
                type="monotone"
                dataKey="forecastTempMin"
                stroke="#60a5fa"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={{ r: 2, fill: '#60a5fa', strokeWidth: 0 }}
                isAnimationActive={false}
                name="Fcst. min"
                connectNulls
              />

              <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
            <LegendItem color="#f97316" label="Max temp" solid />
            <LegendItem color="#f97316" label="Max temp (forecast)" dashed />
            <LegendItem color="#60a5fa" label="Min temp" solid />
            <LegendItem color="#60a5fa" label="Min temp (forecast)" dashed />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  unit,
  prefix = '',
  thresholds,
  isBias = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  prefix?: string;
  thresholds: [number, number]; // [green, amber] boundaries
  isBias?: boolean;
}) {
  if (value === null) {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
        <p className="text-[9px] text-white/30 mb-1">{label}</p>
        <p className="text-lg font-black text-white/15 tabular-nums">--</p>
      </div>
    );
  }

  const absValue = Math.abs(value);
  const colorClass = isBias
    ? absValue < thresholds[0]
      ? 'text-emerald-400'
      : absValue < thresholds[1]
      ? 'text-amber-400'
      : 'text-red-400'
    : value < thresholds[0]
    ? 'text-emerald-400'
    : value < thresholds[1]
    ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
      <p className="text-[9px] text-white/30 mb-1 truncate">{label}</p>
      <p className={`text-lg font-black tabular-nums ${colorClass}`}>
        {prefix}{value}
        <span className="text-xs font-medium text-white/30 ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function AccuracyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ForecastAccuracyDay & { label: string } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const d = payload[0]!.payload;

  return (
    <div className="rounded-xl bg-slate-900/95 border border-white/10 px-3 py-2 shadow-xl text-xs min-w-[180px]">
      <p className="text-[10px] font-semibold text-white/50 mb-2">
        {formatTooltipDate(d.date)}
      </p>

      {/* Temp Max */}
      <div className="space-y-0.5 mb-2">
        <p className="text-[9px] text-white/30 uppercase tracking-wide">Max temperatuur</p>
        <div className="flex justify-between">
          <span className="text-orange-400">Werkelijk</span>
          <span className="text-white font-medium tabular-nums">
            {d.observedTempMax !== null ? `${d.observedTempMax}°C` : '--'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-orange-400/60">Forecast</span>
          <span className="text-white/70 font-medium tabular-nums">
            {d.forecastTempMax !== null ? `${d.forecastTempMax}°C` : '--'}
          </span>
        </div>
        {d.tempMaxError !== null && (
          <div className="flex justify-between border-t border-white/5 pt-0.5">
            <span className="text-white/30">Afwijking</span>
            <span
              className={`font-medium tabular-nums ${
                Math.abs(d.tempMaxError) < 2 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {d.tempMaxError >= 0 ? '+' : ''}
              {d.tempMaxError}°C
            </span>
          </div>
        )}
      </div>

      {/* Temp Min */}
      <div className="space-y-0.5 mb-2">
        <p className="text-[9px] text-white/30 uppercase tracking-wide">Min temperatuur</p>
        <div className="flex justify-between">
          <span className="text-blue-400">Werkelijk</span>
          <span className="text-white font-medium tabular-nums">
            {d.observedTempMin !== null ? `${d.observedTempMin}°C` : '--'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-400/60">Forecast</span>
          <span className="text-white/70 font-medium tabular-nums">
            {d.forecastTempMin !== null ? `${d.forecastTempMin}°C` : '--'}
          </span>
        </div>
        {d.tempMinError !== null && (
          <div className="flex justify-between border-t border-white/5 pt-0.5">
            <span className="text-white/30">Afwijking</span>
            <span
              className={`font-medium tabular-nums ${
                Math.abs(d.tempMinError) < 2 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {d.tempMinError >= 0 ? '+' : ''}
              {d.tempMinError}°C
            </span>
          </div>
        )}
      </div>

      {/* Precip */}
      <div className="space-y-0.5">
        <p className="text-[9px] text-white/30 uppercase tracking-wide">Neerslag</p>
        <div className="flex justify-between">
          <span className="text-blue-300">Werkelijk</span>
          <span className="text-white font-medium tabular-nums">
            {d.observedPrecip !== null ? `${d.observedPrecip} mm` : '--'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-300/60">Forecast</span>
          <span className="text-white/70 font-medium tabular-nums">
            {d.forecastPrecip !== null ? `${d.forecastPrecip} mm` : '--'}
          </span>
        </div>
        {d.precipError !== null && (
          <div className="flex justify-between border-t border-white/5 pt-0.5">
            <span className="text-white/30">Afwijking</span>
            <span
              className={`font-medium tabular-nums ${
                Math.abs(d.precipError) < 2 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {d.precipError >= 0 ? '+' : ''}
              {d.precipError} mm
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend Item
// ---------------------------------------------------------------------------

function LegendItem({
  color,
  label,
  solid,
  dashed,
}: {
  color: string;
  label: string;
  solid?: boolean;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {dashed ? (
        <svg width="16" height="2" className="shrink-0">
          <line
            x1="0"
            y1="1"
            x2="16"
            y2="1"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
        </svg>
      ) : (
        <div
          className="w-4 h-0.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="text-[9px] text-white/40">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MONTHS = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * Build a [min, max] range tuple for Area chart between forecast and observed.
 * Returns the range so Recharts can fill the area between the two values.
 */
function buildRange(
  forecast: number | null,
  observed: number | null
): [number, number] | null {
  if (forecast === null || observed === null) return null;
  return [Math.min(forecast, observed), Math.max(forecast, observed)];
}
