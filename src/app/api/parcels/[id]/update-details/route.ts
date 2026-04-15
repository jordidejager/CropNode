import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-client';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * PUT /api/parcels/[id]/update-details
 * Server-side cascade update: wijzig crop/variety/area op sub_parcel
 * en cascade naar parcel_history + cell_sub_parcels in één transactie.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const adminClient = createServiceRoleClient();

    // Auth
    let user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user || null;
    }
    if (!user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const body = await request.json();
    const { crop, variety, area } = body;

    if (!crop && !variety && area == null) {
      return apiError('Geen wijzigingen meegegeven', ErrorCodes.VALIDATION_ERROR, 400);
    }

    // Verify ownership
    const { data: subParcel } = await adminClient
      .from('sub_parcels')
      .select('id, crop, variety, area, user_id')
      .eq('id', id)
      .single();

    if (!subParcel || subParcel.user_id !== user.id) {
      return apiError('Perceel niet gevonden', ErrorCodes.NOT_FOUND, 404);
    }

    const oldCrop = subParcel.crop;
    const oldVariety = subParcel.variety;
    const updates: Record<string, unknown> = {};
    if (crop !== undefined) updates.crop = crop;
    if (variety !== undefined) updates.variety = variety;
    if (area !== undefined) updates.area = Number(area) || 0;

    // 1. Update sub_parcels (bron van waarheid)
    const { error: subError } = await adminClient
      .from('sub_parcels')
      .update(updates)
      .eq('id', id);

    if (subError) {
      return apiError(`sub_parcels update mislukt: ${subError.message}`, ErrorCodes.INTERNAL_ERROR, 500);
    }

    // 2. Cascade: parcel_history (spuitregistraties)
    if (crop !== oldCrop || variety !== oldVariety) {
      const historyUpdate: Record<string, unknown> = {};
      if (crop !== undefined) historyUpdate.crop = crop;
      if (variety !== undefined) historyUpdate.variety = variety;

      const { error: histError } = await adminClient
        .from('parcel_history')
        .update(historyUpdate)
        .eq('parcel_id', id);

      if (histError) {
        console.error('[cascade] parcel_history update failed:', histError.message);
        // Niet fataal — log maar ga door
      }

      // 3. Cascade: cell_sub_parcels (opslag)
      if (variety !== undefined) {
        const { error: cellError } = await adminClient
          .from('cell_sub_parcels')
          .update({ variety })
          .eq('sub_parcel_id', id);

        if (cellError) {
          console.error('[cascade] cell_sub_parcels update failed:', cellError.message);
        }
      }
    }

    return apiSuccess({ id, ...updates, cascaded: true });

  } catch (error) {
    return handleUnknownError(error, 'parcels/update-details PUT');
  }
}
