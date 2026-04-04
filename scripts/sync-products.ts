/**
 * sync-products.ts — Unified Product Sync Wrapper
 *
 * Syncs CTGB products from MST API, then updates the unified products table.
 * Also updates product_aliases_unified from new products.
 *
 * Usage:
 *   npx tsx scripts/sync-products.ts                  # Sync all
 *   npx tsx scripts/sync-products.ts --source=ctgb    # Only CTGB
 *   npx tsx scripts/sync-products.ts --dry-run        # Preview only
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'all';

interface SyncStats {
  productsAdded: number;
  productsUpdated: number;
  productsWithdrawn: number;
  aliasesAdded: number;
  errors: Array<{ message: string; productId?: string }>;
}

async function syncUnifiedFromCtgb(stats: SyncStats): Promise<void> {
  console.log('\n📦 Syncing unified products table from ctgb_products...');

  // Fetch all CTGB products
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('ctgb_products')
      .select('toelatingsnummer, naam, product_types, status, search_keywords')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`  Found ${all.length} CTGB products`);

  // Map product_types to unified product_type
  const mapProductType = (types: string[]): string => {
    if (!types || types.length === 0) return 'gewasbescherming';
    const first = types[0];
    return first.toLowerCase();
  };

  // Upsert in batches
  const batchSize = 100;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    const rows = batch.map(cp => ({
      name: cp.naam,
      product_type: mapProductType(cp.product_types),
      source: 'ctgb' as const,
      source_id: cp.toelatingsnummer,
      status: cp.status === 'Valid' ? 'active' : 'expired',
      search_keywords: cp.search_keywords || [],
      updated_at: new Date().toISOString(),
    }));

    if (!isDryRun) {
      const { error, count } = await supabase
        .from('products')
        .upsert(rows, { onConflict: 'source,source_id' });

      if (error) {
        stats.errors.push({ message: `CTGB batch ${i}: ${error.message}` });
      } else {
        stats.productsUpdated += batch.length;
      }
    }
  }

  // Mark products not in CTGB anymore as withdrawn
  const { data: existingProducts } = await supabase
    .from('products')
    .select('source_id')
    .eq('source', 'ctgb')
    .eq('status', 'active');

  if (existingProducts) {
    const ctgbIds = new Set(all.map(cp => cp.toelatingsnummer));
    const toWithdraw = existingProducts.filter(p => !ctgbIds.has(p.source_id));

    if (toWithdraw.length > 0) {
      console.log(`  ⚠️  ${toWithdraw.length} products to mark as withdrawn`);
      if (!isDryRun) {
        for (const p of toWithdraw) {
          await supabase
            .from('products')
            .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
            .eq('source', 'ctgb')
            .eq('source_id', p.source_id);
          stats.productsWithdrawn++;
        }
      }
    }
  }

  console.log(`  ✅ CTGB sync: ${stats.productsUpdated} updated, ${stats.productsWithdrawn} withdrawn`);
}

async function syncUnifiedFromFertilizers(stats: SyncStats): Promise<void> {
  console.log('\n🌿 Syncing unified products table from fertilizers...');

  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('fertilizers')
      .select('id, name, category, search_keywords')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`  Found ${all.length} fertilizer products`);

  const mapCategory = (cat: string): string => {
    switch (cat) {
      case 'Leaf': return 'bladmeststof';
      case 'Soil': return 'strooimeststof';
      case 'Fertigation': return 'fertigatiemeststof';
      default: return 'meststof';
    }
  };

  const batchSize = 100;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    const rows = batch.map(f => ({
      name: f.name,
      product_type: mapCategory(f.category),
      source: 'fertilizer' as const,
      source_id: f.id,
      status: 'active' as const,
      search_keywords: f.search_keywords || [],
      updated_at: new Date().toISOString(),
    }));

    if (!isDryRun) {
      const { error } = await supabase
        .from('products')
        .upsert(rows, { onConflict: 'source,source_id' });

      if (error) {
        stats.errors.push({ message: `Fertilizer batch ${i}: ${error.message}` });
      } else {
        stats.productsUpdated += batch.length;
      }
    }
  }

  console.log(`  ✅ Fertilizer sync: ${all.length} processed`);
}

async function main() {
  console.log('🔄 CropNode Product Sync');
  console.log(`   Source: ${sourceArg}`);
  console.log(`   Dry run: ${isDryRun}`);
  console.log(`   Time: ${new Date().toISOString()}`);

  // Create sync log
  let syncLogId: string | null = null;
  if (!isDryRun) {
    const { data } = await supabase
      .from('sync_log')
      .insert({
        source: sourceArg,
        started_at: new Date().toISOString(),
        status: 'running',
        triggered_by: 'manual',
      })
      .select('id')
      .single();
    syncLogId = data?.id || null;
  }

  const stats: SyncStats = {
    productsAdded: 0,
    productsUpdated: 0,
    productsWithdrawn: 0,
    aliasesAdded: 0,
    errors: [],
  };

  try {
    if (sourceArg === 'ctgb' || sourceArg === 'all') {
      await syncUnifiedFromCtgb(stats);
    }

    if (sourceArg === 'fertilizer' || sourceArg === 'all') {
      await syncUnifiedFromFertilizers(stats);
    }

    // Update sync log
    if (syncLogId && !isDryRun) {
      await supabase
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: stats.errors.length > 0 ? 'partial' : 'success',
          products_added: stats.productsAdded,
          products_updated: stats.productsUpdated,
          products_withdrawn: stats.productsWithdrawn,
          aliases_added: stats.aliasesAdded,
          errors: stats.errors,
          summary: `Synced ${stats.productsUpdated} products. ${stats.errors.length} errors.`,
        })
        .eq('id', syncLogId);
    }

    console.log('\n📊 Sync Summary:');
    console.log(`   Added: ${stats.productsAdded}`);
    console.log(`   Updated: ${stats.productsUpdated}`);
    console.log(`   Withdrawn: ${stats.productsWithdrawn}`);
    console.log(`   Errors: ${stats.errors.length}`);
    if (stats.errors.length > 0) {
      stats.errors.forEach(e => console.error(`   ❌ ${e.message}`));
    }
  } catch (err: any) {
    console.error('Fatal sync error:', err.message);
    if (syncLogId) {
      await supabase
        .from('sync_log')
        .update({
          completed_at: new Date().toISOString(),
          status: 'failed',
          errors: [{ message: err.message }],
        })
        .eq('id', syncLogId);
    }
    process.exit(1);
  }
}

main();
