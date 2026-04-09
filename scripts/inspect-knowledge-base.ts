#!/usr/bin/env npx tsx
/**
 * Inspect the knowledge_articles + knowledge_scrape_log tables.
 *
 * Quick visibility tool to verify the RAG pipeline output and check for
 * needs_review records that require manual triage.
 *
 * Usage:
 *   npm run knowledge:inspect                          # default summary + 5 latest
 *   npm run knowledge:inspect -- --limit 20            # show 20 articles
 *   npm run knowledge:inspect -- --status needs_review # filter by status
 *   npm run knowledge:inspect -- --category ziekte     # filter by category
 *   npm run knowledge:inspect -- --full                # show full content (not preview)
 */

// Force IPv4 first (Node 25 + Supabase undici quirk)
import { setDefaultResultOrder } from 'node:dns';
try {
  setDefaultResultOrder('ipv4first');
} catch {
  // ignore
}

// Increase undici connect timeout
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(
  new Agent({
    connect: { timeout: 60_000 },
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  }),
);

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Retry transient fetch failures */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts) {
        const delay = 800 * i;
        console.warn(`  [retry ${i}/${attempts}] ${label}: ${msg.slice(0, 80)} — wacht ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// Args
const args = process.argv.slice(2);
function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
const limit = parseInt(getFlag('--limit') ?? '5', 10);
const filterStatus = getFlag('--status');
const filterCategory = getFlag('--category');
const showFull = args.includes('--full');

// Note: NEVER select content_embedding — Node 25 chokes on the response size
const SELECT_COLUMNS =
  'id, title, summary, category, subcategory, knowledge_type, status, crops, varieties, season_phases, relevant_months, products_mentioned, content, fusion_sources, harvest_year, created_at';

async function main() {
  console.log('========================================');
  console.log('Knowledge Base Inspection');
  console.log('========================================');
  console.log();

  // ----- Aggregate counts -----
  console.log('-- Totals --');
  const totalCount = await withRetry('totals', async () => {
    const { count } = await supabase
      .from('knowledge_articles')
      .select('*', { count: 'exact', head: true });
    return count ?? 0;
  });
  console.log(`Total knowledge_articles: ${totalCount}`);

  for (const status of ['draft', 'needs_review', 'published', 'archived']) {
    try {
      const count = await withRetry(`status ${status}`, async () => {
        const { count } = await supabase
          .from('knowledge_articles')
          .select('*', { count: 'exact', head: true })
          .eq('status', status);
        return count ?? 0;
      });
      console.log(`  ${status}: ${count}`);
    } catch {
      console.log(`  ${status}: ?`);
    }
  }

  // Per-category breakdown — use a manual count loop because PostgREST has no GROUP BY
  console.log();
  console.log('-- By category --');
  const categories = ['ziekte', 'plaag', 'bemesting', 'snoei', 'dunning', 'bewaring',
    'certificering', 'algemeen', 'rassenkeuze', 'bodem', 'watermanagement'];
  for (const cat of categories) {
    try {
      const count = await withRetry(`cat ${cat}`, async () => {
        const { count } = await supabase
          .from('knowledge_articles')
          .select('*', { count: 'exact', head: true })
          .eq('category', cat);
        return count ?? 0;
      });
      if (count > 0) {
        console.log(`  ${cat}: ${count}`);
      }
    } catch {
      console.log(`  ${cat}: ?`);
    }
  }

  // ----- Recent records -----
  console.log();
  console.log(`-- Latest ${limit} articles${filterStatus ? ` (status=${filterStatus})` : ''}${filterCategory ? ` (category=${filterCategory})` : ''} --`);

  const data = await withRetry('latest articles', async () => {
    let query = supabase
      .from('knowledge_articles')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filterStatus) query = query.eq('status', filterStatus);
    if (filterCategory) query = query.eq('category', filterCategory);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }).catch((err) => {
    console.error('Error fetching articles:', err.message);
    return null;
  });
  if (data && data.length > 0) {
    for (const a of data as any[]) {
      console.log();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Title:    ${a.title}`);
      console.log(`Status:   ${a.status} | Category: ${a.category}/${a.subcategory ?? '-'} | Type: ${a.knowledge_type}`);
      console.log(`Crops:    ${(a.crops ?? []).join(', ')} | Months: ${(a.relevant_months ?? []).join(', ')} | Phases: ${(a.season_phases ?? []).join(', ')}`);
      console.log(`Products: ${(a.products_mentioned ?? []).join(', ') || '(none)'}`);
      console.log(`Year:     ${a.harvest_year} | Fusions: ${a.fusion_sources}`);
      console.log(`Summary:  ${a.summary}`);
      console.log(`Content:`);
      const content = a.content || '';
      if (showFull) {
        console.log(content);
      } else {
        console.log(content.slice(0, 600) + (content.length > 600 ? '\n  ...' : ''));
      }
    }
  } else {
    console.log('  (geen rijen)');
  }

  // ----- Recent scrape runs -----
  console.log();
  console.log('-- Last 10 scrape_log entries --');
  const logs = await withRetry('scrape_log', async () => {
    const { data, error } = await supabase
      .from('knowledge_scrape_log')
      .select('id, scrape_source, source_identifier, status, articles_created, articles_fused, started_at, error_message')
      .order('started_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data;
  }).catch((err) => {
    console.error('Error fetching log:', err.message);
    return null;
  });

  if (logs) {
    for (const r of logs) {
      const time = r.started_at?.slice(0, 19).replace('T', ' ');
      const status = r.status.padEnd(10);
      console.log(`  ${time} ${status} ${r.scrape_source}/${r.source_identifier} created=${r.articles_created} fused=${r.articles_fused}${r.error_message ? ' err=' + r.error_message.slice(0, 60) : ''}`);
    }
  }
}

main().catch((err) => {
  console.error('Fataal:', err);
  process.exit(1);
});
