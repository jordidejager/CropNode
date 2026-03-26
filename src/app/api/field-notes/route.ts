import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const CreateNoteSchema = z.object({
  content: z.string().min(1, 'Notitie mag niet leeg zijn').max(2000, 'Notitie mag maximaal 2000 tekens bevatten'),
});

/**
 * GET /api/field-notes
 * Fetch all field notes for the authenticated user.
 * Optional query params: status, search
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let query = supabase
      .from('field_notes')
      .select('*')
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('content', `%${search}%`);
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
 * Create a new field note.
 * Body: { content: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
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
      })
      .select()
      .single();

    if (error) {
      console.error('[Field Notes API] POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('[Field Notes API] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
