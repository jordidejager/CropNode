'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { CloudRain, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStationMeasurements } from '@/hooks/use-physical-stations';
import {
  aggregateDailyRain,
  aggregateHourlyRainForDay,
  rainSinceMidnight,
  type DailyRain,
} from '@/lib/weather/daily-aggregation';

type RangeKey = '7d' | '30d';

const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': '7 dagen',
  '30d': '30 dagen',
};

/**
 * Daily rainfall totals for one station — the view a grower actually wants
 * ("how much rain per day"). Click a day's bar to expand the hourly breakdown
 * for that day. A big "vandaag tot nu toe" counter sits on top.
 */
export function DailyRainChart({
  stationId,
  stationLabel,
}: {
  stationId: string;
  stationLabel?: string;
}) {
  const [range, setRange] = useState<RangeKey>('7d');
  const [openDay, setOpenDay] = useState<string | null>(null);

  const { data: measurements, isLoading } = useStationMeasurements(stationId, range);

  const daily = useMemo(
    () => aggregateDailyRain(measurements ?? [], range === '7d' ? 7 : 30),
    [measurements, range]
  );
  const today = useMemo(() => rainSinceMidnight(measurements ?? []), [measurements]);
  const total = useMemo(
    () => Math.round(daily.reduce((s, d) => s + d.rainMm, 0) * 10) / 10,
    [daily]
  );

  const hourly = useMemo(
    () => (openDay ? aggregateHourlyRainForDay(measurements ?? [], openDay) : null),
    [measurements, openDay]
  );

  const maxRain = Math.max(...daily.map(d => d.rainMm), 1);

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-sky-500/15 flex items-center justify-center">
            <CloudRain className="h-4.5 w-4.5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Neerslag per dag</h3>
            <p className="text-xs text-white/40">
              {stationLabel ? `${stationLabel} · ` : ''}klik een dag voor uur-detail
            </p>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-white/5 border border-white/10 p-1">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map(r => (
            <button
              key={r}
              onClick={() => { setRange(r); setOpenDay(null); }}
              className={cn(
                'px-2.5 py-1 rounded text-[11px] font-semibold transition-colors',
                range === r
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'text-white/50 hover:text-white/80'
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Headline counters */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-sky-500/25 bg-gradient-to-br from-sky-500/15 to-transparent p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
            Vandaag tot nu toe
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-white tabular-nums">{today.toFixed(1)}</span>
            <span className="text-sm text-white/40">mm</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
            Totaal {RANGE_LABELS[range]}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-white tabular-nums">{total.toFixed(1)}</span>
            <span className="text-sm text-white/40">mm</span>
          </div>
        </div>
      </div>

      {/* Daily bars */}
      <div className="h-[220px]">
        {isLoading ? (
          <div className="h-full rounded-lg bg-white/5 animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={daily}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              onClick={(state) => {
                const payload = state?.activePayload?.[0]?.payload as DailyRain | undefined;
                if (payload) setOpenDay(prev => (prev === payload.date ? null : payload.date));
              }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  new Date(v).toLocaleDateString('nl-NL', {
                    weekday: range === '7d' ? 'short' : undefined,
                    day: 'numeric',
                    month: range === '30d' ? 'short' : undefined,
                  })
                }
                minTickGap={range === '30d' ? 24 : 8}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={36}
                domain={[0, 'auto']}
                unit=" mm"
              />
              <Tooltip content={<DailyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="rainMm" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {daily.map(d => (
                  <Cell
                    key={d.date}
                    cursor="pointer"
                    fill={
                      d.date === openDay
                        ? '#38bdf8'
                        : d.isToday
                          ? '#0ea5e9'
                          : `rgba(56,189,248,${0.35 + 0.5 * (d.rainMm / maxRain)})`
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Hourly drill-down for the selected day */}
      {openDay && hourly && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-xs font-bold text-white">
              {new Date(openDay + 'T00:00:00').toLocaleDateString('nl-NL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
            <span className="text-[11px] text-white/40">
              · {hourly.reduce((s, h) => s + h.rainMm, 0).toFixed(1)} mm totaal
            </span>
            <button
              onClick={() => setOpenDay(null)}
              className="ml-auto text-[11px] text-white/40 hover:text-white/70"
            >
              Sluiten
            </button>
          </div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="hour"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(h: number) => `${h}u`}
                  interval={1}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  domain={[0, 'auto']}
                />
                <Tooltip content={<HourlyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="rainMm" fill="#38bdf8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- tooltips ----

function DailyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DailyRain }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded-lg bg-slate-950/95 border border-white/10 shadow-xl px-3 py-2">
      <div className="text-[11px] font-semibold text-white/80 mb-0.5">
        {new Date(p.ts).toLocaleDateString('nl-NL', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        })}
      </div>
      <div className="text-sm font-bold text-sky-300">{p.rainMm.toFixed(1)} mm</div>
    </div>
  );
}

function HourlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { hour: number; rainMm: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded-lg bg-slate-950/95 border border-white/10 shadow-xl px-3 py-2">
      <div className="text-[11px] font-semibold text-white/80 mb-0.5">
        {String(p.hour).padStart(2, '0')}:00–{String((p.hour + 1) % 24).padStart(2, '0')}:00
      </div>
      <div className="text-sm font-bold text-sky-300">{p.rainMm.toFixed(1)} mm</div>
    </div>
  );
}
