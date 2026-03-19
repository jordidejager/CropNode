import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, ErrorCodes } from '@/lib/api-utils';
import { fetchBrpHistorie } from '@/lib/brp-history';
import { calculateCenter } from '@/lib/rvo-api';

/**
 * GET /api/parcels/[id]/gewashistorie
 * Returns cached BRP gewashistorie for a parcel.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: parcelId } = await params;
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    // Verify parcel ownership
    const { data: parcel, error: parcelError } = await supabase
      .from('parcels')
      .select('id')
      .eq('id', parcelId)
      .eq('user_id', user.id)
      .single();

    if (parcelError || !parcel) {
      return apiError('Perceel niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }

    // Fetch cached history
    const { data: historie, error: histError } = await supabase
      .from('brp_gewashistorie')
      .select('id, parcel_id, jaar, gewascode, gewas, category, crop_group, fetched_at')
      .eq('parcel_id', parcelId)
      .eq('user_id', user.id)
      .order('jaar', { ascending: true });

    if (histError) {
      return apiError('Fout bij ophalen gewashistorie', ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess(historie || []);
  } catch (error) {
    console.error('[gewashistorie GET]', error);
    return apiError('Onverwachte fout', ErrorCodes.INTERNAL_ERROR, 500);
  }
}

/**
 * POST /api/parcels/[id]/gewashistorie
 * Fetches BRP data from PDOK and caches it.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: parcelId } = await params;
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    // Load parcel with geometry/location
    const { data: parcel, error: parcelError } = await supabase
      .from('parcels')
      .select('id, location, geometry')
      .eq('id', parcelId)
      .eq('user_id', user.id)
      .single();

    if (parcelError || !parcel) {
      return apiError('Perceel niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }

    // Determine centroid
    let lat: number | undefined;
    let lng: number | undefined;

    if (parcel.location?.lat && parcel.location?.lng) {
      lat = parcel.location.lat;
      lng = parcel.location.lng;
    } else if (parcel.geometry) {
      const center = calculateCenter(parcel.geometry);
      lat = center.lat;
      lng = center.lng;
    }

    if (!lat || !lng) {
      return apiError(
        'Perceel heeft geen locatie of geometrie',
        ErrorCodes.BAD_REQUEST,
        400
      );
    }

    // Fetch from PDOK
    const results = await fetchBrpHistorie(lat, lng);

    if (results.length === 0) {
      return apiSuccess({ fetched: 0, data: [] });
    }

    // Upsert into brp_gewashistorie
    const rows = results.map((r) => ({
      parcel_id: parcelId,
      jaar: r.jaar,
      gewascode: r.gewascode,
      gewas: r.gewas,
      category: r.category,
      crop_group: r.cropGroup,
      user_id: user.id,
    }));

    const { error: upsertError } = await supabase
      .from('brp_gewashistorie')
      .upsert(rows, { onConflict: 'parcel_id,jaar,user_id' });

    if (upsertError) {
      console.error('[gewashistorie POST] Upsert error:', upsertError);
      return apiError('Fout bij opslaan gewashistorie', ErrorCodes.INTERNAL_ERROR, 500);
    }

    // Return the fresh data
    const { data: historie } = await supabase
      .from('brp_gewashistorie')
      .select('id, parcel_id, jaar, gewascode, gewas, category, crop_group, fetched_at')
      .eq('parcel_id', parcelId)
      .eq('user_id', user.id)
      .order('jaar', { ascending: true });

    return apiSuccess({ fetched: results.length, data: historie || [] });
  } catch (error) {
    console.error('[gewashistorie POST]', error);
    return apiError('Onverwachte fout bij ophalen BRP data', ErrorCodes.INTERNAL_ERROR, 500);
  }
}
