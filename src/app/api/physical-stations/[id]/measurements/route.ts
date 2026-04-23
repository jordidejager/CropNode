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

  const { data, error } = await supabase
    .from('weather_measurements')
    .select(
      'id, measured_at, frame_counter, temperature_c, humidity_pct, pressure_hpa,' +
      ' illuminance_lux, rain_counter, rainfall_mm, dew_point_c, wet_bulb_c,' +
      ' battery_v, battery_status, rssi_dbm, snr_db, gateway_count'
    )
    .eq('station_id', id)
    .gte('measured_at', sinceIso)
    .order('measured_at', { ascending: false })
    .limit(Math.min(limit, 5000));

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
