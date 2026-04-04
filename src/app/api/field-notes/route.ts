import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
  photo_url: z.string().url().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  is_locked: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  reminder_at: z.string().nullable().optional(),
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
      .select('*')
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('content', `%${search}%`);
    if (parcelId) query = query.contains('parcel_ids', [parcelId]);

    const { data: notes, error } = await query;

    if (error) {
      console.error('[Field Notes API] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Resolve parcel names for all notes in one query
    // Resolve parcel display info using v_sprayable_parcels (has correct parcel_name via LEFT JOIN)
    const allParcelIds = [...new Set((notes ?? []).flatMap(n => n.parcel_ids ?? []))];
    let parcelMap: Record<string, { id: string; name: string; parcel_name: string; crop: string; variety: string | null }> = {};
    if (allParcelIds.length > 0) {
      const { data: parcels } = await supabase
        .from('v_sprayable_parcels')
        .select('id, name, parcel_name, crop, variety')
        .eq('user_id', user.id)
        .in('id', allParcelIds);
      parcelMap = Object.fromEntries(
        (parcels ?? []).map((p: any) => [p.id, {
          id: p.id,
          name: p.name || '',
          parcel_name: p.parcel_name || '',
          crop: p.crop || '',
          variety: p.variety || null,
        }])
      );
    }

    // Fetch linked spuitschrift products for transferred notes
    // Also try to auto-link transferred notes that lack spuitschrift_id (created before migration 032)
    const transferredNotes = (notes ?? []).filter(n =>
      n.status === 'transferred' && (n.auto_tag === 'bespuiting' || n.auto_tag === 'bemesting')
    );
    const linkedIds = [...new Set(transferredNotes.filter(n => n.spuitschrift_id).map(n => n.spuitschrift_id))];
    const unlinkedNotes = transferredNotes.filter(n => !n.spuitschrift_id);

    // For unlinked notes, try to find matching spuitschrift by original_raw_input
    let allSpuitschrift: any[] = [];
    if (linkedIds.length > 0 || unlinkedNotes.length > 0) {
      const { data: entries } = await supabase
        .from('spuitschrift')
        .select('id, products, hidden_products, original_raw_input')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(200);
      allSpuitschrift = entries ?? [];
    }

    // Build map: spuitschrift_id → products
    const spuitschriftMap: Record<string, { products: any[]; hidden_products: any[] }> = {};
    for (const e of allSpuitschrift) {
      spuitschriftMap[e.id] = {
        products: (e.products ?? []).map((p: any) => ({ product: p.product, dosage: p.dosage, unit: p.unit })),
        hidden_products: (e.hidden_products ?? []).map((p: any) => ({ product: p.product, dosage: p.dosage, unit: p.unit })),
      };
    }

    // Auto-link unlinked transferred notes by matching content to original_raw_input
    const autoLinked: Record<string, string> = {}; // noteId → spuitschriftId
    for (const note of unlinkedNotes) {
      const content = note.content?.trim().toLowerCase();
      if (!content) continue;
      const match = allSpuitschrift.find((e: any) =>
        e.original_raw_input?.trim().toLowerCase() === content
      );
      if (match) {
        autoLinked[note.id] = match.id;
        // Persist the link so we don't have to do this again
        supabase.from('field_notes').update({ spuitschrift_id: match.id }).eq('id', note.id).then(() => {});
      }
    }

    const data = (notes ?? []).map(note => {
      const sid = note.spuitschrift_id || autoLinked[note.id];
      return {
        ...note,
        spuitschrift_id: sid || note.spuitschrift_id,
        sub_parcels: (note.parcel_ids ?? []).map((id: string) => parcelMap[id]).filter(Boolean),
        ...(sid && spuitschriftMap[sid]
          ? {
              spuitschrift_products: spuitschriftMap[sid].products,
              spuitschrift_hidden_products: spuitschriftMap[sid].hidden_products,
            }
          : {}
        ),
      };
    });

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

    // Build insert payload — photo_url/lat/lng only if provided
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      content: result.data.content,
      source: 'web',
    };
    if (result.data.photo_url) insertPayload.photo_url = result.data.photo_url;
    if (result.data.latitude != null) insertPayload.latitude = result.data.latitude;
    if (result.data.longitude != null) insertPayload.longitude = result.data.longitude;
    if (result.data.is_locked) insertPayload.is_locked = true;
    if (result.data.due_date) insertPayload.due_date = result.data.due_date;
    if (result.data.reminder_at) insertPayload.reminder_at = result.data.reminder_at;

    // Try with all fields first; if it fails (e.g. migration not run), retry with just content
    let note: any;
    const { data: d1, error: err1 } = await supabase
      .from('field_notes')
      .insert(insertPayload)
      .select()
      .single();

    if (err1 && Object.keys(insertPayload).length > 3) {
      // Retry without photo/GPS columns (migration 030 might not be applied yet)
      console.warn('[Field Notes API] insert failed, retrying without photo/GPS:', err1.message);
      const { data: d2, error: err2 } = await supabase
        .from('field_notes')
        .insert({ user_id: user.id, content: result.data.content, source: 'web' })
        .select()
        .single();
      if (err2) {
        console.error('[Field Notes API] POST error:', err2);
        return NextResponse.json({ error: err2.message }, { status: 500 });
      }
      note = d2;
    } else if (err1) {
      console.error('[Field Notes API] POST error:', err1);
      return NextResponse.json({ error: err1.message }, { status: 500 });
    } else {
      note = d1;
    }

    // Return immediately — classification is triggered by the client separately
    const data = { ...note, parcel_ids: note.parcel_ids ?? [], sub_parcels: [] };
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('[Field Notes API] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
