'use client';

import { useMemo, useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from 'recharts';
interface SoilSummary {
  parcelId: string;
  parcelName: string;
  organischeStof: number | null;
  nLeverendVermogen: number | null;
  pPlantbeschikbaar: number | null;
  pAl: number | null;
  kleiPercentage: number | null;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'];

interface NutrientRadarChartProps {
  summaries: SoilSummary[];
}

export function NutrientRadarChart({ summaries }: NutrientRadarChartProps) {
  const [selected, setSelected] = useState<string[]>([]);

  // Auto-select first 3 if nothing selected
  const activeIds = selected.length > 0
    ? selected
    : summaries.slice(0, Math.min(3, summaries.length)).map((s) => s.parcelId);

  const activeSummaries = summaries.filter((s) => activeIds.includes(s.parcelId));

  // Normalize values to 0-100 scale for radar
  const { chartData, maxValues } = useMemo(() => {
    const metrics = ['Org. stof', 'N-leverend', 'P-beschikbaar', 'P-Al', 'Klei %'];
    const getters: ((s: BemestingParcelSummary) => number | null)[] = [
      (s) => s.organischeStof,
      (s) => s.nLeverendVermogen,
      (s) => s.pPlantbeschikbaar,
      (s) => s.pAl,
      (s) => s.kleiPercentage,
    ];

    // Find max per metric across ALL summaries for consistent scaling
    const maxVals = getters.map((getter) => {
      const vals = summaries.map(getter).filter((v): v is number => v !== null);
      return vals.length > 0 ? Math.max(...vals) : 1;
    });

    const data = metrics.map((metric, i) => {
      const point: any = { axis: metric };
      activeSummaries.forEach((s) => {
        const raw = getters[i](s);
        point[s.parcelName] = raw !== null ? Math.round((raw / maxVals[i]) * 100) : 0;
      });
      return point;
    });

    return { chartData: data, maxValues: maxVals };
  }, [summaries, activeSummaries]);

  const toggleParcel = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  };

  if (summaries.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">Nutriëntenprofiel per perceel</h3>

      {/* Parcel selector chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {summaries.map((s, i) => {
          const isActive = activeIds.includes(s.parcelId);
          const colorIndex = activeIds.indexOf(s.parcelId);
          return (
            <button
              key={s.parcelId}
              onClick={() => toggleParcel(s.parcelId)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-white border'
                  : selected.length >= 6
                    ? 'bg-white/5 text-slate-600 cursor-not-allowed opacity-50'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
              style={isActive ? {
                backgroundColor: COLORS[colorIndex % COLORS.length] + '30',
                borderColor: COLORS[colorIndex % COLORS.length] + '60',
              } : {}}
            >
              {s.parcelName}
            </button>
          );
        })}
      </div>

      {/* Radar Chart */}
      <ResponsiveContainer width="100%" height={350}>
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fill: '#475569', fontSize: 9 }} domain={[0, 100]} tickCount={5} />
          {activeSummaries.map((s, i) => (
            <Radar
              key={s.parcelId}
              name={s.parcelName}
              dataKey={s.parcelName}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload) return null;
              return (
                <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl">
                  <p className="text-xs font-medium text-slate-200 mb-1">{label}</p>
                  {payload.map((p: any) => (
                    <p key={p.name} className="text-xs" style={{ color: p.stroke }}>
                      {p.name}: {p.value}%
                    </p>
                  ))}
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
