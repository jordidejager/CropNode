/**
 * Knowledge base semantic search — Fase 2 chatbot foundation
 *
 * Embeds the user query, runs a vector similarity search via the
 * match_knowledge_articles RPC, and returns the top-N hits.
 *
 * Boosts scores for articles that match the current month, so seasonal
 * advice surfaces above evergreen content during the relevant period.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { embedText, vectorToPgLiteral } from './embed';
import type {
  KnowledgeSearchParams,
  KnowledgeSearchResult,
} from './types';

const DEFAULT_LIMIT = 5;
const DEFAULT_THRESHOLD = 0.75;
const MONTH_MATCH_BOOST = 0.05;

export async function searchKnowledge(
  params: KnowledgeSearchParams,
  supabase: SupabaseClient,
): Promise<KnowledgeSearchResult[]> {
  const {
    query,
    crops,
    category,
    subcategory,
    currentMonth,
    limit = DEFAULT_LIMIT,
    similarityThreshold = DEFAULT_THRESHOLD,
  } = params;

  if (!query.trim()) {
    return [];
  }

  const embedding = await embedText(query);

  // We can only filter on a single crop in the RPC; pick the first if multiple
  const cropFilter = crops && crops.length > 0 ? crops[0] : null;
  // Pad the limit so we have headroom to apply month-based re-ranking
  const fetchCount = Math.min(Math.max(limit * 3, 10), 50);

  const { data, error } = await supabase.rpc('match_knowledge_articles', {
    query_embedding: vectorToPgLiteral(embedding),
    match_threshold: similarityThreshold,
    match_count: fetchCount,
    filter_crop: cropFilter,
    filter_category: category ?? null,
    filter_subcategory: subcategory ?? null,
    filter_month: currentMonth ?? null,
  });

  if (error) {
    console.error(`[search] match_knowledge_articles fout: ${error.message}`);
    throw new Error(error.message);
  }

  const rows = (data ?? []) as KnowledgeSearchResult[];

  // Apply month boost & re-rank
  const month = currentMonth ?? new Date().getUTCMonth() + 1;
  const ranked = rows
    .map((row) => {
      const monthHit = row.relevant_months?.includes(month);
      const boostedSimilarity = monthHit
        ? Math.min(1, row.similarity + MONTH_MATCH_BOOST)
        : row.similarity;
      return { ...row, similarity: boostedSimilarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return ranked;
}
