#!/usr/bin/env npx tsx
/**
 * Bulk-publish knowledge_articles drafts.
 *
 * After the FruitConsult backfill we have ~500 draft articles (validator approved)
 * and ~1500 needs_review articles (validator found something to flag).
 * This script marks all drafts as published, leaving needs_review untouched
 * so a human can still triage them.
 *
 * Usage:
 *   npm run knowledge:publish              # publishes all drafts
 *   npm run knowledge:publish -- --dry-run # show what would change
 *   npm run knowledge:publish -- --include-review # also publish needs_review
 */

import { setDefaultResultOrder } from 'node:dns';
try {
  setDefaultResultOrder('ipv4first');
} catch { /* ignore */ }

import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(
  new Agent({
    connect: { timeout: 60_000 },
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  }),
);

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const includeReview = args.includes('--include-review');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('========================================');
  console.log('Knowledge Drafts Publisher');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Include needs_review: ${includeReview ? 'yes' : 'no'}`);
  console.log();

  // Count current state
  const [draftCount, reviewCount, publishedCount] = await Promise.all([
    supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).eq('status', 'needs_review'),
    supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).eq('status', 'published'),
  ]);

  console.log('Current state:');
  console.log(`  draft:        ${draftCount.count ?? 0}`);
  console.log(`  needs_review: ${reviewCount.count ?? 0}`);
  console.log(`  published:    ${publishedCount.count ?? 0}`);
  console.log();

  const targetStatuses = includeReview ? ['draft', 'needs_review'] : ['draft'];
  const toPublish = (draftCount.count ?? 0) + (includeReview ? (reviewCount.count ?? 0) : 0);

  if (toPublish === 0) {
    console.log('Niets te publiceren.');
    return;
  }

  console.log(`Will ${dryRun ? 'DRY-RUN' : 'publish'} ${toPublish} artikelen`);
  console.log();

  if (dryRun) {
    // Show a sample of what would change
    const { data: sample } = await supabase
      .from('knowledge_articles')
      .select('id, title, category, status')
      .in('status', targetStatuses)
      .order('created_at', { ascending: false })
      .limit(10);
    console.log('Sample (eerste 10):');
    for (const a of sample ?? []) {
      console.log(`  [${a.status}] ${a.category}: ${a.title}`);
    }
    return;
  }

  // Update in batches of 500 to avoid timeout
  let total = 0;
  const batchSize = 500;
  while (true) {
    const { data: batch, error: fetchError } = await supabase
      .from('knowledge_articles')
      .select('id')
      .in('status', targetStatuses)
      .limit(batchSize);

    if (fetchError) {
      console.error('Fetch error:', fetchError.message);
      break;
    }

    if (!batch || batch.length === 0) break;

    const ids = batch.map((a) => a.id);
    const { error: updateError } = await supabase
      .from('knowledge_articles')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (updateError) {
      console.error('Update error:', updateError.message);
      break;
    }

    total += ids.length;
    console.log(`  gepubliceerd: ${total}/${toPublish}`);

    if (batch.length < batchSize) break;
  }

  console.log();
  console.log(`✓ ${total} artikelen gepubliceerd`);
}

main().catch((err) => {
  console.error('Fataal:', err);
  process.exit(1);
});
