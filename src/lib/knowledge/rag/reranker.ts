/**
 * Re-ranker — cross-encoder style pass on the top candidates.
 *
 * Retrieval gives ~20-80 candidates, ranking trims to ~6. Ranking uses
 * cosine similarity + metadata boosts, which is a decent proxy but not
 * great at distinguishing "topically related" from "actually answers the
 * question". A quick Gemini pass that scores each candidate 0-1 against
 * the specific question lifts precision on the top-3 a lot.
 *
 * We only run this when the top similarity is borderline (below 0.80) —
 * high-confidence cases don't benefit enough to justify the extra call.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { RetrievedChunk } from './types';

const RERANKER_MODEL = 'googleai/gemini-2.5-flash-lite';

const RERANK_SCHEMA = z.object({
  scores: z.array(
    z.object({
      idx: z.number(),
      score: z.number().min(0).max(1),
    }),
  ),
});

const RERANKER_SYSTEM = `Je beoordeelt hoe goed een kennisartikel een specifieke teeltvraag beantwoordt.

Geef voor elk artikel een score tussen 0 en 1:
- 1.0 = bevat het directe antwoord (product, dosering, timing, of verklaring)
- 0.7 = zeer relevant maar niet volledig
- 0.4 = topic-gerelateerd, geeft context maar geen antwoord
- 0.0 = niet relevant voor deze vraag

BEOORDEEL OP:
- Heeft het de specifieke entiteiten (gewas, ziekte, product) uit de vraag?
- Beantwoordt het het type vraag (wat/wanneer/hoeveel/hoe)?
- Is het seizoen/fase relevant voor de huidige periode?

Geef alleen het JSON-object terug.`;

export interface RerankInput {
  query: string;
  chunks: RetrievedChunk[];
  /** Current phenological phase for seasonal relevance (optional hint) */
  phaseHint?: string;
  /** Threshold — below this raw similarity we run the reranker */
  minSimilarityForRerank?: number;
  /** How many top-N to keep after reranking */
  keep?: number;
}

/**
 * Returns a new array sorted by rerank score. If the input already has
 * strong confidence (top similarity >= minSimilarityForRerank) the input
 * is returned unchanged — rerank is skipped to save latency.
 */
export async function rerankChunks(input: RerankInput): Promise<RetrievedChunk[]> {
  const {
    query,
    chunks,
    phaseHint,
    minSimilarityForRerank = 0.80,
    keep = 6,
  } = input;

  if (chunks.length <= 1) return chunks;

  const topSim = Math.max(...chunks.map((c) => c.raw_similarity));
  if (topSim >= minSimilarityForRerank) return chunks.slice(0, keep);

  // Limit inputs to keep prompt bounded
  const batch = chunks.slice(0, 10);

  const summaries = batch
    .map((c, i) => {
      const meta = [
        c.category,
        c.subcategory,
        c.crops.length > 0 ? c.crops.join('+') : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const snippet = (c.summary || c.content).slice(0, 400).replace(/\s+/g, ' ');
      return `[${i}] (${meta}) ${c.title}\n${snippet}`;
    })
    .join('\n\n');

  const userPrompt = `Vraag: ${query}${phaseHint ? `\nHuidige fase: ${phaseHint}` : ''}

Artikelen:
${summaries}

Scoor alle ${batch.length} artikelen.`;

  try {
    const result = await ai.generate({
      model: RERANKER_MODEL,
      system: RERANKER_SYSTEM,
      prompt: userPrompt,
      output: { schema: RERANK_SCHEMA, format: 'json' },
      config: { temperature: 0.0, maxOutputTokens: 512 },
    });

    const parsed = (result as { output?: z.infer<typeof RERANK_SCHEMA> }).output;
    if (!parsed?.scores) return chunks.slice(0, keep);

    const scoreByIdx = new Map(parsed.scores.map((s) => [s.idx, s.score]));
    const rescored = batch
      .map((c, i) => ({ chunk: c, score: scoreByIdx.get(i) ?? 0 }))
      .filter((x) => x.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .map(({ chunk, score }) => ({
        ...chunk,
        // Persist reranker score so downstream can display/use it
        similarity: Math.max(chunk.similarity, score),
      }));

    // Fall back to original order if rerank rejected everything
    if (rescored.length === 0) return chunks.slice(0, keep);
    return rescored.slice(0, keep);
  } catch (err) {
    console.warn('[reranker] fout, val terug op retriever-volgorde:', err);
    return chunks.slice(0, keep);
  }
}
