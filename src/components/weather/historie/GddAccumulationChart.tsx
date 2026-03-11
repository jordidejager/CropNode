'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { KnmiCumulativeData } from '@/lib/weather/knmi-service';

interface Props {
  data: KnmiCumulativeData[];
  compareData?: KnmiCumulativeData[];
  year: number;
  compareYear?: number;
}

export function GddAccumulationChart({ data, compareData, year, compareYear }: Props) {
  const [base, setBase] = useState<5 | 10>(5);

  const chartData = data.map((d, i) => ({
    dayOfYear: d.dayOfYear,
    date: d.date,
    gdd: base === 5 ? d.cumulativeGddBase5 : d.cumulativeGddBase10,
    cGdd: compareData?.[i]
      ? (base === 5 ? compareData[i]!.cumulativeGddBase5 : compareData[i]!.cumulativeGddBase10)
      : null,
  }));

  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm">
          Graaddagen (GDD) {year}
          {compareYear && <span className="text-white/40"> vs {compareYear}</span>}
        </h3>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          <button
            onClick={() => setBase(5)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              base === 5 ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40'
            }`}
          >
            Basis 5°C
          </button>
          <button
            onClick={() => setBase(10)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              base === 10 ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40'
            }`}
          >
            Basis 10°C
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <XAxis
            dataKey="dayOfYear"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={dayOfYearToMonth}
            interval={29}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={(v) => `${v}`}
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
            formatter={(value: number, name: string) => [
              `${value} GDD`,
              name === 'gdd' ? `${year}` : `${compareYear}`,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) =>
              value === 'gdd' ? `${year}` : `${compareYear}`
            }
          />
          <Line
            type="monotone"
            dataKey="gdd"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="gdd"
            isAnimationActive={false}
          />
          {compareYear && (
            <Line
              type="monotone"
              dataKey="cGdd"
              stroke="#6ee7b7"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="cGdd"
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function dayOfYearToMonth(doy: number): string {
  const d = new Date(2024, 0, 1);
  d.setDate(doy);
  return MONTHS[d.getMonth()] ?? '';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
