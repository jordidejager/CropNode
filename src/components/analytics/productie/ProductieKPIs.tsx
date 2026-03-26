'use client';

import { KPICard } from '../shared/KPICard';
import { percentageChange } from '@/lib/analytics/calculations';

interface ProductieKPIsProps {
  totalTon: number;
  prevTotalTon: number;
  avgKgPerHa: number;
  prevAvgKgPerHa: number;
  varietyCount: number;
  bestVariety: string;
  bestKgHa: number;
}

export function ProductieKPIs({ totalTon, prevTotalTon, avgKgPerHa, prevAvgKgPerHa, varietyCount, bestVariety, bestKgHa }: ProductieKPIsProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide mb-6">
      <KPICard
        label="Totale productie"
        value={totalTon}
        suffix=" ton"
        decimals={1}
        changePercent={prevTotalTon > 0 ? percentageChange(totalTon, prevTotalTon) : null}
      />
      <KPICard
        label="Gem. per hectare"
        value={avgKgPerHa}
        suffix=" kg/ha"
        decimals={0}
        changePercent={prevAvgKgPerHa > 0 ? percentageChange(avgKgPerHa, prevAvgKgPerHa) : null}
      />
      <KPICard label="Aantal rassen" value={varietyCount} />
      <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-4 min-w-[160px] backdrop-blur-sm">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Beste ras</span>
        <span className="text-lg font-semibold text-emerald-400 truncate">{bestVariety || '-'}</span>
        <span className="text-xs text-slate-500">{bestKgHa > 0 ? `${bestKgHa.toLocaleString('nl-NL')} kg/ha` : '-'}</span>
      </div>
    </div>
  );
}
