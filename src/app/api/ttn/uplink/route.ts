import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import {
  decodeTTNUplink,
  calcRainfallMm,
  getHarvestYear,
  InvalidTTNPayloadError,
  type TTNUplinkPayload,
  type WeatherMeasurementInsert,
} from '@/lib/weather/ttn-decoder';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/ttn/uplink
 *
 * Webhook endpoint that TTN (The Things Network) posts LoRaWAN uplinks to.
 *
 * Configure in TTN Console:
 *   Integrations → Webhooks → Add webhook → Custom
 *   Base URL: https://cropnode.vercel.app
 *   Uplink message: /api/ttn/uplink
 *   Headers:
 *     Authorization: Bearer <TTN_WEBHOOK_SECRET>
 *
 * Behavior:
 *   - Verifies the Authorization header against TTN_WEBHOOK_SECRET
 *   - Skips anything that isn't f_port=2 (Dragino sensor uplink)
 *   - Dedupes on (station, frame_counter)
 *   - Computes rainfall_mm from the diff of the cumulative rain counter
 *   - Logs any error to ttn_webhook_errors with the raw body preserved
 */
export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'DB admin client unavailable' }, { status: 500 });
  }

  // 1. Auth — plain bearer token, TTN only supports static headers
  const expectedSecret = process.env.TTN_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[TTN Webhook] TTN_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body — keep raw around for error logging
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const body = rawBody as TTNUplinkPayload;
  const deviceId = body?.end_device_ids?.device_id ?? null;
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  try {
    // 3. Decode + validate
    const decoded = decodeTTNUplink(body);

    // 4. Only process sensor data uplinks (fPort 2). fPort 5 is device config
    //    and other ports are firmware internals — log once then skip.
    if (decoded.fPort !== 2) {
      console.log(
        `[TTN Webhook] Skipping non-sensor uplink (device=${decoded.deviceId}, fPort=${decoded.fPort})`
      );
      return NextResponse.json({ success: true, skipped: true, reason: 'non-sensor fPort' });
    }

    // 5. Look up the physical station by device_id.
    //    If unknown, log it but keep returning 200 so TTN doesn't retry forever.
    // Try the SELECT with mm_per_tip first; if migration 076 hasn't been applied
    // yet that column is missing and Postgres returns code 42703. Retry without
    // it so the webhook keeps working — calcRainfallMm falls back to its own
    // 0.2 default.
    let stationLookup = await (admin as any)
      .from('physical_weather_stations')
      .select('id, user_id, last_frame_counter, last_seen_at, mm_per_tip, latitude, longitude, parcel_id')
      .eq('device_id', decoded.deviceId)
      .maybeSingle();

    if (
      stationLookup.error &&
      (stationLookup.error.code === '42703' ||
        /mm_per_tip/.test(stationLookup.error.message || ''))
    ) {
      stationLookup = await (admin as any)
        .from('physical_weather_stations')
        .select('id, user_id, last_frame_counter, last_seen_at, latitude, longitude, parcel_id')
        .eq('device_id', decoded.deviceId)
        .maybeSingle();
    }

    const station = stationLookup.data as
      | {
          id: string;
          user_id: string;
          last_frame_counter: number | null;
          last_seen_at: string | null;
          mm_per_tip?: number;
          latitude: number | null;
          longitude: number | null;
          parcel_id: string | null;
        }
      | null;
    const stationErr = stationLookup.error;

    if (stationErr) throw new Error(`DB lookup failed: ${stationErr.message}`);

    if (!station) {
      await logWebhookError(admin, {
        deviceId: decoded.deviceId,
        errorMessage: 'Unknown device_id — register the station in CropNode first.',
        rawBody: body,
        ipAddress,
        httpStatus: 202,
      });
      return NextResponse.json(
        { success: false, reason: 'Device not registered' },
        { status: 202 } // Accepted but not stored
      );
    }

    // 6. Dedup — explicit pre-check on (station, measured_at).
    //    We deliberately do NOT use Supabase upsert with onConflict here
    //    because the underlying UNIQUE constraint changed shape over migrations
    //    (frame_counter → measured_at) and we want this route to work
    //    regardless of which constraint is currently active in the DB.
    const { data: existing } = await (admin as any)
      .from('weather_measurements')
      .select('id')
      .eq('station_id', station.id)
      .eq('measured_at', decoded.measuredAt)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    // 7. Look up the previous rain counter for rainfall delta
    const { data: previousRow } = await (admin as any)
      .from('weather_measurements')
      .select('rain_counter')
      .eq('station_id', station.id)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Per-station calibration constant (mm of rain per bucket tip). Default 0.2
    // matches Dragino factory spec; users can recalibrate via the station detail
    // page. Fall back to default if the column doesn't exist yet (migration 076
    // not applied).
    const mmPerTip =
      typeof station.mm_per_tip === 'number' && station.mm_per_tip > 0
        ? station.mm_per_tip
        : 0.2;

    const rainfallMm = calcRainfallMm(
      decoded.rainCounter,
      previousRow?.rain_counter ?? null,
      mmPerTip
    );

    // 8. Insert measurement (plain insert — no onConflict to keep the route
    //    decoupled from the active UNIQUE-constraint shape).
    //    Soil + leaf fields are NULL for WSC2 uplinks and vice versa — the
    //    decoder picks up whatever decoded_payload fields are present.
    const insertRow: WeatherMeasurementInsert = {
      station_id: station.id,
      measured_at: decoded.measuredAt,
      frame_counter: decoded.frameCounter,
      f_port: decoded.fPort,
      temperature_c: decoded.temperatureC,
      humidity_pct: decoded.humidityPct,
      pressure_hpa: decoded.pressureHpa,
      illuminance_lux: decoded.illuminanceLux,
      rain_counter: decoded.rainCounter,
      rainfall_mm: rainfallMm,
      dew_point_c: decoded.dewPointC,
      wet_bulb_c: decoded.wetBulbC,
      // SE01-LS soil sensor fields
      soil_moisture_pct: decoded.soilMoisturePct,
      soil_temp_c: decoded.soilTempC,
      soil_conductivity_us_cm: decoded.soilConductivityUsCm,
      // LMS01-LS leaf sensor fields
      leaf_wetness_pct_measured: decoded.leafWetnessPctMeasured,
      leaf_temp_c: decoded.leafTempC,
      battery_v: decoded.batteryV,
      battery_status: decoded.batteryStatus,
      rssi_dbm: decoded.rssiDbm,
      snr_db: decoded.snrDb,
      gateway_count: decoded.gatewayCount,
      raw_payload: body,
      harvest_year: getHarvestYear(new Date(decoded.measuredAt)),
    };

    const { error: insertErr } = await (admin as any)
      .from('weather_measurements')
      .insert(insertRow);

    if (insertErr) {
      // 23505 = unique_violation. Could be race with another retry, OR the
      // old (station_id, frame_counter) constraint catches a rejoin reset.
      // In both cases the data is already-stored or harmless to skip.
      if (insertErr.code === '23505') {
        return NextResponse.json({ success: true, duplicate: true });
      }
      throw new Error(`Measurement insert failed: ${insertErr.message}`);
    }

    // 9. Update the station's heartbeat + last frame for quick dedup next time.
    //    Also opportunistically sync location + parcel link from the uplink:
    //     - TTN provides locations.user (set in TTN console) on every uplink
    //     - If the station has no lat/lng yet → copy it
    //     - If lat/lng drifted by > 100 m vs TTN → refresh it (sensor moved)
    //     - Re-evaluate parcel link any time lat/lng is set or refreshed
    const stationUpdate: Record<string, unknown> = {
      last_seen_at: decoded.measuredAt,
      last_frame_counter: decoded.frameCounter,
    };

    const userLoc = body?.uplink_message?.locations?.user;
    const ttnLat =
      typeof userLoc?.latitude === 'number' ? userLoc.latitude : null;
    const ttnLng =
      typeof userLoc?.longitude === 'number' ? userLoc.longitude : null;

    const stationHasNoCoords =
      station.latitude === null || station.longitude === null;
    const drifted =
      !stationHasNoCoords &&
      ttnLat !== null &&
      ttnLng !== null &&
      haversineMeters(
        station.latitude as number,
        station.longitude as number,
        ttnLat,
        ttnLng
      ) > 100;
    const shouldUpdateLocation =
      ttnLat !== null && ttnLng !== null && (stationHasNoCoords || drifted);

    if (shouldUpdateLocation) {
      stationUpdate.latitude = ttnLat;
      stationUpdate.longitude = ttnLng;
    }

    await (admin as any)
      .from('physical_weather_stations')
      .update(stationUpdate)
      .eq('id', station.id);

    // Auto-link / re-link to nearest parcel (within 1 km). Fire-and-forget.
    //  - No parcel yet → always link to nearest within 1 km.
    //  - Has parcel but location drifted > 100 m → re-evaluate; switch only
    //    if a different parcel is now significantly closer (>= 50 m closer).
    if (ttnLat !== null && ttnLng !== null) {
      const reasonToRelink =
        !station.parcel_id ||
        shouldUpdateLocation; // location is being refreshed
      if (reasonToRelink) {
        autoLinkParcel(
          admin,
          station.id,
          station.user_id,
          ttnLat,
          ttnLng,
          station.parcel_id ?? null
        ).catch(err =>
          console.warn('[TTN Webhook] auto-link parcel failed:', err)
        );
      }
    }

    return NextResponse.json({
      success: true,
      measured_at: decoded.measuredAt,
      rainfall_mm: rainfallMm,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Payload-shape problems are permanent — responding with 4xx makes TTN
    // keep retrying forever. Log and return 200 so TTN considers it handled.
    const isPayloadError = err instanceof InvalidTTNPayloadError;
    const httpStatus = isPayloadError ? 200 : 500;

    console.error('[TTN Webhook] Error:', message);
    await logWebhookError(admin, {
      deviceId,
      errorMessage: message,
      rawBody: body,
      ipAddress,
      httpStatus,
    });

    return NextResponse.json(
      { success: false, skipped: isPayloadError, error: message },
      { status: httpStatus }
    );
  }
}

// ---- helpers ----

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

interface ErrorLogEntry {
  deviceId: string | null;
  errorMessage: string;
  rawBody: unknown;
  ipAddress: string | null;
  httpStatus: number;
}

/**
 * Find the nearest user-owned parcel to a given GPS coordinate and link the
 * station to it. Only acts within ~1km radius; otherwise we leave it unlinked
 * so the user can do it manually. Parcels.location is a {lat,lng} JSONB.
 *
 * If a parcel is already linked (currentParcelId), only switch when:
 *   - the closest parcel is different, AND
 *   - it's at least 50 m closer than the current one (avoids flip-flopping
 *     between near-identical parcels on every GPS jitter).
 */
async function autoLinkParcel(
  admin: any,
  stationId: string,
  userId: string,
  lat: number,
  lng: number,
  currentParcelId: string | null
): Promise<void> {
  const { data: parcels } = await admin
    .from('parcels')
    .select('id, name, location')
    .eq('user_id', userId)
    .not('location', 'is', null);

  if (!parcels || parcels.length === 0) return;

  let bestId: string | null = null;
  let bestDistMeters = Infinity;
  let currentDistMeters = Infinity;

  for (const p of parcels as Array<{ id: string; name: string; location: { lat?: number; lng?: number } | null }>) {
    const pl = p.location;
    if (!pl || typeof pl.lat !== 'number' || typeof pl.lng !== 'number') continue;
    const d = haversineMeters(lat, lng, pl.lat, pl.lng);
    if (d < bestDistMeters) {
      bestDistMeters = d;
      bestId = p.id;
    }
    if (p.id === currentParcelId) {
      currentDistMeters = d;
    }
  }

  // Beyond 1 km we don't guess — could be a different farm.
  if (!bestId || bestDistMeters > 1000) return;

  // Already linked to the best parcel? Nothing to do.
  if (bestId === currentParcelId) return;

  // Linked to a different parcel — only switch if the new one is meaningfully
  // closer (>= 50 m improvement). Prevents constant flipping on GPS jitter.
  if (currentParcelId && currentDistMeters - bestDistMeters < 50) return;

  await admin
    .from('physical_weather_stations')
    .update({ parcel_id: bestId })
    .eq('id', stationId);
  console.log(
    `[TTN Webhook] Auto-linked station ${stationId} to parcel ${bestId} (${Math.round(bestDistMeters)}m)` +
      (currentParcelId ? ` — replaced ${currentParcelId} at ${Math.round(currentDistMeters)}m` : '')
  );
}

/** Great-circle distance between two lat/lng pairs in meters. */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function logWebhookError(admin: any, entry: ErrorLogEntry): Promise<void> {
  try {
    await admin.from('ttn_webhook_errors').insert({
      device_id: entry.deviceId,
      error_message: entry.errorMessage,
      raw_body: entry.rawBody as any,
      ip_address: entry.ipAddress,
      http_status: entry.httpStatus,
    });
  } catch (logErr) {
    // Never fail the webhook because logging the error failed
    console.error('[TTN Webhook] Failed to log error:', logErr);
  }
}
