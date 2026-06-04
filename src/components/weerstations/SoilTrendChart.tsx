'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStationMeasurements } from '@/hooks/use-physical-stations';
import { bulkEcToPoreWater } from '@/lib/weather/soil-ec';

type RangeKey = '24h' | '7d' | '30d';

const RANGE_LABELS: Record<RangeKey, string> = {
  '24h': '24 uur',
  '7d': '7 dagen',
  '30d': '30 dagen',
};

const MOISTURE_COLOR = '#38bdf8'; // sky
const EC_COLOR = '#10b981'; // emerald

/**
 * Soil sensor trend: soil moisture (%) and pore-water EC (mS/cm) on one chart
 * with a dual Y-axis. Lets a grower see how irrigation/rain (moisture, left)
 * and the salt/nutrient concentration (EC, right) move together over time.
 */
export function SoilTrendChart({
  stationId,
  stationLabel,
}: {
  stationId: string;
  stationLabel?: string;
}) {
  const [range, setRange] = useState<RangeKey>('7d');
  const { data: measurements, isLoading } = useStationMeasurements(stationId, range);

  const chartData = useMemo(() => {
    if (!measurements || measurements.length === 0) return [];
    return [...measurements]
      .reverse()
      .map(m => {
        const ecPwUsCm = bulkEcToPoreWater(m.soil_conductivity_us_cm, m.soil_moisture_pct);
        return {
          time: new Date(m.measured_at).getTime(),
          moisture: m.soil_moisture_pct,
          ec: ecPwUsCm !== null ? Math.round((ecPwUsCm / 1000) * 100) / 100 : null,
          soilTemp: m.soil_temp_c,
        };
      });
  }, [measurements]);

  const isEmpty = !isLoading && chartData.length === 0;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <Sprout className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Bodem: vocht &amp; EC</h3>
            <p className="text-xs text-white/40">
              {stationLabel ? `${stationLabel} · ` : ''}vocht en porie-water EC over tijd
            </p>
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

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-white/60">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: MOISTURE_COLOR }} />
          Bodemvocht (%)
        </span>
        <span className="inline-flex items-center gap-1.5 text-white/60">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: EC_COLOR }} />
          EC porie-water (mS/cm)
        </span>
      </div>

      {/* Chart */}
      <div className="h-[260px]">
        {isLoading ? (
          <div className="h-full rounded-lg bg-white/5 animate-pulse" />
        ) : isEmpty ? (
          <div className="h-full flex items-center justify-center text-sm text-white/40">
            Nog geen bodemmetingen in deze periode
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 4, left: -12, bottom: 0 }}>
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
                tickFormatter={(v: number) => formatTick(v, range)}
                minTickGap={40}
              />
              {/* Left axis: moisture */}
              <YAxis
                yAxisId="moisture"
                stroke={MOISTURE_COLOR}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={[0, 'auto']}
                unit="%"
              />
              {/* Right axis: EC */}
              <YAxis
                yAxisId="ec"
                orientation="right"
                stroke={EC_COLOR}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, 'auto']}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip content={<SoilTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeDasharray: '3 3' }} />
              <Line
                yAxisId="moisture"
                type="monotone"
                dataKey="moisture"
                name="Bodemvocht"
                stroke={MOISTURE_COLOR}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                yAxisId="ec"
                type="monotone"
                dataKey="ec"
                name="EC"
                stroke={EC_COLOR}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ---- helpers ----

function formatTick(v: number, range: RangeKey): string {
  const d = new Date(v);
  if (range === '24h') {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '7d') {
    return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function SoilTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { time: number; moisture: number | null; ec: number | null; soilTemp: number | null } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded-lg bg-slate-950/95 border border-white/10 shadow-xl px-3 py-2.5 min-w-[170px]">
      <div className="text-[11px] font-semibold text-white/80 mb-1.5">
        {new Date(p.time).toLocaleString('nl-NL', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
      <div className="space-y-1">
        {p.moisture !== null && (
          <Row color={MOISTURE_COLOR} label="Bodemvocht" value={`${p.moisture.toFixed(1)} %`} />
        )}
        {p.ec !== null && (
          <Row color={EC_COLOR} label="EC porie-water" value={`${p.ec.toFixed(2)} mS/cm`} />
        )}
        {p.soilTemp !== null && (
          <Row color="#fb923c" label="Bodemtemp" value={`${p.soilTemp.toFixed(1)} °C`} />
        )}
      </div>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="inline-flex items-center gap-1.5 text-white/60">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
