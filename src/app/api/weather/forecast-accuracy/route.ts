import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getForecastAccuracy } from '@/lib/weather/forecast-accuracy';

/**
 * GET /api/weather/forecast-accuracy?stationId=X&days=7
 * Returns forecast vs observed comparison for the past N days.
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
    const days = parseInt(searchParams.get('days') || '7', 10);

    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    // Verify user owns this station
    const { data: station } = await supabase
      .from('weather_stations')
      .select('id')
      .eq('id', stationId)
      .eq('user_id', user.id)
      .single();

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const result = await getForecastAccuracy(stationId, days, supabase);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Weather API] forecast-accuracy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
