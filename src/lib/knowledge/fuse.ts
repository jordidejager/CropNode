/**
 * Knowledge fusion — detect and merge near-duplicate articles
 *
 * When a new article has cosine similarity > 0.90 with an existing article
 * (and matches category/subcategory/crops), we merge instead of inserting a duplicate.
 * Gemini does the actual merging via a fusion prompt.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ai } from '@/ai/genkit';
import {
  KnowledgeArticleDraftSchema,
  type KnowledgeArticleDraft,
} from './types';
import { vectorToPgLiteral } from './embed';

const FUSE_MODEL = 'googleai/gemini-2.5-flash-lite';
const FUSION_THRESHOLD = 0.9;

// ============================================
// DB row shape from find_fusion_candidate RPC
// ============================================

export interface FusionCandidate {
  id: string;
  title: string;
  content: string;
  summary: string;
  category: string;
  subcategory: string | null;
  knowledge_type: string;
  crops: string[];
  varieties: string[];
  season_phases: string[];
  relevant_months: number[];
  products_mentioned: string[];
  fusion_sources: number;
  similarity: number;
}

// ============================================
// Find candidate via RPC
// ============================================

export async function findFusionCandidate(params: {
  supabase: SupabaseClient;
  embedding: number[];
  category: string;
  subcategory?: string | null;
  crops: string[];
  threshold?: number;
}): Promise<FusionCandidate | null> {
  const { supabase, embedding, category, subcategory, crops, threshold } = params;

  // Retry on transient fetch failures
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.rpc('find_fusion_candidate', {
        query_embedding: vectorToPgLiteral(embedding),
        filter_category: category,
        filter_subcategory: subcategory ?? null,
        filter_crops: crops.length > 0 ? crops : null,
        similarity_threshold: threshold ?? FUSION_THRESHOLD,
      });

      if (error) {
        console.warn(`[fuse] find_fusion_candidate fout: ${error.message}`);
        return null;
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        return null;
      }

      const row = Array.isArray(data) ? data[0] : data;
      return row as FusionCandidate;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /fetch failed|ECONNRESET|ETIMEDOUT/i.test(message);
      if (attempt < maxAttempts && isTransient) {
        const delay = 800 * attempt;
        console.warn(`[fuse] transient (poging ${attempt}/${maxAttempts}), retry over ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      console.warn(`[fuse] find_fusion_candidate exception: ${message}`);
      return null;
    }
  }
  return null;
}

// ============================================
// Gemini fusion prompt
// ============================================

const FUSION_SYSTEM_PROMPT = `Je bent een kennisredacteur voor CropNode. Je krijgt twee artikelen over hetzelfde onderwerp.

TAAK: Combineer beide artikelen tot één compleet artikel dat:
1. Alle unieke informatie uit beide bronnen bevat (verlies geen feiten, doseringen, of producten)
2. Bij tegenstrijdigheden de meest specifieke / volledige informatie kiest
3. Geen duplicate-informatie bevat
4. De CropNode tone of voice behoudt: praktisch, direct, helder
5. Het standaard template volgt (inleiding → aanpak → middelen → timing → aandachtspunten)
6. Productnamen en doseringen EXACT overneemt — feitelijk

OUTPUT: één gefuseerd artikel als JSON object dat voldoet aan het kennisartikel-schema.
- title: beschrijvende titel
- content: gefuseerde tekst
- summary: bijgewerkte korte samenvatting
- alle metadata-velden ingevuld (category, subcategory, knowledge_type, crops, etc.)`;

const FuseOutputSchema = KnowledgeArticleDraftSchema;

export interface FuseResult {
  merged: KnowledgeArticleDraft;
}

/**
 * Fuse an existing article with a new draft via Gemini.
 */
export async function fuseArticles(
  existing: FusionCandidate,
  newDraft: KnowledgeArticleDraft,
): Promise<FuseResult> {
  const prompt = buildFusePrompt(existing, newDraft);

  const result = await callWithRetry(async () => {
    return ai.generate({
      model: FUSE_MODEL,
      system: FUSION_SYSTEM_PROMPT,
      prompt,
      output: {
        schema: FuseOutputSchema,
        format: 'json',
      },
      config: {
        temperature: 0.2,
      },
    });
  });

  const output = (result as { output?: unknown }).output;
  if (!output) {
    throw new Error('fuse: geen output van Gemini ontvangen');
  }
  const merged = FuseOutputSchema.parse(output);
  return { merged };
}

function buildFusePrompt(
  existing: FusionCandidate,
  newDraft: KnowledgeArticleDraft,
): string {
  return [
    'Combineer onderstaande twee artikelen tot één compleet kennisartikel.',
    '',
    '=== BESTAAND ARTIKEL (basis) ===',
    `Titel: ${existing.title}`,
    `Categorie: ${existing.category}${existing.subcategory ? ' / ' + existing.subcategory : ''}`,
    `Type: ${existing.knowledge_type}`,
    `Gewassen: ${existing.crops.join(', ')}`,
    `Producten: ${existing.products_mentioned.join(', ') || '(geen)'}`,
    '',
    'Samenvatting:',
    existing.summary,
    '',
    'Inhoud:',
    existing.content,
    '',
    '=== NIEUW ARTIKEL (toevoeging) ===',
    `Titel: ${newDraft.title}`,
    `Categorie: ${newDraft.category}${newDraft.subcategory ? ' / ' + newDraft.subcategory : ''}`,
    `Type: ${newDraft.knowledge_type}`,
    `Gewassen: ${newDraft.crops.join(', ')}`,
    `Producten: ${newDraft.products_mentioned.join(', ') || '(geen)'}`,
    '',
    'Samenvatting:',
    newDraft.summary,
    '',
    'Inhoud:',
    newDraft.content,
  ].join('\n');
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[fuse] Fout (poging ${attempt}/${maxAttempts}): ${message}. Wacht ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
