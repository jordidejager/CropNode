'use client';

import { useState, useMemo } from 'react';
import {
  useWeatherStations,
  useWeatherHourly,
  useWeatherCurrent,
  useWeatherRefresh,
} from '@/hooks/use-weather';
import { StationSelector } from './StationSelector';
import { StationLocationBanner } from './StationLocationBanner';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { CurrentSeasonWidget } from './CurrentSeasonWidget';
import { WaterBalanceWidget } from './WaterBalanceWidget';
import { WindRoseWidget } from './WindRoseWidget';
import { PhenologyWidget } from './PhenologyWidget';
import { ForecastAccuracyWidget } from './ForecastAccuracyWidget';
import { LastUpdated } from './LastUpdated';
import { WeatherEmptyState } from './WeatherEmptyState';
import { WeatherDashboardSkeleton } from './WeatherDashboardSkeleton';
import { ErrorState } from '@/components/ui/data-states';

/**
 * Season view: KNMI cumulatieven, waterbalans, windroos, fenologie,
 * forecast-accuracy. Reachable at /weer/seizoen. Assumes the user
 * already has a station (station auto-init happens on the main /weer page).
 */
export function SeasonDashboard() {
  const {
    data: stations,
    isLoading: stationsLoading,
    isError: stationsError,
    error: stationsErrorObj,
    refetch: refetchStations,
  } = useWeatherStations();
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const activeStationId =
    selectedStationId ?? stations?.[0]?.id ?? null;
  const activeStation = stations?.find((s) => s.id === activeStationId) ?? null;

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0]!;
  }, []);
  const endDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0]!;
  }, []);

  const { data: hourlyData = [] } = useWeatherHourly(
    activeStationId,
    startDate,
    endDate
  );
  const { dataUpdatedAt: currentUpdatedAt } = useWeatherCurrent(activeStationId);

  const refreshMutation = useWeatherRefresh();
  const handleRefresh = () => {
    if (activeStationId) refreshMutation.mutate(activeStationId);
  };

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

      {/* Seizoens KNMI summary */}
      {activeStation?.knmiStationId && (
        <CurrentSeasonWidget
          knmiStationId={activeStation.knmiStationId}
          stationName={activeStation.name}
        />
      )}

      {/* Water balance + Wind rose */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WaterBalanceWidget stationId={activeStationId} />
        {hourlyData.length > 0 && (
          <WindRoseWidget hourlyData={hourlyData as Array<Record<string, unknown>>} />
        )}
      </div>

      {/* Phenology timeline */}
      {activeStationId && <PhenologyWidget stationId={activeStationId} />}

      {/* Forecast accuracy */}
      {activeStationId && <ForecastAccuracyWidget stationId={activeStationId} />}

      <LastUpdated
        fetchedAt={lastFetchedAt}
        onRefresh={handleRefresh}
        isRefreshing={refreshMutation.isPending}
      />
    </div>
  );
}
