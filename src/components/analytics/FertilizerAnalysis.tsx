'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis } from 'recharts';
import { Sprout } from 'lucide-react';
import { ChartCard } from './shared/ChartCard';
import { type AnalyticsData } from '@/lib/analytics/types';
import { calculateParcelCosts } from '@/lib/analytics/calculations';

interface FertilizerAnalysisProps { data: AnalyticsData; }

export function FertilizerAnalysis({ data }: FertilizerAnalysisProps) {
  const fertilizerRegs = useMemo(() => data.registrations.filter((r) => r.registration_type === 'spreading' || r.products.some((p) => p.source === 'fertilizer')), [data.registrations]);
  const leafFeeding = useMemo(() => data.registrations.filter((r) => r.registration_type === 'spraying' && r.products.some((p) => p.source === 'fertilizer')), [data.registrations]);
  const spreading = useMemo(() => data.registrations.filter((r) => r.registration_type === 'spreading'), [data.registrations]);

  const parcelCosts = useMemo(() => {
    const leafCosts = calculateParcelCosts(leafFeeding, data.subParcels);
    const spreadCosts = calculateParcelCosts(spreading, data.subParcels);
    const combined = new Map<string, { parcelName: string; hectares: number; leafCostPerHa: number; spreadCostPerHa: number }>();

    leafCosts.forEach((c) => combined.set(c.parcelName, { parcelName: c.parcelName, hectares: c.hectares, leafCostPerHa: c.costPerHa, spreadCostPerHa: 0 }));
    spreadCosts.forEach((c) => { const e = combined.get(c.parcelName); if (e) e.spreadCostPerHa = c.costPerHa; else combined.set(c.parcelName, { parcelName: c.parcelName, hectares: c.hectares, leafCostPerHa: 0, spreadCostPerHa: c.costPerHa }); });
    return [...combined.values()].sort((a, b) => (b.leafCostPerHa + b.spreadCostPerHa) - (a.leafCostPerHa + a.spreadCostPerHa));
  }, [leafFeeding, spreading, data.subParcels]);

  const kgPerParcel = useMemo(() => {
    const map = new Map<string, { parcelName: string; totalKg: number; hectares: number }>();
    fertilizerRegs.forEach((reg) => {
      reg.plots.forEach((plot) => {
        if (!map.has(plot)) { const sp = data.subParcels.find((s) => s.name === plot); map.set(plot, { parcelName: plot, totalKg: 0, hectares: sp?.area || 1 }); }
        reg.products.forEach((p) => { if (p.unit === 'kg' || p.unit === 'L') map.get(plot)!.totalKg += p.dosage; });
      });
    });
    return [...map.values()].map((e) => ({ ...e, kgPerHa: e.hectares > 0 ? e.totalKg / e.hectares : 0 })).sort((a, b) => b.kgPerHa - a.kgPerHa);
  }, [fertilizerRegs, data.subParcels]);

  const timelineData = useMemo(() => {
    const parcels = [...new Set(fertilizerRegs.flatMap((r) => r.plots))];
    return fertilizerRegs.flatMap((reg) => reg.plots.map((plot) => ({ date: new Date(reg.date).getTime(), parcelIndex: parcels.indexOf(plot), parcelName: plot, product: reg.products.map((p) => p.product).join(', '), type: reg.registration_type === 'spreading' ? 'strooien' : 'bladvoeding' })));
  }, [fertilizerRegs]);

  const isEmpty = fertilizerRegs.length === 0;

  const tt = ({ active, payload }: any) => { if (!active || !payload?.length) return null; const d = payload[0].payload; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200">{d.parcelName}</p><p className="text-xs text-slate-400">{d.kgPerHa?.toFixed(1)} kg/ha</p></div>); };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Bemestingsanalyse</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Meststof per perceel (kg/ha)" isEmpty={kgPerParcel.length === 0} emptyIcon={Sprout} emptyTitle="Geen bemestingsdata" emptyDescription="Registreer bemestingen via Slimme Invoer." emptyCta={{ label: 'Naar Slimme Invoer', href: '/slimme-invoer' }}>
          <ResponsiveContainer width="100%" height={Math.max(200, kgPerParcel.length * 36)}>
            <BarChart data={kgPerParcel} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
              <YAxis type="category" dataKey="parcelName" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} width={80} />
              <Tooltip content={tt} />
              <Bar dataKey="kgPerHa" fill="#14b8a6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Bemestingskosten per hectare" isEmpty={parcelCosts.length === 0} emptyTitle="Geen kostendata" emptyDescription="Voeg productprijzen toe.">
          <ResponsiveContainer width="100%" height={Math.max(200, parcelCosts.length * 36)}>
            <BarChart data={parcelCosts} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => `€${v}`} />
              <YAxis type="category" dataKey="parcelName" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} width={80} />
              <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200">{d.parcelName}</p><p className="text-xs text-slate-400">Bladvoeding: €{d.leafCostPerHa.toFixed(0)}/ha</p><p className="text-xs text-slate-400">Strooien: €{d.spreadCostPerHa.toFixed(0)}/ha</p></div>); }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="leafCostPerHa" name="Bladvoeding" stackId="a" fill="#14b8a6" />
              <Bar dataKey="spreadCostPerHa" name="Strooien" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Bemestingstijdlijn" isEmpty={timelineData.length === 0} emptyTitle="Geen bemestingsdata" emptyDescription="Bemestingstijdlijn verschijnt zodra je registraties hebt.">
        <ResponsiveContainer width="100%" height={Math.max(200, timelineData.length > 0 ? new Set(timelineData.map(d => d.parcelName)).size * 40 + 60 : 200)}>
          <ScatterChart margin={{ left: 80, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis type="number" dataKey="date" domain={['dataMin', 'dataMax']} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => new Date(v).toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' })} />
            <YAxis type="number" dataKey="parcelIndex" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => { const p = [...new Set(fertilizerRegs.flatMap((r) => r.plots))]; return p[v] || ''; }} />
            <ZAxis range={[50, 50]} />
            <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200">{d.parcelName}</p><p className="text-xs text-slate-400">{new Date(d.date).toLocaleDateString('nl-NL')}</p><p className="text-xs text-slate-400">{d.product} ({d.type})</p></div>); }} />
            <Scatter data={timelineData.filter(d => d.type === 'bladvoeding')} fill="#14b8a6" name="Bladvoeding" />
            <Scatter data={timelineData.filter(d => d.type === 'strooien')} fill="#f59e0b" name="Strooien" />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}
