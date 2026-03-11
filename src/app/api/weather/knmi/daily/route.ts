import { NextResponse } from 'next/server';
import { getKnmiDailyRange } from '@/lib/weather/knmi-service';

// KNMI daily observations are public data — no auth required
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stationCode = searchParams.get('stationCode');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!stationCode || !start || !end) {
      return NextResponse.json(
        { error: 'stationCode, start, and end are required' },
        { status: 400 }
      );
    }

    const data = await getKnmiDailyRange(parseInt(stationCode, 10), start, end);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[KNMI API] daily error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
