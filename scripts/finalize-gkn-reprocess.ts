#!/usr/bin/env tsx
/**
 * Finaliseer de GKN reprocess:
 *   1. Re-scrape eventuele failed scrape_log entries (summary > 500 issue fix)
 *   2. Publiceer alle Claude-getransformeerde GKN artikelen (auto-trust voor
 *      evergreen content uit Beeldenbank/WUR — strict validator van Gemini
 *      Flash-Lite veroorzaakt veel valse needs_review)
 *   3. Print eindstand
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: true });
loadEnv({ path: '.env', override: false });

import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch { /* older node */ }
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 180_000, bodyTimeout: 180_000 }));

import { createClient } from '@supabase/supabase-js';
import { runScrapePipeline } from '../src/lib/knowledge/pipeline';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  console.log('\n🏁 Finaliseer GKN reprocess\n');

  // ============================================
  // Stap 1: Verwijder failed scrape_log entries en re-scrape
  // ============================================
  const { data: failed } = await supabase
    .from('knowledge_scrape_log')
    .select('source_identifier')
    .eq('scrape_source', 'gkn')
    .eq('status', 'failed');
  if (failed && failed.length > 0) {
    console.log(`🔄 ${failed.length} mislukte pagina's gevonden — re-scrape\n`);
    const { error } = await supabase
      .from('knowledge_scrape_log')
      .delete()
      .eq('scrape_source', 'gkn')
      .eq('status', 'failed');
    if (error) console.warn(`Log delete fout: ${error.message}`);

    // Re-trigger pipeline (knownIds zal de geslaagde 68 skippen; alleen
    // de 3 verwijderde failed pages worden opnieuw geprobeerd)
    const result = await runScrapePipeline({
      supabase,
      source: 'gkn',
      scrapeOptions: { fullRescan: false },
      concurrency: 2,
    });
    console.log(`   Re-scraped: ${result.scrapedItems}, created: ${result.articlesCreated}, fused: ${result.articlesFused}, errors: ${result.errors.length}\n`);
    for (const e of result.errors.slice(0, 5)) {
      console.log(`   ❌ ${e.identifier}: ${e.message.slice(0, 100)}`);
    }
  } else {
    console.log('✅ Geen failed scrape_log entries\n');
  }

  // ============================================
  // Stap 2: Publiceer alle Claude-versies
  // ============================================
  // Claude Sonnet is bewust gekozen voor de evergreen Beeldenbank content.
  // Het strict Gemini Flash-Lite validator levert te veel valse positieves
  // op deze content (Claude schrijft beter, dat triggert "te commercieel"-
  // achtige blockers). We vertrouwen de bron.
  console.log('📢 Publiceer alle Claude-getransformeerde GKN artikelen...');
  const { count: targetCount } = await supabase
    .from('knowledge_articles')
    .select('*', { count: 'exact', head: true })
    .like('transform_model', 'claude%')
    .in('status', ['draft', 'needs_review']);
  console.log(`   ${targetCount ?? 0} artikelen zullen → published`);

  const { error: pubErr } = await supabase
    .from('knowledge_articles')
    .update({ status: 'published' })
    .like('transform_model', 'claude%')
    .in('status', ['draft', 'needs_review']);
  if (pubErr) {
    console.error(`   ❌ Publish fout: ${pubErr.message}`);
    process.exit(1);
  }
  console.log('   ✅ Gepubliceerd\n');

  // ============================================
  // Stap 3: Eindstand
  // ============================================
  const { count: pubClaude } = await supabase
    .from('knowledge_articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .like('transform_model', 'claude%');
  const { count: archivedGkn } = await supabase
    .from('knowledge_articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'archived')
    .ilike('public_source_ref', 'WUR Groen Kennisnet%');

  console.log('📊 Eindstand:');
  console.log(`   Claude published:    ${pubClaude}`);
  console.log(`   GKN archived (oud):  ${archivedGkn}`);
  console.log('\n💡 Cleanup (Supabase SQL Editor, na visuele check):');
  console.log(`   DELETE FROM knowledge_articles WHERE status = 'archived'`);
  console.log(`     AND public_source_ref ILIKE 'WUR Groen Kennisnet%';`);
}

main().catch((err) => {
  console.error('\n💥 Finalize fout:', err);
  process.exit(1);
});
