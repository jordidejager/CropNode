import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getKnmiCumulatives } from '@/lib/weather/knmi-service';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stationCode = searchParams.get('stationCode');
    const year = searchParams.get('year');

    if (!stationCode || !year) {
      return NextResponse.json(
        { error: 'stationCode and year are required' },
        { status: 400 }
      );
    }

    const data = await getKnmiCumulatives(
      parseInt(stationCode, 10),
      parseInt(year, 10)
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[KNMI API] cumulatives error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
