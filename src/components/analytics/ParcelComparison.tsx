'use client';

import { useMemo, useState } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { GitCompare } from 'lucide-react';
import { ChartCard } from './shared/ChartCard';
import { type AnalyticsData } from '@/lib/analytics/types';
import { calculateParcelComparison, normalizeForRadar } from '@/lib/analytics/calculations';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

interface ParcelComparisonProps { data: AnalyticsData; }

export function ParcelComparison({ data }: ParcelComparisonProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const allNames = useMemo(() => [...new Set([...data.subParcels.map((s) => s.name), ...data.registrations.flatMap((r) => r.plots)])].sort(), [data.subParcels, data.registrations]);

  const comparisonData = useMemo(() => selected.length < 2 ? [] : calculateParcelComparison(data.registrations, data.harvests, data.subParcels, selected), [selected, data]);
  const radarData = useMemo(() => normalizeForRadar(comparisonData), [comparisonData]);

  const chartData = useMemo(() => {
    if (radarData.length === 0) return [];
    return radarData[0].axes.map((a, i) => {
      const point: any = { axis: a.axis };
      radarData.forEach((p) => { point[p.parcel] = p.axes[i].value; });
      return point;
    });
  }, [radarData]);

  const toggle = (name: string) => setSelected((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : prev.length >= 4 ? prev : [...prev, name]);

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Perceelsvergelijking</h2>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-wider">Selecteer 2-4 percelen om te vergelijken</p>
        <div className="flex flex-wrap gap-2">
          {allNames.map((name) => {
            const isSelected = selected.includes(name);
            const ci = selected.indexOf(name);
            return (
              <button key={name} onClick={() => toggle(name)} disabled={!isSelected && selected.length >= 4}
                className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${isSelected ? 'text-white font-medium' : selected.length >= 4 ? 'bg-white/5 text-slate-600 cursor-not-allowed opacity-50' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                style={isSelected ? { backgroundColor: COLORS[ci] + '30', border: `1px solid ${COLORS[ci]}60` } : {}}>
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {selected.length >= 2 ? (
        <>
          <ChartCard title="Vergelijkingstabel">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/5">
                  <th className="text-left py-2 text-xs text-slate-500 font-semibold">Kenmerk</th>
                  {comparisonData.map((p, i) => <th key={p.parcelId} className="text-right py-2 text-xs font-medium" style={{ color: COLORS[i] }}>{p.parcelName}</th>)}
                </tr></thead>
                <tbody className="text-slate-400">
                  {[
                    { label: 'Hectare', key: 'hectares', fmt: (v: number) => v.toFixed(2) },
                    { label: 'Ras', key: 'variety', fmt: (v: any) => v },
                    { label: 'Behandelingen', key: 'treatmentCount', fmt: (v: number) => v.toString() },
                    { label: 'Inputkosten/ha', key: 'inputCostsPerHa', fmt: (v: number) => `€${v.toFixed(0)}` },
                    { label: 'Oogst kg/ha', key: 'harvestKgPerHa', fmt: (v: number) => v.toLocaleString('nl-NL') },
                    { label: 'Kosten/ton', key: 'costsPerTon', fmt: (v: number) => `€${v.toFixed(0)}` },
                    { label: 'Kwaliteit % KI', key: 'qualityKlasseIPercent', fmt: (v: number) => `${v.toFixed(0)}%` },
                  ].map((row) => (
                    <tr key={row.label} className="border-b border-white/[0.03]">
                      <td className="py-2 text-xs">{row.label}</td>
                      {comparisonData.map((p) => <td key={p.parcelId} className="py-2 text-right text-xs">{row.fmt((p as any)[row.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Radargrafiek" isEmpty={chartData.length === 0}>
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="rgba(255,255,255,0.05)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 100]} />
                {radarData.map((p, i) => <Radar key={p.parcel} name={p.parcel} dataKey={p.parcel} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.12} strokeWidth={2} />)}
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip content={({ active, payload, label }) => { if (!active || !payload) return null; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200 mb-1">{label}</p>{payload.map((p: any) => <p key={p.name} className="text-xs" style={{ color: p.stroke }}>{p.name}: {p.value.toFixed(0)}</p>)}</div>); }} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      ) : (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <GitCompare className="size-10 text-emerald-500/20 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Selecteer 2-4 percelen hierboven om te vergelijken</p>
        </div>
      )}
    </section>
  );
}
