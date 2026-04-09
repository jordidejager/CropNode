/**
 * Retriever — hybrid vector + metadata search against knowledge_articles
 *
 * Uses the match_knowledge_articles RPC (cosine similarity) combined with
 * metadata filters derived from QueryIntent. Only returns chunks above the
 * similarity threshold (default 0.75).
 *
 * Applies a small boost for chunks whose relevant_months overlap with the
 * current month, so seasonal advice surfaces naturally.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { embedText, vectorToPgLiteral } from '../embed';
import { resolveProductAliases } from './ctgb-postprocessor';
import type { QueryIntent, RagContext, RetrievedChunk } from './types';

const DEFAULT_THRESHOLD = 0.70;
const MONTH_BOOST = 0.04;
const PHASE_BOOST = 0.03;
const PRODUCT_MATCH_BOOST = 0.08;
const FETCH_MULTIPLIER = 3;

export interface RetrieveOptions {
  supabase: SupabaseClient;
  query: string;
  intent: QueryIntent;
  context: RagContext;
  limit?: number;
  threshold?: number;
}

type RpcRow = {
  id: string;
  title: string;
  content: string;
  summary: string;
  category: string;
  subcategory: string | null;
  knowledge_type: string;
  crops: string[];
  season_phases: string[];
  relevant_months: number[];
  products_mentioned: string[];
  is_public_source: boolean;
  public_source_ref: string | null;
  similarity: number;
};

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  /** Alias mappings that were resolved, e.g. { "pyrus": "Scala" } */
  resolvedAliases: Record<string, string>;
}

export async function retrieveChunks(options: RetrieveOptions): Promise<RetrievedChunk[]>;
export async function retrieveChunks(options: RetrieveOptions & { returnAliases: true }): Promise<RetrieveResult>;
export async function retrieveChunks(options: RetrieveOptions & { returnAliases?: boolean }): Promise<RetrievedChunk[] | RetrieveResult> {
  const {
    supabase,
    query,
    intent,
    context,
    limit = 6,
    threshold = DEFAULT_THRESHOLD,
    returnAliases = false,
  } = options;

  // Resolve product aliases (Pyrus → Scala etc.) so we hit chunks indexed under either name
  const expandedProducts = intent.products.length > 0
    ? await resolveProductAliases(supabase, intent.products)
    : [];
  // Build alias mapping for downstream use (generator needs to know Pyrus=Scala)
  const resolvedAliases: Record<string, string> = {};
  for (let i = 0; i < intent.products.length; i++) {
    if (expandedProducts[i] && expandedProducts[i].toLowerCase() !== intent.products[i].toLowerCase()) {
      resolvedAliases[intent.products[i]] = expandedProducts[i];
    }
  }
  // Combine original + canonical names
  const allProductNames = Array.from(new Set([...intent.products, ...expandedProducts]));

  // Embed the query (optionally enriched with product synonyms for better recall)
  const embedQuery = expandedProducts.length > 0 && expandedProducts.some((p, i) => p !== intent.products[i])
    ? `${query} ${expandedProducts.join(' ')}`
    : query;
  const embedding = await embedText(embedQuery);

  // Determine primary crop filter (only one supported by RPC)
  const cropFilter = intent.crops.length === 1 ? intent.crops[0] : null;
  const categoryFilter = mapTopicToCategory(intent.topic);
  const fetchCount = Math.max(limit * FETCH_MULTIPLIER, 15);

  // ---------- Pass A: vector search ----------
  const vectorResult = await supabase.rpc('match_knowledge_articles', {
    query_embedding: vectorToPgLiteral(embedding),
    match_threshold: threshold,
    match_count: fetchCount,
    filter_crop: cropFilter,
    filter_category: categoryFilter,
    filter_subcategory: null,
    filter_month: null,
  });

  if (vectorResult.error) {
    console.error('[retriever] match_knowledge_articles fout:', vectorResult.error.message);
    throw new Error(vectorResult.error.message);
  }

  let rows = ((vectorResult.data ?? []) as RpcRow[]);

  // Retry without crop filter if we got too few hits and multiple crops were intended
  if (rows.length < 2 && intent.crops.length >= 2) {
    const retry = await supabase.rpc('match_knowledge_articles', {
      query_embedding: vectorToPgLiteral(embedding),
      match_threshold: threshold,
      match_count: fetchCount,
      filter_crop: null,
      filter_category: categoryFilter,
      filter_subcategory: null,
      filter_month: null,
    });
    if (retry.data && retry.data.length > rows.length) {
      rows = retry.data as RpcRow[];
    }
  }

  // Retry without category filter if still too few
  if (rows.length < 3 && categoryFilter !== null) {
    const retry = await supabase.rpc('match_knowledge_articles', {
      query_embedding: vectorToPgLiteral(embedding),
      match_threshold: Math.max(0.65, threshold - 0.05),
      match_count: fetchCount,
      filter_crop: cropFilter,
      filter_category: null,
      filter_subcategory: null,
      filter_month: null,
    });
    if (retry.data && retry.data.length > rows.length) {
      rows = retry.data as RpcRow[];
    }
  }

  // ---------- Pass B: product-specific direct lookup ----------
  // If the user asked about specific products, also fetch articles whose
  // products_mentioned contains those names — vector similarity sometimes
  // misses these because the rest of the article isn't about that product.
  if (allProductNames.length > 0) {
    const productMatches = await fetchByProductMention(supabase, allProductNames);
    // Merge by id (avoid duplicates)
    const existingIds = new Set(rows.map((r) => r.id));
    for (const pm of productMatches) {
      if (!existingIds.has(pm.id)) {
        // Synthesize a similarity score so it can compete in re-ranking
        rows.push({ ...pm, similarity: 0.78 });
      }
    }
  }

  // ---------- Re-rank with all boosts ----------
  const boosted: RetrievedChunk[] = rows.map((row) => {
    let score = row.similarity;
    if (row.relevant_months?.includes(context.currentMonth)) {
      score += MONTH_BOOST;
    }
    if (
      context.currentPhaseBase &&
      row.season_phases?.some(
        (p) => p === context.currentPhaseBase || p === context.currentPhaseDetail,
      )
    ) {
      score += PHASE_BOOST;
    }
    // Strong boost if a queried product is actually mentioned in this chunk
    if (allProductNames.length > 0 && row.products_mentioned) {
      const lowerMentions = row.products_mentioned.map((p) => p.toLowerCase());
      const matchCount = allProductNames.filter((p) => lowerMentions.includes(p.toLowerCase())).length;
      if (matchCount > 0) {
        score += PRODUCT_MATCH_BOOST * Math.min(matchCount, 2);
      }
    }
    score = Math.min(1, score);

    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      category: row.category,
      subcategory: row.subcategory,
      knowledge_type: row.knowledge_type,
      crops: row.crops ?? [],
      season_phases: row.season_phases ?? [],
      relevant_months: row.relevant_months ?? [],
      products_mentioned: row.products_mentioned ?? [],
      fusion_sources: 1,
      similarity: score,
      raw_similarity: row.similarity,
    };
  });

  boosted.sort((a, b) => b.similarity - a.similarity);
  const results = boosted.slice(0, limit);
  if (returnAliases) {
    return { chunks: results, resolvedAliases };
  }
  return results;
}

/**
 * Fetch articles whose products_mentioned array contains any of the given names.
 * Returns the same RpcRow shape so it can be merged with vector search results.
 */
async function fetchByProductMention(
  supabase: SupabaseClient,
  productNames: string[],
): Promise<RpcRow[]> {
  if (productNames.length === 0) return [];

  // PostgREST overlaps operator on text array
  // We do a case-insensitive contains by querying with the variants we have.
  // Note: products_mentioned is text[], so .overlaps with array of names
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select('id, title, content, summary, category, subcategory, knowledge_type, crops, season_phases, relevant_months, products_mentioned, is_public_source, public_source_ref')
    .eq('status', 'published')
    .overlaps('products_mentioned', productNames)
    .limit(10);

  if (error) {
    console.warn('[retriever] product overlap query fout:', error.message);
    return [];
  }

  return ((data ?? []) as Omit<RpcRow, 'similarity'>[]).map((row) => ({
    ...row,
    similarity: 0.78, // synthetic score, will be re-ranked
  }));
}

// ============================================
// Helpers
// ============================================

/**
 * Map a QueryIntent.topic to a knowledge_articles.category.
 * Some topics don't map 1:1 (e.g. 'teelttechniek' is an abstract category);
 * in those cases we return null so we don't over-constrain retrieval.
 */
function mapTopicToCategory(topic: QueryIntent['topic']): string | null {
  const mapping: Record<QueryIntent['topic'], string | null> = {
    ziekte: 'ziekte',
    plaag: 'plaag',
    bemesting: 'bemesting',
    snoei: 'snoei',
    dunning: 'dunning',
    bewaring: 'bewaring',
    rassenkeuze: 'rassenkeuze',
    teelttechniek: null,
    middel_advies: null, // span meerdere categorieën
    wetgeving: 'certificering',
    algemeen: null,
    off_topic: null,
  };
  return mapping[topic];
}
