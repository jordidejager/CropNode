import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getAuthUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (error) console.warn('[field-notes/id] getUser() failed:', error.message, '— trying getSession() fallback');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

const UpdateNoteSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  status: z.enum(['open', 'done', 'transferred']).optional(),
  is_pinned: z.boolean().optional(),
  is_locked: z.boolean().optional(),
  parcel_ids: z.array(z.string()).optional(),
});

/**
 * PATCH /api/field-notes/[id]
 * Update an existing field note (content, status, is_pinned, parcel_id).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const result = UpdateNoteSchema.safeParse(body);

    if (!result.success) {
      const issues = result.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    // Defense in depth: verify ownership (RLS also enforces this)
    const { data: existing } = await supabase
      .from('field_notes')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Notitie niet gevonden' }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from('field_notes')
      .update(result.data)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      console.error('[Field Notes API] PATCH error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Resolve sub_parcels for the updated parcel_ids
    const parcelIds: string[] = updated.parcel_ids ?? [];
    let sub_parcels: { id: string; name: string; crop: string; variety: string }[] = [];
    if (parcelIds.length > 0) {
      const { data: parcels } = await supabase
        .from('sub_parcels')
        .select('id, name, crop, variety')
        .in('id', parcelIds);
      sub_parcels = parcels ?? [];
    }

    return NextResponse.json({ success: true, data: { ...updated, sub_parcels } });
  } catch (error) {
    console.error('[Field Notes API] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/field-notes/[id]
 * Delete a field note (hard delete, RLS enforces ownership).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabase
      .from('field_notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Field Notes API] DELETE error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Field Notes API] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
