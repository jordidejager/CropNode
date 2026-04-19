/**
 * Powdery mildew service — orchestrates weather fetch, winter check, simulation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getHourlyRange,
  getOrCreateWeatherStation,
} from '@/lib/weather/weather-service';
import type { HourlyWeatherData } from '@/lib/weather/weather-types';
import { runMildewSimulation } from './simulation';
import {
  mildewToSeasonProgress,
  mildewToInfectionPeriods,
  mildewToKPIs,
} from './adapter';
import type {
  DiseaseModelConfig,
  ZiektedrukResult,
  HourlyWeatherInput,
} from '../types';
import { MILDEW_CONSTANTS as C } from './types';

const CHUNK_DAYS = 31;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toWeatherInput(data: HourlyWeatherData[]): HourlyWeatherInput[] {
  return data.map((d) => ({
    timestamp: d.timestamp,
    temperatureC: d.temperatureC,
    humidityPct: d.humidityPct,
    precipitationMm: d.precipitationMm,
    leafWetnessPct: d.leafWetnessPct,
    dewPointC: d.dewPointC,
    isForecast: d.isForecast,
  }));
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

/**
 * Look up the minimum winter temperature (Dec-Feb) from stored weather data.
 * Used to check winter-kill condition for overwintering inoculum.
 */
async function getMinWinterTemp(
  stationId: string,
  harvestYear: number,
  supabase: SupabaseClient
): Promise<number | null> {
  // Winter preceding this season: Dec (year-1) through Feb (year)
  const winterStart = `${harvestYear - 1}-12-01`;
  const winterEnd = `${harvestYear}-02-28`;

  const data = await fetchWeatherChunked(stationId, winterStart, winterEnd, supabase);
  if (data.length === 0) return null;

  let minT = Infinity;
  for (const h of data) {
    if (h.temperatureC !== null && h.temperatureC < minT) minT = h.temperatureC;
  }
  return minT === Infinity ? null : minT;
}

export async function calculateMildewResults(
  config: DiseaseModelConfig,
  supabase: SupabaseClient
): Promise<ZiektedrukResult> {
  // Resolve station
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
      throw new Error('Parcel heeft geen locatie — kan geen weerstation koppelen');
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

  const weatherInput = toWeatherInput(weatherData);
  const biofixDate = new Date(config.biofix_date + 'T00:00:00Z');

  // Get winter minimum temp for mortality check
  const minWinterTemp = await getMinWinterTemp(
    stationId,
    config.harvest_year,
    supabase
  );

  const simResult = runMildewSimulation({
    biofixDate,
    endDate: forecastEnd,
    latitude: lat,
    longitude: lng,
    inoculumPressure: config.inoculum_pressure,
    minWinterTemp,
    hourlyWeather: weatherInput.map((w) => ({
      timestamp: w.timestamp,
      temperatureC: w.temperatureC,
      humidityPct: w.humidityPct,
      precipitationMm: w.precipitationMm,
      leafWetnessPct: w.leafWetnessPct,
      dewPointC: w.dewPointC,
      isForecast: w.isForecast,
    })),
  });

  const seasonProgress = mildewToSeasonProgress(simResult);
  const infectionPeriods = mildewToInfectionPeriods(simResult);
  const kpis = mildewToKPIs(simResult, infectionPeriods);

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
