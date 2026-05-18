/**
 * GET /api/knowledge/suggestions
 *
 * Returns dynamic chat suggestions for the current phenological phase.
 *
 * Strategy (in order of preference):
 *   1. Positive-feedback queries from knowledge_feedback in the last 60 days
 *      that match the current phase/month (≥1 thumbs up)
 *   2. Fall back to a hardcoded list per phase
 *
 * The endpoint is unauthenticated — suggestions are public-safe.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5-minute cache

const FALLBACK_SUGGESTIONS: Record<string, string[]> = {
  rust: [
    'Hoe moet ik snoeien bij Elstar?',
    'Wanneer koperbespuiting uitvoeren?',
    'Welke winterbehandeling tegen bloedluis?',
  ],
  knopstadium: [
    'Wanneer start ik met schurftbestrijding?',
    'Welke middelen bij groen-puntje?',
    'Hoe herken ik appelbloesemkever?',
  ],
  bloei: [
    'Wat nu te doen tegen schurft?',
    'Wanneer GA4/7 op Conference spuiten?',
    'Hoe herken ik bacterievuur?',
    'Welke middelen tegen perenbladvlo?',
  ],
  vruchtzetting: [
    'Wanneer chemisch dunnen bij Elstar?',
    'Welke dosering Brevis voor dunning?',
    'Hoe voorkom ik junival bij Conference?',
  ],
  groei: [
    'Welke middelen tegen fruitmot?',
    'Hoe herken ik spintmijt?',
    'Wanneer calcium spuiten op appel?',
  ],
  oogst: [
    'Wanneer SmartFresh toepassen?',
    'Welke bewaarfungiciden gebruiken?',
    'Hoe voorkom ik vruchtrot bij Conference?',
  ],
  nabloei: [
    'Wanneer ureum op gevallen blad?',
    'Welke najaarsbehandeling tegen kanker?',
    'Hoe verlaag ik de schurftdruk?',
  ],
};

const DEFAULT_SUGGESTIONS = [
  'Wat doe ik nu tegen schurft bij Jonagold?',
  'Welke middelen tegen perenbladvlo?',
  'Wanneer GA4/7 op Conference spuiten?',
  'Alternatieven voor Captan tijdens bloei?',
];

const MAX_SUGGESTIONS = 6;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const phase = url.searchParams.get('phase')?.toLowerCase() ?? 'bloei';
  const fallback = FALLBACK_SUGGESTIONS[phase] ?? DEFAULT_SUGGESTIONS;

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    return NextResponse.json({ suggestions: fallback, source: 'fallback' });
  }

  const supabase = createClient(supaUrl, supaKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Get queries that received positive feedback in the last 60 days
    const sinceIso = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('knowledge_feedback')
      .select('query')
      .eq('feedback', 'positive')
      .gte('created_at', sinceIso)
      .limit(100);

    if (error || !data || data.length === 0) {
      return NextResponse.json({ suggestions: fallback, source: 'fallback' });
    }

    // Dedup + prioritize queries that look phase-relevant
    const freq = new Map<string, number>();
    for (const row of data) {
      const q = (row.query ?? '').trim();
      if (q.length < 6 || q.length > 120) continue;
      const canonical = q.toLowerCase();
      freq.set(canonical, (freq.get(canonical) ?? 0) + 1);
    }

    const topPositive = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([q]) => q)
      // Restore Title case by finding the original
      .map((canonical) => {
        const match = data.find((d) => (d.query ?? '').toLowerCase() === canonical);
        return match?.query ?? canonical;
      });

    const phaseKeywords = getPhaseKeywords(phase);
    const phaseRelevant = topPositive.filter((q) =>
      phaseKeywords.some((kw) => q.toLowerCase().includes(kw)),
    );

    const combined = [
      ...phaseRelevant.slice(0, 4),
      // Top up with evergreen fallback if we don't have enough
      ...fallback.filter((f) => !phaseRelevant.includes(f)),
    ].slice(0, MAX_SUGGESTIONS);

    return NextResponse.json({
      suggestions: combined,
      source: phaseRelevant.length > 0 ? 'feedback' : 'fallback',
    });
  } catch (err) {
    console.warn('[suggestions] DB error, fallback to static:', err);
    return NextResponse.json({ suggestions: fallback, source: 'fallback' });
  }
}

function getPhaseKeywords(phase: string): string[] {
  const map: Record<string, string[]> = {
    rust: ['snoei', 'koper', 'winter', 'bloedluis', 'kanker'],
    knopstadium: ['schurft', 'groen-puntje', 'groen puntje', 'bloesemkever'],
    bloei: ['schurft', 'bloei', 'bacterievuur', 'perenbladvlo', 'ga4', 'ga 4'],
    vruchtzetting: ['dunnen', 'brevis', 'junival', 'naa', 'ba'],
    groei: ['fruitmot', 'spint', 'calcium', 'luis', 'fusicladium'],
    oogst: ['smartfresh', 'bewaar', 'vruchtrot', 'pluk', 'harvista'],
    nabloei: ['ureum', 'najaar', 'kanker', 'val', 'schurftdruk'],
  };
  return map[phase] ?? [];
}
