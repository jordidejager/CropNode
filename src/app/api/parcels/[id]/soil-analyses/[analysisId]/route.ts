import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-client';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * PUT /api/parcels/[id]/soil-analyses/[analysisId]
 * Handmatige correctie van geëxtraheerde waarden.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; analysisId: string }> }
) {
  try {
    const { analysisId } = await params;
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from('soil_analyses')
      .update({
        ...body,
        handmatig_gecorrigeerd: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return apiError(`Fout bij updaten: ${error.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess(data);

  } catch (error) {
    return handleUnknownError(error, 'soil-analyses PUT');
  }
}

/**
 * DELETE /api/parcels/[id]/soil-analyses/[analysisId]
 * Verwijder analyse + PDF uit storage.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; analysisId: string }> }
) {
  try {
    const { analysisId } = await params;
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const adminClient = createServiceRoleClient();

    // Haal record op voor storage path
    const { data: analysis } = await adminClient
      .from('soil_analyses')
      .select('pdf_storage_path, user_id')
      .eq('id', analysisId)
      .single();

    if (!analysis || analysis.user_id !== user.id) {
      return apiError('Analyse niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }

    // Verwijder PDF uit storage
    if (analysis.pdf_storage_path) {
      await adminClient.storage
        .from('soil-analysis-pdfs')
        .remove([analysis.pdf_storage_path]);
    }

    // Verwijder record
    const { error } = await adminClient
      .from('soil_analyses')
      .delete()
      .eq('id', analysisId);

    if (error) {
      return apiError(`Fout bij verwijderen: ${error.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess({ deleted: true });

  } catch (error) {
    return handleUnknownError(error, 'soil-analyses DELETE');
  }
}
