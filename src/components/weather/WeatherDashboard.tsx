'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  useWeatherStations,
  useWeatherCurrent,
  useWeatherForecast,
  useWeatherHourly,
  useWeatherRefresh,
  useWeatherMultiModel,
} from '@/hooks/use-weather';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/components/ui/data-states';
import { StationSelector } from './StationSelector';
import { TodaySummary } from './TodaySummary';
import { HourlyForecastStrip } from './HourlyForecastStrip';
import { RainForecast } from './RainForecast';
import { WeeklyForecast } from './WeeklyForecast';
import { CurrentSeasonWidget } from './CurrentSeasonWidget';
import { LastUpdated } from './LastUpdated';
import { WeatherDashboardSkeleton } from './WeatherDashboardSkeleton';
import { WeatherEmptyState } from './WeatherEmptyState';
import { StationLocationBanner } from './StationLocationBanner';
import { WeatherAlertBanner } from './WeatherAlertBanner';
import { SprayWindowHero } from './SprayWindowHero';
import { MultiModelConsensus } from './MultiModelConsensus';
import { WaterBalanceWidget } from './WaterBalanceWidget';
import { WindRoseWidget } from './WindRoseWidget';
import { ForecastAccuracyWidget } from './ForecastAccuracyWidget';
import { PhenologyWidget } from './PhenologyWidget';
import { DataFreshnessBadge } from './DataFreshnessBadge';

type DashboardTab = 'dashboard' | 'seizoen';

export function WeatherDashboard() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('dashboard');

  const {
    data: stations,
    isLoading: stationsLoading,
    isError: stationsError,
    error: stationsErrorObj,
    refetch: refetchStations,
  } = useWeatherStations();

  const activeStationId = selectedStationId ?? stations?.[0]?.id ?? null;
  const activeStation = stations?.find((s) => s.id === activeStationId) ?? null;

  const today = new Date().toISOString().split('T')[0]!;
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]!;

  const {
    data: currentData,
    isLoading: currentLoading,
    dataUpdatedAt: currentUpdatedAt,
  } = useWeatherCurrent(activeStationId);

  const { data: forecastData, isLoading: forecastLoading } =
    useWeatherForecast(activeStationId);

  const { data: hourlyData, isLoading: hourlyLoading } = useWeatherHourly(
    activeStationId,
    today,
    sevenDaysLater
  );

  const { data: multiModelData } = useWeatherMultiModel(activeStationId);

  const refreshMutation = useWeatherRefresh();
  const handleRefresh = () => {
    if (activeStationId) refreshMutation.mutate(activeStationId);
  };

  // Auto-refresh stale data once per session
  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (!activeStationId || hasAutoRefreshed.current) return;
    if (!currentData || currentData.length === 0) return;
    if (refreshMutation.isPending) return;

    const sessionKey = `weather_refreshed_${activeStationId}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(sessionKey)) {
      hasAutoRefreshed.current = true;
      return;
    }

    const createdAt = currentData[0]?.createdAt as string | undefined;
    if (!createdAt) return;

    if (Date.now() - new Date(createdAt).getTime() > 3 * 60 * 60 * 1000) {
      hasAutoRefreshed.current = true;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(sessionKey, Date.now().toString());
      }
      refreshMutation.mutate(activeStationId);
    }
  }, [activeStationId, currentData]); // eslint-disable-line react-hooks/exhaustive-deps

  const allHourlyData = useMemo(() => {
    const merged = new Map<string, Record<string, unknown>>();
    if (hourlyData) {
      for (const d of hourlyData) merged.set((d.timestamp as string) ?? '', d);
    }
    if (currentData) {
      for (const d of currentData) merged.set((d.timestamp as string) ?? '', d);
    }
    return Array.from(merged.values()).sort(
      (a, b) =>
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
    );
  }, [currentData, hourlyData]);

  if (stationsLoading) return <WeatherDashboardSkeleton />;
  if (stationsError) {
    return (
      <ErrorState
        title="Weerstations laden mislukt"
        message={stationsErrorObj?.message}
        onRetry={() => refetchStations()}
      />
    );
  }
  if (!stations || stations.length === 0) return <WeatherEmptyState />;

  const isLoading = currentLoading || forecastLoading || hourlyLoading;
  const lastFetchedAt = currentUpdatedAt
    ? new Date(currentUpdatedAt).toISOString()
    : null;

  return (
    <div className="space-y-4">
      {/* Station selector + freshness badge */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <StationSelector
          stations={stations}
          selectedId={activeStationId}
          onChange={setSelectedStationId}
        />
        {activeStation && <StationLocationBanner station={activeStation} />}
        <div className="sm:ml-auto">
          <DataFreshnessBadge
            stationId={activeStationId}
            onRefresh={handleRefresh}
            refreshing={refreshMutation.isPending}
          />
        </div>
      </div>

      {/* Tab navigation: Dashboard / Seizoen / Expert */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        {([
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'seizoen', label: 'Seizoen' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px',
              activeTab === tab.id
                ? 'text-emerald-400 border-emerald-400'
                : 'text-white/40 border-transparent hover:text-white/60'
            )}
          >
            {tab.label}
          </button>
        ))}
        <a
          href="/weer/forecast"
          className="px-4 py-2.5 text-sm font-semibold text-white/40 border-b-2 border-transparent hover:text-white/60 transition-all -mb-px"
        >
          Expert
        </a>
      </div>

      {isLoading && !currentData ? (
        <WeatherDashboardSkeleton />
      ) : (
        <>
          {/* ===== DASHBOARD TAB ===== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              {/* Alert banner — frost, rain, last window */}
              <WeatherAlertBanner
                hourlyData={allHourlyData}
                forecastData={forecastData as Array<Record<string, unknown>> | undefined}
              />

              {/* Spray Window Hero — status + remaining + upcoming windows */}
              {currentData && currentData.length > 0 && (
                <SprayWindowHero
                  currentData={currentData}
                  hourlyData={allHourlyData}
                />
              )}

              {/* Today conditions — temp, precip, wind+gusts, RV, dauwpunt */}
              {currentData && currentData.length > 0 && (
                <TodaySummary currentData={currentData} />
              )}

              {/* Hourly strip (7 days) */}
              {allHourlyData.length > 0 && (
                <HourlyForecastStrip hourlyData={allHourlyData} />
              )}

              {/* Rain forecast — 2u radar + 24u+ maps */}
              {activeStation && (
                <RainForecast
                  lat={activeStation.latitude}
                  lon={activeStation.longitude}
                  hourlyData={allHourlyData}
                />
              )}

              {/* Weekly forecast */}
              {forecastData && forecastData.length > 0 && (
                <WeeklyForecast
                  dailyData={forecastData}
                  hourlyData={allHourlyData}
                />
              )}

              {/* Multi-model consensus — one sentence + link to expert */}
              {multiModelData && (
                <MultiModelConsensus data={multiModelData} />
              )}

              <LastUpdated
                fetchedAt={lastFetchedAt}
                onRefresh={handleRefresh}
                isRefreshing={refreshMutation.isPending}
              />
            </div>
          )}

          {/* ===== SEIZOEN TAB ===== */}
          {activeTab === 'seizoen' && (
            <div className="space-y-4">
              {/* Season KNMI summary */}
              {activeStation?.knmiStationId && (
                <CurrentSeasonWidget
                  knmiStationId={activeStation.knmiStationId}
                  stationName={activeStation.name}
                />
              )}

              {/* Water balance + Wind rose */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <WaterBalanceWidget stationId={activeStationId} />
                {allHourlyData.length > 0 && (
                  <WindRoseWidget hourlyData={allHourlyData} />
                )}
              </div>

              {/* Phenology timeline */}
              {activeStationId && (
                <PhenologyWidget stationId={activeStationId} />
              )}

              {/* Forecast accuracy */}
              {activeStationId && (
                <ForecastAccuracyWidget stationId={activeStationId} />
              )}

              <LastUpdated
                fetchedAt={lastFetchedAt}
                onRefresh={handleRefresh}
                isRefreshing={refreshMutation.isPending}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
