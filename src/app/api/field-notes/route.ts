import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { classifyFieldNote } from '@/ai/flows/classify-field-note';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getAuthUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (error) console.warn('[field-notes] getUser() failed:', error.message, '— trying getSession() fallback');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

const CreateNoteSchema = z.object({
  content: z.string().min(1, 'Notitie mag niet leeg zijn').max(2000, 'Notitie mag maximaal 2000 tekens bevatten'),
});

/**
 * GET /api/field-notes
 * Fetch all field notes for the authenticated user.
 * Joins sub_parcels to return parcel name alongside parcel_id.
 * Optional query params: status, search, parcel_id
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const parcelId = searchParams.get('parcel_id');

    let query = supabase
      .from('field_notes')
      .select(`
        *,
        sub_parcel:sub_parcels(id, name, crop, variety)
      `)
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('content', `%${search}%`);
    }

    if (parcelId) {
      query = query.eq('parcel_id', parcelId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Field Notes API] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Field Notes API] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/field-notes
 * Create a new field note, then fire-and-forget AI classification.
 * Body: { content: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = CreateNoteSchema.safeParse(body);

    if (!result.success) {
      const issues = result.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('field_notes')
      .insert({
        user_id: user.id,
        content: result.data.content,
        source: 'web',
      })
      .select()
      .single();

    if (error) {
      console.error('[Field Notes API] POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fire-and-forget: classify in background after response is sent
    const noteId = data.id;
    const noteContent = data.content;
    const userId = user.id;
    after(async () => {
      try {
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: parcels } = await admin
          .from('sub_parcels')
          .select('id, name, crop, variety')
          .eq('user_id', userId)
          .limit(50);

        const result = await classifyFieldNote(noteContent, parcels ?? []);

        const update: Record<string, unknown> = {};
        if (result.tag !== null) update.auto_tag = result.tag;
        if (result.parcel_id !== null) update.parcel_id = result.parcel_id;

        if (Object.keys(update).length > 0) {
          const { error: updateError } = await admin
            .from('field_notes')
            .update(update)
            .eq('id', noteId)
            .eq('user_id', userId);
          if (updateError) console.error('[Field Notes] Background classification update failed:', updateError);
        }
      } catch (err) {
        console.error('[Field Notes] Background classification failed:', err);
      }
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('[Field Notes API] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
