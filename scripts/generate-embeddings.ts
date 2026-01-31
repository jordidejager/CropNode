/**
 * Script: Generate Product Usage Embeddings (Normalized)
 * SDK: @google/generative-ai
 * Model: text-embedding-004
 * 
 * Target: product_usages table
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Initialize Supabase with Service Role Key for write access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Batch and Delay Settings
const DELAY_MS = 100;

/**
 * Main Execution Function
 */
async function main() {
  console.log('🚀 Starting Product Usage Embedding Generation (SDK)...');

  // 1. Fetch products from ctgb_products where gebruiksvoorschriften is not null
  console.log('📡 Fetching products from database...');
  const { data: products, error: fetchError } = await supabase
    .from('ctgb_products')
    .select('id, naam, gebruiksvoorschriften')
    .not('gebruiksvoorschriften', 'is', null);

  if (fetchError) {
    console.error('❌ Error fetching products:', fetchError.message);
    process.exit(1);
  }

  console.log(`📦 Found ${products.length} products to process.`);

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const product of products) {
    const voorschriften = product.gebruiksvoorschriften;
    if (!Array.isArray(voorschriften)) continue;

    console.log(`\n🔍 Processing product: ${product.naam} (${product.id})`);

    for (const item of voorschriften) {
      // Construct the standardized text chunk
      const opmerkingenStr = Array.isArray(item.opmerkingen)
        ? item.opmerkingen.join('. ')
        : (item.opmerkingen || 'geen');

      const textContent = `Gebruik in ${item.gewas || 'onbekend'} tegen ${item.doelorganisme || 'onbekend'}. Dosering: ${item.dosering || 'niet gespecificeerd'}. Opmerking: ${opmerkingenStr}.`;

      // 2. Check for idempotency (product_id + full_text_context)
      const { data: existing, error: checkError } = await supabase
        .from('product_usages')
        .select('id')
        .eq('product_id', product.id)
        .eq('full_text_context', textContent)
        .maybeSingle();

      if (checkError) {
        console.error(`   ⚠️ Error checking existence:`, checkError.message);
        continue;
      }

      if (existing) {
        totalSkipped++;
        // Silently skip if you want less noise, or log it
        // console.log(`   ⏭️ Skipping (already exists): ${item.gewas}`);
        continue;
      }

      try {
        // 3. Generate Embedding
        const result = await model.embedContent(textContent);
        const embedding = result.embedding.values;

        if (!embedding || embedding.length === 0) {
          throw new Error('Empty embedding received');
        }

        // 4. Insert into product_usages
        const { error: insertError } = await supabase
          .from('product_usages')
          .insert({
            product_id: product.id,
            crop_category: item.gewas || null,
            pest_category: item.doelorganisme || null,
            full_text_context: textContent,
            embedding: embedding // Supabase automatically handles array to vector if using pgvector
          });

        if (insertError) {
          console.error(`   ❌ Error inserting usage:`, insertError.message);
          totalErrors++;
        } else {
          console.log(`   ✅ Created usage for: ${item.gewas}`);
          totalCreated++;
        }

        // 5. Rate Limiting (100ms delay)
        await new Promise(r => setTimeout(r, DELAY_MS));

      } catch (err: any) {
        console.error(`   ❌ API Error generating embedding:`, err.message);
        totalErrors++;
        // Small additional delay on error
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.log('\n===========================================');
  console.log('✅ Generation Process Finished');
  console.log(`   New Usages Created: ${totalCreated}`);
  console.log(`   Usages Skipped: ${totalSkipped}`);
  console.log(`   Errors Encountered: ${totalErrors}`);
  console.log('===========================================\n');
}

main().catch(console.error);
