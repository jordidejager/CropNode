'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { Map } from 'lucide-react';
import type { ParcelProductionRow } from '@/lib/analytics/production-calculations';

interface ParcelProductionChartProps {
  data: ParcelProductionRow[];
  year: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
  perHectare: boolean;
}

export function ParcelProductionChart({ data, year, availableYears, onYearChange, perHectare }: ParcelProductionChartProps) {
  return (
    <ChartCard
      title="Productie per perceel"
      isEmpty={data.length === 0}
      emptyIcon={Map}
      emptyTitle="Geen perceeldata"
      emptyDescription="Voeg productiedata toe met perceelvermelding."
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-500">{perHectare ? 'kg per hectare' : 'totaal in kg'}</span>
        <select
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>Oogst {y}</option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => perHectare ? v.toLocaleString('nl-NL') : `${(v / 1000).toFixed(0)}t`} />
          <YAxis type="category" dataKey="parcelName" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#334155' }} width={100} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="rounded-lg border border-white/10 bg-slate-900/95 px-4 py-3 shadow-xl backdrop-blur-xl">
                <p className="text-sm font-semibold text-slate-200">{d.parcelName}</p>
                <p className="text-xs text-slate-400">{d.variety}</p>
                <p className="text-xs text-slate-400">{d.kgPerHa.toLocaleString('nl-NL')} kg/ha</p>
                <p className="text-xs text-slate-400">{(d.totalKg / 1000).toFixed(1)} ton totaal</p>
              </div>
            );
          }} />
          <Bar dataKey={perHectare ? 'kgPerHa' : 'totalKg'} fill="#10b981" radius={[0, 6, 6, 0]} barSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
