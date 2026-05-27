#!/usr/bin/env tsx
/**
 * Reprocess alle GKN/Beeldenbank artikelen met Claude Sonnet.
 *
 * Strategie (zonder destructieve operaties):
 *   1. Archive bestaande gkn-* artikelen (status='archived') — niet meer
 *      zichtbaar in retrieval, maar nog wel beschikbaar als rollback-bron.
 *   2. Verwijder scrape_log entries voor source='gkn' zodat de pipeline
 *      ze als "nieuw" behandelt.
 *   3. Draai runScrapePipeline('gkn', { fullRescan: true }). De transform
 *      stap kiest automatisch Claude (zie defaultProviderForSource).
 *
 * Achteraf: status='archived' rows handmatig verwijderen als de
 * nieuwe Claude-versies goed zijn (snelle SQL DELETE in Supabase Editor).
 *
 * Gebruik:
 *   npx tsx scripts/reprocess-gkn.ts                # alle 71
 *   npx tsx scripts/reprocess-gkn.ts --limit 5      # eerst klein testen
 *   npx tsx scripts/reprocess-gkn.ts --dry-run      # geen DB writes, geen scrape
 */

import { config as loadEnv } from 'dotenv';
// `override: true` zodat lege strings die de shell heeft gezet (bv. via
// een rc-file) worden vervangen door de écht ingevulde waarden uit .env.local.
loadEnv({ path: '.env.local', override: true });
loadEnv({ path: '.env', override: false });

import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch { /* older node */ }
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({
  connect: { timeout: 60_000 },
  headersTimeout: 180_000,
  bodyTimeout: 180_000,
}));

import { createClient } from '@supabase/supabase-js';
import { runScrapePipeline } from '../src/lib/knowledge/pipeline';

interface CliArgs {
  limit: number | null;
  dryRun: boolean;
  skipArchive: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { limit: null, dryRun: false, skipArchive: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10) || null;
    else if (a === '--limit') out.limit = parseInt(argv[++i] ?? '', 10) || null;
    else if (a === '--dry-run' || a === '--dry') out.dryRun = true;
    else if (a === '--skip-archive') out.skipArchive = true;
  }
  return out;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials ontbreken (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('\n🔄 GKN/Beeldenbank reprocess met Claude Sonnet');
  console.log(`   limit:         ${args.limit ?? 'alle'}`);
  console.log(`   skip-archive:  ${args.skipArchive}`);
  console.log(`   dry-run:       ${args.dryRun}\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY ontbreekt in .env.local — kan Claude niet aanroepen.');
    console.error('   Zet de key (https://console.anthropic.com/) en draai opnieuw.');
    process.exit(1);
  }

  const supabase = getServiceClient();

  // ============================================
  // Stap 1: Inventariseer
  // ============================================

  const { count: existingCount } = await supabase
    .from('knowledge_articles')
    .select('*', { count: 'exact', head: true })
    .ilike('public_source_ref', 'WUR Groen Kennisnet%')
    .neq('status', 'archived');

  const { count: logCount } = await supabase
    .from('knowledge_scrape_log')
    .select('*', { count: 'exact', head: true })
    .eq('scrape_source', 'gkn');

  console.log(`📊 Huidige stand:`);
  console.log(`   gkn-artikelen (actief):   ${existingCount ?? 0}`);
  console.log(`   gkn scrape_log entries:   ${logCount ?? 0}\n`);

  if (args.dryRun) {
    console.log('Dry-run: zou nu archive + scrape_log clear + pipeline draaien.\n');
    return;
  }

  // ============================================
  // Stap 2: Archive oude gkn rows
  // ============================================

  if (!args.skipArchive) {
    console.log('📦 Archive oude gkn-artikelen...');
    const { error: archiveErr, count: archivedCount } = await supabase
      .from('knowledge_articles')
      .update({ status: 'archived' }, { count: 'exact' })
      .ilike('public_source_ref', 'WUR Groen Kennisnet%')
      .neq('status', 'archived');
    if (archiveErr) {
      console.error(`❌ Archive fout: ${archiveErr.message}`);
      process.exit(1);
    }
    console.log(`   ✅ ${archivedCount ?? 0} artikelen op status=archived gezet\n`);
  } else {
    console.log('⏭️  Archive overgeslagen (--skip-archive)\n');
  }

  // ============================================
  // Stap 3: Clear scrape_log
  // ============================================

  console.log('🧹 Scrape_log gkn-entries verwijderen...');
  const { error: deleteErr } = await supabase
    .from('knowledge_scrape_log')
    .delete()
    .eq('scrape_source', 'gkn');
  if (deleteErr) {
    console.error(`❌ Scrape_log clear fout: ${deleteErr.message}`);
    process.exit(1);
  }
  console.log('   ✅ scrape_log gewist (pipeline ziet alles als nieuw)\n');

  // ============================================
  // Stap 4: Trigger pipeline met --full
  // ============================================

  console.log('🚀 Pipeline starten (transform via Claude Sonnet)...\n');

  const result = await runScrapePipeline({
    supabase,
    source: 'gkn',
    scrapeOptions: {
      limit: args.limit ?? undefined,
      fullRescan: true,
    },
    concurrency: 2, // bewust laag — Claude API rate limits respecteren
  });

  console.log('\n✅ Reprocess klaar\n');
  console.log(`   Gescraped:        ${result.scrapedItems}`);
  console.log(`   Overgeslagen:     ${result.itemsSkipped}`);
  console.log(`   Aangemaakt:       ${result.articlesCreated}`);
  console.log(`   Bijgewerkt:       ${result.articlesUpdated}`);
  console.log(`   Gefuseerd:        ${result.articlesFused}`);
  console.log(`   Needs review:     ${result.articlesNeedingReview}`);
  if (result.errors.length > 0) {
    console.log(`   ❌ Fouten:        ${result.errors.length}`);
    for (const e of result.errors.slice(0, 10)) {
      console.log(`      - ${e.identifier ?? '?'}: ${e.message}`);
    }
  }
  console.log(`\n   Duur: ${result.startedAt} → ${result.completedAt}\n`);

  console.log('💡 Volgende stap (handmatig in Supabase SQL Editor):');
  console.log(`   Verifieer enkele nieuwe artikelen via SELECT title, transform_model FROM`);
  console.log(`   knowledge_articles WHERE transform_model = 'claude-sonnet-4-5' LIMIT 5;`);
  console.log(`   Als alles goed is:`);
  console.log(`   DELETE FROM knowledge_articles WHERE status = 'archived'`);
  console.log(`     AND public_source_ref ILIKE 'WUR Groen Kennisnet%';`);
}

main().catch((err) => {
  console.error('\n💥 Reprocess fout:', err);
  process.exit(1);
});
