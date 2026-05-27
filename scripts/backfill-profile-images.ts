#!/usr/bin/env tsx
/**
 * Backfill image_urls op knowledge_disease_profile + knowledge_product_profile
 * vanuit gelinkte knowledge_articles.image_urls.
 *
 * Strategie:
 *   - Disease profile: pak image_urls van alle gepubliceerde artikelen
 *     waarvan subcategory ilike "%name%" OF één van de aliases bevat.
 *   - Product profile: pak image_urls van alle artikelen die het product
 *     noemen in products_mentioned.
 *
 * Dedup, dan top-12 per profiel (voorkomt overdaad in UI).
 *
 * Gebruik:
 *   npx tsx scripts/backfill-profile-images.ts                # alle profielen
 *   npx tsx scripts/backfill-profile-images.ts --diseases     # alleen ziekten
 *   npx tsx scripts/backfill-profile-images.ts --products     # alleen middelen
 *   npx tsx scripts/backfill-profile-images.ts --dry-run      # geen DB writes
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const MAX_IMAGES_PER_PROFILE = 12;

interface CliArgs {
  diseases: boolean;
  products: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { diseases: false, products: false, dryRun: false };
  for (const a of argv) {
    if (a === '--diseases') out.diseases = true;
    else if (a === '--products') out.products = true;
    else if (a === '--dry-run' || a === '--dry') out.dryRun = true;
  }
  // Default: doe beide
  if (!out.diseases && !out.products) {
    out.diseases = true;
    out.products = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('\n🖼️  Backfill profile images');
  console.log(`   diseases:  ${args.diseases}`);
  console.log(`   products:  ${args.products}`);
  console.log(`   dry-run:   ${args.dryRun}\n`);

  if (args.diseases) await backfillDiseases(args.dryRun);
  if (args.products) await backfillProducts(args.dryRun);
}

// ============================================
// Disease profiles
// ============================================

async function backfillDiseases(dryRun: boolean) {
  console.log('📚 Disease profiles:');
  const { data: profiles, error } = await supabase
    .from('knowledge_disease_profile')
    .select('id, name, aliases');
  if (error) throw new Error(`Profile fetch: ${error.message}`);
  if (!profiles || profiles.length === 0) {
    console.log('   (geen profielen)\n');
    return;
  }

  let updated = 0;
  let unchanged = 0;
  for (const p of profiles as Array<{ id: string; name: string; aliases: string[] }>) {
    const searchTerms = [p.name, ...(p.aliases ?? [])].filter(Boolean);
    const images = await collectArticleImagesByTerms(searchTerms);
    if (images.length === 0) {
      unchanged++;
      continue;
    }
    if (dryRun) {
      console.log(`   ${p.name.padEnd(30)} → ${images.length} foto's`);
      updated++;
      continue;
    }
    const { error: upErr } = await supabase
      .from('knowledge_disease_profile')
      .update({ image_urls: images })
      .eq('id', p.id);
    if (upErr) {
      console.warn(`   ❌ ${p.name}: ${upErr.message}`);
      continue;
    }
    console.log(`   ✅ ${p.name.padEnd(30)} → ${images.length} foto's`);
    updated++;
  }

  console.log(`\n   Bijgewerkt: ${updated}, ongewijzigd (geen foto's): ${unchanged}\n`);
}

async function collectArticleImagesByTerms(terms: string[]): Promise<string[]> {
  const seen = new Set<string>();
  for (const term of terms.slice(0, 5)) {
    // Match in subcategory OR title (ilike — case-insensitive)
    const { data } = await supabase
      .from('knowledge_articles')
      .select('image_urls')
      .eq('status', 'published')
      .or(`subcategory.ilike.%${term}%,title.ilike.%${term}%`)
      .limit(60);
    if (!data) continue;
    for (const row of data as Array<{ image_urls: string[] | null }>) {
      for (const url of row.image_urls ?? []) {
        if (url && !seen.has(url)) seen.add(url);
        if (seen.size >= MAX_IMAGES_PER_PROFILE) return Array.from(seen);
      }
    }
  }
  return Array.from(seen);
}

// ============================================
// Product profiles
// ============================================

async function backfillProducts(dryRun: boolean) {
  console.log('💊 Product profiles:');
  const { data: profiles, error } = await supabase
    .from('knowledge_product_profile')
    .select('id, product_name, aliases');
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      console.log('   (knowledge_product_profile bestaat nog niet — draai migratie 080 eerst)\n');
      return;
    }
    throw new Error(`Profile fetch: ${error.message}`);
  }
  if (!profiles || profiles.length === 0) {
    console.log('   (geen profielen — draai eerst extract-product-profiles.ts)\n');
    return;
  }

  let updated = 0;
  let unchanged = 0;
  for (const p of profiles as Array<{ id: string; product_name: string; aliases: string[] }>) {
    const searchTerms = [p.product_name, ...(p.aliases ?? [])].filter(Boolean);
    const images = await collectArticleImagesByProduct(searchTerms);
    if (images.length === 0) {
      unchanged++;
      continue;
    }
    if (dryRun) {
      console.log(`   ${p.product_name.padEnd(30)} → ${images.length} foto's`);
      updated++;
      continue;
    }
    const { error: upErr } = await supabase
      .from('knowledge_product_profile')
      .update({ image_urls: images })
      .eq('id', p.id);
    if (upErr) {
      console.warn(`   ❌ ${p.product_name}: ${upErr.message}`);
      continue;
    }
    console.log(`   ✅ ${p.product_name.padEnd(30)} → ${images.length} foto's`);
    updated++;
  }

  console.log(`\n   Bijgewerkt: ${updated}, ongewijzigd: ${unchanged}\n`);
}

async function collectArticleImagesByProduct(productNames: string[]): Promise<string[]> {
  const seen = new Set<string>();
  for (const name of productNames.slice(0, 5)) {
    const { data } = await supabase
      .from('knowledge_articles')
      .select('image_urls')
      .eq('status', 'published')
      .contains('products_mentioned', [name])
      .limit(60);
    if (!data) continue;
    for (const row of data as Array<{ image_urls: string[] | null }>) {
      for (const url of row.image_urls ?? []) {
        if (url && !seen.has(url)) seen.add(url);
        if (seen.size >= MAX_IMAGES_PER_PROFILE) return Array.from(seen);
      }
    }
  }
  return Array.from(seen);
}

main().catch((err) => {
  console.error('\n💥 Backfill fout:', err);
  process.exit(1);
});
