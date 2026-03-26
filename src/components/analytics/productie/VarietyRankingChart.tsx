'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { Award } from 'lucide-react';
import type { VarietyRanking } from '@/lib/analytics/production-calculations';

interface VarietyRankingChartProps {
  data: VarietyRanking[];
  perHectare: boolean;
}

export function VarietyRankingChart({ data, perHectare }: VarietyRankingChartProps) {
  return (
    <ChartCard
      title="Ranking per ras"
      isEmpty={data.length === 0}
      emptyIcon={Award}
      emptyTitle="Geen rasdata"
      emptyDescription="Voeg productiedata met rasvermelding toe."
    >
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 45)}>
        <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => perHectare ? v.toLocaleString('nl-NL') : `${(v / 1000).toFixed(0)}t`} />
          <YAxis type="category" dataKey="variety" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} axisLine={{ stroke: '#334155' }} width={100} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="rounded-lg border border-white/10 bg-slate-900/95 px-4 py-3 shadow-xl backdrop-blur-xl">
                <p className="text-sm font-semibold text-slate-200">{d.variety}</p>
                <p className="text-xs text-slate-400">Gem: {d.avgKgPerHa.toLocaleString('nl-NL')} kg/ha</p>
                <p className="text-xs text-slate-400">Totaal: {(d.totalKg / 1000).toFixed(1)} ton</p>
                <p className="text-xs text-slate-400">{d.yearCount} jaar(en) data</p>
              </div>
            );
          }} />
          <Bar dataKey={perHectare ? 'avgKgPerHa' : 'totalKg'} fill="#14b8a6" radius={[0, 6, 6, 0]} barSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
