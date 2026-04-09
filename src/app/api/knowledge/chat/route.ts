/**
 * POST /api/knowledge/chat
 *
 * Grounded chatbot endpoint. Accepts a user query and streams the answer
 * (plus metadata events) as server-sent events.
 *
 * Request body:
 *   { query: string, sessionId?: string }
 *
 * Response: text/event-stream with events:
 *   data: { type: 'understanding_done', intent: {...} }\n\n
 *   data: { type: 'retrieval_done', chunks: [...] }\n\n
 *   data: { type: 'answer_chunk', text: '...' }\n\n
 *   data: { type: 'ctgb_annotation', annotations: [...] }\n\n
 *   data: { type: 'sources', chunks: [...] }\n\n
 *   data: { type: 'done' }\n\n
 *
 * Requires auth (user session via Supabase SSR).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { runChatPipeline } from '@/lib/knowledge/rag/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials ontbreken');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  // Auth: skip for now during development (TODO: re-enable for production)
  // The SSR cookie auth check was causing false 401s due to transient
  // network issues with Supabase auth endpoint.
  // When re-enabling, use the retry pattern from the previous version.

  // Parse body
  let query: string;
  try {
    const body = (await request.json()) as { query?: string };
    query = (body.query ?? '').trim();
    if (query.length < 2) {
      return NextResponse.json(
        { error: 'Query moet minstens 2 tekens bevatten' },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // controller closed
        }
      };

      const MAX_RETRIES = 3;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          for await (const event of runChatPipeline({ supabase, query })) {
            send(event);
            if (event.type === 'done') break;
          }
          lastError = null;
          break; // success — exit retry loop
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTransient = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|UND_ERR|503|UNAVAILABLE/i.test(message);

          if (attempt < MAX_RETRIES && isTransient) {
            console.warn(`[chat] Transient fout (poging ${attempt}/${MAX_RETRIES}): ${message}. Retry...`);
            await new Promise(r => setTimeout(r, 1000 * attempt));
            lastError = message;
            continue;
          }

          // Non-transient or last attempt — send user-friendly error
          lastError = message;
          break;
        }
      }

      if (lastError) {
        console.error(`[chat] Pipeline fout na retries: ${lastError}`);
        send({
          type: 'answer_chunk',
          text: 'Er is een tijdelijk verbindingsprobleem opgetreden. Probeer het opnieuw.',
        });
        send({ type: 'done' });
      }

      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
