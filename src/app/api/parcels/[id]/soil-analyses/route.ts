import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * GET /api/parcels/[id]/soil-analyses?type=parcel|sub_parcel
 * Alle grondmonsters voor dit perceel, gesorteerd op datum DESC.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const type = request.nextUrl.searchParams.get('type') || 'sub_parcel';
    const idColumn = type === 'parcel' ? 'parcel_id' : 'sub_parcel_id';
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const { data, error } = await supabase
      .from('soil_analyses')
      .select('*')
      .eq(idColumn, id)
      .eq('user_id', user.id)
      .order('datum_monstername', { ascending: false });

    if (error) {
      return apiError('Fout bij ophalen analyses', ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess(data || []);

  } catch (error) {
    return handleUnknownError(error, 'soil-analyses GET');
  }
}
