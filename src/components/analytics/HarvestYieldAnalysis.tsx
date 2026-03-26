'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from 'recharts';
import { Apple, Award, AlertTriangle } from 'lucide-react';
import { ChartCard } from './shared/ChartCard';
import { type AnalyticsData } from '@/lib/analytics/types';
import { calculateHarvestPerParcel, calculateHarvestPerVariety, calculateParcelCosts } from '@/lib/analytics/calculations';

interface HarvestYieldAnalysisProps { data: AnalyticsData; }

export function HarvestYieldAnalysis({ data }: HarvestYieldAnalysisProps) {
  const harvestPerParcel = useMemo(() => calculateHarvestPerParcel(data.harvests, data.subParcels), [data.harvests, data.subParcels]);
  const harvestPerVariety = useMemo(() => calculateHarvestPerVariety(data.harvests, data.subParcels), [data.harvests, data.subParcels]);

  const costBenefitData = useMemo(() => {
    const costs = calculateParcelCosts(data.registrations, data.subParcels);
    return harvestPerParcel.map((h) => {
      const c = costs.find((cc) => cc.parcelName === h.parcelName || cc.parcelId === h.parcelId);
      return { parcelName: h.parcelName, totalCost: c?.totalCost || 0, kgPerHa: h.kgPerHa, costsPerTon: h.totalKg > 0 && c ? (c.totalCost / (h.totalKg / 1000)) : 0 };
    }).sort((a, b) => a.costsPerTon - b.costsPerTon);
  }, [harvestPerParcel, data.registrations, data.subParcels]);

  const bestParcels = useMemo(() => costBenefitData.filter(d => d.costsPerTon > 0).slice(0, 3), [costBenefitData]);
  const worstParcels = useMemo(() => costBenefitData.filter(d => d.costsPerTon > 0).slice(-3).reverse(), [costBenefitData]);

  const qualityData = useMemo(() => harvestPerParcel.filter((h) => h.qualityBreakdown && h.totalCrates > 0).map((h) => { const t = h.totalCrates; const q = h.qualityBreakdown!; return { parcelName: h.parcelName, 'Klasse I': (q.klasseI / t) * 100, 'Klasse II': (q.klasseII / t) * 100, 'Industrie': (q.industrie / t) * 100 }; }), [harvestPerParcel]);

  const isEmpty = data.harvests.length === 0;

  const tt = ({ active, payload }: any) => { if (!active || !payload?.length) return null; const d = payload[0].payload; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200">{d.parcelName || d.variety} {d.variety && d.parcelName ? `(${d.variety})` : ''}</p>{d.kgPerHa !== undefined && <p className="text-xs text-slate-400">{d.kgPerHa?.toLocaleString('nl-NL')} kg/ha</p>}{d.avgKgPerHa !== undefined && <p className="text-xs text-slate-400">Gem: {d.avgKgPerHa?.toLocaleString('nl-NL')} kg/ha</p>}</div>); };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Oogst & Opbrengst</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Opbrengst per perceel (kg/ha)" isEmpty={isEmpty} emptyIcon={Apple} emptyTitle="Geen oogstdata" emptyDescription="Registreer je eerste oogst om opbrengstcijfers te zien.">
          <ResponsiveContainer width="100%" height={Math.max(200, harvestPerParcel.length * 36)}>
            <BarChart data={harvestPerParcel} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
              <YAxis type="category" dataKey="parcelName" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} width={80} />
              <Tooltip content={tt} />
              <Bar dataKey="kgPerHa" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Opbrengst per ras" isEmpty={harvestPerVariety.length === 0} emptyTitle="Geen rasdata" emptyDescription="Oogstdata per ras wordt zichtbaar na registraties.">
          <ResponsiveContainer width="100%" height={Math.max(200, harvestPerVariety.length * 50)}>
            <BarChart data={harvestPerVariety} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
              <YAxis type="category" dataKey="variety" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} width={80} />
              <Tooltip content={tt} />
              <Bar dataKey="avgKgPerHa" name="Gem. kg/ha" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {qualityData.length > 0 && (
        <ChartCard title="Kwaliteitsverdeling">
          <ResponsiveContainer width="100%" height={Math.max(200, qualityData.length * 36)}>
            <BarChart data={qualityData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="parcelName" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Klasse I" stackId="a" fill="#10b981" />
              <Bar dataKey="Klasse II" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Industrie" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard title="Kosten-batenratio per perceel" isEmpty={costBenefitData.length === 0 || (costBenefitData.every(d => d.totalCost === 0) && isEmpty)} emptyTitle="Onvoldoende data" emptyDescription="Zowel kosten- als oogstdata nodig.">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={costBenefitData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis dataKey="parcelName" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip content={({ active, payload, label }) => { if (!active || !payload) return null; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200 mb-1">{label}</p>{payload.map((p: any) => <p key={p.dataKey} className="text-xs text-slate-400">{p.name}: {p.dataKey === 'totalCost' ? `€${p.value.toLocaleString('nl-NL')}` : `${p.value.toLocaleString('nl-NL')} kg/ha`}</p>)}</div>); }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="totalCost" name="Inputkosten (€)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="kgPerHa" name="Opbrengst (kg/ha)" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {(bestParcels.length > 0 || worstParcels.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChartCard title="Top 3 meest rendabel" isEmpty={bestParcels.length === 0}>
            <div className="space-y-3">
              {bestParcels.map((p, i) => (
                <div key={p.parcelName} className="flex items-center gap-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-bold">{i + 1}</div>
                  <div className="flex-1"><p className="text-sm font-medium text-slate-200">{p.parcelName}</p><p className="text-xs text-slate-400">€{p.costsPerTon.toFixed(0)}/ton · {p.kgPerHa.toLocaleString('nl-NL')} kg/ha</p></div>
                  <Award className="size-4 text-emerald-400" />
                </div>
              ))}
            </div>
          </ChartCard>
          <ChartCard title="Top 3 minst rendabel" isEmpty={worstParcels.length === 0}>
            <div className="space-y-3">
              {worstParcels.map((p, i) => (
                <div key={p.parcelName} className="flex items-center gap-3 rounded-lg bg-red-500/5 border border-red-500/10 p-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-sm font-bold">{i + 1}</div>
                  <div className="flex-1"><p className="text-sm font-medium text-slate-200">{p.parcelName}</p><p className="text-xs text-slate-400">€{p.costsPerTon.toFixed(0)}/ton · {p.kgPerHa.toLocaleString('nl-NL')} kg/ha</p></div>
                  <AlertTriangle className="size-4 text-red-400" />
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}
    </section>
  );
}
