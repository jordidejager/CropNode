'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
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

export function TemperatureHistoryChart({ data, compareData, year, compareYear }: Props) {
  const chartData = useMemo(() => {
    const map = new Map<string, Record<string, number | null | string>>();

    // Primary year data
    for (const d of data) {
      const mmdd = d.date.substring(5); // MM-DD
      map.set(mmdd, {
        date: mmdd,
        label: formatDate(d.date),
        tempMin: d.tempMinC,
        tempMax: d.tempMaxC,
        tempAvg: d.tempAvgC,
      });
    }

    // Compare year data
    if (compareData) {
      for (const d of compareData) {
        const mmdd = d.date.substring(5);
        const existing = map.get(mmdd) || { date: mmdd, label: formatDate(d.date) };
        map.set(mmdd, {
          ...existing,
          cTempMin: d.tempMinC,
          cTempMax: d.tempMaxC,
          cTempAvg: d.tempAvgC,
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
        Temperatuur {year}
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
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={(v) => `${v}°`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(24,24,27,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(v) => v}
            formatter={(value: number, name: string) => {
              const label = TEMP_LABELS[name] ?? name;
              return [value !== null ? `${value}°C` : '—', label];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => TEMP_LABELS[value] ?? value}
          />

          {/* Primary year: area between min and max */}
          <Area
            type="monotone"
            dataKey="tempMax"
            stroke="none"
            fill="#ef4444"
            fillOpacity={0.1}
            stackId="range"
            name="tempMax"
          />
          <Area
            type="monotone"
            dataKey="tempMin"
            stroke="none"
            fill="#ffffff"
            fillOpacity={0}
            stackId="range"
            name="tempMin"
          />
          <Line
            type="monotone"
            dataKey="tempAvg"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name="tempAvg"
          />

          {/* Compare year */}
          {compareYear && (
            <Line
              type="monotone"
              dataKey="cTempAvg"
              stroke="#60a5fa"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="cTempAvg"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const TEMP_LABELS: Record<string, string> = {
  tempMin: 'Minimum',
  tempMax: 'Maximum',
  tempAvg: 'Gemiddeld',
  cTempAvg: 'Gemiddeld (vergelijk)',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
