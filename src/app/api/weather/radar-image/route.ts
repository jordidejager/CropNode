import { NextResponse } from 'next/server';

const RADAR_URL = 'https://image.buienradar.nl/2.0/image/single/RadarMapRainNL?height=512&width=500';

export const dynamic = 'force-dynamic';

/**
 * GET /api/weather/radar-image
 * Proxy for Buienradar radar image to avoid CORS issues.
 */
export async function GET() {
  try {
    const response = await fetch(RADAR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CropNode/1.0)',
        'Accept': 'image/*',
      },
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
    const contentType = response.headers.get('Content-Type') ?? 'image/png';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
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
