#!/usr/bin/env npx tsx
/**
 * Deduplicate KB Products Script
 *
 * Finds and removes duplicate records in kb_products based on
 * (topic_id, product_name, applies_to). Keeps the most complete record
 * (prefers records with dosage > without, timing > without).
 *
 * Usage:
 *   npx tsx scripts/deduplicate-kb-products.ts          # Dry run
 *   npx tsx scripts/deduplicate-kb-products.ts --execute # Actually delete
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: {
    fetch: async (url: any, init: any) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await fetch(url, init);
        } catch (e: any) {
          if (attempt < 4 && (e.code === 'ECONNRESET' || e.message?.includes('fetch failed'))) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          throw e;
        }
      }
      throw new Error('Max retries exceeded');
    },
  },
});
const execute = process.argv.includes('--execute');

interface KbProduct {
  id: string;
  topic_id: string;
  product_name: string;
  active_substance: string | null;
  product_type: string | null;
  application_type: string | null;
  applies_to: string[];
  dosage: string | null;
  timing: string | null;
  remarks: string | null;
}

function scoreCompleteness(p: KbProduct): number {
  let score = 0;
  if (p.dosage && p.dosage.trim()) score += 4;
  if (p.timing && p.timing.trim()) score += 3;
  if (p.active_substance && p.active_substance.trim()) score += 2;
  if (p.remarks && p.remarks.trim()) score += 1;
  if (p.product_type && p.product_type.trim()) score += 1;
  if (p.application_type && p.application_type.trim()) score += 1;
  return score;
}

async function main() {
  console.log('=== KB Products Deduplicatie ===');
  console.log(`Mode: ${execute ? '🔴 EXECUTE (deletes!)' : '🟢 DRY RUN'}\n`);

  // Fetch all kb_products
  const { data: products, error } = await supabase
    .from('kb_products')
    .select('*')
    .order('topic_id')
    .order('product_name');

  if (error) {
    console.error('Error fetching kb_products:', error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('No products found in kb_products.');
    return;
  }

  console.log(`Totaal kb_products: ${products.length}\n`);

  // Group by (topic_id, product_name, applies_to_sorted)
  const groups = new Map<string, KbProduct[]>();

  for (const p of products) {
    const appliesKey = (p.applies_to || []).sort().join(',');
    const key = `${p.topic_id}|${(p.product_name || '').toLowerCase().trim()}|${appliesKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // Find duplicates
  const duplicateGroups = Array.from(groups.entries()).filter(([, items]) => items.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('✅ Geen duplicaten gevonden!');
    return;
  }

  console.log(`Gevonden: ${duplicateGroups.length} groepen met duplicaten\n`);

  let totalToDelete = 0;
  const idsToDelete: string[] = [];

  for (const [key, items] of duplicateGroups) {
    // Sort by completeness score (highest first)
    items.sort((a, b) => scoreCompleteness(b) - scoreCompleteness(a));
    const keep = items[0];
    const remove = items.slice(1);

    console.log(`📋 "${keep.product_name}" (${(keep.applies_to || []).join(', ')})`);
    console.log(`   Behouden: id=${keep.id.slice(0, 8)}... score=${scoreCompleteness(keep)} dosage="${keep.dosage || '-'}" timing="${keep.timing || '-'}"`);
    for (const r of remove) {
      console.log(`   Verwijder: id=${r.id.slice(0, 8)}... score=${scoreCompleteness(r)} dosage="${r.dosage || '-'}" timing="${r.timing || '-'}"`);
      idsToDelete.push(r.id);
    }
    totalToDelete += remove.length;
  }

  console.log(`\nTotaal te verwijderen: ${totalToDelete} records`);

  if (execute && idsToDelete.length > 0) {
    console.log('\n🔴 Verwijderen...');
    // Delete in batches of 50
    for (let i = 0; i < idsToDelete.length; i += 50) {
      const batch = idsToDelete.slice(i, i + 50);
      const { error: delError } = await supabase
        .from('kb_products')
        .delete()
        .in('id', batch);

      if (delError) {
        console.error(`Error deleting batch ${i}: ${delError.message}`);
      } else {
        console.log(`   Batch ${Math.floor(i / 50) + 1}: ${batch.length} verwijderd`);
      }
    }
    console.log(`\n✅ ${totalToDelete} duplicaten verwijderd.`);
  } else if (!execute) {
    console.log('\n💡 Voer uit met --execute om daadwerkelijk te verwijderen.');
  }
}

main().catch(console.error);
