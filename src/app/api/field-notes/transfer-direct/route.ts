/**
 * POST /api/field-notes/transfer-direct
 *
 * 1-click transfer: parses field note content through the spray pipeline,
 * saves directly to spuitschrift + parcel_history, and marks the note as transferred.
 *
 * Request body: { noteId: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeSprayInput } from '@/lib/spray-pipeline';
import { confirmRegistration } from '@/lib/registration-service';
import { addParcelHistoryEntries, getSprayableParcelsById } from '@/lib/supabase-store';
import { getSupabaseAdmin } from '@/lib/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getAuthUser(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (error) console.warn('[transfer-direct] getUser() failed:', error.message);
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
    const { noteId } = body as { noteId: string };

    if (!noteId) {
      return NextResponse.json({ error: 'noteId is vereist' }, { status: 400 });
    }

    // 1. Fetch the note
    const { data: note, error: noteError } = await supabase
      .from('field_notes')
      .select('id, content, user_id, status')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ error: 'Notitie niet gevonden' }, { status: 404 });
    }

    if (note.status === 'transferred') {
      return NextResponse.json({ error: 'Notitie is al verwerkt' }, { status: 400 });
    }

    // 2. Parse through the spray pipeline
    const result = await analyzeSprayInput(note.content.trim(), user.id);

    if (!result.registration) {
      return NextResponse.json(
        { error: 'Kon geen bespuiting herkennen in de notitie. Pas de tekst aan en probeer opnieuw.' },
        { status: 422 }
      );
    }

    // 3. Save each unit to spuitschrift
    const reg = result.registration;
    const allPlots = reg.units.flatMap(u => u.plots);
    const allProducts = reg.units.flatMap(u => u.products);

    const sprayableParcels = await getSprayableParcelsById(allPlots);

    const confirmResult = await confirmRegistration(
      {
        userId: user.id,
        plots: allPlots,
        products: allProducts,
        date: reg.date,
        rawInput: note.content,
        registrationType: reg.registrationType || 'spraying',
        registrationSource: 'web',
      },
      async ({ logbookEntry, isConfirmation, spuitschriftId }) => {
        await addParcelHistoryEntries({
          logbookEntry,
          sprayableParcels,
          isConfirmation,
          spuitschriftId,
          providedUserId: user.id,
        });
      }
    );

    if (!confirmResult.success) {
      return NextResponse.json({ error: confirmResult.message }, { status: 422 });
    }

    // 4. Mark note as transferred + link spuitschrift_id
    const admin = getSupabaseAdmin();
    if (admin) {
      await (admin as any)
        .from('field_notes')
        .update({
          status: 'transferred',
          spuitschrift_id: confirmResult.spuitschriftId || null,
        })
        .eq('id', noteId);
    }

    return NextResponse.json({
      success: true,
      message: 'Bespuiting verwerkt naar spuitschrift.',
      spuitschriftId: confirmResult.spuitschriftId,
    });

  } catch (error) {
    console.error('[transfer-direct] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Onbekende fout' },
      { status: 500 }
    );
  }
}
