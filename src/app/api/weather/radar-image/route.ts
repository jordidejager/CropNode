import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/weather/radar-image?type=animation&history=6&forecast=12
 * GET /api/weather/radar-image?type=single&time=YYYYMMDDHHmm
 *
 * Proxy for Buienradar radar images to avoid CORS issues.
 * - type=animation: animated GIF with configurable history/forecast frames
 *   - history: number of historical frames (default 6, ~1h at 10min intervals)
 *   - forecast: number of forecast frames (default 12 for 2h, 48 for 8h, etc.)
 * - type=single: single frame, optional time parameter
 */
export async function GET(request: NextRequest) {
  // Rate limit: 30 requests per minute per IP
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rl = rateLimit(`radar:${ip}`, 30, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') ?? 'single';
    const time = searchParams.get('time');
    const history = searchParams.get('history') ?? '6';
    const forecast = searchParams.get('forecast') ?? '12';

    let url: string;

    if (type === 'animation') {
      // Animated GIF with history + forecast frames
      // Buienradar animation API: history=N historical frames, forecast=N forecast frames
      url = `https://image.buienradar.nl/2.0/image/animation/RadarMapRainNL?extension=gif&width=550&height=512&renderBackground=True&renderBranding=False&renderText=True&history=${history}&forecast=${forecast}`;
    } else {
      // Single frame
      url = `https://image.buienradar.nl/2.0/image/single/RadarMapRainNL?height=512&width=550&renderBackground=True&renderBranding=False&renderText=True`;
      if (time) {
        url += `&time=${time}`;
      }
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
        'Referer': 'https://www.buienradar.nl/',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[Radar Proxy] Buienradar returned ${response.status}: ${response.statusText}`);
      return NextResponse.json(
        { error: `Buienradar returned ${response.status}` },
        { status: 502 }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') ?? (type === 'animation' ? 'image/gif' : 'image/png');

    // Cache animation GIFs for 5 minutes (they update with new model runs)
    const maxAge = 300;

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      },
    });
  } catch (err) {
    console.error('[Radar Proxy] Failed to fetch radar image:', err);
    return NextResponse.json(
      { error: 'Failed to fetch radar image' },
      { status: 502 }
    );
  }
}
