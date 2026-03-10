'use client';

import { useMemo } from 'react';
import type { KnmiDailyData } from '@/lib/weather/knmi-service';

interface Props {
  data: KnmiDailyData[];
  compareData?: KnmiDailyData[];
  year: number;
  compareYear?: number;
}

type SeasonStats = {
  totalPrecipitation: number;
  totalGddBase5: number;
  totalGddBase10: number;
  totalFrostHours: number;
  totalSunshineHours: number;
  totalLeafWetnessHrs: number;
  tempMax: number;
  tempMin: number;
  tempAvg: number;
  daysWithRain: number;
  daysAbove25: number;
  daysBelow0: number;
};

function calculateStats(data: KnmiDailyData[]): SeasonStats {
  let totalPrecip = 0;
  let totalGdd5 = 0;
  let totalGdd10 = 0;
  let totalFrost = 0;
  let totalSunshine = 0;
  let totalLeafWet = 0;
  let tempMaxGlobal = -Infinity;
  let tempMinGlobal = Infinity;
  let tempSum = 0;
  let tempCount = 0;
  let daysRain = 0;
  let daysAbove25 = 0;
  let daysBelow0 = 0;

  for (const d of data) {
    if (d.precipitationSum !== null) totalPrecip += d.precipitationSum;
    if (d.gddBase5 !== null) totalGdd5 += d.gddBase5;
    if (d.gddBase10 !== null) totalGdd10 += d.gddBase10;
    if (d.frostHours !== null) totalFrost += d.frostHours;
    if (d.sunshineHours !== null) totalSunshine += d.sunshineHours;
    if (d.leafWetnessHrs !== null) totalLeafWet += d.leafWetnessHrs;
    if (d.tempMaxC !== null) {
      tempMaxGlobal = Math.max(tempMaxGlobal, d.tempMaxC);
      if (d.tempMaxC >= 25) daysAbove25++;
    }
    if (d.tempMinC !== null) {
      tempMinGlobal = Math.min(tempMinGlobal, d.tempMinC);
      if (d.tempMinC < 0) daysBelow0++;
    }
    if (d.tempAvgC !== null) {
      tempSum += d.tempAvgC;
      tempCount++;
    }
    if (d.precipitationSum !== null && d.precipitationSum >= 0.1) daysRain++;
  }

  return {
    totalPrecipitation: Math.round(totalPrecip * 10) / 10,
    totalGddBase5: Math.round(totalGdd5 * 10) / 10,
    totalGddBase10: Math.round(totalGdd10 * 10) / 10,
    totalFrostHours: totalFrost,
    totalSunshineHours: Math.round(totalSunshine * 10) / 10,
    totalLeafWetnessHrs: Math.round(totalLeafWet),
    tempMax: tempMaxGlobal !== -Infinity ? Math.round(tempMaxGlobal * 10) / 10 : 0,
    tempMin: tempMinGlobal !== Infinity ? Math.round(tempMinGlobal * 10) / 10 : 0,
    tempAvg: tempCount > 0 ? Math.round((tempSum / tempCount) * 10) / 10 : 0,
    daysWithRain: daysRain,
    daysAbove25,
    daysBelow0,
  };
}

export function SeasonSummaryTable({ data, compareData, year, compareYear }: Props) {
  const stats = useMemo(() => calculateStats(data), [data]);
  const cStats = useMemo(
    () => (compareData ? calculateStats(compareData) : null),
    [compareData]
  );

  const rows: { label: string; unit: string; primary: string | number; compare?: string | number }[] = [
    { label: 'Totale neerslag', unit: 'mm', primary: stats.totalPrecipitation, compare: cStats?.totalPrecipitation },
    { label: 'Regendagen (≥0.1mm)', unit: 'dagen', primary: stats.daysWithRain, compare: cStats?.daysWithRain },
    { label: 'GDD (basis 5°C)', unit: '', primary: stats.totalGddBase5, compare: cStats?.totalGddBase5 },
    { label: 'GDD (basis 10°C)', unit: '', primary: stats.totalGddBase10, compare: cStats?.totalGddBase10 },
    { label: 'Vorsturen', unit: 'uren', primary: stats.totalFrostHours, compare: cStats?.totalFrostHours },
    { label: 'Vorstdagen (min <0°C)', unit: 'dagen', primary: stats.daysBelow0, compare: cStats?.daysBelow0 },
    { label: 'Zonuren', unit: 'uren', primary: stats.totalSunshineHours, compare: cStats?.totalSunshineHours },
    { label: 'Bladnaturen', unit: 'uren', primary: stats.totalLeafWetnessHrs, compare: cStats?.totalLeafWetnessHrs },
    { label: 'Zomerse dagen (max ≥25°C)', unit: 'dagen', primary: stats.daysAbove25, compare: cStats?.daysAbove25 },
    { label: 'Gemiddelde temp.', unit: '°C', primary: stats.tempAvg, compare: cStats?.tempAvg },
    { label: 'Hoogste temp.', unit: '°C', primary: stats.tempMax, compare: cStats?.tempMax },
    { label: 'Laagste temp.', unit: '°C', primary: stats.tempMin, compare: cStats?.tempMin },
  ];

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left px-4 py-3 text-white/40 font-medium">Kenmerk</th>
            <th className="text-right px-4 py-3 text-emerald-400 font-medium">{year}</th>
            {compareYear && (
              <th className="text-right px-4 py-3 text-blue-400 font-medium">{compareYear}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-2.5 text-white/60">{row.label}</td>
              <td className="px-4 py-2.5 text-right text-white font-medium">
                {row.primary} {row.unit && <span className="text-white/30 text-xs">{row.unit}</span>}
              </td>
              {compareYear && (
                <td className="px-4 py-2.5 text-right text-white/60">
                  {row.compare !== undefined ? row.compare : '—'} {row.unit && <span className="text-white/30 text-xs">{row.unit}</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-xs text-white/20">
        Data: {data.length} dagen
        {compareData && ` | Vergelijking: ${compareData.length} dagen`}
      </div>
    </div>
  );
}
