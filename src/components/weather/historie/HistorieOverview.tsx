'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapPin, Download, Loader2, CheckCircle2 } from 'lucide-react';
import {
  useWeatherStations,
  useKnmiDaily,
  useKnmiCumulatives,
  useKnmiImport,
  useKnmiImportStatus,
  useKnmiLink,
} from '@/hooks/use-weather';
import { TemperatureHistoryChart } from './TemperatureHistoryChart';
import { PrecipitationHistoryChart } from './PrecipitationHistoryChart';
import { GddAccumulationChart } from './GddAccumulationChart';
import { WaterBalanceChart } from './WaterBalanceChart';
import { SeasonSummaryTable } from './SeasonSummaryTable';

type Tab = 'temperature' | 'precipitation' | 'gdd' | 'water' | 'summary';

const TABS: { key: Tab; label: string }[] = [
  { key: 'temperature', label: 'Temperatuur' },
  { key: 'precipitation', label: 'Neerslag' },
  { key: 'gdd', label: 'Graaddagen' },
  { key: 'water', label: 'Waterbalans' },
  { key: 'summary', label: 'Samenvatting' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export function HistorieOverview() {
  const { data: stations, isLoading: loadingStations } = useWeatherStations();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('temperature');

  // Get the user's station and its linked KNMI station
  const station = stations?.[0];
  const knmiCode = station?.knmiStationId ?? null;

  // Auto-link KNMI station if not yet linked
  const linkMutation = useKnmiLink();
  useEffect(() => {
    if (!station) return;
    if (knmiCode) return; // Already linked
    if (linkMutation.isPending || linkMutation.isSuccess) return;

    linkMutation.mutate(station.id);
  }, [station, knmiCode, linkMutation.isPending, linkMutation.isSuccess]);

  // Import status check
  const { data: importStatus, refetch: refetchStatus } = useKnmiImportStatus(knmiCode);
  const importMutation = useKnmiImport();

  // Auto-trigger import if needed
  useEffect(() => {
    if (!knmiCode) return;
    if (importStatus === undefined) return; // Still loading
    if (importStatus?.hasData) return; // Already imported
    if (importMutation.isPending || importMutation.isSuccess) return;

    importMutation.mutate(
      { stationCode: knmiCode, yearsBack: 3 },
      { onSuccess: () => refetchStatus() }
    );
  }, [knmiCode, importStatus, importMutation.isPending, importMutation.isSuccess]);

  // Fetch daily data for selected year
  const startDate = `${selectedYear}-01-01`;
  const endDate = selectedYear === currentYear
    ? new Date().toISOString().split('T')[0]
    : `${selectedYear}-12-31`;

  const { data: dailyData, isLoading: loadingDaily } = useKnmiDaily(
    importStatus?.hasData ? knmiCode : null,
    startDate,
    endDate
  );

  // Fetch comparison year if selected
  const compareStart = compareYear ? `${compareYear}-01-01` : '';
  const compareEnd = compareYear
    ? (compareYear === currentYear
      ? new Date().toISOString().split('T')[0]
      : `${compareYear}-12-31`)
    : '';

  const { data: compareData } = useKnmiDaily(
    compareYear && importStatus?.hasData ? knmiCode : null,
    compareStart,
    compareEnd
  );

  // Cumulatives
  const { data: cumulatives } = useKnmiCumulatives(
    importStatus?.hasData ? knmiCode : null,
    selectedYear
  );
  const { data: compareCumulatives } = useKnmiCumulatives(
    compareYear && importStatus?.hasData ? knmiCode : null,
    compareYear ?? 0
  );

  // Loading states
  if (loadingStations) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!station) {
    return (
      <div className="text-center py-24">
        <p className="text-white/40">Geen weerstation gevonden. Ga eerst naar het Dashboard.</p>
      </div>
    );
  }

  if (!knmiCode) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <p className="text-white/60 text-sm">
          {linkMutation.isPending ? 'KNMI meetstation wordt gekoppeld...' : 'KNMI meetstation koppelen...'}
        </p>
        {linkMutation.isError && (
          <p className="text-red-400 text-sm">Koppeling mislukt. Probeer de pagina te herladen.</p>
        )}
      </div>
    );
  }

  // Import in progress
  if (!importStatus?.hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
        <p className="text-white/60 text-sm">
          KNMI meetdata wordt geïmporteerd...
        </p>
        <p className="text-white/30 text-xs">
          Dit kan enkele minuten duren (3 jaar aan uurdata)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Station info + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-white/60 text-sm">
          <MapPin className="h-4 w-4" />
          <span>KNMI meetstation: <strong className="text-white">{knmiCode}</strong></span>
          {importStatus?.rowCount && (
            <span className="text-white/30">({importStatus.rowCount} dagen)</span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {YEARS.map(y => (
              <option key={y} value={y} className="bg-zinc-900">{y}</option>
            ))}
          </select>

          {/* Compare selector */}
          <select
            value={compareYear ?? ''}
            onChange={(e) => setCompareYear(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="" className="bg-zinc-900">Vergelijk met...</option>
            {YEARS.filter(y => y !== selectedYear).map(y => (
              <option key={y} value={y} className="bg-zinc-900">{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart content */}
      {loadingDaily ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : !dailyData || dailyData.length === 0 ? (
        <div className="text-center py-16 text-white/40 text-sm">
          Geen data beschikbaar voor {selectedYear}
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
  );
}
