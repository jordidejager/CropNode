import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDailyRange } from '@/lib/weather/weather-service';

/**
 * GET /api/weather/daily?stationId=X&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns daily data for a date range (for charts/comparisons).
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
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!stationId || !start || !end) {
      return NextResponse.json(
        { error: 'stationId, start, and end are required' },
        { status: 400 }
      );
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

    const data = await getDailyRange(stationId, start, end);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Weather API] daily error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
