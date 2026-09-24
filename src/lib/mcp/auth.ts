import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-client';

export function hashKoppelsleutel(sleutel: string): string {
  return createHash('sha256').update(sleutel).digest('hex');
}

/** Returns the owning user for a plain koppelsleutel, or null when unknown/revoked. */
export async function resolveUserIdForKey(sleutel: string): Promise<string | null> {
  const hash = hashKoppelsleutel(sleutel);
  const admin = getSupabaseAdmin() as any;
  const { data, error } = await admin
    .from('claude_koppelsleutels')
    .select('user_id')
    .eq('sleutel_hash', hash)
    .is('ingetrokken_op', null)
    .maybeSingle();
  if (error) {
    console.error('[mcp] Sleutelcontrole mislukt:', error.message);
    return null;
  }
  if (!data?.user_id) return null;
  admin
    .from('claude_koppelsleutels')
    .update({ laatst_gebruikt_op: new Date().toISOString() })
    .eq('sleutel_hash', hash)
    .then(() => {}, () => {});
  return data.user_id as string;
}
