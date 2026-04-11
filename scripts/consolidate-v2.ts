#!/usr/bin/env npx tsx
/**
 * Consolidate v2: aggressive merge of 199 → ~50 clean encyclopedia entries.
 *
 * Strategy:
 * 1. Define ~50 canonical topics (echte ziekten, plagen, teeltonderwerpen)
 * 2. Map all 199 profiles to their canonical topic
 * 3. Merge data (article counts, products, varieties, etc.)
 * 4. Delete the fragments, keep the canonical entries
 * 5. Fix profile_type where wrong
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
// Canonical topics: the ~50 entries we WANT in the encyclopedia
// Each maps to the fragments that should be merged into it
// Format: canonical_name → { type, merge_from[] }
// ============================================

const CANONICAL: Record<string, { type: string; mergeFrom: string[] }> = {
  // === ZIEKTEN (schimmels) ===
  'schurft': { type: 'ziekte', mergeFrom: ['schurftpreventie', 'perenschurft', 'appelschurft', 'vruchtschurft'] },
  'meeldauw': { type: 'ziekte', mergeFrom: ['appelmeeldauw'] },
  'vruchtrot': { type: 'ziekte', mergeFrom: ['zwartvruchtrot', 'neusrot', 'phytophthora', 'phytophthora-rot', 'steelrot', 'visoogrot', 'visogenrot'] },
  'vruchtboomkanker': { type: 'ziekte', mergeFrom: ['neonectria', 'kanker', 'wondschimmels', 'vruchtboomziekten'] },
  'bacterievuur': { type: 'ziekte', mergeFrom: [] },
  'stemphylium': { type: 'ziekte', mergeFrom: [] },
  'monilia': { type: 'ziekte', mergeFrom: [] },
  'botrytis': { type: 'ziekte', mergeFrom: [] },
  'pseudomonas': { type: 'ziekte', mergeFrom: ['pear decline', 'peardecline'] },
  'roetdauw': { type: 'ziekte', mergeFrom: ['giezerzwart', 'witte waas'] },
  'regenvlekkenziekte': { type: 'ziekte', mergeFrom: ['bladvlekken'] },
  'bewaarziekten': { type: 'ziekte', mergeFrom: ['bewaarschimmels', 'schimmels', 'ziekten tijdens de bladval', 'anorganische neerslag'] },
  'perepok': { type: 'ziekte', mergeFrom: [] },

  // === PLAGEN (insecten/mijten) ===
  'perenbladvlo': { type: 'plaag', mergeFrom: ['perebladvlo', 'perenbladvlo plak', 'eiafzet perenbladvlo', 'perenluis'] },
  'fruitmot': { type: 'plaag', mergeFrom: ['fruitmotbestrijding'] },
  'appelbloesemkever': { type: 'plaag', mergeFrom: [] },
  'appelbloedluis': { type: 'plaag', mergeFrom: ['bloedluis'] },
  'roze appelluis': { type: 'plaag', mergeFrom: ['roze luis', 'rose appelluis', 'rose luis', 'jonge roze appelluizen', 'roze en groene luis', 'roze perenluis'] },
  'bladluis': { type: 'plaag', mergeFrom: ['bladluizen', 'luizen', 'groene appeltakluis', 'appelgrasluis', 'groene kortstaartluis'] },
  'spint': { type: 'plaag', mergeFrom: ['fruitspint eieren', 'fruitspint en roestmijt', 'fruitspintmijt'] },
  'roestmijt': { type: 'plaag', mergeFrom: ['roestmijten', 'appelroestmijt', 'perenroestmijt', 'pereroestmijt', 'peregalmijt', 'perengalmijt'] },
  'wants': { type: 'plaag', mergeFrom: ['schildwantsen', 'groene appelwants', 'brandnetelwants'] },
  'rupsen': { type: 'plaag', mergeFrom: ['voorjaarsrupsen', 'bladrollers', 'wintervlinderrupsen', 'kleine wintervlinder', 'damschijfmineermot'] },
  'perenknopkever': { type: 'plaag', mergeFrom: ['pereknopkever'] },
  'appelzaagwesp': { type: 'plaag', mergeFrom: ['perenzaagwesp', 'perezaagwesp'] },
  'schildluis': { type: 'plaag', mergeFrom: ['schildluizen', 'kommaschildluis', 'oestervormige schildluis', 'oestervormige schildluis eieren'] },
  'galmug': { type: 'plaag', mergeFrom: ['bladgalmug', 'peregalmug', 'perengalmug'] },
  'kevers': { type: 'plaag', mergeFrom: ['bladrandkevers'] },

  // === ABIOTISCH ===
  'vorstschade': { type: 'abiotisch', mergeFrom: ['schade na nachtvorst', 'dode knoppen'] },
  'hagelschade': { type: 'abiotisch', mergeFrom: [] },
  'zonnebrand': { type: 'abiotisch', mergeFrom: ['bladverbranding'] },

  // === TEELT / GROEIREGULATIE ===
  'groeiregulatie': { type: 'groeiregulatie', mergeFrom: [] },
  'vruchtzetting': { type: 'groeiregulatie', mergeFrom: ['bestuiving', 'onvoldoende bestuiving', 'bloei', 'zwakke bloei'] },
  'dunning': { type: 'groeiregulatie', mergeFrom: ['chemisch dunnen'] },
  'bloemknopvorming': { type: 'groeiregulatie', mergeFrom: [] },
  'vruchtkwaliteit': { type: 'groeiregulatie', mergeFrom: ['vruchtmaat', 'maatontwikkeling', 'kleurbevordering', 'kleuring', 'vruchtkleuring', 'verruwing', 'vastspuiten', 'stip', 'late val', 'verkaling'] },
  'bewaring': { type: 'groeiregulatie', mergeFrom: ['plukrijpheid', 'rijping', 'overrijping'] },
  'rui': { type: 'groeiregulatie', mergeFrom: ['vruchtval', 'vroegtijdige vruchtval', 'zware dracht'] },

  // === BEMESTING / BODEM ===
  'bemesting': { type: 'abiotisch', mergeFrom: ['bladvoeding', 'intensieve bladvoeding', 'voeding', 'nutriëntenopname', 'nutriëntenstatus', 'nutriëntenvastlegging', 'essentiële elementen', 'tekorten', 'sporenelementen', 'sporenelementen tekort'] },
  'stikstof': { type: 'abiotisch', mergeFrom: ['stikstofbemesting', 'n-min'] },
  'calcium': { type: 'abiotisch', mergeFrom: ['calciumgebrek', 'calciumtekort', 'calciumtoevoeging'] },
  'kalium': { type: 'abiotisch', mergeFrom: ['kalium en fosfaat', 'kalium en fosfaat tekort', 'kaliumbemesting', 'kaliumgehalte', 'laag kaliumgehalte'] },
  'bodem': { type: 'abiotisch', mergeFrom: ['bodem-ph', 'bodemkalk', 'bodemkwaliteit', 'bodemstructuur', 'bodemverbeteraar', 'bodemverbetering', 'organische stof', 'ph', 'hoge ph', 'lage ph', 'wortelactiviteit', 'wortelherstel', 'terugval', 'herstel'] },
  'ijzer': { type: 'abiotisch', mergeFrom: ['ijzerbemesting', 'ijzergebrek', 'ijzeropname', 'ijzertekort'] },
  'fosfaat': { type: 'abiotisch', mergeFrom: ['lage fosfaatgehaltes'] },
  'sporenelementen': { type: 'abiotisch', mergeFrom: ['borium', 'boriumtekort', 'magnesiumgevoeligheid', 'magnesiumtekort', 'mangaan gehalte', 'zinkgehalte'] },

  // === ONKRUID ===
  'onkruidbestrijding': { type: 'abiotisch', mergeFrom: ['kruiskruid', 'muur', 'paardenbloem', 'paarse dovenetel', 'scherpe boterbloem', 'straatgras', 'zuring', 'brandnetel', 'kleine brandnetel', 'distel'] },

  // === RESIDU ===
  'residubeheer': { type: 'abiotisch', mergeFrom: ['residu', 'residu wachttijden', 'residuwachttijden-fungiciden', 'residuwachttijden-insecticiden', 'insecticidenresidu', 'fosfietresidu', 'hormoon-verstorende stoffen', 'teeltvrije zone', 'organische vervuiling'] },
};

// Items to DELETE entirely (too vague, not encyclopedic)
const DELETE_NAMES = [
  'algemeen', 'ziekte', 'ziektepreventie', 'plaag', 'onbekend', 'insecten',
  'overwinterende plagen', 'wintereieren', 'pissebedden',
  'donker in het blad komen', 'vroege herfstkleur', 'vroege herfstkleuring',
];

async function main() {
  console.log(`=== Consolidate v2 (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===`);

  // Fetch with retry
  let profiles: any[] = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const { data, error } = await supabase
        .from('knowledge_disease_profile')
        .select('*')
        .order('name');
      if (error) throw new Error(error.message);
      profiles = data ?? [];
      break;
    } catch (err: any) {
      console.warn(`  Fetch ${attempt}/10: ${(err.message ?? '').slice(0, 40)}`);
      await new Promise(r => setTimeout(r, 2000 * Math.min(attempt, 5)));
    }
  }

  console.log(`${profiles.length} profielen geladen`);
  const byName = new Map<string, any>();
  for (const p of profiles) byName.set(p.name.toLowerCase(), p);

  let mergeCount = 0;
  let deleteCount = 0;
  let typeFixCount = 0;

  // 1. DELETE vague entries
  for (const name of DELETE_NAMES) {
    const p = byName.get(name);
    if (!p) continue;
    console.log(`  DELETE: "${name}" (${p.source_article_count} art)`);
    if (!dryRun) {
      await retryOp(() => supabase.from('knowledge_disease_profile').delete().eq('id', p.id));
    }
    byName.delete(name);
    deleteCount++;
  }

  // 2. MERGE fragments into canonical entries
  for (const [canonicalName, config] of Object.entries(CANONICAL)) {
    const target = byName.get(canonicalName);

    for (const sourceName of config.mergeFrom) {
      const source = byName.get(sourceName);
      if (!source) continue;
      if (target && source.id === target.id) continue;

      if (target) {
        console.log(`  MERGE: "${sourceName}" → "${canonicalName}" (+${source.source_article_count} art)`);
        if (!dryRun) {
          const merged = mergeProfiles(target, source);
          await retryOp(() =>
            supabase.from('knowledge_disease_profile').update({
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
              monitoring_advice: merged.monitoring_advice,
              biological_options: merged.biological_options,
            }).eq('id', target.id),
          );
          await retryOp(() => supabase.from('knowledge_disease_profile').delete().eq('id', source.id));
          // Update local cache
          Object.assign(target, merged);
        }
        byName.delete(sourceName);
        mergeCount++;
      } else {
        // Target doesn't exist yet — check if another rename already created it
        const existing = byName.get(canonicalName);
        if (existing) {
          // Already exists from a previous rename — merge instead
          console.log(`  MERGE(late): "${sourceName}" → "${canonicalName}" (+${source.source_article_count} art)`);
          if (!dryRun) {
            const merged = mergeProfiles(existing, source);
            await retryOp(() =>
              supabase.from('knowledge_disease_profile').update({
                source_article_count: merged.source_article_count,
                crops: merged.crops, peak_phases: merged.peak_phases, peak_months: merged.peak_months,
                key_preventive_products: merged.key_preventive_products, key_curative_products: merged.key_curative_products,
              }).eq('id', existing.id),
            );
            await retryOp(() => supabase.from('knowledge_disease_profile').delete().eq('id', source.id));
          }
        } else {
          // Truly new — rename
          console.log(`  RENAME: "${sourceName}" → "${canonicalName}"`);
          if (!dryRun) {
            await retryOp(() =>
              supabase.from('knowledge_disease_profile').update({ name: canonicalName }).eq('id', source.id),
            );
          }
          byName.set(canonicalName, source);
        }
        byName.delete(sourceName);
        mergeCount++;
      }
    }

    // Fix profile_type
    const entry = byName.get(canonicalName);
    if (entry && entry.profile_type !== config.type) {
      console.log(`  TYPE: "${canonicalName}" ${entry.profile_type} → ${config.type}`);
      if (!dryRun) {
        await retryOp(() =>
          supabase.from('knowledge_disease_profile').update({ profile_type: config.type }).eq('id', entry.id),
        );
      }
      typeFixCount++;
    }
  }

  console.log();
  console.log(`Samengevat: ${mergeCount} merges, ${deleteCount} deletes, ${typeFixCount} type fixes`);

  if (!dryRun) {
    const { count } = await supabase
      .from('knowledge_disease_profile')
      .select('*', { count: 'exact', head: true });
    console.log(`Resultaat: ${count} profielen over`);
  }
}

function mergeProfiles(target: any, source: any): any {
  return {
    ...target,
    source_article_count: (target.source_article_count ?? 0) + (source.source_article_count ?? 0),
    crops: unique([...(target.crops ?? []), ...(source.crops ?? [])]),
    peak_phases: unique([...(target.peak_phases ?? []), ...(source.peak_phases ?? [])]),
    peak_months: unique([...(target.peak_months ?? []), ...(source.peak_months ?? [])]).sort(),
    key_preventive_products: unique([...(target.key_preventive_products ?? []), ...(source.key_preventive_products ?? [])]).slice(0, 10),
    key_curative_products: unique([...(target.key_curative_products ?? []), ...(source.key_curative_products ?? [])]).slice(0, 10),
    susceptible_varieties: unique([...(target.susceptible_varieties ?? []), ...(source.susceptible_varieties ?? [])]),
    resistant_varieties: unique([...(target.resistant_varieties ?? []), ...(source.resistant_varieties ?? [])]),
    description: target.description || source.description,
    lifecycle_notes: target.lifecycle_notes || source.lifecycle_notes,
    symptoms: target.symptoms || source.symptoms,
    monitoring_advice: target.monitoring_advice || source.monitoring_advice,
    biological_options: target.biological_options || source.biological_options,
  };
}

function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

async function retryOp(fn: () => Promise<any>, attempts = 5): Promise<any> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await fn();
      if (result.error) throw new Error(result.error.message);
      return result;
    } catch (err: any) {
      if (i < attempts) {
        await new Promise(r => setTimeout(r, 1500 * i));
        continue;
      }
      throw err;
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
