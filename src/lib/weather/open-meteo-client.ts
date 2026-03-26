// ============================================================================
// Open-Meteo API Client
// Handles all HTTP communication with Open-Meteo forecast and archive APIs.
// ============================================================================

import {
  OPEN_METEO_FORECAST_URL,
  OPEN_METEO_ARCHIVE_URL,
  HOURLY_PARAMS,
  DAILY_PARAMS,
  FORECAST_DAYS,
  PAST_DAYS,
  DEFAULT_TIMEZONE,
} from './weather-constants';
import type { OpenMeteoHourlyResponse } from './weather-types';

/**
 * Fetch forecast + recent past data from Open-Meteo.
 * Returns hourly data for past_days + forecast_days and daily summaries.
 */
export async function fetchForecastData(
  latitude: number,
  longitude: number
): Promise<OpenMeteoHourlyResponse> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    hourly: HOURLY_PARAMS.join(','),
    daily: DAILY_PARAMS.join(','),
    timezone: DEFAULT_TIMEZONE,
    forecast_days: FORECAST_DAYS.toString(),
    past_days: PAST_DAYS.toString(),
  });

  const url = `${OPEN_METEO_FORECAST_URL}?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Open-Meteo forecast API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Fetch historical data from Open-Meteo archive API.
 * Use for fetching past seasons' data.
 */
export async function fetchHistoricalData(
  latitude: number,
  longitude: number,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<OpenMeteoHourlyResponse> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    hourly: HOURLY_PARAMS.join(','),
    daily: DAILY_PARAMS.join(','),
    timezone: DEFAULT_TIMEZONE,
    start_date: startDate,
    end_date: endDate,
  });

  const url = `${OPEN_METEO_ARCHIVE_URL}?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Open-Meteo archive API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Parse Open-Meteo hourly response into flat row objects ready for DB insert.
 * Calculates leaf_wetness_probability from humidity/dewpoint/precipitation.
 */
export function parseHourlyResponse(
  response: OpenMeteoHourlyResponse,
  stationId: string,
  isForecast: boolean
): Array<{
  station_id: string;
  timestamp: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number | null;
  wind_speed_ms: number | null;
  wind_direction: number | null;
  wind_gusts_ms: number | null;
  leaf_wetness_pct: number | null;
  soil_temp_6cm: number | null;
  solar_radiation: number | null;
  et0_mm: number | null;
  cloud_cover_pct: number | null;
  dew_point_c: number | null;
  is_forecast: boolean;
  data_source: string;
}> {
  const { hourly } = response;
  if (!hourly || !hourly.time) return [];

  return hourly.time.map((time, i) => {
    const temp = hourly.temperature_2m?.[i] ?? null;
    const humidity = hourly.relative_humidity_2m?.[i] ?? null;
    const precip = hourly.precipitation?.[i] ?? null;
    const dewPoint = hourly.dew_point_2m?.[i] ?? null;
    const directRad = hourly.direct_radiation?.[i] ?? null;
    const diffuseRad = hourly.diffuse_radiation?.[i] ?? null;

    // Calculate total solar radiation (W/m²)
    const solarRadiation = directRad !== null && diffuseRad !== null
      ? directRad + diffuseRad
      : directRad ?? diffuseRad;

    // Estimate leaf wetness probability
    const leafWetness = estimateLeafWetness(humidity, temp, dewPoint, precip);

    return {
      station_id: stationId,
      timestamp: time,
      temperature_c: temp,
      humidity_pct: humidity,
      precipitation_mm: precip,
      wind_speed_ms: hourly.wind_speed_10m?.[i] ?? null,
      wind_direction: hourly.wind_direction_10m?.[i] ?? null,
      wind_gusts_ms: hourly.wind_gusts_10m?.[i] ?? null,
      leaf_wetness_pct: leafWetness,
      soil_temp_6cm: hourly.soil_temperature_6cm?.[i] ?? null,
      solar_radiation: solarRadiation,
      et0_mm: hourly.et0_fao_evapotranspiration?.[i] ?? null,
      cloud_cover_pct: hourly.cloud_cover?.[i] ?? null,
      dew_point_c: dewPoint,
      model_name: 'best_match',
      is_forecast: isForecast,
      data_source: 'open-meteo',
    };
  });
}

// ---- Multi-Model Forecast ----

/** Open-Meteo model suffixes → our model_name mapping */
const MODEL_SUFFIX_MAP: Record<string, string> = {
  'ecmwf_ifs025': 'ecmwf_ifs',
  'icon_eu': 'icon_eu',
  'gfs_seamless': 'gfs',
  'meteofrance_arpege_seamless': 'meteofrance_arpege',
  'ecmwf_aifs025': 'ecmwf_aifs',
};

const MULTI_MODEL_IDS = Object.keys(MODEL_SUFFIX_MAP);

/**
 * Fetch forecast data from multiple weather models simultaneously.
 * Returns raw response with per-model suffixed arrays.
 */
export async function fetchMultiModelData(
  latitude: number,
  longitude: number
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    models: MULTI_MODEL_IDS.join(','),
    hourly: HOURLY_PARAMS.join(','),
    forecast_days: FORECAST_DAYS.toString(),
    past_days: '2',
    timezone: DEFAULT_TIMEZONE,
  });

  const url = `${OPEN_METEO_FORECAST_URL}?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Open-Meteo multi-model API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Parse multi-model response into per-model row arrays for DB insert.
 * Each model gets its own set of rows with the appropriate model_name.
 */
export function parseMultiModelResponse(
  response: Record<string, unknown>,
  stationId: string
): Map<string, Array<Record<string, unknown>>> {
  const hourly = response.hourly as Record<string, unknown[]> | undefined;
  if (!hourly || !hourly.time) return new Map();

  const times = hourly.time as string[];
  const result = new Map<string, Array<Record<string, unknown>>>();

  for (const [suffix, modelName] of Object.entries(MODEL_SUFFIX_MAP)) {
    const rows: Array<Record<string, unknown>> = [];

    for (let i = 0; i < times.length; i++) {
      const temp = getModelValue(hourly, 'temperature_2m', suffix, i);
      const humidity = getModelValue(hourly, 'relative_humidity_2m', suffix, i);
      const precip = getModelValue(hourly, 'precipitation', suffix, i);
      const dewPoint = getModelValue(hourly, 'dew_point_2m', suffix, i);
      const directRad = getModelValue(hourly, 'direct_radiation', suffix, i);
      const diffuseRad = getModelValue(hourly, 'diffuse_radiation', suffix, i);

      const solarRadiation = directRad !== null && diffuseRad !== null
        ? (directRad as number) + (diffuseRad as number)
        : directRad ?? diffuseRad;

      const leafWetness = estimateLeafWetness(
        humidity as number | null,
        temp as number | null,
        dewPoint as number | null,
        precip as number | null
      );

      rows.push({
        station_id: stationId,
        timestamp: times[i],
        model_name: modelName,
        temperature_c: temp,
        humidity_pct: humidity,
        precipitation_mm: precip,
        wind_speed_ms: getModelValue(hourly, 'wind_speed_10m', suffix, i),
        wind_direction: getModelValue(hourly, 'wind_direction_10m', suffix, i),
        wind_gusts_ms: getModelValue(hourly, 'wind_gusts_10m', suffix, i),
        leaf_wetness_pct: leafWetness,
        soil_temp_6cm: getModelValue(hourly, 'soil_temperature_6cm', suffix, i),
        solar_radiation: solarRadiation,
        et0_mm: getModelValue(hourly, 'et0_fao_evapotranspiration', suffix, i),
        cloud_cover_pct: getModelValue(hourly, 'cloud_cover', suffix, i),
        dew_point_c: dewPoint,
        is_forecast: true,
        data_source: 'open-meteo',
      });
    }

    // Only include model if it has data
    if (rows.some(r => r.temperature_c !== null)) {
      result.set(modelName, rows);
    }
  }

  return result;
}

/** Get a model-suffixed value from the hourly response. */
function getModelValue(
  hourly: Record<string, unknown[]>,
  variable: string,
  modelSuffix: string,
  index: number
): unknown {
  const key = `${variable}_${modelSuffix}`;
  const arr = hourly[key] as (number | null)[] | undefined;
  return arr?.[index] ?? null;
}

// ---- Ensemble Forecast ----

const ENSEMBLE_API_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';
const ENSEMBLE_MODELS = ['ecmwf_ifs025', 'gfs025'];
const ENSEMBLE_HOURLY_PARAMS = [
  'temperature_2m',
  'precipitation',
  'wind_speed_10m',
  'relative_humidity_2m',
];

/**
 * Key suffix patterns → our model_name for ensemble.
 * Open-Meteo ensemble API returns keys like:
 *   ECMWF: temperature_2m_member01_ecmwf_ifs025_ensemble
 *   GFS:   temperature_2m_member01_ncep_gefs025
 */
const ENSEMBLE_KEY_SUFFIX_MAP: Record<string, string> = {
  'ecmwf_ifs025_ensemble': 'ecmwf_ifs',
  'ncep_gefs025': 'gfs',
};

/**
 * Fetch ensemble data from Open-Meteo ensemble API.
 * Returns raw response with per-member suffixed arrays.
 */
export async function fetchEnsembleData(
  latitude: number,
  longitude: number
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    models: ENSEMBLE_MODELS.join(','),
    hourly: ENSEMBLE_HOURLY_PARAMS.join(','),
    forecast_days: FORECAST_DAYS.toString(),
    timezone: DEFAULT_TIMEZONE,
  });

  const url = `${ENSEMBLE_API_URL}?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Open-Meteo ensemble API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Parse ensemble response into per-model per-member rows for DB insert.
 * Returns a flat array of rows for weather_ensemble_hourly.
 *
 * Key patterns from the Open-Meteo ensemble API:
 *   ECMWF: {variable}_member{NN}_{ecmwf_ifs025_ensemble}
 *   GFS:   {variable}_member{NN}_{ncep_gefs025}
 */
export function parseEnsembleResponse(
  response: Record<string, unknown>,
  stationId: string
): Array<Record<string, unknown>> {
  const hourly = response.hourly as Record<string, unknown[]> | undefined;
  if (!hourly || !hourly.time) return [];

  const times = hourly.time as string[];
  const rows: Array<Record<string, unknown>> = [];

  // Scan all keys to detect model suffixes and member numbers
  // Key pattern: {variable}_member{NN}_{model_suffix}
  for (const [keySuffix, modelName] of Object.entries(ENSEMBLE_KEY_SUFFIX_MAP)) {
    const memberNumbers = new Set<number>();

    for (const key of Object.keys(hourly)) {
      // Match: temperature_2m_member01_ecmwf_ifs025_ensemble
      const regex = new RegExp(`_member(\\d+)_${keySuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      const match = key.match(regex);
      if (match) {
        memberNumbers.add(parseInt(match[1]!, 10));
      }
    }

    for (const member of memberNumbers) {
      const memberStr = String(member).padStart(2, '0');

      for (let i = 0; i < times.length; i++) {
        const getValue = (variable: string): number | null => {
          // Key: {variable}_member{NN}_{keySuffix}
          const key = `${variable}_member${memberStr}_${keySuffix}`;
          const arr = hourly[key] as (number | null)[] | undefined;
          return arr?.[i] ?? null;
        };

        rows.push({
          station_id: stationId,
          timestamp: times[i],
          model_name: modelName,
          member,
          temperature_c: getValue('temperature_2m'),
          precipitation_mm: getValue('precipitation'),
          wind_speed_ms: getValue('wind_speed_10m'),
          humidity_pct: getValue('relative_humidity_2m'),
        });
      }
    }
  }

  return rows;
}

/**
 * Estimate leaf wetness probability based on available weather parameters.
 * Open-Meteo doesn't provide direct leaf wetness sensor data.
 */
function estimateLeafWetness(
  humidity: number | null,
  temperature: number | null,
  dewPoint: number | null,
  precipitation: number | null
): number | null {
  if (humidity === null) return null;

  if (precipitation !== null && precipitation > 0) return 100;
  if (humidity > 95) return 90;
  if (humidity > 90) return 70;
  if (temperature !== null && dewPoint !== null && (temperature - dewPoint) < 2) return 50;
  if (humidity > 85) return 30;
  return 0;
}
