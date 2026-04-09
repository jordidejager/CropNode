/**
 * GET /api/knowledge/phenology
 *
 * Returns the current phenological phase + bloom reference date for the
 * current year. Used by the Knowledge Atlas UI.
 *
 * POST /api/knowledge/phenology (requires CRON_SECRET)
 *
 * Runs the auto-detect logic against recent articles and updates the
 * phenology_reference table. Intended to be called:
 *   - By the weekly scrape cron after each run
 *   - Manually by admin
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  getCurrentPhenology,
  autoDetectBloomDate,
  upsertAutoDetectedBloomDate,
} from '@/lib/knowledge/phenology-service';

export const dynamic = 'force-dynamic';

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

// ============================================
// GET — read current phenology
// ============================================

export async function GET() {
  try {
    const supabase = getServiceClient();
    const phenology = await getCurrentPhenology(supabase);

    return NextResponse.json({
      success: true,
      ...phenology,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[phenology] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================
// POST — auto-detect and update
// ============================================

export async function POST(request: Request) {
  try {
    // Auth: same pattern as scrape route
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const year = new Date().getUTCFullYear();

    const detection = await autoDetectBloomDate(supabase, year);
    if (!detection) {
      return NextResponse.json({
        success: true,
        updated: false,
        reason: 'Onvoldoende recente artikelen voor auto-detect',
      });
    }

    const upsertResult = await upsertAutoDetectedBloomDate(
      supabase,
      year,
      detection.detected,
      detection.confidence,
      detection.evidence,
    );

    return NextResponse.json({
      success: true,
      updated: upsertResult.updated,
      detected: detection.detected,
      confidence: detection.confidence,
      evidence: detection.evidence,
      reason: upsertResult.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[phenology] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
