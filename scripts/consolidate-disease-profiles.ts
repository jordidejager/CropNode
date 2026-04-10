#!/usr/bin/env npx tsx
/**
 * Consolidate disease profiles: merge duplicates, fix categories, remove non-fruit.
 *
 * Merges sub-profiles into their parent (e.g. "eiafzet perenbladvlo" → "perenbladvlo"),
 * fixes miscategorized profiles (e.g. "vruchtzetting" as "ziekte" → "groeiregulatie"),
 * and removes non-fruit profiles.
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

// ============================================
// Merge rules: target ← sources to merge into it
// ============================================

const MERGE_RULES: Record<string, string[]> = {
  'perenbladvlo': ['perenbladvlo plak', 'eiafzet perenbladvlo', 'perebladvlo'],
  'roze appelluis': ['roze luis', 'jonge roze appelluis'],
  'schurft': ['schurftpreventie', 'perenschurft', 'appelschurft'],
  'meeldauw': ['appelmeeldauw', 'perenmeeldauw'],
  'fruitmot': ['fruitmotbestrijding'],
  'groeiregulatie': ['groei', 'groei regulatie', 'groei remming', 'groeiremming'],
  'vruchtzetting': ['zetting', 'zettingsbevordering', 'vruchtzetting en bloemknopvorming', 'knopzetting'],
  'dunning': ['vruchtdunning', 'chemische dunning'],
  'bloemknopvorming': ['bloemknopversterking', 'knopbezetting'],
  'onkruidbestrijding': ['onkruid', 'onkruidbestrijding bij lage temperaturen', 'breedbladige onkruiden', 'diverse breedbladige onkruiden', 'grasachtige onkruiden', 'grassen'],
  'brandnetel': ['grote brandnetel', 'kleine brandnetel'],
  'perenknopkever': ['kleine perenknopkever', 'perenknopkever en bladluis'],
  'vruchtrot': ['zwartvruchtrot', 'zwartvruchtrot en vruchtrot', 'neusrot'],
  'bladroller': ['rode knopbladroller', 'heggenbladroller', 'koolbladroller', 'anjerbladroller', 'groene eikenbladroller'],
  'spint': ['fruitspint', 'fruitspint eieren', 'fruitspint en roestmijt', 'fruitspintmijt', 'sparrenspintmijt', 'spintmijt'],
  'cicade': ['schuimcicade', 'appelbladcicade'],
  'distel': ['speerdistel'],
  'vruchtboomkanker': ['neonectria', 'kanker'],
  'appelbloedluis': ['bloedluis'],
  'wants': ['brandnetelwants', 'groene appelwants'],
  'bladluis': ['groene appeltakluis', 'groene kortstaartluis', 'appelgrasluis'],
  'galmug': ['appelbladgalmug', 'perenbladgalmug'],
  'mineermot': ['appelbladmineermot', 'appelvouwmijnmot', 'appelhoekmijnmot'],
  'ziekte': ['ziektepreventie'],
};

// ============================================
// Category fixes
// ============================================

const CATEGORY_FIXES: Record<string, string> = {
  'groeiregulatie': 'groeiregulatie',
  'vruchtzetting': 'groeiregulatie',
  'dunning': 'groeiregulatie',
  'bloemknopvorming': 'groeiregulatie',
  'onkruidbestrijding': 'abiotisch',
  'brandnetel': 'abiotisch',
  'distel': 'abiotisch',
  'stikstof': 'abiotisch',
  'bladvoeding': 'abiotisch',
  'bemesting': 'abiotisch',
  'calcium': 'abiotisch',
};

// ============================================
// Main
// ============================================

async function main() {
  console.log(`=== Consolidate Disease Profiles (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===`);
  console.log();

  // Fetch all profiles (with retry for flaky network)
  let profiles: any[] | null = null;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const { data, error } = await supabase
        .from('knowledge_disease_profile')
        .select('*')
        .order('name');
      if (error) throw new Error(error.message);
      profiles = data;
      break;
    } catch (err: any) {
      console.warn(`  Fetch poging ${attempt}/15: ${(err.message ?? '').slice(0, 50)}`);
      await new Promise(r => setTimeout(r, 2000 * Math.min(attempt, 5)));
    }
  }
  if (!profiles) {
    console.error('Failed to fetch profiles after 15 attempts');
    process.exit(1);
  }

  console.log(`${profiles.length} profielen geladen`);
  const byName = new Map<string, any>();
  for (const p of profiles) {
    byName.set(p.name.toLowerCase(), p);
  }

  // 1. MERGE: combine source profiles into targets
  let mergeCount = 0;
  for (const [targetName, sourceNames] of Object.entries(MERGE_RULES)) {
    const target = byName.get(targetName);

    for (const sourceName of sourceNames) {
      const source = byName.get(sourceName);
      if (!source) continue;
      if (source.id === target?.id) continue;

      if (target) {
        // Merge source data into target
        const merged = mergeProfiles(target, source);
        console.log(`  MERGE: "${sourceName}" → "${targetName}" (+${source.source_article_count} art)`);

        if (!dryRun) {
          // Update target with merged data
          await supabase
            .from('knowledge_disease_profile')
            .update({
              source_article_count: merged.source_article_count,
              crops: merged.crops,
              peak_phases: merged.peak_phases,
              peak_months: merged.peak_months,
              key_preventive_products: merged.key_preventive_products,
              key_curative_products: merged.key_curative_products,
              susceptible_varieties: merged.susceptible_varieties,
              resistant_varieties: merged.resistant_varieties,
              description: merged.description,
              lifecycle_notes: merged.lifecycle_notes,
              symptoms: merged.symptoms,
            })
            .eq('id', target.id);

          // Delete source
          await supabase
            .from('knowledge_disease_profile')
            .delete()
            .eq('id', source.id);
        }
        mergeCount++;
      } else {
        // No target exists — rename source to target name
        console.log(`  RENAME: "${sourceName}" → "${targetName}"`);
        if (!dryRun) {
          await supabase
            .from('knowledge_disease_profile')
            .update({ name: targetName })
            .eq('id', source.id);
        }
        byName.set(targetName, source);
        mergeCount++;
      }
    }
  }

  console.log(`\n${mergeCount} profielen samengevoegd`);

  // 2. FIX CATEGORIES
  let catFixCount = 0;
  for (const [name, newType] of Object.entries(CATEGORY_FIXES)) {
    const profile = byName.get(name);
    if (!profile) continue;
    if (profile.profile_type === newType) continue;

    console.log(`  CATEGORY: "${name}" ${profile.profile_type} → ${newType}`);
    if (!dryRun) {
      await supabase
        .from('knowledge_disease_profile')
        .update({ profile_type: newType })
        .eq('id', profile.id);
    }
    catFixCount++;
  }
  console.log(`${catFixCount} categorieën gecorrigeerd`);

  // 3. COUNT remaining
  if (!dryRun) {
    const { count } = await supabase
      .from('knowledge_disease_profile')
      .select('*', { count: 'exact', head: true });
    console.log(`\nResultaat: ${count} profielen over`);
  }
}

function mergeProfiles(target: any, source: any): any {
  return {
    ...target,
    source_article_count: (target.source_article_count ?? 0) + (source.source_article_count ?? 0),
    crops: uniqueArray([...(target.crops ?? []), ...(source.crops ?? [])]),
    peak_phases: uniqueArray([...(target.peak_phases ?? []), ...(source.peak_phases ?? [])]),
    peak_months: uniqueArray([...(target.peak_months ?? []), ...(source.peak_months ?? [])]).sort(),
    key_preventive_products: uniqueArray([...(target.key_preventive_products ?? []), ...(source.key_preventive_products ?? [])]).slice(0, 8),
    key_curative_products: uniqueArray([...(target.key_curative_products ?? []), ...(source.key_curative_products ?? [])]).slice(0, 8),
    susceptible_varieties: uniqueArray([...(target.susceptible_varieties ?? []), ...(source.susceptible_varieties ?? [])]),
    resistant_varieties: uniqueArray([...(target.resistant_varieties ?? []), ...(source.resistant_varieties ?? [])]),
    description: target.description || source.description,
    lifecycle_notes: target.lifecycle_notes || source.lifecycle_notes,
    symptoms: target.symptoms || source.symptoms,
  };
}

function uniqueArray<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
