/**
 * In-memory cosine similarity — replaces pgvector's <=> operator.
 *
 * pgvector RPC calls timeout on our Supabase free tier with 2000+ rows.
 * Instead, we fetch candidate articles via fast metadata queries, then
 * compute similarity in TypeScript. This is actually how many production
 * RAG systems work — metadata pre-filter + in-memory re-ranking.
 */

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Parse a pgvector string literal "[0.1,0.2,...]" back to a number array.
 */
export function parseVectorLiteral(vectorStr: string): number[] {
  if (!vectorStr || typeof vectorStr !== 'string') return [];
  const cleaned = vectorStr.replace(/^\[/, '').replace(/\]$/, '');
  return cleaned.split(',').map(Number).filter((n) => !isNaN(n));
}

/**
 * Rank items by cosine similarity to a query vector.
 * Returns items sorted by descending similarity, filtered by threshold.
 */
export function rankBySimilarity<T extends { embedding: number[] | string | null }>(
  items: T[],
  queryEmbedding: number[],
  threshold = 0.70,
): Array<T & { similarity: number }> {
  return items
    .map((item) => {
      const vec =
        typeof item.embedding === 'string'
          ? parseVectorLiteral(item.embedding)
          : item.embedding ?? [];

      const similarity = vec.length === queryEmbedding.length
        ? cosineSimilarity(queryEmbedding, vec)
        : 0;

      return { ...item, similarity };
    })
    .filter((item) => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}
