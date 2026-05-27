#!/usr/bin/env tsx
/**
 * Pas dezelfde cleanup toe als migratie 083, maar via JS (zodat we
 * 'em direct kunnen draaien zonder SQL Editor).
 *
 * Volgt exact dezelfde stappen:
 *   1. Archive expired published
 *   2. Default crops voor onbekende
 *   3. Archive te-korte content
 *   4. Dedup product_advice
 *   5. Strip bron-vermeldingen
 *   6. Temporal refs → fenologische placeholder
 *   7. Dubbele spaties weg
 *
 * Idempotent. Doe --dry-run om counts te zien zonder writes.
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: true });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DRY = process.argv.includes('--dry-run') || process.argv.includes('--dry');

// ============================================
// Regex patterns
// ============================================

const SOURCE_LEAK_PHRASE = /(?:volgens|via|door|bron:|info van|advies van|onderzoek door|gegevens van)\s+(?:FruitConsult|Delphy|NFO|WGF[- ]?Fruit|NFT[- ]?Fruit|GroenKennisnet|WUR(?:\s+Wageningen)?|Wageningen\s+Universiteit|adviseur\s+\w+|de\s+adviseur)/gi;
const SOURCE_STANDALONE = /\b(FruitConsult|Delphy|NFO|WGF[- ]?Fruit|NFT[- ]?Fruit|GroenKennisnet)\b/gi;
const TEMPORAL_DAYS = /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/gi;
const TEMPORAL_PERIODS = /\b(de komende dagen|komende dagen|volgende week|afgelopen weekend|deze week|eerder deze week|begin volgende week|eind deze week|aanstaande week)\b/gi;
const TEMPORAL_REL = /\b(vandaag|gisteren|morgen|overmorgen|eergisteren)\b/gi;
const MULTISPACE = /[ ]{2,}/g;

function scrubText(text: string | null): string {
  if (!text) return text ?? '';
  return text
    .replace(SOURCE_LEAK_PHRASE, '')
    .replace(SOURCE_STANDALONE, 'de kennisbank')
    .replace(TEMPORAL_DAYS, 'binnen enkele dagen')
    .replace(TEMPORAL_PERIODS, 'in deze periode')
    .replace(TEMPORAL_REL, 'in deze periode')
    .replace(MULTISPACE, ' ')
    .replace(/^\s+|\s+$/g, '');
}

interface Step {
  name: string;
  run(): Promise<{ affected: number; note?: string }>;
}

const steps: Step[] = [];

// ============================================
// Stap 1: Archive expired published
// ============================================

steps.push({
  name: '1. Archive expired published articles',
  async run() {
    const today = new Date().toISOString().slice(0, 10);
    if (DRY) {
      const { count } = await supabase
        .from('knowledge_articles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .lt('valid_until', today)
        .not('valid_until', 'is', null);
      return { affected: count ?? 0 };
    }
    const { error, count } = await supabase
      .from('knowledge_articles')
      .update({ status: 'archived' }, { count: 'exact' })
      .eq('status', 'published')
      .lt('valid_until', today)
      .not('valid_until', 'is', null);
    if (error) throw error;
    return { affected: count ?? 0 };
  },
});

// ============================================
// Stap 2: Default crops
// ============================================

steps.push({
  name: '2. Default crops [appel, peer] voor artikelen zonder crops',
  async run() {
    const { data: targets } = await supabase
      .from('knowledge_articles')
      .select('id, crops')
      .eq('status', 'published');
    if (!targets) return { affected: 0 };
    const empty = (targets as any[]).filter((r) => !r.crops || r.crops.length === 0);
    if (DRY) return { affected: empty.length };
    let n = 0;
    for (const r of empty) {
      const { error } = await supabase
        .from('knowledge_articles')
        .update({ crops: ['appel', 'peer'] })
        .eq('id', r.id);
      if (error) console.warn(`   ⚠️  ${r.id}: ${error.message}`);
      else n++;
    }
    return { affected: n };
  },
});

// ============================================
// Stap 3: Archive te-korte content
// ============================================

steps.push({
  name: '3. Archive te-korte content (<100 chars)',
  async run() {
    const { data: all } = await supabase
      .from('knowledge_articles')
      .select('id, content')
      .neq('status', 'archived');
    if (!all) return { affected: 0 };
    const tooShort = (all as any[]).filter((r) => !r.content || r.content.length < 100);
    if (DRY) return { affected: tooShort.length };
    let n = 0;
    for (const r of tooShort) {
      const { error } = await supabase
        .from('knowledge_articles')
        .update({ status: 'archived' })
        .eq('id', r.id);
      if (error) console.warn(`   ⚠️  ${r.id}: ${error.message}`);
      else n++;
    }
    return { affected: n };
  },
});

// ============================================
// Stap 4: Dedup product_advice
// ============================================

steps.push({
  name: '4. Dedup knowledge_product_advice (op product×target×crop)',
  async run() {
    // Paginated fetch — PostgREST has a hard 1000-row cap per request
    const all: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('knowledge_product_advice')
        .select('id, product_name, target_name, crop, source_article_count, created_at')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (all.length === 0) return { affected: 0 };
    const byKey: Map<string, any[]> = new Map();
    for (const r of all as any[]) {
      const k = `${(r.product_name ?? '').toLowerCase()}|${(r.target_name ?? '').toLowerCase()}|${(r.crop ?? '').toLowerCase()}`;
      const arr = byKey.get(k) ?? [];
      arr.push(r);
      byKey.set(k, arr);
    }
    const toDelete: string[] = [];
    for (const [, arr] of byKey) {
      if (arr.length <= 1) continue;
      // Keep highest source_article_count, oldest created_at
      arr.sort((a, b) => {
        const c1 = (b.source_article_count ?? 0) - (a.source_article_count ?? 0);
        if (c1 !== 0) return c1;
        return (a.created_at ?? '').localeCompare(b.created_at ?? '');
      });
      for (const dup of arr.slice(1)) toDelete.push(dup.id);
    }
    if (DRY) return { affected: toDelete.length };
    // Delete in chunks
    let n = 0;
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      const { error, count } = await supabase
        .from('knowledge_product_advice')
        .delete({ count: 'exact' })
        .in('id', batch);
      if (error) console.warn(`   ⚠️  batch ${i}: ${error.message}`);
      else n += count ?? batch.length;
    }
    return { affected: n };
  },
});

// ============================================
// Stap 5+6+7: Scrub content (bronlek + temporal + spaces)
// ============================================

steps.push({
  name: '5+6+7. Scrub content (bronvermeldingen + temporal refs + spaties)',
  async run() {
    // Fetch all articles content + summary
    let from = 0;
    const PAGE = 500;
    let totalAffected = 0;
    let totalScanned = 0;
    while (true) {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('id, content, summary')
        .neq('status', 'archived')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      totalScanned += data.length;
      const updates: Array<{ id: string; content?: string; summary?: string }> = [];
      for (const r of data as any[]) {
        const newContent = scrubText(r.content);
        const newSummary = scrubText(r.summary);
        const contentChanged = newContent !== r.content;
        const summaryChanged = newSummary !== r.summary;
        if (contentChanged || summaryChanged) {
          updates.push({
            id: r.id,
            ...(contentChanged ? { content: newContent } : {}),
            ...(summaryChanged ? { summary: newSummary } : {}),
          });
        }
      }
      if (DRY) {
        totalAffected += updates.length;
      } else {
        // Apply updates in parallel (max 4 at a time)
        for (let i = 0; i < updates.length; i += 4) {
          const batch = updates.slice(i, i + 4);
          await Promise.all(
            batch.map(({ id, ...patch }) =>
              supabase.from('knowledge_articles').update(patch).eq('id', id).then((r) => {
                if (r.error) console.warn(`   ⚠️  ${id}: ${r.error.message}`);
                else totalAffected++;
              })
            )
          );
        }
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return { affected: totalAffected, note: `gescand: ${totalScanned}` };
  },
});

// ============================================
// Main
// ============================================

async function main() {
  console.log('\n🧹 Kennisbank data-cleanup');
  console.log(`   modus: ${DRY ? 'DRY-RUN' : 'EXECUTE'}\n`);
  for (const step of steps) {
    process.stdout.write(`▸ ${step.name}... `);
    try {
      const { affected, note } = await step.run();
      console.log(`✅ ${affected} rij(en) ${DRY ? 'zou raken' : 'verwerkt'}${note ? ` (${note})` : ''}`);
    } catch (e: any) {
      console.log(`❌ ${e.message ?? e}`);
    }
  }
  console.log('\n✨ Klaar. Run scripts/diagnose-kennisbank.ts opnieuw om verbetering te zien.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
