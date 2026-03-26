'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts';
import { Shield, ArrowUpDown } from 'lucide-react';
import { ChartCard } from './shared/ChartCard';
import { type AnalyticsData } from '@/lib/analytics/types';
import { calculateProductUsage, calculateParcelCosts } from '@/lib/analytics/calculations';

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
      <p className="text-xs font-medium text-slate-200">{d.product || d.parcelName}</p>
      {d.totalVolume !== undefined && <p className="text-xs text-slate-400">Volume: {d.totalVolume.toFixed(2)} {d.unit}</p>}
      {d.totalCost > 0 && <p className="text-xs text-slate-400">Kosten: €{d.totalCost.toLocaleString('nl-NL')}</p>}
    </div>
  );
};

interface CropProtectionAnalysisProps { data: AnalyticsData; }

export function CropProtectionAnalysis({ data }: CropProtectionAnalysisProps) {
  const [sortKey, setSortKey] = useState<'costPerHa' | 'treatmentCount' | 'totalCost'>('costPerHa');

  const sprayRegs = useMemo(() => data.registrations.filter((r) => r.registration_type === 'spraying'), [data.registrations]);
  const productUsage = useMemo(() => calculateProductUsage(sprayRegs).slice(0, 10), [sprayRegs]);

  const parcelCosts = useMemo(() => {
    const costs = calculateParcelCosts(sprayRegs, data.subParcels);
    return [...costs].sort((a, b) => sortKey === 'costPerHa' ? b.costPerHa - a.costPerHa : sortKey === 'treatmentCount' ? b.treatmentCount - a.treatmentCount : b.totalCost - a.totalCost);
  }, [sprayRegs, data.subParcels, sortKey]);

  const sprayStats = useMemo(() => {
    if (sprayRegs.length === 0) return null;
    const costs = sprayRegs.map((r) => ({ cost: r.products.reduce((sum, p) => sum + (p.unit_price || 0) * p.dosage, 0), product: r.products.map((p) => p.product).join(', '), date: r.date })).filter((c) => c.cost > 0);
    if (costs.length === 0) return null;
    const sorted = [...costs].sort((a, b) => a.cost - b.cost);
    return { avg: sorted.reduce((sum, c) => sum + c.cost, 0) / sorted.length, cheapest: sorted[0], mostExpensive: sorted[sorted.length - 1] };
  }, [sprayRegs]);

  const timelineData = useMemo(() => {
    const parcels = [...new Set(sprayRegs.flatMap((r) => r.plots))];
    return sprayRegs.flatMap((reg) => reg.plots.map((plot) => ({ date: new Date(reg.date).getTime(), parcelIndex: parcels.indexOf(plot), parcelName: plot, product: reg.products.map((p) => p.product).join(', ') })));
  }, [sprayRegs]);

  const isEmpty = sprayRegs.length === 0;

  const getQuartileColor = (index: number, total: number) => {
    if (total <= 1) return '';
    const q = index / total;
    if (q < 0.25) return 'bg-red-500/5 border-l-2 border-l-red-400/60';
    if (q > 0.75) return 'bg-emerald-500/5 border-l-2 border-l-emerald-400/60';
    return '';
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Middelenanalyse</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top 10 meest gebruikte middelen" isEmpty={isEmpty} emptyIcon={Shield} emptyTitle="Geen spuitregistraties" emptyDescription="Begin met registreren via Slimme Invoer." emptyCta={{ label: 'Naar Slimme Invoer', href: '/slimme-invoer' }}>
          <ResponsiveContainer width="100%" height={Math.max(200, productUsage.length * 36)}>
            <BarChart data={productUsage} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
              <YAxis type="category" dataKey="product" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} width={100} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="totalVolume" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Kosten per bespuiting" isEmpty={!sprayStats} emptyTitle="Geen prijsdata" emptyDescription="Voeg productprijzen toe om kosten per bespuiting te berekenen.">
          {sprayStats && (
            <div className="grid grid-cols-3 gap-4">
              {[{ label: 'Gemiddeld', value: sprayStats.avg, color: 'text-slate-100', detail: '' }, { label: 'Goedkoopst', value: sprayStats.cheapest.cost, color: 'text-emerald-400', detail: sprayStats.cheapest.product }, { label: 'Duurst', value: sprayStats.mostExpensive.cost, color: 'text-red-400', detail: sprayStats.mostExpensive.product }].map((s) => (
                <div key={s.label} className="flex flex-col items-center rounded-lg bg-white/[0.02] border border-white/5 p-4">
                  <span className={`text-xl font-semibold ${s.color}`}>€{s.value.toFixed(0)}</span>
                  <span className="text-xs text-slate-500 mt-1">{s.label}</span>
                  {s.detail && <span className="text-[10px] text-slate-600 mt-0.5 text-center truncate w-full">{s.detail}</span>}
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Middelenkosten per perceel" isEmpty={parcelCosts.length === 0}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-2 text-xs text-slate-500 font-semibold">Perceel</th>
                <th className="text-right py-2 text-xs text-slate-500 font-semibold">Ha</th>
                <th className="text-right py-2 text-xs text-slate-500 font-semibold cursor-pointer hover:text-slate-300" onClick={() => setSortKey('treatmentCount')}>
                  <span className="inline-flex items-center gap-1">Beh. <ArrowUpDown className="size-3" /></span>
                </th>
                <th className="text-right py-2 text-xs text-slate-500 font-semibold cursor-pointer hover:text-slate-300" onClick={() => setSortKey('totalCost')}>Kosten</th>
                <th className="text-right py-2 text-xs text-slate-500 font-semibold cursor-pointer hover:text-slate-300" onClick={() => setSortKey('costPerHa')}>€/ha</th>
              </tr>
            </thead>
            <tbody>
              {parcelCosts.map((row, i) => (
                <tr key={row.parcelId} className={`border-b border-white/[0.03] ${getQuartileColor(i, parcelCosts.length)}`}>
                  <td className="py-2 text-slate-200">{row.parcelName}</td>
                  <td className="py-2 text-right text-slate-400">{row.hectares.toFixed(2)}</td>
                  <td className="py-2 text-right text-slate-400">{row.treatmentCount}</td>
                  <td className="py-2 text-right text-slate-400">€{row.totalCost.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}</td>
                  <td className="py-2 text-right font-medium text-slate-200">€{row.costPerHa.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard title="Behandelingsfrequentie" isEmpty={timelineData.length === 0} emptyTitle="Geen behandelingen" emptyDescription="Behandelingsdata verschijnt zodra je registraties hebt.">
        <ResponsiveContainer width="100%" height={Math.max(200, timelineData.length > 0 ? new Set(timelineData.map(d => d.parcelName)).size * 40 + 60 : 200)}>
          <ScatterChart margin={{ left: 80, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis type="number" dataKey="date" domain={['dataMin', 'dataMax']} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => new Date(v).toLocaleDateString('nl-NL', { month: 'short', day: 'numeric' })} />
            <YAxis type="number" dataKey="parcelIndex" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => { const parcels = [...new Set(sprayRegs.flatMap((r) => r.plots))]; return parcels[v] || ''; }} />
            <ZAxis range={[40, 40]} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200">{d.parcelName}</p><p className="text-xs text-slate-400">{new Date(d.date).toLocaleDateString('nl-NL')}</p><p className="text-xs text-slate-400">{d.product}</p></div>);
            }} />
            <Scatter data={timelineData} fill="#10b981" />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}
