import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/weather/weather-service';
import { runProactiveAlerts } from '@/lib/weather/proactive-alerts';

/**
 * GET /api/cron/weather-alerts
 * Proactive weather alerts cron — checks forecast conditions and sends
 * WhatsApp messages for frost warnings, extreme rain, etc.
 * Schedule: 2x daily at 06:00 and 18:00 (see vercel.json)
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();
    const result = await runProactiveAlerts(serviceClient);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] weather-alerts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
