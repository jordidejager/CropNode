import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculatePhenologyStatus, calculateSeasonGDD } from '@/lib/weather/phenology';

/**
 * GET /api/weather/phenology?stationId=X&crop=appel
 * Returns phenology status (bloom prediction, insect timing, etc.)
 * based on cumulative GDD from Jan 1 to today + forecast.
 *
 * Data sources (merged for complete season):
 * - Jan 1 to station creation: KNMI observed daily (linked via knmi_station_id)
 * - Station creation to today: weather_data_daily (Open-Meteo best_match)
 * - Today onwards: weather_data_daily forecast (for estimated dates)
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

    // Get station with KNMI link
    const { data: station } = await supabase
      .from('weather_stations')
      .select('id, knmi_station_id')
      .eq('id', stationId)
      .eq('user_id', user.id)
      .single();

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const year = new Date().getFullYear();
    const jan1 = `${year}-01-01`;
    const today = new Date().toISOString().split('T')[0]!;
    const futureDate = new Date(Date.now() + 16 * 86400000).toISOString().split('T')[0];

    // 1. Get Open-Meteo daily data (station creation onwards + forecast)
    const { data: ometeoDaily } = await supabase
      .from('weather_data_daily')
      .select('date, gdd_base5, gdd_base10')
      .eq('station_id', stationId)
      .gte('date', jan1)
      .lte('date', futureDate)
      .order('date');

    const ometeoRows = ometeoDaily ?? [];
    const firstOmeteoDate = ometeoRows[0]?.date;

    // 2. If KNMI station linked and Open-Meteo data doesn't start at Jan 1,
    //    backfill with KNMI observed daily for the gap period.
    let knmiRows: Array<{ date: string; gdd_base5: number | null; gdd_base10: number | null }> = [];

    if (station.knmi_station_id && firstOmeteoDate && firstOmeteoDate > jan1) {
      // Get KNMI data from Jan 1 to the day before first Open-Meteo row
      const knmiEnd = new Date(firstOmeteoDate);
      knmiEnd.setDate(knmiEnd.getDate() - 1);
      const knmiEndStr = knmiEnd.toISOString().split('T')[0];

      if (knmiEndStr >= jan1) {
        const { data: knmiDaily } = await supabase
          .from('knmi_observations_daily' as any)
          .select('date, gdd_base5, gdd_base10')
          .eq('station_code', station.knmi_station_id)
          .gte('date', jan1)
          .lte('date', knmiEndStr)
          .order('date');

        knmiRows = (knmiDaily ?? []) as typeof knmiRows;
      }
    } else if (station.knmi_station_id && ometeoRows.length === 0) {
      // No Open-Meteo data at all — use full KNMI range
      const { data: knmiDaily } = await supabase
        .from('knmi_observations_daily' as any)
        .select('date, gdd_base5, gdd_base10')
        .eq('station_code', station.knmi_station_id)
        .gte('date', jan1)
        .lte('date', today)
        .order('date');

      knmiRows = (knmiDaily ?? []) as typeof knmiRows;
    }

    // 3. Merge: KNMI first, then Open-Meteo (no overlap — KNMI ends before Open-Meteo starts)
    const allDaily = [...knmiRows, ...ometeoRows];

    if (allDaily.length === 0) {
      return NextResponse.json({ success: true, data: { events: [], gdd5: 0, gdd10: 0 } });
    }

    // Split into past (for cumulative) and future (for predictions)
    const pastData = allDaily.filter(d => d.date <= today);
    const futureData = allDaily.filter(d => d.date > today);

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
