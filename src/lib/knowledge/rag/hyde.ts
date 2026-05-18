/**
 * HyDE — Hypothetical Document Embeddings.
 *
 * Idea: a user's question and the answer-paragraph in the knowledge base
 * occupy different regions of embedding space ("wanneer schurft spuiten?" vs
 * "Scala 0.6 L/ha in het groen-puntje stadium, curatief tot 72 uur..."). By
 * having Gemini draft a short hypothetical answer FIRST and embedding THAT,
 * we land much closer to the actual ground-truth chunks.
 *
 * This is a lightweight +1 extra LLM call (~300ms, ~200 tokens) that lifts
 * recall on open-ended questions noticeably. We only invoke it when the
 * question is long/open enough to benefit — short keyword queries stay in
 * the original fast path.
 */

import { ai } from '@/ai/genkit';
import type { QueryIntent } from './types';

const HYDE_MODEL = 'googleai/gemini-2.5-flash-lite';

const HYDE_SYSTEM = `Je schrijft korte hypothetische antwoorden op teeltvragen van Nederlandse appel/peer telers.

DOEL: jouw antwoord wordt NIET aan de gebruiker getoond — het wordt alleen gebruikt om via semantic search de juiste artikelen te vinden.

REGELS:
- Max 80 woorden
- Schrijf in NL, concreet, als een ervaren adviseur
- Noem PLAUSIBELE productnamen, doseringen, fenologische fases
- Verzin niet — geef gewoon de meest waarschijnlijke beantwoording
- Geen verontschuldigingen of disclaimers, direct het antwoord`;

/**
 * Decide if a query benefits from HyDE. Short keyword queries get worse with
 * HyDE because the generated answer drifts away from the intent.
 */
export function shouldUseHyde(query: string, intent: QueryIntent): boolean {
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount < 4) return false;
  if (intent.topic === 'off_topic') return false;
  // "Alternatieven voor X" — these benefit MOST from HyDE because the
  // raw query mentions X but the answer needs to cover NOT-X products.
  if (/\b(alternatief|alternatieven|vervangers?|in plaats van|zonder)\b/i.test(query)) return true;
  // Questions with "wanneer/hoe/waarom/welke" benefit most
  if (/\b(wanneer|hoe|waarom|welke|wat\s+doe|mag ik|kan ik)\b/i.test(query)) return true;
  // Open-ended teelttechniek questions
  if (intent.topic === 'teelttechniek' || intent.topic === 'algemeen') return true;
  return wordCount >= 7;
}

export interface HydeResult {
  /** Hypothetical answer text (to be embedded) */
  text: string;
  /** True if HyDE actually ran; false if skipped/failed */
  used: boolean;
}

/**
 * Generate a hypothetical answer for the given query. Falls back to the raw
 * query on failure so retrieval always proceeds.
 */
export async function generateHydeText(
  query: string,
  intent: QueryIntent,
): Promise<HydeResult> {
  if (!shouldUseHyde(query, intent)) {
    return { text: query, used: false };
  }

  const intentHints = [
    intent.crops.length > 0 ? `Gewas: ${intent.crops.join(', ')}` : null,
    intent.specific_subjects.length > 0 ? `Onderwerp: ${intent.specific_subjects.join(', ')}` : null,
    intent.products.length > 0 ? `Product: ${intent.products.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const userPrompt = intentHints
    ? `${intentHints}\n\nVraag: ${query}\n\nGeef een kort, concreet antwoord.`
    : `Vraag: ${query}\n\nGeef een kort, concreet antwoord.`;

  try {
    const result = await ai.generate({
      model: HYDE_MODEL,
      system: HYDE_SYSTEM,
      prompt: userPrompt,
      config: { temperature: 0.3, maxOutputTokens: 200 },
    });
    const text = (result as { text?: string }).text?.trim() ?? '';
    if (text.length < 20) return { text: query, used: false };
    // Combine HyDE text with original query — keeps keyword signal while
    // adding semantic richness.
    return { text: `${query}\n\n${text}`, used: true };
  } catch (err) {
    console.warn('[hyde] generation failed:', err);
    return { text: query, used: false };
  }
}
