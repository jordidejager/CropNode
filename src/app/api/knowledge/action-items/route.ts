/**
 * GET /api/knowledge/action-items
 *
 * Aggregeert actiepunten voor de teler uit drie bronnen:
 *   1. `knowledge_disease_profile` — peak_months/peak_phases + curative/prevention
 *   2. `knowledge_product_advice` — per gewas × ziekte × middel met timing
 *   3. `knowledge_articles` — recente artikelen met relevant_months/season_phases
 *
 * Groepeert in drie urgency buckets:
 *   - NU URGENT — huidige maand is een PEAK month, of valid_until <14 dagen
 *   - DEZE WEEK — huidige fase/maand maar geen piek
 *   - VOORBEREIDEN — komende maand of komende fase
 *
 * Query params:
 *   crop=appel|peer        (optioneel — filter op gewas)
 *   parcelId=uuid          (optioneel — voor toekomstige perceel-context)
 */

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getCurrentPhenology } from '@/lib/knowledge/phenology-service';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10-minute server cache

type Urgency = 'nu' | 'deze_week' | 'voorbereiden';

export interface ActionItem {
  id: string;
  type: 'ziekte' | 'plaag' | 'product_advies' | 'artikel';
  urgency: Urgency;
  title: string;
  subtitle: string;
  detail: string;
  crops: string[];
  phases: string[];
  months: number[];
  category: string;
  /** Optioneel: artikel-id om naar te navigeren */
  article_id?: string | null;
  /** Optioneel: doseringsinformatie als beschikbaar */
  dosage?: string | null;
  /** Hoe deze actie het beste door de chatbot bevraagd wordt */
  ask_chatbot?: string | null;
  /** Sortering hint (lager = boven) */
  sort_score: number;
}

interface DiseaseProfileRow {
  id: string;
  name: string;
  profile_type: 'ziekte' | 'plaag' | 'abiotisch';
  crops: string[];
  peak_months: number[];
  peak_phases: string[];
  relevant_months?: number[];
  prevention_strategy: string | null;
  curative_strategy: string | null;
  monitoring_advice: string | null;
  key_preventive_products: string[];
  key_curative_products: string[];
  source_article_count: number;
}

interface ProductAdviceRow {
  id: string;
  product_name: string;
  target: string;
  crop: string;
  dosage: string | null;
  application_type: string | null;
  timing: string | null;
  curative_window_hours: number | null;
  relevant_months: number[] | null;
  phenological_phases: string[] | null;
  source_article_count: number;
}

interface ArticleRow {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  subcategory: string | null;
  crops: string[];
  season_phases: string[];
  relevant_months: number[];
  products_mentioned: string[];
  valid_until: string | null;
  harvest_year: number | null;
  fusion_sources: number;
}

const PHASE_ORDER = [
  'rust',
  'knopstadium',
  'bloei',
  'vruchtzetting',
  'groei',
  'oogst',
  'nabloei',
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cropFilter = url.searchParams.get('crop'); // null | 'appel' | 'peer'

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }
  const supabase = createClient(supaUrl, supaKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fallback phenology — used when the service fails so the page still
  // renders the empty state instead of throwing a 5xx that triggers
  // the global error boundary.
  const now = new Date();
  let phenology = {
    month: now.getUTCMonth() + 1,
    seasonPhase: null as string | null,
    phenologicalPhase: 'onbekend',
  } as { month: number; seasonPhase: string | null; phenologicalPhase: string };

  try {
    const live = await getCurrentPhenology(supabase);
    phenology = {
      month: live.month,
      seasonPhase: live.seasonPhase,
      phenologicalPhase: live.phenologicalPhase,
    };
  } catch (err) {
    console.warn('[action-items] phenology fetch failed — using calendar fallback:', err);
  }

  const currentMonth = phenology.month;
  const currentPhase = phenology.seasonPhase ?? 'bloei';
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const phaseIdx = PHASE_ORDER.indexOf(currentPhase);
  const nextPhase = phaseIdx >= 0 && phaseIdx < PHASE_ORDER.length - 1
    ? PHASE_ORDER[phaseIdx + 1]
    : currentPhase;

  // Fetch in parallel — each fetcher catches its own errors and returns []
  // so a missing table never propagates to a 5xx response.
  const [profilesResult, adviceResult, articlesResult] = await Promise.all([
    fetchDiseaseProfiles(supabase, cropFilter).catch((err) => {
      console.warn('[action-items] profiles top-level error:', err);
      return [] as DiseaseProfileRow[];
    }),
    fetchProductAdvice(supabase, cropFilter, currentMonth, nextMonth, currentPhase, nextPhase).catch((err) => {
      console.warn('[action-items] advice top-level error:', err);
      return [] as ProductAdviceRow[];
    }),
    fetchArticles(supabase, cropFilter, currentMonth, nextMonth, currentPhase, nextPhase).catch((err) => {
      console.warn('[action-items] articles top-level error:', err);
      return [] as ArticleRow[];
    }),
  ]);

  const items: ActionItem[] = [
    ...profilesResult.map((p) =>
      profileToActionItem(p, currentMonth, currentPhase, nextMonth, nextPhase),
    ),
    ...adviceResult.map((a) =>
      adviceToActionItem(a, currentMonth, currentPhase, nextMonth, nextPhase),
    ),
    ...articlesResult.map((a) =>
      articleToActionItem(a, currentMonth, currentPhase, nextMonth, nextPhase),
    ),
  ];

  // Dedupe by title+subtitle (different sources can produce similar items)
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const key = `${it.type}::${it.title.toLowerCase()}::${(it.subtitle || '').slice(0, 80).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: lowest score first within each bucket
  deduped.sort((a, b) => a.sort_score - b.sort_score);

  const buckets = {
    nu: deduped.filter((i) => i.urgency === 'nu'),
    deze_week: deduped.filter((i) => i.urgency === 'deze_week'),
    voorbereiden: deduped.filter((i) => i.urgency === 'voorbereiden'),
  };

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    phenology: {
      month: currentMonth,
      phase: currentPhase,
      phase_detail: phenology.phenologicalPhase,
      next_month: nextMonth,
      next_phase: nextPhase,
    },
    crop: cropFilter,
    totals: {
      nu: buckets.nu.length,
      deze_week: buckets.deze_week.length,
      voorbereiden: buckets.voorbereiden.length,
      total: deduped.length,
    },
    items: buckets,
  });
}

// ============================================
// Fetchers
// ============================================

async function fetchDiseaseProfiles(
  supabase: SupabaseClient,
  cropFilter: string | null,
): Promise<DiseaseProfileRow[]> {
  let q = supabase
    .from('knowledge_disease_profile')
    .select(
      'id, name, profile_type, crops, peak_months, peak_phases, prevention_strategy, curative_strategy, monitoring_advice, key_preventive_products, key_curative_products, source_article_count',
    )
    .order('source_article_count', { ascending: false });
  if (cropFilter) q = q.contains('crops', [cropFilter]);
  const { data, error } = await q;
  if (error) {
    console.warn('[action-items] disease profile fetch error:', error.message);
    return [];
  }
  return (data ?? []) as DiseaseProfileRow[];
}

async function fetchProductAdvice(
  supabase: SupabaseClient,
  cropFilter: string | null,
  currentMonth: number,
  nextMonth: number,
  currentPhase: string,
  nextPhase: string,
): Promise<ProductAdviceRow[]> {
  // Pull a broad set, filter in TS — the OR composition for arrays is messy
  // in PostgREST and we want the same logic across articles + advice.
  let q = supabase
    .from('knowledge_product_advice')
    .select(
      'id, product_name, target, crop, dosage, application_type, timing, curative_window_hours, relevant_months, phenological_phases, source_article_count',
    )
    .order('source_article_count', { ascending: false })
    .limit(200);
  if (cropFilter) q = q.eq('crop', cropFilter);
  const { data, error } = await q;
  if (error) {
    console.warn('[action-items] product advice fetch error:', error.message);
    return [];
  }
  return ((data ?? []) as ProductAdviceRow[]).filter((row) =>
    isMonthOrPhaseRelevant(
      row.relevant_months,
      row.phenological_phases,
      currentMonth,
      nextMonth,
      currentPhase,
      nextPhase,
    ),
  );
}

async function fetchArticles(
  supabase: SupabaseClient,
  cropFilter: string | null,
  currentMonth: number,
  nextMonth: number,
  currentPhase: string,
  nextPhase: string,
): Promise<ArticleRow[]> {
  // Two parallel calls (months OR phases) — PostgREST's .or() with cs.{}
  // on text-arrays is fragile; two simple queries is more reliable and
  // we dedupe in TS afterwards.
  const baseSelect = 'id, title, summary, category, subcategory, crops, season_phases, relevant_months, products_mentioned, valid_until, harvest_year, fusion_sources';

  const buildMonthQuery = () => {
    let q = supabase
      .from('knowledge_articles')
      .select(baseSelect)
      .eq('status', 'published')
      .overlaps('relevant_months', [currentMonth, nextMonth])
      .order('fusion_sources', { ascending: false })
      .limit(60);
    if (cropFilter) q = q.contains('crops', [cropFilter]);
    return q;
  };

  const buildPhaseQuery = () => {
    let q = supabase
      .from('knowledge_articles')
      .select(baseSelect)
      .eq('status', 'published')
      .overlaps('season_phases', [currentPhase, nextPhase])
      .order('fusion_sources', { ascending: false })
      .limit(60);
    if (cropFilter) q = q.contains('crops', [cropFilter]);
    return q;
  };

  const [monthRes, phaseRes] = await Promise.all([
    buildMonthQuery(),
    buildPhaseQuery(),
  ]);

  if (monthRes.error) {
    console.warn('[action-items] articles month-fetch error:', monthRes.error.message);
  }
  if (phaseRes.error) {
    console.warn('[action-items] articles phase-fetch error:', phaseRes.error.message);
  }

  const seen = new Set<string>();
  const combined: ArticleRow[] = [];
  for (const row of [...(monthRes.data ?? []), ...(phaseRes.data ?? [])] as ArticleRow[]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    combined.push(row);
    if (combined.length >= 60) break;
  }
  return combined;
}

// ============================================
// Conversion helpers
// ============================================

function isMonthOrPhaseRelevant(
  months: number[] | null | undefined,
  phases: string[] | null | undefined,
  currentMonth: number,
  nextMonth: number,
  currentPhase: string,
  nextPhase: string,
): boolean {
  const m = months ?? [];
  const p = phases ?? [];
  if (m.length === 0 && p.length === 0) return false; // unscoped — skip
  if (m.includes(currentMonth) || m.includes(nextMonth)) return true;
  if (p.includes(currentPhase) || p.includes(nextPhase)) return true;
  return false;
}

function profileToActionItem(
  p: DiseaseProfileRow,
  currentMonth: number,
  currentPhase: string,
  nextMonth: number,
  nextPhase: string,
): ActionItem {
  const peakNow =
    p.peak_months.includes(currentMonth) || p.peak_phases.includes(currentPhase);
  const peakSoon =
    p.peak_months.includes(nextMonth) || p.peak_phases.includes(nextPhase);

  const urgency: Urgency = peakNow ? 'nu' : peakSoon ? 'deze_week' : 'voorbereiden';

  // Pick the most actionable strategy for the current state
  const strategy =
    (peakNow && p.curative_strategy) ||
    p.prevention_strategy ||
    p.monitoring_advice ||
    p.curative_strategy ||
    '';

  const products =
    peakNow && p.key_curative_products.length > 0
      ? p.key_curative_products
      : p.key_preventive_products;

  const productHint = products.length > 0
    ? ` (${products.slice(0, 3).join(', ')})`
    : '';

  return {
    id: `profile-${p.id}`,
    type: p.profile_type === 'plaag' ? 'plaag' : 'ziekte',
    urgency,
    title: peakNow
      ? `${capitalize(p.name)} — piekperiode`
      : peakSoon
      ? `${capitalize(p.name)} — komt in piek`
      : `${capitalize(p.name)} — monitoring`,
    subtitle: trimToSentence(strategy, 200) + productHint,
    detail: strategy,
    crops: p.crops ?? [],
    phases: p.peak_phases ?? [],
    months: p.peak_months ?? [],
    category: p.profile_type,
    article_id: null,
    ask_chatbot: `Wat moet ik nu doen tegen ${p.name}?`,
    sort_score: (peakNow ? 0 : peakSoon ? 50 : 100) - (p.source_article_count ?? 0) * 0.1,
  };
}

function adviceToActionItem(
  a: ProductAdviceRow,
  currentMonth: number,
  currentPhase: string,
  nextMonth: number,
  nextPhase: string,
): ActionItem {
  const monthsHit = (a.relevant_months ?? []).includes(currentMonth);
  const phaseHit = (a.phenological_phases ?? []).includes(currentPhase);
  const nextHit =
    (a.relevant_months ?? []).includes(nextMonth) ||
    (a.phenological_phases ?? []).includes(nextPhase);

  const urgency: Urgency = monthsHit && phaseHit ? 'nu' : monthsHit || phaseHit ? 'deze_week' : nextHit ? 'voorbereiden' : 'voorbereiden';

  const appType = a.application_type ?? 'algemeen';
  const title = `${capitalize(a.product_name)} tegen ${a.target}`;
  const parts: string[] = [];
  if (a.dosage) parts.push(`Dosering: ${a.dosage}`);
  if (a.timing) parts.push(`Timing: ${a.timing}`);
  if (a.curative_window_hours)
    parts.push(`Curatief tot ${a.curative_window_hours}u na infectie`);

  return {
    id: `advice-${a.id}`,
    type: 'product_advies',
    urgency,
    title,
    subtitle: `[${appType}] ${parts.join(' · ')}`,
    detail: parts.join('\n'),
    crops: a.crop ? [a.crop] : [],
    phases: a.phenological_phases ?? [],
    months: a.relevant_months ?? [],
    category: appType,
    article_id: null,
    dosage: a.dosage,
    ask_chatbot: `Dosering en timing van ${a.product_name} tegen ${a.target} op ${a.crop}?`,
    sort_score: (urgency === 'nu' ? 0 : urgency === 'deze_week' ? 50 : 100) - (a.source_article_count ?? 0) * 0.1,
  };
}

function articleToActionItem(
  a: ArticleRow,
  currentMonth: number,
  currentPhase: string,
  nextMonth: number,
  nextPhase: string,
): ActionItem {
  const months = a.relevant_months ?? [];
  const phases = a.season_phases ?? [];
  const crops = a.crops ?? [];
  const monthsHit = months.includes(currentMonth);
  const phaseHit = phases.includes(currentPhase);
  const expiringSoon =
    a.valid_until && new Date(a.valid_until).getTime() - Date.now() < 14 * 86_400_000;
  // Touch nextMonth / nextPhase to keep them in the signature contract
  // (used by sibling converters that may downgrade to 'voorbereiden')
  void nextMonth; void nextPhase;

  const urgency: Urgency = (monthsHit && phaseHit) || expiringSoon ? 'nu' : (monthsHit || phaseHit) ? 'deze_week' : 'voorbereiden';

  return {
    id: `article-${a.id}`,
    type: 'artikel',
    urgency,
    title: a.title,
    subtitle: trimToSentence(a.summary ?? '', 180),
    detail: a.summary ?? '',
    crops,
    phases,
    months,
    category: a.category,
    article_id: a.id,
    ask_chatbot: `Wat moet ik weten over ${a.title.toLowerCase()}?`,
    sort_score: (urgency === 'nu' ? 0 : urgency === 'deze_week' ? 50 : 100) - (a.fusion_sources ?? 0) * 0.5,
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function trimToSentence(text: string, max: number): string {
  if (!text) return '';
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= max) return cleaned;
  const truncated = cleaned.slice(0, max);
  const lastDot = truncated.lastIndexOf('.');
  if (lastDot > max * 0.6) return truncated.slice(0, lastDot + 1);
  return truncated + '…';
}
