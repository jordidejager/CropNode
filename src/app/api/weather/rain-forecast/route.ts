import { NextResponse } from 'next/server';

/**
 * GET /api/weather/rain-forecast?lat=X&lon=Y
 * Proxy for Buienradar rain text API (CORS fallback).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
      return NextResponse.json(
        { error: 'lat and lon are required' },
        { status: 400 }
      );
    }

    const url = `https://gpsgadget.buienradar.nl/data/raintext?lat=${lat}&lon=${lon}`;
    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Buienradar API error' },
        { status: response.status }
      );
    }

    const text = await response.text();

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=120', // Cache 2 minutes
      },
    });
  } catch (error) {
    console.error('[Weather API] rain-forecast proxy error:', error);
    return NextResponse.json(
      { error: 'Proxy request failed' },
      { status: 500 }
    );
  }
}
