'use client';

import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  LineChart, Line, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  productie: '#10b981',
  bodem: '#f59e0b',
  gewasbescherming: '#ef4444',
  weer: '#3b82f6',
  infrastructuur: '#8b5cf6',
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-slate-900/95 px-2 py-1 shadow-xl backdrop-blur-xl text-[10px]">
      <span className="text-slate-200">{label || payload[0]?.payload?.name}: </span>
      <span className="text-slate-100 font-semibold">{payload[0]?.value?.toLocaleString('nl-NL')}</span>
    </div>
  );
};

interface InsightMiniChartProps {
  data: Record<string, number>;
  type: string;
  categorie: string;
}

export function InsightMiniChart({ data, type, categorie }: InsightMiniChartProps) {
  const color = CATEGORY_COLORS[categorie] || '#10b981';
  const entries = Object.entries(data).map(([name, value]) => ({ name, value: Number(value) || 0 }));

  if (entries.length === 0) return null;

  // Waarde highlight: show the main number prominently
  if (type === 'waarde_highlight' || entries.length === 1) {
    const entry = entries[0];
    const isPositive = entry.value > 0;
    const Icon = entry.value > 0 ? TrendingUp : entry.value < 0 ? TrendingDown : Minus;

    return (
      <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
        <Icon className={`size-5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`} />
        <div>
          <span className="text-lg font-bold text-slate-100">
            {entry.value > 0 ? '+' : ''}{entry.value.toLocaleString('nl-NL')}
          </span>
          <span className="text-xs text-slate-500 ml-1.5">{entry.name}</span>
        </div>
      </div>
    );
  }

  // Line trend
  if (type === 'lijn_trend') {
    return (
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={entries} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Scatter
  if (type === 'scatter') {
    const scatterData = entries.map((e, i) => ({ x: i, y: e.value, name: e.name }));
    return (
      <ResponsiveContainer width="100%" height={100}>
        <ScatterChart margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
          <XAxis type="number" dataKey="x" hide />
          <YAxis type="number" dataKey="y" hide />
          <ZAxis range={[40, 40]} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="rounded-md border border-white/10 bg-slate-900/95 px-2 py-1 shadow-xl text-[10px]">
                <span className="text-slate-200">{d.name}: </span>
                <span className="text-slate-100 font-semibold">{d.y.toLocaleString('nl-NL')}</span>
              </div>
            );
          }} />
          <Scatter data={scatterData} fill={color} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar comparison (horizontal)
  return (
    <ResponsiveContainer width="100%" height={Math.max(60, entries.length * 28)}>
      <BarChart data={entries} layout="vertical" margin={{ left: 60, right: 10 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
