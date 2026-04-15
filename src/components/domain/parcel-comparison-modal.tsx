"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { SprayableParcel } from "@/lib/supabase-store";
import { useParcelSeasonKPIs } from "@/hooks/use-parcel-season-kpis";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

interface ParcelComparisonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcels: SprayableParcel[];
}

function ComparisonContent({ parcels }: { parcels: SprayableParcel[] }) {
  // Fetch KPIs for each parcel in parallel (max 4)
  const kpi0 = useParcelSeasonKPIs(parcels[0]?.id);
  const kpi1 = useParcelSeasonKPIs(parcels[1]?.id);
  const kpi2 = useParcelSeasonKPIs(parcels[2]?.id);
  const kpi3 = useParcelSeasonKPIs(parcels[3]?.id);

  const kpis = [kpi0.data, kpi1.data, kpi2.data, kpi3.data].slice(0, parcels.length);
  const isLoading = [kpi0, kpi1, kpi2, kpi3].slice(0, parcels.length).some(k => k.isLoading);

  const { chartData, tableRows } = useMemo(() => {
    if (kpis.some(k => !k)) return { chartData: [], tableRows: [] };

    // Normalize: find max per metric, scale 0-100
    const metrics = [
      { key: 'Oppervlakte', values: parcels.map(p => p.area || 0), unit: 'ha' },
      { key: 'Bespuitingen', values: kpis.map(k => k?.sprayCount || 0), unit: '' },
      { key: 'Uren', values: kpis.map(k => k?.totalHours || 0), unit: 'u' },
      { key: 'Oogst', values: kpis.map(k => (k?.harvestKg || 0) / 1000), unit: 'ton' },
      { key: 'Notities', values: kpis.map(k => k?.noteCount || 0), unit: '' },
    ];

    const chartData = metrics.map(m => {
      const max = Math.max(...m.values, 1);
      const row: Record<string, unknown> = { metric: m.key };
      parcels.forEach((p, i) => {
        row[p.name] = Math.round((m.values[i] / max) * 100);
      });
      return row;
    });

    const tableRows = metrics.map(m => ({
      label: m.key,
      unit: m.unit,
      values: m.values,
    }));

    return { chartData, tableRows };
  }, [parcels, kpis]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-white/30">Laden...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Radar Chart */}
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData}>
            <PolarGrid stroke="#ffffff10" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#ffffff60', fontSize: 11, fontWeight: 700 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111', border: '1px solid #ffffff15', borderRadius: 12, fontSize: 12 }}
              itemStyle={{ fontWeight: 700 }}
            />
            {parcels.map((p, i) => (
              <Radar
                key={p.id}
                name={p.name.length > 25 ? p.name.slice(0, 22) + '...' : p.name}
                dataKey={p.name}
                stroke={COLORS[i]}
                fill={COLORS[i]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Comparison Table */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-[10px] font-bold text-white/30 uppercase tracking-wider px-4 py-2">Metric</th>
              {parcels.map((p, i) => (
                <th key={p.id} className="text-right px-4 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS[i] }}>
                    {p.name.length > 20 ? p.name.slice(0, 17) + '...' : p.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={row.label} className={ri > 0 ? 'border-t border-white/[0.04]' : ''}>
                <td className="text-xs font-medium text-white/50 px-4 py-2.5">{row.label}</td>
                {row.values.map((val, i) => {
                  const max = Math.max(...row.values);
                  const isBest = val === max && val > 0;
                  return (
                    <td key={i} className="text-right px-4 py-2.5">
                      <span className={`text-sm font-mono font-bold tabular-nums ${isBest ? 'text-primary' : 'text-white/60'}`}>
                        {typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(2)) : val}
                      </span>
                      {row.unit && <span className="text-[10px] text-white/20 ml-1">{row.unit}</span>}
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

export function ParcelComparisonModal({ open, onOpenChange, parcels }: ParcelComparisonModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-white">
            Perceelvergelijking ({parcels.length} percelen)
          </DialogTitle>
        </DialogHeader>
        {parcels.length >= 2 ? (
          <ComparisonContent parcels={parcels} />
        ) : (
          <p className="text-sm text-white/30 py-8 text-center">Selecteer minimaal 2 percelen om te vergelijken.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
