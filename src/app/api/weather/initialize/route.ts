import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  initializeStation,
  fetchAndStoreMultiModel,
  fetchAndStoreEnsemble,
  getOrCreateWeatherStation,
  fetchAndStoreForecast,
} from '@/lib/weather/weather-service';

/**
 * POST /api/weather/initialize
 * Body: { latitude?, longitude?, parcelId?, quick?: boolean }
 *
 * If latitude/longitude are provided, uses those coordinates.
 * If parcelId is provided, reads coordinates from the parcel.
 * If neither, finds the user's first parcel with a location.
 *
 * quick=true skips historical data and only fetches current forecast + multi-model + ensemble.
 * This is used by the UI initialization button for fast first-load.
 *
 * Creates a weather station, links to parcel, and fetches weather data.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    let { latitude, longitude } = body;
    const { parcelId, quick } = body;

    let resolvedParcelId: string | null = parcelId ?? null;

    // If no coordinates provided, try to get them from a parcel
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      let parcelQuery = supabase
        .from('parcels')
        .select('id, location')
        .eq('user_id', user.id)
        .not('location', 'is', null);

      if (parcelId) {
        parcelQuery = parcelQuery.eq('id', parcelId);
      }

      const { data: parcels } = await parcelQuery.limit(1).single();

      if (parcels?.location) {
        const loc = parcels.location as { lat: number; lng: number };
        latitude = loc.lat;
        longitude = loc.lng;
        resolvedParcelId = parcels.id;
      } else {
        // Fallback: Betuwe coordinates (typical Dutch fruit growing region)
        latitude = 51.89;
        longitude = 5.35;
      }
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Invalid coordinate range' },
        { status: 400 }
      );
    }

    let stationId: string;

    if (quick) {
      // Quick mode: skip historical data, just create station + current forecast
      stationId = await getOrCreateWeatherStation(user.id, latitude, longitude);

      // Fetch current forecast only (no historical years)
      try {
        await fetchAndStoreForecast(stationId);
      } catch (error) {
        console.error('[Weather API] Quick forecast fetch error:', error);
      }
    } else {
      // Full mode: historical + forecast + daily aggregation
      stationId = await initializeStation(user.id, latitude, longitude);
    }

    // Link parcel to station if we have a parcelId
    if (resolvedParcelId) {
      await supabase
        .from('parcel_weather_stations')
        .upsert(
          { parcel_id: resolvedParcelId, station_id: stationId },
          { onConflict: 'parcel_id' }
        );
    }

    // Fetch multi-model and ensemble data (these are needed for Expert Forecast)
    const multiModelPromise = fetchAndStoreMultiModel(stationId).catch((err) => {
      console.error('[Weather API] Multi-model fetch error:', err);
    });

    const ensemblePromise = fetchAndStoreEnsemble(stationId).catch((err) => {
      console.error('[Weather API] Ensemble fetch error:', err);
    });

    // Wait for both to complete
    await Promise.all([multiModelPromise, ensemblePromise]);

    return NextResponse.json({ success: true, stationId });
  } catch (error) {
    console.error('[Weather API] initialize error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
