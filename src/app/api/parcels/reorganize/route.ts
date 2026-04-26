import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-client';
import { apiError, apiSuccess, handleUnknownError, ErrorCodes } from '@/lib/api-utils';

/**
 * POST /api/parcels/reorganize
 *
 * Merges multiple main parcels into one, moving all their sub-parcels
 * under a single new (or existing) main parcel.
 *
 * Body: {
 *   targetName: string;            // Name for the merged main parcel
 *   parcelIds: string[];           // IDs of parcels to merge
 *   stripPrefix?: string;          // Optional prefix to strip from sub-parcel names
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    const body = await request.json();
    const { targetName, parcelIds, stripPrefix } = body as {
      targetName: string;
      parcelIds: string[];
      stripPrefix?: string;
    };

    if (!targetName || !parcelIds || parcelIds.length < 2) {
      return apiError('targetName en minimaal 2 parcelIds zijn vereist', ErrorCodes.VALIDATION_ERROR, 400);
    }

    // 1. Verify all parcels exist and belong to the user
    const { data: parcels, error: fetchError } = await supabase
      .from('parcels')
      .select('id, name, geometry, location, source, rvo_id')
      .in('id', parcelIds)
      .eq('user_id', user.id);

    if (fetchError) {
      return apiError('Fout bij ophalen percelen', ErrorCodes.INTERNAL_ERROR, 500);
    }

    if (!parcels || parcels.length !== parcelIds.length) {
      return apiError('Niet alle percelen gevonden of geen toegang', ErrorCodes.NOT_FOUND, 404);
    }

    // 2. Pick the first parcel as the "target" — we'll update it and delete the rest
    const targetParcel = parcels[0];
    const otherParcelIds = parcelIds.filter(id => id !== targetParcel.id);

    // 3. Merge geometries into a MultiPolygon (if available)
    const geometries = parcels
      .map(p => p.geometry)
      .filter(Boolean);

    let mergedGeometry = targetParcel.geometry;
    if (geometries.length > 1) {
      // Collect all polygon coordinates into a MultiPolygon
      const allCoords: number[][][][] = [];
      for (const geom of geometries) {
        if (geom?.type === 'MultiPolygon') {
          allCoords.push(...geom.coordinates);
        } else if (geom?.type === 'Polygon') {
          allCoords.push(geom.coordinates);
        }
      }
      if (allCoords.length > 0) {
        mergedGeometry = { type: 'MultiPolygon', coordinates: allCoords };
      }
    }

    // 4. Calculate merged center (average of all locations)
    const locations = parcels.map(p => p.location).filter(Boolean);
    let mergedLocation = targetParcel.location;
    if (locations.length > 1) {
      const avgLat = locations.reduce((s, l) => s + (l.lat || 0), 0) / locations.length;
      const avgLng = locations.reduce((s, l) => s + (l.lng || 0), 0) / locations.length;
      mergedLocation = { lat: avgLat, lng: avgLng };
    }

    // 5. Update target parcel with new name and merged geometry
    const { error: updateError } = await supabase
      .from('parcels')
      .update({
        name: targetName,
        geometry: mergedGeometry,
        location: mergedLocation,
      })
      .eq('id', targetParcel.id);

    if (updateError) {
      return apiError('Fout bij updaten hoofdperceel', ErrorCodes.INTERNAL_ERROR, 500);
    }

    // 6. Move sub-parcels from other parcels to the target
    const { error: moveError } = await supabase
      .from('sub_parcels')
      .update({ parcel_id: targetParcel.id })
      .in('parcel_id', otherParcelIds);

    if (moveError) {
      return apiError('Fout bij verplaatsen subpercelen', ErrorCodes.INTERNAL_ERROR, 500);
    }

    // 7. Optionally strip prefix from sub-parcel names
    if (stripPrefix) {
      const { data: subParcels } = await supabase
        .from('sub_parcels')
        .select('id, name')
        .eq('parcel_id', targetParcel.id);

      if (subParcels) {
        for (const sp of subParcels) {
          if (sp.name && sp.name.startsWith(stripPrefix)) {
            const newName = sp.name.slice(stripPrefix.length).trim();
            if (newName) {
              await supabase
                .from('sub_parcels')
                .update({ name: newName })
                .eq('id', sp.id);
            }
          }
        }
      }
    }

    // 7b. Defensive repointing: tabellen die main parcel_id referencen moeten
    // naar het target wijzen vóór we de oude parcels verwijderen. Service-role
    // client gebruiken om RLS te bypassen (zelfde user_id check loopt mee).
    const adminClient = createServiceRoleClient();

    // parcel_history.parcel_id is meestal sub_parcel.id, maar er kunnen edge-case
    // rijen zijn die naar main parcel.id verwijzen — die hier defensief verleggen.
    await adminClient
      .from('parcel_history')
      .update({ parcel_id: targetParcel.id })
      .in('parcel_id', otherParcelIds)
      .eq('user_id', user.id);

    // task_logs heeft parcel_id (whole-parcel mode) — repoint naar target
    await adminClient
      .from('task_logs')
      .update({ parcel_id: targetParcel.id })
      .in('parcel_id', otherParcelIds)
      .eq('user_id', user.id);

    // active_task_sessions idem
    await adminClient
      .from('active_task_sessions')
      .update({ parcel_id: targetParcel.id })
      .in('parcel_id', otherParcelIds)
      .eq('user_id', user.id);

    // harvest_registrations.parcel_id legacy column — repoint
    await adminClient
      .from('harvest_registrations')
      .update({ parcel_id: targetParcel.id })
      .in('parcel_id', otherParcelIds)
      .eq('user_id', user.id);

    // cell_sub_parcels.parcel_id (if used as fallback when sub_parcel_id null)
    await adminClient
      .from('cell_sub_parcels')
      .update({ parcel_id: targetParcel.id })
      .in('parcel_id', otherParcelIds)
      .eq('user_id', user.id);

    // disease_model_config: lossy delete (na merge is er nog maar 1 perceel,
    // dus 1 config — behoud die van het target, verwijder de rest)
    await adminClient
      .from('disease_model_config')
      .delete()
      .in('parcel_id', otherParcelIds)
      .eq('user_id', user.id);

    // 8. Delete the now-empty old parcels
    const { error: deleteError } = await supabase
      .from('parcels')
      .delete()
      .in('id', otherParcelIds);

    if (deleteError) {
      return apiError('Fout bij opruimen oude percelen', ErrorCodes.INTERNAL_ERROR, 500);
    }

    return apiSuccess({
      mergedParcelId: targetParcel.id,
      mergedName: targetName,
      deletedParcelIds: otherParcelIds,
    });

  } catch (error) {
    return handleUnknownError(error, 'parcels/reorganize');
  }
}

/**
 * GET /api/parcels/reorganize
 *
 * Auto-detect parcels that could be merged based on common name prefixes.
 * Returns suggested merge groups.
 */
export async function GET() {
  try {
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return apiError('Niet ingelogd', ErrorCodes.UNAUTHORIZED, 401);
    }

    // Get all parcels for this user
    const { data: parcels, error } = await supabase
      .from('parcels')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name');

    if (error || !parcels) {
      return apiError('Fout bij ophalen percelen', ErrorCodes.INTERNAL_ERROR, 500);
    }

    // Find parcels with common prefixes (at least 2 parcels sharing a prefix)
    const suggestions: { prefix: string; parcels: { id: string; name: string }[] }[] = [];
    const used = new Set<string>();

    for (let i = 0; i < parcels.length; i++) {
      if (used.has(parcels[i].id)) continue;

      const name = parcels[i].name;
      // Try progressively shorter prefixes
      const words = name.split(' ');

      for (let len = words.length - 1; len >= 1; len--) {
        const prefix = words.slice(0, len).join(' ');
        if (prefix.length < 3) continue;

        const matches = parcels.filter(p =>
          !used.has(p.id) && p.name.startsWith(prefix) && p.name !== prefix
        );

        if (matches.length >= 2) {
          suggestions.push({
            prefix,
            parcels: matches.map(p => ({ id: p.id, name: p.name })),
          });
          matches.forEach(p => used.add(p.id));
          break;
        }
      }
    }

    return apiSuccess({ suggestions });

  } catch (error) {
    return handleUnknownError(error, 'parcels/reorganize');
  }
}
