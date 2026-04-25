'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { useStationMeasurements } from '@/hooks/use-physical-stations';
import { cn } from '@/lib/utils';
import {
  LineChart as LineChartIcon,
  Activity,
  TrendingDown,
  TrendingUp,
  Minus,
  Clock,
} from 'lucide-react';

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
  short: string;
  unit: string;
  color: string;            // primary
  fillColor: string;        // gradient start
  bgZone?: { from: number; to: number; color: string; label: string };
  precision: number;
}

const METRIC_CONFIG: Record<MetricKey, MetricConfig> = {
  temperature: {
    label: 'Temperatuur',
    short: 'Temp',
    unit: '°C',
    color: '#fb923c',
    fillColor: '#fb923c',
    bgZone: { from: -10, to: 0, color: 'rgba(56, 189, 248, 0.08)', label: 'Vorst' },
    precision: 1,
  },
  humidity: {
    label: 'Luchtvochtigheid',
    short: 'RV',
    unit: '%',
    color: '#60a5fa',
    fillColor: '#60a5fa',
    precision: 0,
  },
  pressure: {
    label: 'Luchtdruk',
    short: 'Druk',
    unit: 'hPa',
    color: '#a78bfa',
    fillColor: '#a78bfa',
    precision: 0,
  },
  rain: {
    label: 'Neerslag',
    short: 'Regen',
    unit: 'mm',
    color: '#10b981',
    fillColor: '#10b981',
    precision: 1,
  },
  light: {
    label: 'Licht',
    short: 'Licht',
    unit: 'lux',
    color: '#fbbf24',
    fillColor: '#fbbf24',
    precision: 0,
  },
};

const METRIC_ORDER: MetricKey[] = ['temperature', 'humidity', 'pressure', 'rain', 'light'];

/**
 * Premium time-series chart for one CropNode physical weather station.
 * Selectable range + metric. Designed to read like an instrument-cluster:
 * a stats strip up top (min/avg/max/laatste) and a chart that overlays
 * gradient fills, reference lines for min/avg/max, climate zones and a
 * "nu" marker so it's instantly readable for a grower at a glance.
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
        label: formatLabel(m.measured_at, range),
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

  const stats = useMemo(() => computeStats(chartData, metric), [chartData, metric]);

  const cfg = METRIC_CONFIG[metric];
  const isEmpty = !isLoading && chartData.length === 0;
  const gradientId = `gradient-${metric}-${stationId.slice(0, 6)}`;

  const xTickFormatter = (value: number, index: number, total: number) => {
    if (chartData.length === 0) return '';
    // Smart skipping: too many ticks become unreadable
    const stride = Math.max(1, Math.ceil(total / 8));
    if (index % stride !== 0) return '';
    return formatLabel(new Date(value).toISOString(), range);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/10 p-5 relative overflow-hidden">
      {/* Subtle background glow tied to active metric */}
      <div
        className="absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-50 pointer-events-none"
        style={{ backgroundColor: cfg.color, opacity: 0.08 }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-xl border flex items-center justify-center"
              style={{
                backgroundColor: `${cfg.color}26`,
                borderColor: `${cfg.color}66`,
              }}
            >
              <LineChartIcon className="h-4.5 w-4.5" style={{ color: cfg.color }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Historie · {cfg.label}</h3>
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
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {METRIC_ORDER.map(k => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                metric === k
                  ? 'text-white border'
                  : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/80'
              )}
              style={
                metric === k
                  ? {
                      backgroundColor: `${METRIC_CONFIG[k].color}1F`,
                      borderColor: `${METRIC_CONFIG[k].color}55`,
                      boxShadow: `0 0 0 1px ${METRIC_CONFIG[k].color}33, inset 0 -2px 0 ${METRIC_CONFIG[k].color}`,
                    }
                  : undefined
              }
            >
              {METRIC_CONFIG[k].label}
            </button>
          ))}
        </div>

        {/* Stats strip — min / gem / max / laatste */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <StatTile
              icon={TrendingDown}
              label="Min"
              value={formatValue(stats.min, cfg.precision)}
              unit={cfg.unit}
              accent="text-sky-400"
            />
            <StatTile
              icon={Minus}
              label="Gem"
              value={formatValue(stats.avg, cfg.precision)}
              unit={cfg.unit}
              accent="text-white/60"
            />
            <StatTile
              icon={TrendingUp}
              label="Max"
              value={formatValue(stats.max, cfg.precision)}
              unit={cfg.unit}
              accent="text-orange-400"
            />
            <StatTile
              icon={Clock}
              label="Laatste"
              value={formatValue(stats.last, cfg.precision)}
              unit={cfg.unit}
              accent="text-emerald-400"
            />
          </div>
        )}

        {/* Chart */}
        <div className="h-[320px]">
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
              <ComposedChart
                data={chartData}
                margin={{ top: 16, right: 16, left: -8, bottom: 4 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cfg.fillColor} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={cfg.fillColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>

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
                  tickFormatter={(v: number) => formatLabel(new Date(v).toISOString(), range)}
                  minTickGap={40}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  unit={metric === 'rain' ? '' : ` ${cfg.unit === 'lux' ? '' : cfg.unit}`}
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

                {/* Climate zones (e.g. frost) */}
                {cfg.bgZone && (
                  <ReferenceLine
                    y={0}
                    stroke="rgba(56, 189, 248, 0.4)"
                    strokeDasharray="3 3"
                    label={{
                      value: '0°C',
                      position: 'insideTopRight',
                      fill: 'rgba(56, 189, 248, 0.6)',
                      fontSize: 10,
                    }}
                  />
                )}

                {/* Avg reference line */}
                {stats && stats.avg !== null && metric !== 'rain' && (
                  <ReferenceLine
                    y={stats.avg}
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeDasharray="2 4"
                    label={{
                      value: `gem ${formatValue(stats.avg, cfg.precision)}`,
                      position: 'left',
                      fill: 'rgba(255, 255, 255, 0.5)',
                      fontSize: 10,
                    }}
                  />
                )}

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
                    fillOpacity={0.65}
                    stroke={cfg.color}
                    strokeWidth={1}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                ) : (
                  <>
                    <Area
                      type="monotone"
                      dataKey={metric}
                      stroke="none"
                      fill={`url(#${gradientId})`}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={metric}
                      name={cfg.label}
                      stroke={cfg.color}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 5,
                        fill: cfg.color,
                        stroke: '#020617',
                        strokeWidth: 2,
                      }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </>
                )}

                {/* Dew point overlay on temperature chart */}
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

        {/* Footer legend */}
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
    </div>
  );
}

// ---- Stat tile ----

function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className={cn('h-3 w-3', accent)} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className={cn('text-base font-bold tabular-nums', accent)}>{value}</span>
        <span className="text-[10px] text-white/40">{unit}</span>
      </div>
    </div>
  );
}

// ---- Custom tooltip ----

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
    rows.push({
      label: 'Dauwpunt',
      value: `${p.dewPoint.toFixed(1)} °C`,
      color: '#60a5fa',
    });
    if (p.wetBulb !== null) {
      rows.push({
        label: 'Wet-bulb',
        value: `${p.wetBulb.toFixed(1)} °C`,
        color: '#94a3b8',
      });
    }
  }
  if (metric === 'humidity' && p.dewPoint !== null) {
    rows.push({
      label: 'Dauwpunt',
      value: `${p.dewPoint.toFixed(1)} °C`,
      color: '#60a5fa',
    });
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
    <div className="rounded-lg bg-slate-950/95 border border-white/10 shadow-2xl backdrop-blur-sm px-3 py-2.5 min-w-[170px]">
      <div className="text-[11px] font-semibold text-white/80 mb-1.5">{p.full}</div>
      <div className="space-y-1">
        {rows.length > 0 ? (
          rows.map(r => (
            <div key={r.label} className="flex items-center justify-between gap-3 text-[11px]">
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

function computeStats(
  data: Array<{
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    rain: number;
    light: number | null;
  }>,
  metric: MetricKey
): { min: number | null; max: number | null; avg: number | null; last: number | null } | null {
  if (data.length === 0) return null;
  const values = data
    .map(d => d[metric])
    .filter((v): v is number => v !== null && v !== undefined);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const lastVal = data[data.length - 1]?.[metric];
  return {
    min,
    max,
    avg,
    last: typeof lastVal === 'number' ? lastVal : null,
  };
}

function formatValue(v: number | null, precision: number): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000 && precision === 0) {
    return `${(v / 1000).toFixed(1)}k`;
  }
  return v.toFixed(precision);
}

function formatTooltipValue(v: number, cfg: MetricConfig): string {
  if (cfg.unit === 'lux' && v >= 1000) {
    return `${(v / 1000).toFixed(1)}k lux`;
  }
  return `${v.toFixed(cfg.precision)} ${cfg.unit}`;
}

function formatLabel(iso: string, range: RangeKey): string {
  const d = new Date(iso);
  if (range === '24h') {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '7d') {
    // Date + hour helps spot diurnal patterns within a week
    const day = d.toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${time}`;
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
