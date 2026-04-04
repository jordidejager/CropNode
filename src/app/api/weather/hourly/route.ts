import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getHourlyRange } from '@/lib/weather/weather-service';

/**
 * GET /api/weather/hourly?stationId=X&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns hourly data for a date range (for Mills calculation, detail analysis).
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

    // Limit range to 31 days to prevent massive queries
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffDays = (endDate.getTime() - startDate.getTime()) / 86400000;
    if (diffDays > 31) {
      return NextResponse.json(
        { error: 'Date range cannot exceed 31 days for hourly data' },
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

    const data = await getHourlyRange(stationId, start, end);

    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } });
  } catch (error) {
    console.error('[Weather API] hourly error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
