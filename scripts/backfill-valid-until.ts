#!/usr/bin/env npx tsx
/**
 * Backfill valid_until for existing knowledge_articles.
 *
 * Strategy:
 * - is_evergreen=true → valid_until=null (timeless)
 * - has harvest_year + relevant_months → valid_until = end of last relevant month in that year
 * - has harvest_year but no months → valid_until = end of harvest_year
 * - no harvest_year → valid_until=null
 */
import { setDefaultResultOrder } from 'node:dns';
try { setDefaultResultOrder('ipv4first'); } catch {}
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 }, headersTimeout: 120_000, bodyTimeout: 120_000 }));

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`=== Backfill valid_until (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===`);

  // Fetch all articles without valid_until
  let articles: any[] = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('id, harvest_year, relevant_months, is_evergreen, valid_until')
        .is('valid_until', null)
        .eq('is_evergreen', false)
        .limit(3000);
      if (error) throw new Error(error.message);
      articles = data ?? [];
      break;
    } catch (err: any) {
      console.warn(`  Fetch ${attempt}/10: ${(err.message ?? '').slice(0, 40)}`);
      await new Promise(r => setTimeout(r, 2000 * Math.min(attempt, 5)));
    }
  }

  console.log(`${articles.length} artikelen zonder valid_until (niet-evergreen)`);

  let updated = 0;
  let skipped = 0;

  for (const article of articles) {
    const year = article.harvest_year as number | null;
    const months = (article.relevant_months as number[]) ?? [];

    if (!year) {
      skipped++;
      continue;
    }

    let validUntil: string;

    if (months.length > 0) {
      // End of the last relevant month in the harvest year
      const lastMonth = Math.max(...months);
      // Get last day of that month
      const lastDay = new Date(Date.UTC(year, lastMonth, 0)); // month is 1-indexed, day 0 = last day of previous month
      validUntil = lastDay.toISOString().slice(0, 10);
    } else {
      // No specific months → end of harvest year
      validUntil = `${year}-12-31`;
    }

    if (dryRun) {
      if (updated < 10) {
        console.log(`  ${article.id.slice(0, 8)} year=${year} months=[${months.join(',')}] → ${validUntil}`);
      }
    } else {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const { error } = await supabase
            .from('knowledge_articles')
            .update({ valid_until: validUntil })
            .eq('id', article.id);
          if (error) throw new Error(error.message);
          break;
        } catch {
          if (attempt < 5) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
    updated++;
  }

  console.log(`\nKlaar: ${updated} artikelen bijgewerkt, ${skipped} overgeslagen`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
