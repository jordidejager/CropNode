#!/usr/bin/env npx tsx
/**
 * One-time backfill: migrate FruitConsult historical articles into knowledge_articles.
 *
 * Reads:
 *   /Users/jordidejager/Documents/fruitconsult-scraper/2026-02-27/classified_articles.json (~2102 items)
 *   /Users/jordidejager/Documents/fruitconsult-scraper/classified_articles.json (~72 newer items)
 *
 * Merges by typh_id, then runs every article through the standard pipeline:
 *   transform → validate → embed → fuse-or-create → store.
 *
 * Resumeable: items already processed (matching content_hash or scrape_log) are skipped.
 *
 * Usage:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-fruitconsult-history.ts            # full
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-fruitconsult-history.ts --limit 10
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-fruitconsult-history.ts --start-at 100
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate-fruitconsult-history.ts --dry-run
 *
 * NODE_OPTIONS hint required to avoid Node 25 + Supabase IPv6 dual-stack DNS issues.
 */

// Force IPv4 first for Supabase REST connectivity (Node 25 + undici quirk)
import { setDefaultResultOrder } from 'node:dns';
try {
  setDefaultResultOrder('ipv4first');
} catch {
  // ignore on older Node versions
}

// Increase undici connect timeout to 60s (default 10s chokes on Gemini 503s)
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(
  new Agent({
    connect: { timeout: 60_000 },
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  }),
);

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { processItemsInParallel } from '../src/lib/knowledge/pipeline';
import type { ScrapedContent } from '../src/lib/knowledge/types';

dotenv.config({ path: '.env.local' });

// ============================================
// Config
// ============================================

const SOURCE_PATHS = [
  '/Users/jordidejager/Documents/fruitconsult-scraper/2026-02-27/classified_articles.json',
  '/Users/jordidejager/Documents/fruitconsult-scraper/classified_articles.json',
];

const args = process.argv.slice(2);
function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
function hasFlag(name: string): boolean {
  return args.includes(name);
}

const limit = getFlag('--limit') ? parseInt(getFlag('--limit')!, 10) : undefined;
const startAt = getFlag('--start-at') ? parseInt(getFlag('--start-at')!, 10) : 0;
const concurrency = getFlag('--concurrency') ? parseInt(getFlag('--concurrency')!, 10) : 4;
const dryRun = hasFlag('--dry-run');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================
// Types
// ============================================

interface PythonArticle {
  title: string;
  publication_date: string;
  original_category?: string;
  full_text: string;
  url?: string;
  content_url?: string;
  typh_id: string;
  topics?: Array<{ topic: string; subtopic: string }>;
  summary?: string;
  fruit_types?: string[];
  phenological_phase?: string;
}

// ============================================
// Load + dedupe
// ============================================

function loadArticles(): PythonArticle[] {
  const merged = new Map<string, PythonArticle>();

  for (const filepath of SOURCE_PATHS) {
    if (!fs.existsSync(filepath)) {
      console.warn(`[backfill] Bestand niet gevonden: ${filepath}`);
      continue;
    }
    const raw = fs.readFileSync(filepath, 'utf-8');
    const list = JSON.parse(raw) as PythonArticle[];
    console.log(`[backfill] ${path.basename(filepath)}: ${list.length} artikelen geladen`);

    for (const article of list) {
      if (!article.typh_id || !article.full_text) continue;
      // Latest file wins (we iterate from oldest to newest)
      merged.set(article.typh_id, article);
    }
  }

  return Array.from(merged.values());
}

// ============================================
// Convert PythonArticle → ScrapedContent
// ============================================

function toScrapedContent(article: PythonArticle): ScrapedContent {
  return {
    rawText: article.full_text,
    scrapedAt: new Date(),
    sourceType: 'weekly_advice',
    internalSourceCode: 'fc',
    sourceIdentifier: article.typh_id,
    metadata: {
      title: article.title,
      date: article.publication_date,
      crops: article.fruit_types,
      topics: article.topics?.map((t) => `${t.topic}/${t.subtopic}`),
    },
  };
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('========================================');
  console.log('FruitConsult History Backfill');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no DB writes)' : 'LIVE'}`);
  console.log(`Concurrency: ${concurrency}`);
  if (limit) console.log(`Limit: ${limit}`);
  if (startAt > 0) console.log(`Start at index: ${startAt}`);
  console.log();

  const articles = loadArticles();
  console.log(`[backfill] ${articles.length} unieke artikelen na merge`);

  // Sort by publication date (oldest first) so fusion has a stable base
  articles.sort((a, b) => {
    const da = parseDateRough(a.publication_date);
    const db = parseDateRough(b.publication_date);
    return da - db;
  });

  let workSet = articles.slice(startAt);
  if (limit) workSet = workSet.slice(0, limit);

  console.log(`[backfill] Te verwerken: ${workSet.length} artikelen`);
  console.log();

  if (dryRun) {
    console.log('[backfill] Dry-run, eerste 5 items:');
    for (const a of workSet.slice(0, 5)) {
      console.log(`  ${a.publication_date} - ${a.title.slice(0, 60)} (typh ${a.typh_id})`);
    }
    return;
  }

  // Pre-filter: remove already-processed items (hash check happens in pipeline too
  // but this saves the round-trip for already-known items during backfill)
  const processed = await loadProcessedIdentifiers();
  console.log(`[backfill] ${processed.size} items al verwerkt volgens scrape_log`);

  const remaining = workSet.filter((a) => !processed.has(a.typh_id));
  const alreadyDone = workSet.length - remaining.length;
  console.log(`[backfill] ${alreadyDone} items overgeslagen (al verwerkt), ${remaining.length} te doen`);
  console.log();

  if (remaining.length === 0) {
    console.log('[backfill] Niets te doen, klaar.');
    return;
  }

  const scrapedItems: ScrapedContent[] = remaining.map(toScrapedContent);

  const startTime = Date.now();
  let completed = 0;

  const totals = await processItemsInParallel(scrapedItems, {
    supabase,
    concurrency,
    onProgress: (_, total, item, result) => {
      completed++;
      const elapsedMs = Date.now() - startTime;
      const avgMs = elapsedMs / completed;
      const etaMs = Math.floor(avgMs * (total - completed));
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const etaMin = Math.floor(etaMs / 60000);
      const etaSec = Math.floor((etaMs % 60000) / 1000);

      const icon = result.errors.length > 0 ? '❌' : result.skippedByFilter > 0 ? '⊘' : '✓';
      const outcome = result.errors.length > 0
        ? `error=${result.errors[0].message.slice(0, 60)}`
        : result.skippedByFilter > 0
          ? 'gefilterd'
          : `created=${result.created} fused=${result.fused} review=${result.needingReview}`;

      console.log(
        `[${completed}/${total}] (${elapsedSec}s / ETA ${etaMin}m${etaSec}s) ${icon} ${item.metadata.title?.slice(0, 50) ?? item.sourceIdentifier} — ${outcome}`,
      );
    },
  });

  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  console.log();
  console.log('========================================');
  console.log('Backfill voltooid');
  console.log('========================================');
  console.log(`Tijd:           ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
  console.log(`Verwerkt:       ${scrapedItems.length}`);
  console.log(`Gemaakt:        ${totals.created}`);
  console.log(`Bijgewerkt:     ${totals.updated}`);
  console.log(`Gefuseerd:      ${totals.fused}`);
  console.log(`Needs review:   ${totals.needingReview}`);
  console.log(`Gefilterd:      ${totals.skippedByFilter}`);
  console.log(`Fouten:         ${totals.errors.length}`);
  if (totals.errors.length > 0 && totals.errors.length <= 20) {
    console.log();
    console.log('Fouten:');
    for (const err of totals.errors) {
      console.log(`  ${err.identifier}: ${err.message.slice(0, 120)}`);
    }
  }
}

async function loadProcessedIdentifiers(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('knowledge_scrape_log')
    .select('source_identifier')
    .eq('scrape_source', 'fc')
    .eq('status', 'completed');
  if (error) {
    console.warn(`[backfill] kon scrape_log niet laden: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.source_identifier as string).filter(Boolean));
}

function parseDateRough(input: string): number {
  // DD/MM/YYYY or YYYY-MM-DD
  const m1 = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m1) {
    return Date.UTC(+m1[3], +m1[2] - 1, +m1[1]);
  }
  const m2 = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    return Date.UTC(+m2[1], +m2[2] - 1, +m2[3]);
  }
  return 0;
}

main().catch((err) => {
  console.error('[backfill] Fataal:', err);
  process.exit(1);
});
