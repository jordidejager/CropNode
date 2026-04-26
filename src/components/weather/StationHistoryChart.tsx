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
} from 'recharts';
import { useStationMeasurements } from '@/hooks/use-physical-stations';
import { cn } from '@/lib/utils';
import { LineChart as LineChartIcon, Activity } from 'lucide-react';

interface Props {
  stationId: string;
}

type RangeKey = '24h' | '7d' | '30d' | '90d';
type MetricKey = 'temperature' | 'humidity' | 'pressure' | 'rain' | 'light';

const RANGE_LABELS: Record<RangeKey, string> = {
  '24h': '24 uur',
  '7d': '7 dagen',
  '30d': '30 dagen',
  '90d': '90 dagen',
};

interface MetricConfig {
  label: string;
  unit: string;
  color: string;
  precision: number;
}

const METRIC_CONFIG: Record<MetricKey, MetricConfig> = {
  temperature: { label: 'Temperatuur',     unit: '°C',  color: '#fb923c', precision: 1 },
  humidity:    { label: 'Luchtvochtigheid', unit: '%',   color: '#60a5fa', precision: 0 },
  pressure:    { label: 'Luchtdruk',        unit: 'hPa', color: '#a78bfa', precision: 0 },
  rain:        { label: 'Neerslag',         unit: 'mm',  color: '#10b981', precision: 1 },
  light:       { label: 'Licht',            unit: 'lux', color: '#fbbf24', precision: 0 },
};

const METRIC_ORDER: MetricKey[] = ['temperature', 'humidity', 'pressure', 'rain', 'light'];

/**
 * Time-series chart for one CropNode physical weather station.
 * Selectable range (24h / 7d / 30d / 90d) and metric. Single accent line
 * per chart with optional dew-point overlay on temperature. Dense tooltip
 * shows full date+time + relevant context per metric.
 */
export function StationHistoryChart({ stationId }: Props) {
  const [range, setRange] = useState<RangeKey>('7d');
  const [metric, setMetric] = useState<MetricKey>('temperature');

  const { data: measurements, isLoading } = useStationMeasurements(stationId, range);

  // Build chart-ready array (chronological order)
  const chartData = useMemo(() => {
    if (!measurements || measurements.length === 0) return [];
    return [...measurements]
      .reverse()
      .map(m => ({
        time: new Date(m.measured_at).getTime(),
        full: formatFullLabel(m.measured_at),
        temperature: m.temperature_c,
        humidity: m.humidity_pct,
        pressure: m.pressure_hpa,
        rain: m.rainfall_mm ?? 0,
        light: m.illuminance_lux,
        dewPoint: m.dew_point_c,
        wetBulb: m.wet_bulb_c,
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
        {METRIC_ORDER.map(k => (
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
              <p className="text-sm text-white/50">Geen metingen in deze periode</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatTick(new Date(v).toISOString(), range)}
                minTickGap={40}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={50}
                unit={metric === 'rain' || metric === 'light' ? '' : ` ${cfg.unit}`}
                tickFormatter={(v: number) =>
                  metric === 'light' && v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()
                }
                domain={
                  metric === 'rain'
                    ? [0, 'auto']
                    : metric === 'humidity'
                      ? [0, 100]
                      : ['auto', 'auto']
                }
              />
              <Tooltip
                content={<CustomTooltip metric={metric} cfg={cfg} />}
                cursor={{
                  stroke: cfg.color,
                  strokeWidth: 1,
                  strokeDasharray: '3 3',
                  strokeOpacity: 0.5,
                }}
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
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  type="monotone"
                  dataKey={metric}
                  name={cfg.label}
                  stroke={cfg.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: cfg.color, stroke: '#020617', strokeWidth: 2 }}
                  isAnimationActive={false}
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
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer legend (only meaningful with overlay) */}
      {!isEmpty && metric === 'temperature' && (
        <div className="mt-3 flex items-center gap-4 text-[11px] text-white/50">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded"
              style={{ backgroundColor: cfg.color }}
            />
            Temperatuur
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded border-t border-dashed border-sky-400" />
            Dauwpunt
          </span>
        </div>
      )}
    </div>
  );
}

// ---- Custom tooltip — full date+time + relevant context per metric ----

interface TooltipPayloadEntry {
  payload: {
    full: string;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    rain: number;
    light: number | null;
    dewPoint: number | null;
    wetBulb: number | null;
  };
}

function CustomTooltip({
  active,
  payload,
  metric,
  cfg,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  metric: MetricKey;
  cfg: MetricConfig;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!.payload;

  const primaryValue = p[metric];
  const rows: Array<{ label: string; value: string; color: string }> = [];

  if (primaryValue !== null && primaryValue !== undefined) {
    rows.push({
      label: cfg.label,
      value: formatTooltipValue(primaryValue, cfg),
      color: cfg.color,
    });
  }

  // Context fields per metric
  if (metric === 'temperature' && p.dewPoint !== null) {
    rows.push({ label: 'Dauwpunt', value: `${p.dewPoint.toFixed(1)} °C`, color: '#60a5fa' });
    if (p.wetBulb !== null) {
      rows.push({ label: 'Natte bol', value: `${p.wetBulb.toFixed(1)} °C`, color: '#94a3b8' });
    }
  }
  if (metric === 'humidity' && p.dewPoint !== null) {
    rows.push({ label: 'Dauwpunt', value: `${p.dewPoint.toFixed(1)} °C`, color: '#60a5fa' });
    if (p.temperature !== null) {
      rows.push({
        label: 'Temperatuur',
        value: `${p.temperature.toFixed(1)} °C`,
        color: '#fb923c',
      });
    }
  }
  if (metric === 'rain' && p.temperature !== null) {
    rows.push({
      label: 'Temperatuur',
      value: `${p.temperature.toFixed(1)} °C`,
      color: '#fb923c',
    });
  }

  return (
    <div className="rounded-lg bg-slate-950/95 border border-white/10 shadow-xl backdrop-blur-sm px-3 py-2.5 min-w-[170px]">
      <div className="text-[11px] font-semibold text-white/80 mb-1.5">{p.full}</div>
      <div className="space-y-1">
        {rows.length > 0 ? (
          rows.map(r => (
            <div
              key={r.label}
              className="flex items-center justify-between gap-3 text-[11px]"
            >
              <span className="inline-flex items-center gap-1.5 text-white/60">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                {r.label}
              </span>
              <span className="font-bold tabular-nums" style={{ color: r.color }}>
                {r.value}
              </span>
            </div>
          ))
        ) : (
          <span className="text-[11px] text-white/40">geen data</span>
        )}
      </div>
    </div>
  );
}

// ---- helpers ----

function formatTick(iso: string, range: RangeKey): string {
  const d = new Date(iso);
  if (range === '24h') {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '7d') {
    // Just the day on x-axis stays clean — full date+time in the tooltip.
    return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function formatFullLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTooltipValue(v: number, cfg: MetricConfig): string {
  if (cfg.unit === 'lux' && v >= 1000) {
    return `${(v / 1000).toFixed(1)}k lux`;
  }
  return `${v.toFixed(cfg.precision)} ${cfg.unit}`;
}
