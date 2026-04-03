import { NextResponse } from 'next/server';
import { refreshAllStations, createServiceRoleClient } from '@/lib/weather/weather-service';
import { refreshKnmiStations } from '@/lib/weather/knmi-service';

/**
 * GET /api/cron/weather-refresh
 * Cron job that refreshes forecast data for all weather stations.
 * Uses service-role client to bypass RLS (no user session in cron context).
 * Secured with CRON_SECRET environment variable.
 * Schedule: every 3 hours (see vercel.json)
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service-role client to bypass RLS (cron has no user session)
    const serviceClient = createServiceRoleClient();

    const stationsRefreshed = await refreshAllStations(serviceClient);

    // Also refresh KNMI observed data (last 3 days for imported stations)
    let knmiRefreshed = 0;
    try {
      knmiRefreshed = await refreshKnmiStations(serviceClient);
    } catch (err) {
      console.error('[Cron] KNMI refresh error:', err);
    }

    return NextResponse.json({
      success: true,
      stationsRefreshed,
      knmiRefreshed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] weather-refresh error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
