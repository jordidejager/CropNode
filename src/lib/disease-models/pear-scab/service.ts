/**
 * Pear scab service — weather fetch + simulation + adapter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getHourlyRange,
  getOrCreateWeatherStation,
} from '@/lib/weather/weather-service';
import type { HourlyWeatherData } from '@/lib/weather/weather-types';
import { runPearScabSimulation } from './simulation';
import {
  pearScabToSeasonProgress,
  pearScabToInfectionPeriods,
  pearScabToKPIs,
} from './adapter';
import type { DiseaseModelConfig, ZiektedrukResult } from '../types';

const CHUNK_DAYS = 31;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getStationForParcel(
  parcelId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from('parcel_weather_stations')
    .select('station_id')
    .eq('parcel_id', parcelId)
    .single();
  return (data?.station_id as string) ?? null;
}

async function fetchWeatherChunked(
  stationId: string,
  startDate: string,
  endDate: string,
  supabase: SupabaseClient
): Promise<HourlyWeatherData[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const all: HourlyWeatherData[] = [];
  let chunkStart = new Date(start);
  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    const chunk = await getHourlyRange(
      stationId,
      formatDate(chunkStart),
      formatDate(chunkEnd),
      supabase
    );
    all.push(...chunk);
    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }
  return all;
}

export async function calculatePearScabResults(
  config: DiseaseModelConfig,
  supabase: SupabaseClient
): Promise<ZiektedrukResult> {
  let stationId: string | undefined = config.weather_station_id ?? undefined;
  let lat: number | undefined;
  let lng: number | undefined;

  if (stationId) {
    const { data: station } = await supabase
      .from('weather_stations')
      .select('latitude, longitude')
      .eq('id', stationId)
      .single();
    if (station) {
      lat = Number(station.latitude);
      lng = Number(station.longitude);
    }
  }

  if (!stationId || lat === undefined || lng === undefined) {
    const { data: parcel } = await supabase
      .from('parcels')
      .select('location')
      .eq('id', config.parcel_id)
      .single();
    const loc = parcel?.location as { lat: number; lng: number } | undefined;
    if (!loc) {
      throw new Error('Parcel heeft geen locatie');
    }
    lat = loc.lat;
    lng = loc.lng;

    stationId = (await getStationForParcel(config.parcel_id, supabase)) ?? undefined;
    if (!stationId) {
      stationId = await getOrCreateWeatherStation(config.user_id, lat, lng, supabase);
      await supabase
        .from('parcel_weather_stations')
        .upsert({ parcel_id: config.parcel_id, station_id: stationId });
    }
  }

  const today = new Date();
  const forecastEnd = new Date(today);
  forecastEnd.setDate(forecastEnd.getDate() + 14);

  const weatherData = await fetchWeatherChunked(
    stationId,
    config.biofix_date,
    formatDate(forecastEnd),
    supabase
  );

  const biofixDate = new Date(config.biofix_date + 'T00:00:00Z');
  const simResult = runPearScabSimulation({
    biofixDate,
    endDate: forecastEnd,
    latitude: lat,
    longitude: lng,
    inoculumPressure: config.inoculum_pressure,
    hourlyWeather: weatherData.map((w) => ({
      timestamp: w.timestamp,
      temperatureC: w.temperatureC,
      humidityPct: w.humidityPct,
      precipitationMm: w.precipitationMm,
      leafWetnessPct: w.leafWetnessPct,
      isForecast: w.isForecast,
    })),
  });

  const seasonProgress = pearScabToSeasonProgress(simResult);
  const infectionPeriods = pearScabToInfectionPeriods(simResult);
  const kpis = pearScabToKPIs(simResult, infectionPeriods);

  return {
    configured: true,
    config,
    seasonProgress,
    infectionPeriods,
    kpis,
    coverageTimeline: [],
    infectionCoverage: {},
    sprayEvents: [],
  };
}
