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
  Legend,
} from 'recharts';
import type { KnmiDailyData } from '@/lib/weather/knmi-service';

interface Props {
  data: KnmiDailyData[];
  compareData?: KnmiDailyData[];
  year: number;
  compareYear?: number;
}

export function PrecipitationHistoryChart({ data, compareData, year, compareYear }: Props) {
  const chartData = useMemo(() => {
    let cumPrimary = 0;
    let cumCompare = 0;

    const map = new Map<string, Record<string, number | null | string>>();

    for (const d of data) {
      const mmdd = d.date.substring(5);
      cumPrimary += d.precipitationSum ?? 0;
      map.set(mmdd, {
        date: mmdd,
        precip: d.precipitationSum,
        cumPrecip: Math.round(cumPrimary * 10) / 10,
      });
    }

    if (compareData) {
      for (const d of compareData) {
        const mmdd = d.date.substring(5);
        cumCompare += d.precipitationSum ?? 0;
        const existing = map.get(mmdd) || { date: mmdd };
        map.set(mmdd, {
          ...existing,
          cPrecip: d.precipitationSum,
          cCumPrecip: Math.round(cumCompare * 10) / 10,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string)
    );
  }, [data, compareData]);

  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
      <h3 className="text-white font-semibold text-sm mb-4">
        Neerslag {year}
        {compareYear && <span className="text-white/40"> vs {compareYear}</span>}
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={(v) => {
              const [m] = (v as string).split('-');
              return MONTHS[parseInt(m!, 10) - 1] ?? '';
            }}
            interval={29}
          />
          <YAxis
            yAxisId="daily"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={(v) => `${v}mm`}
          />
          <YAxis
            yAxisId="cumulative"
            orientation="right"
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
            tickFormatter={(v) => `${v}mm`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(24,24,27,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => {
              const label = PRECIP_LABELS[name] ?? name;
              return [value !== null ? `${value} mm` : '—', label];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => PRECIP_LABELS[value] ?? value}
          />

          {/* Daily bars */}
          <Bar
            yAxisId="daily"
            dataKey="precip"
            fill="#3b82f6"
            fillOpacity={0.6}
            name="precip"
            maxBarSize={4}
          />

          {/* Cumulative line */}
          <Line
            yAxisId="cumulative"
            type="monotone"
            dataKey="cumPrecip"
            stroke="#1d4ed8"
            strokeWidth={2}
            dot={false}
            name="cumPrecip"
          />

          {/* Compare cumulative */}
          {compareYear && (
            <Line
              yAxisId="cumulative"
              type="monotone"
              dataKey="cCumPrecip"
              stroke="#60a5fa"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="cCumPrecip"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const PRECIP_LABELS: Record<string, string> = {
  precip: 'Dagelijks',
  cumPrecip: 'Cumulatief',
  cCumPrecip: 'Cumulatief (vergelijk)',
};
