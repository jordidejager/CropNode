import { NextResponse } from 'next/server';
import { getKnmiCumulatives } from '@/lib/weather/knmi-service';

// KNMI cumulative data is derived from public observations — no auth required
export async function GET(request: Request) {
  try {
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
