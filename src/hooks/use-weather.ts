'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { BUIENRADAR_RAIN_TEXT_URL } from '@/lib/weather/weather-constants';

// ============================================
// Query Keys
// ============================================

export const weatherKeys = {
  stations: ['weather', 'stations'] as const,
  current: (id: string) => ['weather', 'current', id] as const,
  forecast: (id: string) => ['weather', 'forecast', id] as const,
  hourly: (id: string, start: string, end: string) =>
    ['weather', 'hourly', id, start, end] as const,
  rain: (lat: number, lon: number) => ['weather', 'rain', lat, lon] as const,
  multimodel: (id: string) => ['weather', 'multimodel', id] as const,
  ensemble: (id: string, model: string, variable: string) =>
    ['weather', 'ensemble', id, model, variable] as const,
};

// ============================================
// Types
// ============================================

export type WeatherStationBasic = {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
};

export type RainDataPoint = {
  time: string;
  mmPerHour: number;
  intensity: number; // raw 0-255 value
};

// ============================================
// Hooks
// ============================================

/**
 * Fetch all weather stations for the current user.
 */
export function useWeatherStations() {
  return useQuery({
    queryKey: weatherKeys.stations,
    queryFn: async (): Promise<WeatherStationBasic[]> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from('weather_stations')
        .select('id, name, latitude, longitude')
        .eq('user_id', user.id);

      return (data ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string | null,
        latitude: parseFloat(s.latitude as string),
        longitude: parseFloat(s.longitude as string),
      }));
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch current conditions + 48-hour forecast (hourly).
 * Polls every 15 minutes.
 */
export function useWeatherCurrent(stationId: string | null) {
  return useQuery({
    queryKey: weatherKeys.current(stationId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/weather/current?stationId=${stationId}`);
      if (!res.ok) throw new Error('Weerdata ophalen mislukt');
      const json = await res.json();
      return json.data as Array<Record<string, unknown>>;
    },
    enabled: !!stationId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Fetch 16-day daily forecast.
 */
export function useWeatherForecast(stationId: string | null) {
  return useQuery({
    queryKey: weatherKeys.forecast(stationId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/weather/forecast?stationId=${stationId}`);
      if (!res.ok) throw new Error('Forecast ophalen mislukt');
      const json = await res.json();
      return json.data as Array<Record<string, unknown>>;
    },
    enabled: !!stationId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Fetch hourly data for a date range.
 */
export function useWeatherHourly(
  stationId: string | null,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: weatherKeys.hourly(stationId ?? '', startDate, endDate),
    queryFn: async () => {
      const res = await fetch(
        `/api/weather/hourly?stationId=${stationId}&start=${startDate}&end=${endDate}`
      );
      if (!res.ok) throw new Error('Uurlijkse data ophalen mislukt');
      const json = await res.json();
      return json.data as Array<Record<string, unknown>>;
    },
    enabled: !!stationId && !!startDate && !!endDate,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch Buienradar rain forecast (client-side, 2-hour, 5-min intervals).
 * Polls every 5 minutes.
 */
export function useRainForecast(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: weatherKeys.rain(lat ?? 0, lon ?? 0),
    queryFn: async (): Promise<RainDataPoint[]> => {
      const url = BUIENRADAR_RAIN_TEXT_URL.replace('{lat}', String(lat)).replace(
        '{lon}',
        String(lon)
      );

      try {
        const res = await fetch(url);
        if (!res.ok) {
          // Fallback to proxy
          const proxyRes = await fetch(
            `/api/weather/rain-forecast?lat=${lat}&lon=${lon}`
          );
          if (!proxyRes.ok) return [];
          const text = await proxyRes.text();
          return parseRainText(text);
        }
        const text = await res.text();
        return parseRainText(text);
      } catch {
        // CORS blocked — try proxy
        try {
          const proxyRes = await fetch(
            `/api/weather/rain-forecast?lat=${lat}&lon=${lon}`
          );
          if (!proxyRes.ok) return [];
          const text = await proxyRes.text();
          return parseRainText(text);
        } catch {
          return [];
        }
      }
    },
    enabled: lat !== null && lon !== null,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Force refresh weather data for a station.
 */
export function useWeatherRefresh() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stationId: string) => {
      const res = await fetch('/api/weather/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId }),
      });
      if (!res.ok) throw new Error('Vernieuwen mislukt');
      return res.json();
    },
    onSuccess: (_data, stationId) => {
      // Invalidate all weather queries for this station (including multi-model & ensemble)
      queryClient.invalidateQueries({ queryKey: ['weather', 'current', stationId] });
      queryClient.invalidateQueries({ queryKey: ['weather', 'forecast', stationId] });
      queryClient.invalidateQueries({ queryKey: ['weather', 'hourly', stationId] });
      queryClient.invalidateQueries({ queryKey: ['weather', 'multimodel', stationId] });
      queryClient.invalidateQueries({ queryKey: ['weather', 'ensemble', stationId] });
    },
  });
}

/**
 * Initialize a weather station.
 * Finds the user's first parcel with a location, creates a station,
 * and fetches forecast + multi-model + ensemble data.
 * Uses quick=true to skip historical data for fast first-load.
 */
export function useWeatherInitialize() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: { latitude?: number; longitude?: number; parcelId?: string }) => {
      const res = await fetch('/api/weather/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          quick: true,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Initialisatie mislukt');
      }
      return res.json() as Promise<{ success: boolean; stationId: string }>;
    },
    onSuccess: () => {
      // Invalidate stations query so the UI picks up the new station
      queryClient.invalidateQueries({ queryKey: weatherKeys.stations });
    },
  });
}

// ============================================
// Expert Forecast Hooks
// ============================================

export type MultiModelData = {
  models: Record<
    string,
    {
      time: string[];
      temperature_c: (number | null)[];
      precipitation_mm: (number | null)[];
      wind_speed_ms: (number | null)[];
      humidity_pct: (number | null)[];
    }
  >;
  last_updated: string;
};

export type EnsembleStatsData = {
  stats: Array<{
    timestamp: string;
    min: number;
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    max: number;
  }>;
  members_count: number;
  last_updated: string;
};

/**
 * Fetch multi-model forecast data (5 models).
 */
export function useWeatherMultiModel(stationId: string | null) {
  return useQuery({
    queryKey: weatherKeys.multimodel(stationId ?? ''),
    queryFn: async (): Promise<MultiModelData> => {
      const res = await fetch(
        `/api/weather/multimodel?stationId=${stationId}`
      );
      if (!res.ok) throw new Error('Multi-model data ophalen mislukt');
      const json = await res.json();
      return json.data as MultiModelData;
    },
    enabled: !!stationId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Fetch ensemble statistics (percentiles) for a model + variable.
 */
export function useWeatherEnsemble(
  stationId: string | null,
  model: 'ecmwf_ifs' | 'gfs',
  variable: string
) {
  return useQuery({
    queryKey: weatherKeys.ensemble(stationId ?? '', model, variable),
    queryFn: async (): Promise<EnsembleStatsData> => {
      const res = await fetch(
        `/api/weather/ensemble?stationId=${stationId}&model=${model}&variable=${variable}`
      );
      if (!res.ok) throw new Error('Ensemble data ophalen mislukt');
      const json = await res.json();
      return json.data as EnsembleStatsData;
    },
    enabled: !!stationId,
    staleTime: 60 * 60 * 1000, // 60 minutes (ensemble updates slowly)
  });
}

// ============================================
// Helpers
// ============================================

/**
 * Parse Buienradar rain text response.
 * Format: 24 lines of "intensity|HH:MM"
 * Intensity 0 = no rain, > 0: mm/h = 10^((value - 109) / 32)
 */
function parseRainText(text: string): RainDataPoint[] {
  const lines = text.trim().split('\n');
  return lines
    .map((line) => {
      const [intensityStr, time] = line.split('|');
      if (!intensityStr || !time) return null;
      const intensity = parseInt(intensityStr, 10);
      const mmPerHour =
        intensity > 0 ? Math.pow(10, (intensity - 109) / 32) : 0;
      return {
        time: time.trim(),
        mmPerHour: Math.round(mmPerHour * 100) / 100,
        intensity,
      };
    })
    .filter((d): d is RainDataPoint => d !== null);
}
