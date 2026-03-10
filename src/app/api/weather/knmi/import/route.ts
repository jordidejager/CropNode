import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { importKnmiSeasons, getKnmiImportStatus } from '@/lib/weather/knmi-service';
import { createServiceRoleClient } from '@/lib/weather/weather-service';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { stationCode, yearsBack = 3 } = body;

    if (!stationCode || typeof stationCode !== 'number') {
      return NextResponse.json(
        { error: 'stationCode (number) is required' },
        { status: 400 }
      );
    }

    // Check if already imported
    const status = await getKnmiImportStatus(stationCode);
    if (status.hasData && status.rowCount > 100) {
      return NextResponse.json({
        success: true,
        message: 'Data already imported',
        status,
      });
    }

    // Use service role client to bypass RLS for public KNMI tables
    const serviceClient = createServiceRoleClient();
    const result = await importKnmiSeasons(
      stationCode,
      Math.min(yearsBack, 5), // Cap at 5 years
      serviceClient
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[KNMI API] import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stationCode = searchParams.get('stationCode');

    if (!stationCode) {
      return NextResponse.json(
        { error: 'stationCode is required' },
        { status: 400 }
      );
    }

    const status = await getKnmiImportStatus(parseInt(stationCode, 10));
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('[KNMI API] import status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
