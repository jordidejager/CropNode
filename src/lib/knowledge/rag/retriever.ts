/**
 * Retriever v2 — metadata pre-filter + in-memory cosine similarity
 *
 * The pgvector RPC (match_knowledge_articles) timeouts on our Supabase plan
 * with 2000+ rows. Instead, we:
 *   1. Fetch ~50-100 candidate articles via fast WHERE queries (category, subcategory, products)
 *   2. Embed the user query via Gemini
 *   3. Compute cosine similarity in TypeScript (fast for <200 items)
 *   4. Re-rank with month/phase/product boosts
 *
 * This approach is actually more flexible and reliable than pure vector search.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { embedText } from '../embed';
import { cosineSimilarity, parseVectorLiteral } from '../cosine';
import { resolveProductAliases } from './ctgb-postprocessor';
import type { QueryIntent, RagContext, RetrievedChunk } from './types';

const DEFAULT_THRESHOLD = 0.65;
const MONTH_BOOST = 0.08;          // was 0.04 — seizoensrelevantie moet zwaarder wegen
const PHASE_BOOST = 0.06;          // was 0.03 — fenologische fase-match is belangrijk
const PRODUCT_MATCH_BOOST = 0.10;  // was 0.08
const HARVEST_YEAR_BOOST = 0.05;   // nieuw — recent advies > oud advies
const MAX_CANDIDATES = 80;

// Columns to select (INCLUDING content_embedding for in-memory similarity)
const SELECT_WITH_EMBEDDING =
  'id, title, content, summary, category, subcategory, knowledge_type, ' +
  'crops, season_phases, relevant_months, products_mentioned, ' +
  'is_public_source, public_source_ref, fusion_sources, harvest_year, valid_until, content_embedding, image_urls';

export interface RetrieveOptions {
  supabase: SupabaseClient;
  query: string;
  intent: QueryIntent;
  context: RagContext;
  limit?: number;
  threshold?: number;
}

type CandidateRow = {
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
  fusion_sources: number;
  harvest_year: number | null;
  valid_until: string | null;
  content_embedding: string | null;
  image_urls: string[] | null;
};

export async function retrieveChunks(options: RetrieveOptions): Promise<RetrievedChunk[]> {
  const {
    supabase,
    query,
    intent,
    context,
    limit = 6,
    threshold = DEFAULT_THRESHOLD,
  } = options;

  // 1. Resolve product aliases (Pyrus → Scala)
  let allProductNames = [...intent.products];
  if (intent.products.length > 0) {
    try {
      const resolved = await resolveProductAliases(supabase, intent.products);
      allProductNames = Array.from(new Set([...intent.products, ...resolved]));
    } catch (err) {
      console.warn('[retriever] alias resolution failed:', err);
    }
  }

  // 2. Embed the query (enriched with resolved product names)
  const embedQuery = allProductNames.length > 0
    ? `${query} ${allProductNames.join(' ')}`
    : query;
  const queryEmbedding = await embedText(embedQuery);

  // 3. Fetch candidates via metadata pre-filter (fast, no vector search)
  const candidates = await fetchCandidates(supabase, intent, allProductNames);
  console.log(`[retriever] ${candidates.length} kandidaten via metadata pre-filter`);

  if (candidates.length === 0) {
    return [];
  }

  // 4. Compute cosine similarity in-memory
  const ranked: RetrievedChunk[] = [];
  for (const row of candidates) {
    if (!row.content_embedding) continue;
    const embedding = parseVectorLiteral(row.content_embedding);
    if (embedding.length !== queryEmbedding.length) continue;

    let similarity = cosineSimilarity(queryEmbedding, embedding);

    // Apply boosts
    if (row.relevant_months?.includes(context.currentMonth)) {
      similarity += MONTH_BOOST;
    }
    if (
      context.currentPhaseBase &&
      row.season_phases?.some(
        (p) => p === context.currentPhaseBase || p === context.currentPhaseDetail,
      )
    ) {
      similarity += PHASE_BOOST;
    }
    if (allProductNames.length > 0 && row.products_mentioned) {
      const lowerMentions = row.products_mentioned.map((p) => p.toLowerCase());
      const matchCount = allProductNames.filter((p) =>
        lowerMentions.includes(p.toLowerCase()),
      ).length;
      if (matchCount > 0) {
        similarity += PRODUCT_MATCH_BOOST * Math.min(matchCount, 2);
      }
    }
    // Boost recent content (current harvest year > older)
    const currentYear = new Date().getUTCFullYear();
    if (row.harvest_year) {
      if (row.harvest_year === currentYear) {
        similarity += HARVEST_YEAR_BOOST;
      } else if (row.harvest_year === currentYear - 1) {
        similarity += HARVEST_YEAR_BOOST * 0.5;
      }
      // Older than 2 years: slight penalty
      if (row.harvest_year < currentYear - 2) {
        similarity -= 0.02;
      }
    }
    // Downrank expired content (valid_until in the past)
    if (row.valid_until) {
      const validUntil = new Date(row.valid_until);
      if (validUntil < new Date()) {
        similarity -= 0.06; // significant penalty for expired content
      }
    }
    similarity = Math.min(1, Math.max(0, similarity));

    if (similarity >= threshold) {
      ranked.push({
        id: row.id,
        title: row.title,
        summary: row.summary ?? '',
        content: row.content,
        category: row.category,
        subcategory: row.subcategory,
        knowledge_type: row.knowledge_type,
        crops: row.crops ?? [],
        season_phases: row.season_phases ?? [],
        relevant_months: row.relevant_months ?? [],
        products_mentioned: row.products_mentioned ?? [],
        image_urls: row.image_urls ?? [],
        fusion_sources: row.fusion_sources ?? 1,
        similarity,
        raw_similarity: similarity,
      });
    }
  }

  ranked.sort((a, b) => b.similarity - a.similarity);
  console.log(
    `[retriever] ${ranked.length} resultaten boven threshold ${threshold}` +
      (ranked.length > 0 ? `, top: ${ranked[0].similarity.toFixed(3)}` : ''),
  );
  return ranked.slice(0, limit);
}

// ============================================
// Candidate fetching (metadata pre-filter)
// ============================================

/**
 * Fetch candidate articles using multiple parallel metadata strategies.
 * Returns ~50-100 rows that we then re-rank with cosine similarity.
 *
 * Strategies (parallel):
 *   A) subcategory match (most precise — "schurft" articles for schurft query)
 *   B) category match (broader — all "ziekte" articles)
 *   C) product overlap (any article mentioning the queried products)
 *   D) title search (last resort — ilike on title)
 */
/** Helper: run a Supabase query and return CandidateRow[] or null on error */
async function safeQuery(
  queryBuilder: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<CandidateRow[] | null> {
  try {
    const { data, error } = await queryBuilder;
    if (error) return null;
    return (data ?? []) as CandidateRow[];
  } catch {
    return null;
  }
}

async function fetchCandidates(
  supabase: SupabaseClient,
  intent: QueryIntent,
  productNames: string[],
): Promise<CandidateRow[]> {
  const seen = new Set<string>();
  const results: CandidateRow[] = [];
  const category = mapTopicToCategory(intent.topic);

  const addRows = (rows: CandidateRow[] | null) => {
    for (const row of rows ?? []) {
      if (!seen.has(row.id) && results.length < MAX_CANDIDATES) {
        seen.add(row.id);
        results.push(row);
      }
    }
  };

  const promises: Promise<CandidateRow[] | null>[] = [];

  // A) Subcategory match
  if (intent.specific_subjects.length > 0) {
    for (const subject of intent.specific_subjects.slice(0, 3)) {
      promises.push(
        safeQuery(
          supabase
            .from('knowledge_articles')
            .select(SELECT_WITH_EMBEDDING)
            .eq('status', 'published')
            .ilike('subcategory', `%${subject}%`)
            .order('fusion_sources', { ascending: false })
            .limit(20),
        ),
      );
    }
  }

  // B) Category match
  if (category) {
    const cropFilter = intent.crops.length === 1 ? intent.crops[0] : null;
    let q = supabase
      .from('knowledge_articles')
      .select(SELECT_WITH_EMBEDDING)
      .eq('status', 'published')
      .eq('category', category)
      .order('fusion_sources', { ascending: false })
      .limit(30);
    if (cropFilter) {
      q = q.contains('crops', [cropFilter]);
    }
    promises.push(safeQuery(q));
  }

  // C) Product overlap
  if (productNames.length > 0) {
    promises.push(
      safeQuery(
        supabase
          .from('knowledge_articles')
          .select(SELECT_WITH_EMBEDDING)
          .eq('status', 'published')
          .overlaps('products_mentioned', productNames)
          .order('fusion_sources', { ascending: false })
          .limit(20),
      ),
    );
  }

  // D) Title search
  const searchTerms = [
    ...intent.specific_subjects,
    ...productNames,
  ].filter(Boolean).slice(0, 3);
  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      promises.push(
        safeQuery(
          supabase
            .from('knowledge_articles')
            .select(SELECT_WITH_EMBEDDING)
            .eq('status', 'published')
            .ilike('title', `%${term}%`)
            .limit(10),
        ),
      );
    }
  }

  // E) Fallback: high-fusion articles
  if (promises.length === 0) {
    promises.push(
      safeQuery(
        supabase
          .from('knowledge_articles')
          .select(SELECT_WITH_EMBEDDING)
          .eq('status', 'published')
          .order('fusion_sources', { ascending: false })
          .limit(50),
      ),
    );
  }

  const allResults = await Promise.all(promises);
  for (const rows of allResults) {
    addRows(rows);
  }

  return results;
}

// ============================================
// Helpers
// ============================================

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
    middel_advies: null,
    wetgeving: 'certificering',
    algemeen: null,
    off_topic: null,
  };
  return mapping[topic];
}
