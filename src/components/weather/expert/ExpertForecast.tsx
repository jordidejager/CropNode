'use client';

import { useState, useMemo } from 'react';
import {
  useWeatherStations,
  useWeatherMultiModel,
  useWeatherEnsemble,
} from '@/hooks/use-weather';
import type { EnsembleStatsData } from '@/hooks/use-weather';
import { ErrorState, Skeleton } from '@/components/ui/data-states';
import { StationSelector } from '@/components/weather/StationSelector';
import { VariableSelector } from './VariableSelector';
import type { WeatherVariable } from './VariableSelector';
import { ModelSelector } from './ModelSelector';
import type { EnsembleViewMode } from './ModelSelector';
import { MultiModelChart } from './MultiModelChart';
import { CombinedMultiModelChart } from './CombinedMultiModelChart';
import { ModelAgreementBar } from './ModelAgreementBar';
import { EnsemblePlumeChart } from './EnsemblePlumeChart';
import { SprayWindowForecastBand } from './SprayWindowForecastBand';
import { WeatherEmptyState } from '@/components/weather/WeatherEmptyState';
import { StationLocationBanner } from '@/components/weather/StationLocationBanner';
import { cn } from '@/lib/utils';

type MultiModelView = 'combined' | 'single';

/** Average two ensemble stats datasets by timestamp */
function mergeEnsembleData(
  ecmwf: EnsembleStatsData,
  gfs: EnsembleStatsData
): EnsembleStatsData {
  const gfsMap = new Map(gfs.stats.map((s) => [s.timestamp, s]));

  const merged = ecmwf.stats.map((e) => {
    const g = gfsMap.get(e.timestamp);
    if (!g) return e;
    return {
      timestamp: e.timestamp,
      min: Math.min(e.min, g.min),
      p10: (e.p10 + g.p10) / 2,
      p25: (e.p25 + g.p25) / 2,
      median: (e.median + g.median) / 2,
      p75: (e.p75 + g.p75) / 2,
      p90: (e.p90 + g.p90) / 2,
      max: Math.max(e.max, g.max),
    };
  });

  // Add any GFS timestamps not in ECMWF
  for (const [ts, g] of gfsMap) {
    if (!ecmwf.stats.find((e) => e.timestamp === ts)) {
      merged.push(g);
    }
  }

  merged.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    stats: merged,
    members_count: ecmwf.members_count + gfs.members_count,
    last_updated: ecmwf.last_updated > gfs.last_updated
      ? ecmwf.last_updated
      : gfs.last_updated,
  };
}

export function ExpertForecast() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
  );
  const [variable, setVariable] = useState<WeatherVariable>('temperature_c');
  const [multiModelView, setMultiModelView] = useState<MultiModelView>('combined');
  const [ensembleViewMode, setEnsembleViewMode] =
    useState<EnsembleViewMode>('combined');

  // Fetch stations
  const {
    data: stations,
    isLoading: stationsLoading,
    isError: stationsError,
    error: stationsErrorObj,
    refetch: refetchStations,
  } = useWeatherStations();

  // Active station
  const activeStationId = selectedStationId ?? stations?.[0]?.id ?? null;
  const activeStation = stations?.find((s) => s.id === activeStationId) ?? null;

  // Multi-model data
  const {
    data: multiModelData,
    isLoading: multiModelLoading,
    isError: multiModelError,
  } = useWeatherMultiModel(activeStationId);

  // Ensemble data — always fetch both for combined mode
  const {
    data: ecmwfEnsemble,
    isLoading: ecmwfLoading,
    isError: ecmwfError,
  } = useWeatherEnsemble(activeStationId, 'ecmwf_ifs', variable);

  const {
    data: gfsEnsemble,
    isLoading: gfsLoading,
    isError: gfsError,
  } = useWeatherEnsemble(activeStationId, 'gfs', variable);

  // Derived ensemble data based on view mode
  const ensembleData = useMemo(() => {
    if (ensembleViewMode === 'ecmwf_ifs') return ecmwfEnsemble ?? null;
    if (ensembleViewMode === 'gfs') return gfsEnsemble ?? null;
    // Combined
    if (ecmwfEnsemble && gfsEnsemble) return mergeEnsembleData(ecmwfEnsemble, gfsEnsemble);
    return ecmwfEnsemble ?? gfsEnsemble ?? null;
  }, [ensembleViewMode, ecmwfEnsemble, gfsEnsemble]);

  const ensembleLoading = ecmwfLoading || gfsLoading;
  const ensembleError = ecmwfError && gfsError;

  // Loading state
  if (stationsLoading) {
    return <ExpertSkeleton />;
  }

  // Error state
  if (stationsError) {
    return (
      <ErrorState
        title="Weerstations laden mislukt"
        message={stationsErrorObj?.message}
        onRetry={() => refetchStations()}
      />
    );
  }

  // No stations — show initialization UI
  if (!stations || stations.length === 0) {
    return (
      <WeatherEmptyState />
    );
  }

  return (
    <div className="space-y-6">
      {/* Station selector + location banner */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <StationSelector
          stations={stations}
          selectedId={activeStationId}
          onChange={setSelectedStationId}
        />
        {activeStation && <StationLocationBanner station={activeStation} />}
      </div>

      {/* ================================================ */}
      {/* Section 1: Multi-Model Comparison */}
      {/* ================================================ */}
      <section className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-white/80">
            Multi-Model Vergelijking
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {([
                { key: 'combined' as const, label: 'Alle variabelen' },
                { key: 'single' as const, label: 'Per variabele' },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setMultiModelView(opt.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-bold transition-all',
                    multiModelView === opt.key
                      ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-white/30">5 modellen</span>
          </div>
        </div>

        {/* Variable selector — only when in single-variable view */}
        {multiModelView === 'single' && (
          <VariableSelector selected={variable} onChange={setVariable} />
        )}

        {multiModelLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : multiModelError ? (
          <div className="flex items-center justify-center h-[300px] text-white/20 text-sm">
            Multi-model data kon niet geladen worden
          </div>
        ) : multiModelData ? (
          multiModelView === 'combined' ? (
            <CombinedMultiModelChart data={multiModelData} />
          ) : (
            <>
              <MultiModelChart data={multiModelData} variable={variable} />
              <ModelAgreementBar data={multiModelData} variable={variable} />
            </>
          )
        ) : null}
      </section>

      {/* ================================================ */}
      {/* Section 2: Ensemble Plume */}
      {/* ================================================ */}
      <section className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-white/80">
            Ensemble Spreiding
          </h2>
          <div className="flex items-center gap-2">
            <ModelSelector
              selected={ensembleViewMode}
              onChange={setEnsembleViewMode}
            />
          </div>
        </div>

        {/* Variable selector for ensemble */}
        <VariableSelector selected={variable} onChange={setVariable} />

        {ensembleLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : ensembleError ? (
          <div className="flex items-center justify-center h-[300px] text-white/20 text-sm">
            Ensemble data kon niet geladen worden
          </div>
        ) : ensembleData ? (
          <>
            <EnsemblePlumeChart
              data={ensembleData}
              variable={variable}
              model={ensembleViewMode === 'gfs' ? 'gfs' : 'ecmwf_ifs'}
              isCombined={ensembleViewMode === 'combined'}
            />
            <div className="flex items-center justify-between text-[10px] text-white/30 px-1">
              <span>
                {ensembleData.members_count} ensemble leden
                {ensembleViewMode === 'combined' && ' (ECMWF + GFS)'}
              </span>
              <span>
                Laatst bijgewerkt:{' '}
                {new Date(ensembleData.last_updated).toLocaleString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </>
        ) : null}
      </section>

      {/* ================================================ */}
      {/* Section 3: Spray Window Forecast Band */}
      {/* ================================================ */}
      {multiModelData && (
        <SprayWindowForecastBand data={multiModelData} />
      )}
    </div>
  );
}

function ExpertSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-8 w-64" />

      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-8 w-full" />
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[300px] w-full" />
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="space-y-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
