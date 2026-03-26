'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Sprout, FileText } from 'lucide-react';
import { KPICard } from './shared/KPICard';
import { ChartCard } from './shared/ChartCard';
import { type AnalyticsData, type KPIComparison } from '@/lib/analytics/types';
import { calculateCostBreakdown, calculateMonthlyCosts, percentageChange } from '@/lib/analytics/calculations';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
      <p className="text-xs font-medium text-slate-200 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs text-slate-400">
          <span style={{ color: p.color }}>●</span> {p.name}: €{p.value.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}
        </p>
      ))}
    </div>
  );
};

interface SeasonDashboardProps {
  data: AnalyticsData;
  kpiComparison: KPIComparison;
}

export function SeasonDashboard({ data, kpiComparison }: SeasonDashboardProps) {
  const { current, previous } = kpiComparison;
  const costBreakdown = useMemo(() => calculateCostBreakdown(data.registrations), [data.registrations]);
  const monthlyCosts = useMemo(() => calculateMonthlyCosts(data.registrations), [data.registrations]);

  const hasCosts = current.totalInputCosts > 0;
  const totalCostFormatted = `€${current.totalInputCosts.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`;

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Seizoensdashboard</h2>

      {/* KPI Cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        <KPICard label="Inputkosten" value={current.totalInputCosts} prefix="€" changePercent={previous ? percentageChange(current.totalInputCosts, previous.totalInputCosts) : null} invertColors />
        <KPICard label="Kosten/ha" value={current.costsPerHectare} prefix="€" decimals={0} changePercent={previous ? percentageChange(current.costsPerHectare, previous.costsPerHectare) : null} invertColors />
        <KPICard label="Behandelingen" value={current.totalTreatments} changePercent={previous ? percentageChange(current.totalTreatments, previous.totalTreatments) : null} invertColors />
        <KPICard label="Totale oogst" value={current.totalHarvestTons} suffix=" ton" decimals={1} changePercent={previous ? percentageChange(current.totalHarvestTons, previous.totalHarvestTons) : null} />
        <KPICard label="Kosten/ton" value={current.costsPerTon} prefix="€" decimals={0} changePercent={previous ? percentageChange(current.costsPerTon, previous.costsPerTon) : null} invertColors />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <ChartCard title="Kostenverdeling" isEmpty={!hasCosts} emptyIcon={Sprout} emptyTitle="Geen kostendata" emptyDescription="Voeg productprijzen toe aan je registraties om kostenanalyses te activeren.">
          <div className="flex flex-col items-center relative">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={costBreakdown} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={2} dataKey="value" nameKey="category">
                  {costBreakdown.map((entry) => <Cell key={entry.category} fill={entry.color} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
                      <p className="text-xs text-slate-200">{payload[0].name}: €{Number(payload[0].value).toLocaleString('nl-NL')}</p>
                    </div>
                  );
                }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none" style={{ marginTop: -12 }}>
              <span className="text-lg font-semibold text-slate-100">{totalCostFormatted}</span>
              <span className="text-[10px] text-slate-500">Totaal</span>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {costBreakdown.map((entry) => (
                <div key={entry.category} className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-slate-400">{entry.category}: €{entry.value.toLocaleString('nl-NL')}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Stacked Bar Chart */}
        <ChartCard title="Maandelijkse kosten" isEmpty={monthlyCosts.length === 0} emptyIcon={FileText} emptyTitle="Geen registraties" emptyDescription="Begin met registreren via Slimme Invoer." emptyCta={{ label: 'Naar Slimme Invoer', href: '/slimme-invoer' }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyCosts}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => `€${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="gewasbescherming" name="Gewasbescherming" stackId="a" fill="#10b981" />
              <Bar dataKey="bladmeststoffen" name="Bladmeststoffen" stackId="a" fill="#14b8a6" />
              <Bar dataKey="strooimeststoffen" name="Strooimeststoffen" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
