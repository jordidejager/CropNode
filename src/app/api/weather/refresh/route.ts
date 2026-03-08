import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchAndStoreForecast,
  fetchAndStoreMultiModel,
  fetchAndStoreEnsemble,
  aggregateDaily,
} from '@/lib/weather/weather-service';

/**
 * POST /api/weather/refresh
 * Body: { stationId }
 * Forces a full refresh: best_match forecast + multi-model + ensemble.
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

    if (!stationId || typeof stationId !== 'string') {
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

    // 1. Fetch best_match forecast
    const recordsFetched = await fetchAndStoreForecast(stationId);

    // 2. Aggregate today and yesterday
    const today = new Date().toISOString().split('T')[0]!;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
    await aggregateDaily(stationId, today);
    await aggregateDaily(stationId, yesterday);

    // 3. Fetch multi-model and ensemble in parallel
    const multiModelPromise = fetchAndStoreMultiModel(stationId).catch((err) => {
      console.error('[Weather API] Multi-model refresh error:', err);
    });
    const ensemblePromise = fetchAndStoreEnsemble(stationId).catch((err) => {
      console.error('[Weather API] Ensemble refresh error:', err);
    });

    await Promise.all([multiModelPromise, ensemblePromise]);

    return NextResponse.json({ success: true, recordsFetched });
  } catch (error) {
    console.error('[Weather API] refresh error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
