/**
 * Knowledge pipeline orchestrator
 *
 * Wires together: scrape → hash → transform → validate → embed → fuse → store.
 * Idempotent: re-running the same scrape produces 0 new records (content_hash check).
 *
 * Used by:
 *  - /api/knowledge/scrape route (cron + manual triggers)
 *  - scripts/migrate-fruitconsult-history.ts (one-off backfill)
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getScraper } from './scrapers';
import type { ScrapedContent, ScrapeOptions } from './scrapers';
import { transformContent, preFilterScrapedContent } from './transform';
import { validateArticle, hasBlockers } from './validate';
import { embedDraft, vectorToPgLiteral } from './embed';
import { findFusionCandidate, fuseArticles } from './fuse';
import type {
  KnowledgeArticleDraft,
  PipelineRunResult,
} from './types';

/** Default concurrency for processing multiple scraped items in parallel */
export const DEFAULT_CONCURRENCY = 4;

// ============================================
// Helpers
// ============================================

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function contentDraftHash(draft: KnowledgeArticleDraft): string {
  return sha256(`${draft.title}|${draft.content}`);
}

/**
 * Retry wrapper voor Supabase REST calls. Node 25 + undici heeft soms
 * transient "fetch failed" errors die direct succesvol zijn bij retry.
 */
async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 800,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|UND_ERR/i.test(message);
      if (attempt < maxAttempts && isTransient) {
        const delay = baseDelayMs * attempt;
        console.warn(
          `[pipeline] ${label} transient fout (poging ${attempt}/${maxAttempts}): ${message}. Retry over ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ============================================
// Storage helpers
// ============================================

interface StoreParams {
  supabase: SupabaseClient;
  draft: KnowledgeArticleDraft;
  embedding: number[];
  contentHash: string;
  needsReview: boolean;
  imageUrls?: string[];
}

async function insertNewArticle(params: StoreParams): Promise<void> {
  const { supabase, draft, embedding, contentHash, needsReview, imageUrls } = params;

  const status = needsReview ? 'needs_review' : 'draft';
  await withDbRetry('insert knowledge_articles', async () => {
    const { error } = await supabase.from('knowledge_articles').insert({
      title: draft.title,
      content: draft.content,
      summary: draft.summary,
      content_embedding: vectorToPgLiteral(embedding),
      category: draft.category,
      subcategory: draft.subcategory ?? null,
      knowledge_type: draft.knowledge_type,
      crops: draft.crops,
      varieties: draft.varieties,
      season_phases: draft.season_phases,
      relevant_months: draft.relevant_months,
      products_mentioned: draft.products_mentioned,
      is_public_source: draft.is_public_source,
      public_source_ref: draft.public_source_ref ?? null,
      confidence_level: draft.confidence_level,
      harvest_year: draft.harvest_year,
      valid_from: draft.valid_from ?? null,
      valid_until: draft.valid_until ?? null,
      is_evergreen: draft.is_evergreen,
      content_hash: contentHash,
      fusion_sources: 1,
      status,
      ...(imageUrls && imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
    });
    if (error) {
      throw new Error(`insert knowledge_articles: ${error.message}`);
    }
  });
}

async function updateFusedArticle(params: {
  supabase: SupabaseClient;
  existingId: string;
  fusedDraft: KnowledgeArticleDraft;
  embedding: number[];
  contentHash: string;
  newFusionCount: number;
}): Promise<void> {
  const { supabase, existingId, fusedDraft, embedding, contentHash, newFusionCount } = params;

  await withDbRetry('update knowledge_articles', async () => {
    const { error } = await supabase
      .from('knowledge_articles')
      .update({
        title: fusedDraft.title,
        content: fusedDraft.content,
        summary: fusedDraft.summary,
        content_embedding: vectorToPgLiteral(embedding),
        category: fusedDraft.category,
        subcategory: fusedDraft.subcategory ?? null,
        knowledge_type: fusedDraft.knowledge_type,
        crops: fusedDraft.crops,
        varieties: fusedDraft.varieties,
        season_phases: fusedDraft.season_phases,
        relevant_months: fusedDraft.relevant_months,
        products_mentioned: fusedDraft.products_mentioned,
        content_hash: contentHash,
        fusion_sources: newFusionCount,
      })
      .eq('id', existingId);
    if (error) {
      throw new Error(`update knowledge_articles: ${error.message}`);
    }
  });
}

async function articleExistsByHash(
  supabase: SupabaseClient,
  contentHash: string,
): Promise<boolean> {
  try {
    return await withDbRetry('hash check', async () => {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('id')
        .eq('content_hash', contentHash)
        .limit(1);
      if (error) throw new Error(error.message);
      return !!data && data.length > 0;
    });
  } catch (err) {
    console.warn(`[pipeline] hash-check faalde uiteindelijk: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

// ============================================
// Scrape log helpers
// ============================================

async function logExists(
  supabase: SupabaseClient,
  source: string,
  identifier: string,
): Promise<boolean> {
  try {
    return await withDbRetry('log check', async () => {
      const { data, error } = await supabase
        .from('knowledge_scrape_log')
        .select('id')
        .eq('scrape_source', source)
        .eq('source_identifier', identifier)
        .in('status', ['completed', 'skipped'])
        .limit(1);
      if (error) throw new Error(error.message);
      return !!data && data.length > 0;
    });
  } catch (err) {
    console.warn(`[pipeline] log-check faalde uiteindelijk: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function recordLog(params: {
  supabase: SupabaseClient;
  source: string;
  type: string;
  rawHash: string;
  identifier: string;
  metadata: Record<string, unknown>;
  created: number;
  updated: number;
  fused: number;
  status: 'completed' | 'failed' | 'skipped';
  errorMessage?: string;
}): Promise<void> {
  try {
    await withDbRetry('insert scrape_log', async () => {
      const { error } = await params.supabase.from('knowledge_scrape_log').insert({
        scrape_source: params.source,
        scrape_type: params.type,
        raw_content_hash: params.rawHash,
        source_identifier: params.identifier,
        source_metadata: params.metadata,
        articles_created: params.created,
        articles_updated: params.updated,
        articles_fused: params.fused,
        status: params.status,
        error_message: params.errorMessage ?? null,
        completed_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    });
  } catch (err) {
    console.warn(`[pipeline] scrape_log insert faalde: ${err instanceof Error ? err.message : err}`);
  }
}

// ============================================
// Per-item processing
// ============================================

interface ProcessItemResult {
  created: number;
  updated: number;
  fused: number;
  needingReview: number;
  skippedByFilter: number;
  errors: Array<{ identifier?: string; message: string }>;
}

export interface ProcessItemOptions {
  supabase: SupabaseClient;
  /** Skip the scrape_log existence check (used by smoke tests) */
  skipLogCheck?: boolean;
}

/**
 * Process a single ScrapedContent item end-to-end.
 * Used both by the main scraper loop and by the migration backfill script.
 */
export async function processScrapedItem(
  item: ScrapedContent,
  options: ProcessItemOptions,
): Promise<ProcessItemResult> {
  const { supabase, skipLogCheck = false } = options;
  const result: ProcessItemResult = {
    created: 0,
    updated: 0,
    fused: 0,
    needingReview: 0,
    skippedByFilter: 0,
    errors: [],
  };

  const rawHash = sha256(item.rawText);

  // Idempotency check via scrape_log
  if (!skipLogCheck) {
    const seen = await logExists(supabase, item.internalSourceCode, item.sourceIdentifier);
    if (seen) {
      return result;
    }
  }

  // Pre-filter: skip obvious non-knowledge content (personeel, events, feestdagen)
  const preFilter = preFilterScrapedContent(item);
  if (preFilter.skip) {
    result.skippedByFilter = 1;
    await recordLog({
      supabase,
      source: item.internalSourceCode,
      type: item.sourceType,
      rawHash,
      identifier: item.sourceIdentifier,
      metadata: { ...item.metadata, filter_reason: preFilter.reason },
      created: 0,
      updated: 0,
      fused: 0,
      status: 'skipped',
    });
    return result;
  }

  try {
    // 1. Transform
    const { articles } = await transformContent({ content: item });

    // Gemini kan ook zelf besluiten dat er niets te maken valt
    if (articles.length === 0) {
      result.skippedByFilter = 1;
      await recordLog({
        supabase,
        source: item.internalSourceCode,
        type: item.sourceType,
        rawHash,
        identifier: item.sourceIdentifier,
        metadata: { ...item.metadata, filter_reason: 'gemini: no knowledge content' },
        created: 0,
        updated: 0,
        fused: 0,
        status: 'skipped',
      });
      return result;
    }

    // 2-5. Per draft
    for (const draft of articles) {
      const draftHash = contentDraftHash(draft);

      // Skip exact duplicates by content_hash (cheap dedupe before validate/embed)
      if (await articleExistsByHash(supabase, draftHash)) {
        continue;
      }

      // 2. Validate
      const validation = await validateArticle(draft);
      const needsReview = hasBlockers(validation);
      if (needsReview) {
        result.needingReview += 1;
      }

      // 3. Embed
      const embedding = await embedDraft(draft);

      // 4. Fusion check
      const candidate = await findFusionCandidate({
        supabase,
        embedding,
        category: draft.category,
        subcategory: draft.subcategory ?? undefined,
        crops: draft.crops,
      });

      if (candidate) {
        // 4a. Fuse
        const { merged } = await fuseArticles(candidate, draft);
        const mergedEmbedding = await embedDraft(merged);
        const mergedHash = contentDraftHash(merged);
        await updateFusedArticle({
          supabase,
          existingId: candidate.id,
          fusedDraft: merged,
          embedding: mergedEmbedding,
          contentHash: mergedHash,
          newFusionCount: candidate.fusion_sources + 1,
        });
        result.fused += 1;
        result.updated += 1;
      } else {
        // 4b. Insert new
        const imageUrls = (item.metadata.imageUrls as string[] | undefined) ?? [];
        await insertNewArticle({
          supabase,
          draft,
          embedding,
          contentHash: draftHash,
          needsReview,
          imageUrls,
        });
        result.created += 1;
      }
    }

    // Log success
    await recordLog({
      supabase,
      source: item.internalSourceCode,
      type: item.sourceType,
      rawHash,
      identifier: item.sourceIdentifier,
      metadata: item.metadata,
      created: result.created,
      updated: result.updated,
      fused: result.fused,
      status: 'completed',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push({ identifier: item.sourceIdentifier, message });
    await recordLog({
      supabase,
      source: item.internalSourceCode,
      type: item.sourceType,
      rawHash,
      identifier: item.sourceIdentifier,
      metadata: item.metadata,
      created: result.created,
      updated: result.updated,
      fused: result.fused,
      status: 'failed',
      errorMessage: message,
    });
  }

  return result;
}

// ============================================
// Main orchestrator
// ============================================

export interface RunPipelineOptions {
  supabase: SupabaseClient;
  source: string;
  scrapeOptions?: ScrapeOptions;
  /** Max concurrent items to process (default 4) */
  concurrency?: number;
}

export async function runScrapePipeline(
  options: RunPipelineOptions,
): Promise<PipelineRunResult> {
  const { supabase, source, scrapeOptions = {}, concurrency = DEFAULT_CONCURRENCY } = options;
  const startedAt = new Date().toISOString();

  // Load known typh_ids from scrape_log to skip already-scraped items
  const knownIds = await loadKnownIdentifiers(supabase, source);
  console.log(
    `[pipeline] ${knownIds.size} eerder verwerkte items bekend voor bron "${source}"`,
  );

  const scraper = getScraper(source, knownIds);
  const items = await scraper.scrape(scrapeOptions);
  console.log(`[pipeline] Scraper leverde ${items.length} items, concurrency=${concurrency}`);

  const result = await processItemsInParallel(items, { supabase, concurrency });

  return {
    source,
    scrapedItems: items.length,
    itemsSkipped: result.skippedByFilter,
    articlesCreated: result.created,
    articlesUpdated: result.updated,
    articlesFused: result.fused,
    articlesNeedingReview: result.needingReview,
    errors: result.errors,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Process an array of scraped items in parallel with a fixed concurrency.
 * Returns aggregated totals. Exported so the backfill migration script can
 * reuse the same logic.
 */
export async function processItemsInParallel(
  items: ScrapedContent[],
  options: {
    supabase: SupabaseClient;
    concurrency?: number;
    onProgress?: (index: number, total: number, item: ScrapedContent, result: ProcessItemResult) => void;
  },
): Promise<{
  created: number;
  updated: number;
  fused: number;
  needingReview: number;
  skippedByFilter: number;
  errors: Array<{ identifier?: string; message: string }>;
}> {
  const { supabase, concurrency = DEFAULT_CONCURRENCY, onProgress } = options;

  const totals = {
    created: 0,
    updated: 0,
    fused: 0,
    needingReview: 0,
    skippedByFilter: 0,
    errors: [] as Array<{ identifier?: string; message: string }>,
  };

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      const item = items[idx];
      try {
        const r = await processScrapedItem(item, { supabase });
        totals.created += r.created;
        totals.updated += r.updated;
        totals.fused += r.fused;
        totals.needingReview += r.needingReview;
        totals.skippedByFilter += r.skippedByFilter;
        totals.errors.push(...r.errors);
        onProgress?.(idx, items.length, item, r);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        totals.errors.push({ identifier: item.sourceIdentifier, message });
        onProgress?.(idx, items.length, item, {
          created: 0, updated: 0, fused: 0, needingReview: 0, skippedByFilter: 0,
          errors: [{ identifier: item.sourceIdentifier, message }],
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return totals;
}

async function loadKnownIdentifiers(
  supabase: SupabaseClient,
  source: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('knowledge_scrape_log')
    .select('source_identifier')
    .eq('scrape_source', source)
    .in('status', ['completed', 'skipped']);

  if (error) {
    console.warn(`[pipeline] kon known identifiers niet laden: ${error.message}`);
    return new Set();
  }
  return new Set(
    (data ?? []).map((row) => row.source_identifier as string).filter(Boolean),
  );
}
