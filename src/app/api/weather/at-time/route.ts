import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWeatherAtTime } from '@/lib/weather/weather-service';

/**
 * GET /api/weather/at-time?stationId=X&timestamp=ISO8601
 * Returns weather data at a specific timestamp (for spray registration enrichment).
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
    const timestamp = searchParams.get('timestamp');

    if (!stationId || !timestamp) {
      return NextResponse.json(
        { error: 'stationId and timestamp are required' },
        { status: 400 }
      );
    }

    const parsedTimestamp = new Date(timestamp);
    if (isNaN(parsedTimestamp.getTime())) {
      return NextResponse.json({ error: 'Invalid timestamp format' }, { status: 400 });
    }

    const { data: station } = await supabase
      .from('weather_stations')
      .select('id')
      .eq('id', stationId)
      .eq('user_id', user.id)
      .single();

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const data = await getWeatherAtTime(stationId, parsedTimestamp);

    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  } catch (error) {
    console.error('[Weather API] at-time error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
