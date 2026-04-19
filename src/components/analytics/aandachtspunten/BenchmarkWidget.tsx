'use client';

import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import type { BenchmarkSnapshot } from '@/lib/analytics/signals/types';

function fmt(n: number | null, unit: string): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  const decimals = abs < 10 ? 1 : abs < 100 ? 0 : 0;
  return n.toLocaleString('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface BenchmarkCellProps {
  snapshot: BenchmarkSnapshot;
}

function BenchmarkCell({ snapshot }: BenchmarkCellProps) {
  const { label, current, previous, sectorAverage, unit, higherIsBetter } = snapshot;

  const hasPrev = previous != null && isFinite(previous) && previous !== 0;
  const prevChangePct = hasPrev && current != null
    ? ((current - (previous as number)) / (previous as number)) * 100
    : null;
  const prevImproving = prevChangePct != null
    ? (higherIsBetter ? prevChangePct > 0 : prevChangePct < 0)
    : null;

  const hasSector = sectorAverage != null && current != null;
  const sectorDiffPct = hasSector
    ? ((current - (sectorAverage as number)) / (sectorAverage as number)) * 100
    : null;
  const sectorBetter = sectorDiffPct != null
    ? (higherIsBetter ? sectorDiffPct > 0 : sectorDiffPct < 0)
    : null;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-4 min-w-[160px]">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-slate-100">
          {fmt(current, unit)}
        </span>
        <span className="text-[10px] text-slate-500">{unit}</span>
      </div>

      {/* Vorig jaar */}
      <div className="flex items-center gap-1.5 mt-0.5">
        {prevChangePct == null ? (
          <span className="text-[10px] text-slate-600">geen vorig jaar</span>
        ) : (
          <>
            {prevChangePct > 0 ? (
              <TrendingUp className={`size-3 ${prevImproving ? 'text-emerald-400' : 'text-red-400'}`} />
            ) : prevChangePct < 0 ? (
              <TrendingDown className={`size-3 ${prevImproving ? 'text-emerald-400' : 'text-red-400'}`} />
            ) : (
              <Minus className="size-3 text-slate-600" />
            )}
            <span className={`text-[10px] font-medium ${prevImproving ? 'text-emerald-400' : prevImproving === false ? 'text-red-400' : 'text-slate-500'}`}>
              {prevChangePct > 0 ? '+' : ''}{prevChangePct.toFixed(0)}% t.o.v. vorig jaar
            </span>
          </>
        )}
      </div>

      {/* Sector */}
      {hasSector && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/5 mt-1">
          <span className="text-[10px] text-slate-500">
            sector ≈ {fmt(sectorAverage as number, unit)}
          </span>
          {sectorDiffPct != null && Math.abs(sectorDiffPct) >= 3 && (
            <span className={`text-[10px] font-medium ${sectorBetter ? 'text-emerald-400' : 'text-amber-400'}`}>
              ({sectorDiffPct > 0 ? '+' : ''}{sectorDiffPct.toFixed(0)}%)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function BenchmarkWidget({ benchmarks }: { benchmarks: BenchmarkSnapshot[] }) {
  const hasAnyData = benchmarks.some((b) => b.current != null);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Hoe sta je ervoor?</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Huidig oogstjaar vs. vorig jaar en sector-indicatie
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-600">
          <Info className="size-3" />
          <span>Indicatief</span>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="text-center py-6">
          <p className="text-xs text-slate-500">
            Nog geen data voor benchmarks. Registreer bespuitingen en oogsten om je cijfers te zien.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {benchmarks.map((b) => (
            <BenchmarkCell key={b.label} snapshot={b} />
          ))}
        </div>
      )}
    </div>
  );
}
