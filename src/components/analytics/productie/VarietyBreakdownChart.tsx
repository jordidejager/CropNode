'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { Layers } from 'lucide-react';
import { getVarietyColor, type VarietyYearData } from '@/lib/analytics/production-calculations';

interface VarietyBreakdownChartProps {
  data: VarietyYearData[];
  varieties: string[];
  perHectare: boolean;
}

export function VarietyBreakdownChart({ data, varieties, perHectare }: VarietyBreakdownChartProps) {
  return (
    <ChartCard
      title="Verdeling per ras"
      isEmpty={data.length === 0 || varieties.length === 0}
      emptyIcon={Layers}
      emptyTitle="Geen rasdata"
      emptyDescription="Voeg productiedata toe met rasvermelding."
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis dataKey="harvestYear" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} axisLine={{ stroke: '#334155' }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => `${v} t`} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-white/10 bg-slate-900/95 px-4 py-3 shadow-xl backdrop-blur-xl">
                <p className="text-sm font-semibold text-slate-200 mb-1">Oogst {label}</p>
                {payload.filter((p: any) => Number(p.value) > 0).map((p: any) => (
                  <p key={p.dataKey} className="text-xs text-slate-400">
                    <span style={{ color: p.fill }}>●</span> {p.name}: {Number(p.value).toFixed(1)} ton
                  </p>
                ))}
              </div>
            );
          }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {varieties.map((variety, i) => (
            <Bar
              key={variety}
              dataKey={variety}
              name={variety}
              stackId="a"
              fill={getVarietyColor(i)}
              radius={i === varieties.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
