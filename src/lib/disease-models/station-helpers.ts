/**
 * Helpers to group parcels by weather station.
 *
 * Every parcel is linked to exactly one weather station via
 * parcel_weather_stations. We flip that index so the UI can show
 * "station X, used by parcels A, B, C".
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StationWithParcels {
  stationId: string;
  stationName: string | null;
  latitude: number;
  longitude: number;
  parcels: {
    id: string;
    name: string;
    area: number | null;
  }[];
}

/**
 * Fetch all weather stations for the current user, with their linked parcels.
 * Returns an array sorted by station name (or lat/lng if unnamed).
 */
export async function fetchStationsWithParcels(
  supabase: SupabaseClient
): Promise<StationWithParcels[]> {
  // 1. Get user's weather stations
  const { data: stations } = await supabase
    .from('weather_stations')
    .select('id, name, latitude, longitude')
    .order('name', { nullsFirst: false });

  if (!stations || stations.length === 0) return [];

  // 2. Get all parcel-station links for these stations
  const stationIds = stations.map((s) => s.id);
  const { data: links } = await supabase
    .from('parcel_weather_stations')
    .select('parcel_id, station_id')
    .in('station_id', stationIds);

  // 3. Get parcel details
  const parcelIds = (links ?? []).map((l) => l.parcel_id);
  const { data: parcels } = parcelIds.length
    ? await supabase
        .from('parcels')
        .select('id, name, area')
        .in('id', parcelIds)
    : { data: [] };

  const parcelById = new Map(
    (parcels ?? []).map((p) => [p.id, p])
  );

  // 4. Build result
  const byStation = new Map<string, StationWithParcels>();
  for (const station of stations) {
    byStation.set(station.id, {
      stationId: station.id,
      stationName: station.name,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
      parcels: [],
    });
  }

  for (const link of links ?? []) {
    const entry = byStation.get(link.station_id);
    const parcel = parcelById.get(link.parcel_id);
    if (entry && parcel) {
      entry.parcels.push({
        id: parcel.id,
        name: parcel.name ?? '(zonder naam)',
        area: parcel.area ? Number(parcel.area) : null,
      });
    }
  }

  // Sort parcels within each station, and skip stations with no parcels
  const result = Array.from(byStation.values())
    .filter((s) => s.parcels.length > 0)
    .map((s) => ({
      ...s,
      parcels: s.parcels.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return result;
}

/**
 * Find a station by the ID of one of its parcels.
 */
export async function findStationByParcel(
  parcelId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from('parcel_weather_stations')
    .select('station_id')
    .eq('parcel_id', parcelId)
    .maybeSingle();

  return (data?.station_id as string) ?? null;
}
