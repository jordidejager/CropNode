// ============================================================================
// Auto Station Coupling
// Ensures a parcel has a linked weather station, creating one if needed.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getOrCreateWeatherStation, initializeStation } from './weather-service';

/**
 * Ensure a parcel has a weather station linked.
 * 1. Check if parcel already has a station via parcel_weather_stations
 * 2. If not: get lat/lng from parcel
 * 3. Check if there's already a station within ~1km (rounded coordinates)
 * 4. If yes: link parcel to existing station
 * 5. If no: create new station, link parcel, trigger initialization
 * Returns: station_id
 */
export async function ensureWeatherStation(
  userId: string,
  parcelId: string
): Promise<string> {
  const supabase = await createClient();

  // 1. Check if parcel already has a station
  const { data: existing } = await supabase
    .from('parcel_weather_stations')
    .select('station_id')
    .eq('parcel_id', parcelId)
    .single();

  if (existing) return existing.station_id;

  // 2. Get parcel location
  const { data: parcel } = await supabase
    .from('parcels')
    .select('id, location')
    .eq('id', parcelId)
    .single();

  if (!parcel || !parcel.location) {
    throw new Error(`Parcel ${parcelId} not found or has no location`);
  }

  const { lat, lng } = parcel.location as { lat: number; lng: number };

  // 3. Get or create station (handles deduplication by rounded coordinates)
  const stationId = await getOrCreateWeatherStation(userId, lat, lng);

  // 4. Link parcel to station
  await supabase
    .from('parcel_weather_stations')
    .upsert({ parcel_id: parcelId, station_id: stationId });

  // 5. Check if this is a newly created station (no fetch log yet)
  const { data: fetchLog } = await supabase
    .from('weather_fetch_log')
    .select('id')
    .eq('station_id', stationId)
    .limit(1)
    .single();

  if (!fetchLog) {
    // New station — trigger initialization in the background
    // Don't await to avoid blocking the response
    initializeStation(userId, lat, lng).catch(err => {
      console.error(`[WeatherStation] Background init failed for station ${stationId}:`, err);
    });
  }

  return stationId;
}

/**
 * Ensure weather stations for all parcels of a user.
 * Used when a user opens Weather Hub for the first time.
 */
export async function ensureWeatherStationsForUser(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data: parcels } = await supabase
    .from('parcels')
    .select('id, location')
    .eq('user_id', userId)
    .not('location', 'is', null);

  if (!parcels || parcels.length === 0) return [];

  const stationIds: string[] = [];

  for (const parcel of parcels) {
    try {
      const stationId = await ensureWeatherStation(userId, parcel.id);
      if (!stationIds.includes(stationId)) {
        stationIds.push(stationId);
      }
    } catch (error) {
      console.error(`[WeatherStation] Failed for parcel ${parcel.id}:`, error);
    }
  }

  return stationIds;
}
