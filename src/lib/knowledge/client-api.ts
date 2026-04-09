/**
 * Client-side data access for knowledge_articles.
 *
 * These functions run in the browser and hit Supabase directly via the
 * anon key (RLS enforces status='published' filter). Used by TanStack Query
 * hooks in hooks/use-knowledge.ts.
 *
 * NOTE: Embedding vectors are NEVER selected client-side — they're 3 kB each
 * and Node/browser fetch chokes on the response size for large result sets.
 */

import { getSupabase } from '@/lib/supabase';
import type {
  Crop,
  KnowledgeCategory,
  KnowledgeType,
  ArticleStatus,
} from './types';

// Safe columns (all except content_embedding)
const SELECT_COLUMNS =
  'id, title, summary, content, category, subcategory, knowledge_type, ' +
  'crops, varieties, season_phases, relevant_months, products_mentioned, ' +
  'is_public_source, public_source_ref, confidence_level, harvest_year, ' +
  'valid_from, valid_until, is_evergreen, fusion_sources, status, ' +
  'created_at, updated_at, published_at';

export interface KnowledgeArticleListItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: KnowledgeCategory;
  subcategory: string | null;
  knowledge_type: KnowledgeType;
  crops: Crop[];
  varieties: string[];
  season_phases: string[];
  relevant_months: number[];
  products_mentioned: string[];
  is_public_source: boolean;
  public_source_ref: string | null;
  confidence_level: 'hoog' | 'gemiddeld' | 'laag';
  harvest_year: number;
  valid_from: string | null;
  valid_until: string | null;
  is_evergreen: boolean;
  fusion_sources: number;
  status: ArticleStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ArticleFilters {
  /** Text match on title + summary */
  search?: string;
  categories?: KnowledgeCategory[];
  crops?: Crop[];
  months?: number[];
  urgency?: 'time_critical' | 'seasonal' | 'background';
  statuses?: ArticleStatus[];
  limit?: number;
  offset?: number;
}

/**
 * Fetch articles with optional filters. Defaults to status='published' OR 'draft'
 * (we include drafts so the UI is populated before the bulk-publish step).
 */
export async function fetchArticles(
  filters: ArticleFilters = {},
): Promise<KnowledgeArticleListItem[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('knowledge_articles')
    .select(SELECT_COLUMNS)
    .order('updated_at', { ascending: false });

  // Default: show everything except archived
  const statuses = filters.statuses ?? ['published', 'draft', 'needs_review'];
  query = query.in('status', statuses);

  if (filters.categories && filters.categories.length > 0) {
    query = query.in('category', filters.categories);
  }

  if (filters.crops && filters.crops.length > 0) {
    query = query.overlaps('crops', filters.crops);
  }

  if (filters.months && filters.months.length > 0) {
    // `overlaps` on int[] — matches if any month is in relevant_months
    query = query.overlaps('relevant_months', filters.months);
  }

  if (filters.search && filters.search.trim().length >= 2) {
    const pattern = `%${filters.search.trim()}%`;
    query = query.or(`title.ilike.${pattern},summary.ilike.${pattern}`);
  }

  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 20) - 1);

  const { data, error } = await query;
  if (error) throw new Error(`fetchArticles: ${error.message}`);
  return (data ?? []) as unknown as KnowledgeArticleListItem[];
}

export async function fetchArticleById(
  id: string,
): Promise<KnowledgeArticleListItem | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`fetchArticleById: ${error.message}`);
  return (data as unknown as KnowledgeArticleListItem) ?? null;
}

/**
 * Article counts grouped by category — used by the category constellation.
 * Runs multiple count queries because PostgREST doesn't do GROUP BY client-side.
 */
export async function fetchCategoryCounts(): Promise<Record<string, number>> {
  const supabase = getSupabase();
  const categories: KnowledgeCategory[] = [
    'ziekte', 'plaag', 'abiotisch', 'bemesting', 'snoei', 'dunning',
    'bewaring', 'certificering', 'algemeen', 'rassenkeuze', 'bodem', 'watermanagement',
  ];
  const results: Record<string, number> = {};
  await Promise.all(
    categories.map(async (cat) => {
      const { count, error } = await supabase
        .from('knowledge_articles')
        .select('*', { count: 'exact', head: true })
        .eq('category', cat)
        .in('status', ['published', 'draft', 'needs_review']);
      results[cat] = error ? 0 : (count ?? 0);
    }),
  );
  return results;
}

/**
 * "Nu in het veld" — articles that are relevant for the current month, ranked
 * by urgency heuristics. The current month is computed client-side so the list
 * feels responsive to date changes.
 */
export async function fetchCurrentlyRelevantArticles(
  currentMonth: number = new Date().getUTCMonth() + 1,
  limit = 8,
): Promise<KnowledgeArticleListItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select(SELECT_COLUMNS)
    .in('status', ['published', 'draft', 'needs_review'])
    .overlaps('relevant_months', [currentMonth])
    .order('fusion_sources', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchCurrentlyRelevantArticles: ${error.message}`);
  return (data ?? []) as unknown as KnowledgeArticleListItem[];
}

/**
 * Articles for a specific fenological phase (e.g. 'bloei', 'knopstadium').
 * Used by the phenological compass when a phase is clicked.
 */
export async function fetchArticlesByPhase(
  phase: string,
  limit = 20,
): Promise<KnowledgeArticleListItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select(SELECT_COLUMNS)
    .in('status', ['published', 'draft', 'needs_review'])
    .overlaps('season_phases', [phase])
    .order('fusion_sources', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchArticlesByPhase: ${error.message}`);
  return (data ?? []) as unknown as KnowledgeArticleListItem[];
}

/**
 * Total published-ish articles — used in the hero banner stats.
 */
export async function fetchArticleStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
}> {
  const supabase = getSupabase();
  const [total, published, draft, needsReview] = await Promise.all([
    supabase.from('knowledge_articles').select('*', { count: 'exact', head: true })
      .in('status', ['published', 'draft', 'needs_review']),
    supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).eq('status', 'needs_review'),
  ]);
  return {
    total: total.count ?? 0,
    byStatus: {
      published: published.count ?? 0,
      draft: draft.count ?? 0,
      needs_review: needsReview.count ?? 0,
    },
  };
}

/**
 * Full-text search via API route (server-side, uses service role).
 * Foundation for the ⌘K command palette.
 */
export async function searchKnowledge(
  query: string,
  options: { crops?: string[]; category?: string; month?: number; limit?: number } = {},
): Promise<KnowledgeArticleListItem[]> {
  const params = new URLSearchParams({ query });
  if (options.crops?.length) params.set('crops', options.crops.join(','));
  if (options.category) params.set('category', options.category);
  if (options.month) params.set('month', String(options.month));
  if (options.limit) params.set('limit', String(options.limit));

  const res = await fetch(`/api/knowledge/search?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`searchKnowledge: ${res.status} ${text}`);
  }
  const body = await res.json();
  return (body.results ?? []) as KnowledgeArticleListItem[];
}
