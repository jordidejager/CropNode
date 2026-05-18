/**
 * Query logging — persists one row per chat query into `rag_query_log`.
 *
 * Writes are fire-and-forget (never block the user), and swallow errors so
 * missing tables / network blips never surface to the caller. The log is a
 * Tier-4 observability feature — see `supabase/migrations/067_knowledge_hybrid_search.sql`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryIntent, RetrievedChunk } from './types';

export interface QueryLogRecord {
  query: string;
  intent: QueryIntent | null;
  candidateCount: number | null;
  retrievedCount: number;
  topRawSimilarity: number | null;
  topSimilarity: number | null;
  confidencePassed: boolean;
  confidenceReason: string | null;
  usedAgent: boolean;
  usedFallback: boolean;
  answerLength: number | null;
  retrievedArticleIds: string[];
  latencyMs: number;
  error: string | null;
}

/**
 * Insert a log row for a completed query. Never throws — only warns on error.
 */
export async function logRagQuery(
  supabase: SupabaseClient,
  record: QueryLogRecord,
): Promise<void> {
  try {
    const { error } = await supabase.from('rag_query_log').insert({
      query: record.query.slice(0, 2000),
      intent: record.intent,
      candidate_count: record.candidateCount,
      retrieved_count: record.retrievedCount,
      top_raw_similarity: record.topRawSimilarity,
      top_similarity: record.topSimilarity,
      confidence_passed: record.confidencePassed,
      confidence_reason: record.confidenceReason,
      used_agent: record.usedAgent,
      used_fallback: record.usedFallback,
      answer_length: record.answerLength,
      retrieved_article_ids: record.retrievedArticleIds,
      latency_ms: record.latencyMs,
      error: record.error,
    });
    if (error) {
      // Gracefully degrade — table may not exist yet on stale envs
      if (/relation .* does not exist/i.test(error.message)) return;
      console.warn('[query-log] insert error:', error.message);
    }
  } catch (err) {
    console.warn('[query-log] fire-and-forget error:', err);
  }
}

export function summarizeChunks(chunks: RetrievedChunk[]): {
  topRawSimilarity: number | null;
  topSimilarity: number | null;
  retrievedArticleIds: string[];
} {
  if (chunks.length === 0) {
    return { topRawSimilarity: null, topSimilarity: null, retrievedArticleIds: [] };
  }
  return {
    topRawSimilarity: Math.max(...chunks.map((c) => c.raw_similarity)),
    topSimilarity: Math.max(...chunks.map((c) => c.similarity)),
    retrievedArticleIds: chunks.map((c) => c.id).filter(Boolean),
  };
}
