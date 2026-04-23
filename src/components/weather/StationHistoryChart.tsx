'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useStationMeasurements } from '@/hooks/use-physical-stations';
import { cn } from '@/lib/utils';
import { LineChart as LineChartIcon, Activity } from 'lucide-react';

interface Props {
  stationId: string;
}

type RangeKey = '24h' | '7d' | '30d' | '90d';
type MetricKey = 'temperature' | 'humidity' | 'pressure' | 'rain';

const RANGE_LABELS: Record<RangeKey, string> = {
  '24h': '24 uur',
  '7d': '7 dagen',
  '30d': '30 dagen',
  '90d': '90 dagen',
};

const METRIC_CONFIG: Record<
  MetricKey,
  { label: string; color: string; unit: string }
> = {
  temperature: { label: 'Temperatuur', color: '#fb923c', unit: '°C' },
  humidity: { label: 'Luchtvochtigheid', color: '#60a5fa', unit: '%' },
  pressure: { label: 'Luchtdruk', color: '#a78bfa', unit: 'hPa' },
  rain: { label: 'Neerslag', color: '#10b981', unit: 'mm' },
};

/**
 * History chart for one physical weather station. Shows observed measurements
 * with selectable metric and time-range. Designed to fit in the Seizoen or
 * Dashboard tab of Weather Hub.
 */
export function StationHistoryChart({ stationId }: Props) {
  const [range, setRange] = useState<RangeKey>('7d');
  const [metric, setMetric] = useState<MetricKey>('temperature');

  const { data: measurements, isLoading } = useStationMeasurements(stationId, range);

  const chartData = useMemo(() => {
    if (!measurements || measurements.length === 0) return [];
    // measurements are newest-first; reverse for chronological plotting
    return [...measurements]
      .reverse()
      .map(m => ({
        time: new Date(m.measured_at).getTime(),
        label: formatLabel(m.measured_at, range),
        temperature: m.temperature_c,
        humidity: m.humidity_pct,
        pressure: m.pressure_hpa,
        rain: m.rainfall_mm ?? 0,
        dewPoint: m.dew_point_c,
      }));
  }, [measurements, range]);

  const cfg = METRIC_CONFIG[metric];
  const isEmpty = !isLoading && chartData.length === 0;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <LineChartIcon className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Historie</h3>
            <p className="text-xs text-white/40">Sensor-metingen van je weerstation</p>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-white/5 border border-white/10 p-1">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors',
                range === r
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-white/50 hover:text-white/80'
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(Object.keys(METRIC_CONFIG) as MetricKey[]).map(k => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              metric === k
                ? 'bg-white/10 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10'
            )}
            style={
              metric === k
                ? { boxShadow: `inset 0 -2px 0 ${METRIC_CONFIG[k].color}` }
                : undefined
            }
          >
            {METRIC_CONFIG[k].label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[280px]">
        {isLoading ? (
          <div className="h-full rounded-lg bg-white/5 animate-pulse" />
        ) : isEmpty ? (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <Activity className="h-8 w-8 text-white/20 mx-auto mb-2" />
              <p className="text-sm text-white/50">
                Geen metingen in deze periode
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                unit={` ${cfg.unit}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#020617',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
                formatter={(value: number) => [
                  value === null ? '—' : `${value.toFixed(1)} ${cfg.unit}`,
                  cfg.label,
                ]}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
              />
              {metric === 'rain' ? (
                <Bar
                  dataKey={metric}
                  name={cfg.label}
                  fill={cfg.color}
                  fillOpacity={0.6}
                  stroke={cfg.color}
                  strokeWidth={1}
                  radius={[4, 4, 0, 0]}
                />
              ) : (
                <Line
                  type="monotone"
                  dataKey={metric}
                  name={cfg.label}
                  stroke={cfg.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              )}
              {metric === 'temperature' && (
                <Line
                  type="monotone"
                  dataKey="dewPoint"
                  name="Dauwpunt"
                  stroke="#60a5fa"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ---- helpers ----

function formatLabel(iso: string, range: RangeKey): string {
  const d = new Date(iso);
  if (range === '24h') {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '7d') {
    return d.toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
