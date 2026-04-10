'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
interface SoilSummary {
  parcelName: string;
  variety: string;
  organischeStof: number | null;
  nLeverendVermogen: number | null;
  pPlantbeschikbaar: number | null;
}

interface SoilComparisonChartProps {
  summaries: SoilSummary[];
}

export function SoilComparisonChart({ summaries }: SoilComparisonChartProps) {
  const data = useMemo(() =>
    summaries.map((s) => ({
      name: s.parcelName.length > 12 ? s.parcelName.slice(0, 12) + '…' : s.parcelName,
      fullName: s.parcelName,
      variety: s.variety,
      'Org. stof (%)': s.organischeStof,
      'N-leverend (kg/ha)': s.nLeverendVermogen,
      'P-beschikbaar (kg/ha)': s.pPlantbeschikbaar,
    })),
    [summaries]
  );

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Bodemwaarden per perceel</h3>
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ left: 90, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            width={90}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
                  <p className="text-xs font-medium text-slate-200 mb-1">{d.fullName} ({d.variety})</p>
                  {payload.map((p: any) => (
                    <p key={p.dataKey} className="text-xs text-slate-400">
                      <span style={{ color: p.fill }}>●</span> {p.name}: {p.value !== null ? p.value.toFixed(1) : '—'}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Org. stof (%)" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="N-leverend (kg/ha)" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="P-beschikbaar (kg/ha)" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
