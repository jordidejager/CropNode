import { NextRequest, NextResponse } from 'next/server';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { apiError, ErrorCodes } from '@/lib/api-utils';
import { rijenGeoJSON } from '@/lib/rijen/store';

/**
 * GET /api/parcels/[id]/rijen-geojson
 * Rijen van een hoofdperceel als GeoJSON FeatureCollection (WGS84).
 *   ?gerooid=0   → gerooide rijen weglaten (standaard: meenemen)
 *   ?download=1  → als bestand "rijen-<perceelnaam>.geojson"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    let user = userData.user;
    // Alleen bij een onbereikbare auth-server terugvallen op de (ongeverifieerde) cookie-sessie,
    // nooit bij een ongeldige of vervalste token.
    if (!user && userError && isAuthRetryableFetchError(userError)) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user || null;
    }
    if (!user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const { data: perceel, error } = await getSupabaseAdmin()
      .from('parcels')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      return apiError('Fout bij ophalen perceel', ErrorCodes.INTERNAL_ERROR, 500);
    }
    if (!perceel) {
      return apiError('Perceel niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }

    const zoek = request.nextUrl.searchParams;
    const inclGerooid = zoek.get('gerooid') !== '0';
    const download = zoek.get('download') === '1';

    const fc = await rijenGeoJSON(user.id, id, inclGerooid);
    if (!fc) {
      return apiError('Perceel niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/geo+json; charset=utf-8',
      'Cache-Control': 'no-store',
    };
    if (download) {
      const bestand = `rijen-${slug((perceel as { name?: string | null }).name)}.geojson`;
      headers['Content-Disposition'] = `attachment; filename="${bestand}"`;
    }
    return new NextResponse(JSON.stringify(fc, null, download ? 2 : 0), { status: 200, headers });
  } catch (error) {
    console.error('[rijen-geojson GET]', error);
    return apiError(
      error instanceof Error ? error.message : 'GeoJSON maken mislukt',
      ErrorCodes.INTERNAL_ERROR,
      500
    );
  }
}

/** "Steketee Oost (2)" → "steketee-oost-2"; ASCII-only, zodat de bestandsnaam overal werkt. */
function slug(naam: string | null | undefined): string {
  const s = (naam ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'perceel';
}
