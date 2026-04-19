'use client';

import { useMemo } from 'react';
import Link from 'next/link';

interface MarginCell {
  subParcelId: string;
  fullName: string;
  variety: string;
  hectares: number;
  harvestYear: number;
  inputCost: number;
  totalKg: number;
  estimatedMargin: number;
  marginPerHa: number;
  hasYieldData: boolean;
  hasCostData: boolean;
}

function marginToColor(marginPerHa: number, maxAbs: number): string {
  if (maxAbs === 0) return 'rgba(255,255,255,0.04)';
  const ratio = Math.max(-1, Math.min(1, marginPerHa / maxAbs));
  if (ratio > 0) {
    // Groen (emerald)
    const alpha = 0.1 + ratio * 0.6;
    return `rgba(16, 185, 129, ${alpha.toFixed(2)})`;
  } else if (ratio < 0) {
    const alpha = 0.1 + Math.abs(ratio) * 0.6;
    return `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
  }
  return 'rgba(255,255,255,0.04)';
}

export function MarginHeatmap({ cells, years }: { cells: MarginCell[]; years: number[] }) {
  // Unique subparcels sorted by most recent margin
  const parcels = useMemo(() => {
    const byId = new Map<string, { id: string; fullName: string; variety: string }>();
    cells.forEach((c) => {
      if (!byId.has(c.subParcelId)) {
        byId.set(c.subParcelId, {
          id: c.subParcelId,
          fullName: c.fullName,
          variety: c.variety,
        });
      }
    });
    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [cells]);

  const cellMap = useMemo(() => {
    const m = new Map<string, MarginCell>();
    cells.forEach((c) => {
      m.set(`${c.subParcelId}|${c.harvestYear}`, c);
    });
    return m;
  }, [cells]);

  const maxAbs = useMemo(() => {
    const values = cells.filter((c) => c.hasYieldData && c.hasCostData).map((c) => Math.abs(c.marginPerHa));
    return values.length > 0 ? Math.max(...values) : 1;
  }, [cells]);

  if (parcels.length === 0 || years.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-6 text-center text-sm text-slate-500">
        Geen data voor rendement-overzicht. Voeg kosten en productie toe.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Marge-heatmap</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Geschatte marge per hectare per jaar. Groen = winstgevend, rood = verliesgevend. Klik voor details.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <div className="size-3 rounded" style={{ background: 'rgba(239,68,68,0.5)' }} />
            <span>verlies</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="size-3 rounded" style={{ background: 'rgba(16,185,129,0.5)' }} />
            <span>winst</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider bg-[#020617] sticky left-0 z-10">Perceel</th>
              <th className="text-left px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider bg-[#020617]">Ras</th>
              {years.map((y) => (
                <th key={y} className="text-center px-2 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider min-w-[80px]">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parcels.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="px-3 py-2 text-xs text-slate-200 bg-[#020617] sticky left-0 z-10 max-w-[240px]">
                  <Link
                    href={`/analytics/perceel?id=${p.id}`}
                    className="hover:text-emerald-400 transition-colors truncate block"
                  >
                    {p.fullName}
                  </Link>
                </td>
                <td className="px-2 py-2 text-[10px] text-slate-500 bg-[#020617]">{p.variety}</td>
                {years.map((y) => {
                  const cell = cellMap.get(`${p.id}|${y}`);
                  if (!cell) {
                    return <td key={y} className="px-1 py-1 text-center text-[10px] text-slate-800">—</td>;
                  }
                  const isComplete = cell.hasYieldData && cell.hasCostData;
                  const color = isComplete ? marginToColor(cell.marginPerHa, maxAbs) : 'rgba(255,255,255,0.02)';
                  return (
                    <td key={y} className="px-1 py-1">
                      <Link
                        href={`/analytics/perceel?id=${p.id}`}
                        className="flex flex-col items-center justify-center rounded p-1.5 hover:ring-1 hover:ring-emerald-500/30 transition-all"
                        style={{ background: color }}
                        title={
                          isComplete
                            ? `${p.fullName} ${y}: €${cell.marginPerHa}/ha marge (kosten €${cell.inputCost}, omzet €${cell.estimatedRevenue})`
                            : `${p.fullName} ${y}: ${cell.hasYieldData ? 'geen kostendata' : 'geen oogstdata'}`
                        }
                      >
                        {isComplete ? (
                          <>
                            <span className={`text-xs font-semibold ${cell.marginPerHa >= 0 ? 'text-emerald-100' : 'text-red-100'}`}>
                              €{cell.marginPerHa.toLocaleString('nl-NL')}
                            </span>
                            <span className="text-[9px] text-slate-400">/ha</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[9px] text-slate-500">
                              {cell.hasYieldData ? '📦' : '💰'}
                            </span>
                            <span className="text-[9px] text-slate-600">
                              {cell.hasYieldData ? 'geen €' : 'geen kg'}
                            </span>
                          </>
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
