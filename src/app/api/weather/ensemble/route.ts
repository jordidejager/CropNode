import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnsembleStats } from '@/lib/weather/weather-service';
import type { EnsembleVariable } from '@/lib/weather/weather-types';

const VALID_MODELS = ['ecmwf_ifs', 'gfs'] as const;
const VALID_VARIABLES: EnsembleVariable[] = [
  'temperature_c',
  'precipitation_mm',
  'wind_speed_ms',
  'humidity_pct',
];

/**
 * GET /api/weather/ensemble?stationId=X&model=ecmwf_ifs&variable=temperature_c
 * Returns ensemble statistics (min, p10, p25, median, p75, p90, max) per timestamp.
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
    const model = searchParams.get('model') ?? 'ecmwf_ifs';
    const variable = searchParams.get('variable') ?? 'temperature_c';

    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
    }

    if (!VALID_MODELS.includes(model as typeof VALID_MODELS[number])) {
      return NextResponse.json(
        { error: `Invalid model. Must be one of: ${VALID_MODELS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!VALID_VARIABLES.includes(variable as EnsembleVariable)) {
      return NextResponse.json(
        { error: `Invalid variable. Must be one of: ${VALID_VARIABLES.join(', ')}` },
        { status: 400 }
      );
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

    const data = await getEnsembleStats(
      stationId,
      model as 'ecmwf_ifs' | 'gfs',
      variable as EnsembleVariable
    );

    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=900' } });
  } catch (error) {
    console.error('[Weather API] ensemble error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
