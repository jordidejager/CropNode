'use client';

import { Pencil, Trash2, Database } from 'lucide-react';
import { ChartCard } from '../shared/ChartCard';
import type { ProductionSummaryRow } from '@/lib/analytics/production-queries';

interface ProductionDataTableProps {
  data: ProductionSummaryRow[];
  onEdit: (entry: ProductionSummaryRow) => void;
  onDelete: (id: string) => void;
}

export function ProductionDataTable({ data, onEdit, onDelete }: ProductionDataTableProps) {
  // Group by year
  const grouped = new Map<number, ProductionSummaryRow[]>();
  data.forEach((row) => {
    if (!grouped.has(row.harvest_year)) grouped.set(row.harvest_year, []);
    grouped.get(row.harvest_year)!.push(row);
  });
  const years = [...grouped.keys()].sort((a, b) => b - a);

  return (
    <ChartCard
      title="Ingevoerde productiedata"
      isEmpty={data.length === 0}
      emptyIcon={Database}
      emptyTitle="Geen historische data"
      emptyDescription="Klik op 'Historische data' om jaarcijfers toe te voegen."
    >
      <div className="space-y-4">
        {years.map((year) => (
          <div key={year}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Oogst {year}</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-1.5 text-[11px] text-slate-500 font-semibold">Ras</th>
                    <th className="text-left py-1.5 text-[11px] text-slate-500 font-semibold">Perceel</th>
                    <th className="text-right py-1.5 text-[11px] text-slate-500 font-semibold">Ton</th>
                    <th className="text-right py-1.5 text-[11px] text-slate-500 font-semibold">Kisten</th>
                    <th className="text-right py-1.5 text-[11px] text-slate-500 font-semibold">Ha</th>
                    <th className="text-right py-1.5 text-[11px] text-slate-500 font-semibold">kg/ha</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.get(year)!.map((row) => {
                    const ton = (row.total_kg / 1000).toFixed(1);
                    const kgHa = row.hectares && row.hectares > 0 ? Math.round(row.total_kg / row.hectares).toLocaleString('nl-NL') : '-';
                    return (
                      <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2 text-slate-200 font-medium">{row.variety}</td>
                        <td className="py-2 text-slate-400">{row.sub_parcel_id ? 'Perceel' : 'Bedrijf'}</td>
                        <td className="py-2 text-right text-slate-300">{ton}</td>
                        <td className="py-2 text-right text-slate-400">{row.total_crates || '-'}</td>
                        <td className="py-2 text-right text-slate-400">{row.hectares || '-'}</td>
                        <td className="py-2 text-right text-slate-300 font-medium">{kgHa}</td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => onEdit(row)} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => onDelete(row.id)} className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
