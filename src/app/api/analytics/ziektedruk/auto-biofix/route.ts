/**
 * GET /api/analytics/ziektedruk/auto-biofix?parcel_id=xxx&harvest_year=2026
 *
 * Auto-detects the biofix date for a parcel based on winter weather history.
 * Simulates pseudothecia maturation from Jan 1 and returns the date when
 * PAM first exceeds 0.5% (first dischargeable ascospores).
 *
 * Also accepts optional green_tip query param (YYYY-MM-DD) to cap detection:
 * returned biofix = min(detected, green_tip).
 */

import { createClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiError,
  ErrorCodes,
  handleUnknownError,
} from '@/lib/api-utils';
import {
  getHourlyRange,
  getOrCreateWeatherStation,
} from '@/lib/weather/weather-service';
import {
  detectBiofix,
  formatBiofix,
} from '@/lib/disease-models/apple-scab-v2/auto-biofix';
import type { HourlyWeatherStep } from '@/lib/disease-models/apple-scab-v2/types';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError('Unauthorized', ErrorCodes.UNAUTHORIZED, 401);

    const { searchParams } = new URL(request.url);
    const parcelId = searchParams.get('parcel_id');
    const harvestYearStr = searchParams.get('harvest_year');
    const greenTipStr = searchParams.get('green_tip');

    if (!parcelId || !harvestYearStr) {
      return apiError(
        'parcel_id and harvest_year are required',
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    const harvestYear = parseInt(harvestYearStr, 10);
    if (isNaN(harvestYear)) {
      return apiError(
        'harvest_year must be a number',
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    // Get parcel location
    const { data: parcel } = await supabase
      .from('parcels')
      .select('location')
      .eq('id', parcelId)
      .single();

    if (!parcel?.location) {
      return apiError(
        'Perceel heeft geen locatie',
        ErrorCodes.VALIDATION_ERROR,
        400
      );
    }

    const { lat, lng } = parcel.location as { lat: number; lng: number };

    // Get or create station
    const { data: existing } = await supabase
      .from('parcel_weather_stations')
      .select('station_id')
      .eq('parcel_id', parcelId)
      .single();

    let stationId = existing?.station_id ?? null;
    if (!stationId) {
      stationId = await getOrCreateWeatherStation(
        user.id,
        lat,
        lng,
        supabase
      );
      await supabase
        .from('parcel_weather_stations')
        .upsert({ parcel_id: parcelId, station_id: stationId });
    }

    // Fetch weather from Jan 1 to today
    const now = new Date();
    const jan1 = new Date(Date.UTC(harvestYear, 0, 1));
    const endDate = now.toISOString().slice(0, 10);

    // Chunked fetch (31 days per chunk)
    const chunks: HourlyWeatherStep[] = [];
    const chunkMs = 31 * 24 * 3600 * 1000;
    let chunkStart = jan1;
    while (chunkStart.getTime() < now.getTime()) {
      const chunkEnd = new Date(
        Math.min(chunkStart.getTime() + chunkMs, now.getTime())
      );
      const hourly = await getHourlyRange(
        stationId,
        chunkStart.toISOString().slice(0, 10),
        chunkEnd.toISOString().slice(0, 10),
        supabase
      );
      for (const h of hourly) {
        chunks.push({
          timestamp: h.timestamp,
          temperatureC: h.temperatureC,
          humidityPct: h.humidityPct,
          precipitationMm: h.precipitationMm,
          leafWetnessPct: h.leafWetnessPct,
          isForecast: h.isForecast,
        });
      }
      chunkStart = new Date(chunkEnd.getTime() + 1);
    }

    if (chunks.length === 0) {
      return apiError(
        'Geen weerdata beschikbaar voor auto-detectie',
        ErrorCodes.NOT_FOUND,
        404
      );
    }

    const greenTip = greenTipStr ? new Date(greenTipStr + 'T00:00:00Z') : null;
    const detected = detectBiofix(chunks, harvestYear, greenTip);

    return apiSuccess({
      detected_biofix: formatBiofix(detected),
      based_on_weather_hours: chunks.length,
    });
  } catch (error) {
    return handleUnknownError(error, 'ziektedruk auto-biofix GET');
  }
}
