import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * GET /api/parcels/[id]/soil-analyses
 * Alle grondmonsters voor dit subperceel, gesorteerd op datum DESC.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: subParcelId } = await params;
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const { data, error } = await supabase
      .from('soil_analyses')
      .select('*')
      .eq('sub_parcel_id', subParcelId)
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
