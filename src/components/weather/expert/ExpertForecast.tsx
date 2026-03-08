'use client';

import { useState } from 'react';
import {
  useWeatherStations,
  useWeatherMultiModel,
  useWeatherEnsemble,
} from '@/hooks/use-weather';
import { ErrorState, Skeleton } from '@/components/ui/data-states';
import { StationSelector } from '@/components/weather/StationSelector';
import { VariableSelector } from './VariableSelector';
import type { WeatherVariable } from './VariableSelector';
import { ModelSelector } from './ModelSelector';
import type { EnsembleModel } from './ModelSelector';
import { MultiModelChart } from './MultiModelChart';
import { ModelAgreementBar } from './ModelAgreementBar';
import { EnsemblePlumeChart } from './EnsemblePlumeChart';
import { SprayWindowForecastBand } from './SprayWindowForecastBand';
import { WeatherEmptyState } from '@/components/weather/WeatherEmptyState';
import { StationLocationBanner } from '@/components/weather/StationLocationBanner';
import { SlidersHorizontal } from 'lucide-react';

export function ExpertForecast() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
  );
  const [variable, setVariable] = useState<WeatherVariable>('temperature_c');
  const [ensembleModel, setEnsembleModel] =
    useState<EnsembleModel>('ecmwf_ifs');

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

  // Ensemble data
  const {
    data: ensembleData,
    isLoading: ensembleLoading,
    isError: ensembleError,
  } = useWeatherEnsemble(activeStationId, ensembleModel, variable);

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
      <WeatherEmptyState
        icon={<SlidersHorizontal className="h-12 w-12 text-purple-400/40" />}
      />
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

      {/* Variable selector */}
      <VariableSelector selected={variable} onChange={setVariable} />

      {/* ================================================ */}
      {/* Section 1: Multi-Model Comparison */}
      {/* ================================================ */}
      <section className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white/80">
            Multi-Model Vergelijking
          </h2>
          <span className="text-[10px] text-white/30">5 modellen</span>
        </div>

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
          <>
            <MultiModelChart data={multiModelData} variable={variable} />
            <ModelAgreementBar data={multiModelData} variable={variable} />
          </>
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
          <ModelSelector
            selected={ensembleModel}
            onChange={setEnsembleModel}
          />
        </div>

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
              model={ensembleModel}
            />
            <div className="flex items-center justify-between text-[10px] text-white/30 px-1">
              <span>
                {ensembleData.members_count} ensemble leden
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
