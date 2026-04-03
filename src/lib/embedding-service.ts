/**
 * Embedding Service for CTGB RAG
 *
 * Generates embeddings for CTGB gebruiksvoorschriften using Google AI.
 * These embeddings enable semantic search over regulation content.
 */

import { ai } from '@/ai/genkit';
import { supabase } from './supabase';
import type { CtgbProduct, CtgbGebruiksvoorschrift } from './types';

// Google's text-embedding-004 produces 768-dimensional vectors
const EMBEDDING_MODEL = 'googleai/text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;

// Batch size for processing (to avoid rate limits)
const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 1000;

export interface RegulationEmbedding {
  productToelatingsnummer: string;
  productNaam: string;
  content: string;
  contentType: string;
  gewas?: string;
  doelorganisme?: string;
  dosering?: string;
  veiligheidstermijn?: string;
  maxToepassingen?: number;
  locatie?: string;
  interval?: string;
  embedding: number[];
}

/**
 * Convert a gebruiksvoorschrift to a text string suitable for embedding
 */
export function voorschriftToText(
  product: CtgbProduct,
  voorschrift: CtgbGebruiksvoorschrift
): string {
  const parts: string[] = [];

  // Product context
  parts.push(`Product: ${product.naam}`);
  if (product.werkzameStoffen?.length) {
    parts.push(`Werkzame stoffen: ${product.werkzameStoffen.join(', ')}`);
  }

  // Voorschrift details
  if (voorschrift.gewas) {
    parts.push(`Gewas: ${voorschrift.gewas}`);
  }
  if (voorschrift.doelorganisme) {
    parts.push(`Doelorganisme: ${voorschrift.doelorganisme}`);
  }
  if (voorschrift.dosering) {
    parts.push(`Dosering: ${voorschrift.dosering}`);
  }
  if (voorschrift.maxToepassingen) {
    parts.push(`Maximum toepassingen: ${voorschrift.maxToepassingen}`);
  }
  if (voorschrift.veiligheidstermijn) {
    parts.push(`Veiligheidstermijn (VGT): ${voorschrift.veiligheidstermijn}`);
  }
  if (voorschrift.interval) {
    parts.push(`Interval: ${voorschrift.interval}`);
  }
  if (voorschrift.locatie) {
    parts.push(`Locatie: ${voorschrift.locatie}`);
  }
  if (voorschrift.toepassingsmethode) {
    parts.push(`Toepassingsmethode: ${voorschrift.toepassingsmethode}`);
  }
  if ((voorschrift as any).werking?.length) {
    parts.push(`Werking: ${(voorschrift as any).werking.join(', ')}`);
  }
  if (voorschrift.opmerkingen?.length) {
    parts.push(`Opmerkingen: ${voorschrift.opmerkingen.join('. ')}`);
  }
  if (voorschrift.wCodes?.length) {
    parts.push(`W-codes (waterbescherming): ${voorschrift.wCodes.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Generate embedding for a single text using Google AI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ai.embed({
      embedder: EMBEDDING_MODEL,
      content: text,
    });

    // Genkit returns [{ embedding: number[] }], we need just the array
    if (Array.isArray(response) && response[0]?.embedding) {
      return response[0].embedding;
    }
    // Fallback for if the API changes
    return response as unknown as number[];
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }

  return embeddings;
}

/**
 * Store a regulation embedding in Supabase
 */
export async function storeRegulationEmbedding(
  embedding: RegulationEmbedding
): Promise<void> {
  const { error } = await supabase
    .from('ctgb_regulation_embeddings')
    .insert({
      product_toelatingsnummer: embedding.productToelatingsnummer,
      product_naam: embedding.productNaam,
      content: embedding.content,
      content_type: embedding.contentType,
      gewas: embedding.gewas,
      doelorganisme: embedding.doelorganisme,
      dosering: embedding.dosering,
      veiligheidstermijn: embedding.veiligheidstermijn,
      max_toepassingen: embedding.maxToepassingen,
      locatie: embedding.locatie,
      interval: embedding.interval,
      embedding: `[${embedding.embedding.join(',')}]`,
    });

  if (error) {
    console.error('Error storing embedding:', error);
    throw error;
  }
}

/**
 * Store multiple regulation embeddings in batch
 */
export async function storeRegulationEmbeddings(
  embeddings: RegulationEmbedding[]
): Promise<void> {
  const records = embeddings.map((e) => ({
    product_toelatingsnummer: e.productToelatingsnummer,
    product_naam: e.productNaam,
    content: e.content,
    content_type: e.contentType,
    gewas: e.gewas,
    doelorganisme: e.doelorganisme,
    dosering: e.dosering,
    veiligheidstermijn: e.veiligheidstermijn,
    max_toepassingen: e.maxToepassingen,
    locatie: e.locatie,
    interval: e.interval,
    embedding: `[${e.embedding.join(',')}]`,
  }));

  const { error } = await supabase
    .from('ctgb_regulation_embeddings')
    .insert(records);

  if (error) {
    console.error('Error storing embeddings batch:', error);
    throw error;
  }
}

/**
 * Process a single CTGB product and generate embeddings for all its voorschriften
 */
export async function processProduct(
  product: CtgbProduct
): Promise<RegulationEmbedding[]> {
  const results: RegulationEmbedding[] = [];

  if (!product.gebruiksvoorschriften?.length) {
    return results;
  }

  for (const voorschrift of product.gebruiksvoorschriften) {
    const content = voorschriftToText(product, voorschrift);

    try {
      const embedding = await generateEmbedding(content);

      results.push({
        productToelatingsnummer: product.toelatingsnummer,
        productNaam: product.naam,
        content,
        contentType: 'gebruiksvoorschrift',
        gewas: voorschrift.gewas,
        doelorganisme: voorschrift.doelorganisme,
        dosering: voorschrift.dosering,
        veiligheidstermijn: voorschrift.veiligheidstermijn,
        maxToepassingen: voorschrift.maxToepassingen,
        locatie: voorschrift.locatie,
        interval: voorschrift.interval,
        embedding,
      });
    } catch (error) {
      console.error(
        `Error processing voorschrift for ${product.naam}:`,
        error
      );
    }
  }

  return results;
}

/**
 * Search regulations using semantic similarity
 */
export async function searchRegulations(
  query: string,
  options: {
    threshold?: number;
    limit?: number;
    filterGewas?: string;
    filterProduct?: string;
  } = {}
): Promise<{
  id: string;
  productToelatingsnummer: string;
  productNaam: string;
  content: string;
  gewas: string | null;
  doelorganisme: string | null;
  dosering: string | null;
  veiligheidstermijn: string | null;
  maxToepassingen: number | null;
  similarity: number;
}[]> {
  const { threshold = 0.5, limit = 10, filterGewas, filterProduct } = options;

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Call the match_regulations function in Supabase
  const { data, error } = await supabase.rpc('match_regulations', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_threshold: threshold,
    match_count: limit,
    filter_gewas: filterGewas || null,
    filter_product: filterProduct || null,
  });

  if (error) {
    console.error('Error searching regulations:', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    productToelatingsnummer: row.product_toelatingsnummer,
    productNaam: row.product_naam,
    content: row.content,
    gewas: row.gewas,
    doelorganisme: row.doelorganisme,
    dosering: row.dosering,
    veiligheidstermijn: row.veiligheidstermijn,
    maxToepassingen: row.max_toepassingen,
    similarity: row.similarity,
  }));
}

/**
 * Get embedding stats
 */
export async function getEmbeddingStats(): Promise<{
  totalEmbeddings: number;
  uniqueProducts: number;
  lastUpdated: string | null;
}> {
  const { count: totalCount } = await supabase
    .from('ctgb_regulation_embeddings')
    .select('*', { count: 'exact', head: true });

  const { data: productData } = await supabase
    .from('ctgb_regulation_embeddings')
    .select('product_toelatingsnummer')
    .limit(10000);

  const uniqueProducts = new Set(
    productData?.map((r: any) => r.product_toelatingsnummer) || []
  ).size;

  const { data: lastUpdatedData } = await supabase
    .from('ctgb_regulation_embeddings')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  return {
    totalEmbeddings: totalCount || 0,
    uniqueProducts,
    lastUpdated: lastUpdatedData?.updated_at || null,
  };
}

/**
 * Delete all embeddings for a product
 */
export async function deleteProductEmbeddings(
  toelatingsnummer: string
): Promise<void> {
  const { error } = await supabase
    .from('ctgb_regulation_embeddings')
    .delete()
    .eq('product_toelatingsnummer', toelatingsnummer);

  if (error) {
    console.error('Error deleting embeddings:', error);
    throw error;
  }
}

/**
 * Clear all embeddings (use with caution!)
 */
export async function clearAllEmbeddings(): Promise<void> {
  const { error } = await supabase
    .from('ctgb_regulation_embeddings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (error) {
    console.error('Error clearing embeddings:', error);
    throw error;
  }
}
