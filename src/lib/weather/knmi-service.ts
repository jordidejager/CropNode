// ============================================================================
// KNMI Service Layer
// Import, aggregation, and querying of KNMI measured weather data.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from './weather-service';
import { fetchKnmiBulkHourly, fetchKnmiRecent } from './knmi-client';
import type { KnmiHourlyRow } from './knmi-client';
import {
  calculateGDD,
  estimateLeafWetness,
} from './weather-calculations';

// ---- Types ----

export type KnmiStation = {
  code: number;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  region: string | null;
  isFruitRegion: boolean;
  active: boolean;
};

export type KnmiDailyData = {
  stationCode: number;
  date: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  tempAvgC: number | null;
  precipitationSum: number | null;
  humidityAvgPct: number | null;
  windSpeedMaxMs: number | null;
  windSpeedAvgMs: number | null;
  sunshineHours: number | null;
  solarRadiationSum: number | null;
  et0EstimateMm: number | null;
  pressureAvgHpa: number | null;
  gddBase5: number | null;
  gddBase10: number | null;
  frostHours: number | null;
  leafWetnessHrs: number | null;
};

export type KnmiCumulativeData = {
  date: string;
  dayOfYear: number;
  cumulativeGddBase5: number;
  cumulativeGddBase10: number;
  cumulativePrecipitation: number;
  cumulativeEt0: number;
  cumulativeSunshine: number;
  waterBalance: number;
};

// ---- Helpers ----

async function getDefaultClient(): Promise<SupabaseClient> {
  // KNMI tables have no RLS — anon key works fine for read queries
  return createClient() as Promise<SupabaseClient>;
}

function dayOfYear(dateStr: string): number {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ---- Station Queries ----

export async function getKnmiStations(
  fruitOnly: boolean = false,
  db?: SupabaseClient
): Promise<KnmiStation[]> {
  const supabase = db || await getDefaultClient();
  let query = supabase
    .from('knmi_stations')
    .select('*')
    .eq('active', true)
    .order('name');

  if (fruitOnly) {
    query = query.eq('is_fruit_region', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((s: Record<string, unknown>) => ({
    code: s.code as number,
    name: s.name as string,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    elevationM: s.elevation_m ? Number(s.elevation_m) : null,
    region: s.region as string | null,
    isFruitRegion: s.is_fruit_region as boolean,
    active: s.active as boolean,
  }));
}

export async function findNearestKnmiStation(
  latitude: number,
  longitude: number,
  db?: SupabaseClient
): Promise<number | null> {
  const supabase = db || await getDefaultClient();
  const { data, error } = await supabase.rpc('find_nearest_knmi_station', {
    p_lat: latitude,
    p_lng: longitude,
  });
  if (error) throw error;
  return data as number | null;
}

// ---- Linking ----

export async function linkWeatherStationToKnmi(
  weatherStationId: string,
  db?: SupabaseClient
): Promise<number | null> {
  const supabase = db || await getDefaultClient();

  // Get the weather station's coordinates
  const { data: station, error: stErr } = await supabase
    .from('weather_stations')
    .select('latitude, longitude')
    .eq('id', weatherStationId)
    .single();

  if (stErr || !station) return null;

  const knmiCode = await findNearestKnmiStation(
    Number(station.latitude),
    Number(station.longitude),
    supabase
  );

  if (knmiCode) {
    await supabase
      .from('weather_stations')
      .update({ knmi_station_id: String(knmiCode) })
      .eq('id', weatherStationId);
  }

  return knmiCode;
}

// ---- Historical Import ----

export async function importKnmiHistorical(
  stationCode: number,
  startDate: string,
  endDate: string,
  db?: SupabaseClient
): Promise<number> {
  const supabase = db || createServiceRoleClient();

  // Fetch and parse CSV
  const rows = await fetchKnmiBulkHourly(stationCode, startDate, endDate);
  if (rows.length === 0) return 0;

  // Batch upsert
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('knmi_observations_hourly')
      .upsert(batch, {
        onConflict: 'station_code,timestamp',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[KNMI] Batch insert error at offset ${i}:`, error.message);
      // Continue with remaining batches
    } else {
      totalInserted += batch.length;
    }
  }

  // Log the fetch
  await supabase.from('knmi_fetch_log').insert({
    station_code: stationCode,
    fetch_type: 'bulk_historical',
    date_range_start: startDate,
    date_range_end: endDate,
    status: 'success',
    records_fetched: totalInserted,
  });

  console.log(`[KNMI] Imported ${totalInserted} hourly rows for station ${stationCode}`);
  return totalInserted;
}

// ---- Daily Aggregation ----

function aggregateKnmiHourlyToDaily(
  hourlyRows: KnmiHourlyRow[]
): Omit<KnmiDailyData, 'stationCode'> & { date: string } {
  const temps = hourlyRows.map(r => r.temperature_c).filter((t): t is number => t !== null);
  const humidities = hourlyRows.map(r => r.humidity_pct).filter((h): h is number => h !== null);
  const winds = hourlyRows.map(r => r.wind_speed_ms).filter((w): w is number => w !== null);
  const precips = hourlyRows.map(r => r.precipitation_mm).filter((p): p is number => p !== null);
  const solarVals = hourlyRows.map(r => r.solar_radiation_jcm2).filter((s): s is number => s !== null);
  const sunshineVals = hourlyRows.map(r => r.sunshine_hours).filter((s): s is number => s !== null);
  const pressureVals = hourlyRows.map(r => r.pressure_hpa).filter((p): p is number => p !== null);

  const tempMin = temps.length > 0 ? Math.min(...temps) : null;
  const tempMax = temps.length > 0 ? Math.max(...temps) : null;
  const tempAvg = temps.length > 0
    ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10
    : null;

  const precipSum = precips.length > 0
    ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10
    : null;

  const humidityAvg = humidities.length > 0
    ? Math.round((humidities.reduce((a, b) => a + b, 0) / humidities.length) * 10) / 10
    : null;

  const windMax = winds.length > 0 ? Math.round(Math.max(...winds) * 10) / 10 : null;
  const windAvg = winds.length > 0
    ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10
    : null;

  const sunshineSum = sunshineVals.length > 0
    ? Math.round(sunshineVals.reduce((a, b) => a + b, 0) * 10) / 10
    : null;

  const solarSum = solarVals.length > 0
    ? solarVals.reduce((a, b) => a + b, 0)
    : null;

  const pressureAvg = pressureVals.length > 0
    ? Math.round((pressureVals.reduce((a, b) => a + b, 0) / pressureVals.length) * 10) / 10
    : null;

  // ET0 Makkink estimation: ET0 = 0.65 * (s/(s+γ)) * (Rs/2.45)
  // Simplified: use solar radiation sum (J/cm² → MJ/m²: divide by 100)
  let et0Estimate: number | null = null;
  if (solarSum !== null && tempAvg !== null) {
    const rsMjM2 = solarSum / 100; // J/cm² to MJ/m²
    // s (slope vapor pressure) simplified: s ≈ 4098*0.6108*exp(17.27*T/(T+237.3))/(T+237.3)²
    const s = (4098 * 0.6108 * Math.exp(17.27 * tempAvg / (tempAvg + 237.3))) /
              Math.pow(tempAvg + 237.3, 2);
    const gamma = 0.066; // psychrometric constant kPa/°C
    et0Estimate = Math.round(0.65 * (s / (s + gamma)) * (rsMjM2 / 2.45) * 100) / 100;
    if (et0Estimate < 0) et0Estimate = 0;
  }

  // Leaf wetness hours: hours where humidity > 90% or precipitation > 0
  const leafWetnessHrs = hourlyRows.filter(r => {
    const lw = estimateLeafWetness(
      r.humidity_pct, r.temperature_c, r.dew_point_c, r.precipitation_mm
    );
    return lw !== null && lw > 50;
  }).length;

  // Frost hours
  const frostHours = hourlyRows.filter(r => r.temperature_c !== null && r.temperature_c < 0).length;

  const gddBase5 = calculateGDD(tempMax, tempMin, 5);
  const gddBase10 = calculateGDD(tempMax, tempMin, 10);

  // Extract date from first row's timestamp
  const date = hourlyRows[0].timestamp.split('T')[0];

  return {
    date,
    tempMinC: tempMin !== null ? Math.round(tempMin * 10) / 10 : null,
    tempMaxC: tempMax !== null ? Math.round(tempMax * 10) / 10 : null,
    tempAvgC: tempAvg,
    precipitationSum: precipSum,
    humidityAvgPct: humidityAvg,
    windSpeedMaxMs: windMax,
    windSpeedAvgMs: windAvg,
    sunshineHours: sunshineSum,
    solarRadiationSum: solarSum,
    et0EstimateMm: et0Estimate,
    pressureAvgHpa: pressureAvg,
    gddBase5: gddBase5 !== null ? Math.round(gddBase5 * 10) / 10 : null,
    gddBase10: gddBase10 !== null ? Math.round(gddBase10 * 10) / 10 : null,
    frostHours,
    leafWetnessHrs: leafWetnessHrs,
  };
}

export async function aggregateKnmiDaily(
  stationCode: number,
  startDate: string,
  endDate: string,
  db?: SupabaseClient
): Promise<number> {
  const supabase = db || createServiceRoleClient();

  // Fetch hourly data from DB
  const { data: hourlyData, error } = await supabase
    .from('knmi_observations_hourly')
    .select('*')
    .eq('station_code', stationCode)
    .gte('timestamp', `${startDate}T00:00:00+00:00`)
    .lte('timestamp', `${endDate}T23:59:59+00:00`)
    .order('timestamp');

  if (error) throw error;
  if (!hourlyData || hourlyData.length === 0) return 0;

  // Group by date (UTC)
  const grouped: Record<string, KnmiHourlyRow[]> = {};
  for (const row of hourlyData) {
    const date = (row.timestamp as string).split('T')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(row as unknown as KnmiHourlyRow);
  }

  // Aggregate each day
  const dailyRows: Array<Record<string, unknown>> = [];
  for (const [date, hours] of Object.entries(grouped)) {
    if (hours.length < 12) continue; // Skip incomplete days

    const agg = aggregateKnmiHourlyToDaily(hours);
    dailyRows.push({
      station_code: stationCode,
      date,
      temp_min_c: agg.tempMinC,
      temp_max_c: agg.tempMaxC,
      temp_avg_c: agg.tempAvgC,
      precipitation_sum: agg.precipitationSum,
      humidity_avg_pct: agg.humidityAvgPct,
      wind_speed_max_ms: agg.windSpeedMaxMs,
      wind_speed_avg_ms: agg.windSpeedAvgMs,
      sunshine_hours: agg.sunshineHours,
      solar_radiation_sum: agg.solarRadiationSum,
      et0_estimate_mm: agg.et0EstimateMm,
      pressure_avg_hpa: agg.pressureAvgHpa,
      gdd_base5: agg.gddBase5,
      gdd_base10: agg.gddBase10,
      frost_hours: agg.frostHours,
      leaf_wetness_hrs: agg.leafWetnessHrs,
      data_source: 'knmi_bulk',
    });
  }

  // Batch upsert daily rows
  const BATCH_SIZE = 500;
  let totalInserted = 0;
  for (let i = 0; i < dailyRows.length; i += BATCH_SIZE) {
    const batch = dailyRows.slice(i, i + BATCH_SIZE);
    const { error: upsertErr } = await supabase
      .from('knmi_observations_daily')
      .upsert(batch, {
        onConflict: 'station_code,date',
        ignoreDuplicates: false,
      });
    if (upsertErr) {
      console.error(`[KNMI] Daily aggregation error:`, upsertErr.message);
    } else {
      totalInserted += batch.length;
    }
  }

  console.log(`[KNMI] Aggregated ${totalInserted} daily rows for station ${stationCode}`);
  return totalInserted;
}

// ---- Full Season Import ----

export async function importKnmiSeasons(
  stationCode: number,
  yearsBack: number = 5,
  db?: SupabaseClient
): Promise<{ totalHourly: number; totalDaily: number }> {
  const supabase = db || createServiceRoleClient();
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - yearsBack;

  const startDate = `${startYear}-01-01`;
  const endDate = new Date().toISOString().split('T')[0];

  console.log(`[KNMI] Importing ${yearsBack} years for station ${stationCode}: ${startDate} to ${endDate}`);

  // Import hourly
  const totalHourly = await importKnmiHistorical(stationCode, startDate, endDate, supabase);

  // Aggregate daily
  const totalDaily = await aggregateKnmiDaily(stationCode, startDate, endDate, supabase);

  return { totalHourly, totalDaily };
}

// ---- Data Queries ----

export async function getKnmiDailyRange(
  stationCode: number,
  startDate: string,
  endDate: string,
  db?: SupabaseClient
): Promise<KnmiDailyData[]> {
  const supabase = db || await getDefaultClient();

  const { data, error } = await supabase
    .from('knmi_observations_daily')
    .select('*')
    .eq('station_code', stationCode)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) throw error;

  return (data || []).map((r: Record<string, unknown>) => ({
    stationCode: r.station_code as number,
    date: r.date as string,
    tempMinC: r.temp_min_c !== null ? Number(r.temp_min_c) : null,
    tempMaxC: r.temp_max_c !== null ? Number(r.temp_max_c) : null,
    tempAvgC: r.temp_avg_c !== null ? Number(r.temp_avg_c) : null,
    precipitationSum: r.precipitation_sum !== null ? Number(r.precipitation_sum) : null,
    humidityAvgPct: r.humidity_avg_pct !== null ? Number(r.humidity_avg_pct) : null,
    windSpeedMaxMs: r.wind_speed_max_ms !== null ? Number(r.wind_speed_max_ms) : null,
    windSpeedAvgMs: r.wind_speed_avg_ms !== null ? Number(r.wind_speed_avg_ms) : null,
    sunshineHours: r.sunshine_hours !== null ? Number(r.sunshine_hours) : null,
    solarRadiationSum: r.solar_radiation_sum !== null ? Number(r.solar_radiation_sum) : null,
    et0EstimateMm: r.et0_estimate_mm !== null ? Number(r.et0_estimate_mm) : null,
    pressureAvgHpa: r.pressure_avg_hpa !== null ? Number(r.pressure_avg_hpa) : null,
    gddBase5: r.gdd_base5 !== null ? Number(r.gdd_base5) : null,
    gddBase10: r.gdd_base10 !== null ? Number(r.gdd_base10) : null,
    frostHours: r.frost_hours !== null ? Number(r.frost_hours) : null,
    leafWetnessHrs: r.leaf_wetness_hrs !== null ? Number(r.leaf_wetness_hrs) : null,
  }));
}

export async function getKnmiSeasonComparison(
  stationCode: number,
  years: number[],
  db?: SupabaseClient
): Promise<Record<number, KnmiDailyData[]>> {
  const result: Record<number, KnmiDailyData[]> = {};

  for (const year of years) {
    const startDate = `${year}-01-01`;
    const endDate = year === new Date().getFullYear()
      ? new Date().toISOString().split('T')[0]
      : `${year}-12-31`;

    result[year] = await getKnmiDailyRange(stationCode, startDate, endDate, db);
  }

  return result;
}

export async function getKnmiCumulatives(
  stationCode: number,
  year: number,
  db?: SupabaseClient
): Promise<KnmiCumulativeData[]> {
  const startDate = `${year}-01-01`;
  const endDate = year === new Date().getFullYear()
    ? new Date().toISOString().split('T')[0]
    : `${year}-12-31`;

  const dailyData = await getKnmiDailyRange(stationCode, startDate, endDate, db);

  let cumGdd5 = 0;
  let cumGdd10 = 0;
  let cumPrecip = 0;
  let cumEt0 = 0;
  let cumSunshine = 0;

  return dailyData.map(d => {
    if (d.gddBase5 !== null) cumGdd5 += d.gddBase5;
    if (d.gddBase10 !== null) cumGdd10 += d.gddBase10;
    if (d.precipitationSum !== null) cumPrecip += d.precipitationSum;
    if (d.et0EstimateMm !== null) cumEt0 += d.et0EstimateMm;
    if (d.sunshineHours !== null) cumSunshine += d.sunshineHours;

    return {
      date: d.date,
      dayOfYear: dayOfYear(d.date),
      cumulativeGddBase5: Math.round(cumGdd5 * 10) / 10,
      cumulativeGddBase10: Math.round(cumGdd10 * 10) / 10,
      cumulativePrecipitation: Math.round(cumPrecip * 10) / 10,
      cumulativeEt0: Math.round(cumEt0 * 100) / 100,
      cumulativeSunshine: Math.round(cumSunshine * 10) / 10,
      waterBalance: Math.round((cumPrecip - cumEt0) * 10) / 10,
    };
  });
}

// ---- Import Status ----

export async function getKnmiImportStatus(
  stationCode: number,
  db?: SupabaseClient
): Promise<{ lastImport: string | null; hasData: boolean; rowCount: number }> {
  const supabase = db || await getDefaultClient();

  const [logResult, countResult] = await Promise.all([
    supabase
      .from('knmi_fetch_log')
      .select('fetched_at')
      .eq('station_code', stationCode)
      .eq('status', 'success')
      .order('fetched_at', { ascending: false })
      .limit(1),
    supabase
      .from('knmi_observations_daily')
      .select('id', { count: 'exact', head: true })
      .eq('station_code', stationCode),
  ]);

  return {
    lastImport: logResult.data?.[0]?.fetched_at ?? null,
    hasData: (countResult.count ?? 0) > 0,
    rowCount: countResult.count ?? 0,
  };
}

// ---- Cron: Refresh Recent Data ----

export async function refreshKnmiStations(
  db?: SupabaseClient
): Promise<number> {
  const supabase = db || createServiceRoleClient();

  // Find all KNMI stations that have been imported
  const { data: importedStations, error } = await supabase
    .from('knmi_fetch_log')
    .select('station_code')
    .eq('status', 'success');

  if (error || !importedStations) return 0;

  const stationCodes = [...new Set(importedStations.map(s => s.station_code as number))];
  let refreshed = 0;

  for (const code of stationCodes) {
    try {
      const rows = await fetchKnmiRecent(code, 3);
      if (rows.length === 0) continue;

      // Upsert hourly
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await supabase
          .from('knmi_observations_hourly')
          .upsert(batch, {
            onConflict: 'station_code,timestamp',
            ignoreDuplicates: false,
          });
      }

      // Re-aggregate last 3 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 3);
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      await aggregateKnmiDaily(code, fmt(start), fmt(end), supabase);

      refreshed++;
      console.log(`[KNMI] Refreshed station ${code}: ${rows.length} rows`);
    } catch (err) {
      console.error(`[KNMI] Failed to refresh station ${code}:`, err);
    }
  }

  return refreshed;
}
