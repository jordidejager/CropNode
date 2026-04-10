/**
 * RAG Chat Pipeline — orchestrator
 *
 * Wires all stages together: intent → retrieval → confidence → generation → CTGB.
 * Yields RagEvent objects so the API route can forward them as server-sent events.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { extractQueryIntent } from './query-understanding';
import { retrieveChunks } from './retriever';
import { assessConfidence } from './confidence';
import { resolveProductAliases } from './ctgb-postprocessor';
import { generateGroundedAnswer } from './grounded-generator';
import { runKnowledgeAgent } from './knowledge-agent';
import { extractProductMentions, lookupCtgbStatus } from './ctgb-postprocessor';
import { getCurrentPhenology } from '../phenology-service';
import {
  lookupProductAdvice,
  lookupDiseaseProfile,
  lookupProductRelations,
  formatStructuredContext,
} from './structured-lookup';
import type { RagContext, RagEvent, RetrievedChunk } from './types';

export interface RunChatPipelineOptions {
  supabase: SupabaseClient;
  query: string;
}

/**
 * Retry wrapper for transient network errors (fetch failed, 503, etc.)
 * This prevents "TypeError: fetch failed" from ever reaching the user.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|UND_ERR|503|UNAVAILABLE/i.test(message);
      if (attempt < maxAttempts && isTransient) {
        const delay = baseDelayMs * attempt;
        console.warn(`[rag/${label}] transient (${attempt}/${maxAttempts}): ${message}. Retry ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Run the chat pipeline. Returns an async generator that yields events as
 * each stage completes, ending with `{ type: 'done' }`.
 */
export async function* runChatPipeline(
  options: RunChatPipelineOptions,
): AsyncGenerator<RagEvent> {
  const { supabase, query } = options;

  try {
    // 1. Understanding
    yield { type: 'understanding_start', query };
    const intent = await withRetry('understanding', () => extractQueryIntent(query));
    yield { type: 'understanding_done', intent };

    // 2. Build RAG context (phenology + today)
    const phenology = await withRetry('phenology', () => getCurrentPhenology(supabase));
    const context: RagContext = {
      intent,
      currentMonth: phenology.month,
      currentPhaseDetail: phenology.phenologicalPhase,
      currentPhaseBase: phenology.seasonPhase,
      today: phenology.today,
    };

    // 3. Retrieval (v2: metadata pre-filter + in-memory cosine similarity)
    yield { type: 'retrieval_start' };
    let chunks: RetrievedChunk[] = [];
    let productAliases: Record<string, string> = {};
    if (intent.topic !== 'off_topic') {
      // Resolve product aliases for the generator prompt (Pyrus → Scala)
      if (intent.products.length > 0) {
        try {
          const resolved = await withRetry('alias-resolve', () =>
            resolveProductAliases(supabase, intent.products)
          );
          for (let i = 0; i < intent.products.length; i++) {
            if (resolved[i] && resolved[i].toLowerCase() !== intent.products[i].toLowerCase()) {
              productAliases[intent.products[i]] = resolved[i];
            }
          }
          if (Object.keys(productAliases).length > 0) {
            console.log('[pipeline] Product aliassen:', JSON.stringify(productAliases));
            // Replace with canonical names for retrieval
            intent.products = Array.from(new Set(resolved.filter(Boolean)));
          }
        } catch (err) {
          console.warn('[pipeline] Alias resolution failed:', err);
        }
      }

      // Retrieve — the new retriever handles everything internally
      // (metadata pre-filter + in-memory cosine + product overlaps)
      try {
        chunks = await withRetry('retrieval', () => retrieveChunks({
          supabase,
          query,
          intent,
          context,
        }));
      } catch (err) {
        console.warn('[pipeline] Retriever failed:', err);
        chunks = [];
      }
    }
    // 3b. Structured lookups (parallel met het einde van retrieval)
    let structuredContext: string | null = null;
    try {
      const structuredPromises: Promise<any>[] = [];

      // Disease/pest profile lookup
      const subjects = intent.specific_subjects.length > 0
        ? intent.specific_subjects
        : (intent.topic === 'ziekte' || intent.topic === 'plaag') && chunks.length > 0
          ? [chunks[0].subcategory].filter(Boolean) as string[]
          : [];
      const diseasePromise = subjects.length > 0
        ? lookupDiseaseProfile(supabase, subjects[0])
        : Promise.resolve(null);
      structuredPromises.push(diseasePromise);

      // Product advice lookup
      const canonicalProducts = Object.values(productAliases).length > 0
        ? Object.values(productAliases)
        : intent.products;
      const advicePromise = (subjects.length > 0 || canonicalProducts.length > 0)
        ? lookupProductAdvice(supabase, {
            target: subjects[0] ?? undefined,
            product: canonicalProducts[0] ?? undefined,
            crop: intent.crops.length === 1 ? intent.crops[0] : undefined,
          })
        : Promise.resolve([]);
      structuredPromises.push(advicePromise);

      // Product relations
      const relationsPromise = canonicalProducts.length > 0
        ? lookupProductRelations(supabase, canonicalProducts[0])
        : Promise.resolve([]);
      structuredPromises.push(relationsPromise);

      const [diseaseProfile, productAdvice, productRelations] = await Promise.all(structuredPromises);

      structuredContext = formatStructuredContext({
        diseaseProfile: diseaseProfile ?? undefined,
        productAdvice: productAdvice ?? undefined,
        productRelations: productRelations ?? undefined,
      });

      if (structuredContext) {
        console.log(`[pipeline] Structured context: ${structuredContext.length} chars (disease=${!!diseaseProfile}, advice=${(productAdvice??[]).length} rows, relations=${(productRelations??[]).length})`);
      }
    } catch (err) {
      console.warn('[pipeline] Structured lookup failed (non-fatal):', err);
    }

    const topSimilarity = chunks.length > 0
      ? Math.max(...chunks.map((c) => c.raw_similarity))
      : 0;
    yield { type: 'retrieval_done', chunks, topSimilarity };

    // 4. Confidence check
    const confidence = assessConfidence(intent, chunks);
    const hasStructuredData = !!structuredContext && structuredContext.length > 50;

    let fullText = '';

    if (!confidence.passes && !hasStructuredData) {
      // No chunks AND no structured data → genuinely can't answer
      yield { type: 'confidence_fail', check: confidence };
      yield { type: 'generation_start' };

      // Last resort: try the agent with tools (it can query the DB itself)
      try {
        console.log('[pipeline] Confidence fail + no structured data → agent fallback');
        const agentResult = await withRetry('agent-fallback', () =>
          runKnowledgeAgent({
            supabase,
            query,
            intent,
            context,
            productAliases,
          })
        );
        if (agentResult.fullText && agentResult.fullText.length > 20) {
          fullText = agentResult.fullText;
          yield { type: 'answer_chunk', text: fullText };
          yield { type: 'generation_done', fullText };
          // Extract sources from agent tool calls for the UI
          const agentChunks = extractChunksFromToolCalls(agentResult.toolCalls);
          if (agentChunks.length > 0) {
            chunks = agentChunks;
          }
        } else {
          yield {
            type: 'answer_chunk',
            text: confidence.fallbackMessage ?? 'Ik heb hier geen informatie over.',
          };
          yield {
            type: 'generation_done',
            fullText: confidence.fallbackMessage ?? 'Ik heb hier geen informatie over.',
          };
          yield { type: 'done' };
          return;
        }
      } catch (agentErr) {
        console.warn('[pipeline] Agent fallback failed:', agentErr);
        yield {
          type: 'answer_chunk',
          text: confidence.fallbackMessage ?? 'Ik heb hier geen informatie over.',
        };
        yield {
          type: 'generation_done',
          fullText: confidence.fallbackMessage ?? 'Ik heb hier geen informatie over.',
        };
        yield { type: 'done' };
        return;
      }
    } else {
      // 5. Normal generation (with chunks + structured context)
      // Use agent if chunks are weak but structured data is strong
      const useAgent = !confidence.passes && hasStructuredData;
      yield { type: 'generation_start' };

      if (useAgent) {
        console.log('[pipeline] Confidence fail maar structured data beschikbaar → agent met tools');
        const agentResult = await withRetry('agent-structured', () =>
          runKnowledgeAgent({
            supabase,
            query,
            intent,
            context,
            preRetrievedChunks: chunks,
            productAliases,
          })
        );
        fullText = agentResult.fullText;
        yield { type: 'answer_chunk', text: fullText };
        yield { type: 'generation_done', fullText };
      } else {
        // Standard grounded generation (best path — good chunks + structured context)
        const genResult = await withRetry('generation', () =>
          generateGroundedAnswer({
            query,
            intent: { crops: intent.crops, topic: intent.topic, products: intent.products },
            context,
            chunks,
            productAliases,
            structuredContext,
          })
        );
        fullText = genResult.fullText;
        for await (const chunk of genResult.stream) {
          if (chunk) yield { type: 'answer_chunk', text: chunk };
        }
        yield { type: 'generation_done', fullText };
      }
    }

    // 6. CTGB post-processing
    if (fullText) {
      const knownProducts = chunks.flatMap((c) => c.products_mentioned ?? []);
      const mentions = extractProductMentions(fullText, knownProducts);
      if (mentions.length > 0) {
        const annotations = await withRetry('ctgb', () => lookupCtgbStatus(supabase, mentions));
        yield { type: 'ctgb_annotation', annotations };
      }
    }

    // 7. Sources (trimmed for UI display)
    yield {
      type: 'sources',
      chunks: chunks.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        subcategory: c.subcategory,
        image_urls: c.image_urls ?? [],
      })),
    };

    yield { type: 'done' };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error('[rag pipeline] error:', rawMessage);
    const isTransient = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|UND_ERR|503/i.test(rawMessage);
    const userMessage = isTransient
      ? 'Er is een tijdelijk verbindingsprobleem opgetreden. Probeer het opnieuw.'
      : rawMessage;
    yield { type: 'error', message: userMessage };
    yield { type: 'done' };
  }
}

/**
 * Extract pseudo-chunks from agent tool call results for source attribution.
 */
function extractChunksFromToolCalls(
  toolCalls: Array<{ tool: string; input: unknown; output: unknown }>,
): RetrievedChunk[] {
  const chunks: RetrievedChunk[] = [];
  for (const call of toolCalls) {
    if (call.tool === 'searchKnowledgeBase' && call.output) {
      const out = call.output as { articles?: Array<{ title: string; summary: string; content: string; category: string; subcategory: string | null; products_mentioned: string[] }> };
      for (const a of out.articles ?? []) {
        chunks.push({
          id: '',
          title: a.title,
          summary: a.summary,
          content: a.content,
          category: a.category,
          subcategory: a.subcategory,
          knowledge_type: '',
          crops: [],
          season_phases: [],
          relevant_months: [],
          products_mentioned: a.products_mentioned ?? [],
          image_urls: [],
          fusion_sources: 1,
          similarity: 0.8,
          raw_similarity: 0.8,
        });
      }
    }
  }
  return chunks;
}
