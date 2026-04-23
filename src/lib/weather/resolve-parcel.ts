import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve a parcel id that may point to either `parcels` or `sub_parcels`
 * and return the owning-user-verified parent parcel + its location.
 *
 * Why: the Weerstations UI shows sub-parcels grouped by parent but the
 * dropdown value may be a sub-parcel's own id when the sub has a null
 * parent. Physical weather stations always store the PARENT parcel id,
 * so we normalize here.
 *
 * Returns null if the id doesn't resolve to anything the given user owns.
 */
export async function resolveParcelForUser(
  supabase: SupabaseClient,
  userId: string,
  parcelOrSubParcelId: string
): Promise<{ parcelId: string; latitude: number | null; longitude: number | null } | null> {
  // 1. Try as a parent parcel id first (happy path)
  const { data: parcel } = await supabase
    .from('parcels')
    .select('id, location, user_id')
    .eq('id', parcelOrSubParcelId)
    .eq('user_id', userId)
    .maybeSingle();

  if (parcel) {
    const loc = parcel.location as { lat?: number; lng?: number } | null;
    return {
      parcelId: parcel.id,
      latitude: loc?.lat ?? null,
      longitude: loc?.lng ?? null,
    };
  }

  // 2. Fallback: maybe it's a sub_parcel — walk up to its parent
  const { data: sub } = await supabase
    .from('sub_parcels')
    .select('id, parcel_id, user_id')
    .eq('id', parcelOrSubParcelId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub || !sub.parcel_id) return null;

  const { data: parent } = await supabase
    .from('parcels')
    .select('id, location')
    .eq('id', sub.parcel_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!parent) return null;

  const loc = parent.location as { lat?: number; lng?: number } | null;
  return {
    parcelId: parent.id,
    latitude: loc?.lat ?? null,
    longitude: loc?.lng ?? null,
  };
}
