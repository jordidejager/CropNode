#!/usr/bin/env npx tsx
/**
 * WUR eDepot scrape + pipeline run.
 * Downloads curated PDFs, extracts text, transforms, embeds, stores.
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 120_000, bodyTimeout: 120_000 }));

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { WurEdepotScraper } from '../src/lib/knowledge/scrapers/wur-edepot';
import { processItemsInParallel } from '../src/lib/knowledge/pipeline';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log('========================================');
  console.log('WUR eDepot PDF Scrape + Pipeline');
  console.log('========================================');

  const scraper = new WurEdepotScraper();
  const items = await scraper.scrape();
  console.log('Gescraped:', items.length, 'PDFs');

  if (items.length === 0) {
    console.log('Niets te verwerken.');
    return;
  }

  console.log('Verwerken door RAG pipeline (concurrency=2)...');
  const startTime = Date.now();
  let completed = 0;

  const totals = await processItemsInParallel(items, {
    supabase,
    concurrency: 2,
    onProgress: (_idx, total, item, result) => {
      completed++;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const title = (item.metadata.title ?? item.sourceIdentifier).slice(0, 50);
      const icon = result.errors.length > 0 ? 'X' : 'OK';
      const detail = result.errors.length > 0
        ? result.errors[0].message.slice(0, 50)
        : 'created=' + result.created + ' fused=' + result.fused;
      console.log('[' + completed + '/' + total + '] ' + elapsed + 's ' + icon + ' ' + title + ' -- ' + detail);
    },
  });

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log();
  console.log('========================================');
  console.log('WUR eDepot Klaar');
  console.log('========================================');
  console.log('Tijd:       ' + Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's');
  console.log('Gemaakt:    ' + totals.created);
  console.log('Gefuseerd:  ' + totals.fused);
  console.log('Fouten:     ' + totals.errors.length);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
