'use client';

import { createClient } from '@/lib/supabase/client';
import type {
  AnalyticsData,
  AnalyticsRegistration,
  AnalyticsParcel,
  AnalyticsSubParcel,
  AnalyticsFilters,
} from './types';

function getSupabase() {
  return createClient();
}

/**
 * Fetch all analytics data for a given harvest year.
 * Uses Promise.all for parallel queries.
 */
export async function fetchAnalyticsData(
  filters: AnalyticsFilters
): Promise<AnalyticsData> {
  const { harvestYear, parcelIds, dateRange } = filters;

  const [
    registrationsResult,
    parcelsResult,
    subParcelsResult,
    prevRegistrationsResult,
  ] = await Promise.all([
    fetchSpuitschrift(harvestYear, parcelIds, dateRange),
    fetchParcels(),
    fetchSubParcels(),
    fetchSpuitschrift(harvestYear - 1, [], undefined),
  ]);

  return {
    registrations: registrationsResult,
    parcels: parcelsResult,
    subParcels: subParcelsResult,
    prevRegistrations: prevRegistrationsResult,
  };
}

async function fetchSpuitschrift(
  harvestYear: number,
  parcelIds: string[],
  dateRange?: { start: Date; end: Date }
): Promise<AnalyticsRegistration[]> {
  const supabase = getSupabase();

  let query = supabase
    .from('spuitschrift')
    .select('id, date, plots, products, registration_type, harvest_year')
    .eq('harvest_year', harvestYear)
    .order('date', { ascending: true });

  if (dateRange) {
    query = query
      .gte('date', dateRange.start.toISOString())
      .lte('date', dateRange.end.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching registrations:', error);
    return [];
  }

  let registrations = (data || []).map((row: any) => ({
    id: row.id,
    date: row.date,
    plots: row.plots || [],
    products: Array.isArray(row.products) ? row.products : [],
    registration_type: row.registration_type || 'spraying',
    harvest_year: row.harvest_year,
  }));

  // Filter by parcel names if needed (plots contain sub-parcel names)
  if (parcelIds.length > 0) {
    registrations = registrations.filter((r: any) =>
      r.plots.some((p: string) => parcelIds.includes(p))
    );
  }

  return registrations;
}

async function fetchParcels(): Promise<AnalyticsParcel[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('parcels')
    .select('id, name, area')
    .order('name');

  if (error) {
    console.error('Error fetching parcels:', error);
    return [];
  }

  return (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    area: p.area || 0,
  }));
}

async function fetchSubParcels(): Promise<AnalyticsSubParcel[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('sub_parcels')
    .select('id, parcel_id, name, crop, variety, area')
    .order('name');

  if (error) {
    console.error('Error fetching sub-parcels:', error);
    return [];
  }

  return (data || []) as AnalyticsSubParcel[];
}

/**
 * Fetch available harvest years from the database.
 * Derived from the spuitschrift (registration) table — harvest_year is the
 * season key for cost/spray analytics.
 */
export async function fetchAvailableHarvestYears(): Promise<number[]> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from('spuitschrift')
    .select('harvest_year')
    .not('harvest_year', 'is', null);

  const years = new Set<number>();

  (data || []).forEach((r: any) => years.add(r.harvest_year));

  return [...years].sort((a, b) => b - a);
}

/**
 * Fetch weather data for a harvest year's date range.
 */
export async function fetchWeatherData(
  harvestYear: number
): Promise<any[]> {
  const supabase = getSupabase();

  // A harvest year spans from ~Nov previous year to ~Oct current year
  const startDate = `${harvestYear - 1}-11-01`;
  const endDate = `${harvestYear}-10-31`;

  const { data: stations } = await supabase
    .from('weather_stations')
    .select('id')
    .limit(1);

  if (!stations || stations.length === 0) return [];

  const { data, error } = await supabase
    .from('weather_data_daily')
    .select('date, temp_min_c, temp_max_c, temp_avg_c, precipitation_sum, humidity_avg_pct, wind_speed_avg_ms, frost_hours, gdd_base5, gdd_base10')
    .eq('station_id', stations[0].id)
    .eq('is_forecast', false)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) {
    console.error('Error fetching weather data:', error);
    return [];
  }

  return data || [];
}
