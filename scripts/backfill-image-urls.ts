#!/usr/bin/env npx tsx
/**
 * Backfill image_urls from GKN scrape_log metadata into knowledge_articles.
 * Maps by matching scrape_log source_metadata.title to article titles.
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

async function main() {
  console.log('=== Backfill image_urls ===');

  // 1. Get all GKN scrape_log entries with images
  const { data: logs, error: logErr } = await supabase
    .from('knowledge_scrape_log')
    .select('source_identifier, source_metadata')
    .eq('scrape_source', 'gkn')
    .eq('status', 'completed');

  if (logErr) {
    console.error('Log query failed:', logErr.message);
    process.exit(1);
  }

  const withImages = (logs ?? []).filter((l: any) => {
    const imgs = l.source_metadata?.imageUrls;
    return Array.isArray(imgs) && imgs.length > 0;
  });

  console.log(`${withImages.length} GKN items met afbeeldingen`);

  // 2. For each, find matching articles by is_public_source + public_source_ref containing the GKN title
  let updated = 0;
  let noMatch = 0;

  for (const log of withImages) {
    const meta = log.source_metadata as any;
    const title = (meta.title ?? '').trim();
    const imageUrls = meta.imageUrls as string[];

    if (!title || imageUrls.length === 0) continue;

    // Find articles that came from this GKN page
    // Match by public_source_ref containing the title
    const { data: articles, error: artErr } = await supabase
      .from('knowledge_articles')
      .select('id, title, image_urls')
      .eq('is_public_source', true)
      .ilike('public_source_ref', `%${title.slice(0, 30)}%`)
      .limit(5);

    if (artErr) {
      console.warn(`  Query failed for "${title}":`, artErr.message);
      continue;
    }

    if (!articles || articles.length === 0) {
      // Try broader match on article title
      const { data: articles2 } = await supabase
        .from('knowledge_articles')
        .select('id, title, image_urls')
        .ilike('title', `%${title.slice(0, 25)}%`)
        .limit(5);

      if (!articles2 || articles2.length === 0) {
        noMatch++;
        continue;
      }

      // Update these
      for (const art of articles2) {
        const existing = (art.image_urls as string[]) ?? [];
        if (existing.length > 0) continue; // already has images
        await supabase
          .from('knowledge_articles')
          .update({ image_urls: imageUrls })
          .eq('id', art.id);
        updated++;
        console.log(`  + ${art.title?.slice(0, 50)} ← ${imageUrls.length} imgs`);
      }
    } else {
      for (const art of articles) {
        const existing = (art.image_urls as string[]) ?? [];
        if (existing.length > 0) continue;
        await supabase
          .from('knowledge_articles')
          .update({ image_urls: imageUrls })
          .eq('id', art.id);
        updated++;
        console.log(`  + ${art.title?.slice(0, 50)} ← ${imageUrls.length} imgs`);
      }
    }
  }

  console.log();
  console.log(`Updated: ${updated} artikelen`);
  console.log(`No match: ${noMatch} GKN items zonder matching artikel`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
