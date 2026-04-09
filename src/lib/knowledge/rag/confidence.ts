/**
 * Confidence checks — decide if the RAG pipeline can answer or must fall back
 *
 * Applied BEFORE the expensive grounded generation call. Saves tokens and
 * prevents hallucinations by rejecting weak retrievals early.
 */

import type { ConfidenceCheck, QueryIntent, RetrievedChunk } from './types';

const MIN_TOP_SIMILARITY = 0.70;
const MIN_CHUNK_COUNT = 1;

export function assessConfidence(
  intent: QueryIntent,
  chunks: RetrievedChunk[],
): ConfidenceCheck {
  // 1. Off-topic — never answer
  if (intent.topic === 'off_topic') {
    return {
      passes: false,
      topSimilarity: 0,
      reason: intent.reject_reason ?? 'Vraag valt buiten de kennisbank',
      fallbackMessage:
        'Deze vraag valt buiten onze kennisbank voor appel- en perenteelt. Raadpleeg een andere bron of herformuleer de vraag zodat hij specifiek over fruitteelt gaat.',
    };
  }

  // 2. No retrieved chunks
  if (chunks.length < MIN_CHUNK_COUNT) {
    return {
      passes: false,
      topSimilarity: 0,
      reason: 'Geen relevante artikelen gevonden',
      fallbackMessage:
        'Hier heb ik geen informatie over in onze kennisbank. Probeer de vraag anders te formuleren, of raadpleeg een adviseur.',
    };
  }

  const topSimilarity = Math.max(...chunks.map((c) => c.raw_similarity));

  // 3. Similarity too low
  if (topSimilarity < MIN_TOP_SIMILARITY) {
    return {
      passes: false,
      topSimilarity,
      reason: `Hoogste similarity ${topSimilarity.toFixed(2)} onder threshold ${MIN_TOP_SIMILARITY}`,
      fallbackMessage:
        'Ik vind wat gerelateerde informatie maar niet genoeg om met zekerheid een antwoord te geven. Kun je je vraag specifieker maken, of het onderwerp noemen (bv. welk ziekte, welk gewas, welke fase)?',
    };
  }

  // 4. Crop mismatch — retrieved chunks don't cover the requested crop
  if (intent.crops.length === 1) {
    const requestedCrop = intent.crops[0];
    const matchingChunks = chunks.filter((c) => c.crops?.includes(requestedCrop));
    if (matchingChunks.length === 0) {
      return {
        passes: false,
        topSimilarity,
        reason: `Geen artikelen gevonden die over ${requestedCrop} gaan`,
        fallbackMessage: `Ik heb geen specifieke informatie over ${requestedCrop} voor deze vraag. Mogelijk is het onderwerp alleen beschreven voor een ander gewas.`,
      };
    }
  }

  // Passes
  return {
    passes: true,
    topSimilarity,
    reason: null,
    fallbackMessage: null,
  };
}
