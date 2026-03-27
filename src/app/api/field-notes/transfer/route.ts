/**
 * POST /api/field-notes/transfer
 *
 * Runs the shared analyzeSprayInput() pipeline on a field note's content
 * and returns the parsed SprayRegistrationGroup for display in the transfer modal.
 *
 * The actual saving is done via server actions (confirmAllUnits / confirmSingleUnit)
 * after the user confirms in the modal.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeSprayInput } from '@/lib/spray-pipeline';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getAuthUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (error) console.warn('[field-notes/transfer] getUser() failed:', error.message, '— trying getSession() fallback');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content } = body as { content: string };

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Notitietekst is vereist' }, { status: 400 });
    }

    // Call the EXACT same pipeline as Slimme Invoer and WhatsApp bot
    // No userContext = pipeline fetches parcels/products from DB itself
    const result = await analyzeSprayInput(content.trim(), user.id);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[field-notes/transfer] Pipeline error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Pipeline fout' },
      { status: 500 }
    );
  }
}
