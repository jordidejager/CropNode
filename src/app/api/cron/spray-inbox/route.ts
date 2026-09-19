import { NextResponse } from 'next/server';
import { getStuckSprayDrafts } from '@/lib/whatsapp/store';
import { processSprayDraft } from '@/lib/whatsapp/spray-inbox';

export const maxDuration = 60;

const STUCK_AFTER_MS = 3 * 60 * 1000;

/**
 * GET /api/cron/spray-inbox
 * Safety net: re-process spray-inbox drafts whose background after() job never finished.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stuck = await getStuckSprayDrafts(STUCK_AFTER_MS, 10);
    const processed: string[] = [];
    for (const draft of stuck) {
      await processSprayDraft(draft.id);
      processed.push(draft.id);
    }
    return NextResponse.json({ success: true, processed, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[Cron] spray-inbox error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
