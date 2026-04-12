'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Droplets, AlertTriangle } from 'lucide-react';
import { useWeatherDailyRange, useWeatherForecast } from '@/hooks/use-weather';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaterBalanceDay {
  date: string;
  label: string;
  precipitation: number;
  et0: number;
  et0Negative: number;
  dailyBalance: number;
  cumulativeBalance: number;
  isForecast: boolean;
  isToday: boolean;
}

interface WaterBalanceWidgetProps {
  stationId: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaterBalanceWidget({ stationId }: WaterBalanceWidgetProps) {
  // Date ranges
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]!;

  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const pastStart = fourteenDaysAgo.toISOString().split('T')[0]!;

  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const futureEnd = sevenDaysLater.toISOString().split('T')[0]!;

  // Fetch past 14 days of daily data
  const { data: pastDailyData, isLoading: pastLoading } = useWeatherDailyRange(
    stationId,
    pastStart,
    todayStr
  );

  // Fetch forecast (16 days, we use 7)
  const { data: forecastData, isLoading: forecastLoading } =
    useWeatherForecast(stationId);

  // Merge past + forecast into unified chart data
  const chartData = useMemo(() => {
    const dayMap = new Map<string, WaterBalanceDay>();

    // Process past daily data
    if (pastDailyData) {
      for (const d of pastDailyData) {
        const date = (d.date as string) ?? '';
        const precip =
          (d.precipitationSum as number | null) ??
          (d.precipitation_sum as number | null) ??
          0;
        const et0 =
          (d.et0SumMm as number | null) ??
          (d.et0_sum_mm as number | null) ??
          0;

        dayMap.set(date, {
          date,
          label: formatDayLabel(date),
          precipitation: round1(precip),
          et0: round1(et0),
          et0Negative: round1(-et0),
          dailyBalance: round1(precip - et0),
          cumulativeBalance: 0, // computed below
          isForecast: false,
          isToday: date === todayStr,
        });
      }
    }

    // Process forecast data (skip today if already in past data)
    if (forecastData) {
      for (const d of forecastData) {
        const date = (d.date as string) ?? '';
        if (date <= todayStr) continue; // past data takes priority
        if (date > futureEnd) continue; // only 7 days ahead

        const precip =
          (d.precipitationSum as number | null) ??
          (d.precipitation_sum as number | null) ??
          0;
        const et0 =
          (d.et0SumMm as number | null) ??
          (d.et0_sum_mm as number | null) ??
          0;

        dayMap.set(date, {
          date,
          label: formatDayLabel(date),
          precipitation: round1(precip),
          et0: round1(et0),
          et0Negative: round1(-et0),
          dailyBalance: round1(precip - et0),
          cumulativeBalance: 0,
          isForecast: true,
          isToday: false,
        });
      }
    }

    // Sort by date and compute cumulative balance
    const sorted = Array.from(dayMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    let cumulative = 0;
    for (const day of sorted) {
      cumulative += day.dailyBalance;
      day.cumulativeBalance = round1(cumulative);
    }

    return sorted;
  }, [pastDailyData, forecastData, todayStr, futureEnd]);

  // Current balance (latest known value = today or most recent past)
  const currentBalance = useMemo(() => {
    if (chartData.length === 0) return 0;
    const todayIdx = chartData.findIndex((d) => d.isToday);
    if (todayIdx >= 0) return chartData[todayIdx]!.cumulativeBalance;
    // Find last non-forecast day
    const pastDays = chartData.filter((d) => !d.isForecast);
    return pastDays.length > 0 ? pastDays[pastDays.length - 1]!.cumulativeBalance : 0;
  }, [chartData]);

  const needsIrrigation = currentBalance < -15;
  const isLoading = pastLoading || forecastLoading;

  if (!stationId) return null;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
            Waterbalans
          </h3>
          <p className="text-[10px] text-white/20 mt-0.5">
            Neerslag - Verdamping
          </p>
        </div>

        {/* Current balance KPI */}
        <div className="text-right">
          {isLoading ? (
            <div className="h-8 w-16 rounded-lg bg-white/5 animate-pulse" />
          ) : (
            <div
              className={`text-2xl font-black tabular-nums ${
                currentBalance >= 0 ? 'text-emerald-400' : 'text-orange-400'
              }`}
            >
              {currentBalance >= 0 ? '+' : ''}
              {currentBalance}
              <span className="text-xs font-medium text-white/30 ml-0.5">mm</span>
            </div>
          )}
          <p className="text-[9px] text-white/20 mt-0.5">cumulatief 14 dagen</p>
        </div>
      </div>

      {/* Irrigation advice */}
      {needsIrrigation && (
        <div className="flex items-center gap-2 mb-4 rounded-xl bg-orange-500/10 border border-orange-500/20 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
          <span className="text-xs text-orange-300">
            Irrigatie overwegen — waterbalans onder -15 mm
          </span>
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div className="h-[220px] rounded-xl bg-white/[0.02] animate-pulse" />
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[220px] text-white/20 text-sm">
          <Droplets className="h-5 w-5 mr-2 opacity-40" />
          Geen dagelijkse data beschikbaar
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
              barGap={0}
              barCategoryGap="15%"
            >
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}`}
                width={35}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />

              {/* Today marker */}
              {chartData.some((d) => d.isToday) && (
                <ReferenceLine
                  x={chartData.find((d) => d.isToday)?.label}
                  stroke="rgba(255,255,255,0.15)"
                  strokeDasharray="3 3"
                  label={{
                    value: 'Vandaag',
                    position: 'top',
                    fill: 'rgba(255,255,255,0.3)',
                    fontSize: 9,
                  }}
                />
              )}

              {/* Precipitation bars (positive, blue) */}
              <Bar
                dataKey="precipitation"
                name="Neerslag"
                radius={[2, 2, 0, 0]}
                maxBarSize={12}
                isAnimationActive={false}
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.isForecast ? '#3b82f6' : '#60a5fa'}
                    fillOpacity={entry.isForecast ? 0.5 : 0.8}
                  />
                ))}
              </Bar>

              {/* ET0 bars (negative, orange/red) */}
              <Bar
                dataKey="et0Negative"
                name="Verdamping"
                radius={[0, 0, 2, 2]}
                maxBarSize={12}
                isAnimationActive={false}
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.isForecast ? '#f97316' : '#fb923c'}
                    fillOpacity={entry.isForecast ? 0.5 : 0.8}
                  />
                ))}
              </Bar>

              {/* Cumulative water balance line */}
              <Line
                type="monotone"
                dataKey="cumulativeBalance"
                name="Cumulatief"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
            <LegendItem color="#60a5fa" label="Neerslag" />
            <LegendItem color="#fb923c" label="Verdamping (ET0)" />
            <LegendItem color="#10b981" label="Cum. waterbalans" isLine />
            <span className="text-[9px] text-white/15 ml-auto">
              Licht = voorspelling
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: WaterBalanceDay }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]!.payload;

  return (
    <div className="rounded-xl bg-slate-900/95 border border-white/10 px-3 py-2 shadow-xl">
      <p className="text-[10px] font-semibold text-white/50 mb-1.5">
        {formatTooltipDate(data.date)}
        {data.isForecast && (
          <span className="ml-1.5 text-blue-400/60">(voorspelling)</span>
        )}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-blue-400">Neerslag</span>
          <span className="text-white font-medium tabular-nums">
            {data.precipitation} mm
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-orange-400">Verdamping</span>
          <span className="text-white font-medium tabular-nums">
            {data.et0} mm
          </span>
        </div>
        <div className="border-t border-white/10 pt-1 flex items-center justify-between gap-4">
          <span className="text-white/50">Dagbalans</span>
          <span
            className={`font-medium tabular-nums ${
              data.dailyBalance >= 0 ? 'text-emerald-400' : 'text-orange-400'
            }`}
          >
            {data.dailyBalance >= 0 ? '+' : ''}
            {data.dailyBalance} mm
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-emerald-400/70">Cumulatief</span>
          <span
            className={`font-bold tabular-nums ${
              data.cumulativeBalance >= 0 ? 'text-emerald-400' : 'text-orange-400'
            }`}
          >
            {data.cumulativeBalance >= 0 ? '+' : ''}
            {data.cumulativeBalance} mm
          </span>
        </div>
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
  isLine = false,
}: {
  color: string;
  label: string;
  isLine?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {isLine ? (
        <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
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
  const wd = WEEKDAYS[d.getDay()];
  return `${wd} ${d.getDate()}`;
}

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const wd = WEEKDAYS[d.getDay()];
  return `${wd} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
