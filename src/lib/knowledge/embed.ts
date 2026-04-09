/**
 * Embedding wrapper — gemini-embedding-001 with 768-dim output
 *
 * Note: text-embedding-004 is deprecated by Google. The new model is
 * gemini-embedding-001, which defaults to 3072 dimensions but can be
 * configured to 768 (or 1536) via outputDimensionality. We use 768 to
 * match the existing pgvector(768) schema.
 *
 * The bestaande CTGB embeddings route (src/app/api/generate-embeddings/route.ts)
 * still references the old model name and will need a similar update — out of
 * scope for this RAG pipeline task.
 */

import { ai } from '@/ai/genkit';
import type { KnowledgeArticleDraft } from './types';

export const EMBEDDING_MODEL = 'googleai/gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Generate an embedding for a string. Returns a number array of length 768.
 */
export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('embed: lege input string');
  }
  const response = await ai.embed({
    embedder: EMBEDDING_MODEL,
    content: trimmed,
    options: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  // Genkit returns [{ embedding: number[] }] for single inputs
  if (Array.isArray(response) && response[0]?.embedding) {
    return response[0].embedding;
  }
  // Older shapes
  if (Array.isArray(response)) {
    return response as unknown as number[];
  }
  throw new Error('embed: onbekende response van Gemini embedder');
}

/**
 * Build the embedding input from a draft article.
 * Combines title + summary + content for the richest semantic representation.
 */
export function buildEmbeddingInput(draft: KnowledgeArticleDraft): string {
  return [draft.title, draft.summary, draft.content].filter(Boolean).join('\n\n');
}

/**
 * Convenience: embed a draft article. Returns the vector.
 */
export async function embedDraft(draft: KnowledgeArticleDraft): Promise<number[]> {
  const input = buildEmbeddingInput(draft);
  return embedText(input);
}

/**
 * Format a number array as a pgvector literal: "[0.1, 0.2, ...]".
 * Required when inserting via Supabase REST as the array would otherwise become
 * a Postgres array (not a vector).
 */
export function vectorToPgLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
