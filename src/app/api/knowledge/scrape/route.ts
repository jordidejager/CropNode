/**
 * POST/GET /api/knowledge/scrape
 *
 * Triggers the knowledge base scraping pipeline (scrape → transform → embed → store).
 * Secured with CRON_SECRET — only callable by Vercel cron or manual operators.
 *
 * GET = status check (last completed run from knowledge_scrape_log)
 * POST = trigger pipeline. Body (optional): { source?: 'fc', limit?: number }
 *
 * See vercel.json for the cron schedule.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { runScrapePipeline } from '@/lib/knowledge/pipeline';
import { listScrapers } from '@/lib/knowledge/scrapers';

// This route can run for several minutes when scraping. Set max duration as
// high as the deployment plan allows; on Vercel hobby this is 60s, on Pro 300s.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface ScrapeBody {
  source?: string;
  limit?: number;
  fullRescan?: boolean;
}

function verifyAuth(request: Request): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials ontbreken in environment');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * In de winterperiode (november t/m februari) draaien we niet wekelijks
 * maar alleen op de 1e van de maand. Vercel's cron heeft geen seizoens-
 * functionaliteit, dus we filteren hier in code.
 */
function shouldRunNow(): { run: boolean; reason: string } {
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-12
  const day = now.getUTCDate();

  const inSeason = month >= 3 && month <= 10;
  if (inSeason) {
    return { run: true, reason: `seizoen actief (${month})` };
  }
  if (day === 1) {
    return { run: true, reason: `winter, eerste van de maand (${day}-${month})` };
  }
  return { run: false, reason: `winter (${day}-${month}), geen 1e van de maand` };
}

// ============================================
// GET — status check
// ============================================

export async function GET(request: Request) {
  const authError = verifyAuth(request);
  if (authError) return authError;

  try {
    const supabase = getServiceClient();

    // Check if this is the cron-triggered call (Vercel sends auth header but uses GET)
    // Run the pipeline if today is a scrape day
    const cronTrigger = request.headers.get('user-agent')?.includes('vercel-cron');
    if (cronTrigger) {
      const { run, reason } = shouldRunNow();
      if (!run) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason,
        });
      }
      const result = await runScrapePipeline({
        supabase,
        source: 'fc',
      });
      return NextResponse.json({ success: true, result });
    }

    // Manual GET = status only
    const { data: lastRuns, error } = await supabase
      .from('knowledge_scrape_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count: totalArticles } = await supabase
      .from('knowledge_articles')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      availableScrapers: listScrapers(),
      totalArticles: totalArticles ?? 0,
      lastRuns,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scrape route] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================
// POST — trigger pipeline
// ============================================

export async function POST(request: Request) {
  const authError = verifyAuth(request);
  if (authError) return authError;

  try {
    let body: ScrapeBody = {};
    try {
      body = (await request.json()) as ScrapeBody;
    } catch {
      // Empty body is fine
    }

    const source = body.source ?? 'fc';
    if (!listScrapers().includes(source)) {
      return NextResponse.json(
        { error: `Onbekende bron "${source}"`, available: listScrapers() },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    const result = await runScrapePipeline({
      supabase,
      source,
      scrapeOptions: {
        limit: body.limit,
        fullRescan: body.fullRescan,
      },
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scrape route] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
