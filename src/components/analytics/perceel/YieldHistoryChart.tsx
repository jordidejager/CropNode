'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { YearlyYield } from '@/lib/analytics/perceel/types';

export function YieldHistoryChart({ yields, peerAvg }: { yields: YearlyYield[]; peerAvg?: number }) {
  if (yields.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-6 text-center text-sm text-slate-500">
        Geen productiegeschiedenis beschikbaar. Voeg data toe via Oogst & Opslag › Geschiedenis.
      </div>
    );
  }

  const data = yields.map((y) => ({
    year: String(y.harvestYear),
    kgPerHa: Math.round(y.kgPerHa),
    klasseIPct: y.klasseIPct != null ? Math.round(y.klasseIPct) : null,
    peer: peerAvg ? Math.round(peerAvg) : null,
  }));

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">Opbrengst over de jaren</h3>
        {peerAvg && peerAvg > 0 && (
          <span className="text-[10px] text-slate-500">
            Peer-gemiddelde zelfde ras: {Math.round(peerAvg).toLocaleString('nl-NL')} kg/ha
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
          <YAxis yAxisId="kg" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
                  <div className="text-xs font-medium text-slate-200 mb-1">{label}</div>
                  {payload.map((p: any) => (
                    <div key={p.dataKey} className="text-xs text-slate-400">
                      {p.name}: {p.dataKey === 'klasseIPct' ? `${p.value}%` : `${p.value.toLocaleString('nl-NL')} kg/ha`}
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="kg" dataKey="kgPerHa" name="kg/ha" fill="#10b981" radius={[4, 4, 0, 0]} />
          {peerAvg && peerAvg > 0 && (
            <Line yAxisId="kg" dataKey="peer" name="Peer gem." stroke="#64748b" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
          )}
          <Line yAxisId="pct" dataKey="klasseIPct" name="% Klasse I" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
