import { createClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiError,
  ErrorCodes,
  handleUnknownError,
} from '@/lib/api-utils';
import { fetchStationsWithParcels } from '@/lib/disease-models/station-helpers';

/**
 * GET /api/analytics/ziektedruk/stations?harvest_year=2026
 *
 * Returns all weather stations for the user, grouped by parcel.
 * For each station: which diseases are configured, current status.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return apiError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);

    const { searchParams } = new URL(request.url);
    const harvestYearStr = searchParams.get('harvest_year');
    const harvestYear = harvestYearStr ? parseInt(harvestYearStr, 10) : new Date().getFullYear();

    const stations = await fetchStationsWithParcels(supabase);
    if (stations.length === 0) {
      return apiSuccess({ stations: [] });
    }

    // For each station, fetch configured disease models
    const stationIds = stations.map((s) => s.stationId);
    const { data: configs } = await supabase
      .from('disease_model_config')
      .select('id, weather_station_id, disease_type, biofix_date, inoculum_pressure')
      .in('weather_station_id', stationIds)
      .eq('harvest_year', harvestYear);

    // Group configs by station
    const configsByStation = new Map<string, typeof configs>();
    for (const config of configs ?? []) {
      const key = config.weather_station_id as string;
      if (!configsByStation.has(key)) configsByStation.set(key, []);
      configsByStation.get(key)!.push(config);
    }

    const result = stations.map((station) => ({
      ...station,
      configs: configsByStation.get(station.stationId) ?? [],
    }));

    return apiSuccess({ stations: result, harvestYear });
  } catch (error) {
    return handleUnknownError(error, 'ziektedruk stations GET');
  }
}
