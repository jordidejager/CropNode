import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/weather/freshness?stationId=X
 * Returns how fresh the weather data for this station is.
 *
 * Status thresholds:
 * - fresh: < 90 minutes old (within 1 cron-window + buffer)
 * - ok:    90 min - 4 hours
 * - stale: > 4 hours
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId');
    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    const { data: station } = await supabase
      .from('weather_stations')
      .select('id')
      .eq('id', stationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const { data: log } = await supabase
      .from('weather_fetch_log')
      .select('fetched_at')
      .eq('station_id', stationId)
      .eq('fetch_type', 'forecast')
      .eq('status', 'success')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!log?.fetched_at) {
      return NextResponse.json({
        success: true,
        data: { lastFetchedAt: null, ageMinutes: null, status: 'unknown' },
      });
    }

    const ageMs = Date.now() - new Date(log.fetched_at).getTime();
    const ageMinutes = Math.floor(ageMs / 60_000);

    let status: 'fresh' | 'ok' | 'stale';
    if (ageMinutes < 90) status = 'fresh';
    else if (ageMinutes < 240) status = 'ok';
    else status = 'stale';

    return NextResponse.json({
      success: true,
      data: { lastFetchedAt: log.fetched_at, ageMinutes, status },
    });
  } catch (error) {
    console.error('[Weather API] freshness error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
