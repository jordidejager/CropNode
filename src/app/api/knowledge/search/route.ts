/**
 * GET /api/knowledge/search?query=...&crops=appel,peer&category=ziekte&month=4
 *
 * Semantic search over knowledge_articles. Foundation for the Fase 2 chatbot.
 * Requires an authenticated Supabase session.
 */

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

import { searchKnowledge } from '@/lib/knowledge/search';
import type {
  Crop,
  KnowledgeCategory,
  SeasonPhase,
} from '@/lib/knowledge/types';
import { CROPS, KNOWLEDGE_CATEGORIES, SEASON_PHASES } from '@/lib/knowledge/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Auth: require logged-in user
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim() ?? '';
    if (query.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: 'query moet minstens 2 tekens bevatten',
        },
        { status: 400 },
      );
    }

    // Parse optional filters
    const cropsParam = searchParams.get('crops');
    const crops = cropsParam
      ? (cropsParam
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter((c): c is Crop => CROPS.includes(c as Crop)) as Crop[])
      : undefined;

    const categoryParam = searchParams.get('category');
    const category =
      categoryParam && KNOWLEDGE_CATEGORIES.includes(categoryParam as KnowledgeCategory)
        ? (categoryParam as KnowledgeCategory)
        : undefined;

    const subcategory = searchParams.get('subcategory') ?? undefined;

    const seasonPhaseParam = searchParams.get('seasonPhase');
    const seasonPhase =
      seasonPhaseParam && SEASON_PHASES.includes(seasonPhaseParam as SeasonPhase)
        ? (seasonPhaseParam as SeasonPhase)
        : undefined;

    const monthParam = searchParams.get('month');
    const currentMonth = monthParam ? Math.max(1, Math.min(12, parseInt(monthParam, 10))) : undefined;

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(20, parseInt(limitParam, 10))) : undefined;

    const thresholdParam = searchParams.get('threshold');
    const similarityThreshold = thresholdParam ? parseFloat(thresholdParam) : undefined;

    const results = await searchKnowledge(
      {
        query,
        crops,
        category,
        subcategory,
        seasonPhase,
        currentMonth,
        limit,
        similarityThreshold,
      },
      supabase,
    );

    return NextResponse.json({
      success: true,
      query,
      total: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[knowledge/search] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
