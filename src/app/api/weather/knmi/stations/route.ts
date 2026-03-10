import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getKnmiStations } from '@/lib/weather/knmi-service';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
