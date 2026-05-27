#!/usr/bin/env tsx
/**
 * Tweede ronde cleanup voor knowledge_product_advice — pakt visuele
 * duplicates aan die DE EERSTE cleanup niet ving:
 *
 *   1. Dedup op (lower(product_name) × lower(target_name) × lower(application_type)).
 *      Zelfde middel, zelfde ziekte, zelfde toepassing maar verschillende
 *      crop-rijen worden gemerged tot één (crop-veld samengevoegd naar 'beide'
 *      als beide appel+peer voorkwam).
 *   2. Temporal scrub in timing- en notes-velden — vorige scrub deed alleen
 *      content/summary van knowledge_articles, niet de product_advice
 *      timing-string die in de UI-tabel verschijnt.
 *
 * Idempotent.
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

// Temporal patterns — herbruik regex uit eerdere scrub
const TEMPORAL_DAYS = /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/gi;
const TEMPORAL_PERIODS = /\b(de komende dagen|komende dagen|volgende week|afgelopen weekend|deze week|eerder deze week|begin volgende week|eind deze week|aanstaande week)\b/gi;
const TEMPORAL_REL = /\bvanaf (morgen|vandaag)\b|\b(vandaag|gisteren|morgen|overmorgen|eergisteren)\b/gi;
const MULTISPACE = /\s{2,}/g;

function scrubText(text: string | null | undefined): string | null {
  if (text == null) return null;
  const scrubbed = text
    .replace(TEMPORAL_DAYS, 'binnen enkele dagen')
    .replace(TEMPORAL_PERIODS, 'in deze periode')
    .replace(TEMPORAL_REL, 'in deze periode')
    .replace(MULTISPACE, ' ')
    .trim();
  return scrubbed.length === 0 ? null : scrubbed;
}

async function fetchAllAdvice() {
  const all: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('knowledge_product_advice')
      .select('id, product_name, target_name, crop, application_type, dosage, timing, notes, source_article_count, created_at')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  console.log(`\n🧹 Advice cleanup (${DRY ? 'DRY-RUN' : 'EXECUTE'})\n`);

  const all = await fetchAllAdvice();
  console.log(`📋 ${all.length} totaal advice-rijen\n`);

  // ============================================
  // Stap 1: Dedup per (product × target × application_type)
  // ============================================
  // Keep best: hoogste source_article_count → met dosage → oudste
  const byKey = new Map<string, any[]>();
  for (const r of all) {
    const k = `${(r.product_name ?? '').toLowerCase().trim()}|${(r.target_name ?? '').toLowerCase().trim()}|${(r.application_type ?? '').toLowerCase().trim()}`;
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }

  const toDelete: string[] = [];
  const toUpdateCrop = new Map<string, string>(); // id → new crop value

  for (const [, rows] of byKey) {
    if (rows.length <= 1) continue;
    rows.sort((a, b) => {
      const c1 = (b.source_article_count ?? 0) - (a.source_article_count ?? 0);
      if (c1 !== 0) return c1;
      // Met dosage > zonder
      const hasDosA = a.dosage && a.dosage.trim().length > 0 ? 1 : 0;
      const hasDosB = b.dosage && b.dosage.trim().length > 0 ? 1 : 0;
      if (hasDosA !== hasDosB) return hasDosB - hasDosA;
      return (a.created_at ?? '').localeCompare(b.created_at ?? '');
    });
    const winner = rows[0];
    // Compute union of crops — 'beide' als zowel appel als peer voorkwamen
    const crops = new Set<string>();
    for (const r of rows) {
      const c = (r.crop ?? '').toLowerCase().trim();
      if (c === 'appel' || c === 'peer' || c === 'kers' || c === 'pruim') crops.add(c);
      else if (c === 'beide') { crops.add('appel'); crops.add('peer'); }
    }
    const mergedCrop =
      crops.has('appel') && crops.has('peer') ? 'beide'
      : crops.has('appel') ? 'appel'
      : crops.has('peer') ? 'peer'
      : crops.has('kers') ? 'kers'
      : crops.has('pruim') ? 'pruim'
      : (winner.crop ?? null);
    if (mergedCrop && mergedCrop !== winner.crop) toUpdateCrop.set(winner.id, mergedCrop);
    for (const dup of rows.slice(1)) toDelete.push(dup.id);
  }

  console.log(`🔪 ${toDelete.length} duplicate rijen → delete`);
  console.log(`✏️  ${toUpdateCrop.size} winner-rijen → update crop`);

  if (!DRY) {
    // Delete in chunks
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      const { error } = await supabase.from('knowledge_product_advice').delete().in('id', batch);
      if (error) console.warn(`   delete batch ${i}: ${error.message}`);
    }
    // Update crops
    let cropUpdated = 0;
    for (const [id, crop] of toUpdateCrop) {
      const { error } = await supabase.from('knowledge_product_advice').update({ crop }).eq('id', id);
      if (error) console.warn(`   crop update ${id}: ${error.message}`);
      else cropUpdated++;
    }
    console.log(`   ✅ ${cropUpdated} crops bijgewerkt\n`);
  }

  // ============================================
  // Stap 2: Temporal scrub in timing + notes
  // ============================================
  const remaining = (await fetchAllAdvice()).filter((r) => !toDelete.includes(r.id));
  let temporalUpdates = 0;
  for (const r of remaining as any[]) {
    const newTiming = scrubText(r.timing);
    const newNotes = scrubText(r.notes);
    const timingChanged = newTiming !== r.timing;
    const notesChanged = newNotes !== r.notes;
    if (!timingChanged && !notesChanged) continue;
    if (DRY) {
      temporalUpdates++;
      continue;
    }
    const patch: Record<string, string | null> = {};
    if (timingChanged) patch.timing = newTiming;
    if (notesChanged) patch.notes = newNotes;
    const { error } = await supabase.from('knowledge_product_advice').update(patch).eq('id', r.id);
    if (error) console.warn(`   scrub ${r.id}: ${error.message}`);
    else temporalUpdates++;
  }
  console.log(`🧼 ${temporalUpdates} advice-rijen temporal-gescrubd`);

  // ============================================
  // Eindstand
  // ============================================
  const { count: finalCount } = await supabase
    .from('knowledge_product_advice')
    .select('*', { count: 'exact', head: true });
  console.log(`\n📊 Eindstand: ${finalCount} advice-rijen (was ${all.length})\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
