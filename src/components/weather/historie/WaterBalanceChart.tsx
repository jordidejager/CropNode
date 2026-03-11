'use client';

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import type { KnmiCumulativeData } from '@/lib/weather/knmi-service';

interface Props {
  data: KnmiCumulativeData[];
  compareData?: KnmiCumulativeData[];
  year: number;
  compareYear?: number;
}

export function WaterBalanceChart({ data, compareData, year, compareYear }: Props) {
  const chartData = data.map((d, i) => ({
    dayOfYear: d.dayOfYear,
    date: d.date,
    precip: d.cumulativePrecipitation,
    et0: d.cumulativeEt0,
    balance: d.waterBalance,
    cBalance: compareData?.[i]?.waterBalance ?? null,
  }));

  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
      <h3 className="text-white font-semibold text-sm mb-4">
        Waterbalans {year}
        {compareYear && <span className="text-white/40"> vs {compareYear}</span>}
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <XAxis
            dataKey="dayOfYear"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={dayOfYearToMonth}
            interval={29}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={(v) => `${v}mm`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(24,24,27,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(v, payload) => {
              const item = payload?.[0]?.payload;
              return item?.date ? formatDate(item.date) : `Dag ${v}`;
            }}
            formatter={(value: number, name: string) => {
              const label = LABELS[name] ?? name;
              return [`${Math.round(value * 10) / 10} mm`, label];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => LABELS[value] ?? value}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />

          {/* Precipitation cumulative */}
          <Line
            type="monotone"
            dataKey="precip"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            name="precip"
            isAnimationActive={false}
          />

          {/* ET0 cumulative */}
          <Line
            type="monotone"
            dataKey="et0"
            stroke="#ef4444"
            strokeWidth={1.5}
            dot={false}
            name="et0"
            isAnimationActive={false}
          />

          {/* Water balance area */}
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#10b981"
            strokeWidth={2}
            fill="#10b981"
            fillOpacity={0.15}
            name="balance"
            isAnimationActive={false}
          />

          {/* Compare balance */}
          {compareYear && (
            <Line
              type="monotone"
              dataKey="cBalance"
              stroke="#6ee7b7"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="cBalance"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex gap-4 mt-3 text-xs text-white/40">
        <span>Positief = overschot (groen)</span>
        <span>Negatief = tekort (droog)</span>
      </div>
    </div>
  );
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const LABELS: Record<string, string> = {
  precip: 'Cum. neerslag',
  et0: 'Cum. verdamping (ET0)',
  balance: 'Waterbalans',
  cBalance: `Waterbalans (vergelijk)`,
};

function dayOfYearToMonth(doy: number): string {
  const d = new Date(2024, 0, 1);
  d.setDate(doy);
  return MONTHS[d.getMonth()] ?? '';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
