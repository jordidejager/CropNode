import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { linkWeatherStationToKnmi } from '@/lib/weather/knmi-service';

/**
 * POST /api/weather/knmi/link
 * Links the user's weather station to the nearest KNMI station.
 * Body: { stationId: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { stationId } = body;

    if (!stationId) {
      return NextResponse.json({ error: 'stationId required' }, { status: 400 });
    }

    // Verify the station belongs to the user
    const { data: station } = await supabase
      .from('weather_stations')
      .select('id')
      .eq('id', stationId)
      .eq('user_id', user.id)
      .single();

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const knmiCode = await linkWeatherStationToKnmi(stationId, supabase);

    return NextResponse.json({ success: true, knmiCode });
  } catch (error) {
    console.error('[API] KNMI link error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
