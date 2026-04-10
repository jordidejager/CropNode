import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * GET /api/parcels/[id]/soil-analyses?type=parcel|sub_parcel
 * Alle grondmonsters voor dit perceel, gesorteerd op datum DESC.
 * Voor sub_parcels: toont ook grondmonsters van het hoofdperceel (gemarkeerd met inherited=true).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const type = request.nextUrl.searchParams.get('type') || 'sub_parcel';
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    if (type === 'parcel') {
      // Hoofdperceel: alleen eigen grondmonsters
      const { data, error } = await supabase
        .from('soil_analyses')
        .select('*')
        .eq('parcel_id', id)
        .eq('user_id', user.id)
        .order('datum_monstername', { ascending: false });

      if (error) return apiError('Fout bij ophalen analyses', ErrorCodes.INTERNAL_ERROR, 500);
      return apiSuccess(data || []);
    }

    // Sub-parcel: eigen grondmonsters + die van het hoofdperceel als fallback
    const { data: ownData, error: ownError } = await supabase
      .from('soil_analyses')
      .select('*')
      .eq('sub_parcel_id', id)
      .eq('user_id', user.id)
      .order('datum_monstername', { ascending: false });

    if (ownError) return apiError('Fout bij ophalen analyses', ErrorCodes.INTERNAL_ERROR, 500);

    // Zoek het hoofdperceel ID via de sub_parcel
    const { data: subParcel } = await supabase
      .from('sub_parcels')
      .select('parcel_id')
      .eq('id', id)
      .maybeSingle();

    let parentData: any[] = [];
    if (subParcel?.parcel_id) {
      const { data: pData } = await supabase
        .from('soil_analyses')
        .select('*')
        .eq('parcel_id', subParcel.parcel_id)
        .eq('user_id', user.id)
        .order('datum_monstername', { ascending: false });

      parentData = (pData || []).map((a: any) => ({ ...a, inherited: true }));
    }

    // Combineer: eigen eerst, dan overgeërfde van hoofdperceel
    const combined = [...(ownData || []), ...parentData]
      .sort((a, b) => new Date(b.datum_monstername).getTime() - new Date(a.datum_monstername).getTime());

    return apiSuccess(combined);

  } catch (error) {
    return handleUnknownError(error, 'soil-analyses GET');
  }
}
