/**
 * API Route: Generate CTGB Embeddings
 *
 * POST /api/generate-embeddings?limit=N
 *
 * Generates embeddings for CTGB products using Google AI
 * and stores them in Supabase.
 *
 * Fase 2.6.1: Defensive Validation - This endpoint should handle errors gracefully
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { supabase } from '@/lib/supabase';
import { ai } from '@/ai/genkit';
import { safeParseInt } from '@/lib/api-utils';

const EMBEDDING_MODEL = 'googleai/text-embedding-004';
const INSERT_BATCH_SIZE = 5;
const context = 'Generate Embeddings API';

interface CtgbProduct {
  toelatingsnummer: string;
  naam: string;
  werkzame_stoffen: string[];
  gebruiksvoorschriften: Gebruiksvoorschrift[];
}

interface Gebruiksvoorschrift {
  gewas?: string;
  doelorganisme?: string;
  dosering?: string;
  maxToepassingen?: number;
  veiligheidstermijn?: string;
  interval?: string;
  locatie?: string;
  toepassingsmethode?: string;
  werking?: string[];
  opmerkingen?: string[];
  wCodes?: string[];
}

function voorschriftToText(product: CtgbProduct, voorschrift: Gebruiksvoorschrift): string {
  const parts: string[] = [];
  parts.push(`Product: ${product.naam}`);
  if (product.werkzame_stoffen?.length) {
    parts.push(`Werkzame stoffen: ${product.werkzame_stoffen.join(', ')}`);
  }
  if (voorschrift.gewas) parts.push(`Gewas: ${voorschrift.gewas}`);
  if (voorschrift.doelorganisme) parts.push(`Doelorganisme: ${voorschrift.doelorganisme}`);
  if (voorschrift.dosering) parts.push(`Dosering: ${voorschrift.dosering}`);
  if (voorschrift.maxToepassingen) parts.push(`Maximum toepassingen: ${voorschrift.maxToepassingen}`);
  if (voorschrift.veiligheidstermijn) parts.push(`Veiligheidstermijn (VGT): ${voorschrift.veiligheidstermijn}`);
  if (voorschrift.interval) parts.push(`Interval: ${voorschrift.interval}`);
  if (voorschrift.locatie) parts.push(`Locatie: ${voorschrift.locatie}`);
  if (voorschrift.toepassingsmethode) parts.push(`Toepassingsmethode: ${voorschrift.toepassingsmethode}`);
  if (voorschrift.werking?.length) parts.push(`Werking: ${voorschrift.werking.join(', ')}`);
  if (voorschrift.opmerkingen?.length) parts.push(`Opmerkingen: ${voorschrift.opmerkingen.join('. ')}`);
  if (voorschrift.wCodes?.length) parts.push(`W-codes: ${voorschrift.wCodes.join(', ')}`);
  return parts.join('\n');
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ai.embed({
    embedder: EMBEDDING_MODEL,
    content: text,
  });
  // Genkit returns [{ embedding: number[] }]
  if (Array.isArray(response) && response[0]?.embedding) {
    return response[0].embedding;
  }
  return response as unknown as number[];
}

export async function POST(request: NextRequest) {
  // Auth check: prevent unauthenticated access to embedding generation
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = safeParseInt(searchParams.get('limit'), 10);
  const clear = searchParams.get('clear') === 'true';

  const results: string[] = [];
  let totalGenerated = 0;
  let errors = 0;

  console.log(`[${context}] Starting embedding generation with limit=${limit}, clear=${clear}`);

  try {
    // Clear if requested
    if (clear) {
      results.push('Clearing existing embeddings...');
      const { error } = await supabase
        .from('ctgb_regulation_embeddings')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        results.push(`Clear error: ${error.message}`);
      } else {
        results.push('Embeddings cleared.');
      }
    }

    // Get existing products with embeddings
    const { data: existingProducts } = await supabase
      .from('ctgb_regulation_embeddings')
      .select('product_toelatingsnummer');

    const existingSet = new Set(
      existingProducts?.map((p: any) => p.product_toelatingsnummer) || []
    );

    results.push(`Existing embeddings for ${existingSet.size} products.`);

    // Fetch products
    const { data: products, error: fetchError } = await supabase
      .from('ctgb_products')
      .select('toelatingsnummer, naam, werkzame_stoffen, gebruiksvoorschriften')
      .not('gebruiksvoorschriften', 'is', null)
      .limit(limit);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message, results }, { status: 500 });
    }

    results.push(`Fetched ${products?.length || 0} products.`);

    // Filter new products
    const productsToProcess = (products || []).filter(
      (p: any) => !existingSet.has(p.toelatingsnummer)
    );

    results.push(`Processing ${productsToProcess.length} new products.`);

    // Process each product
    for (const product of productsToProcess) {
      const voorschriften = product.gebruiksvoorschriften || [];
      if (voorschriften.length === 0) continue;

      results.push(`Processing ${product.naam}: ${voorschriften.length} voorschriften`);

      const embeddings: any[] = [];

      for (const voorschrift of voorschriften) {
        const content = voorschriftToText(product, voorschrift);

        try {
          const embedding = await generateEmbedding(content);

          embeddings.push({
            product_toelatingsnummer: product.toelatingsnummer,
            product_naam: product.naam,
            content,
            content_type: 'gebruiksvoorschrift',
            gewas: voorschrift.gewas || null,
            doelorganisme: voorschrift.doelorganisme || null,
            dosering: voorschrift.dosering || null,
            veiligheidstermijn: voorschrift.veiligheidstermijn || null,
            max_toepassingen: voorschrift.maxToepassingen || null,
            locatie: voorschrift.locatie || null,
            interval: voorschrift.interval || null,
            embedding: `[${embedding.join(',')}]`,
          });

          totalGenerated++;

          // Small delay for rate limiting
          await new Promise(r => setTimeout(r, 100));
        } catch (err: any) {
          results.push(`  Embedding error: ${err?.message || err}`);
          errors++;
        }
      }

      // Insert in batches
      for (let j = 0; j < embeddings.length; j += INSERT_BATCH_SIZE) {
        const batch = embeddings.slice(j, j + INSERT_BATCH_SIZE);
        const { error: insertError } = await supabase
          .from('ctgb_regulation_embeddings')
          .insert(batch);

        if (insertError) {
          results.push(`  Insert error: ${insertError.message}`);
          errors += batch.length;
        }
      }

      results.push(`  Inserted ${embeddings.length} embeddings.`);
    }

    // Final count
    const { count } = await supabase
      .from('ctgb_regulation_embeddings')
      .select('*', { count: 'exact', head: true });

    console.log(`[${context}] Completed: ${totalGenerated} generated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      totalGenerated,
      errors,
      totalInDb: count,
      results,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error(`[${context}] Error:`, errorMessage);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      totalGenerated,
      errors,
      results,
    }, { status: 500 });
  }
}

export async function GET() {
  // Auth check
  const supabaseAuthGet = await createServerClient();
  const { data: { user: getUser } } = await supabaseAuthGet.auth.getUser();
  if (!getUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[${context}] GET stats request`);

  try {
    const { count, error: embError } = await supabase
      .from('ctgb_regulation_embeddings')
      .select('*', { count: 'exact', head: true });

    const { count: productCount, error: prodError } = await supabase
      .from('ctgb_products')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      embeddingsCount: count || 0,
      productsCount: productCount || 0,
      embError: embError?.message,
      prodError: prodError?.message,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error(`[${context}] GET error:`, errorMessage);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      embeddingsCount: 0,
      productsCount: 0,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    }, { status: 500 });
  }
}
