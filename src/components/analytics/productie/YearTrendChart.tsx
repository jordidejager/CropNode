'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { TrendingUp } from 'lucide-react';
import type { YearTrend } from '@/lib/analytics/production-calculations';

interface YearTrendChartProps {
  data: YearTrend[];
  perHectare: boolean;
}

export function YearTrendChart({ data, perHectare }: YearTrendChartProps) {
  return (
    <ChartCard
      title="Productie per oogstjaar"
      isEmpty={data.length === 0}
      emptyIcon={TrendingUp}
      emptyTitle="Geen productiedata"
      emptyDescription="Voeg historische oogstdata toe om trends te zien."
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis dataKey="harvestYear" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} axisLine={{ stroke: '#334155' }} />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickFormatter={(v) => perHectare ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            label={{ value: perHectare ? 'kg/ha' : 'ton', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 11 } }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickFormatter={(v) => perHectare ? `${v}` : `${(v / 1000).toFixed(0)}k`}
            label={{ value: perHectare ? 'ton' : 'kg/ha', angle: 90, position: 'insideRight', style: { fill: '#64748b', fontSize: 11 } }}
          />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-white/10 bg-slate-900/95 px-4 py-3 shadow-xl backdrop-blur-xl">
                <p className="text-sm font-semibold text-slate-200 mb-1">Oogst {label}</p>
                {payload.map((p: any) => (
                  <p key={p.dataKey} className="text-xs text-slate-400">
                    {p.name}: {p.dataKey === 'totalTon' ? `${p.value.toFixed(1)} ton` : `${Math.round(p.value).toLocaleString('nl-NL')} kg/ha`}
                  </p>
                ))}
              </div>
            );
          }} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 500 }} />
          <Bar
            yAxisId={perHectare ? 'right' : 'left'}
            dataKey={perHectare ? 'totalKgPerHa' : 'totalTon'}
            name={perHectare ? 'Gem. kg/ha' : 'Totaal (ton)'}
            fill="#10b981"
            radius={[6, 6, 0, 0]}
            barSize={40}
          />
          <Line
            yAxisId={perHectare ? 'left' : 'right'}
            type="monotone"
            dataKey={perHectare ? 'totalTon' : 'totalKgPerHa'}
            name={perHectare ? 'Totaal (ton)' : 'Gem. kg/ha'}
            stroke="#f59e0b"
            strokeWidth={2.5}
            dot={{ fill: '#f59e0b', r: 5, strokeWidth: 2, stroke: '#020617' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
