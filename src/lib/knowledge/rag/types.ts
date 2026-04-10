/**
 * RAG Chatbot — shared types
 *
 * The grounded-generation pipeline runs as a stateful, streaming flow.
 * These types describe the data shape at each stage.
 */

import { z } from 'zod';

// ============================================
// Query understanding
// ============================================

export const QueryIntentSchema = z.object({
  /** High-level topic the user is asking about */
  topic: z.enum([
    'ziekte',
    'plaag',
    'bemesting',
    'snoei',
    'dunning',
    'bewaring',
    'rassenkeuze',
    'teelttechniek',
    'middel_advies',
    'wetgeving',
    'algemeen',
    'off_topic',
  ]),
  /** Crops mentioned or implied in the query */
  crops: z.array(z.string()).default([]),
  /** Specific diseases, pests, or issues */
  specific_subjects: z.array(z.string()).default([]),
  /** Varieties (Conference, Elstar, Jonagold, etc.) */
  varieties: z.array(z.string()).default([]),
  /** Products mentioned in the question */
  products: z.array(z.string()).default([]),
  /** Does the user ask about timing? (when? wanneer?) */
  timing_question: z.boolean().default(false),
  /** Does the user ask about dosage? */
  dosage_question: z.boolean().default(false),
  /** Confidence of the intent extractor in its own output */
  extractor_confidence: z.number().min(0).max(1),
  /** Reason for off_topic rejection, if applicable */
  reject_reason: z.string().nullable().optional(),
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;

// ============================================
// RAG context (enriched with current state)
// ============================================

export interface RagContext {
  intent: QueryIntent;
  /** Current month 1-12 */
  currentMonth: number;
  /** Detail-rich phase (e.g. "volle-bloei/bestuiving") */
  currentPhaseDetail: string;
  /** DB enum phase (rust | knopstadium | bloei | ...) */
  currentPhaseBase: string | null;
  /** Current date ISO */
  today: string;
}

// ============================================
// Retrieved chunks from knowledge_articles
// ============================================

export interface RetrievedChunk {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  subcategory: string | null;
  knowledge_type: string;
  crops: string[];
  season_phases: string[];
  relevant_months: number[];
  products_mentioned: string[];
  image_urls: string[];
  fusion_sources: number;
  /** Cosine similarity after month/phase boost */
  similarity: number;
  /** Raw similarity from the RPC */
  raw_similarity: number;
}

// ============================================
// Confidence check result
// ============================================

export interface ConfidenceCheck {
  passes: boolean;
  /** Highest similarity across retrieved chunks */
  topSimilarity: number;
  /** Why the check failed (if it did) */
  reason: string | null;
  /** Recommended fallback message to show the user */
  fallbackMessage: string | null;
}

// ============================================
// CTGB post-processing
// ============================================

export interface CtgbAnnotation {
  product: string;
  status: 'toegelaten' | 'vervallen' | 'onbekend' | 'twijfel';
  toelatingsnummer: string | null;
  vervaldatum: string | null;
  matched_name: string | null;
  note: string | null;
}

// ============================================
// Chat session / message shapes
// ============================================

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  retrieved_article_ids: string[];
  retrieval_scores: number[];
  detected_intent: QueryIntent | null;
  confidence_score: number | null;
  used_fallback: boolean;
  ctgb_annotations: CtgbAnnotation[] | null;
  feedback: number | null;
  created_at: string;
}

// ============================================
// Streaming pipeline events
// ============================================

export type RagEvent =
  | { type: 'understanding_start'; query: string }
  | { type: 'understanding_done'; intent: QueryIntent }
  | { type: 'retrieval_start' }
  | { type: 'retrieval_done'; chunks: RetrievedChunk[]; topSimilarity: number }
  | { type: 'confidence_fail'; check: ConfidenceCheck }
  | { type: 'generation_start' }
  | { type: 'answer_chunk'; text: string }
  | { type: 'generation_done'; fullText: string }
  | { type: 'ctgb_annotation'; annotations: CtgbAnnotation[] }
  | { type: 'sources'; chunks: Pick<RetrievedChunk, 'id' | 'title' | 'category' | 'subcategory'>[] }
  | { type: 'error'; message: string }
  | { type: 'done' };
