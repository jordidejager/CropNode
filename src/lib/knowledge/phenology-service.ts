/**
 * Phenology service — reads bloom dates from Supabase instead of hardcoded constants.
 *
 * Replaces the static BLOOM_DATES constant in phenology.ts for runtime lookups.
 * The `phenology.ts` helper is still used inside the scraper/transform pipeline
 * because it runs in a Node-script context where DB access is expensive and the
 * relevant months are computed in bulk at ingest time.
 *
 * This service is used by:
 *   - /api/knowledge/phenology route (UI reads current phase)
 *   - Auto-detect updater (observes recent articles to refine the bloom date estimate)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { computePhenology, BLOOM_DATES as FALLBACK_BLOOM_DATES } from './phenology';
import type { PhenologyResult } from './phenology';

export interface PhenologyReference {
  referenceCrop: string;
  year: number;
  bloomDateF2: string;
  source: 'manual' | 'auto_detected' | 'imported';
  confidence: 'hoog' | 'gemiddeld' | 'laag';
  notes: string | null;
}

/**
 * Get the bloom date for a given year from the database, with fallback
 * to the hardcoded constants if the DB query fails or returns nothing.
 */
export async function getBloomDate(
  supabase: SupabaseClient,
  year: number,
  referenceCrop = 'conference_peer',
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('phenology_reference')
      .select('bloom_date_f2')
      .eq('reference_crop', referenceCrop)
      .eq('year', year)
      .maybeSingle();
    if (error || !data) {
      return FALLBACK_BLOOM_DATES[year] ?? null;
    }
    return data.bloom_date_f2 as string;
  } catch {
    return FALLBACK_BLOOM_DATES[year] ?? null;
  }
}

/**
 * Compute "today's" phenological phase by looking up the current-year bloom date
 * from the DB. This is the authoritative source for the UI.
 */
export async function getCurrentPhenology(
  supabase: SupabaseClient,
  referenceCrop = 'conference_peer',
): Promise<PhenologyResult & { today: string; month: number; weekOfYear: number; bloomDate: string | null; source: string }> {
  const today = new Date();
  const year = today.getUTCFullYear();
  const iso = today.toISOString().slice(0, 10);

  // Get bloom date from DB
  const bloomDate = await getBloomDate(supabase, year, referenceCrop);

  // Temporarily override BLOOM_DATES for the compute call
  const originalYearDate = FALLBACK_BLOOM_DATES[year];
  if (bloomDate) {
    FALLBACK_BLOOM_DATES[year] = bloomDate;
  }

  const result = computePhenology(iso);

  // Restore
  if (originalYearDate !== undefined) {
    FALLBACK_BLOOM_DATES[year] = originalYearDate;
  } else if (bloomDate) {
    delete FALLBACK_BLOOM_DATES[year];
  }

  return {
    ...result,
    today: iso,
    month: today.getUTCMonth() + 1,
    weekOfYear: getWeekOfYear(today),
    bloomDate,
    source: 'db',
  };
}

function getWeekOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = (date.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getUTCDay() + 1) / 7);
}

// ============================================
// Auto-detect: analyze recent scraped articles
// ============================================

/**
 * Look at the most-recent scraped articles for the current year, count
 * which fenological phase they mention most, and estimate the bloom date
 * accordingly.
 *
 * Heuristic: if articles published in the last 14 days predominantly mention
 * a phase that corresponds to a specific "days relative to bloom" window,
 * we can back-compute what the bloom date should be.
 *
 * Returns an updated bloom date estimate, or null if the signal isn't clear.
 */
export async function autoDetectBloomDate(
  supabase: SupabaseClient,
  year: number,
): Promise<{ detected: string; confidence: 'hoog' | 'gemiddeld' | 'laag'; evidence: string } | null> {
  // Fetch knowledge_articles from the last 14 days (by updated_at) that have phase data
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error } = await supabase
    .from('knowledge_articles')
    .select('title, season_phases, relevant_months, updated_at')
    .gte('updated_at', twoWeeksAgo)
    .not('season_phases', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error || !recent || recent.length < 5) {
    return null; // not enough data
  }

  // Count phases mentioned in recent articles
  const phaseCounts: Record<string, number> = {};
  for (const article of recent) {
    for (const phase of (article.season_phases as string[] | null) ?? []) {
      phaseCounts[phase] = (phaseCounts[phase] ?? 0) + 1;
    }
  }

  // Find the dominant phase
  const sorted = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  const [dominantPhase, dominantCount] = sorted[0];
  const totalSignals = Object.values(phaseCounts).reduce((s, c) => s + c, 0);
  const dominantShare = dominantCount / totalSignals;

  // Map the dominant phase to an expected "days relative to bloom" midpoint
  const phaseCenterDays: Record<string, number> = {
    winterrust: -90,
    rust: -90,
    knopzwelling: -45,
    knopstadium: -25,
    'groen-puntje': -22,
    muizenoor: -10,
    'volle-bloei': 0,
    bloei: 0,
    bloembladval: 10,
    vruchtzetting: 25,
    junirui: 50,
    celstrekking: 100,
    groei: 60,
    oogst: 150,
    'oogst/plukperiode': 150,
    bladval: 200,
    nabloei: 120,
  };

  const centerDays = phaseCenterDays[dominantPhase];
  if (centerDays === undefined) return null;

  // Compute estimated bloom date = today - centerDays
  const today = new Date();
  const bloomEstimate = new Date(today.getTime() - centerDays * 24 * 60 * 60 * 1000);
  const bloomYear = bloomEstimate.getUTCFullYear();

  // Only accept if the estimate falls in the given year
  if (bloomYear !== year) return null;

  // Confidence based on dominant share
  const confidence = dominantShare > 0.5 ? 'hoog' : dominantShare > 0.3 ? 'gemiddeld' : 'laag';

  return {
    detected: bloomEstimate.toISOString().slice(0, 10),
    confidence,
    evidence: `${dominantCount}/${totalSignals} recente artikelen (${(dominantShare * 100).toFixed(0)}%) wijzen op fase "${dominantPhase}"`,
  };
}

/**
 * Upsert an auto-detected bloom date into phenology_reference.
 * Only overwrites if the existing entry is weaker confidence or from auto_detected.
 */
export async function upsertAutoDetectedBloomDate(
  supabase: SupabaseClient,
  year: number,
  bloomDate: string,
  confidence: 'hoog' | 'gemiddeld' | 'laag',
  evidence: string,
  referenceCrop = 'conference_peer',
): Promise<{ updated: boolean; reason: string }> {
  // Check existing entry
  const { data: existing } = await supabase
    .from('phenology_reference')
    .select('source, confidence, bloom_date_f2')
    .eq('reference_crop', referenceCrop)
    .eq('year', year)
    .maybeSingle();

  // Don't overwrite manual/imported entries with lower confidence
  if (existing) {
    const existingSource = existing.source as string;
    if (existingSource === 'imported' || existingSource === 'manual') {
      const existingConf = existing.confidence as string;
      if (existingConf === 'hoog' && confidence !== 'hoog') {
        return { updated: false, reason: 'bestaande manual/imported entry heeft hogere confidence' };
      }
    }
  }

  const { error } = await supabase
    .from('phenology_reference')
    .upsert({
      reference_crop: referenceCrop,
      year,
      bloom_date_f2: bloomDate,
      source: 'auto_detected',
      confidence,
      notes: evidence,
    }, {
      onConflict: 'reference_crop,year',
    });

  if (error) {
    return { updated: false, reason: error.message };
  }

  return { updated: true, reason: evidence };
}
