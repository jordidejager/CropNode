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
import { ErrorState } from '@/components/ui/data-states';
import { StationSelector } from './StationSelector';
import { SprayWindowIndicator } from './SprayWindowIndicator';
import { TodaySummary } from './TodaySummary';
import { HourlyForecastStrip } from './HourlyForecastStrip';
import { RainForecast } from './RainForecast';
import { WeeklyForecast } from './WeeklyForecast';
import { UpcomingSprayWindows } from './UpcomingSprayWindows';
import { CurrentSeasonWidget } from './CurrentSeasonWidget';
import { LastUpdated } from './LastUpdated';
import { WeatherDashboardSkeleton } from './WeatherDashboardSkeleton';
import { WeatherEmptyState } from './WeatherEmptyState';
import { StationLocationBanner } from './StationLocationBanner';
import { MultiModelPreview } from './MultiModelPreview';
import { WaterBalanceWidget } from './WaterBalanceWidget';
import { WindRoseWidget } from './WindRoseWidget';
import { ForecastAccuracyWidget } from './ForecastAccuracyWidget';
import { PhenologyWidget } from './PhenologyWidget';

export function WeatherDashboard() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  // Fetch stations
  const {
    data: stations,
    isLoading: stationsLoading,
    isError: stationsError,
    error: stationsErrorObj,
    refetch: refetchStations,
  } = useWeatherStations();

  // Auto-select first station
  const activeStationId = selectedStationId ?? stations?.[0]?.id ?? null;
  const activeStation = stations?.find((s) => s.id === activeStationId) ?? null;

  // Date range for hourly data (7 days ahead)
  const today = new Date().toISOString().split('T')[0]!;
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]!;

  // Fetch weather data
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

  // Multi-model data for 14-day preview
  const { data: multiModelData } = useWeatherMultiModel(activeStationId);

  // Refresh mutation
  const refreshMutation = useWeatherRefresh();
  const handleRefresh = () => {
    if (activeStationId) {
      refreshMutation.mutate(activeStationId);
    }
  };

  // Auto-refresh: once per browser session, check if data is stale and refresh
  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (!activeStationId || hasAutoRefreshed.current) return;
    if (!currentData || currentData.length === 0) return;
    if (refreshMutation.isPending) return;

    // Prevent re-triggering within same browser session
    const sessionKey = `weather_refreshed_${activeStationId}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(sessionKey)) {
      hasAutoRefreshed.current = true;
      return;
    }

    // Check the createdAt of the first data point
    const firstRow = currentData[0];
    const createdAt = firstRow?.createdAt as string | undefined;
    if (!createdAt) return;

    const ageMs = Date.now() - new Date(createdAt).getTime();
    const threeHoursMs = 3 * 60 * 60 * 1000;

    if (ageMs > threeHoursMs) {
      console.log(
        `[WeatherDashboard] Data is ${Math.round(ageMs / 3600000)}h old — auto-refreshing...`
      );
      hasAutoRefreshed.current = true;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(sessionKey, Date.now().toString());
      }
      refreshMutation.mutate(activeStationId);
    }
  }, [activeStationId, currentData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge current + hourly data for components that need the full range
  const allHourlyData = useMemo(() => {
    const merged = new Map<string, Record<string, unknown>>();

    // Add hourly data first (7 days)
    if (hourlyData) {
      for (const d of hourlyData) {
        const ts = (d.timestamp as string) ?? '';
        merged.set(ts, d);
      }
    }

    // Overlay current data (more recent, may have newer values)
    if (currentData) {
      for (const d of currentData) {
        const ts = (d.timestamp as string) ?? '';
        merged.set(ts, d);
      }
    }

    return Array.from(merged.values()).sort(
      (a, b) =>
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
    );
  }, [currentData, hourlyData]);

  // Loading state
  if (stationsLoading) {
    return <WeatherDashboardSkeleton />;
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
    return <WeatherEmptyState />;
  }

  const isLoading = currentLoading || forecastLoading || hourlyLoading;

  // Determine the last fetch timestamp
  const lastFetchedAt = currentUpdatedAt
    ? new Date(currentUpdatedAt).toISOString()
    : null;

  return (
    <div className="space-y-4">
      {/* Station selector + location banner */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <StationSelector
          stations={stations}
          selectedId={activeStationId}
          onChange={setSelectedStationId}
        />
        {activeStation && <StationLocationBanner station={activeStation} />}
      </div>

      {isLoading && !currentData ? (
        <WeatherDashboardSkeleton />
      ) : (
        <>
          {/* Section 1 & 2: Spray Window + Today Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Spray Window Indicator */}
            <div className="md:col-span-1">
              {currentData && currentData.length > 0 ? (
                <SprayWindowIndicator currentData={currentData} />
              ) : (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
                  <p className="text-white/30 text-sm">Geen actuele weerdata beschikbaar</p>
                </div>
              )}
            </div>

            {/* Today Summary */}
            <div className="md:col-span-1">
              {currentData && currentData.length > 0 ? (
                <TodaySummary currentData={currentData} />
              ) : null}
            </div>
          </div>

          {/* Section 3: 7-Day Forecast (Buienradar-stijl) */}
          {allHourlyData.length > 0 && (
            <HourlyForecastStrip hourlyData={allHourlyData} />
          )}

          {/* Section: Current Season KNMI Summary */}
          {activeStation?.knmiStationId && (
            <CurrentSeasonWidget
              knmiStationId={activeStation.knmiStationId}
              stationName={activeStation.name}
            />
          )}

          {/* Section 4: Buienradar Neerslag (radar + 2/8/24-uur grafiek) */}
          {activeStation && (
            <RainForecast
              lat={activeStation.latitude}
              lon={activeStation.longitude}
              hourlyData={allHourlyData}
            />
          )}

          {/* Section: Water Balance + Wind Rose side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WaterBalanceWidget stationId={activeStationId} />
            {allHourlyData.length > 0 && (
              <WindRoseWidget hourlyData={allHourlyData} />
            )}
          </div>

          {/* Section: Phenology Timeline */}
          {activeStationId && (
            <PhenologyWidget stationId={activeStationId} />
          )}

          {/* Section: Forecast Accuracy */}
          {activeStationId && (
            <ForecastAccuracyWidget stationId={activeStationId} />
          )}

          {/* Section 6: Upcoming Spray Windows */}
          {allHourlyData.length > 0 && (
            <UpcomingSprayWindows hourlyData={allHourlyData} />
          )}

          {/* Section 5: 7-Day Forecast */}
          {forecastData && forecastData.length > 0 && (
            <WeeklyForecast
              dailyData={forecastData}
              hourlyData={allHourlyData}
            />
          )}

          {/* Section 7: 14-Day Multi-Model Preview */}
          {multiModelData && (
            <MultiModelPreview data={multiModelData} />
          )}

          {/* Last Updated + Refresh */}
          <LastUpdated
            fetchedAt={lastFetchedAt}
            onRefresh={handleRefresh}
            isRefreshing={refreshMutation.isPending}
          />
        </>
      )}
    </div>
  );
}
