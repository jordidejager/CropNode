'use client';

/**
 * TanStack Query hooks for the Knowledge Atlas UI.
 *
 * All hooks wrap the client-api helpers and provide caching / refetch control.
 * Default stale time is 5 minutes — knowledge articles don't change often.
 */

import { useQuery, useQueries } from '@tanstack/react-query';
import {
  fetchArticles,
  fetchArticleById,
  fetchCategoryCounts,
  fetchCurrentlyRelevantArticles,
  fetchArticlesByPhase,
  fetchArticleStats,
  searchKnowledge,
  type ArticleFilters,
  type KnowledgeArticleListItem,
} from '@/lib/knowledge/client-api';
import { computePhenology } from '@/lib/knowledge/phenology';

const STALE_5MIN = 5 * 60 * 1000;

// ============================================
// Article lists
// ============================================

export function useArticles(filters: ArticleFilters = {}) {
  return useQuery<KnowledgeArticleListItem[]>({
    queryKey: ['knowledge', 'articles', filters],
    queryFn: () => fetchArticles(filters),
    staleTime: STALE_5MIN,
  });
}

export function useArticle(id: string | null | undefined) {
  return useQuery<KnowledgeArticleListItem | null>({
    queryKey: ['knowledge', 'article', id],
    queryFn: () => (id ? fetchArticleById(id) : Promise.resolve(null)),
    staleTime: STALE_5MIN,
    enabled: !!id,
  });
}

// ============================================
// Category counts (for the constellation picker)
// ============================================

export function useCategoryCounts() {
  return useQuery<Record<string, number>>({
    queryKey: ['knowledge', 'category-counts'],
    queryFn: fetchCategoryCounts,
    staleTime: STALE_5MIN,
  });
}

// ============================================
// Currently relevant (hero "nu in het veld")
// ============================================

export function useCurrentlyRelevantArticles(limit = 8) {
  const currentMonth = new Date().getUTCMonth() + 1;
  return useQuery<KnowledgeArticleListItem[]>({
    queryKey: ['knowledge', 'currently-relevant', currentMonth, limit],
    queryFn: () => fetchCurrentlyRelevantArticles(currentMonth, limit),
    staleTime: STALE_5MIN,
  });
}

// ============================================
// By phase (for phenological compass)
// ============================================

export function useArticlesByPhase(phase: string | null, limit = 20) {
  return useQuery<KnowledgeArticleListItem[]>({
    queryKey: ['knowledge', 'by-phase', phase, limit],
    queryFn: () => (phase ? fetchArticlesByPhase(phase, limit) : Promise.resolve([])),
    enabled: !!phase,
    staleTime: STALE_5MIN,
  });
}

// ============================================
// Stats (hero metadata)
// ============================================

export function useArticleStats() {
  return useQuery<{ total: number; byStatus: Record<string, number> }>({
    queryKey: ['knowledge', 'stats'],
    queryFn: fetchArticleStats,
    staleTime: STALE_5MIN,
  });
}

// ============================================
// Command palette search (vector similarity)
// ============================================

export function useKnowledgeSearch(
  query: string,
  options: { crops?: string[]; category?: string; month?: number; limit?: number } = {},
) {
  return useQuery<KnowledgeArticleListItem[]>({
    queryKey: ['knowledge', 'search', query, options],
    queryFn: () => searchKnowledge(query, options),
    enabled: query.trim().length >= 2,
    staleTime: 60 * 1000, // shorter for search results
  });
}

// ============================================
// Phenology of "now"
// ============================================

interface PhenologyApiResponse {
  success: boolean;
  bloomYear: number | null;
  daysRelativeToBloom: number | null;
  phenologicalPhase: string;
  seasonPhase: string | null;
  relevantMonths: number[];
  today: string;
  month: number;
  weekOfYear: number;
  bloomDate: string | null;
  source: string;
}

/**
 * Fetch the current phenological phase from the API.
 * The API reads the bloom date from the phenology_reference table in Supabase,
 * which can be updated (via the auto-detect endpoint or manually) without
 * redeploying the app. Falls back to client-side compute if the API fails.
 */
export function useCurrentPhenology() {
  return useQuery({
    queryKey: ['knowledge', 'phenology', 'now'],
    queryFn: async (): Promise<PhenologyApiResponse> => {
      try {
        const res = await fetch('/api/knowledge/phenology');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PhenologyApiResponse;
      } catch (err) {
        // Fallback to client-side compute
        console.warn('[useCurrentPhenology] API failed, falling back to local compute:', err);
        const today = new Date();
        const iso = today.toISOString().slice(0, 10);
        const result = computePhenology(iso);
        return {
          success: false,
          bloomYear: result.bloomYear,
          daysRelativeToBloom: result.daysRelativeToBloom,
          phenologicalPhase: result.phenologicalPhase,
          seasonPhase: result.seasonPhase,
          relevantMonths: result.relevantMonths,
          today: iso,
          month: today.getUTCMonth() + 1,
          weekOfYear: getWeekOfYear(today),
          bloomDate: null,
          source: 'fallback',
        };
      }
    },
    staleTime: 60 * 60 * 1000, // 1 hour — fenology doesn't shift quickly
  });
}

function getWeekOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = (date.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getUTCDay() + 1) / 7);
}
