'use client';

import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CloudRain, Thermometer, Sun, Snowflake } from 'lucide-react';
import { ChartCard } from './shared/ChartCard';
import { type AnalyticsData } from '@/lib/analytics/types';
import { calculateWeatherStats } from '@/lib/analytics/calculations';

interface WeatherImpactProps { data: AnalyticsData; weatherData: any[]; }

export function WeatherImpact({ data, weatherData }: WeatherImpactProps) {
  const weatherStats = useMemo(() => calculateWeatherStats(weatherData), [weatherData]);

  const weeklyData = useMemo(() => {
    if (!weatherData || weatherData.length === 0) return [];
    const weeks = new Map<string, { weekLabel: string; precipitation: number; treatments: number }>();
    weatherData.forEach((day) => {
      const date = new Date(day.date);
      const ws = new Date(date); ws.setDate(date.getDate() - date.getDay() + 1);
      const key = ws.toISOString().split('T')[0];
      if (!weeks.has(key)) weeks.set(key, { weekLabel: ws.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), precipitation: 0, treatments: 0 });
      weeks.get(key)!.precipitation += day.precipitation_sum || 0;
    });
    data.registrations.forEach((reg) => {
      const date = new Date(reg.date);
      const ws = new Date(date); ws.setDate(date.getDate() - date.getDay() + 1);
      const key = ws.toISOString().split('T')[0];
      if (weeks.has(key)) weeks.get(key)!.treatments += 1;
    });
    return [...weeks.values()];
  }, [weatherData, data.registrations]);

  const gddData = useMemo(() => {
    if (!weatherData || weatherData.length === 0) return [];
    let cum = 0;
    return weatherData.filter((d) => d.gdd_base5 != null).map((day) => { cum += day.gdd_base5 || 0; return { date: new Date(day.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), cumulativeGDD: Math.round(cum) }; });
  }, [weatherData]);

  const tt = ({ active, payload, label }: any) => { if (!active || !payload) return null; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200 mb-1">Week {label}</p>{payload.map((p: any) => <p key={p.dataKey} className="text-xs text-slate-400">{p.name}: {p.dataKey === 'precipitation' ? `${p.value.toFixed(1)} mm` : p.value}</p>)}</div>); };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Weerimpact</h2>

      {weatherStats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: CloudRain, color: 'text-blue-400', value: weatherStats.rainDays, label: 'Regendagen' },
            { icon: Snowflake, color: 'text-cyan-400', value: weatherStats.frostDays, label: 'Nachtvorst (apr-mei)' },
            { icon: Sun, color: 'text-amber-400', value: weatherStats.longestDryPeriod, label: 'Langste droge periode' },
            { icon: Thermometer, color: 'text-red-400', value: `${weatherStats.warmestWeekAvgTemp}°C`, label: 'Warmste week (gem.)' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col items-center">
              <s.icon className={`size-5 ${s.color} mb-2`} />
              <span className="text-xl font-semibold text-slate-100">{s.value}</span>
              <span className="text-[10px] text-slate-500 text-center mt-1">{s.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center">
          <CloudRain className="size-8 text-emerald-500/20 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Weerdata wordt automatisch verzameld.</p>
          <p className="text-xs text-slate-500">Analyse beschikbaar na je eerste registraties.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Behandelingen vs. neerslag (per week)" isEmpty={weeklyData.length === 0} emptyTitle="Geen weerdata" emptyDescription="Weerdata wordt automatisch verzameld.">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="weekLabel" tick={{ fill: '#64748b', fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip content={tt} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="precipitation" name="Neerslag (mm)" fill="rgba(96, 165, 250, 0.3)" />
              <Line yAxisId="right" type="monotone" dataKey="treatments" name="Behandelingen" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Temperatuursom (graaddagen basis 5°C)" isEmpty={gddData.length === 0} emptyTitle="Geen temperatuurdata" emptyDescription="Graaddagen beschikbaar zodra weerdata er is.">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={gddData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip content={({ active, payload, label }) => { if (!active || !payload?.length) return null; return (<div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-xl"><p className="text-xs font-medium text-slate-200">{label}</p><p className="text-xs text-slate-400">Cum. graaddagen: {payload[0].value}</p></div>); }} />
              <Line type="monotone" dataKey="cumulativeGDD" stroke="#10b981" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
