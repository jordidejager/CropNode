'use client';

import { useMemo } from 'react';
import {
  Thermometer,
  Droplets,
  Sprout,
  CloudRain,
  Sun,
  Snowflake,
} from 'lucide-react';
import { useKnmiDaily, useKnmiCumulatives } from '@/hooks/use-weather';
import { Skeleton } from '@/components/ui/data-states';

interface CurrentSeasonWidgetProps {
  knmiStationId: number | null;
  stationName?: string | null;
}

export function CurrentSeasonWidget({
  knmiStationId,
  stationName,
}: CurrentSeasonWidgetProps) {
  const currentYear = new Date().getFullYear();
  const startDate = `${currentYear}-01-01`;
  const endDate = new Date().toISOString().split('T')[0]!;

  const { data: dailyData, isLoading: dailyLoading } = useKnmiDaily(
    knmiStationId,
    startDate,
    endDate
  );
  const { data: cumulatives, isLoading: cumLoading } = useKnmiCumulatives(
    knmiStationId,
    currentYear
  );

  const stats = useMemo(() => {
    if (!dailyData || dailyData.length === 0) return null;

    const temps = dailyData
      .map((d) => d.tempAvgC)
      .filter((v): v is number => v !== null);
    const avgTemp =
      temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;

    const totalPrecip = dailyData.reduce(
      (sum, d) => sum + (d.precipitationSum ?? 0),
      0
    );
    const rainDays = dailyData.filter(
      (d) => d.precipitationSum !== null && d.precipitationSum >= 0.1
    ).length;
    const totalSunshine = dailyData.reduce(
      (sum, d) => sum + (d.sunshineHours ?? 0),
      0
    );
    const frostHours = dailyData.reduce(
      (sum, d) => sum + (d.frostHours ?? 0),
      0
    );

    const lastCum = cumulatives && cumulatives.length > 0
      ? cumulatives[cumulatives.length - 1]!
      : null;

    return {
      avgTemp: avgTemp.toFixed(1),
      totalPrecip: Math.round(totalPrecip),
      rainDays,
      totalSunshine: Math.round(totalSunshine),
      frostHours: Math.round(frostHours),
      gdd5: lastCum ? Math.round(lastCum.cumulativeGddBase5) : 0,
      waterBalance: lastCum ? Math.round(lastCum.waterBalance) : 0,
      daysCount: dailyData.length,
    };
  }, [dailyData, cumulatives]);

  if (!knmiStationId) return null;

  const isLoading = dailyLoading || cumLoading;

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:col-span-2">
        <Skeleton className="h-4 w-40 mb-3" />
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    {
      icon: <Thermometer className="h-3.5 w-3.5" />,
      label: 'Gem. temp',
      value: `${stats.avgTemp}°C`,
      color: 'text-orange-400',
    },
    {
      icon: <CloudRain className="h-3.5 w-3.5" />,
      label: 'Neerslag',
      value: `${stats.totalPrecip} mm`,
      sub: `${stats.rainDays} dagen`,
      color: 'text-sky-400',
    },
    {
      icon: <Sun className="h-3.5 w-3.5" />,
      label: 'Zon',
      value: `${stats.totalSunshine} u`,
      color: 'text-amber-400',
    },
    {
      icon: <Sprout className="h-3.5 w-3.5" />,
      label: 'GDD₅',
      value: String(stats.gdd5),
      color: 'text-emerald-400',
    },
    {
      icon: <Droplets className="h-3.5 w-3.5" />,
      label: 'Waterbalans',
      value: `${stats.waterBalance > 0 ? '+' : ''}${stats.waterBalance} mm`,
      color: stats.waterBalance >= 0 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      icon: <Snowflake className="h-3.5 w-3.5" />,
      label: 'Vorst',
      value: `${stats.frostHours} u`,
      color: 'text-blue-300',
    },
  ];

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 md:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">
          Seizoen {currentYear}
        </h3>
        <span className="text-[9px] text-white/20">
          KNMI {stationName ?? ''} — {stats.daysCount} dagen
        </span>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 text-center"
          >
            <div className={`flex items-center justify-center mb-1 ${item.color} opacity-60`}>
              {item.icon}
            </div>
            <div className={`text-sm font-bold ${item.color}`}>
              {item.value}
            </div>
            {item.sub && (
              <div className="text-[9px] text-white/30 mt-0.5">{item.sub}</div>
            )}
            <div className="text-[9px] text-white/30 mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
