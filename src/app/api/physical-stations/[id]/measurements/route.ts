import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/physical-stations/[id]/measurements
 *   ?range=24h|7d|30d|90d (default 7d)
 *   ?limit=number (optional — caps the result set)
 *   ?since=ISO (optional — overrides range)
 *
 * Returns measurements newest first for the given station.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership via physical_weather_stations RLS
  const { data: station } = await supabase
    .from('physical_weather_stations')
    .select('id, user_id, label, device_id')
    .eq('id', id)
    .maybeSingle();

  if (!station || station.user_id !== user.id) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const range = searchParams.get('range') ?? '7d';
  const limit = parseInt(searchParams.get('limit') ?? '2000', 10);
  const sinceParam = searchParams.get('since');

  let sinceIso: string;
  if (sinceParam) {
    sinceIso = sinceParam;
  } else {
    const hours = rangeToHours(range);
    sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
  }

  // We try the full projection first (includes soil + leaf columns from
  // migration 080). If those columns don't exist yet, fall back so the
  // route works during the migration window.
  const fullProjection =
    'id, measured_at, frame_counter, temperature_c, humidity_pct, pressure_hpa,' +
    ' illuminance_lux, rain_counter, rainfall_mm, dew_point_c, wet_bulb_c,' +
    ' soil_moisture_pct, soil_temp_c, soil_conductivity_us_cm,' +
    ' leaf_wetness_pct_measured, leaf_temp_c,' +
    ' battery_v, battery_status, rssi_dbm, snr_db, gateway_count';
  const baseProjection =
    'id, measured_at, frame_counter, temperature_c, humidity_pct, pressure_hpa,' +
    ' illuminance_lux, rain_counter, rainfall_mm, dew_point_c, wet_bulb_c,' +
    ' battery_v, battery_status, rssi_dbm, snr_db, gateway_count';

  let { data, error } = await supabase
    .from('weather_measurements')
    .select(fullProjection)
    .eq('station_id', id)
    .gte('measured_at', sinceIso)
    .order('measured_at', { ascending: false })
    .limit(Math.min(limit, 5000));

  if (error && (error.code === '42703' || /soil_|leaf_/.test(error.message))) {
    const retry = await supabase
      .from('weather_measurements')
      .select(baseProjection)
      .eq('station_id', id)
      .gte('measured_at', sinceIso)
      .order('measured_at', { ascending: false })
      .limit(Math.min(limit, 5000));
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    data,
    meta: {
      station_id: id,
      since: sinceIso,
      count: data?.length ?? 0,
    },
  });
}

function rangeToHours(range: string): number {
  const match = /^(\d+)([hdw])$/i.exec(range.trim());
  if (!match) return 168; // default 7d
  const n = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (unit === 'h') return n;
  if (unit === 'd') return n * 24;
  if (unit === 'w') return n * 24 * 7;
  return 168;
}
