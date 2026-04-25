'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Loader2,
  Thermometer,
  Droplets,
  TrendingUp,
  Sun,
  CalendarDays,
} from 'lucide-react';
import {
  useWeatherStations,
  useKnmiStations,
  useKnmiDaily,
  useKnmiCumulatives,
  useKnmiLink,
} from '@/hooks/use-weather';
import { TemperatureHistoryChart } from './TemperatureHistoryChart';
import { PrecipitationHistoryChart } from './PrecipitationHistoryChart';
import { GddAccumulationChart } from './GddAccumulationChart';
import { WaterBalanceChart } from './WaterBalanceChart';
import { SeasonSummaryTable } from './SeasonSummaryTable';
import { OwnStationHistorySection } from './OwnStationHistorySection';

type Tab = 'temperature' | 'precipitation' | 'gdd' | 'water' | 'summary';

const TABS: { key: Tab; label: string; icon: typeof Thermometer }[] = [
  { key: 'temperature', label: 'Temperatuur', icon: Thermometer },
  { key: 'precipitation', label: 'Neerslag', icon: Droplets },
  { key: 'gdd', label: 'Graaddagen', icon: TrendingUp },
  { key: 'water', label: 'Waterbalans', icon: Sun },
  { key: 'summary', label: 'Samenvatting', icon: CalendarDays },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export function HistorieOverview() {
  const { data: stations, isLoading: loadingStations } = useWeatherStations();
  const { data: knmiStations, isLoading: loadingKnmi } = useKnmiStations(true);

  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('temperature');

  // Auto-link KNMI station if user has a weather station without KNMI link
  const userStation = stations?.[0];
  const userKnmiCode = userStation?.knmiStationId ?? null;
  const linkMutation = useKnmiLink();

  useEffect(() => {
    if (!userStation) return;
    if (userKnmiCode) return;
    if (linkMutation.isPending || linkMutation.isSuccess) return;
    linkMutation.mutate(userStation.id);
  }, [userStation, userKnmiCode, linkMutation.isPending, linkMutation.isSuccess]);

  // Auto-select station: user's linked KNMI station or first fruit-region station
  useEffect(() => {
    if (selectedStation) return;
    if (userKnmiCode) {
      setSelectedStation(userKnmiCode);
    } else if (knmiStations && knmiStations.length > 0) {
      // Default to Herwijnen (356) if available, otherwise first station
      const herwijnen = knmiStations.find(s => s.code === 356);
      setSelectedStation(herwijnen?.code ?? knmiStations[0].code);
    }
  }, [userKnmiCode, knmiStations, selectedStation]);

  // Fetch daily data for selected year
  const startDate = `${selectedYear}-01-01`;
  const endDate =
    selectedYear === currentYear
      ? new Date().toISOString().split('T')[0]
      : `${selectedYear}-12-31`;

  const { data: dailyData, isLoading: loadingDaily } = useKnmiDaily(
    selectedStation,
    startDate,
    endDate
  );

  // Fetch comparison year if selected
  const compareStart = compareYear ? `${compareYear}-01-01` : '';
  const compareEnd = compareYear
    ? compareYear === currentYear
      ? new Date().toISOString().split('T')[0]
      : `${compareYear}-12-31`
    : '';

  const { data: compareData } = useKnmiDaily(
    compareYear ? selectedStation : null,
    compareStart,
    compareEnd
  );

  // Cumulatives
  const { data: cumulatives } = useKnmiCumulatives(selectedStation, selectedYear);
  const { data: compareCumulatives } = useKnmiCumulatives(
    compareYear ? selectedStation : null,
    compareYear ?? 0
  );

  // Quick stats from daily data
  const quickStats = useMemo(() => {
    if (!dailyData || dailyData.length === 0) return null;

    const temps = dailyData.map(d => d.tempAvgC).filter((t): t is number => t !== null);
    const precips = dailyData.map(d => d.precipitationSum).filter((p): p is number => p !== null);
    const sunshine = dailyData.map(d => d.sunshineHours).filter((s): s is number => s !== null);
    const gdds = dailyData.map(d => d.gddBase5).filter((g): g is number => g !== null);
    const frosts = dailyData.map(d => d.frostHours).filter((f): f is number => f !== null);
    const rainDays = dailyData.filter(d => d.precipitationSum !== null && d.precipitationSum > 0.1).length;

    return {
      avgTemp: temps.length > 0 ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
      totalPrecip: precips.length > 0 ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      rainDays,
      totalSunshine: sunshine.length > 0 ? Math.round(sunshine.reduce((a, b) => a + b, 0)) : null,
      totalGdd: gdds.length > 0 ? Math.round(gdds.reduce((a, b) => a + b, 0)) : null,
      totalFrost: frosts.length > 0 ? frosts.reduce((a, b) => a + b, 0) : null,
    };
  }, [dailyData]);

  // Selected station name
  const selectedStationInfo = knmiStations?.find(s => s.code === selectedStation);

  // Loading states
  if (loadingStations || loadingKnmi) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!knmiStations || knmiStations.length === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-white/40">Geen KNMI meetstations gevonden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Eigen weerstation (LoRaWAN) — verschijnt alleen als de gebruiker er één heeft */}
      <OwnStationHistorySection />

      {/* KNMI sectie */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white/80">KNMI meetstations</h2>
          <span className="text-[11px] text-white/30">Officiële regio-data</span>
        </div>

      {/* Station picker + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-white/60 text-sm">
          <MapPin className="h-4 w-4 text-emerald-400" />
          <select
            value={selectedStation ?? ''}
            onChange={(e) => setSelectedStation(parseInt(e.target.value, 10))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {knmiStations.map((s) => (
              <option key={s.code} value={s.code} className="bg-zinc-900">
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          {selectedStationInfo?.region && (
            <span className="text-white/30 text-xs">{selectedStationInfo.region}</span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {YEARS.map((y) => (
              <option key={y} value={y} className="bg-zinc-900">
                {y}
              </option>
            ))}
          </select>

          {/* Compare selector */}
          <select
            value={compareYear ?? ''}
            onChange={(e) =>
              setCompareYear(e.target.value ? parseInt(e.target.value, 10) : null)
            }
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="" className="bg-zinc-900">
              Vergelijk met...
            </option>
            {YEARS.filter((y) => y !== selectedYear).map((y) => (
              <option key={y} value={y} className="bg-zinc-900">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick stats bar */}
      {quickStats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: 'Gem. temp', value: quickStats.avgTemp !== null ? `${quickStats.avgTemp}\u00B0C` : '-', color: 'text-orange-400' },
            { label: 'Neerslag', value: quickStats.totalPrecip !== null ? `${quickStats.totalPrecip} mm` : '-', color: 'text-blue-400' },
            { label: 'Regendagen', value: String(quickStats.rainDays), color: 'text-blue-300' },
            { label: 'Zon', value: quickStats.totalSunshine !== null ? `${quickStats.totalSunshine} u` : '-', color: 'text-yellow-400' },
            { label: 'GDD\u2085', value: quickStats.totalGdd !== null ? String(quickStats.totalGdd) : '-', color: 'text-emerald-400' },
            { label: 'Vorsturen', value: quickStats.totalFrost !== null ? String(quickStats.totalFrost) : '-', color: 'text-cyan-400' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white/5 rounded-lg px-3 py-2 text-center"
            >
              <div className={`text-lg font-semibold ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Chart content */}
      {loadingDaily ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : !dailyData || dailyData.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-white/40 text-sm">
            Geen data beschikbaar voor {selectedStationInfo?.name ?? selectedStation} in {selectedYear}.
          </p>
          <p className="text-white/20 text-xs">
            Data wordt dagelijks bijgewerkt via het KNMI.
          </p>
        </div>
      ) : (
        <>
          {activeTab === 'temperature' && (
            <TemperatureHistoryChart
              data={dailyData}
              compareData={compareData ?? undefined}
              year={selectedYear}
              compareYear={compareYear ?? undefined}
            />
          )}
          {activeTab === 'precipitation' && (
            <PrecipitationHistoryChart
              data={dailyData}
              compareData={compareData ?? undefined}
              year={selectedYear}
              compareYear={compareYear ?? undefined}
            />
          )}
          {activeTab === 'gdd' && (
            <GddAccumulationChart
              data={cumulatives ?? []}
              compareData={compareCumulatives ?? undefined}
              year={selectedYear}
              compareYear={compareYear ?? undefined}
            />
          )}
          {activeTab === 'water' && (
            <WaterBalanceChart
              data={cumulatives ?? []}
              compareData={compareCumulatives ?? undefined}
              year={selectedYear}
              compareYear={compareYear ?? undefined}
            />
          )}
          {activeTab === 'summary' && (
            <SeasonSummaryTable
              data={dailyData}
              compareData={compareData ?? undefined}
              year={selectedYear}
              compareYear={compareYear ?? undefined}
            />
          )}
        </>
      )}
      </div>
    </div>
  );
}
