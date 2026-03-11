import { NextResponse } from 'next/server';
import { getKnmiStations } from '@/lib/weather/knmi-service';

// KNMI stations are public reference data — no auth required
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fruitOnly = searchParams.get('fruitOnly') === 'true';

    const stations = await getKnmiStations(fruitOnly);
    return NextResponse.json({ success: true, data: stations });
  } catch (error) {
    console.error('[KNMI API] stations error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
