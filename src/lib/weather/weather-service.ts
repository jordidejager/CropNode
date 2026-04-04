// ============================================================================
// Weather Service
// Central service handling API calls, data storage, deduplication, aggregation.
// All DB functions accept an optional Supabase client — when omitted, a
// cookie-based client is used (API routes). The cron job passes a service-role
// client to bypass RLS.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  fetchForecastData,
  fetchHistoricalData,
  parseHourlyResponse,
  fetchMultiModelData,
  parseMultiModelResponse,
  fetchEnsembleData,
  parseEnsembleResponse,
} from './open-meteo-client';
import { aggregateHourlyToDaily } from './weather-calculations';
import {
  FORECAST_REFRESH_INTERVAL_MS,
  MULTIMODEL_REFRESH_INTERVAL_MS,
  ENSEMBLE_REFRESH_INTERVAL_MS,
  ENSEMBLE_MAX_AGE_DAYS,
  MULTIMODEL_FORECAST_MAX_AGE_DAYS,
  HISTORICAL_YEARS_BACK,
  DEFAULT_TIMEZONE,
} from './weather-constants';
import type {
  WeatherStation,
  HourlyWeatherData,
  DailyWeatherData,
  EnsembleStats,
  EnsembleVariable,
} from './weather-types';

/**
 * Create a service-role Supabase client that bypasses RLS.
 * Used by the cron job and background tasks without a user session.
 */
export function createServiceRoleClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );
}

/** Get a default cookie-based client (for API route context). */
async function getDefaultClient(): Promise<SupabaseClient> {
  return createClient() as Promise<SupabaseClient>;
}

// ---- Station Management ----

/**
 * Get or create a weather station for given coordinates.
 * Coordinates are rounded to 2 decimals (~1km) to share stations.
 */
export async function getOrCreateWeatherStation(
  userId: string,
  latitude: number,
  longitude: number,
  db?: SupabaseClient
): Promise<string> {
  const supabase = db ?? await getDefaultClient();
  const roundedLat = Math.round(latitude * 100) / 100;
  const roundedLng = Math.round(longitude * 100) / 100;

  // Check for existing station at rounded coordinates
  const { data: existing } = await supabase
    .from('weather_stations')
    .select('id')
    .eq('user_id', userId)
    .eq('latitude', roundedLat)
    .eq('longitude', roundedLng)
    .single();

  if (existing) return existing.id;

  // Create new station
  const { data: newStation, error } = await supabase
    .from('weather_stations')
    .insert({
      user_id: userId,
      latitude: roundedLat,
      longitude: roundedLng,
      timezone: DEFAULT_TIMEZONE,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create weather station: ${error.message}`);
  return newStation.id;
}

/**
 * Get a weather station by ID.
 */
export async function getWeatherStation(
  stationId: string,
  db?: SupabaseClient
): Promise<WeatherStation | null> {
  const supabase = db ?? await getDefaultClient();
  const { data } = await supabase
    .from('weather_stations')
    .select('*')
    .eq('id', stationId)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    latitude: parseFloat(data.latitude),
    longitude: parseFloat(data.longitude),
    elevationM: data.elevation_m,
    timezone: data.timezone,
    knmiStationId: data.knmi_station_id,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Get all weather stations for a user.
 */
export async function getUserWeatherStations(
  userId: string,
  db?: SupabaseClient
): Promise<WeatherStation[]> {
  const supabase = db ?? await getDefaultClient();
  const { data } = await supabase
    .from('weather_stations')
    .select('*')
    .eq('user_id', userId);

  if (!data) return [];

  return data.map(s => ({
    id: s.id,
    userId: s.user_id,
    name: s.name,
    latitude: parseFloat(s.latitude),
    longitude: parseFloat(s.longitude),
    elevationM: s.elevation_m,
    timezone: s.timezone,
    knmiStationId: s.knmi_station_id,
    createdAt: new Date(s.created_at),
    updatedAt: new Date(s.updated_at),
  }));
}

// ---- Data Fetching & Storage ----

/**
 * Fetch current + forecast data from Open-Meteo and store it.
 */
export async function fetchAndStoreForecast(
  stationId: string,
  db?: SupabaseClient
): Promise<number> {
  const supabase = db ?? await getDefaultClient();
  const station = await getWeatherStation(stationId, supabase);
  if (!station) throw new Error(`Station ${stationId} not found`);

  const response = await fetchForecastData(station.latitude, station.longitude);

  // Update elevation if we got it
  if (response.elevation && !station.elevationM) {
    await supabase
      .from('weather_stations')
      .update({ elevation_m: Math.round(response.elevation) })
      .eq('id', stationId);
  }

  // Determine the cutoff: timestamps in the past are historical, future are forecast
  const now = new Date();

  const allRows = parseHourlyResponse(response, stationId, false);

  // Split into historical (past) and forecast (future) rows
  const rows = allRows.map(row => ({
    ...row,
    is_forecast: new Date(row.timestamp) > now,
  }));

  if (rows.length === 0) return 0;

  const count = await upsertHourlyData(rows, supabase);

  // Log the fetch
  await logFetch(stationId, 'forecast', null, null, 'success', count, undefined, supabase);

  return count;
}

/**
 * Fetch historical data for a station and date range.
 */
export async function fetchAndStoreHistorical(
  stationId: string,
  startDate: string,
  endDate: string,
  db?: SupabaseClient
): Promise<number> {
  const supabase = db ?? await getDefaultClient();
  const station = await getWeatherStation(stationId, supabase);
  if (!station) throw new Error(`Station ${stationId} not found`);

  const response = await fetchHistoricalData(
    station.latitude,
    station.longitude,
    startDate,
    endDate
  );

  const rows = parseHourlyResponse(response, stationId, false);
  if (rows.length === 0) return 0;

  const count = await upsertHourlyData(rows, supabase);

  await logFetch(stationId, 'historical', startDate, endDate, 'success', count, undefined, supabase);

  return count;
}

/**
 * Fetch historical data for a complete year.
 */
export async function fetchAndStoreSeason(
  stationId: string,
  year: number,
  db?: SupabaseClient
): Promise<number> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // Clamp end date to yesterday at most (archive doesn't have today)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const clampedEnd = endDate > yesterday.toISOString().split('T')[0]!
    ? yesterday.toISOString().split('T')[0]!
    : endDate;

  // Only fetch if start date is in the past
  if (startDate > clampedEnd) return 0;

  return fetchAndStoreHistorical(stationId, startDate, clampedEnd, db);
}

/**
 * Upsert hourly data rows. Uses ON CONFLICT to deduplicate.
 * Processes in batches of 500 rows.
 */
async function upsertHourlyData(
  rows: Array<Record<string, unknown>>,
  supabase: SupabaseClient
): Promise<number> {
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  const nowIso = new Date().toISOString();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(row => ({
      ...row,
      created_at: nowIso, // Update timestamp on each refresh so staleness check works
    }));
    const { error, count } = await supabase
      .from('weather_data_hourly')
      .upsert(batch, {
        onConflict: 'station_id,timestamp,model_name,is_forecast',
        ignoreDuplicates: false,
      })
      .select('id');

    if (error) {
      console.error(`[WeatherService] Upsert batch error:`, error.message);
      continue;
    }

    totalInserted += count ?? batch.length;
  }

  return totalInserted;
}

// ---- Daily Aggregation ----

/**
 * Compute and store daily aggregation for a specific date.
 */
export async function aggregateDaily(
  stationId: string,
  date: string, // YYYY-MM-DD
  db?: SupabaseClient
): Promise<void> {
  const supabase = db ?? await getDefaultClient();

  // Fetch hourly data for this date
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  const { data: hourlyRows } = await supabase
    .from('weather_data_hourly')
    .select('*')
    .eq('station_id', stationId)
    .gte('timestamp', startOfDay)
    .lte('timestamp', endOfDay)
    .order('timestamp')
    .limit(3000);

  if (!hourlyRows || hourlyRows.length === 0) return;

  // Check if any row is forecast
  const isForecast = hourlyRows.some(r => r.is_forecast);

  const aggregated = aggregateHourlyToDaily(hourlyRows);

  await supabase
    .from('weather_data_daily')
    .upsert({
      station_id: stationId,
      date,
      ...aggregated,
      is_forecast: isForecast,
      data_source: 'open-meteo',
    }, {
      onConflict: 'station_id,date,is_forecast',
    });
}

/**
 * Compute daily aggregations for a range of dates.
 */
export async function aggregateDailyRange(
  stationId: string,
  startDate: string,
  endDate: string,
  db?: SupabaseClient
): Promise<void> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]!;
    await aggregateDaily(stationId, dateStr, db);
    current.setDate(current.getDate() + 1);
  }
}

// ---- Refresh Logic ----

/**
 * Check if data needs refreshing based on fetch log.
 */
export async function needsRefresh(
  stationId: string,
  fetchType: string,
  db?: SupabaseClient
): Promise<boolean> {
  const supabase = db ?? await getDefaultClient();

  const { data } = await supabase
    .from('weather_fetch_log')
    .select('fetched_at')
    .eq('station_id', stationId)
    .eq('fetch_type', fetchType)
    .eq('status', 'success')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return true;

  const lastFetch = new Date(data.fetched_at);
  const elapsed = Date.now() - lastFetch.getTime();

  if (fetchType === 'forecast') {
    return elapsed > FORECAST_REFRESH_INTERVAL_MS;
  }
  if (fetchType === 'forecast_multimodel') {
    return elapsed > MULTIMODEL_REFRESH_INTERVAL_MS;
  }
  if (fetchType === 'forecast_ensemble') {
    return elapsed > ENSEMBLE_REFRESH_INTERVAL_MS;
  }

  // Historical data: only fetch once
  return false;
}

/**
 * Refresh all weather stations (for cron) or for a specific user.
 * Accepts a service-role client to bypass RLS.
 */
export async function refreshAllStations(db?: SupabaseClient, userId?: string): Promise<number> {
  const supabase = db ?? await getDefaultClient();

  let query = supabase.from('weather_stations').select('id');
  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data: stations } = await query;
  if (!stations || stations.length === 0) return 0;

  let refreshed = 0;

  for (const station of stations) {
    try {
      // 1. Best-match forecast (every 3 hours)
      const shouldRefreshForecast = await needsRefresh(station.id, 'forecast', supabase);
      if (shouldRefreshForecast) {
        await fetchAndStoreForecast(station.id, supabase);

        const today = new Date().toISOString().split('T')[0]!;
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
        await aggregateDaily(station.id, today, supabase);
        await aggregateDaily(station.id, yesterday, supabase);

        refreshed++;
      }

      // 2. Multi-model forecast (every 6 hours)
      const shouldRefreshMultiModel = await needsRefresh(station.id, 'forecast_multimodel', supabase);
      if (shouldRefreshMultiModel) {
        await fetchAndStoreMultiModel(station.id, supabase);
      }

      // 3. Ensemble data (every 12 hours)
      const shouldRefreshEnsemble = await needsRefresh(station.id, 'forecast_ensemble', supabase);
      if (shouldRefreshEnsemble) {
        await fetchAndStoreEnsemble(station.id, supabase);
      }

      // 4. Cleanup old data
      await cleanupOldData(station.id, supabase);
    } catch (error) {
      console.error(`[WeatherService] Failed to refresh station ${station.id}:`, error);
      await logFetch(
        station.id,
        'forecast',
        null,
        null,
        'error',
        0,
        error instanceof Error ? error.message : 'Unknown error',
        supabase
      );
    }
  }

  return refreshed;
}

// ---- Initialization ----

/**
 * Initialize a new weather station: create record, fetch current season + 2 years back.
 * Returns the station ID.
 */
export async function initializeStation(
  userId: string,
  latitude: number,
  longitude: number,
  db?: SupabaseClient
): Promise<string> {
  const supabase = db ?? await getDefaultClient();
  const stationId = await getOrCreateWeatherStation(userId, latitude, longitude, supabase);

  const currentYear = new Date().getFullYear();

  // Fetch historical data: current year + previous years
  for (let yearOffset = HISTORICAL_YEARS_BACK; yearOffset >= 0; yearOffset--) {
    const year = currentYear - yearOffset;
    try {
      await fetchAndStoreSeason(stationId, year, supabase);
    } catch (error) {
      console.error(`[WeatherService] Failed to fetch season ${year}:`, error);
    }
  }

  // Fetch current forecast
  try {
    await fetchAndStoreForecast(stationId, supabase);
  } catch (error) {
    console.error(`[WeatherService] Failed to fetch forecast:`, error);
  }

  // Compute daily aggregations for all fetched data
  const startDate = `${currentYear - HISTORICAL_YEARS_BACK}-01-01`;
  const today = new Date().toISOString().split('T')[0]!;
  try {
    await aggregateDailyRange(stationId, startDate, today, supabase);
  } catch (error) {
    console.error(`[WeatherService] Failed to aggregate daily:`, error);
  }

  return stationId;
}

// ---- Query Methods ----

/**
 * Get weather data at a specific timestamp (for spray registration enrichment).
 * Returns the closest hourly record.
 */
export async function getWeatherAtTime(
  stationId: string,
  timestamp: Date,
  db?: SupabaseClient
): Promise<HourlyWeatherData | null> {
  const supabase = db ?? await getDefaultClient();

  const thirtyMinBefore = new Date(timestamp.getTime() - 30 * 60 * 1000).toISOString();
  const thirtyMinAfter = new Date(timestamp.getTime() + 30 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('weather_data_hourly')
    .select('*')
    .eq('station_id', stationId)
    .eq('model_name', 'best_match')
    .gte('timestamp', thirtyMinBefore)
    .lte('timestamp', thirtyMinAfter)
    .order('timestamp')
    .limit(1)
    .single();

  if (!data) return null;

  return mapHourlyRow(data);
}

/**
 * Get hourly data for a date range.
 */
export async function getHourlyRange(
  stationId: string,
  startDate: string,
  endDate: string,
  db?: SupabaseClient
): Promise<HourlyWeatherData[]> {
  const supabase = db ?? await getDefaultClient();

  const { data } = await supabase
    .from('weather_data_hourly')
    .select('*')
    .eq('station_id', stationId)
    .eq('model_name', 'best_match')
    .gte('timestamp', `${startDate}T00:00:00`)
    .lte('timestamp', `${endDate}T23:59:59`)
    .order('timestamp')
    .limit(3000);

  return (data ?? []).map(mapHourlyRow);
}

/**
 * Get daily data for a date range.
 */
export async function getDailyRange(
  stationId: string,
  startDate: string,
  endDate: string,
  db?: SupabaseClient
): Promise<DailyWeatherData[]> {
  const supabase = db ?? await getDefaultClient();

  const { data } = await supabase
    .from('weather_data_daily')
    .select('*')
    .eq('station_id', stationId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  return (data ?? []).map(mapDailyRow);
}

/**
 * Get current conditions + 48-hour forecast (hourly).
 */
export async function getCurrentAndForecast(
  stationId: string,
  db?: SupabaseClient
): Promise<HourlyWeatherData[]> {
  const supabase = db ?? await getDefaultClient();

  const now = new Date();
  const twoDaysLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const { data } = await supabase
    .from('weather_data_hourly')
    .select('*')
    .eq('station_id', stationId)
    .eq('model_name', 'best_match')
    .gte('timestamp', twoHoursAgo.toISOString())
    .lte('timestamp', twoDaysLater.toISOString())
    .order('timestamp')
    .limit(3000);

  return (data ?? []).map(mapHourlyRow);
}

/**
 * Get 16-day forecast (daily).
 */
export async function getForecastDaily(
  stationId: string,
  db?: SupabaseClient
): Promise<DailyWeatherData[]> {
  const supabase = db ?? await getDefaultClient();

  const today = new Date().toISOString().split('T')[0]!;
  const sixteenDaysLater = new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0]!;

  const { data } = await supabase
    .from('weather_data_daily')
    .select('*')
    .eq('station_id', stationId)
    .gte('date', today)
    .lte('date', sixteenDaysLater)
    .order('date');

  return (data ?? []).map(mapDailyRow);
}

// ---- Multi-Model Forecast ----

/**
 * Fetch forecast from all 5 weather models and store per model in weather_data_hourly.
 */
export async function fetchAndStoreMultiModel(
  stationId: string,
  db?: SupabaseClient
): Promise<void> {
  const supabase = db ?? await getDefaultClient();
  const station = await getWeatherStation(stationId, supabase);
  if (!station) throw new Error(`Station ${stationId} not found`);

  const response = await fetchMultiModelData(station.latitude, station.longitude);
  const modelRows = parseMultiModelResponse(response, stationId);

  let totalRecords = 0;

  for (const [, rows] of modelRows) {
    const count = await upsertHourlyData(rows, supabase);
    totalRecords += count;
  }

  await logFetch(stationId, 'forecast_multimodel', null, null, 'success', totalRecords, undefined, supabase);
}

/**
 * Get multi-model forecast data grouped per model.
 */
export async function getMultiModelForecast(
  stationId: string,
  db?: SupabaseClient
): Promise<{
  models: Record<string, { time: string[]; temperature_c: (number | null)[]; precipitation_mm: (number | null)[]; wind_speed_ms: (number | null)[]; humidity_pct: (number | null)[] }>;
  last_updated: string;
}> {
  const supabase = db ?? await getDefaultClient();

  // Filter from start of today to reduce rows, then paginate to beat PostgREST 1000-row server limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const baseQuery = () =>
    supabase
      .from('weather_data_hourly')
      .select('timestamp, model_name, temperature_c, precipitation_mm, wind_speed_ms, humidity_pct')
      .eq('station_id', stationId)
      .eq('is_forecast', true)
      .neq('model_name', 'best_match')
      .gte('timestamp', todayISO)
      .order('timestamp');

  // Fetch in two pages (PostgREST max_rows = 1000)
  const [page1, page2] = await Promise.all([
    baseQuery().range(0, 999),
    baseQuery().range(1000, 2499),
  ]);

  const data = [...(page1.data ?? []), ...(page2.data ?? [])];

  if (data.length === 0) {
    return { models: {}, last_updated: new Date().toISOString() };
  }

  // Group by model
  const models: Record<string, { time: string[]; temperature_c: (number | null)[]; precipitation_mm: (number | null)[]; wind_speed_ms: (number | null)[]; humidity_pct: (number | null)[] }> = {};

  for (const row of data) {
    const model = row.model_name as string;
    if (!models[model]) {
      models[model] = { time: [], temperature_c: [], precipitation_mm: [], wind_speed_ms: [], humidity_pct: [] };
    }
    models[model].time.push(row.timestamp);
    models[model].temperature_c.push(row.temperature_c);
    models[model].precipitation_mm.push(row.precipitation_mm);
    models[model].wind_speed_ms.push(row.wind_speed_ms);
    models[model].humidity_pct.push(row.humidity_pct);
  }

  // Get last fetch time
  const { data: fetchLog } = await supabase
    .from('weather_fetch_log')
    .select('fetched_at')
    .eq('station_id', stationId)
    .eq('fetch_type', 'forecast_multimodel')
    .eq('status', 'success')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single();

  return {
    models,
    last_updated: fetchLog?.fetched_at ?? new Date().toISOString(),
  };
}

// ---- Ensemble Forecast ----

/**
 * Fetch ensemble data and store per member in weather_ensemble_hourly.
 * Cleans up ensemble data older than 3 days after successful fetch.
 */
export async function fetchAndStoreEnsemble(
  stationId: string,
  db?: SupabaseClient
): Promise<void> {
  const supabase = db ?? await getDefaultClient();
  const station = await getWeatherStation(stationId, supabase);
  if (!station) throw new Error(`Station ${stationId} not found`);

  const response = await fetchEnsembleData(station.latitude, station.longitude);
  const rows = parseEnsembleResponse(response, stationId);

  if (rows.length === 0) {
    await logFetch(stationId, 'forecast_ensemble', null, null, 'success', 0, undefined, supabase);
    return;
  }

  // Upsert in batches
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('weather_ensemble_hourly')
      .upsert(batch, {
        onConflict: 'station_id,timestamp,model_name,member',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[WeatherService] Ensemble upsert batch error:`, error.message);
      continue;
    }
    totalInserted += batch.length;
  }

  await logFetch(stationId, 'forecast_ensemble', null, null, 'success', totalInserted, undefined, supabase);
}

/**
 * Get server-side computed ensemble statistics.
 * Returns per timestamp: min, max, p10, p25, median, p75, p90.
 */
export async function getEnsembleStats(
  stationId: string,
  model: 'ecmwf_ifs' | 'gfs',
  variable: EnsembleVariable,
  db?: SupabaseClient
): Promise<{ stats: EnsembleStats[]; members_count: number; last_updated: string }> {
  const supabase = db ?? await getDefaultClient();

  // Map variable names to column names
  const columnMap: Record<EnsembleVariable, string> = {
    temperature_c: 'temperature_c',
    precipitation_mm: 'precipitation_mm',
    wind_speed_ms: 'wind_speed_ms',
    humidity_pct: 'humidity_pct',
  };

  const column = columnMap[variable];

  // Use RPC for percentile calculations (PERCENTILE_CONT not available via PostgREST)
  const { data, error } = await supabase.rpc('get_ensemble_stats', {
    p_station_id: stationId,
    p_model_name: model,
    p_column_name: column,
  });

  if (error) {
    console.error(`[WeatherService] Ensemble stats RPC error:`, error.message);
    return { stats: [], members_count: 0, last_updated: new Date().toISOString() };
  }

  // Get member count
  const { data: memberData } = await supabase
    .from('weather_ensemble_hourly')
    .select('member')
    .eq('station_id', stationId)
    .eq('model_name', model)
    .limit(100);

  const membersCount = new Set(memberData?.map(r => r.member) ?? []).size;

  // Get last fetch time
  const { data: fetchLog } = await supabase
    .from('weather_fetch_log')
    .select('fetched_at')
    .eq('station_id', stationId)
    .eq('fetch_type', 'forecast_ensemble')
    .eq('status', 'success')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single();

  return {
    stats: (data ?? []) as EnsembleStats[],
    members_count: membersCount,
    last_updated: fetchLog?.fetched_at ?? new Date().toISOString(),
  };
}

// ---- Data Cleanup ----

/**
 * Clean up old weather data to prevent unbounded growth.
 * - Ensemble data: older than 3 days
 * - Multi-model forecast data: older than 7 days (keeps best_match for history)
 */
export async function cleanupOldData(
  stationId: string,
  db?: SupabaseClient
): Promise<void> {
  const supabase = db ?? await getDefaultClient();

  const threeDaysAgo = new Date(Date.now() - ENSEMBLE_MAX_AGE_DAYS * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - MULTIMODEL_FORECAST_MAX_AGE_DAYS * 86400000).toISOString();

  // Clean ensemble data
  await supabase
    .from('weather_ensemble_hourly')
    .delete()
    .eq('station_id', stationId)
    .lt('timestamp', threeDaysAgo);

  // Clean multi-model forecast data (keep best_match)
  await supabase
    .from('weather_data_hourly')
    .delete()
    .eq('station_id', stationId)
    .eq('is_forecast', true)
    .neq('model_name', 'best_match')
    .lt('timestamp', sevenDaysAgo);
}

// ---- Fetch Logging ----

async function logFetch(
  stationId: string,
  fetchType: string,
  dateRangeStart: string | null,
  dateRangeEnd: string | null,
  status: string,
  recordsFetched: number,
  errorMessage?: string,
  db?: SupabaseClient
): Promise<void> {
  const supabase = db ?? await getDefaultClient();
  await supabase.from('weather_fetch_log').insert({
    station_id: stationId,
    fetch_type: fetchType,
    date_range_start: dateRangeStart,
    date_range_end: dateRangeEnd,
    status,
    records_fetched: recordsFetched,
    error_message: errorMessage ?? null,
  });
}

// ---- Row Mappers ----

function mapHourlyRow(row: Record<string, unknown>): HourlyWeatherData {
  return {
    id: row.id as number,
    stationId: row.station_id as string,
    timestamp: new Date(row.timestamp as string),
    modelName: (row.model_name as string) ?? 'best_match',
    temperatureC: row.temperature_c as number | null,
    humidityPct: row.humidity_pct as number | null,
    precipitationMm: row.precipitation_mm as number | null,
    windSpeedMs: row.wind_speed_ms as number | null,
    windDirection: row.wind_direction as number | null,
    windGustsMs: row.wind_gusts_ms as number | null,
    leafWetnessPct: row.leaf_wetness_pct as number | null,
    soilTemp6cm: row.soil_temp_6cm as number | null,
    solarRadiation: row.solar_radiation as number | null,
    et0Mm: row.et0_mm as number | null,
    cloudCoverPct: row.cloud_cover_pct as number | null,
    dewPointC: row.dew_point_c as number | null,
    isForecast: row.is_forecast as boolean,
    dataSource: row.data_source as string,
    createdAt: new Date(row.created_at as string),
  };
}

function mapDailyRow(row: Record<string, unknown>): DailyWeatherData {
  return {
    id: row.id as number,
    stationId: row.station_id as string,
    date: row.date as string,
    tempMinC: row.temp_min_c as number | null,
    tempMaxC: row.temp_max_c as number | null,
    tempAvgC: row.temp_avg_c as number | null,
    precipitationSum: row.precipitation_sum as number | null,
    humidityAvgPct: row.humidity_avg_pct as number | null,
    windSpeedMaxMs: row.wind_speed_max_ms as number | null,
    windSpeedAvgMs: row.wind_speed_avg_ms as number | null,
    leafWetnessHrs: row.leaf_wetness_hrs as number | null,
    et0SumMm: row.et0_sum_mm as number | null,
    solarRadiationSum: row.solar_radiation_sum as number | null,
    gddBase5: row.gdd_base5 as number | null,
    gddBase10: row.gdd_base10 as number | null,
    frostHours: row.frost_hours as number | null,
    isForecast: row.is_forecast as boolean,
    dataSource: row.data_source as string,
    createdAt: new Date(row.created_at as string),
  };
}
