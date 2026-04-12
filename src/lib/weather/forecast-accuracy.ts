/**
 * Forecast Accuracy — compares Open-Meteo forecast data with KNMI observations.
 *
 * Answers the question: "How accurate was yesterday's forecast?"
 * Shows forecast vs observed for temp, precip, wind over the past 7 days.
 *
 * Data sources:
 * - Forecast: weather_data_daily (is_forecast=true, captured at forecast time)
 * - Observed: knmi_observations_daily (actual measurements from KNMI station)
 *
 * The KNMI station is linked to the weather station via weather_stations.knmi_station_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface ForecastAccuracyDay {
  date: string; // YYYY-MM-DD

  // Forecast values (what we predicted)
  forecastTempMax: number | null;
  forecastTempMin: number | null;
  forecastPrecip: number | null;
  forecastWindMax: number | null;

  // Observed values (what actually happened)
  observedTempMax: number | null;
  observedTempMin: number | null;
  observedPrecip: number | null;
  observedWindMax: number | null;

  // Errors
  tempMaxError: number | null;  // forecast - observed
  tempMinError: number | null;
  precipError: number | null;
  windMaxError: number | null;
}

export interface ForecastAccuracySummary {
  days: ForecastAccuracyDay[];
  metrics: {
    tempMaxMAE: number | null;   // Mean Absolute Error
    tempMinMAE: number | null;
    precipMAE: number | null;
    tempMaxBias: number | null;  // Positive = forecast too warm
    precipBias: number | null;   // Positive = forecast too wet
  };
  knmiStationName: string | null;
}

// ============================================================================
// Query
// ============================================================================

/**
 * Get forecast vs observation comparison for the past N days.
 */
export async function getForecastAccuracy(
  stationId: string,
  days: number,
  db: SupabaseClient
): Promise<ForecastAccuracySummary> {
  // 1. Get station info + linked KNMI station
  const { data: station } = await (db as any)
    .from('weather_stations')
    .select('id, name, knmi_station_id')
    .eq('id', stationId)
    .single();

  if (!station?.knmi_station_id) {
    return {
      days: [],
      metrics: { tempMaxMAE: null, tempMinMAE: null, precipMAE: null, tempMaxBias: null, precipBias: null },
      knmiStationName: null,
    };
  }

  // 2. Date range: past N days (excluding today — no observed data yet)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days + 1);

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  // 3. Fetch forecast daily data
  const { data: forecastData } = await (db as any)
    .from('weather_data_daily')
    .select('date, temp_max_c, temp_min_c, precipitation_sum_mm, wind_speed_max_ms')
    .eq('station_id', stationId)
    .gte('date', startStr)
    .lte('date', endStr)
    .order('date');

  // 4. Fetch KNMI observed daily data
  const { data: observedData } = await (db as any)
    .from('knmi_observations_daily')
    .select('date, temp_max_c, temp_min_c, precipitation_sum_mm, wind_max_ms')
    .eq('station_code', station.knmi_station_id)
    .gte('date', startStr)
    .lte('date', endStr)
    .order('date');

  // 5. Get KNMI station name
  const { data: knmiStation } = await (db as any)
    .from('knmi_stations')
    .select('name')
    .eq('code', station.knmi_station_id)
    .single();

  // 6. Merge by date
  type DailyRow = { date: string; temp_max_c: number | null; temp_min_c: number | null; precipitation_sum_mm: number | null; wind_speed_max_ms?: number | null; wind_max_ms?: number | null };
  const forecastMap = new Map<string, DailyRow>((forecastData ?? []).map((d: DailyRow) => [d.date, d]));
  const observedMap = new Map<string, DailyRow>((observedData ?? []).map((d: DailyRow) => [d.date, d]));

  const allDates = new Set([...forecastMap.keys(), ...observedMap.keys()]);
  const sortedDates = Array.from(allDates).sort();

  const result: ForecastAccuracyDay[] = [];
  const errors = { tempMax: [] as number[], tempMin: [] as number[], precip: [] as number[] };

  for (const date of sortedDates) {
    const f = forecastMap.get(date);
    const o = observedMap.get(date);

    const day: ForecastAccuracyDay = {
      date,
      forecastTempMax: f?.temp_max_c ?? null,
      forecastTempMin: f?.temp_min_c ?? null,
      forecastPrecip: f?.precipitation_sum_mm ?? null,
      forecastWindMax: f?.wind_speed_max_ms ?? null,
      observedTempMax: o?.temp_max_c ?? null,
      observedTempMin: o?.temp_min_c ?? null,
      observedPrecip: o?.precipitation_sum_mm ?? null,
      observedWindMax: o?.wind_max_ms ?? null,
      tempMaxError: null,
      tempMinError: null,
      precipError: null,
      windMaxError: null,
    };

    if (day.forecastTempMax !== null && day.observedTempMax !== null) {
      day.tempMaxError = Math.round((day.forecastTempMax - day.observedTempMax) * 10) / 10;
      errors.tempMax.push(day.tempMaxError);
    }
    if (day.forecastTempMin !== null && day.observedTempMin !== null) {
      day.tempMinError = Math.round((day.forecastTempMin - day.observedTempMin) * 10) / 10;
      errors.tempMin.push(day.tempMinError);
    }
    if (day.forecastPrecip !== null && day.observedPrecip !== null) {
      day.precipError = Math.round((day.forecastPrecip - day.observedPrecip) * 10) / 10;
      errors.precip.push(day.precipError);
    }
    if (day.forecastWindMax !== null && day.observedWindMax !== null) {
      day.windMaxError = Math.round((day.forecastWindMax - day.observedWindMax) * 10) / 10;
    }

    result.push(day);
  }

  // 7. Compute summary metrics
  const mae = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + Math.abs(b), 0) / arr.length : null;
  const bias = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    days: result,
    metrics: {
      tempMaxMAE: mae(errors.tempMax) !== null ? Math.round(mae(errors.tempMax)! * 10) / 10 : null,
      tempMinMAE: mae(errors.tempMin) !== null ? Math.round(mae(errors.tempMin)! * 10) / 10 : null,
      precipMAE: mae(errors.precip) !== null ? Math.round(mae(errors.precip)! * 10) / 10 : null,
      tempMaxBias: bias(errors.tempMax) !== null ? Math.round(bias(errors.tempMax)! * 10) / 10 : null,
      precipBias: bias(errors.precip) !== null ? Math.round(bias(errors.precip)! * 10) / 10 : null,
    },
    knmiStationName: knmiStation?.name ?? null,
  };
}
