/**
 * POST /api/field-notes/classify
 *
 * Internal server-to-server endpoint. Not called by the browser directly.
 * Called via fire-and-forget after a note is created (using Next.js after()).
 *
 * 1. Fetches parcels for the user
 * 2. Runs AI classification (tag + parcel_id)
 * 3. Updates the field_note record
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { classifyFieldNote } from '@/ai/flows/classify-field-note';

// Use service role to bypass RLS since this runs outside user auth context
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { noteId, content, userId } = body as { noteId: string; content: string; userId: string };

    if (!noteId || !content || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // Fetch parcels for this user (sub_parcels = work units telers recognise)
    const { data: parcels } = await supabase
      .from('sub_parcels')
      .select('id, name, crop, variety')
      .eq('user_id', userId)
      .limit(50);

    // Run classification (never throws)
    const result = await classifyFieldNote(content, parcels ?? []);

    // Build update payload — only include non-null values
    const update: Record<string, unknown> = {};
    if (result.tag !== null) update.auto_tag = result.tag;
    if (result.parcel_id !== null) update.parcel_id = result.parcel_id;

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('field_notes')
        .update(update)
        .eq('id', noteId)
        .eq('user_id', userId); // extra ownership check

      if (error) {
        console.error('[classify] Failed to update note:', error);
      }
    }

    return NextResponse.json({ success: true, tag: result.tag, parcel_id: result.parcel_id });
  } catch (error) {
    console.error('[classify] Error:', error);
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 });
  }
}
