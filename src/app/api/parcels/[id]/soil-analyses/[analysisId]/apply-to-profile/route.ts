import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-client';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * POST /api/parcels/[id]/soil-analyses/[analysisId]/apply-to-profile
 * Kopieer relevante waarden uit de grondmonsteranalyse naar het parcel_profiles record.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; analysisId: string }> }
) {
  try {
    const { id, analysisId } = await params;
    const type = request.nextUrl.searchParams.get('type') || 'sub_parcel';
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    // Haal analyse op
    const { data: analysis, error: fetchError } = await supabase
      .from('soil_analyses')
      .select('grondsoort_rapport, organische_stof_pct, klei_percentage')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !analysis) {
      return apiError('Analyse niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }

    // Bouw update object — alleen niet-null waarden overnemen
    const profileUpdate: Record<string, unknown> = {
      bodem_bron_analyse_id: analysisId,
      updated_at: new Date().toISOString(),
    };

    if (analysis.grondsoort_rapport) profileUpdate.grondsoort = analysis.grondsoort_rapport;
    if (analysis.organische_stof_pct != null) profileUpdate.organische_stof_pct = analysis.organische_stof_pct;
    if (analysis.klei_percentage != null) profileUpdate.klei_percentage = analysis.klei_percentage;

    // Upsert profiel (service role to bypass RLS)
    const adminClient = createServiceRoleClient();
    const { data: profile, error: upsertError } = await adminClient
      .from('parcel_profiles')
      .upsert({
        ...(type === 'parcel' ? { parcel_id: id } : { sub_parcel_id: id }),
        user_id: user.id,
        ...profileUpdate,
      }, { onConflict: type === 'parcel' ? 'parcel_id' : 'sub_parcel_id' })
      .select()
      .single();

    if (upsertError) {
      return apiError(`Fout bij updaten profiel: ${upsertError.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess(profile);

  } catch (error) {
    return handleUnknownError(error, 'soil-analyses/apply-to-profile POST');
  }
}
