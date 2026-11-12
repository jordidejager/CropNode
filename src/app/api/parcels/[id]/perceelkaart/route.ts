import { NextRequest, NextResponse } from 'next/server';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { apiError, ErrorCodes } from '@/lib/api-utils';
import { laadPerceelkaart } from '@/lib/rijen/perceelkaart-store';
import { PERCEELKAART_DELEN, perceelkaartBestandsnaam, perceelkaartDeel, type PerceelkaartDeel } from '@/lib/rijen/perceelkaart';

/**
 * GET /api/parcels/[id]/perceelkaart
 * Perceelkaart van een hoofdperceel (perceelgrens + rijen + machinematen) als GeoJSON, zie
 * docs/rijenkaart/PERCEELKAART.md. Alleen lezen, alleen eigen percelen.
 *   ?download=1               → als bestand "perceelkaart-<perceelnaam>.geojson"
 *   ?deel=grens|rijen|obstakels → alleen dat deel (metadata blijft volledig)
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

    const zoek = request.nextUrl.searchParams;
    const deel = zoek.get('deel');
    if (deel && !(PERCEELKAART_DELEN as readonly string[]).includes(deel)) {
      return apiError(`Onbekend deel "${deel}" (grens, rijen of obstakels).`, ErrorCodes.VALIDATION_ERROR, 400);
    }

    const kaart = await laadPerceelkaart(user.id, id);
    if (!kaart) {
      return apiError('Perceel niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }
    const uit = deel ? perceelkaartDeel(kaart, deel as PerceelkaartDeel) : kaart;

    const headers: Record<string, string> = {
      'Content-Type': 'application/geo+json; charset=utf-8',
      'Cache-Control': 'no-store',
    };
    const download = zoek.get('download') === '1';
    if (download) {
      headers['Content-Disposition'] = `attachment; filename="${perceelkaartBestandsnaam(kaart.metadata.perceel_naam)}"`;
    }
    return new NextResponse(JSON.stringify(uit, null, download ? 1 : 0), { status: 200, headers });
  } catch (error) {
    console.error('[perceelkaart GET]', error);
    return apiError(
      error instanceof Error ? error.message : 'Perceelkaart maken mislukt',
      ErrorCodes.INTERNAL_ERROR,
      500
    );
  }
}
