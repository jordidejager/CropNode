import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculatePhenologyStatus, calculateSeasonGDD } from '@/lib/weather/phenology';

/**
 * GET /api/weather/phenology?stationId=X&crop=appel
 * Returns phenology status (bloom prediction, insect timing, etc.)
 * based on cumulative GDD from Jan 1 to today + forecast.
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
    const crop = searchParams.get('crop') as 'appel' | 'peer' | undefined;

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

    // Get daily data from Jan 1 to today (past) + forecast (future)
    const year = new Date().getFullYear();
    const jan1 = `${year}-01-01`;
    const futureDate = new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0];

    const { data: dailyData } = await supabase
      .from('weather_data_daily')
      .select('date, gdd_base5, gdd_base10')
      .eq('station_id', stationId)
      .gte('date', jan1)
      .lte('date', futureDate)
      .order('date');

    if (!dailyData?.length) {
      return NextResponse.json({ success: true, data: { events: [], gdd5: 0, gdd10: 0 } });
    }

    // Split into past (for cumulative) and future (for predictions)
    const today = new Date().toISOString().split('T')[0]!;
    const pastData = dailyData.filter(d => d.date <= today);
    const futureData = dailyData.filter(d => d.date > today);

    const { gdd5, gdd10 } = calculateSeasonGDD(
      pastData.map(d => ({
        date: d.date,
        gddBase5: d.gdd_base5,
        gddBase10: d.gdd_base10,
      }))
    );

    const forecasts = futureData.map(d => ({
      date: d.date,
      gddBase5: d.gdd_base5 ?? 0,
      gddBase10: d.gdd_base10 ?? 0,
    }));

    const events = calculatePhenologyStatus(gdd5, gdd10, forecasts, crop || undefined);

    return NextResponse.json({
      success: true,
      data: {
        events,
        gdd5: Math.round(gdd5),
        gdd10: Math.round(gdd10),
        stationId,
      },
    });
  } catch (error) {
    console.error('[Weather API] phenology error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
