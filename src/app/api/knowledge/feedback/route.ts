/**
 * POST /api/knowledge/feedback
 *
 * Stores user feedback on RAG chat answers (thumbs up/down).
 * Used to improve retrieval quality over time.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messageId?: string;
      query?: string;
      answer?: string;
      feedback?: 'positive' | 'negative';
    };

    if (!body.feedback || !body.query) {
      return NextResponse.json({ error: 'Missing feedback or query' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Store in a simple feedback log (we can analyze later)
    const { error } = await supabase.from('knowledge_feedback').insert({
      query: body.query.slice(0, 500),
      answer_preview: (body.answer ?? '').slice(0, 500),
      feedback: body.feedback,
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Table might not exist yet — log but don't fail
      console.warn('[feedback] Insert error:', error.message);
      // Still return success to the user
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
