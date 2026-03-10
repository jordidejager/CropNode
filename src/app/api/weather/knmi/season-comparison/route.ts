import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getKnmiSeasonComparison } from '@/lib/weather/knmi-service';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stationCode = searchParams.get('stationCode');
    const yearsParam = searchParams.get('years');

    if (!stationCode || !yearsParam) {
      return NextResponse.json(
        { error: 'stationCode and years are required' },
        { status: 400 }
      );
    }

    const years = yearsParam.split(',').map(y => parseInt(y.trim(), 10)).filter(y => !isNaN(y));
    if (years.length === 0) {
      return NextResponse.json({ error: 'Invalid years parameter' }, { status: 400 });
    }

    const data = await getKnmiSeasonComparison(parseInt(stationCode, 10), years);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[KNMI API] season-comparison error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
