/**
 * Generate Embeddings for CTGB Products
 *
 * Usage: npx tsx scripts/generate-product-embeddings.ts [--limit N] [--batch N]
 *
 * Options:
 *   --limit N   Process max N products (default: all)
 *   --batch N   Batch size for processing (default: 10)
 *
 * Required env vars in .env.local:
 *   - GOOGLE_API_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  <-- IMPORTANT: Need service role for writes!
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { GoogleGenerativeAI } from '@google/generative-ai';
import { execSync } from 'child_process';

// ============================================
// Configuration
// ============================================

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_BATCH_SIZE = 10;
const RATE_LIMIT_DELAY_MS = 500;
const BATCH_DELAY_MS = 2000;
const MAX_RETRIES = 3;

// ============================================
// Initialize
// ============================================

const googleApiKey = process.env.GOOGLE_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!googleApiKey) {
  console.error('ERROR: GOOGLE_API_KEY not found in .env.local');
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found');
  console.error('');
  console.error('You need to add SUPABASE_SERVICE_ROLE_KEY to .env.local');
  console.error('Get it from: Supabase Dashboard > Project Settings > API > service_role key');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(googleApiKey);

// ============================================
// Types
// ============================================

interface CtgbProduct {
  id: string;
  toelatingsnummer: string;
  naam: string;
  werkzame_stoffen: string[] | null;
  gebruiksvoorschriften: any[] | null;
}

// ============================================
// Supabase REST API helpers (curl-based for Node v24 compatibility)
// ============================================

function supabaseGet(endpoint: string): any {
  const url = `${supabaseUrl}/rest/v1/${endpoint}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = execSync(
        `curl -s --connect-timeout 30 --max-time 60 "${url}" ` +
        `-H "apikey: ${supabaseServiceKey}" ` +
        `-H "Authorization: Bearer ${supabaseServiceKey}"`,
        { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      );

      // Sanitize control characters that can break JSON parsing
      const sanitized = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      return JSON.parse(sanitized);
    } catch (error: any) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Supabase GET failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
      console.log(`  Retry ${attempt}/${MAX_RETRIES}...`);
      sleep(2000);
    }
  }
}

function supabasePatch(table: string, id: string, data: Record<string, any>): boolean {
  const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
  const jsonData = JSON.stringify(data);

  // Write JSON to temp file to avoid shell escaping issues
  const tempFile = `/tmp/patch-data-${Date.now()}.json`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Write data to temp file
      require('fs').writeFileSync(tempFile, jsonData);

      const result = execSync(
        `curl -s --connect-timeout 30 --max-time 60 -w "\\n%{http_code}" -X PATCH "${url}" ` +
        `-H "apikey: ${supabaseServiceKey}" ` +
        `-H "Authorization: Bearer ${supabaseServiceKey}" ` +
        `-H "Content-Type: application/json" ` +
        `-H "Prefer: return=minimal" ` +
        `-d @${tempFile}`,
        { encoding: 'utf8' }
      );

      // Clean up temp file
      try { require('fs').unlinkSync(tempFile); } catch {}

      // Parse response - last line is HTTP status code
      const lines = result.trim().split('\n');
      const httpCode = lines[lines.length - 1];
      const body = lines.slice(0, -1).join('\n');

      if (httpCode === '204' || httpCode === '200') {
        return true;
      } else {
        if (attempt === MAX_RETRIES) {
          console.error(`  HTTP ${httpCode}: ${body}`);
          return false;
        }
      }
    } catch (error: any) {
      try { require('fs').unlinkSync(tempFile); } catch {}
      if (attempt === MAX_RETRIES) {
        console.error(`  Supabase PATCH failed: ${error.message}`);
        return false;
      }
      sleepSync(2000);
    }
  }
  return false;
}

function supabaseCount(table: string, filter?: string): number {
  const filterParam = filter ? `&${filter}` : '';
  const url = `${supabaseUrl}/rest/v1/${table}?select=count${filterParam}`;

  try {
    const result = execSync(
      `curl -s --connect-timeout 30 --max-time 60 "${url}" ` +
      `-H "apikey: ${supabaseServiceKey}" ` +
      `-H "Authorization: Bearer ${supabaseServiceKey}" ` +
      `-H "Prefer: count=exact"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    return parsed?.[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

// ============================================
// Helper functions
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms: number): void {
  execSync(`sleep ${ms / 1000}`);
}

/**
 * Create text representation of product for embedding
 */
function productToText(product: CtgbProduct): string {
  const parts: string[] = [];

  parts.push(`Product: ${product.naam}`);
  parts.push(`Toelatingsnummer: ${product.toelatingsnummer}`);

  if (product.werkzame_stoffen?.length) {
    parts.push(`Werkzame stoffen: ${product.werkzame_stoffen.join(', ')}`);
  }

  if (product.gebruiksvoorschriften?.length) {
    const crops = new Set<string>();
    const targets = new Set<string>();

    for (const v of product.gebruiksvoorschriften.slice(0, 10)) {
      if (v.gewas) crops.add(v.gewas);
      if (v.doelorganisme) targets.add(v.doelorganisme);
    }

    if (crops.size > 0) {
      parts.push(`Gewassen: ${Array.from(crops).slice(0, 5).join(', ')}`);
    }
    if (targets.size > 0) {
      parts.push(`Doelorganismen: ${Array.from(targets).slice(0, 5).join(', ')}`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate embedding for text using Google AI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// ============================================
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const batchIndex = args.indexOf('--batch');

  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : undefined;
  const batchSize = batchIndex !== -1 ? parseInt(args[batchIndex + 1], 10) : DEFAULT_BATCH_SIZE;

  console.log('===========================================');
  console.log('CTGB Product Embedding Generator');
  console.log('===========================================');
  console.log(`Model: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dimensions)`);
  console.log(`Batch size: ${batchSize}`);
  if (limit) console.log(`Limit: ${limit} products`);
  console.log('');

  // Check if embedding column exists by trying to select it
  console.log('Checking if embedding column exists...');
  try {
    const testResult = execSync(
      `curl -s --connect-timeout 10 --max-time 15 "${supabaseUrl}/rest/v1/ctgb_products?select=embedding&limit=1" ` +
      `-H "apikey: ${supabaseServiceKey}" ` +
      `-H "Authorization: Bearer ${supabaseServiceKey}"`,
      { encoding: 'utf8' }
    );

    if (testResult.includes('"code"') && testResult.includes('column')) {
      console.error('');
      console.error('ERROR: The "embedding" column does not exist on ctgb_products table!');
      console.error('');
      console.error('Please run the SQL migration first:');
      console.error('  1. Open Supabase Dashboard > SQL Editor');
      console.error('  2. Copy/paste contents of sql/add_embedding_column.sql');
      console.error('  3. Click "Run"');
      console.error('');
      process.exit(1);
    }
    console.log('Embedding column exists ✓');
    console.log('');
  } catch (error: any) {
    console.error('Warning: Could not verify embedding column:', error.message);
  }

  // Get products without embeddings
  console.log('Fetching products without embeddings...');

  const limitParam = limit ? `&limit=${limit}` : '';
  const endpoint = `ctgb_products?select=id,toelatingsnummer,naam,werkzame_stoffen,gebruiksvoorschriften&embedding=is.null&order=naam${limitParam}`;

  let products: CtgbProduct[];
  try {
    products = supabaseGet(endpoint);
  } catch (error: any) {
    console.error('Error fetching products:', error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('No products need embeddings. All done!');
    return;
  }

  console.log(`Found ${products.length} products to process.`);
  console.log('');

  // Process in batches
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(products.length / batchSize);

    console.log(`Batch ${batchNum}/${totalBatches}`);
    console.log('-'.repeat(40));

    for (const product of batch) {
      try {
        const text = productToText(product);
        const embedding = await generateEmbedding(text);

        if (embedding.length !== EMBEDDING_DIMENSIONS) {
          console.error(`  ${product.naam}: Wrong dimension (${embedding.length})`);
          failed++;
          continue;
        }

        // Update in database (vector as string format for Supabase)
        const success = supabasePatch('ctgb_products', product.id, {
          embedding: `[${embedding.join(',')}]`
        });

        if (success) {
          console.log(`  ✓ ${product.naam}`);
          succeeded++;
        } else {
          failed++;
        }

        processed++;
        await sleep(RATE_LIMIT_DELAY_MS);
      } catch (error: any) {
        console.error(`  ✗ ${product.naam}: ${error.message}`);
        failed++;
        processed++;

        if (error.message?.includes('429') || error.message?.includes('quota')) {
          console.log('  Rate limit hit, waiting 30 seconds...');
          await sleep(30000);
        }
      }
    }

    if (i + batchSize < products.length) {
      console.log(`\nWaiting ${BATCH_DELAY_MS}ms before next batch...\n`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Summary
  console.log('');
  console.log('===========================================');
  console.log('Summary');
  console.log('===========================================');
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);

  const totalWithEmbeddings = supabaseCount('ctgb_products', 'embedding=not.is.null');
  console.log(`Total products with embeddings: ${totalWithEmbeddings}`);
  console.log('');
  console.log('Done!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
