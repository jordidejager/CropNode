'use server';

import { randomBytes } from 'crypto';
import { headers } from 'next/headers';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import { hashKoppelsleutel } from '@/lib/mcp/auth';

export interface Koppelsleutel {
  id: string;
  omschrijving: string;
  createdAt: string;
  laatstGebruiktOp: string | null;
  ingetrokkenOp: string | null;
}

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) return user.id;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  throw new Error('Niet ingelogd.');
}

async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function getKoppelsleutels(): Promise<Koppelsleutel[]> {
  const userId = await requireUserId();
  const { data, error } = await (getSupabaseAdmin() as any)
    .from('claude_koppelsleutels')
    .select('id, omschrijving, created_at, laatst_gebruikt_op, ingetrokken_op')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: r.id,
    omschrijving: r.omschrijving,
    createdAt: r.created_at,
    laatstGebruiktOp: r.laatst_gebruikt_op,
    ingetrokkenOp: r.ingetrokken_op,
  }));
}

/** Creates a key; the plain key (and its URL) is returned exactly once. */
export async function maakKoppelsleutel(omschrijving: string): Promise<{ sleutel: string; url: string }> {
  const userId = await requireUserId();
  const sleutel = randomBytes(24).toString('hex');
  const { error } = await (getSupabaseAdmin() as any)
    .from('claude_koppelsleutels')
    .insert({ user_id: userId, omschrijving: omschrijving.trim() || 'Claude', sleutel_hash: hashKoppelsleutel(sleutel) });
  if (error) throw new Error(error.message);
  return { sleutel, url: `${await appOrigin()}/api/mcp/${sleutel}` };
}

export async function trekKoppelsleutelIn(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await (getSupabaseAdmin() as any)
    .from('claude_koppelsleutels')
    .update({ ingetrokken_op: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
