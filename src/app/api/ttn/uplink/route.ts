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
    const { data: station, error: stationErr } = await (admin as any)
      .from('physical_weather_stations')
      .select('id, last_frame_counter')
      .eq('device_id', decoded.deviceId)
      .maybeSingle();

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

    // 6. Dedup: the unique constraint on (station_id, frame_counter) is our
    //    ultimate backstop, but checking first avoids a pointless insert.
    if (
      station.last_frame_counter !== null &&
      decoded.frameCounter === station.last_frame_counter
    ) {
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

    const rainfallMm = calcRainfallMm(
      decoded.rainCounter,
      previousRow?.rain_counter ?? null
    );

    // 8. Insert measurement
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
      battery_v: decoded.batteryV,
      rainfall_mm: rainfallMm,
      dew_point_c: decoded.dewPointC,
      wet_bulb_c: decoded.wetBulbC,
      battery_status: decoded.batteryStatus,
      rssi_dbm: decoded.rssiDbm,
      snr_db: decoded.snrDb,
      gateway_count: decoded.gatewayCount,
      raw_payload: body,
      harvest_year: getHarvestYear(new Date(decoded.measuredAt)),
    };

    const { error: insertErr } = await (admin as any)
      .from('weather_measurements')
      .upsert(insertRow, {
        onConflict: 'station_id,frame_counter',
        ignoreDuplicates: true,
      });

    if (insertErr) {
      // Unique-violation is fine — race with another retry
      if (insertErr.code === '23505') {
        return NextResponse.json({ success: true, duplicate: true });
      }
      throw new Error(`Measurement insert failed: ${insertErr.message}`);
    }

    // 9. Update the station's heartbeat + last frame for quick dedup next time
    await (admin as any)
      .from('physical_weather_stations')
      .update({
        last_seen_at: decoded.measuredAt,
        last_frame_counter: decoded.frameCounter,
      })
      .eq('id', station.id);

    return NextResponse.json({
      success: true,
      measured_at: decoded.measuredAt,
      rainfall_mm: rainfallMm,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof InvalidTTNPayloadError ? 400 : 500;

    console.error('[TTN Webhook] Error:', message);
    await logWebhookError(admin, {
      deviceId,
      errorMessage: message,
      rawBody: body,
      ipAddress,
      httpStatus: status,
    });

    // Still return 200 so TTN doesn't spam retries for bad payloads
    return NextResponse.json({ success: false, error: message }, { status });
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
