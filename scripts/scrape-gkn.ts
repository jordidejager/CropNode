#!/usr/bin/env tsx
/**
 * Scrape Beeldenbank gewasbescherming (GKN / WUR) → kennisbank.
 *
 * Draait de gkn-scraper via de standaard pipeline (transform → validate →
 * embed → fuse → store). Pages worden geselecteerd via Confluence CQL op
 * label IN (appel, peer, kers, pruim) in space BEEL — exact zoals de
 * Beeldenbank-website zelf doet (`contentbylabel` macro).
 *
 * Gebruik:
 *   npm run knowledge:scrape:gkn                 # alleen NIEUWE pagina's
 *   npm run knowledge:scrape:gkn -- --limit 5    # eerst klein testen
 *   npm run knowledge:scrape:gkn -- --full       # alles herhalen (overschrijft niets, content_hash voorkomt dubbels)
 *   npm run knowledge:scrape:gkn -- --dry-run    # alleen lijst tonen, geen scrape
 */

import { config as loadEnv } from 'dotenv';
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
import { getScraper } from '../src/lib/knowledge/scrapers';

interface CliArgs {
  limit: number | null;
  full: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { limit: null, full: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') {
      const n = parseInt(argv[i + 1] ?? '', 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
      i++;
    } else if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice(8), 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    } else if (a === '--full' || a === '--full-rescan') {
      out.full = true;
    } else if (a === '--dry-run' || a === '--dry') {
      out.dryRun = true;
    }
  }
  return out;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase credentials ontbreken (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('\n📚 GKN Beeldenbank scrape');
  console.log(`   limit:   ${args.limit ?? 'geen'}`);
  console.log(`   full:    ${args.full}`);
  console.log(`   dry-run: ${args.dryRun}\n`);

  if (args.dryRun) {
    // Alleen de lijst tonen — geen pipeline-werk, geen Supabase nodig
    const scraper = getScraper('gkn');
    const items = await scraper.scrape({
      limit: args.limit ?? undefined,
      fullRescan: args.full,
      listOnly: true, // dry-run: skip per-page content fetch
    });
    console.log(`\n📋 ${items.length} pagina's zouden gescraped worden:\n`);
    for (const it of items.slice(0, 50)) {
      const labels = (it.metadata.labels as string[] | undefined) ?? [];
      const crops = (it.metadata.crops as string[] | undefined) ?? [];
      console.log(
        `  - ${it.metadata.title?.padEnd(45)} [crops: ${crops.join(',') || '—'}] [${labels.join(', ')}]`,
      );
    }
    if (items.length > 50) console.log(`  …en nog ${items.length - 50} meer`);
    return;
  }

  const supabase = getServiceClient();
  const result = await runScrapePipeline({
    supabase,
    source: 'gkn',
    scrapeOptions: {
      limit: args.limit ?? undefined,
      fullRescan: args.full,
    },
    concurrency: 3,
  });

  console.log('\n✅ Klaar\n');
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
  console.log(`   Duur: ${result.startedAt} → ${result.completedAt}`);
}

main().catch((err) => {
  console.error('\n💥 Scrape fout:', err);
  process.exit(1);
});
