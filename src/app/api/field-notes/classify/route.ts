/**
 * POST /api/field-notes/classify
 *
 * Called by the browser client after a note is saved (non-blocking).
 * Uses session auth so the browser can call it directly.
 *
 * Body: { noteId: string, content: string }
 *
 * 1. Fetches sub-parcels + parent parcel names + parcel groups (V3-style data)
 * 2. Runs AI classification (tag + parcel_ids + observation)
 * 3. Updates the field_note record
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyFieldNote } from '@/ai/flows/classify-field-note';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getAuthUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (error) console.warn('[classify] getUser() failed:', error.message);
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
    const { noteId, content, photoUrl } = body as { noteId: string; content: string; photoUrl?: string };

    if (!noteId || !content) {
      return NextResponse.json({ error: 'Missing noteId or content' }, { status: 400 });
    }

    // Use v_sprayable_parcels view — same as V3 Slimme Invoer.
    // This view uses LEFT JOIN (handles parcel_id FK mismatches correctly)
    // and exposes parcel_name (parent parcel name like "Yese", "Jachthoek").
    const [parcelViewResult, groupsResult] = await Promise.all([
      supabase
        .from('v_sprayable_parcels')
        .select('id, name, crop, variety, synonyms, parcel_name')
        .limit(100),
      supabase
        .from('parcel_groups')
        .select('id, name, parcel_group_members(sub_parcel_id)')
        .eq('user_id', user.id),
    ]);

    // Build ParcelForClassification array
    // name = generated display name: "Yese Red Prince (Jonagold)"
    // parcel_name = parent location: "Yese"
    const parcels = (parcelViewResult.data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name || '',
      parcel_name: p.parcel_name || '',
      crop: p.crop || '',
      variety: p.variety || null,
      synonyms: p.synonyms || [],
    }));

    // Build ParcelGroupForClassification array
    const groups = (groupsResult.data ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      sub_parcel_ids: (g.parcel_group_members ?? []).map((m: any) => m.sub_parcel_id),
    }));

    // Run AI classification (never throws). Pass photo for Gemini Vision if available.
    const result = await classifyFieldNote(content, parcels, groups, photoUrl);

    // Build DB update payload
    const update: Record<string, unknown> = {};
    if (result.tag !== null) update.auto_tag = result.tag;
    if (result.parcel_ids.length > 0) update.parcel_ids = result.parcel_ids;
    if (result.observation_subject) update.observation_subject = result.observation_subject;
    if (result.observation_category) update.observation_category = result.observation_category;

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('field_notes')
        .update(update)
        .eq('id', noteId)
        .eq('user_id', user.id);

      if (error) {
        console.error('[classify] Failed to update note:', error);
      }
    }

    return NextResponse.json({
      success: true,
      tag: result.tag,
      parcel_ids: result.parcel_ids,
      observation_subject: result.observation_subject,
      observation_category: result.observation_category,
    });
  } catch (error) {
    console.error('[classify] Error:', error);
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 });
  }
}
